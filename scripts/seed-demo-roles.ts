// DEMO ACCOUNTS — one login per staff role + parent/student portal PINs,
// for principal QA walkthroughs (requested Sep 4 2026).
//
// SAFE BY CONSTRUCTION: every write lands in the Sandbox class (excluded
// from all dashboards/rollups via withoutSandbox) on a NEW section "B",
// so no real student, teacher slot, or register is touched, and the
// qa-* regression accounts on Sandbox A are left alone.
//
// Creates (idempotent — safe to re-run; re-running resets passwords/PINs):
//   demo.admin@azality.com            DemoAdmin2026!    admin (org)
//   demo.classteacher@azality.com     DemoTeacher2026!  class teacher of Sandbox B
//   demo.visitingteacher@azality.com  DemoVisit2026!    visiting teacher on Sandbox B
//   demo.office@azality.com           DemoOffice2026!   office staff (org)
//   demo.finance@azality.com          DemoFinance2026!  finance staff (org)
//   DEMO PARENT   phone 03110000001   PIN 1234          linked to both demo students
//   DEMO STUDENT  GR DEMO-1           PIN 1234          Sandbox B
//   DEMO STUDENT TWO  GR DEMO-2       (no PIN — second child on the parent card)
//
//   npx deno run --allow-net --allow-env --env=.env scripts/seed-demo-roles.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) as any;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const ORG_SLUG = "iqra-ifs";
const SANDBOX_CLASS = "2a429c88-3245-4e05-ba54-1d5e848582e8";
const PIN = "1234";

// ── PIN hashing — mirrors schoolPhaseA.tsx hashPin exactly ──────────────
const PIN_ITERATIONS = 100_000;
function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PIN_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256,
  );
  return `pbkdf2$${PIN_ITERATIONS}$${b64encode(salt)}$${b64encode(new Uint8Array(bits))}`;
}

// ── Auth users ──────────────────────────────────────────────────────────
const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
async function ensureUser(email: string, name: string, password: string): Promise<string> {
  let user = listed.users.find((x: any) => (x.email ?? "").toLowerCase() === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name },
      // Script-created staff MUST carry signupIntent or they bounce to
      // family onboarding (learned Sep 3 with demo.incharge).
      app_metadata: { signupIntent: "school" },
    });
    if (error) { console.error(`createUser ${email}:`, error.message); Deno.exit(1); }
    user = data.user;
    console.log(`created ${email}`);
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      password, app_metadata: { signupIntent: "school", must_change_password: false },
    });
    console.log(`exists ${email} — password reset`);
  }
  return user.id;
}

async function ensureRole(userId: string, roleType: string, scopeType: string, scopeId: string) {
  const { data: row } = await admin.from("user_roles").select("id, revoked_at")
    .eq("user_id", userId).eq("role_type", roleType)
    .eq("scope_type", scopeType).eq("scope_id", scopeId).maybeSingle();
  if (!row) {
    const { error } = await admin.from("user_roles").insert({
      user_id: userId, role_type: roleType, scope_type: scopeType,
      scope_id: scopeId, granted_by: userId,
    });
    if (error) { console.error(`role ${roleType}:`, error.message); Deno.exit(1); }
    console.log(`granted ${roleType}`);
  } else if (row.revoked_at) {
    await admin.from("user_roles").update({ revoked_at: null }).eq("id", row.id);
    console.log(`un-revoked ${roleType}`);
  }
}

const adminId = await ensureUser("demo.admin@azality.com", "DEMO ADMIN", "DemoAdmin2026!");
await ensureRole(adminId, "admin", "organization", ORG);

const ctId = await ensureUser("demo.classteacher@azality.com", "DEMO CLASS TEACHER", "DemoTeacher2026!");
await ensureRole(ctId, "class_teacher", "organization", ORG);

const vtId = await ensureUser("demo.visitingteacher@azality.com", "DEMO VISITING TEACHER", "DemoVisit2026!");

const offId = await ensureUser("demo.office@azality.com", "DEMO OFFICE STAFF", "DemoOffice2026!");
await ensureRole(offId, "office_staff", "organization", ORG);

const finId = await ensureUser("demo.finance@azality.com", "DEMO FINANCE STAFF", "DemoFinance2026!");
await ensureRole(finId, "financial_staff", "organization", ORG);

// ── Sandbox B section, class-taught by the demo class teacher ───────────
let { data: secB } = await admin.from("class_section").select("id, class_teacher_user_id")
  .eq("class_id", SANDBOX_CLASS).eq("name", "B").maybeSingle();
if (!secB) {
  // schedule_key 'sandbox' keeps this section out of every dashboard
  // rollup (withoutSandbox filters on it, NOT on the class name).
  const { data: ins, error } = await admin.from("class_section")
    .insert({ class_id: SANDBOX_CLASS, name: "B", class_teacher_user_id: ctId, schedule_key: "sandbox" })
    .select("id, class_teacher_user_id").single();
  if (error) { console.error("section B:", error.message); Deno.exit(1); }
  secB = ins;
  console.log("created Sandbox B");
} else if (secB.class_teacher_user_id !== ctId) {
  await admin.from("class_section").update({ class_teacher_user_id: ctId }).eq("id", secB.id);
  console.log("re-pointed Sandbox B class teacher");
}

// Visiting teacher: live rows use scope_type 'organization' with the
// SECTION id as scope (matches Rizwan's real rows) — mirror that shape.
await ensureRole(vtId, "visiting_teacher", "organization", secB.id);

