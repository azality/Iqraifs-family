-- =============================================================================
-- School Pilot — Admission redesign to mirror Iqra's paper form.
--
-- Maps every section of the existing PDF admission form to columns the
-- system can actually use. Three changes:
--
--   1. student gains the demographic / medical / admission-context
--      fields that today's office staff enter on paper.
--
--   2. parent gains the contact + employment fields the form collects
--      twice (father column, mother column). They live on the parent
--      row because that's a per-person attribute — the same Imran Khan
--      keeps his cell phone whether he's linked to one kid or three.
--
--   3. student_parent (the M:N link) gains per-link role flags. A
--      parent's role for a specific kid is not the same as their
--      identity:
--        - Imran Khan can be father+fee-payer for kid A,
--          father (no fee role) for kid B.
--        - Same email can be 'mother' on one kid and 'guardian' on a
--          step-child.
--      That's why is_primary_contact / is_emergency_contact / etc.
--      hang off the link, not the parent.
--
-- Plus a sibling capture table for the "siblings already enrolled or
-- elsewhere" section, and a student.completeness_status enum so
-- admission staff can save a half-filled record + a "guardians pending"
-- list lights up.
--
-- All new columns nullable; existing rows behave exactly as before.
-- Idempotent.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. student demographic + admission context (PDF page 2 top, page 1
-- office-use-only section)
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE student
  -- Page 2 top (above family info)
  ADD COLUMN IF NOT EXISTS registration_no            text,
  ADD COLUMN IF NOT EXISTS photograph_url             text,
  ADD COLUMN IF NOT EXISTS applying_for_grade         text,
  ADD COLUMN IF NOT EXISTS academic_term              text,
  ADD COLUMN IF NOT EXISTS religion                   text,
  ADD COLUMN IF NOT EXISTS nationality                text,
  ADD COLUMN IF NOT EXISTS home_language              text,

  -- Prior schooling
  ADD COLUMN IF NOT EXISTS last_school                text,
  ADD COLUMN IF NOT EXISTS last_class_studying        text,
  ADD COLUMN IF NOT EXISTS last_class_completed       text,
  ADD COLUMN IF NOT EXISTS was_suspended              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_details         text,

  -- Medical / safety
  ADD COLUMN IF NOT EXISTS medical_conditions         text,
  ADD COLUMN IF NOT EXISTS psychological_conditions   text,
  ADD COLUMN IF NOT EXISTS blood_group                text,

  -- Application context (PDF page 1 top + bottom)
  ADD COLUMN IF NOT EXISTS referral_source            text,        -- IFS Parent / Handbill / Banner / Website / News Paper / School Board / Poster / Other
  ADD COLUMN IF NOT EXISTS reasons_for_applying       text,
  ADD COLUMN IF NOT EXISTS avail_transport            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS student_gmail              text,

  -- Office-use-only (filled in by admission office)
  ADD COLUMN IF NOT EXISTS fee_submitted_total        numeric(12, 2),
  ADD COLUMN IF NOT EXISTS receipt_no                 text,
  ADD COLUMN IF NOT EXISTS admission_date             date,
  ADD COLUMN IF NOT EXISTS accountant_signed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Completeness gate so the admission office can save a partial
  -- record and chase missing pieces from a worklist instead of
  -- losing the data.
  ADD COLUMN IF NOT EXISTS completeness_status        text NOT NULL DEFAULT 'complete';

ALTER TABLE student DROP CONSTRAINT IF EXISTS student_completeness_status_check;
ALTER TABLE student
  ADD CONSTRAINT student_completeness_status_check
  CHECK (completeness_status IN ('complete', 'guardians_pending', 'documents_pending', 'fees_pending'));

CREATE INDEX IF NOT EXISTS student_completeness
  ON student(org_id, completeness_status)
  WHERE completeness_status <> 'complete';

