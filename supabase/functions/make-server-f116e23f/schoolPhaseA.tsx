// =============================================================================
// School Phase A — admin role, students/parents/classes CRUD, CSV upload,
// link codes, PIN auth, permission templates.
//
// Mounted by school.tsx (which mounts the broader /school sub-app). This
// file is kept separate from school.tsx because that file is already huge.
//
// All routes here are added onto the same Hono sub-app that school.tsx
// exports. The mounting glue lives at the bottom of school.tsx where
// `installPhaseA(school)` is called.
//
// Auth model:
//   - requireAuth has already run by the time any handler here executes
//     (school.tsx applies `school.use("*", requireAuth)`).
//   - Two endpoints are exceptions and need to bypass the family-JWT
//     check entirely: /auth/pin-login and /link-codes/consume. To keep
//     the wiring simple, /auth/pin-login is registered with its own
//     skip-auth marker handled by school.tsx (see comments there); and
//     /link-codes/consume uses the standard requireAuth (it requires a
//     real family-app user).
//
// Permission helpers:
//   - hasAnyRoleInOrg — caller has at least one non-revoked role row in
//     the org. Used for read endpoints.
//   - requireAdminOrPrincipal — caller is principal OR admin of the org.
//   - requirePrincipalOnly — caller is principal of the org.
// =============================================================================

import { Hono } from "npm:hono";
import {
  serviceRoleClient,
  getAuthUserId,
  createImportBatch,
  finalizeImportBatch,
} from "./middleware.tsx";
import { logAuditWithLookup } from "./schoolAudit.ts";
// PR K: migrate student-write routes from requireAdminOrPrincipal to
// userCanInOrg("manage_students") so office_staff can manage students.
import { userCanInOrg } from "./schoolAuth.ts";

// ---------------------------------------------------------------------------
// Shared row types — exported so the frontend can mirror the shape.
// ---------------------------------------------------------------------------
export interface StudentRow {
  grNumber: string;
  fullName: string;
  classSectionId?: string;
  photoUrl?: string;
  dateOfBirth?: string;
  gender?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  /** 'hifz' | 'conventional' | null. Feeds program-targeted
   *  announcements and section dashboards. CHECK constraint at the DB
   *  level enforces the enum so we just pass through. */
  program?: string;
  // PR feat/student-parent-onboarding-redesign — mirror the IFS
  // admission form. All optional; backend stores what's provided.
  registrationNo?: string;
  applyingForGrade?: string;
  academicTerm?: string;
  religion?: string;
  nationality?: string;
  homeLanguage?: string;
  lastSchool?: string;
  lastClassStudying?: string;
  lastClassCompleted?: string;
  wasSuspended?: boolean;
  suspensionDetails?: string;
  medicalConditions?: string;
  psychologicalConditions?: string;
  bloodGroup?: string;
  referralSource?: string;
  reasonsForApplying?: string;
  availTransport?: boolean;
  studentGmail?: string;
  feeSubmittedTotal?: number;
  receiptNo?: string;
  admissionDate?: string;
  completenessStatus?: string;
}

/** Per-guardian payload used by the redesigned Add Student flow.
 *  Each one becomes (parent row, student_parent link). The link holds
 *  the per-kid role: even if Imran Khan is the same person across two
 *  kids, his role / fee-payer status can differ per kid. */
export interface GuardianInput {
  parentRole?: string;
  fullName?: string;
  title?: string;
  nic?: string;
  homeAddress?: string;
  homePhone?: string;
  cellPhone?: string;
  phone?: string;              // back-compat alias for cellPhone
  email?: string;
  occupation?: string;
  employer?: string;
  employerAddress?: string;
  businessPhone?: string;
  isPrimaryContact?: boolean;
  isEmergencyContact?: boolean;
  isFeePayer?: boolean;
  isPickupAuthorized?: boolean;
  portalAccessPhone?: string;
}

/** Captured siblings under 16 (PDF "Sibling Information" section). */
export interface SiblingInput {
  name: string;
  age?: number;
  gender?: string;
  currentSchool?: string;
  grade?: string;
}

/** Admission checklist (PDF "Application Checklist" section). */
export interface AdmissionChecklistInput {
  reportCardReceived?: boolean;
  photosReceived?: boolean;
  fatherIdReceived?: boolean;
  birthCertReceived?: boolean;
  declarationSignedByName?: string;
}

