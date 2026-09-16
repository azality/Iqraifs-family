-- Fee payment ledger (Muneeb, 17 Sep 2026): every payment is its own row,
-- so partial payments keep their dates/amounts and a month's amount_paid
-- becomes the SUM of its non-void payments. fee_status.amount_paid stays
-- as a cache the server recomputes on every ledger write; status becomes
-- derived (paid / partial / unpaid, waived stays manual).
--
-- The 20260608 fee-plans migration listed this as planned future work
-- ("Replace fee_status.amount_paid scalar with a fee_payment history").
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS fee_payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  fee_status_id uuid NOT NULL REFERENCES fee_status(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  -- How the money arrived. Free-ish text but the app offers
  -- cash / bank / online / other.
  method text,
  -- Slip / transaction reference the office writes on paper today.
  reference text,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Corrections are VOIDS, never deletes - the ledger is append-only.
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);

CREATE INDEX IF NOT EXISTS idx_fee_payment_fee ON fee_payment(fee_status_id);
CREATE INDEX IF NOT EXISTS idx_fee_payment_student ON fee_payment(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payment_org_paid_on ON fee_payment(org_id, paid_on);

-- Default-deny RLS like every public table (service role bypasses).
ALTER TABLE fee_payment ENABLE ROW LEVEL SECURITY;

-- Backfill: one synthetic payment per fee row that already has money
-- recorded, dated from its scalar paid_date (falling back to updated_at).
INSERT INTO fee_payment (org_id, fee_status_id, student_id, amount, paid_on, notes, recorded_by)
SELECT f.org_id, f.id, f.student_id, f.amount_paid,
       COALESCE(f.paid_date, f.updated_at::date),
       'migrated from the single-payment record',
       f.recorded_by
FROM fee_status f
WHERE COALESCE(f.amount_paid, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM fee_payment p WHERE p.fee_status_id = f.id);