-- ──────────────────────────────────────────────────────────────────────
-- 2. parent (per-person attributes — identical for every linked kid)
--
-- The PDF asks the same set twice (father column / mother column). The
-- per-link role of "this person is the father vs the guardian for this
-- specific kid" lives in student_parent, not here, so a step-parent or
-- shared-guardian doesn't need duplicate parent rows.
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE parent
  ADD COLUMN IF NOT EXISTS title              text,        -- Mr. / Mrs. / Ms. / Dr.
  ADD COLUMN IF NOT EXISTS nic                text,        -- CNIC / B-Form number
  ADD COLUMN IF NOT EXISTS home_address       text,
  ADD COLUMN IF NOT EXISTS home_phone         text,
  ADD COLUMN IF NOT EXISTS cell_phone         text,
  ADD COLUMN IF NOT EXISTS occupation         text,
  ADD COLUMN IF NOT EXISTS employer           text,
  ADD COLUMN IF NOT EXISTS employer_address   text,
  ADD COLUMN IF NOT EXISTS business_phone     text;
-- `phone` column already exists from earlier migrations; we keep it
-- as a back-compat alias and prefer cell_phone going forward. The
-- dedup helper checks BOTH so siblings don't create dupes either way.

-- ──────────────────────────────────────────────────────────────────────
-- 3. student_parent — per-link role flags
--
-- parent_role is the relationship for THIS specific student (not the
-- parent's identity). is_*_contact / is_fee_payer / is_pickup_*
-- hang off the link because two students can have the same parent
-- but different per-link rules (e.g. Imran is the fee payer for kid
-- A but his ex-wife is for kid B).
--
-- portal_access_phone is the phone the parent uses to sign in for
-- THIS student in the parent portal. It can differ from the parent's
-- contact cell_phone (e.g. dad's office line is contact, but he uses
-- his personal Whatsapp number for portal alerts).
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE student_parent
  ADD COLUMN IF NOT EXISTS parent_role             text,
  ADD COLUMN IF NOT EXISTS is_primary_contact      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_emergency_contact    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fee_payer            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pickup_authorized    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_access_phone     text;

ALTER TABLE student_parent DROP CONSTRAINT IF EXISTS student_parent_role_check;
ALTER TABLE student_parent
  ADD CONSTRAINT student_parent_role_check
  CHECK (
    parent_role IS NULL OR parent_role IN (
      'father','mother','guardian','step_father','step_mother',
      'grandparent','sibling','sponsor','other'
    )
  );

-- Helpful indexes for the "who's the primary contact for this kid"
-- and "who pays fees" lookups the UI runs.
CREATE INDEX IF NOT EXISTS student_parent_primary_contact
  ON student_parent(student_id)
  WHERE is_primary_contact = true;

CREATE INDEX IF NOT EXISTS student_parent_fee_payer
  ON student_parent(student_id)
  WHERE is_fee_payer = true;

-- ──────────────────────────────────────────────────────────────────────
-- 4. student_sibling — captures the "siblings under 16 also enrolled
-- or elsewhere" section of the PDF. Free-text rows; we don't try to
-- match them back to other student rows automatically (that's a
-- separate "merge siblings" workflow if needed later).
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_sibling (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  name            text NOT NULL,
  age             integer,
  gender          text,
  current_school  text,
  grade           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_sibling_student
  ON student_sibling(student_id);

-- ──────────────────────────────────────────────────────────────────────
-- 5. student_admission_checklist — paper checklist + declaration
-- signature. Tiny one-row-per-student table so the admission office
-- can clear items as documents arrive.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_admission_checklist (
  student_id           uuid PRIMARY KEY REFERENCES student(id) ON DELETE CASCADE,
  report_card_received boolean NOT NULL DEFAULT false,
  photos_received      boolean NOT NULL DEFAULT false,
  father_id_received   boolean NOT NULL DEFAULT false,
  birth_cert_received  boolean NOT NULL DEFAULT false,
  declaration_signed_at timestamptz,
  declaration_signed_by_name text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