export interface ParentRow {
  fullName: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

// Inline-parent payload accepted by POST /students and per-row CSV bulk.
// Same shape as ParentRow — repeated as a named type so the student-side
// validator can distinguish "row had parent fields" from "row was a parent
// row." All fields optional; the only requirement is fullName when any
// field is set.
export interface InlineParentRow {
  fullName?: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

export interface TeacherRow {
  email: string;
  fullName: string;
  roleTemplate: "class_teacher" | "visiting_teacher" | "financial_staff" | "office_staff";
}

// ---------------------------------------------------------------------------
// Permission defaults — defaults that apply unless role_template_override
// stores a deviating row for (org, role_template, permission_key).
// ---------------------------------------------------------------------------
type RoleTemplate = "admin" | "class_teacher" | "visiting_teacher" | "financial_staff" | "office_staff";
type PermissionKey =
  | "manage_students"
  | "mark_attendance"
  | "edit_grades"
  | "mark_fees_status"
  | "create_forms"
  | "define_curriculum"
  | "manage_teachers"
  | "view_all_classes";

const PERMISSION_KEYS: PermissionKey[] = [
  "manage_students",
  "mark_attendance",
  "edit_grades",
  "mark_fees_status",
  "create_forms",
  "define_curriculum",
  "manage_teachers",
  "view_all_classes",
];

const DEFAULT_PERMISSIONS: Record<RoleTemplate, Record<PermissionKey, boolean>> = {
  admin: {
    manage_students: true,
    mark_attendance: true,
    edit_grades: true,
    mark_fees_status: true,
    create_forms: true,
    define_curriculum: true,
    manage_teachers: true,
    view_all_classes: true,
  },
  class_teacher: {
    manage_students: false,
    mark_attendance: true,
    edit_grades: true,
    mark_fees_status: false,
    create_forms: true,
    define_curriculum: true,
    manage_teachers: false,
    view_all_classes: false,
  },
  visiting_teacher: {
    manage_students: false,
    mark_attendance: true,
    edit_grades: false,
    mark_fees_status: false,
    create_forms: false,
    define_curriculum: false,
    manage_teachers: false,
    view_all_classes: false,
  },
  financial_staff: {
    manage_students: false,
    mark_attendance: false,
    edit_grades: false,
    mark_fees_status: true,
    create_forms: false,
    define_curriculum: false,
    manage_teachers: false,
    view_all_classes: false,
  },
  office_staff: {
    manage_students: true,
    // PR C #6: Iqra wants office staff to be able to mark attendance when
    // the class teacher is absent. Granted org-wide; tighten if needed.
    mark_attendance: true,
    edit_grades: false,
    mark_fees_status: false,
    create_forms: true,
    define_curriculum: false,
    manage_teachers: true,
    view_all_classes: true,
  },
};

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------
async function hasAnyRoleInOrg(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1);
  if (data && data.length > 0) return true;
  // Also accept any role scoped to a class/section that lives in this org.
  // Cheap check: at least one role row period in this org via any scope —
  // for Phase A we only check org-scoped roles which is the common case.
  return false;
}

async function isPrincipalOf(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_type", "principal")
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
}

async function isAdminOf(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_type", "admin")
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
}

async function requireAdminOrPrincipal(userId: string, orgId: string): Promise<boolean> {
  if (await isPrincipalOf(userId, orgId)) return true;
  if (await isAdminOf(userId, orgId)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// bcrypt — Deno's bcrypt port is unreliable in the edge runtime, so we
// roll a deterministic PBKDF2-SHA256 hash. Format: "pbkdf2$<iters>$<saltB64>$<hashB64>".
// Verify works regardless of which library wrote the row, as long as the
// format prefix matches.
// ---------------------------------------------------------------------------
const PIN_ITERATIONS = 100_000;

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PIN_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2$${PIN_ITERATIONS}$${b64encode(salt)}$${b64encode(new Uint8Array(bits))}`;
}

async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = parseInt(parts[1], 10);
  if (!iters) return false;
  const salt = b64decode(parts[2]);
  const expected = b64decode(parts[3]);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" },
      keyMaterial,
      expected.length * 8,
    ),
  );
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// PIN session token — HMAC-SHA256-signed JSON. Distinct from family JWTs;
// only valid for /school/auth/pin-change (Phase A).
// ---------------------------------------------------------------------------
const PIN_TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8h

function getJwtSecret(): string {
  // Use the supabase JWT secret if available; fall back to service role key
  // for local dev. Both are server-only secrets.
  return (
    Deno.env.get("SUPABASE_JWT_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "dev-pin-secret"
  );
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64encode(new Uint8Array(sig));
}

export interface PinTokenPayload {
  subjectType: "student" | "parent";
  subjectId: string;
  orgId: string;
  exp: number; // unix seconds
}

async function makePinToken(p: PinTokenPayload): Promise<string> {
  const body = btoa(JSON.stringify(p));
  const sig = await hmacSign(body, getJwtSecret());
  return `pin.${body}.${sig}`;
}

export async function verifyPinToken(token: string): Promise<PinTokenPayload | null> {
  if (!token.startsWith("pin.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const body = parts[1];
  const sig = parts[2];
  const expected = await hmacSign(body, getJwtSecret());
  if (expected !== sig) return null;
  let payload: PinTokenPayload;
  try {
    payload = JSON.parse(atob(body));
  } catch {
    return null;
  }
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function isFourDigitPin(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}$/.test(s);
}

function validStudentRow(r: any, i: number): { ok: true; row: StudentRow } | { ok: false; message: string; rowIndex: number } {
  if (!r || typeof r !== "object") return { ok: false, message: "row is not an object", rowIndex: i };
  if (!r.grNumber || typeof r.grNumber !== "string") return { ok: false, message: "grNumber required", rowIndex: i };
  if (!r.fullName || typeof r.fullName !== "string") return { ok: false, message: "fullName required", rowIndex: i };
  return {
    ok: true,
    row: {
      grNumber: String(r.grNumber).trim(),
      fullName: String(r.fullName).trim(),
      classSectionId: r.classSectionId || undefined,
      photoUrl: r.photoUrl || undefined,
      dateOfBirth: r.dateOfBirth || undefined,
      gender: r.gender || undefined,
      guardianPhone: r.guardianPhone || undefined,
      guardianEmail: r.guardianEmail || undefined,
      program:
        typeof r.program === "string" && (r.program === "hifz" || r.program === "conventional")
          ? r.program
          : undefined,
      // Admission-form fields. All pass through unmodified; storage
      // layer accepts undefined → null.
      registrationNo: r.registrationNo || undefined,
      applyingForGrade: r.applyingForGrade || undefined,
      academicTerm: r.academicTerm || undefined,
      religion: r.religion || undefined,
      nationality: r.nationality || undefined,
      homeLanguage: r.homeLanguage || undefined,
      lastSchool: r.lastSchool || undefined,
      lastClassStudying: r.lastClassStudying || undefined,
      lastClassCompleted: r.lastClassCompleted || undefined,
      wasSuspended: r.wasSuspended === true,
      suspensionDetails: r.suspensionDetails || undefined,
      medicalConditions: r.medicalConditions || undefined,
      psychologicalConditions: r.psychologicalConditions || undefined,
      bloodGroup: r.bloodGroup || undefined,
      referralSource: r.referralSource || undefined,
      reasonsForApplying: r.reasonsForApplying || undefined,
      availTransport: r.availTransport === true,
      studentGmail: r.studentGmail || undefined,
      feeSubmittedTotal: typeof r.feeSubmittedTotal === "number" ? r.feeSubmittedTotal : undefined,
      receiptNo: r.receiptNo || undefined,
      admissionDate: r.admissionDate || undefined,
      completenessStatus: r.completenessStatus || undefined,
    },
  };
}

/** Map the StudentRow shape to the DB column names — covers core +
 *  admission-redesign fields. Centralized so POST / PATCH / bulk all
 *  stay in lockstep. Returns ONLY fields the row actually set; pairs
 *  well with PATCH partial-updates. */
function studentRowToColumns(
  row: StudentRow,
  orgId: string,
  /** PR feat/import-rollback. Tags the row with the import batch when
   *  called from a bulk endpoint; single-create writers pass undefined
   *  so the column stays null. */
  batchId?: string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    org_id: orgId,
    gr_number: row.grNumber,
    full_name: row.fullName,
    class_section_id: row.classSectionId ?? null,
    photo_url: row.photoUrl ?? null,
    date_of_birth: row.dateOfBirth ?? null,
    gender: row.gender ?? null,
    guardian_phone: row.guardianPhone ?? null,
    guardian_email: row.guardianEmail ?? null,
    program: row.program ?? null,
    registration_no: row.registrationNo ?? null,
    applying_for_grade: row.applyingForGrade ?? null,
    academic_term: row.academicTerm ?? null,
    religion: row.religion ?? null,
    nationality: row.nationality ?? null,
    home_language: row.homeLanguage ?? null,
    last_school: row.lastSchool ?? null,
    last_class_studying: row.lastClassStudying ?? null,
    last_class_completed: row.lastClassCompleted ?? null,
    was_suspended: row.wasSuspended ?? false,
    suspension_details: row.suspensionDetails ?? null,
    medical_conditions: row.medicalConditions ?? null,
    psychological_conditions: row.psychologicalConditions ?? null,
    blood_group: row.bloodGroup ?? null,
    referral_source: row.referralSource ?? null,
    reasons_for_applying: row.reasonsForApplying ?? null,
    avail_transport: row.availTransport ?? false,
    student_gmail: row.studentGmail ?? null,
    fee_submitted_total: row.feeSubmittedTotal ?? null,
    receipt_no: row.receiptNo ?? null,
    admission_date: row.admissionDate ?? null,
    import_batch_id: batchId ?? null,
  };
  if (row.completenessStatus) out.completeness_status = row.completenessStatus;
  return out;
}

function validParentRow(r: any, i: number): { ok: true; row: ParentRow } | { ok: false; message: string; rowIndex: number } {
  if (!r || typeof r !== "object") return { ok: false, message: "row is not an object", rowIndex: i };
  if (!r.fullName || typeof r.fullName !== "string") return { ok: false, message: "fullName required", rowIndex: i };
  return {
    ok: true,
    row: {
      fullName: String(r.fullName).trim(),
      phone: r.phone || undefined,
      email: r.email || undefined,
      relationship: r.relationship || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Link code generator — 8 chars from a no-ambiguous alphabet.
// ---------------------------------------------------------------------------
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateLinkCode(): string {
  const buf = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (let i = 0; i < 8; i++) s += LINK_CODE_ALPHABET[buf[i] % LINK_CODE_ALPHABET.length];
  return s;
}

// ===========================================================================
// installPhaseA — attaches all Phase A routes to the school Hono sub-app.
// ===========================================================================
export function installPhaseA(school: Hono) {
  // -------------------------------------------------------------------------
  // CLASSES
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/classes", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.name || typeof body.name !== "string") {
      return c.json({ error: "name required" }, 400);
    }
    const { data, error } = await serviceRoleClient
      .from("class")
      .insert({
        org_id: orgId,
        name: body.name.trim(),
        display_order: typeof body.displayOrder === "number" ? body.displayOrder : 0,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a class with this name already exists" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json(data, 201);
  });

  // ─── Bulk importers (PR feat/import-center-hub) ─────────────────────
  // Three sibling endpoints used by the Import Center. Each follows the
  // same shape as the existing students/parents/teachers bulk routes:
  //   * accepts { rows: [{...}] }
  //   * returns { inserted, errors: [{ rowIndex, message }] }
  //   * partial success — invalid rows reported as errors; valid rows
  //     still get inserted
  //
  // Lookup-by-name semantics keep the CSV "old-school-friendly":
  //   * Sections reference class by name (className)
  //   * Subjects reference class by name (className)
  //   * Hifz entries reference student by GR (grNumber)
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/classes/bulk", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    const batchId = await createImportBatch(orgId, "classes", userId);
    const errors: Array<{ rowIndex: number; message: string }> = [];
    let inserted = 0;
    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] ?? {};
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) { errors.push({ rowIndex: i, message: "name required" }); continue; }
      const displayOrder = typeof r.displayOrder === "number"
        ? r.displayOrder
        : Number(r.displayOrder) || 0;
      const { error } = await serviceRoleClient
        .from("class")
        .insert({ org_id: orgId, name, display_order: displayOrder, import_batch_id: batchId });
      if (error) {
        const msg = (error as any).code === "23505"
          ? `class "${name}" already exists`
          : (error as any).message;
        errors.push({ rowIndex: i, message: msg });
      } else {
        inserted++;
      }
    }
    await finalizeImportBatch(batchId, inserted);
    return c.json({ inserted, errors, batchId });
  });

  school.post("/orgs/:orgId/sections/bulk", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    // Resolve className → class_id once. Case-insensitive match.
    const { data: classes } = await serviceRoleClient
      .from("class")
      .select("id, name")
      .eq("org_id", orgId);
    const classMap = new Map<string, string>();
    for (const c of (classes ?? []) as any[]) {
      classMap.set(String(c.name).toLowerCase().trim(), c.id);
    }

    const batchId = await createImportBatch(orgId, "sections", userId);
    const errors: Array<{ rowIndex: number; message: string }> = [];
    let inserted = 0;
    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] ?? {};
      const className = typeof r.className === "string" ? r.className.trim() : "";
      const sectionName = typeof r.sectionName === "string" ? r.sectionName.trim() : "";
      if (!className || !sectionName) {
        errors.push({ rowIndex: i, message: "className and sectionName required" });
        continue;
      }
      const classId = classMap.get(className.toLowerCase());
      if (!classId) {
        errors.push({ rowIndex: i, message: `class "${className}" not found — create it first` });
        continue;
      }
      const { error } = await serviceRoleClient
        .from("class_section")
        .insert({ class_id: classId, name: sectionName, import_batch_id: batchId });
      if (error) {
        const msg = (error as any).code === "23505"
          ? `section "${sectionName}" already exists for ${className}`
          : (error as any).message;
        errors.push({ rowIndex: i, message: msg });
      } else {
        inserted++;
      }
    }
    await finalizeImportBatch(batchId, inserted);
    return c.json({ inserted, errors, batchId });
  });

  school.post("/orgs/:orgId/class-subjects/bulk", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    const { data: classes } = await serviceRoleClient
      .from("class")
      .select("id, name")
      .eq("org_id", orgId);
    const classMap = new Map<string, string>();
    for (const c of (classes ?? []) as any[]) {
      classMap.set(String(c.name).toLowerCase().trim(), c.id);
    }

    const batchId = await createImportBatch(orgId, "subjects", userId);
    const errors: Array<{ rowIndex: number; message: string }> = [];
    let inserted = 0;
    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] ?? {};
      const className = typeof r.className === "string" ? r.className.trim() : "";
      const subjectName = typeof r.subjectName === "string" ? r.subjectName.trim() : "";
      if (!className || !subjectName) {
        errors.push({ rowIndex: i, message: "className and subjectName required" });
        continue;
      }
      const classId = classMap.get(className.toLowerCase());
      if (!classId) {
        errors.push({ rowIndex: i, message: `class "${className}" not found — create it first` });
        continue;
      }
      const sortOrder = typeof r.sortOrder === "number" ? r.sortOrder : 0;
      const { error } = await serviceRoleClient
        .from("class_subject")
        .insert({
          org_id: orgId,
          class_id: classId,
          name: subjectName,
          sort_order: sortOrder,
          import_batch_id: batchId,
        });
      if (error) {
        const msg = (error as any).code === "23505"
          ? `subject "${subjectName}" already exists for ${className}`
          : (error as any).message;
        errors.push({ rowIndex: i, message: msg });
      } else {
        inserted++;
      }
    }
    await finalizeImportBatch(batchId, inserted);
    return c.json({ inserted, errors, batchId });
  });

  school.get("/orgs/:orgId/classes", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: classes, error } = await serviceRoleClient
      .from("class")
      .select("*")
      .eq("org_id", orgId)
      .order("display_order")
      .order("name");
    if (error) return c.json({ error: error.message }, 500);
    const classIds = (classes ?? []).map((c: any) => c.id);
    let sectionsByClass: Record<string, any[]> = {};
    if (classIds.length > 0) {
      const { data: sections } = await serviceRoleClient
        .from("class_section")
        .select("*")
        .in("class_id", classIds)
        .order("name");
      for (const s of sections ?? []) {
        (sectionsByClass[s.class_id] ??= []).push(s);
      }
    }
    return c.json({
      classes: (classes ?? []).map((cl: any) => ({
        ...cl,
        sections: sectionsByClass[cl.id] ?? [],
      })),
    });
  });

  school.patch("/orgs/:orgId/classes/:classId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const classId = c.req.param("classId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.displayOrder === "number") patch.display_order = body.displayOrder;
    if (Object.keys(patch).length === 0) return c.json({ error: "no fields to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("class")
      .update(patch)
      .eq("id", classId)
      .eq("org_id", orgId)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  });

  school.delete("/orgs/:orgId/classes/:classId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const classId = c.req.param("classId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { error } = await serviceRoleClient
      .from("class")
      .delete()
      .eq("id", classId)
      .eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // SECTIONS
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/classes/:classId/sections", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const classId = c.req.param("classId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.name || typeof body.name !== "string") return c.json({ error: "name required" }, 400);

    // Verify the class belongs to this org
    const { data: cls } = await serviceRoleClient
      .from("class").select("id").eq("id", classId).eq("org_id", orgId).maybeSingle();
    if (!cls) return c.json({ error: "class not found in this org" }, 404);

    const { data, error } = await serviceRoleClient
      .from("class_section")
      .insert({
        class_id: classId,
        name: body.name.trim(),
        class_teacher_user_id: body.classTeacherUserId ?? null,
        // Optional separate Hifz teacher (PR feat/hifz-trends-missed-
        // teacher). Hifz schools commonly run a parallel teacher who
        // owns the memorization log without touching academic
        // lessons. Both teachers get teacher-level access to the
        // section; UIs filter by which side they own.
        hifz_teacher_user_id: body.hifzTeacherUserId ?? null,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a section with this name already exists for this class" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json(data, 201);
  });

  school.patch("/orgs/:orgId/sections/:sectionId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }

    // Verify section belongs to this org via class join
    const { data: secCheck } = await serviceRoleClient
      .from("class_section")
      .select("id, class:class_id(org_id)")
      .eq("id", sectionId)
      .maybeSingle();
    if (!secCheck || (secCheck as any).class?.org_id !== orgId) {
      return c.json({ error: "section not found in this org" }, 404);
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if ("classTeacherUserId" in body) patch.class_teacher_user_id = body.classTeacherUserId ?? null;
    if ("hifzTeacherUserId" in body) patch.hifz_teacher_user_id = body.hifzTeacherUserId ?? null;
    if (Object.keys(patch).length === 0) return c.json({ error: "no fields to update" }, 400);

    const { data, error } = await serviceRoleClient
      .from("class_section").update(patch).eq("id", sectionId).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  });

  school.delete("/orgs/:orgId/sections/:sectionId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);

    const { data: secCheck } = await serviceRoleClient
      .from("class_section")
      .select("id, class:class_id(org_id)")
      .eq("id", sectionId)
      .maybeSingle();
    if (!secCheck || (secCheck as any).class?.org_id !== orgId) {
      return c.json({ error: "section not found in this org" }, 404);
    }
    const { error } = await serviceRoleClient.from("class_section").delete().eq("id", sectionId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // INLINE PARENT LINKING (helper used by POST /students,
  // POST /students/bulk, and POST /parents/bulk).
  //
  // Why this exists: until now the admin had to add a student, then add
  // a parent, then call POST /student-parent to link them — three round
  // trips for the most common workflow. This helper makes "add student
  // with their parent" a single atomic UX while preserving the M:N model
  // (one Imran Khan parent → both his kids in school, no duplicates).
  //
  // Dedup rule, in order:
  //   1. email match (case-insensitive) in this org → reuse
  //   2. else phone match (digits-only compare) in this org → reuse
  //   3. else create new parent row
  // Then upsert student_parent with is_primary=true. Returns a structured
  // result so callers can surface partial-success warnings without
  // failing the whole student insert.
  // -------------------------------------------------------------------------
  async function attachInlineParent(
    orgId: string,
    studentId: string,
    parentInput: InlineParentRow,
    /** PR feat/import-rollback — when this helper is called from the
     *  students-bulk path, the same batchId tags any new parent +
     *  student_parent rows so a rollback of the batch deletes them
     *  alongside the students. Reused parent rows aren't re-tagged. */
    batchId?: string | null,
  ): Promise<{ ok: true; parentId: string; reused: boolean } | { ok: false; message: string }> {
    const fullName = (parentInput.fullName ?? "").trim();
    const phone = (parentInput.phone ?? "").trim();
    const email = (parentInput.email ?? "").trim();
    const relationship = (parentInput.relationship ?? "").trim();
    if (!fullName) {
      return { ok: false, message: "parent.fullName required when adding a parent" };
    }
    // Try email dedup first — that's the strongest signal.
    let parentId: string | null = null;
    let reused = false;
    if (email) {
      const { data: byEmail } = await serviceRoleClient
        .from("parent")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", email)
        .maybeSingle();
      if (byEmail) {
        parentId = (byEmail as any).id;
        reused = true;
      }
    }
    // Then phone dedup (only digits, so "+92 300" and "923000" collapse).
    if (!parentId && phone) {
      const phoneDigits = phone.replace(/\D/g, "");
      if (phoneDigits.length >= 7) {
        const { data: candidates } = await serviceRoleClient
          .from("parent")
          .select("id, phone")
          .eq("org_id", orgId)
          .not("phone", "is", null)
          .limit(500);
        const hit = (candidates ?? []).find(
          (p: any) => (p.phone ?? "").replace(/\D/g, "") === phoneDigits,
        );
        if (hit) {
          parentId = (hit as any).id;
          reused = true;
        }
      }
    }
    if (!parentId) {
      const { data: created, error: insErr } = await serviceRoleClient
        .from("parent")
        .insert({
          org_id: orgId,
          full_name: fullName,
          phone: phone || null,
          email: email || null,
          relationship: relationship || null,
          import_batch_id: batchId ?? null,
        })
        .select("id")
        .single();
      if (insErr) return { ok: false, message: `parent_create_failed: ${insErr.message}` };
      parentId = (created as any).id;
    }
    const { error: linkErr } = await serviceRoleClient
      .from("student_parent")
      .upsert(
        {
          student_id: studentId,
          parent_id: parentId,
          is_primary: true,
          import_batch_id: batchId ?? null,
        },
        { onConflict: "student_id,parent_id", ignoreDuplicates: false },
      );
    if (linkErr) return { ok: false, message: `link_failed: ${linkErr.message}` };
    return { ok: true, parentId: parentId!, reused };
  }

  // -------------------------------------------------------------------------
  // attachGuardian — richer cousin of attachInlineParent. Used by the
  // redesigned Add Student flow. Handles per-link role flags, the full
  // PDF-form parent attribute set, and arbitrary `parent_role` values.
  // Dedup logic still applies — NIC > email > phone — so siblings under
  // the same father don't create duplicate parent rows.
  // -------------------------------------------------------------------------
  async function attachGuardian(
    orgId: string,
    studentId: string,
    g: GuardianInput,
  ): Promise<{ ok: true; parentId: string; reused: boolean } | { ok: false; message: string }> {
    const fullName = (g.fullName ?? "").trim();
    const nic = (g.nic ?? "").trim();
    const email = (g.email ?? "").trim();
    const cellPhone = (g.cellPhone ?? g.phone ?? "").trim();
    const homePhone = (g.homePhone ?? "").trim();
    if (!fullName) return { ok: false, message: "guardian.fullName required" };

    let parentId: string | null = null;
    let reused = false;

    // 1. NIC dedup — strongest. CNIC numbers are unique per person.
    if (nic) {
      const nicDigits = nic.replace(/\D/g, "");
      if (nicDigits.length >= 7) {
        const { data: candidates } = await serviceRoleClient
          .from("parent")
          .select("id, nic")
          .eq("org_id", orgId)
          .not("nic", "is", null)
          .limit(500);
        const hit = (candidates ?? []).find(
          (p: any) => (p.nic ?? "").replace(/\D/g, "") === nicDigits,
        );
        if (hit) { parentId = (hit as any).id; reused = true; }
      }
    }
    // 2. email
    if (!parentId && email) {
      const { data: byEmail } = await serviceRoleClient
        .from("parent")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", email)
        .maybeSingle();
      if (byEmail) { parentId = (byEmail as any).id; reused = true; }
    }
    // 3. phone — check both cell_phone and the legacy phone column +
    //    home_phone. Same-digits comparison so spacing variants
    //    collapse.
    if (!parentId && (cellPhone || homePhone)) {
      const want = (cellPhone || homePhone).replace(/\D/g, "");
      if (want.length >= 7) {
        const { data: candidates } = await serviceRoleClient
          .from("parent")
          .select("id, phone, cell_phone, home_phone")
          .eq("org_id", orgId)
          .limit(500);
        const hit = (candidates ?? []).find((p: any) => {
          for (const k of ["cell_phone", "phone", "home_phone"]) {
            if ((p[k] ?? "").replace(/\D/g, "") === want) return true;
          }
          return false;
        });
        if (hit) { parentId = (hit as any).id; reused = true; }
      }
    }

    const role = (g.parentRole ?? "").trim() || null;
    // Insert OR update parent attributes if we matched an existing
    // record. Updating fills in fields that were blank before — handy
    // when the same parent had a stub row from a sibling and the
    // new admission provides their NIC / employer for the first time.
    if (!parentId) {
      const { data: created, error: insErr } = await serviceRoleClient
        .from("parent")
        .insert({
          org_id: orgId,
          full_name: fullName,
          title: (g.title ?? "").trim() || null,
          nic: nic || null,
          home_address: (g.homeAddress ?? "").trim() || null,
          home_phone: homePhone || null,
          cell_phone: cellPhone || null,
          phone: cellPhone || null,    // back-compat
          email: email || null,
          relationship: role,          // mirror role into the legacy
                                       // single-relationship column so
                                       // older queries still find it.
          occupation: (g.occupation ?? "").trim() || null,
          employer: (g.employer ?? "").trim() || null,
          employer_address: (g.employerAddress ?? "").trim() || null,
          business_phone: (g.businessPhone ?? "").trim() || null,
        })
        .select("id")
        .single();
      if (insErr) return { ok: false, message: `parent_create_failed: ${insErr.message}` };
      parentId = (created as any).id;
    } else {
      // Fill in blanks on the existing record. Coalesce on the server
      // would be cleaner but JS-side merge is fine at pilot scale.
      const { data: current } = await serviceRoleClient
        .from("parent").select("*").eq("id", parentId).maybeSingle();
      const patch: Record<string, unknown> = {};
      const setIfEmpty = (col: string, val: string) => {
        if (val && !((current as any)?.[col])) patch[col] = val;
      };
      setIfEmpty("title", (g.title ?? "").trim());
      setIfEmpty("nic", nic);
      setIfEmpty("home_address", (g.homeAddress ?? "").trim());
      setIfEmpty("home_phone", homePhone);
      setIfEmpty("cell_phone", cellPhone);
      setIfEmpty("phone", cellPhone);
      setIfEmpty("email", email);
      setIfEmpty("occupation", (g.occupation ?? "").trim());
      setIfEmpty("employer", (g.employer ?? "").trim());
      setIfEmpty("employer_address", (g.employerAddress ?? "").trim());
      setIfEmpty("business_phone", (g.businessPhone ?? "").trim());
      if (Object.keys(patch).length > 0) {
        await serviceRoleClient.from("parent").update(patch).eq("id", parentId);
      }
    }

    // Link with role flags. is_primary on the link historically meant
    // "first contact" — keep it tied to is_primary_contact for back-
    // compat with any older code that reads the bool directly.
    const { error: linkErr } = await serviceRoleClient
      .from("student_parent")
      .upsert(
        {
          student_id: studentId,
          parent_id: parentId,
          is_primary: g.isPrimaryContact === true,
          parent_role: role,
          is_primary_contact: g.isPrimaryContact === true,
          is_emergency_contact: g.isEmergencyContact === true,
          is_fee_payer: g.isFeePayer === true,
          is_pickup_authorized: g.isPickupAuthorized === true,
          portal_access_phone:
            (g.portalAccessPhone ?? "").trim() || cellPhone || null,
        },
        { onConflict: "student_id,parent_id", ignoreDuplicates: false },
      );
    if (linkErr) return { ok: false, message: `link_failed: ${linkErr.message}` };
    return { ok: true, parentId: parentId!, reused };
  }

  // -------------------------------------------------------------------------
  // STUDENTS
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/students", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    // PR K: office_staff can manage students via manage_students permission.
    if (!(await userCanInOrg(userId, orgId, "manage_students"))) {
      return c.json({ error: "You don't have permission to add students.", code: "FORBIDDEN_PERMISSION" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const v = validStudentRow(body, 0);
    if (!v.ok) return c.json({ error: v.message }, 400);

    const { data, error } = await serviceRoleClient
      .from("student")
      .insert(studentRowToColumns(v.row, orgId))
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a student with this GR number already exists" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }

    // Inline guardians/parents — three accepted shapes:
    //   * body.guardians: GuardianInput[]   (preferred, new admission flow)
    //   * body.parent:    InlineParentRow   (legacy single-parent)
    //   * neither                            (record stays guardians_pending)
    //
    // We INTENTIONALLY don't roll back the student row on partial
    // failures — Supabase JS has no transactions; a half-created
    // record is recoverable from the UI. Each failure surfaces as a
    // `warning` (single) or `warnings[]` (array) entry on the 201.
    const studentId = (data as any).id;
    const warnings: string[] = [];
    let linkedParentId: string | null = null;
    let linkedCount = 0;

    if (Array.isArray(body?.guardians) && body.guardians.length > 0) {
      for (let i = 0; i < body.guardians.length; i++) {
        const g = body.guardians[i] as GuardianInput;
        if (!g || !(g.fullName ?? "").trim()) continue;
        const r = await attachGuardian(orgId, studentId, g);
        if (r.ok) {
          if (!linkedParentId) linkedParentId = r.parentId;
          linkedCount++;
        } else {
          warnings.push(`guardian[${i}]: ${r.message}`);
        }
      }
    } else {
      const inlineParent: InlineParentRow | undefined =
        body?.parent && typeof body.parent === "object" ? body.parent : undefined;
      if (inlineParent && (inlineParent.fullName ?? "").trim()) {
        const r = await attachInlineParent(orgId, studentId, inlineParent);
        if (r.ok) {
          linkedParentId = r.parentId;
          linkedCount = 1;
        } else {
          warnings.push(r.message);
        }
      }
    }

    // Optional siblings array — straight insert per row, no dedup.
    if (Array.isArray(body?.siblings)) {
      const sibRows = (body.siblings as SiblingInput[])
        .filter((s) => s && typeof s.name === "string" && s.name.trim().length > 0)
        .map((s) => ({
          student_id: studentId,
          name: s.name.trim(),
          age: typeof s.age === "number" ? s.age : null,
          gender: s.gender ?? null,
          current_school: s.currentSchool ?? null,
          grade: s.grade ?? null,
        }));
      if (sibRows.length > 0) {
        const { error: sibErr } = await serviceRoleClient
          .from("student_sibling").insert(sibRows);
        if (sibErr) warnings.push(`siblings: ${sibErr.message}`);
      }
    }

    // Optional checklist — single row, upsert keyed by student_id.
    if (body?.checklist && typeof body.checklist === "object") {
      const ck = body.checklist as AdmissionChecklistInput;
      const { error: ckErr } = await serviceRoleClient
        .from("student_admission_checklist")
        .upsert(
          {
            student_id: studentId,
            report_card_received: ck.reportCardReceived === true,
            photos_received: ck.photosReceived === true,
            father_id_received: ck.fatherIdReceived === true,
            birth_cert_received: ck.birthCertReceived === true,
            declaration_signed_at:
              ck.declarationSignedByName ? new Date().toISOString() : null,
            declaration_signed_by_name: ck.declarationSignedByName ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "student_id" },
        );
      if (ckErr) warnings.push(`checklist: ${ckErr.message}`);
    }

    // If the caller didn't pass a completenessStatus and no guardians
    // landed, default the record to guardians_pending so the worklist
    // surfaces it. Otherwise default to 'complete'. This mirrors the
    // paper-form workflow where a child can be enrolled with documents
    // pending and the office chases the rest.
    if (!v.row.completenessStatus) {
      const target = linkedCount === 0 ? "guardians_pending" : "complete";
      await serviceRoleClient
        .from("student")
        .update({ completeness_status: target })
        .eq("id", studentId);
      (data as any).completeness_status = target;
    }

    return c.json(
      {
        ...(data as any),
        linkedParentId,
        guardiansLinked: linkedCount,
        warning: warnings[0] ?? null,
        warnings,
      },
      201,
    );
  });

  school.get("/orgs/:orgId/students", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const classSectionId = c.req.query("classSectionId");
    const search = c.req.query("search");
    let q = serviceRoleClient.from("student").select("*").eq("org_id", orgId);
    if (classSectionId) q = q.eq("class_section_id", classSectionId);
    if (search) q = q.ilike("full_name", `%${search}%`);
    const { data, error } = await q.order("full_name").limit(500);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ students: data ?? [] });
  });

  school.get("/orgs/:orgId/students/:studentId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data: student, error } = await serviceRoleClient
      .from("student").select("*").eq("id", studentId).eq("org_id", orgId).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!student) return c.json({ error: "not found" }, 404);
    const { data: links } = await serviceRoleClient
      .from("student_parent")
      .select("is_primary, parent:parent_id(*)")
      .eq("student_id", studentId);
    return c.json({
      student,
      parents: (links ?? []).map((l: any) => ({ ...l.parent, isPrimary: l.is_primary })),
    });
  });

  school.patch("/orgs/:orgId/students/:studentId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    // PR K: manage_students permission (office_staff included by default).
    if (!(await userCanInOrg(userId, orgId, "manage_students"))) {
      return c.json({ error: "You don't have permission to edit students.", code: "FORBIDDEN_PERMISSION" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const map: Record<string, string> = {
      grNumber: "gr_number",
      fullName: "full_name",
      classSectionId: "class_section_id",
      photoUrl: "photo_url",
      dateOfBirth: "date_of_birth",
      gender: "gender",
      guardianPhone: "guardian_phone",
      guardianEmail: "guardian_email",
      program: "program",
      // Admission-form fields (PR feat/student-parent-onboarding-redesign).
      registrationNo: "registration_no",
      applyingForGrade: "applying_for_grade",
      academicTerm: "academic_term",
      religion: "religion",
      nationality: "nationality",
      homeLanguage: "home_language",
      lastSchool: "last_school",
      lastClassStudying: "last_class_studying",
      lastClassCompleted: "last_class_completed",
      wasSuspended: "was_suspended",
      suspensionDetails: "suspension_details",
      medicalConditions: "medical_conditions",
      psychologicalConditions: "psychological_conditions",
      bloodGroup: "blood_group",
      referralSource: "referral_source",
      reasonsForApplying: "reasons_for_applying",
      availTransport: "avail_transport",
      studentGmail: "student_gmail",
      feeSubmittedTotal: "fee_submitted_total",
      receiptNo: "receipt_no",
      admissionDate: "admission_date",
      completenessStatus: "completeness_status",
      hifzGroupId: "hifz_group_id",
    };
    const patch: Record<string, unknown> = {};
    for (const [k, col] of Object.entries(map)) {
      if (k in body) patch[col] = body[k] ?? null;
    }
    if (Object.keys(patch).length === 0) return c.json({ error: "no fields to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("student").update(patch).eq("id", studentId).eq("org_id", orgId)
      .select().single();
    if (error) {
      if ((error as any).code === "23505") return c.json({ error: "GR number already in use" }, 409);
      return c.json({ error: error.message }, 500);
    }
    return c.json(data);
  });

  school.delete("/orgs/:orgId/students/:studentId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { error } = await serviceRoleClient
      .from("student").delete().eq("id", studentId).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  school.post("/orgs/:orgId/students/bulk", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    const errors: Array<{ rowIndex: number; message: string }> = [];
    const validRows: Array<{ idx: number; row: StudentRow }> = [];
    const grSeen = new Set<string>();
    for (let i = 0; i < body.rows.length; i++) {
      const v = validStudentRow(body.rows[i], i);
      if (!v.ok) { errors.push({ rowIndex: v.rowIndex, message: v.message }); continue; }
      if (grSeen.has(v.row.grNumber)) {
        errors.push({ rowIndex: i, message: `duplicate grNumber in upload: ${v.row.grNumber}` });
        continue;
      }
      grSeen.add(v.row.grNumber);
      validRows.push({ idx: i, row: v.row });
    }

    if (validRows.length === 0) return c.json({ inserted: 0, errors });

    const batchId = await createImportBatch(orgId, "students", userId);
    const payload = validRows.map(({ row }) => studentRowToColumns(row, orgId, batchId));

    // First pass: insert students. We keep a parallel array of original
    // CSV rows so the second pass (inline-parent attach) can look up
    // parent fields per insert success without re-parsing.
    const rawRows = validRows.map(({ idx }) => body.rows[idx]);
    let insertedStudents: Array<{ id: string; gr_number: string; idx: number }> = [];

    const { data, error } = await serviceRoleClient
      .from("student").insert(payload).select("id, gr_number");
    if (error) {
      // Fall back to per-row inserts so we can report partial success.
      for (let i = 0; i < validRows.length; i++) {
        const { idx, row } = validRows[i];
        const { data: oneData, error: rowErr } = await serviceRoleClient
          .from("student")
          .insert(studentRowToColumns(row, orgId, batchId))
          .select("id, gr_number")
          .single();
        if (rowErr) {
          errors.push({ rowIndex: idx, message: rowErr.message });
        } else if (oneData) {
          insertedStudents.push({ id: (oneData as any).id, gr_number: (oneData as any).gr_number, idx });
        }
      }
    } else {
      // Batch succeeded — map back to original rowIndex via gr_number.
      const byGr = new Map<string, number>();
      for (const v of validRows) byGr.set(v.row.grNumber, v.idx);
      insertedStudents = (data ?? []).map((d: any) => ({
        id: d.id,
        gr_number: d.gr_number,
        idx: byGr.get(d.gr_number) ?? -1,
      }));
    }

    // Second pass: inline parent attach for rows that had parent fields.
    // Each link failure surfaces as a row error tagged "parent_link" so
    // the admin sees the row succeeded as a student but the parent step
    // didn't (e.g. duplicate constraint, bad email).
    let linkedCount = 0;
    for (const stu of insertedStudents) {
      const raw = rawRows.find((_r, j) => validRows[j].idx === stu.idx);
      const inlineParent: InlineParentRow | undefined =
        raw && typeof raw.parent === "object" && raw.parent !== null
          ? raw.parent as InlineParentRow
          // Also accept flat columns coming from CSV (parentFullName etc.)
          // so the CSV dialog doesn't have to reshape rows.
          : raw && (raw.parentFullName || raw.parentPhone || raw.parentEmail)
          ? {
              fullName: raw.parentFullName,
              phone: raw.parentPhone,
              email: raw.parentEmail,
              relationship: raw.parentRelationship,
            }
          : undefined;
      if (!inlineParent || !(inlineParent.fullName ?? "").trim()) continue;
      const r = await attachInlineParent(orgId, stu.id, inlineParent, batchId);
      if (r.ok) linkedCount++;
      else errors.push({ rowIndex: stu.idx, message: `student inserted but ${r.message}` });
    }

    await finalizeImportBatch(batchId, insertedStudents.length);
    return c.json({ inserted: insertedStudents.length, parentsLinked: linkedCount, errors, batchId });
  });

  // -------------------------------------------------------------------------
  // PARENTS
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/parents", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const v = validParentRow(body, 0);
    if (!v.ok) return c.json({ error: v.message }, 400);

    // PR F (Q3 safeguard): block silent claim attacks. If a parent row in
    // this org already has this email, refuse the create. The admin's UI
    // should then surface "this parent already exists, add the new student
    // to them instead". The check is case-insensitive (ilike) so
    // "Foo@Gmail.com" and "foo@gmail.com" collide as intended.
    if (v.row.email) {
      const { data: dup } = await serviceRoleClient
        .from("parent")
        .select("id, full_name")
        .eq("org_id", orgId)
        .ilike("email", v.row.email)
        .maybeSingle();
      if (dup) {
        return c.json(
          {
            error: `A parent with this email already exists in this school (${(dup as any).full_name}). Add the new student to that existing parent record instead.`,
            code: "PARENT_EMAIL_EXISTS",
            existingParentId: (dup as any).id,
          },
          409,
        );
      }
    }

    const { data, error } = await serviceRoleClient
      .from("parent")
      .insert({
        org_id: orgId,
        full_name: v.row.fullName,
        phone: v.row.phone ?? null,
        email: v.row.email ?? null,
        relationship: v.row.relationship ?? null,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
  });

  school.get("/orgs/:orgId/parents", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const studentId = c.req.query("studentId");
    const search = c.req.query("search");

    if (studentId) {
      const { data, error } = await serviceRoleClient
        .from("student_parent")
        .select("is_primary, parent:parent_id(*)")
        .eq("student_id", studentId);
      if (error) return c.json({ error: error.message }, 500);
      return c.json({
        parents: (data ?? [])
          .map((r: any) => ({ ...r.parent, isPrimary: r.is_primary }))
          .filter((p: any) => p.org_id === orgId),
      });
    }

    // Embed children via student_parent → student. This lets the
    // Parents admin page show "John (Grade 3-A), Sara (Grade 5-A)" per
    // parent without a second roundtrip. PostgREST nested-select syntax.
    let q = serviceRoleClient
      .from("parent")
      .select(
        "*, student_parent(is_primary, student:student_id(id, full_name, gr_number, class_section_id))",
      )
      .eq("org_id", orgId);
    if (search) q = q.ilike("full_name", `%${search}%`);
    const { data, error } = await q.order("full_name").limit(500);
    if (error) return c.json({ error: error.message }, 500);

    // Flatten the nested shape into a `children` array on each parent.
    const parents = (data ?? []).map((p: any) => ({
      ...p,
      children: (p.student_parent ?? [])
        .map((sp: any) => sp.student ? {
          id: sp.student.id,
          full_name: sp.student.full_name,
          gr_number: sp.student.gr_number,
          class_section_id: sp.student.class_section_id,
          isPrimary: !!sp.is_primary,
        } : null)
        .filter(Boolean),
      student_parent: undefined, // drop the raw embed
    }));
    return c.json({ parents });
  });

  school.patch("/orgs/:orgId/parents/:parentId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const parentId = c.req.param("parentId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const map: Record<string, string> = {
      fullName: "full_name",
      phone: "phone",
      email: "email",
      relationship: "relationship",
    };
    const patch: Record<string, unknown> = {};
    for (const [k, col] of Object.entries(map)) {
      if (k in body) patch[col] = body[k] ?? null;
    }
    if (Object.keys(patch).length === 0) return c.json({ error: "no fields to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("parent").update(patch).eq("id", parentId).eq("org_id", orgId)
      .select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  });

  school.delete("/orgs/:orgId/parents/:parentId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const parentId = c.req.param("parentId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { error } = await serviceRoleClient
      .from("parent").delete().eq("id", parentId).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  school.post("/orgs/:orgId/parents/bulk", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    const errors: Array<{ rowIndex: number; message: string }> = [];
    const valid: Array<{ idx: number; row: ParentRow }> = [];
    for (let i = 0; i < body.rows.length; i++) {
      const v = validParentRow(body.rows[i], i);
      if (!v.ok) { errors.push({ rowIndex: v.rowIndex, message: v.message }); continue; }
      valid.push({ idx: i, row: v.row });
    }
    if (valid.length === 0) return c.json({ inserted: 0, errors });

    const batchId = await createImportBatch(orgId, "parents", userId);
    const payload = valid.map(({ row }) => ({
      org_id: orgId,
      full_name: row.fullName,
      phone: row.phone ?? null,
      email: row.email ?? null,
      relationship: row.relationship ?? null,
      import_batch_id: batchId,
    }));
    // Insert pass — collect ids per row so we can link them to students.
    let insertedParents: Array<{ id: string; idx: number }> = [];
    const { data, error } = await serviceRoleClient.from("parent").insert(payload).select("id");
    if (error) {
      for (const { idx, row } of valid) {
        const { data: oneData, error: rowErr } = await serviceRoleClient
          .from("parent")
          .insert({
            org_id: orgId,
            full_name: row.fullName,
            phone: row.phone ?? null,
            email: row.email ?? null,
            relationship: row.relationship ?? null,
            import_batch_id: batchId,
          })
          .select("id")
          .single();
        if (rowErr) errors.push({ rowIndex: idx, message: rowErr.message });
        else if (oneData) insertedParents.push({ id: (oneData as any).id, idx });
      }
    } else {
      // Batch insert preserves order, so map ids back to validRows index.
      insertedParents = (data ?? []).map((d: any, i: number) => ({ id: d.id, idx: valid[i].idx }));
    }

    // Optional link pass — if any row had a studentGrNumber, look up the
    // student in this org and create the parent_student link.
    let linkedCount = 0;
    for (const p of insertedParents) {
      const raw = body.rows[p.idx];
      const gr = (raw?.studentGrNumber ?? "").trim();
      if (!gr) continue;
      const { data: stu } = await serviceRoleClient
        .from("student")
        .select("id")
        .eq("org_id", orgId)
        .eq("gr_number", gr)
        .maybeSingle();
      if (!stu) {
        errors.push({ rowIndex: p.idx, message: `parent inserted but student GR ${gr} not found in this org` });
        continue;
      }
      const { error: linkErr } = await serviceRoleClient
        .from("student_parent")
        .upsert(
          { student_id: (stu as any).id, parent_id: p.id, is_primary: true, import_batch_id: batchId },
          { onConflict: "student_id,parent_id", ignoreDuplicates: false },
        );
      if (linkErr) errors.push({ rowIndex: p.idx, message: `parent inserted but link failed: ${linkErr.message}` });
      else linkedCount++;
    }

    await finalizeImportBatch(batchId, insertedParents.length);
    return c.json({ inserted: insertedParents.length, studentsLinked: linkedCount, errors, batchId });
  });

  school.post("/orgs/:orgId/student-parent", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.studentId || !body?.parentId) return c.json({ error: "studentId and parentId required" }, 400);

    // Verify both belong to this org.
    const [{ data: s }, { data: p }] = await Promise.all([
      serviceRoleClient.from("student").select("id").eq("id", body.studentId).eq("org_id", orgId).maybeSingle(),
      serviceRoleClient.from("parent").select("id").eq("id", body.parentId).eq("org_id", orgId).maybeSingle(),
    ]);
    if (!s || !p) return c.json({ error: "student or parent not found in this org" }, 404);

    const { error } = await serviceRoleClient
      .from("student_parent")
      .upsert(
        { student_id: body.studentId, parent_id: body.parentId, is_primary: body.isPrimary === true },
        { onConflict: "student_id,parent_id", ignoreDuplicates: true },
      );
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  school.delete("/orgs/:orgId/student-parent/:studentId/:parentId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const studentId = c.req.param("studentId");
    const parentId = c.req.param("parentId");
    const { error } = await serviceRoleClient
      .from("student_parent")
      .delete()
      .eq("student_id", studentId)
      .eq("parent_id", parentId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // TEACHERS LIST — returns class_teachers + visiting_teachers for the org
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/teachers", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);

    // Find user_role rows in this org with teacher-class templates.
    const { data: roleRows, error: rolesErr } = await serviceRoleClient
      .from("user_roles")
      .select("user_id, role_type, scope_type, scope_id")
      // Extended in feat/teachers-staff-detail-delete: include all four
       // non-principal/non-admin staff role types. Without this, office and
       // financial staff added via the same form silently vanish from the
       // list — they're stored correctly but the filter excluded them.
      .or(
        "role_type.eq.class_teacher,role_type.eq.visiting_teacher,role_type.eq.teacher,role_type.eq.financial_staff,role_type.eq.office_staff",
      )
      .is("revoked_at", null);
    if (rolesErr) return c.json({ error: rolesErr.message }, 500);

    // Filter rows scoped to this org (org-scoped roles) OR to a class_section
    // whose class belongs to this org. We resolve class scope through class_section.
    const orgScoped = (roleRows ?? []).filter(
      (r: any) => r.scope_type === "organization" && r.scope_id === orgId,
    );
    const classScoped = (roleRows ?? []).filter((r: any) => r.scope_type === "class");
    let classOwnedHere = new Set<string>();
    if (classScoped.length > 0) {
      const sectionIds = classScoped.map((r: any) => r.scope_id);
      const { data: sections } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .in("id", sectionIds);
      for (const s of sections ?? []) {
        const c2 = (s as any).class;
        if (c2 && c2.org_id === orgId) classOwnedHere.add(s.id);
      }
    }
    const inScope = [
      ...orgScoped,
      ...classScoped.filter((r: any) => classOwnedHere.has(r.scope_id)),
    ];

    // Dedupe to a unique set of (user_id, role_type) pairs and hydrate name+email.
    const seen = new Set<string>();
    const dedup: Array<{ user_id: string; role_type: string }> = [];
    for (const r of inScope) {
      const key = `${r.user_id}::${r.role_type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push({ user_id: r.user_id, role_type: r.role_type });
    }
    // Frontend AdminTeacher type expects `role_template` (and reads it
     // directly: t.role_template.replace(...)). Return both keys so the
     // page doesn't crash on undefined.replace().
    const out: Array<{ user_id: string; full_name: string; email: string; role_type: string; role_template: string }> = [];
    for (const d of dedup) {
      try {
        const { data: lookup } = await serviceRoleClient.auth.admin.getUserById(d.user_id);
        const u: any = lookup?.user;
        out.push({
          user_id: d.user_id,
          full_name: u?.user_metadata?.name || u?.email?.split("@")[0] || "Unknown",
          email: u?.email || "",
          role_type: d.role_type,
          role_template: d.role_type,
        });
      } catch {
        out.push({ user_id: d.user_id, full_name: "Unknown", email: "", role_type: d.role_type, role_template: d.role_type });
      }
    }
    return c.json({ teachers: out });
  });

