// =============================================================================
// test-permission-boundaries.ts — end-to-end permission boundary tests.
//
// What it does:
//   For each (persona, endpoint, expected_status) in a curated matrix, this
//   script logs the persona in (via Supabase Auth password flow) and hits
//   the live edge function. It then asserts the HTTP status matches the
//   expected value.
//
//   This is the kind of test that would have caught F17 (Rabia blank body
//   on /admin/inbox) and similar role-leak bugs before QA: each new persona
//   walkthrough we did manually becomes a row in the matrix below.
//
// Prereq:
//   - Run the demo seed at slug "iqra-demo" so the staff emails are
//     deterministic. From PowerShell:
//       npx deno run --allow-net --allow-env --env=.env scripts/seed-demo-school.ts \
//         --principal-email muneeb@azality.com --reuse-slug iqra-demo
//
// Run:
//   npx deno run --allow-net --allow-env --allow-read --env=.env scripts/test-permission-boundaries.ts
//
// Exit code 0 if all pass, 1 if any fail. Output is a tight table; failures
// include the response body for quick debugging.
//
// Scope: staff personas only (principal, admin, class_teacher x2, visiting
// teacher, office_staff, financial_staff). Parent/student PIN-auth flows
// are a follow-up — they need a different auth path (PIN token, not JWT).
// =============================================================================

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars.");
  Deno.exit(2);
}

const PRINCIPAL_EMAIL = "muneeb@azality.com";
const SHARED_PASSWORD = "Demo-Pakistan2026!"; // matches seed-demo-school.ts
const SLUG_TS = "iqra-demo";                    // deterministic seed slug

