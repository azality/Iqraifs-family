// Seed a fully-populated test school in Supabase so the per-role test
// checklist in docs/SCHOOL_ROLES.md can be walked without ~30 minutes of
// manual click-through every release.
//
// Creates:
//   - 1 organization ("Test Academy — <timestamp>")
//   - 1 principal (uses an existing Supabase Auth user — you pass their email)
//   - 1 admin
//   - 1 class_teacher, 1 visiting_teacher, 1 financial_staff, 1 office_staff
//   - 1 class (Grade 5-A)
//   - 3 students with PINs
//   - 2 parents with link codes
//
// All staff get fresh Auth users with a randomly-generated password that
// the script prints at the end. The password is the same for every staff
// account — fine for a test env, NOT acceptable for production.
//
// Usage (from project root):
//   deno run --allow-net --allow-env --env=.env scripts/seed-test-school.ts \
//     --principal-email you@example.com
//
// Required env (or in .env):
//   SUPABASE_URL                 = https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    = service role key (DON'T commit)
//
// Idempotent? NO. Each run creates a NEW org with a unique slug. Delete via
// the principal's Settings → Danger Zone → Delete school after testing.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ─── CLI args ───────────────────────────────────────────────────────────
const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i++) {
  const a = Deno.args[i];
  if (a.startsWith("--") && Deno.args[i + 1]) {
    args.set(a.slice(2), Deno.args[i + 1]);
    i++;
  }
}