  // -------------------------------------------------------------------------
  // TEACHER DETAIL — single staff member, hydrated for the admin detail
  // page. Returns role + email/name, plus every active assignment (org-
  // scoped roles plus class-scoped roles with their section/class names),
  // validity dates (visiting teachers), granted_at, and granted_by hydrated
  // to a name.
  //
  // Authz: any user with a role in the org may read; mutating endpoints
  // (delete, change role) are principal/admin gated separately.
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/teachers/:userId", async (c) => {
    const callerId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const targetUserId = c.req.param("userId");
    if (!(await hasAnyRoleInOrg(callerId, orgId))) return c.json({ error: "forbidden" }, 403);

    // All non-revoked role rows for this user. Filter to staff role types
    // AND to scope_ids belonging to THIS org so a user who happens to have
    // a role in a different school doesn't leak across orgs.
    const STAFF_ROLES = [
      "class_teacher", "visiting_teacher", "teacher",
      "financial_staff", "office_staff",
    ];
    const { data: rows, error } = await serviceRoleClient
      .from("user_roles")
      .select("id, role_type, scope_type, scope_id, granted_by, granted_at, valid_from, valid_until")
      .eq("user_id", targetUserId)
      .is("revoked_at", null)
      .in("role_type", STAFF_ROLES);
    if (error) return c.json({ error: error.message }, 500);