// ── Demo subject on Sandbox, taught on B by the class teacher ──────────
let { data: cs } = await admin.from("class_subject").select("id")
  .eq("class_id", SANDBOX_CLASS).eq("name", "DEMO — General").maybeSingle();
if (!cs) {
  const { data: ins, error } = await admin.from("class_subject").insert({
    org_id: ORG, class_id: SANDBOX_CLASS, name: "DEMO — General", sort_order: 98,
  }).select("id").single();
  if (error) { console.error("class_subject:", error.message); Deno.exit(1); }
  cs = ins;
  console.log("created DEMO — General subject");
}
const { data: ss } = await admin.from("section_subject").select("id, teacher_user_id")
  .eq("class_section_id", secB.id).eq("class_subject_id", cs.id).maybeSingle();
if (!ss) {
  let { error } = await admin.from("section_subject").insert({
    org_id: ORG, class_section_id: secB.id, class_subject_id: cs.id,
    name: "DEMO — General", teacher_user_id: ctId, sort_order: 98,
  });
  if (error && /org_id|sort_order/.test(error.message)) {
    ({ error } = await admin.from("section_subject").insert({
      class_section_id: secB.id, class_subject_id: cs.id,
      name: "DEMO — General", teacher_user_id: ctId,
    }));
  }
  if (error) { console.error("section_subject:", error.message); Deno.exit(1); }
  console.log("assigned subject on B");
}

// ── Demo students in Sandbox B ─────────────────────────────────────────
async function ensureStudent(gr: string, name: string): Promise<string> {
  const { data: s } = await admin.from("student").select("id, class_section_id, status")
    .eq("org_id", ORG).eq("gr_number", gr).maybeSingle();
  if (s) {
    if (s.class_section_id !== secB.id || s.status !== "active") {
      await admin.from("student").update({ class_section_id: secB.id, status: "active" }).eq("id", s.id);
    }
    return s.id;
  }
  const { data: ins, error } = await admin.from("student").insert({
    org_id: ORG, class_section_id: secB.id, gr_number: gr, full_name: name, status: "active",
  }).select("id").single();
  if (error) { console.error(`student ${gr}:`, error.message); Deno.exit(1); }
  console.log(`created ${name} (${gr})`);
  return ins.id;
}
const stu1 = await ensureStudent("DEMO-1", "DEMO STUDENT");
const stu2 = await ensureStudent("DEMO-2", "DEMO STUDENT TWO");

// ── Demo parent + links ────────────────────────────────────────────────
const PHONE = "03110000001";
let { data: par } = await admin.from("parent").select("id, phone")
  .eq("org_id", ORG).eq("full_name", "DEMO PARENT").maybeSingle();
if (!par) {
  const { data: ins, error } = await admin.from("parent").insert({
    org_id: ORG, full_name: "DEMO PARENT", phone: PHONE, relationship: "guardian",
  }).select("id, phone").single();
  if (error) { console.error("parent:", error.message); Deno.exit(1); }
  par = ins;
  console.log("created DEMO PARENT");
} else if (par.phone !== PHONE) {
  await admin.from("parent").update({ phone: PHONE }).eq("id", par.id);
}
for (const sid of [stu1, stu2]) {
  const { data: link } = await admin.from("student_parent").select("student_id")
    .eq("student_id", sid).eq("parent_id", par.id).maybeSingle();
  if (!link) {
    const { error } = await admin.from("student_parent").insert({
      student_id: sid, parent_id: par.id, is_primary: true,
    });
    if (error) { console.error("link:", error.message); Deno.exit(1); }
  }
}
console.log("parent linked to both students");

// ── PINs (must_change=false: stable demo credentials by design) ────────
async function setPin(subjectType: string, subjectId: string, loginIdentifier: string) {
  const pin_hash = await hashPin(PIN);
  const { error } = await admin.from("pin_credential").upsert({
    org_id: ORG, subject_type: subjectType, subject_id: subjectId,
    login_identifier: loginIdentifier, pin_hash, must_change: false,
    failed_attempts: 0, locked_until: null,
  }, { onConflict: "org_id,subject_type,subject_id" });
  if (error) { console.error(`pin ${subjectType}:`, error.message); Deno.exit(1); }
  console.log(`PIN set for ${subjectType} ${loginIdentifier}`);
}
await setPin("parent", par.id, PHONE);
await setPin("student", stu1, "DEMO-1");

// ── Verify every login end-to-end ──────────────────────────────────────
const anon = createClient(URL_, ANON) as any;
for (const [email, pw] of [
  ["demo.admin@azality.com", "DemoAdmin2026!"],
  ["demo.classteacher@azality.com", "DemoTeacher2026!"],
  ["demo.visitingteacher@azality.com", "DemoVisit2026!"],
  ["demo.office@azality.com", "DemoOffice2026!"],
  ["demo.finance@azality.com", "DemoFinance2026!"],
]) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: pw });
  console.log(`sign-in ${email}: ${error ? "FAIL " + error.message : "ok"}`);
  if (data?.session) await anon.auth.signOut();
}
for (const ident of [PHONE, "DEMO-1"]) {
  const r = await fetch(`${URL_}/functions/v1/make-server-f116e23f/school/auth/pin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ orgIdentifier: ORG_SLUG, loginIdentifier: ident, pin: PIN }),
  });
  console.log(`pin-login ${ident}: ${r.status}`);
}
console.log("DONE");