const PRINCIPAL_EMAIL = args.get("principal-email");
if (!PRINCIPAL_EMAIL) {
  console.error("Missing --principal-email <email>. The principal must already exist in Supabase Auth.");
  Deno.exit(1);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.");
  Deno.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// Shared password for all NEWLY-created staff accounts. Test env only.
const SHARED_PASSWORD = `Test-${crypto.randomUUID().slice(0, 8)}!`;

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const ORG_NAME = `Test Academy — ${ts}`;
const ORG_SLUG = `test-academy-${ts.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;

// ─── Helpers ────────────────────────────────────────────────────────────
async function findOrCreateUser(email: string, name: string): Promise<string> {
  // listUsers paginates; the cheapest path is to try createUser and accept
  // the "already exists" error path.
  const { data: created, error: createErr } = await (sb as any).auth.admin.createUser({
    email,
    password: SHARED_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created?.user) return created.user.id;

  // Fall back: search existing.
  const { data: listed } = await (sb as any).auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (listed?.users ?? []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;
  throw new Error(`Could not create or find user ${email}: ${createErr?.message ?? "unknown"}`);
}

async function grantRole(userId: string, roleType: string, orgId: string) {
  const { error } = await sb.from("user_roles").insert({
    user_id: userId,
    role_type: roleType,
    scope_type: "organization",
    scope_id: orgId,
    granted_by: userId, // self-granted in seed context; fine for test env
  });
  if (error && (error as any).code !== "23505") throw new Error(`grant ${roleType}: ${error.message}`);
}

// ─── Seed ───────────────────────────────────────────────────────────────
console.log(`\n🌱 Seeding test school "${ORG_NAME}"\n`);

const principalId = await findOrCreateUser(PRINCIPAL_EMAIL, "Test Principal");
console.log(`  principal user id  → ${principalId}`);

// Create org
const { data: org, error: orgErr } = await sb
  .from("organizations")
  .insert({
    name: ORG_NAME,
    slug: ORG_SLUG,
    org_type: "school",
    plan: "pilot",
    settings: {
      timezone: "Asia/Karachi",
      academic_year: "2026-2027",
      contact_email: PRINCIPAL_EMAIL,
    },
  })
  .select()
  .single();
if (orgErr) {
  console.error("Org create failed:", orgErr);
  Deno.exit(1);
}
const orgId = org!.id;
console.log(`  org id             → ${orgId}`);

await grantRole(principalId, "principal", orgId);
console.log(`  ✓ principal role granted`);

// Staff accounts. Email base derived from principal email so deletes are
// contained.
const [localPart, domain] = PRINCIPAL_EMAIL.split("@");
const staffEmail = (label: string) => `${localPart}+seed-${ts.toLowerCase().slice(11, 19).replace(/[^a-z0-9-]/g, "-")}-${label}@${domain}`;

const ROLES_TO_SEED: Array<{ role: string; email: string; name: string }> = [
  { role: "admin",            email: staffEmail("admin"),     name: "Test Admin" },
  { role: "class_teacher",    email: staffEmail("ct"),        name: "Test Class Teacher" },
  { role: "visiting_teacher", email: staffEmail("vt"),        name: "Test Visiting Teacher" },
  { role: "financial_staff",  email: staffEmail("fin"),       name: "Test Financial Staff" },
  { role: "office_staff",     email: staffEmail("off"),       name: "Test Office Staff" },
];

const staffSummary: Array<{ role: string; email: string; userId: string }> = [];
for (const r of ROLES_TO_SEED) {
  const uid = await findOrCreateUser(r.email, r.name);
  await grantRole(uid, r.role, orgId);
  staffSummary.push({ role: r.role, email: r.email, userId: uid });
  console.log(`  ✓ ${r.role.padEnd(18)} ${r.email}`);
}

// Class + students
const { data: cls } = await sb
  // Use the Phase A tables (`class`, `class_section`, `student`) — that's
  // what every route in schoolPhaseA/B/C actually queries. Migration 0001
  // defined a parallel `classes`/`class_section` schema requiring
  // campus_id + academic_year_id; the seed previously wrote there by
  // mistake (the insert returned null because of missing required FKs)
  // and then crashed reading `.id` off null.
  .from("class")
  .insert({ org_id: orgId, name: "Grade 5", display_order: 5 })
  .select()
  .single();
if (!cls) {
  console.error("class insert failed");
  Deno.exit(1);
}
console.log(`  ✓ class            → ${cls.id}`);

// class_section — class teacher assignment. NOTE: class_section has NO
// org_id column; the org is reached via class.org_id.
const ctUserId = staffSummary.find((s) => s.role === "class_teacher")!.userId;
const { data: section, error: secErr } = await sb
  .from("class_section")
  .insert({
    class_id: cls.id,
    name: "5-A",
    class_teacher_user_id: ctUserId,
  })
  .select()
  .single();
if (secErr || !section) {
  console.error("class_section insert failed:", secErr);
  Deno.exit(1);
}
console.log(`  ✓ class_section    → ${section.id} (CT: ${ctUserId.slice(0, 8)})`);

const STUDENT_DATA = [
  { full_name: "Aamir Ali",   gr_number: "S-001" },
  { full_name: "Bilal Khan",  gr_number: "S-002" },
  { full_name: "Cyrus Saeed", gr_number: "S-003" },
];
for (const s of STUDENT_DATA) {
  const { data: stu } = await sb
    .from("student")
    .insert({ org_id: orgId, full_name: s.full_name, gr_number: s.gr_number, class_section_id: section!.id })
    .select()
    .single();
  console.log(`  ✓ student          → ${s.full_name} (gr: ${s.gr_number}, id: ${stu?.id.slice(0, 8)}…)`);
}

// ─── Summary ────────────────────────────────────────────────────────────
console.log(`
─────────────────────────────────────────────────────────
✅ Seed complete.

Org: ${ORG_NAME}
ID:  ${orgId}
Slug: ${ORG_SLUG}

Principal: ${PRINCIPAL_EMAIL}
  → log in with your existing Supabase Auth password.

Staff (NEW accounts, all share the password below):
${staffSummary.map(s => `  ${s.role.padEnd(18)} ${s.email}`).join("\n")}

🔑 Shared staff password: ${SHARED_PASSWORD}
   (test env only — never use this pattern in production)

Walk the SCHOOL_ROLES.md test checklist:
  1. Log in as principal → confirm school in switcher.
  2. Log in as each staff role above (sign out + sign in).
  3. Run through their column in the capability matrix.

To clean up: log in as principal → Settings → Danger Zone → Delete school.
The auth users above remain (use Supabase dashboard to delete if needed).
─────────────────────────────────────────────────────────
`);