    // For class-scoped rows, resolve the section + class to confirm it
    // belongs to this org and to give the UI human-readable names.
    const classScopedIds = (rows ?? [])
      .filter((r: any) => r.scope_type === "class")
      .map((r: any) => r.scope_id);
    const sectionLookup = new Map<string, { sectionName: string; className: string; orgId: string }>();
    if (classScopedIds.length > 0) {
      const { data: sections } = await serviceRoleClient
        .from("class_section")
        .select("id, name, class:class_id(org_id, name)")
        .in("id", classScopedIds);
      for (const s of sections ?? []) {
        const cls: any = (s as any).class;
        if (cls) sectionLookup.set(s.id, { sectionName: (s as any).name, className: cls.name, orgId: cls.org_id });
      }
    }
    const assignments = (rows ?? [])
      .filter((r: any) => {
        if (r.scope_type === "organization") return r.scope_id === orgId;
        if (r.scope_type === "class") {
          const meta = sectionLookup.get(r.scope_id);
          return meta && meta.orgId === orgId;
        }
        return false;
      })
      .map((r: any) => ({
        id: r.id,
        roleType: r.role_type,
        scopeType: r.scope_type,
        scopeId: r.scope_id,
        sectionName: sectionLookup.get(r.scope_id)?.sectionName ?? null,
        className: sectionLookup.get(r.scope_id)?.className ?? null,
        grantedBy: r.granted_by,
        grantedAt: r.granted_at,
        validFrom: r.valid_from ?? null,
        validUntil: r.valid_until ?? null,
      }));

