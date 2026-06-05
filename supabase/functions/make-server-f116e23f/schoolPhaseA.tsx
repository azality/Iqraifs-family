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
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
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
}

export interface ParentRow {
  fullName: string;
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
    },
  };
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
      .insert({
        org_id: orgId,
        gr_number: v.row.grNumber,
        full_name: v.row.fullName,
        class_section_id: v.row.classSectionId ?? null,
        photo_url: v.row.photoUrl ?? null,
        date_of_birth: v.row.dateOfBirth ?? null,
        gender: v.row.gender ?? null,
        guardian_phone: v.row.guardianPhone ?? null,
        guardian_email: v.row.guardianEmail ?? null,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") {
        return c.json({ error: "a student with this GR number already exists" }, 409);
      }
      return c.json({ error: error.message }, 500);
    }
    return c.json(data, 201);
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

    const payload = validRows.map(({ row }) => ({
      org_id: orgId,
      gr_number: row.grNumber,
      full_name: row.fullName,
      class_section_id: row.classSectionId ?? null,
      photo_url: row.photoUrl ?? null,
      date_of_birth: row.dateOfBirth ?? null,
      gender: row.gender ?? null,
      guardian_phone: row.guardianPhone ?? null,
      guardian_email: row.guardianEmail ?? null,
    }));

    const { data, error } = await serviceRoleClient
      .from("student").insert(payload).select("id, gr_number");
    if (error) {
      // Fall back to per-row inserts so we can report partial success.
      let inserted = 0;
      for (const { idx, row } of validRows) {
        const { error: rowErr } = await serviceRoleClient.from("student").insert({
          org_id: orgId,
          gr_number: row.grNumber,
          full_name: row.fullName,
          class_section_id: row.classSectionId ?? null,
          photo_url: row.photoUrl ?? null,
          date_of_birth: row.dateOfBirth ?? null,
          gender: row.gender ?? null,
          guardian_phone: row.guardianPhone ?? null,
          guardian_email: row.guardianEmail ?? null,
        });
        if (rowErr) {
          errors.push({ rowIndex: idx, message: rowErr.message });
        } else {
          inserted++;
        }
      }
      return c.json({ inserted, errors });
    }
    return c.json({ inserted: data?.length ?? 0, errors });
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

    const payload = valid.map(({ row }) => ({
      org_id: orgId,
      full_name: row.fullName,
      phone: row.phone ?? null,
      email: row.email ?? null,
      relationship: row.relationship ?? null,
    }));
    const { data, error } = await serviceRoleClient.from("parent").insert(payload).select("id");
    if (error) {
      let inserted = 0;
      for (const { idx, row } of valid) {
        const { error: rowErr } = await serviceRoleClient.from("parent").insert({
          org_id: orgId,
          full_name: row.fullName,
          phone: row.phone ?? null,
          email: row.email ?? null,
          relationship: row.relationship ?? null,
        });
        if (rowErr) errors.push({ rowIndex: idx, message: rowErr.message });
        else inserted++;
      }
      return c.json({ inserted, errors });
    }
    return c.json({ inserted: data?.length ?? 0, errors });
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
      .or("role_type.eq.class_teacher,role_type.eq.visiting_teacher,role_type.eq.teacher")
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

    return c.json({ inserted, updated, invitedCount, errors });
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

    const { data: cred } = await serviceRoleClient
      .from("pin_credential")
      .select("*")
      .eq("org_id", org.id)
      .eq("login_identifier", loginIdentifier)
      .maybeSingle();
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
}