const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1/make-server-f116e23f`;

// ─── Resolve org + section IDs from the live DB ─────────────────────────
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const { data: org } = await sb.from("organizations").select("id").eq("slug", SLUG_TS).maybeSingle();
if (!org) {
  console.error(`No org at slug "${SLUG_TS}". Run the seed first:`);
  console.error(`  npx deno run --allow-net --allow-env --env=.env scripts/seed-demo-school.ts \\`);
  console.error(`    --principal-email ${PRINCIPAL_EMAIL} --reuse-slug ${SLUG_TS}`);
  Deno.exit(2);
}
const ORG_ID = (org as any).id as string;

const { data: anySection } = await sb
  .from("class_section")
  .select("id, class:class_id(org_id)")
  .limit(20);
const sectionInOrg = (anySection ?? []).find(
  (s: any) => s.class?.org_id === ORG_ID,
);
const SECTION_ID = sectionInOrg ? (sectionInOrg as any).id as string : "00000000-0000-0000-0000-000000000000";

// ─── Persona registry ───────────────────────────────────────────────────
type Persona = {
  key: string;
  email: string;
  label: string;
};
const localPart = PRINCIPAL_EMAIL.split("@")[0];
const domain = PRINCIPAL_EMAIL.split("@")[1];
const staffEmail = (lab: string) => `${localPart}+demo-${SLUG_TS}-${lab}@${domain}`;

const PERSONAS: Persona[] = [
  // NOTE: principal is the seed-script's --principal-email and uses YOUR
  // real password, not SHARED_PASSWORD. Excluded from the matrix because
  // admin covers the same gate (both pass requireOrgRole). Add back
  // manually if you ever want to assert principal-vs-admin divergence.
  { key: "admin",     email: staffEmail("adnan"),        label: "admin" },
  { key: "ct_zara",   email: staffEmail("zara"),         label: "class teacher (Zara)" },
  { key: "ct_hina",   email: staffEmail("hina"),         label: "class teacher (Hina)" },
  { key: "vt_sheikh", email: staffEmail("sheikh"),       label: "visiting teacher" },
  { key: "office",    email: staffEmail("rabia"),        label: "office staff" },
  { key: "finance",   email: staffEmail("kamran"),       label: "financial staff" },
];

// ─── Test matrix ────────────────────────────────────────────────────────
// expected: 200 = allowed, 403 = forbidden, 404 = not-in-scope (still pass).
// We don't assert response body; status is enough for a boundary check.
type Case = {
  name: string;
  method: "GET" | "POST";
  path: string;
  expect: Record<string /*persona key*/, number /*status*/>;
  body?: any;
};
const CASES: Case[] = [
  {
    name: "GET /school/me",
    method: "GET",
    path: "/school/me",
    expect: {
      principal: 200, admin: 200, ct_zara: 200, ct_hina: 200,
      vt_sheikh: 200, office: 200, finance: 200,
    },
  },
  {
    name: "GET principal dashboard",
    method: "GET",
    path: `/school/orgs/${ORG_ID}/dashboard`,
    expect: {
      principal: 200, admin: 200, ct_zara: 200, ct_hina: 200,
      vt_sheikh: 200, office: 200, finance: 200,
    },
  },
  {
    name: "GET office-snapshot — any org role allowed",
    method: "GET",
    path: `/school/orgs/${ORG_ID}/office-snapshot`,
    expect: {
      principal: 200, admin: 200, ct_zara: 200, ct_hina: 200,
      vt_sheikh: 200, office: 200, finance: 200,
    },
  },
  {
    name: "GET finance-snapshot — any org role allowed",
    method: "GET",
    path: `/school/orgs/${ORG_ID}/finance-snapshot`,
    expect: {
      principal: 200, admin: 200, ct_zara: 200, ct_hina: 200,
      vt_sheikh: 200, office: 200, finance: 200,
    },
  },
  {
    name: "GET room-conflicts — admin/principal only",
    method: "GET",
    path: `/school/orgs/${ORG_ID}/timetable/room-conflicts`,
    expect: {
      principal: 200, admin: 200, ct_zara: 403, ct_hina: 403,
      vt_sheikh: 403, office: 403, finance: 403,
    },
  },
  {
    name: "GET teacher-conflicts — admin/principal only",
    method: "GET",
    path: `/school/orgs/${ORG_ID}/timetable/teacher-conflicts`,
    expect: {
      principal: 200, admin: 200, ct_zara: 403, ct_hina: 403,
      vt_sheikh: 403, office: 403, finance: 403,
    },
  },
  {
    name: "GET behavior-categories — any org role allowed",
    method: "GET",
    path: `/school/orgs/${ORG_ID}/behavior-categories`,
    expect: {
      principal: 200, admin: 200, ct_zara: 200, ct_hina: 200,
      vt_sheikh: 200, office: 200, finance: 200,
    },
  },
  {
    name: "POST behavior-category — admin/principal only",
    method: "POST",
    path: `/school/orgs/${ORG_ID}/behavior-categories`,
    body: { label: "Test category " + Math.floor(Math.random() * 100000), kind: "both" },
    expect: {
      principal: 201, admin: 201, ct_zara: 403, ct_hina: 403,
      vt_sheikh: 403, office: 403, finance: 403,
    },
  },
];

// ─── Login & run ────────────────────────────────────────────────────────
async function loginToJwt(email: string): Promise<string | null> {
  const c = createClient(SUPABASE_URL!, ANON_KEY!);
  const { data, error } = await c.auth.signInWithPassword({
    email,
    password: SHARED_PASSWORD,
  });
  if (error || !data.session) {
    console.error(`  ✗ login failed for ${email}: ${error?.message ?? "no session"}`);
    return null;
  }
  return data.session.access_token;
}

async function run() {
  // Authenticate every persona once. Reuse JWT across cases.
  const tokens = new Map<string, string>();
  for (const p of PERSONAS) {
    const t = await loginToJwt(p.email);
    if (t) tokens.set(p.key, t);
  }

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const cs of CASES) {
    for (const p of PERSONAS) {
      const expected = cs.expect[p.key];
      if (expected == null) continue;
      const token = tokens.get(p.key);
      if (!token) {
        failures.push(`${cs.name} [${p.key}]: NO TOKEN — login failed`);
        failed++;
        continue;
      }
      try {
        const res = await fetch(`${FUNCTIONS_BASE}${cs.path}`, {
          method: cs.method,
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: cs.body ? JSON.stringify(cs.body) : undefined,
        });
        if (res.status === expected) {
          passed++;
        } else {
          const body = await res.text();
          failures.push(
            `${cs.name} [${p.key}]: expected ${expected}, got ${res.status} — ${body.slice(0, 200)}`,
          );
          failed++;
        }
      } catch (e) {
        failures.push(`${cs.name} [${p.key}]: network error — ${e instanceof Error ? e.message : e}`);
        failed++;
      }
    }
  }

  console.log("");
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const f of failures) console.log(`  ✗ ${f}`);
    Deno.exit(1);
  }
  Deno.exit(0);
}

console.log(`🔐 permission boundary tests`);
console.log(`  org    : ${ORG_ID} (slug ${SLUG_TS})`);
console.log(`  cases  : ${CASES.length} × ${PERSONAS.length} personas`);
console.log("");

await run();