    if (assignments.length === 0) return c.json({ error: "not found" }, 404);

    // Hydrate target user + each granted_by user.
    let email = "", fullName = "";
    try {
      const { data: lookup } = await serviceRoleClient.auth.admin.getUserById(targetUserId);
      const u: any = lookup?.user;
      email = u?.email ?? "";
      fullName = u?.user_metadata?.name || email.split("@")[0] || "Unknown";
    } catch { /* leave blank */ }
    const granterIds = Array.from(new Set(assignments.map((a) => a.grantedBy).filter(Boolean)));
    const granterNames = new Map<string, string>();
    for (const id of granterIds) {
      try {
        const { data: lookup } = await serviceRoleClient.auth.admin.getUserById(id);
        const u: any = lookup?.user;
        granterNames.set(id, u?.user_metadata?.name || u?.email || "");
      } catch { /* leave blank */ }
    }
    const hydrated = assignments.map((a) => ({
      ...a,
      grantedByName: a.grantedBy ? (granterNames.get(a.grantedBy) ?? "") : null,
    }));

    return c.json({
      userId: targetUserId,
      email,
      fullName,
      // Primary role for badges — pick the first non-org-scoped if any,
      // else the org one. UI re-derives if it wants something different.
      primaryRole: hydrated[0].roleType,
      assignments: hydrated,
    });
  });

  // -------------------------------------------------------------------------
  // DELETE TEACHER (revoke staff access). Principal/admin only.
  //
  // Revokes ALL active staff-role rows for this user scoped to this org —
  // class_teacher, visiting_teacher, teacher (legacy), financial_staff,
  // office_staff. Org-scoped rows revoke directly; class-scoped rows are
  // filtered to sections whose class belongs to this org so we don't
  // accidentally revoke a role on a different school.
  //
  // We do NOT delete the auth.users row — the person may still need their
  // login for parent/family use, or for a different school they're staff at.
  // We also don't touch the 'admin' role here — admin removal goes through
  // DELETE /orgs/:orgId/admins/:userId which is principal-only.
  // -------------------------------------------------------------------------
  school.delete("/orgs/:orgId/teachers/:userId", async (c) => {
    const callerId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const targetUserId = c.req.param("userId");
    if (!(await requireAdminOrPrincipal(callerId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (targetUserId === callerId) {
      return c.json({ error: "You can't remove yourself from this list." }, 400);
    }

    const STAFF_ROLES = [
      "class_teacher", "visiting_teacher", "teacher",
      "financial_staff", "office_staff",
    ];

    // Org-scoped revocation in one update.
    const nowIso = new Date().toISOString();
    const { error: orgErr } = await serviceRoleClient
      .from("user_roles")
      .update({ revoked_at: nowIso })
      .eq("user_id", targetUserId)
      .in("role_type", STAFF_ROLES)
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null);
    if (orgErr) return c.json({ error: orgErr.message }, 500);

    // Class-scoped: find the user's class-scoped staff rows, then filter to
    // sections that belong to this org, then revoke.
    const { data: classRows } = await serviceRoleClient
      .from("user_roles")
      .select("id, scope_id")
      .eq("user_id", targetUserId)
      .in("role_type", STAFF_ROLES)
      .eq("scope_type", "class")
      .is("revoked_at", null);
    const classRoleIds: string[] = [];
    if (classRows && classRows.length > 0) {
      const sectionIds = classRows.map((r: any) => r.scope_id);
      const { data: sections } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .in("id", sectionIds);
      const orgSectionIds = new Set(
        (sections ?? [])
          .filter((s: any) => (s.class as any)?.org_id === orgId)
          .map((s: any) => s.id),
      );
      for (const r of classRows) {
        if (orgSectionIds.has((r as any).scope_id)) classRoleIds.push((r as any).id);
      }
    }
    if (classRoleIds.length > 0) {
      await serviceRoleClient
        .from("user_roles")
        .update({ revoked_at: nowIso })
        .in("id", classRoleIds);
    }

    await logAuditWithLookup({
      orgId,
      actorUserId: callerId,
      action: "remove_teacher",
      targetUserId: targetUserId,
      targetRole: "teacher",
    });
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // TEACHERS SINGLE — frontend addTeacher() helper calls this. Previously
  // missing; only the bulk endpoint existed, so the "+ Add Teacher" form
  // 404'd with "Route not found". Mirrors the admin POST flow: looks up
  // an existing auth user by email or creates one, grants the role row,
  // and sends a password-reset email so the invitee can set a password.
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/teachers", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.email || !body?.fullName) {
      return c.json({ error: "email and fullName required" }, 400);
    }
    const allowedTemplates: RoleTemplate[] = [
      "class_teacher",
      "visiting_teacher",
      "financial_staff",
      "office_staff",
    ];
    const roleTemplate: RoleTemplate = allowedTemplates.includes(body.roleTemplate)
      ? body.roleTemplate
      : "class_teacher";

    // PR F (Q5): validity dates. Required for visiting_teacher (contracts
    // are time-bounded by definition); optional for everything else.
    // Format: YYYY-MM-DD strings, or null.
    const isIsoDateOrNull = (v: unknown): v is string | null =>
      v === null || v === undefined || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
    if (!isIsoDateOrNull(body.validFrom) || !isIsoDateOrNull(body.validUntil)) {
      return c.json(
        { error: "validFrom / validUntil must be YYYY-MM-DD or omitted.", code: "BAD_VALIDITY_DATES" },
        400,
      );
    }
    if (roleTemplate === "visiting_teacher" && (!body.validFrom || !body.validUntil)) {
      return c.json(
        {
          error: "Visiting teachers require both validFrom and validUntil dates (their contract window).",
          code: "VISITING_TEACHER_DATES_REQUIRED",
        },
        400,
      );
    }
    if (body.validFrom && body.validUntil && body.validFrom > body.validUntil) {
      return c.json(
        { error: "validFrom must be on or before validUntil.", code: "VALIDITY_RANGE_INVALID" },
        400,
      );
    }

    let targetUserId: string | null = null;
    let wasCreated = false;
    const { data: listed } = await (serviceRoleClient as any).auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existing = (listed?.users ?? []).find(
      (u: any) => (u.email ?? "").toLowerCase() === body.email.toLowerCase(),
    );
    if (existing) {
      targetUserId = existing.id;
    } else {
      const randomPwd = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error } = await (serviceRoleClient as any).auth.admin.createUser({
        email: body.email,
        password: randomPwd,
        email_confirm: true,
        user_metadata: { name: body.fullName },
      });
      if (error || !created?.user) {
        return c.json({ error: error?.message ?? "could not create user" }, 500);
      }
      targetUserId = created.user.id;
      wasCreated = true;
    }

    // Dedupe: one user, one role per org. Reject if this user already
    // has any non-revoked role in this org — surfaces e.g. trying to add
    // the principal as a class_teacher, or re-adding the same teacher.
    const { data: existingRole } = await serviceRoleClient
      .from("user_roles")
      .select("role_type")
      .eq("user_id", targetUserId)
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();
    if (existingRole) {
      const existingType = (existingRole as any).role_type as string;
      const pretty = existingType.replace(/_/g, " ");
      return c.json(
        {
          error: `This user is already a ${pretty} of this school. Remove the existing role first if you want to change it.`,
          code: "ROLE_ALREADY_EXISTS",
          existingRole: existingType,
        },
        409,
      );
    }

    // Insert the role row. role_template_override is keyed by template name,
    // but the grant itself uses the role_type enum which only knows class_teacher
    // / visiting_teacher / financial_staff / office_staff. Org-scoped.
    // PR F (Q5): validity window stored on the role row itself.
    const { error: roleErr } = await serviceRoleClient.from("user_roles").insert({
      user_id: targetUserId,
      role_type: roleTemplate,
      scope_type: "organization",
      scope_id: orgId,
      granted_by: userId,
      valid_from: body.validFrom ?? null,
      valid_until: body.validUntil ?? null,
    });
    if (roleErr && (roleErr as any).code !== "23505") {
      return c.json({ error: roleErr.message }, 500);
    }

    let invited = false;
    if (wasCreated) {
      const siteOrigin = Deno.env.get("SITE_URL") || "https://iqraifs.com";
      // gotrue-js throws AuthApiError on 4xx (e.g. "email_address_invalid"
      // for addresses that fail Supabase's validator like ddd@gmail.com).
      // Catch it so a bad email doesn't 500 the whole request — the user
      // and role are already created at this point; the reset email is
      // just a convenience that the principal can resend later.
      try {
        const { error: resetErr } = await (serviceRoleClient as any).auth
          .resetPasswordForEmail(body.email, {
            redirectTo: `${siteOrigin}/reset-password`,
          });
        if (!resetErr) invited = true;
        else console.error("[invite] teacher reset email failed:", resetErr);
      } catch (e) {
        console.error("[invite] teacher reset email threw:", e);
      }
    }

    // Return the row in the same shape ManageTeachers expects so it can
    // optimistically render the new teacher into the list.
    await logAuditWithLookup({
      orgId,
      actorUserId: userId,
      action: "invite_teacher",
      targetUserId: targetUserId,
      targetEmail: body.email,
      targetRole: roleTemplate,
      details: { invitedCount: invited ? 1 : 0 },
    });
    return c.json({
      user_id: targetUserId,
      email: body.email,
      full_name: body.fullName,
      role_type: roleTemplate,
      invited,
      invitedCount: invited ? 1 : 0,
    }, 201);
  });

  // -------------------------------------------------------------------------
  // TEACHERS BULK
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/teachers/bulk", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.rows)) return c.json({ error: "rows[] required" }, 400);

    const batchId = await createImportBatch(orgId, "teachers", userId);
    const errors: Array<{ rowIndex: number; message: string }> = [];
    let inserted = 0;
    let updated = 0;
    let invitedCount = 0;
    const siteOrigin = Deno.env.get("SITE_URL") || "https://iqraifs.com";
    const validTemplates = new Set(["class_teacher", "visiting_teacher", "financial_staff", "office_staff"]);

    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] as TeacherRow;
      if (!r?.email || !r?.fullName || !r?.roleTemplate) {
        errors.push({ rowIndex: i, message: "email, fullName, roleTemplate required" });
        continue;
      }
      if (!validTemplates.has(r.roleTemplate as string)) {
        errors.push({ rowIndex: i, message: "roleTemplate must be class_teacher, visiting_teacher, financial_staff, or office_staff" });
        continue;
      }
      try {
        let targetUserId: string | null = null;
        let wasCreated = false;

        // Try to find an existing auth user by email.
        const { data: listed } = await (serviceRoleClient as any).auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = (listed?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === r.email.toLowerCase());

        if (existing) {
          targetUserId = existing.id;
        } else {
          const randomPwd = crypto.randomUUID() + crypto.randomUUID();
          const { data: created, error: createErr } = await (serviceRoleClient as any).auth.admin.createUser({
            email: r.email,
            password: randomPwd,
            email_confirm: true,
            user_metadata: { name: r.fullName },
          });
          if (createErr || !created?.user) {
            errors.push({ rowIndex: i, message: createErr?.message ?? "could not create auth user" });
            continue;
          }
          targetUserId = created.user.id;
          wasCreated = true;
        }

        const { error: roleErr } = await serviceRoleClient.from("user_roles").insert({
          user_id: targetUserId,
          role_type: r.roleTemplate,
          scope_type: "organization",
          scope_id: orgId,
          granted_by: userId,
          import_batch_id: batchId,
        });
        if (roleErr && (roleErr as any).code !== "23505") {
          errors.push({ rowIndex: i, message: roleErr.message });
          continue;
        }
        if (wasCreated) {
          inserted++;
          // Trigger password-reset email so the newly-created user can log in.
          // gotrue-js throws AuthApiError on 4xx — catch so a single bad email
          // doesn't fail the whole bulk row.
          try {
            const { error: resetErr } = await (serviceRoleClient as any).auth.resetPasswordForEmail(r.email, {
              redirectTo: `${siteOrigin}/reset-password`,
            });
            if (resetErr) {
              console.error("[invite] failed to send reset email:", resetErr);
            } else {
              invitedCount++;
            }
          } catch (e) {
            console.error("[invite] reset email threw:", e);
          }
        } else {
          updated++;
        }
      } catch (e: any) {
        errors.push({ rowIndex: i, message: e?.message ?? String(e) });
      }
    }

    await finalizeImportBatch(batchId, inserted + updated);
    return c.json({ inserted, updated, invitedCount, errors, batchId });
  });

  // -------------------------------------------------------------------------
  // ADMIN ROLE GRANT (principal-only)
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/admins", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isPrincipalOf(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.email || !body?.fullName) return c.json({ error: "email and fullName required" }, 400);

    let targetUserId: string | null = null;
    let wasCreated = false;
    const { data: listed } = await (serviceRoleClient as any).auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = (listed?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === body.email.toLowerCase());
    if (existing) {
      targetUserId = existing.id;
    } else {
      const randomPwd = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error } = await (serviceRoleClient as any).auth.admin.createUser({
        email: body.email,
        password: randomPwd,
        email_confirm: true,
        user_metadata: { name: body.fullName },
      });
      if (error || !created?.user) return c.json({ error: error?.message ?? "could not create user" }, 500);
      targetUserId = created.user.id;
      wasCreated = true;
    }

    // Dedupe: reject if this user already has any non-revoked role in
    // this org (principal, admin, teacher, etc.). Surfaces the case
    // where someone tries to add the principal as admin.
    const { data: existingRole } = await serviceRoleClient
      .from("user_roles")
      .select("role_type")
      .eq("user_id", targetUserId)
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();
    if (existingRole) {
      const existingType = (existingRole as any).role_type as string;
      const pretty = existingType.replace(/_/g, " ");
      return c.json(
        {
          error: `This user is already a ${pretty} of this school. They cannot also be admin.`,
          code: "ROLE_ALREADY_EXISTS",
          existingRole: existingType,
        },
        409,
      );
    }

    const { error: roleErr } = await serviceRoleClient.from("user_roles").insert({
      user_id: targetUserId,
      role_type: "admin",
      scope_type: "organization",
      scope_id: orgId,
      granted_by: userId,
    });
    if (roleErr && (roleErr as any).code !== "23505") return c.json({ error: roleErr.message }, 500);

    let invited = false;
    if (wasCreated) {
      const siteOrigin = Deno.env.get("SITE_URL") || "https://iqraifs.com";
      // gotrue-js throws AuthApiError on 4xx — catch so a bad email doesn't
      // 500 the whole request after the user/role are already created.
      try {
        const { error: resetErr } = await (serviceRoleClient as any).auth.resetPasswordForEmail(body.email, {
          redirectTo: `${siteOrigin}/reset-password`,
        });
        if (resetErr) {
          console.error("[invite] admin reset email failed:", resetErr);
        } else {
          invited = true;
        }
      } catch (e) {
        console.error("[invite] admin reset email threw:", e);
      }
    }
    // Return both the legacy `invited:boolean` and the count-style
    // `invitedCount` that the frontend reads — matches the bulk endpoint.
    await logAuditWithLookup({
      orgId,
      actorUserId: userId,
      action: "invite_admin",
      targetUserId: targetUserId,
      targetEmail: body.email,
      targetRole: "admin",
      details: { invitedCount: invited ? 1 : 0 },
    });
    return c.json(
      { userId: targetUserId, ok: true, invited, invitedCount: invited ? 1 : 0 },
      201,
    );
  });

  // -------------------------------------------------------------------------
  // RESEND INVITE — principal/admin can re-trigger the password-reset email
  // for any non-revoked staff member of this org. Useful when the original
  // email bounced, was filtered to spam, or Supabase's email validator
  // initially rejected the address (see PR #72: AuthApiError catch).
  //
  // Returns 200 with { ok: true, sent: boolean, reason?: string }. `sent`
  // false (with a reason) is NOT an error — the caller can surface a notice
  // and offer to share the reset link manually.
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/staff/:userId/resend-invite", async (c) => {
    const callerId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const targetUserId = c.req.param("userId");
    if (!(await requireAdminOrPrincipal(callerId, orgId))) {
      return c.json({ error: "forbidden", code: "FORBIDDEN_ROLE" }, 403);
    }

    // Confirm target actually has a non-revoked role in this org. Without
    // this check, an admin could spam reset emails to arbitrary user IDs.
    const { data: targetRole } = await serviceRoleClient
      .from("user_roles")
      .select("role_type")
      .eq("user_id", targetUserId)
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();
    if (!targetRole) {
      return c.json(
        { error: "User is not staff of this school.", code: "NOT_STAFF" },
        404,
      );
    }

    // Get target's email.
    const { data: lookup, error: lookupErr } = await (serviceRoleClient as any).auth.admin.getUserById(targetUserId);
    if (lookupErr || !lookup?.user?.email) {
      return c.json({ error: "User has no email on file.", code: "NO_EMAIL" }, 400);
    }
    const email = lookup.user.email as string;

    const siteOrigin = Deno.env.get("SITE_URL") || "https://iqraifs.com";
    try {
      const { error: resetErr } = await (serviceRoleClient as any).auth.resetPasswordForEmail(email, {
        redirectTo: `${siteOrigin}/reset-password`,
      });
      if (resetErr) {
        console.error("[invite] resend reset email failed:", resetErr);
        await logAuditWithLookup({
          orgId,
          actorUserId: callerId,
          action: "resend_invite",
          targetUserId: targetUserId,
          targetEmail: email,
          targetRole: (targetRole as any).role_type,
          details: { sent: false, reason: (resetErr as any)?.message ?? "rejected" },
        });
        return c.json({
          ok: true,
          sent: false,
          reason: (resetErr as any)?.message ?? "Email provider rejected the address.",
          email,
        });
      }
      await logAuditWithLookup({
        orgId,
        actorUserId: callerId,
        action: "resend_invite",
        targetUserId: targetUserId,
        targetEmail: email,
        targetRole: (targetRole as any).role_type,
        details: { sent: true },
      });
      return c.json({ ok: true, sent: true, email });
    } catch (e) {
      console.error("[invite] resend reset email threw:", e);
      await logAuditWithLookup({
        orgId,
        actorUserId: callerId,
        action: "resend_invite",
        targetUserId: targetUserId,
        targetEmail: email,
        targetRole: (targetRole as any).role_type,
        details: { sent: false, reason: e instanceof Error ? e.message : "throw" },
      });
      return c.json({
        ok: true,
        sent: false,
        reason: e instanceof Error ? e.message : "Email send failed.",
        email,
      });
    }
  });

  school.delete("/orgs/:orgId/admins/:userId", async (c) => {
    const callerId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const targetUserId = c.req.param("userId");
    if (!(await isPrincipalOf(callerId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { error } = await serviceRoleClient
      .from("user_roles")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", targetUserId)
      .eq("role_type", "admin")
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null);
    if (error) return c.json({ error: error.message }, 500);
    await logAuditWithLookup({
      orgId,
      actorUserId: callerId,
      action: "remove_admin",
      targetUserId: targetUserId,
      targetRole: "admin",
    });
    return c.json({ ok: true });
  });

  school.get("/orgs/:orgId/admins", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data, error } = await serviceRoleClient
      .from("user_roles")
      .select("user_id, granted_at")
      .eq("role_type", "admin")
      .eq("scope_type", "organization")
      .eq("scope_id", orgId)
      .is("revoked_at", null);
    if (error) return c.json({ error: error.message }, 500);

    // Hydrate emails / names from auth.users.
    // Use snake_case keys to match the frontend OrgAdmin type
    // ({ user_id, email, full_name }) — earlier camelCase shape
    // made admin rows render blank and "remove admin" no-op.
    const out: any[] = [];
    for (const row of data ?? []) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(row.user_id);
        out.push({
          user_id: row.user_id,
          email: u?.user?.email ?? "",
          full_name: u?.user?.user_metadata?.name ?? "",
          granted_at: row.granted_at,
        });
      } catch {
        out.push({ user_id: row.user_id, email: "", full_name: "", granted_at: row.granted_at });
      }
    }
    return c.json({ admins: out });
  });

  // -------------------------------------------------------------------------
  // PIN AUTH
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/pin/set", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const { subjectType, subjectId, pin } = body || {};
    if (subjectType !== "student" && subjectType !== "parent") {
      return c.json({ error: "subjectType must be student or parent" }, 400);
    }
    if (!subjectId) return c.json({ error: "subjectId required" }, 400);
    if (!isFourDigitPin(pin)) return c.json({ error: "pin must be exactly 4 digits" }, 400);

    // Look up the subject + derive login_identifier.
    let loginIdentifier = "";
    if (subjectType === "student") {
      const { data: s } = await serviceRoleClient
        .from("student").select("gr_number").eq("id", subjectId).eq("org_id", orgId).maybeSingle();
      if (!s) return c.json({ error: "student not found in this org" }, 404);
      loginIdentifier = s.gr_number;
    } else {
      const { data: p } = await serviceRoleClient
        .from("parent").select("phone").eq("id", subjectId).eq("org_id", orgId).maybeSingle();
      if (!p) return c.json({ error: "parent not found in this org" }, 404);
      if (!p.phone) return c.json({ error: "parent must have a phone before setting a PIN" }, 400);
      loginIdentifier = p.phone;
    }

    // Determine must_change: false if a row already exists (operator resetting),
    // true on first set.
    const { data: existing } = await serviceRoleClient
      .from("pin_credential").select("id")
      .eq("org_id", orgId).eq("subject_type", subjectType).eq("subject_id", subjectId)
      .maybeSingle();
    const mustChange = !existing;

    const pin_hash = await hashPin(pin);
    const { error } = await serviceRoleClient
      .from("pin_credential")
      .upsert(
        {
          org_id: orgId,
          subject_type: subjectType,
          subject_id: subjectId,
          login_identifier: loginIdentifier,
          pin_hash,
          must_change: mustChange,
          failed_attempts: 0,
          locked_until: null,
        },
        { onConflict: "org_id,subject_type,subject_id" },
      );
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, mustChange });
  });

  school.post("/orgs/:orgId/pin/reset", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const { subjectType, subjectId } = body || {};
    if (subjectType !== "student" && subjectType !== "parent") {
      return c.json({ error: "subjectType must be student or parent" }, 400);
    }
    if (!subjectId) return c.json({ error: "subjectId required" }, 400);

    let loginIdentifier = "";
    if (subjectType === "student") {
      const { data: s } = await serviceRoleClient
        .from("student").select("gr_number").eq("id", subjectId).eq("org_id", orgId).maybeSingle();
      if (!s) return c.json({ error: "student not found in this org" }, 404);
      loginIdentifier = s.gr_number;
    } else {
      const { data: p } = await serviceRoleClient
        .from("parent").select("phone").eq("id", subjectId).eq("org_id", orgId).maybeSingle();
      if (!p) return c.json({ error: "parent not found in this org" }, 404);
      if (!p.phone) return c.json({ error: "parent must have a phone before setting a PIN" }, 400);
      loginIdentifier = p.phone;
    }

    const rnd = crypto.getRandomValues(new Uint32Array(1))[0];
    const newPin = String(rnd % 10000).padStart(4, "0");
    const pin_hash = await hashPin(newPin);
    const { error } = await serviceRoleClient
      .from("pin_credential")
      .upsert(
        {
          org_id: orgId,
          subject_type: subjectType,
          subject_id: subjectId,
          login_identifier: loginIdentifier,
          pin_hash,
          must_change: true,
          failed_attempts: 0,
          locked_until: null,
        },
        { onConflict: "org_id,subject_type,subject_id" },
      );
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ pin: newPin });
  });

  // -------------------------------------------------------------------------
  // PR D #8: Student/parent self-change PIN.
  //
  // Mounted on the PIN-token auth path (the same auth that pin-login issues)
  // — see school.tsx pinAuth wrapper. The caller proves they hold the
  // current PIN via the token, then submits oldPin + newPin to rotate.
  //
  // Returns 401 if oldPin doesn't match, 400 if newPin malformed.
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/pin/change", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated", code: "UNAUTHENTICATED" }, 401);
    const orgId = c.req.param("orgId");

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const { subjectType, subjectId, oldPin, newPin } = body || {};

    if (subjectType !== "student" && subjectType !== "parent") {
      return c.json({ error: "subjectType must be student or parent" }, 400);
    }
    if (!subjectId) return c.json({ error: "subjectId required" }, 400);
    if (!isFourDigitPin(oldPin)) return c.json({ error: "oldPin must be 4 digits" }, 400);
    if (!isFourDigitPin(newPin)) return c.json({ error: "newPin must be 4 digits" }, 400);
    if (oldPin === newPin) return c.json({ error: "newPin must differ from oldPin" }, 400);

    // Load the credential row. The caller can only change their OWN PIN —
    // we verify by matching the JWT's user metadata (PIN token sub) to the
    // (org_id, subject_type, subject_id) tuple.
    const { data: cred } = await serviceRoleClient
      .from("pin_credential")
      .select("id, pin_hash")
      .eq("org_id", orgId)
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .maybeSingle();
    if (!cred) return c.json({ error: "no PIN on file", code: "NO_PIN" }, 404);

    const ok = await verifyPin(oldPin, (cred as any).pin_hash);
    if (!ok) return c.json({ error: "current PIN is incorrect", code: "BAD_PIN" }, 401);

    const newHash = await hashPin(newPin);
    const { error: updErr } = await serviceRoleClient
      .from("pin_credential")
      .update({ pin_hash: newHash, must_change: false, failed_attempts: 0, locked_until: null })
      .eq("id", (cred as any).id);
    if (updErr) return c.json({ error: updErr.message }, 500);

    return c.json({ ok: true });
  });

  // Public lookup so PortalLogin can render the school's name + logo +
  // motto before any sign-in. Mounted on a NO-AUTH path via the
  // PUBLIC_SCHOOL_PATHS allowlist in school.tsx. Returns nothing
  // sensitive — name, slug, logo URL, theme color, motto only.
  school.get("/auth/org-by-slug", async (c) => {
    const slug = c.req.query("slug")?.trim();
    if (!slug) return c.json({ error: "slug required" }, 400);
    const { data } = await serviceRoleClient
      .from("organizations")
      .select("id, name, slug, settings")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return c.json({ error: "organization not found" }, 404);
    const settings = ((data as any).settings ?? {}) as Record<string, unknown>;
    return c.json({
      id: (data as any).id,
      name: (data as any).name,
      slug: (data as any).slug,
      logoUrl: (settings.logo_url as string | undefined) ?? null,
      themeColor: (settings.theme_color as string | undefined) ?? null,
      motto: (settings.school_motto as string | undefined) ?? null,
    });
  });

  // NOTE: /auth/pin-login is mounted on a NO-AUTH path — see school.tsx
  // mounting glue. We define the handler here and the wrapper there
  // registers it in a way that skips the requireAuth middleware.
  school.post("/auth/pin-login", async (c) => {
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const { orgIdentifier, loginIdentifier, pin } = body || {};
    if (!orgIdentifier || !loginIdentifier || !pin) {
      return c.json({ error: "orgIdentifier, loginIdentifier, pin required" }, 400);
    }

    const { data: org } = await serviceRoleClient
      .from("organizations").select("id").eq("slug", orgIdentifier).maybeSingle();
    if (!org) return c.json({ error: "organization not found" }, 404);

    // Try the identifier exactly as supplied first; fall back to a
    // whitespace-stripped variant. Parent phones in the demo seed were
    // stored as '+92 300 1001001' but most users type '+923001001001'
    // — we want both to work. Student GR numbers (IDA-001) have no
    // spaces so the first lookup wins for them.
    const identifierCandidates = [loginIdentifier];
    const stripped = String(loginIdentifier).replace(/\s+/g, "");
    if (stripped !== loginIdentifier) identifierCandidates.push(stripped);

    let cred: any = null;
    for (const candidate of identifierCandidates) {
      const { data } = await serviceRoleClient
        .from("pin_credential")
        .select("*")
        .eq("org_id", org.id)
        .eq("login_identifier", candidate)
        .maybeSingle();
      if (data) {
        cred = data;
        break;
      }
    }
    // Final fallback: scan org-scoped credentials and match by
    // normalised identifier (strip all whitespace on both sides).
    // Slow but only fires when the exact-match path fails — fine for
    // demo orgs with < 100 credentials.
    if (!cred) {
      const { data: all } = await serviceRoleClient
        .from("pin_credential")
        .select("*")
        .eq("org_id", org.id);
      const wanted = stripped;
      cred =
        (all ?? []).find(
          (r: any) => String(r.login_identifier).replace(/\s+/g, "") === wanted,
        ) ?? null;
    }
    if (!cred) return c.json({ error: "invalid credentials" }, 401);

    if (cred.locked_until && new Date(cred.locked_until).getTime() > Date.now()) {
      return c.json({ error: "account locked, try again later", lockedUntil: cred.locked_until }, 423);
    }

    const ok = await verifyPin(pin, cred.pin_hash);
    if (!ok) {
      const failed = (cred.failed_attempts ?? 0) + 1;
      const updates: any = { failed_attempts: failed };
      if (failed >= 5) {
        updates.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        updates.failed_attempts = 0;
      }
      await serviceRoleClient.from("pin_credential").update(updates).eq("id", cred.id);
      return c.json({ error: "invalid credentials" }, 401);
    }

    await serviceRoleClient
      .from("pin_credential")
      .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
      .eq("id", cred.id);

    const exp = Math.floor(Date.now() / 1000) + PIN_TOKEN_TTL_SECONDS;
    const token = await makePinToken({
      subjectType: cred.subject_type,
      subjectId: cred.subject_id,
      orgId: org.id,
      exp,
    });
    return c.json({
      subjectType: cred.subject_type,
      subjectId: cred.subject_id,
      orgId: org.id,
      mustChange: cred.must_change,
      token,
    });
  });

  school.post("/auth/pin-change", async (c) => {
    // This route is mounted under the auth-required prefix. The family JWT
    // requireAuth wouldn't recognize a pin token, so we accept either:
    //   (a) the standard requireAuth user with an X-Pin-Token header, OR
    //   (b) the pin token in Authorization (Bearer pin.…).
    // Easiest implementation: read pin token from a dedicated header.
    const pinTokenHeader = c.req.header("X-Pin-Token") || "";
    const payload = await verifyPinToken(pinTokenHeader);
    if (!payload) return c.json({ error: "invalid pin token" }, 401);

    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const { subjectType, subjectId, currentPin, newPin } = body || {};
    if (subjectType !== payload.subjectType || subjectId !== payload.subjectId) {
      return c.json({ error: "token does not match subject" }, 403);
    }
    if (!isFourDigitPin(currentPin) || !isFourDigitPin(newPin)) {
      return c.json({ error: "currentPin and newPin must be 4 digits" }, 400);
    }

    const { data: cred } = await serviceRoleClient
      .from("pin_credential")
      .select("*")
      .eq("org_id", payload.orgId)
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .maybeSingle();
    if (!cred) return c.json({ error: "credential not found" }, 404);

    const ok = await verifyPin(currentPin, cred.pin_hash);
    if (!ok) return c.json({ error: "current pin is incorrect" }, 401);

    const pin_hash = await hashPin(newPin);
    await serviceRoleClient
      .from("pin_credential")
      .update({ pin_hash, must_change: false })
      .eq("id", cred.id);
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // LINK CODES
  // -------------------------------------------------------------------------
  school.post("/orgs/:orgId/link-codes", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.studentId) return c.json({ error: "studentId required" }, 400);

    const { data: s } = await serviceRoleClient
      .from("student").select("id").eq("id", body.studentId).eq("org_id", orgId).maybeSingle();
    if (!s) return c.json({ error: "student not found in this org" }, 404);

    const days = Math.max(1, Math.min(365, body.expiresInDays ?? 30));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    let lastErr: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateLinkCode();
      const { data, error } = await serviceRoleClient
        .from("link_code")
        .insert({
          org_id: orgId,
          student_id: body.studentId,
          code,
          expires_at: expiresAt,
          created_by: userId,
        })
        .select()
        .single();
      if (!error) return c.json({ code: data.code, expiresAt: data.expires_at }, 201);
      if ((error as any).code !== "23505") {
        return c.json({ error: error.message }, 500);
      }
      lastErr = error;
    }
    return c.json({ error: "could not generate unique code", details: lastErr?.message }, 500);
  });

  school.get("/orgs/:orgId/link-codes", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const studentId = c.req.query("studentId");
    const unusedOnly = c.req.query("unusedOnly") === "true";
    let q = serviceRoleClient.from("link_code").select("*").eq("org_id", orgId);
    if (studentId) q = q.eq("student_id", studentId);
    if (unusedOnly) q = q.is("consumed_at", null);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ linkCodes: data ?? [] });
  });

  school.post("/link-codes/consume", async (c) => {
    const userId = getAuthUserId(c);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!body?.code || typeof body.code !== "string") return c.json({ error: "code required" }, 400);

    const { data: row, error } = await serviceRoleClient
      .from("link_code")
      .select("*, student:student_id(id, full_name, org_id)")
      .eq("code", body.code.trim())
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!row) return c.json({ error: "code not found" }, 404);
    if (row.consumed_at) return c.json({ error: "code already used" }, 410);
    if (new Date(row.expires_at).getTime() < Date.now()) return c.json({ error: "code expired" }, 410);

    const studentOrgId = (row.student as any)?.org_id ?? row.org_id;

    const { error: updErr } = await serviceRoleClient
      .from("link_code")
      .update({ consumed_at: new Date().toISOString(), consumed_by: userId })
      .eq("id", row.id);
    if (updErr) return c.json({ error: updErr.message }, 500);

    // PR F (Q3): smart multi-child linking on the school side.
    //
    // If this same parent (matched by authenticated EMAIL within this org)
    // already has a `parent` row, attach the new student to that row via
    // student_parent. This way a parent redeeming a second code for their
    // sibling automatically gets multi-child access without an admin
    // having to merge anything.
    //
    // Safeguard: matching is only by the auth-verified email from the JWT,
    // never by a value the caller submits in the body. This is what stops
    // an admin from accidentally granting parent A access to parent B's
    // children by typing the wrong email in an admin form (a separate
    // safeguard in the admin /parents POST path also blocks duplicate
    // emails).
    let parentId: string | null = null;
    try {
      const { data: lookup } = await (serviceRoleClient as any).auth.admin.getUserById(userId);
      const callerEmail = (lookup?.user?.email ?? "").toLowerCase();
      if (callerEmail) {
        // Match by email in the same org.
        const { data: existingParent } = await serviceRoleClient
          .from("parent")
          .select("id")
          .eq("org_id", studentOrgId)
          .ilike("email", callerEmail)
          .maybeSingle();
        if (existingParent) {
          parentId = (existingParent as any).id;
        } else {
          // No parent row in this org yet → create one. Name comes from auth
          // user_metadata or falls back to the local-part.
          const displayName =
            (lookup?.user?.user_metadata?.name as string | undefined) ||
            callerEmail.split("@")[0] ||
            "Parent";
          const { data: created } = await serviceRoleClient
            .from("parent")
            .insert({ org_id: studentOrgId, full_name: displayName, email: callerEmail })
            .select("id")
            .single();
          if (created) parentId = (created as any).id;
        }

        if (parentId) {
          await serviceRoleClient
            .from("student_parent")
            .upsert(
              { student_id: row.student_id, parent_id: parentId, is_primary: false },
              { onConflict: "student_id,parent_id", ignoreDuplicates: true },
            );
        }
      }
    } catch (e) {
      console.error("[link-codes/consume] parent auto-link failed:", e);
      // Non-fatal: the link-code is consumed and the family-app side bind
      // still works. The principal can manually link the parent later.
    }

    return c.json({
      studentId: row.student_id,
      orgId: studentOrgId,
      studentName: (row.student as any)?.full_name ?? null,
      parentId, // null if email lookup failed; UI can ignore
    });
  });

  // -------------------------------------------------------------------------
  // PERMISSION TEMPLATES
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/permissions", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data: overrides, error } = await serviceRoleClient
      .from("role_template_override").select("*").eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);

    const overrideMap = new Map<string, boolean>();
    for (const o of overrides ?? []) {
      overrideMap.set(`${o.role_template}::${o.permission_key}`, o.allowed);
    }
    const result: Array<{ roleTemplate: RoleTemplate; permissionKey: PermissionKey; allowed: boolean }> = [];
    for (const rt of Object.keys(DEFAULT_PERMISSIONS) as RoleTemplate[]) {
      for (const pk of PERMISSION_KEYS) {
        const key = `${rt}::${pk}`;
        const allowed = overrideMap.has(key) ? !!overrideMap.get(key) : DEFAULT_PERMISSIONS[rt][pk];
        result.push({ roleTemplate: rt, permissionKey: pk, allowed });
      }
    }
    return c.json({ permissions: result });
  });

  school.patch("/orgs/:orgId/permissions", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isPrincipalOf(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    if (!Array.isArray(body?.overrides)) return c.json({ error: "overrides[] required" }, 400);

    const validTemplates = new Set(Object.keys(DEFAULT_PERMISSIONS));
    const validKeys = new Set(PERMISSION_KEYS);
    const rows: any[] = [];
    for (const o of body.overrides) {
      if (!validTemplates.has(o.roleTemplate)) return c.json({ error: `invalid roleTemplate: ${o.roleTemplate}` }, 400);
      if (!validKeys.has(o.permissionKey)) return c.json({ error: `invalid permissionKey: ${o.permissionKey}` }, 400);
      if (typeof o.allowed !== "boolean") return c.json({ error: "allowed must be boolean" }, 400);
      rows.push({
        org_id: orgId,
        role_template: o.roleTemplate,
        permission_key: o.permissionKey,
        allowed: o.allowed,
      });
    }
    if (rows.length === 0) return c.json({ ok: true, updated: 0 });

    const { error } = await serviceRoleClient
      .from("role_template_override")
      .upsert(rows, { onConflict: "org_id,role_template,permission_key" });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, updated: rows.length });
  });

  // ─── Import batches: list + rollback ────────────────────────────────────
  // Drives the "Recent imports" section + Undo button on the Import
  // Center page. Rollback is gated to admin/principal AND to within 7
  // days of the import — older batches need manual DB cleanup so a
  // mistake long after the fact doesn't wipe a term's worth of
  // attendance.
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/import-batches", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data, error } = await serviceRoleClient
      .from("import_batch")
      .select("id, entity_type, created_by, row_count, rolled_back_at, rolled_back_by, created_at, notes")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return c.json({ error: error.message }, 500);

    // Hydrate auth names so the UI doesn't need a second round trip.
    const userIds = Array.from(
      new Set(
        ((data ?? []) as any[])
          .flatMap((r) => [r.created_by, r.rolled_back_by])
          .filter((x): x is string => !!x),
      ),
    );
    const nameMap = new Map<string, string>();
    for (const uid of userIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(uid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) nameMap.set(uid, name);
      } catch { /* ignore */ }
    }
    const batches = (data ?? []).map((r: any) => ({
      id: r.id,
      entityType: r.entity_type,
      rowCount: r.row_count,
      createdAt: r.created_at,
      createdByName: r.created_by ? nameMap.get(r.created_by) ?? null : null,
      rolledBackAt: r.rolled_back_at,
      rolledBackByName: r.rolled_back_by ? nameMap.get(r.rolled_back_by) ?? null : null,
      notes: r.notes,
    }));
    return c.json({ batches });
  });

  school.post("/orgs/:orgId/import-batches/:batchId/rollback", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const batchId = c.req.param("batchId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: batch } = await serviceRoleClient
      .from("import_batch")
      .select("id, org_id, entity_type, created_at, rolled_back_at")
      .eq("id", batchId)
      .maybeSingle();
    if (!batch) return c.json({ error: "batch not found" }, 404);
    if ((batch as any).org_id !== orgId) return c.json({ error: "batch not in this org" }, 404);
    if ((batch as any).rolled_back_at) {
      return c.json({ error: "batch was already rolled back" }, 409);
    }

    // Lock rollback to 7 days. After that, the migration data is
    // probably load-bearing and an undo would be too destructive to
    // run via a UI button.
    const ageMs = Date.now() - new Date((batch as any).created_at).getTime();
    const ROLLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    if (ageMs > ROLLBACK_WINDOW_MS) {
      return c.json(
        { error: "rollback is locked after 7 days — contact support to remove records older than this" },
        409,
      );
    }

    // Delete leaves-first so FK cascades don't surprise us. Each table
    // is scoped to org_id as a defense-in-depth check.
    const tables: Array<{ name: string; orgCol: string | null }> = [
      { name: "school_attendance", orgCol: "org_id" },
      { name: "fee_status",        orgCol: "org_id" },
      { name: "hifz_progress",     orgCol: "org_id" },
      { name: "user_roles",        orgCol: null },     // org filtered via scope_id
      { name: "student_parent",    orgCol: null },     // no org_id col; FK cleanup
      { name: "student",           orgCol: "org_id" },
      { name: "parent",            orgCol: "org_id" },
      { name: "class_subject",     orgCol: "org_id" },
      { name: "class_section",     orgCol: null },     // FK to class restricted to org
      { name: "class",             orgCol: "org_id" },
    ];
    const removedCounts: Record<string, number> = {};
    for (const t of tables) {
      try {
        let q = serviceRoleClient.from(t.name).delete().eq("import_batch_id", batchId);
        if (t.orgCol) q = q.eq(t.orgCol, orgId);
        const { count, error: delErr } = await (q as any).select("id", { count: "exact" });
        if (delErr) {
          // Don't bail — record and continue. Most likely cause is a
          // FK that's already removed something we wanted to clean.
          console.error(`[rollback] ${t.name} failed:`, delErr.message);
          continue;
        }
        if (count) removedCounts[t.name] = count;
      } catch (e) {
        console.error(`[rollback] ${t.name} threw:`, e);
      }
    }

    await serviceRoleClient
      .from("import_batch")
      .update({ rolled_back_at: new Date().toISOString(), rolled_back_by: userId })
      .eq("id", batchId);

    return c.json({ ok: true, removed: removedCounts });
  });

  // ─── Hifz Groups (PR feat/hifz-groups) ──────────────────────────────────
  // Hifz groups are peers of class_section. Each group has its own
  // teacher (independent of the class teacher), and students belong to
  // exactly one group at a time (v1). Used by Hifz-only schools and by
  // mixed schools running a Hifz-track alongside the conventional one.
  // -------------------------------------------------------------------------
  school.get("/orgs/:orgId/hifz-groups", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data, error } = await serviceRoleClient
      .from("hifz_group")
      .select("id, name, description, hifz_teacher_user_id, display_order, archived_at")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);

    // Hydrate teacher names + per-group student counts so the admin
    // list reads at a glance.
    const teacherIds = Array.from(
      new Set(((data ?? []) as any[])
        .map((g) => g.hifz_teacher_user_id)
        .filter((x): x is string => !!x)),
    );
    const teacherNames = new Map<string, string>();
    for (const tid of teacherIds) {
      try {
        const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(tid);
        const name = u?.user?.user_metadata?.name || u?.user?.email || "";
        if (name) teacherNames.set(tid, name);
      } catch { /* ignore */ }
    }
    const groupIds = ((data ?? []) as any[]).map((g) => g.id);
    const studentCount = new Map<string, number>();
    if (groupIds.length > 0) {
      const { data: stuRows } = await serviceRoleClient
        .from("student")
        .select("hifz_group_id")
        .in("hifz_group_id", groupIds);
      for (const s of (stuRows ?? []) as any[]) {
        const gid = s.hifz_group_id as string;
        studentCount.set(gid, (studentCount.get(gid) ?? 0) + 1);
      }
    }
    const groups = ((data ?? []) as any[]).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      hifzTeacherUserId: g.hifz_teacher_user_id,
      hifzTeacherName: g.hifz_teacher_user_id
        ? teacherNames.get(g.hifz_teacher_user_id) ?? null
        : null,
      displayOrder: g.display_order,
      studentCount: studentCount.get(g.id) ?? 0,
    }));
    return c.json({ groups });
  });

  school.post("/orgs/:orgId/hifz-groups", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name required" }, 400);
    const { data, error } = await serviceRoleClient
      .from("hifz_group")
      .insert({
        org_id: orgId,
        name,
        description: typeof body?.description === "string" ? body.description.trim() : null,
        hifz_teacher_user_id: body?.hifzTeacherUserId ?? null,
        display_order: typeof body?.displayOrder === "number" ? body.displayOrder : 0,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a Hifz group with that name already exists" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json(data, 201);
  });

  school.patch("/orgs/:orgId/hifz-groups/:groupId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const groupId = c.req.param("groupId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }
    const patch: Record<string, unknown> = {};
    if (typeof body?.name === "string") patch.name = body.name.trim();
    if ("description" in (body ?? {})) {
      patch.description = typeof body.description === "string"
        ? body.description.trim() || null
        : null;
    }
    if ("hifzTeacherUserId" in (body ?? {})) {
      patch.hifz_teacher_user_id = body.hifzTeacherUserId ?? null;
    }
    if (typeof body?.displayOrder === "number") patch.display_order = body.displayOrder;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);

    const { data: existing } = await serviceRoleClient
      .from("hifz_group").select("org_id").eq("id", groupId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "group not found" }, 404);
    }
    const { data, error } = await serviceRoleClient
      .from("hifz_group").update(patch).eq("id", groupId).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  });

  // Soft-archive (set archived_at) so historical Hifz log references
  // remain readable. Students remain linked but the group disappears
  // from dropdowns + counters.
  school.delete("/orgs/:orgId/hifz-groups/:groupId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const groupId = c.req.param("groupId");
    if (!(await requireAdminOrPrincipal(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: existing } = await serviceRoleClient
      .from("hifz_group").select("org_id").eq("id", groupId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "group not found" }, 404);
    }
    const { error } = await serviceRoleClient
      .from("hifz_group")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", groupId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}
