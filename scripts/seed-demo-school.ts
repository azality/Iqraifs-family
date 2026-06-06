// Demo school seeder — populates a complete, realistic school environment
// you can walk a prospective Iqra Academy administrator through.
//
// What it creates (in one new org, NOT touching anything else):
//   - 1 organization branded "Iqra Demo Academy" with theme + motto
//   - 6 staff: principal (existing user you pass) + admin + 2 class
//     teachers + 1 visiting teacher + 1 office_staff + 1 financial_staff
//   - 5 classes (Grade 1 – Grade 5), each with 1 section, ~6 students
//   - 30 students with realistic Pakistani names + 4-digit PINs
//   - 18 parents (some with 2 children) with phone numbers + PINs
//   - 4 weeks of attendance per section (~85% present, varied)
//   - ~40 behavior events (mix positive / concern)
//   - ~60 Hifz progress entries (grades 4-5 heavier)
//   - Fee status rows for the current month (mix paid / unpaid)
//   - 6 subjects per grade (Math/English/Urdu/Science/Islamiat/Quran),
//     each with: a per-section teacher (Quran → visiting teacher Sheikh,
//     others → that grade's class teacher), a 6-8 topic curriculum for
//     the current academic year, topic resources on the first topic of
//     each subject (worksheet + video + quiz samples), ~3 tagged daily
//     lessons across the past 2 weeks, 2 tagged assignments (one graded,
//     one due in 5-10 days), and grades for the past assignment across
//     every student in the section.
//
// All staff accounts share one password printed at the end. All student
// and parent PINs are printed too. The principal is YOUR existing
// muneeb@azality.com (or whatever email you pass via --principal-email).
//
// Usage:
//   npx deno run --allow-net --allow-env --env=.env scripts/seed-demo-school.ts \
//     --principal-email muneeb@azality.com
//
// Idempotent? No. Each run creates a NEW org (with a unique slug). Delete
// the old demo org via Settings → Danger Zone, then re-seed.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ─── CLI args ───────────────────────────────────────────────────────────
const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i++) {
  const a = Deno.args[i];
  if (a.startsWith("--") && Deno.args[i + 1]) { args.set(a.slice(2), Deno.args[i + 1]); i++; }
}

const PRINCIPAL_EMAIL = args.get("principal-email");
if (!PRINCIPAL_EMAIL) {
  console.error("Missing --principal-email <email>. Must already exist in Supabase Auth.");
  Deno.exit(1);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.");
  Deno.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const SHARED_PASSWORD = "Demo-Pakistan2026!";  // documented; safe in test env
const STUDENT_PIN_DEFAULT = "1234";            // documented; all demo students
const PARENT_PIN_DEFAULT = "5678";             // documented; all demo parents

// ─── PIN hashing (mirrors schoolPhaseA.tsx) ─────────────────────────────
// Format: pbkdf2$<iters>$<saltB64>$<hashB64>. The backend's verifyPin()
// accepts this format directly.
const PIN_ITERATIONS = 100_000;

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function hashPin(pin: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PIN_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256,
  );
  return `pbkdf2$${PIN_ITERATIONS}$${b64encode(salt)}$${b64encode(new Uint8Array(derivedBits))}`;
}

// ─── Names ──────────────────────────────────────────────────────────────
// Real Pakistani-Muslim student names. ~6 per class, 5 classes = 30 students.

const STUDENT_NAMES_PER_CLASS: Record<number, string[]> = {
  1: ["Hassan Ali", "Fatima Khan", "Bilal Ahmed", "Ayesha Tariq", "Zayn Malik", "Hira Saeed"],
  2: ["Omar Farooq", "Maryam Iqbal", "Yusuf Hashmi", "Zainab Raza", "Ibrahim Sheikh", "Khadijah Awan"],
  3: ["Hamza Qureshi", "Sumaiya Rashid", "Abdullah Siddiqui", "Aisha Mehmood", "Salman Akhtar", "Noor Fatima"],
  4: ["Ahmed Ali Shah", "Mariam Yasmin", "Zaid Hussain", "Ramsha Naseer", "Talha Mansoor", "Sara Ehsan"],
  5: ["Bilal Saqib", "Ayesha Iqbal", "Usman Tariq", "Sana Javed", "Ali Raza", "Mahnoor Khan"],
};

const PARENT_NAMES = [
  { name: "Imran Ali",       phone: "+92 300 1001001" },
  { name: "Saima Khan",      phone: "+92 300 1001002" },
  { name: "Tariq Ahmed",     phone: "+92 300 1001003" },
  { name: "Rabia Tariq",     phone: "+92 300 1001004" },
  { name: "Faisal Malik",    phone: "+92 300 1001005" },
  { name: "Naila Saeed",     phone: "+92 300 1001006" },
  { name: "Hamid Farooq",    phone: "+92 300 1001007" },
  { name: "Asma Iqbal",      phone: "+92 300 1001008" },
  { name: "Junaid Hashmi",   phone: "+92 300 1001009" },
  { name: "Mehwish Raza",    phone: "+92 300 1001010" },
  { name: "Kamran Sheikh",   phone: "+92 300 1001011" },
  { name: "Sadia Awan",      phone: "+92 300 1001012" },
  { name: "Adnan Qureshi",   phone: "+92 300 1001013" },
  { name: "Bushra Rashid",   phone: "+92 300 1001014" },
  { name: "Waqas Siddiqui",  phone: "+92 300 1001015" },
  { name: "Naheed Mehmood",  phone: "+92 300 1001016" },
  { name: "Shahid Akhtar",   phone: "+92 300 1001017" },
  { name: "Yasmeen Fatima",  phone: "+92 300 1001018" },
];

// ─── Helpers ────────────────────────────────────────────────────────────
async function findOrCreateUser(email: string, name: string): Promise<string> {
  const { data: created } = await (sb as any).auth.admin.createUser({
    email, password: SHARED_PASSWORD, email_confirm: true,
    user_metadata: { name }, app_metadata: { signupIntent: "school" },
  });
  if (created?.user) return created.user.id;
  const { data: listed } = await (sb as any).auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = (listed?.users ?? []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) return found.id;
  throw new Error(`Could not create/find user ${email}`);
}

async function grantRole(userId: string, roleType: string, orgId: string) {
  const { error } = await sb.from("user_roles").insert({
    user_id: userId, role_type: roleType,
    scope_type: "organization", scope_id: orgId,
    granted_by: userId,
  });
  if (error && (error as any).code !== "23505") throw error;
}

function randomChoice<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d; }

// ─── Seed ───────────────────────────────────────────────────────────────
console.log("\n🌱 Seeding Iqra Demo Academy…\n");

// Reuse the principal user.
const principalId = await findOrCreateUser(PRINCIPAL_EMAIL, "Principal Muneeb");
console.log(`  principal user id   → ${principalId}`);

// Org with full branding.
const slugTs = Date.now().toString(36);
const orgName = `Iqra Demo Academy`;
const orgSlug = `iqra-demo-${slugTs}`;
const { data: org, error: orgErr } = await sb.from("organizations").insert({
  name: orgName,
  slug: orgSlug,
  org_type: "school",
  plan: "pilot",
  settings: {
    timezone: "Asia/Karachi",
    academic_year: "2026-2027",
    contact_email: PRINCIPAL_EMAIL,
    contact_phone: "+92 21 1234 5678",
    address: "Block 4, Clifton, Karachi, Pakistan",
    logo_url: "https://api.dicebear.com/9.x/initials/svg?seed=Iqra%20Demo%20Academy&backgroundColor=0f766e",
    theme_color: "#0f766e",
    school_motto: "Knowledge, character, faith — together",
  },
}).select().single();
if (orgErr) { console.error("Org create failed:", orgErr); Deno.exit(1); }
const orgId = org!.id;
console.log(`  org id              → ${orgId}`);
console.log(`  org slug            → ${orgSlug}`);

await grantRole(principalId, "principal", orgId);
console.log(`  ✓ principal granted to ${PRINCIPAL_EMAIL}`);

// Staff (5 accounts). Email base derived from principal so deletes are
// contained.
const [localPart, domain] = PRINCIPAL_EMAIL.split("@");
const staffEmail = (label: string) => `${localPart}+demo-${slugTs}-${label}@${domain}`;

const STAFF: Array<{ role: string; email: string; name: string; key: string }> = [
  { role: "admin",            email: staffEmail("adnan"),    name: "Adnan Hussain",  key: "admin" },
  { role: "class_teacher",    email: staffEmail("zara"),     name: "Zara Mansoor",   key: "ct_zara" },
  { role: "class_teacher",    email: staffEmail("hina"),     name: "Hina Tariq",     key: "ct_hina" },
  { role: "visiting_teacher", email: staffEmail("sheikh"),   name: "Sheikh Abdullah",key: "vt_sheikh" },
  { role: "office_staff",     email: staffEmail("rabia"),    name: "Rabia Saqib",    key: "office" },
  { role: "financial_staff",  email: staffEmail("kamran"),   name: "Kamran Bhatti",  key: "finance" },
];
const staffByKey = new Map<string, { userId: string; email: string; name: string }>();
for (const s of STAFF) {
  const uid = await findOrCreateUser(s.email, s.name);
  if (s.role === "visiting_teacher") {
    // Visiting teacher gets validity dates (PR F #Q5).
    await sb.from("user_roles").insert({
      user_id: uid, role_type: s.role, scope_type: "organization", scope_id: orgId,
      granted_by: principalId,
      valid_from: isoDate(daysAgo(60)), valid_until: isoDate(daysAgo(-120)),
    });
  } else {
    await grantRole(uid, s.role, orgId);
  }
  staffByKey.set(s.key, { userId: uid, email: s.email, name: s.name });
  console.log(`  ✓ ${s.role.padEnd(18)} ${s.name} (${s.email})`);
}

// Classes — Grade 1 through Grade 5. Two have class teachers assigned, three don't (showroom for assigning).
const classesByGrade = new Map<number, { classId: string; sectionId: string }>();
for (const grade of [1, 2, 3, 4, 5]) {
  const { data: cls } = await sb.from("class").insert({
    org_id: orgId, name: `Grade ${grade}`, display_order: grade,
  }).select().single();
  // Assign class teachers to Grade 3 and Grade 5 only — leaves Grade 1, 2, 4 unassigned for demo.
  const teacherKey = grade === 3 ? "ct_zara" : grade === 5 ? "ct_hina" : null;
  const { data: section } = await sb.from("class_section").insert({
    class_id: cls!.id, name: `${grade}-A`,
    class_teacher_user_id: teacherKey ? staffByKey.get(teacherKey)!.userId : null,
  }).select().single();
  classesByGrade.set(grade, { classId: cls!.id, sectionId: section!.id });
  console.log(`  ✓ class             → Grade ${grade} (section 5-A id ${section!.id.slice(0,8)}…${teacherKey ? `, CT=${teacherKey}` : ", unassigned"})`);
}

// Students (30). 6 per class.
const studentsByGrade: Record<number, Array<{ id: string; name: string; gr: string; pin: string }>> = {};
let studentCounter = 1;
for (const grade of [1, 2, 3, 4, 5]) {
  studentsByGrade[grade] = [];
  const sectionId = classesByGrade.get(grade)!.sectionId;
  for (const name of STUDENT_NAMES_PER_CLASS[grade]) {
    const gr = `IDA-${String(studentCounter).padStart(3, "0")}`;
    const { data: stu } = await sb.from("student").insert({
      org_id: orgId, full_name: name, gr_number: gr, class_section_id: sectionId,
    }).select().single();
    // PIN credential
    const hash = await hashPin(STUDENT_PIN_DEFAULT);
    await sb.from("pin_credential").insert({
      org_id: orgId, subject_type: "student", subject_id: stu!.id,
      login_identifier: gr, pin_hash: hash, must_change: false,
    });
    studentsByGrade[grade].push({ id: stu!.id, name, gr, pin: STUDENT_PIN_DEFAULT });
    studentCounter++;
  }
  console.log(`  ✓ ${studentsByGrade[grade].length} students in Grade ${grade}`);
}

// Parents (18). First 12 each linked to 1 student. Last 6 linked to 2 (siblings).
const parentRows: Array<{ id: string; name: string; phone: string; children: string[] }> = [];
for (let i = 0; i < PARENT_NAMES.length; i++) {
  const p = PARENT_NAMES[i];
  const { data: parent } = await sb.from("parent").insert({
    org_id: orgId, full_name: p.name, phone: p.phone,
    email: `${p.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    relationship: i % 3 === 0 ? "father" : i % 3 === 1 ? "mother" : "guardian",
  }).select().single();
  const hash = await hashPin(PARENT_PIN_DEFAULT);
  await sb.from("pin_credential").insert({
    org_id: orgId, subject_type: "parent", subject_id: parent!.id,
    login_identifier: p.phone, pin_hash: hash, must_change: false,
  });
  parentRows.push({ id: parent!.id, name: p.name, phone: p.phone, children: [] });
}
console.log(`  ✓ ${parentRows.length} parents created with PINs`);

// Link parents → students. Mix of family compositions so the cards UI
// has variety to demo:
//   - 4 co-parent pairs (father + mother both linked to the same child(ren))
//   - 4 single-parent families
//   - 2 single-parent families with 2 kids (siblings, one parent each)
//
// Pairings done by index: parents[0]+parents[1] are co-parents,
// parents[2]+parents[3] are co-parents, etc. So the relationship column
// (father / mother) alternates correctly for the demo.
const allStudents = Object.values(studentsByGrade).flat();
let studentIdx = 0;

// 4 co-parent pairs (parents 0+1, 2+3, 4+5, 6+7) → 1 shared child each
for (let pairStart = 0; pairStart < 8; pairStart += 2) {
  const stu = allStudents[studentIdx++];
  await sb.from("student_parent").insert([
    { student_id: stu.id, parent_id: parentRows[pairStart].id, is_primary: true },
    { student_id: stu.id, parent_id: parentRows[pairStart + 1].id, is_primary: false },
  ]);
  parentRows[pairStart].children.push(stu.name);
  parentRows[pairStart + 1].children.push(stu.name);
}

// 4 single-parent families (parents 8, 9, 10, 11) → 1 child each
for (let i = 8; i < 12; i++) {
  const stu = allStudents[studentIdx++];
  await sb.from("student_parent").insert({
    student_id: stu.id, parent_id: parentRows[i].id, is_primary: true,
  });
  parentRows[i].children.push(stu.name);
}

// 2 single-parent families with 2 kids each (parents 12, 13)
for (let i = 12; i < 14; i++) {
  for (let j = 0; j < 2; j++) {
    if (studentIdx >= allStudents.length) break;
    const stu = allStudents[studentIdx++];
    await sb.from("student_parent").insert({
      student_id: stu.id, parent_id: parentRows[i].id, is_primary: j === 0,
    });
    parentRows[i].children.push(stu.name);
  }
}

// 2 co-parent pairs with TWO shared kids each (parents 14+15, 16+17)
// — both parents AND siblings, the richest case for demoing the cards.
for (let pairStart = 14; pairStart < 18; pairStart += 2) {
  for (let j = 0; j < 2; j++) {
    if (studentIdx >= allStudents.length) break;
    const stu = allStudents[studentIdx++];
    await sb.from("student_parent").insert([
      { student_id: stu.id, parent_id: parentRows[pairStart].id, is_primary: j === 0 },
      { student_id: stu.id, parent_id: parentRows[pairStart + 1].id, is_primary: false },
    ]);
    parentRows[pairStart].children.push(stu.name);
    parentRows[pairStart + 1].children.push(stu.name);
  }
}

console.log(`  ✓ student-parent links created (4 couples + 4 singles + 2 single-with-2-kids + 2 couples-with-2-kids)`);

// Attendance — 4 weeks (28 days) for each section, school days only (Mon-Sat).
// Includes today (dayOffset=0) — without it the "Attendance Today" tile reads 0%.
// Only Grade 3 and Grade 5 (the sections with assigned class teachers) get
// today's attendance, so the Attendance Gap warning still has the unassigned
// sections to flag — keeps the demo realistic.
const ctZaraId = staffByKey.get("ct_zara")!.userId;
const ctHinaId = staffByKey.get("ct_hina")!.userId;
const STATUSES = ["present", "present", "present", "present", "present", "late", "absent", "excused"];
let attendanceCount = 0;
for (let dayOffset = 27; dayOffset >= 0; dayOffset--) {
  const d = daysAgo(dayOffset);
  const dow = d.getDay();
  if (dow === 0) continue; // Skip Sunday
  const dateStr = isoDate(d);
  for (const grade of [1, 2, 3, 4, 5]) {
    // On day 0 (today) only record for Grade 3 + Grade 5, so the
    // "5 sections with no attendance in 3 days" warning still fires
    // realistically against the other three classes.
    if (dayOffset === 0 && grade !== 3 && grade !== 5) continue;
    const sectionId = classesByGrade.get(grade)!.sectionId;
    const recorder = grade === 3 ? ctZaraId : grade === 5 ? ctHinaId : principalId;
    for (const stu of studentsByGrade[grade]) {
      const status = randomChoice(STATUSES);
      // BUG FIX: school_attendance requires org_id (NOT NULL). Without it
      // every insert silently failed with {error: "..."}, and the
      // .then(...) pattern ignored the error field. Result: seed reported
      // "690 attendance rows" but zero were actually written. Dashboard
      // showed 0% attendance everywhere despite the seed succeeding.
      const ins = await sb.from("school_attendance").insert({
        org_id: orgId,
        student_id: stu.id, class_section_id: sectionId,
        attendance_date: dateStr, status,
        recorded_by: recorder,
      });
      if (!ins.error) attendanceCount++;
      else if (!String(ins.error.message).includes("duplicate")) {
        // Real error worth surfacing — print to stderr so we don't
        // claim success when nothing got written.
        console.error("attendance insert failed:", ins.error.message);
      }
    }
  }
}
console.log(`  ✓ ${attendanceCount} attendance rows (4 weeks × 5 classes × 6 students × ~5 schooldays/week)`);

// Behavior notes — 40 events spread across the last 2 weeks.
const BEHAVIOR_POSITIVE = [
  { category: "helpfulness",    notes: "Helped a younger student with their work", points: 5 },
  { category: "leadership",     notes: "Led the line beautifully to assembly", points: 3 },
  { category: "respect",        notes: "Showed excellent adab to the teacher", points: 5 },
  { category: "effort",         notes: "Stayed back to finish their work", points: 4 },
  { category: "honesty",        notes: "Returned a found pencil to its owner", points: 5 },
];
const BEHAVIOR_CONCERN = [
  { category: "noise",          notes: "Disrupting class during lesson", points: -2 },
  { category: "homework",       notes: "Did not bring homework",         points: -2 },
  { category: "lateness",       notes: "Arrived 15 minutes late",        points: -1 },
  { category: "uniform",        notes: "Uniform incomplete",             points: -1 },
];
let behaviorCount = 0;
for (let i = 0; i < 40; i++) {
  const stu = randomChoice(allStudents);
  const isPositive = Math.random() > 0.35;
  const tmpl = isPositive ? randomChoice(BEHAVIOR_POSITIVE) : randomChoice(BEHAVIOR_CONCERN);
  // Find the section for this student
  let sectionId = "";
  for (const g of [1, 2, 3, 4, 5]) {
    if (studentsByGrade[g].some((s) => s.id === stu.id)) {
      sectionId = classesByGrade.get(g)!.sectionId; break;
    }
  }
  await sb.from("behavior_note").insert({
    org_id: orgId, student_id: stu.id, class_section_id: sectionId,
    kind: isPositive ? "positive" : "concern",
    category: tmpl.category, points: tmpl.points, notes: tmpl.notes,
    observed_at: daysAgo(randomInt(1, 14)).toISOString(),
    recorded_by: randomChoice([ctZaraId, ctHinaId, principalId]),
  });
  behaviorCount++;
}
console.log(`  ✓ ${behaviorCount} behavior events (mix positive/concern, last 2 weeks)`);

// Hifz progress — focus on grades 4 & 5 (older students working on memorization).
const HIFZ_SURAHS = [
  { num: 78, name: "An-Naba", ayahs: 40 },
  { num: 79, name: "An-Nazi'at", ayahs: 46 },
  { num: 80, name: "Abasa", ayahs: 42 },
  { num: 87, name: "Al-A'la", ayahs: 19 },
  { num: 88, name: "Al-Ghashiyah", ayahs: 26 },
  { num: 89, name: "Al-Fajr", ayahs: 30 },
  { num: 90, name: "Al-Balad", ayahs: 20 },
];
const HIFZ_KINDS = ["sabaq", "sabqi", "manzil", "memorized", "revised"];
const HIFZ_QUALITIES = ["excellent", "good", "good", "needs_practice"];
let hifzCount = 0;
for (const grade of [3, 4, 5]) {
  for (const stu of studentsByGrade[grade]) {
    const entries = grade === 5 ? 4 : grade === 4 ? 3 : 1;
    for (let e = 0; e < entries; e++) {
      const surah = randomChoice(HIFZ_SURAHS);
      const ayahFrom = randomInt(1, Math.max(1, surah.ayahs - 5));
      const ayahTo = Math.min(surah.ayahs, ayahFrom + randomInt(2, 8));
      await sb.from("hifz_progress").insert({
        org_id: orgId, student_id: stu.id,
        surah_number: surah.num, ayah_from: ayahFrom, ayah_to: ayahTo,
        kind: randomChoice(HIFZ_KINDS), quality: randomChoice(HIFZ_QUALITIES),
        notes: e === 0 ? `${surah.name} — fluent` : null,
        recorded_at: daysAgo(randomInt(1, 25)).toISOString(),
        recorded_by: randomChoice([ctZaraId, ctHinaId, principalId]),
      });
      hifzCount++;
    }
  }
}
console.log(`  ✓ ${hifzCount} hifz entries (grades 3-5)`);

// Fees — current month + previous month, mix of paid/unpaid.
const today = new Date();
const periods = [
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  `${today.getFullYear()}-${String(today.getMonth()).padStart(2, "0")}`,
];
let feeCount = 0;
for (const stu of allStudents) {
  for (const period of periods) {
    const isCurrent = period === periods[0];
    const isPaid = !isCurrent || Math.random() > 0.4;
    await sb.from("fee_status").insert({
      org_id: orgId, student_id: stu.id, period,
      amount_due: 5000, amount_paid: isPaid ? 5000 : 0,
      status: isPaid ? "paid" : "unpaid",
      due_date: isoDate(daysAgo(isCurrent ? -5 : 25)),
      paid_date: isPaid ? isoDate(daysAgo(isCurrent ? 3 : 27)) : null,
      recorded_by: principalId,
    });
    feeCount++;
  }
}
console.log(`  ✓ ${feeCount} fee status rows (current + prior month)`);

// Roster change requests — 3 pending so the "Pending Approvals" tile is
// non-zero. One add (new student joining Grade 2), one remove (student
// withdrawing from Grade 1), one transfer-style add (Grade 4 → Grade 5).
// Filed by Zara (Grade 3 class teacher) which mirrors a realistic flow:
// teachers submit, admins approve.
const rosterReqs = [
  {
    class_section_id: classesByGrade.get(2)!.sectionId,
    kind: "add",
    new_student_payload: { full_name: "Tehmina Yousaf", gr_number: "IDA-NEW-001", guardian_phone: "+92 300 1009001" },
    reason: "New admission for spring semester. Parent has paid registration fee.",
  },
  {
    class_section_id: classesByGrade.get(1)!.sectionId,
    kind: "remove",
    student_id: studentsByGrade[1][0].id,
    reason: "Family relocating to Lahore. Effective end of month.",
  },
  {
    class_section_id: classesByGrade.get(5)!.sectionId,
    kind: "add",
    new_student_payload: { full_name: "Faraz Ahmed", gr_number: "IDA-NEW-002", guardian_phone: "+92 300 1009002" },
    reason: "Transferring from Grade 4. Hifz placement assessment passed.",
  },
];
const ctZaraUserId = staffByKey.get("ct_zara")!.userId;
let rosterCount = 0;
for (const r of rosterReqs) {
  const { error } = await sb.from("roster_change_request").insert({
    org_id: orgId,
    class_section_id: r.class_section_id,
    kind: r.kind,
    student_id: (r as any).student_id ?? null,
    new_student_payload: (r as any).new_student_payload ?? null,
    reason: r.reason,
    status: "pending",
    requested_by: ctZaraUserId,
  });
  if (!error) rosterCount++;
  else console.error("roster request insert failed:", error);
}
console.log(`  ✓ ${rosterCount} pending roster change requests`);

// ─── Subjects, curriculum, topic resources (Phase 5) ──────────────────
// Each grade gets the same 6 subjects (template trimmed to 6-8 topics per
// subject to keep seed runtime manageable). First topic of each subject
// gets a worksheet + a video + a quiz so the demo flows show all three
// resource kinds. Teachers are assigned to subjects mirroring real
// schools: class teacher for most, visiting teacher (Sheikh) takes Quran.

const ctZaraIdSeed = staffByKey.get("ct_zara")!.userId;
const ctHinaIdSeed = staffByKey.get("ct_hina")!.userId;
const vtSheikhId = staffByKey.get("vt_sheikh")!.userId;

// Coarse Pakistani academic-year heuristic (April-start). Same logic as
// the SubjectCurriculumPanel default so the demo lands on the same year
// the year-selector picks by default.
const seedNow = new Date();
const seedYearStart =
  seedNow.getUTCMonth() >= 3 ? seedNow.getUTCFullYear() : seedNow.getUTCFullYear() - 1;
const ACADEMIC_YEAR = `${seedYearStart}-${((seedYearStart + 1) % 100)
  .toString()
  .padStart(2, "0")}`;

interface SubjectSpec {
  name: string;
  /** topic names in syllabus order */
  topics: string[];
  /** resources to attach to the FIRST topic only (variety demo) */
  firstTopicResources: Array<{
    kind: "pdf" | "video" | "worksheet" | "link" | "quiz";
    label: string;
    url: string;
  }>;
}

const SUBJECT_SPECS: SubjectSpec[] = [
  {
    name: "Math",
    topics: [
      "Numbers and place value",
      "Addition and subtraction",
      "Multiplication tables",
      "Fractions",
      "Decimals",
      "Geometry — 2D shapes",
      "Measurement",
      "Word problems",
    ],
    firstTopicResources: [
      { kind: "worksheet", label: "Place value practice", url: "https://www.k5learning.com/free-math-worksheets/fourth-grade-4/place-value/build-numbers-from-parts" },
      { kind: "video",     label: "Place value explained", url: "https://www.youtube.com/watch?v=q3O2_jbgK_M" },
      { kind: "quiz",      label: "End-of-topic quiz",     url: "https://forms.gle/example-math" },
    ],
  },
  {
    name: "English",
    topics: [
      "Nouns and pronouns",
      "Verbs — tense basics",
      "Adjectives and adverbs",
      "Articles and prepositions",
      "Reading comprehension",
      "Creative writing",
    ],
    firstTopicResources: [
      { kind: "worksheet", label: "Nouns worksheet",       url: "https://www.k5learning.com/free-grammar-worksheets" },
      { kind: "video",     label: "Common vs proper nouns", url: "https://www.youtube.com/watch?v=NkuuZEey_bs" },
    ],
  },
  {
    name: "Urdu",
    topics: [
      "Huroof aur awaazein",
      "Jumla saazi",
      "Ism, fail, sifat",
      "Wahid aur jama",
      "Muhavare",
      "Insha nigari",
    ],
    firstTopicResources: [
      { kind: "pdf",       label: "Huroof chart",          url: "https://www.pakurdupoint.com/learn-urdu-alphabets.pdf" },
      { kind: "video",     label: "Awaazein parhna",       url: "https://www.youtube.com/watch?v=wTSlmiyibUw" },
    ],
  },
  {
    name: "Science",
    topics: [
      "Living and non-living",
      "Plants",
      "Animals and habitats",
      "Human body",
      "States of matter",
      "Earth and weather",
    ],
    firstTopicResources: [
      { kind: "video",     label: "Living vs non-living",   url: "https://www.youtube.com/watch?v=p51FiPO2_kQ" },
      { kind: "quiz",      label: "Quick check",            url: "https://forms.gle/example-sci" },
    ],
  },
  {
    name: "Islamiat",
    topics: [
      "Iman aur Aqeeda",
      "Arkan-e-Islam",
      "Wuzu aur Tahaarat",
      "Salah ka tareeqa",
      "Sirat-un-Nabi ﷺ",
      "Akhlaq",
    ],
    firstTopicResources: [
      { kind: "pdf",       label: "Iman aur Aqeeda notes",  url: "https://example.com/islamiat-iman.pdf" },
    ],
  },
  {
    name: "Quran",
    topics: [
      "Qaida — huroof and harakat",
      "Madd letters and rules",
      "Tanween and sukoon",
      "Surah Al-Fatihah",
      "Last 10 surahs of Juz Amma",
      "Tajweed — Idgham and Ikhfa",
    ],
    firstTopicResources: [
      { kind: "video",     label: "Qaida — huroof",         url: "https://www.youtube.com/watch?v=8yTttBJlT9Q" },
      { kind: "worksheet", label: "Harakat practice",       url: "https://example.com/qaida-harakat.pdf" },
    ],
  },
];

// Build, per grade, the section_subject rows + curriculum + topics + resources
// + a handful of tagged lessons + tagged assignments + grades.
interface SeededSubject {
  classSubjectId: string;
  sectionSubjectId: string;
  subjectName: string;
  grade: number;
  sectionId: string;
  teacherUserId: string;
  topicIds: string[];
}

const seededSubjects: SeededSubject[] = [];
let cs_count = 0;
let ss_count = 0;
let cur_count = 0;
let topic_count = 0;
let resource_count = 0;

for (const grade of [1, 2, 3, 4, 5]) {
  const classRow = classesByGrade.get(grade)!;
  for (const spec of SUBJECT_SPECS) {
    // class_subject (the template at the class level)
    const { data: cs, error: csErr } = await sb
      .from("class_subject")
      .insert({
        org_id: orgId,
        class_id: classRow.classId,
        name: spec.name,
        sort_order: SUBJECT_SPECS.findIndex((x) => x.name === spec.name),
        created_by: principalId,
      })
      .select()
      .single();
    if (csErr) {
      console.error(`class_subject insert failed (${spec.name} grade ${grade}):`, csErr.message);
      continue;
    }
    cs_count++;

    // teacher_user_id per subject:
    //   Quran → Sheikh (visiting teacher) for every grade
    //   Everything else → that grade's class teacher (Zara/Hina) when set,
    //   else Zara as default so all subjects render with a teacher in the demo.
    const teacherUserId =
      spec.name === "Quran"
        ? vtSheikhId
        : grade === 5
        ? ctHinaIdSeed
        : grade === 3
        ? ctZaraIdSeed
        : ctZaraIdSeed; // grades 1,2,4 — use Zara as a stand-in subject teacher

    // section_subject (per-section teacher assignment)
    const { data: ss, error: ssErr } = await sb
      .from("section_subject")
      .insert({
        org_id: orgId,
        class_section_id: classRow.sectionId,
        class_subject_id: cs!.id,
        name: spec.name, // legacy denorm column
        teacher_user_id: teacherUserId,
        sort_order: SUBJECT_SPECS.findIndex((x) => x.name === spec.name),
        created_by: principalId,
      })
      .select()
      .single();
    if (ssErr) {
      console.error(`section_subject insert failed (${spec.name} grade ${grade}):`, ssErr.message);
      continue;
    }
    ss_count++;

    // curriculum row for current academic year
    const { data: cur, error: curErr } = await sb
      .from("curriculum")
      .insert({
        org_id: orgId,
        class_subject_id: cs!.id,
        academic_year: ACADEMIC_YEAR,
        title: `${spec.name} · ${ACADEMIC_YEAR}`,
        description: null,
        created_by: principalId,
      })
      .select()
      .single();
    if (curErr) {
      console.error(`curriculum insert failed (${spec.name} grade ${grade}):`, curErr.message);
      continue;
    }
    cur_count++;

    // curriculum_topic rows. Mark first 2 topics completed for Math/English
    // so progress bars are non-zero in the demo.
    const topicIds: string[] = [];
    for (let ti = 0; ti < spec.topics.length; ti++) {
      const completed =
        (spec.name === "Math" || spec.name === "English") && ti < 2;
      const { data: t, error: tErr } = await sb
        .from("curriculum_topic")
        .insert({
          curriculum_id: cur!.id,
          name: spec.topics[ti],
          description: null,
          display_order: ti,
          target_date: null,
          completed,
        })
        .select()
        .single();
      if (tErr) {
        console.error(`topic insert failed:`, tErr.message);
        continue;
      }
      topicIds.push(t!.id);
      topic_count++;
    }

    // topic_resource rows for first topic only (showcases all kinds).
    if (topicIds.length > 0) {
      for (let ri = 0; ri < spec.firstTopicResources.length; ri++) {
        const r = spec.firstTopicResources[ri];
        const { error: rErr } = await sb.from("topic_resource").insert({
          org_id: orgId,
          curriculum_topic_id: topicIds[0],
          kind: r.kind,
          label: r.label,
          url: r.url,
          description: null,
          sort_order: ri,
          added_by: principalId,
        });
        if (!rErr) resource_count++;
        else console.error(`topic_resource insert failed:`, rErr.message);
      }
    }

    seededSubjects.push({
      classSubjectId: cs!.id,
      sectionSubjectId: ss!.id,
      subjectName: spec.name,
      grade,
      sectionId: classRow.sectionId,
      teacherUserId,
      topicIds,
    });
  }
}
console.log(`  ✓ ${cs_count} class_subjects, ${ss_count} section_subjects (per-section teacher), ${cur_count} curricula, ${topic_count} topics, ${resource_count} topic resources`);

// ─── Tagged lessons + assignments + grades (Phase 5) ──────────────────
// Per section_subject we generate ~3 lessons (last 2 weeks) and 2
// assignments (one in past, one due soon), each tagged to a topic. Grades
// for the past assignment so the parent portal subject groups have real
// numbers to show.

const KINDS = ["quiz", "test", "homework", "project"] as const;
let lesson_count = 0;
let assignment_count = 0;
let grade_count = 0;

for (const sub of seededSubjects) {
  // Skip subjects with no topics — we want every lesson/assignment tagged.
  if (sub.topicIds.length === 0) continue;

  // 3 lessons across last 14 days, tagged to topics in rotation.
  for (let lIdx = 0; lIdx < 3; lIdx++) {
    const topicId = sub.topicIds[lIdx % sub.topicIds.length];
    const lessonDate = isoDate(daysAgo(randomInt(1, 14)));
    const { error: lErr } = await sb.from("lesson").insert({
      org_id: orgId,
      class_section_id: sub.sectionId,
      section_subject_id: sub.sectionSubjectId,
      curriculum_topic_id: topicId,
      lesson_date: lessonDate,
      title: `${sub.subjectName}: lesson ${lIdx + 1}`,
      body: `Today's class covered the topic in depth with practice problems.`,
      video_url: null,
      audio_url: null,
      attachments: [],
      taught_by: sub.teacherUserId,
    });
    if (!lErr) lesson_count++;
    else console.error(`lesson insert failed:`, lErr.message);
  }

  // 2 assignments: one in the past (graded), one due soon.
  const pastKind = randomChoice([...KINDS]);
  const pastDue = daysAgo(randomInt(3, 10));
  const { data: a1, error: a1Err } = await sb
    .from("assignment")
    .insert({
      org_id: orgId,
      class_section_id: sub.sectionId,
      section_subject_id: sub.sectionSubjectId,
      curriculum_topic_id: sub.topicIds[0],
      title: `${sub.subjectName} ${pastKind}`,
      kind: pastKind,
      description: null,
      max_score: 20,
      weight: 1.0,
      assigned_date: isoDate(daysAgo(14)),
      due_date: isoDate(pastDue),
      related_topic: null,
      created_by: sub.teacherUserId,
    })
    .select()
    .single();
  if (!a1Err && a1) {
    assignment_count++;
    // Grade every student in this section on the past assignment.
    for (const stu of studentsByGrade[sub.grade]) {
      // Pakistani-style: average ~70-80%, with variance.
      const score = randomInt(10, 19);
      const { error: gErr } = await sb.from("grade").insert({
        org_id: orgId,
        assignment_id: a1.id,
        student_id: stu.id,
        score,
        status: "graded",
        feedback: score >= 16 ? "Well done." : score >= 12 ? "Good effort." : "Needs revision.",
        graded_by: sub.teacherUserId,
        graded_at: daysAgo(randomInt(1, 5)).toISOString(),
      });
      if (!gErr) grade_count++;
    }
  } else if (a1Err) {
    console.error(`assignment insert failed:`, a1Err.message);
  }

  // Future assignment (ungraded; due in 5-10 days)
  const futureKind = randomChoice([...KINDS]);
  const futureTopic = sub.topicIds[1 % sub.topicIds.length];
  const { error: a2Err } = await sb.from("assignment").insert({
    org_id: orgId,
    class_section_id: sub.sectionId,
    section_subject_id: sub.sectionSubjectId,
    curriculum_topic_id: futureTopic,
    title: `${sub.subjectName} ${futureKind} — upcoming`,
    kind: futureKind,
    description: null,
    max_score: 25,
    weight: 1.0,
    assigned_date: isoDate(daysAgo(2)),
    due_date: isoDate(daysAgo(-randomInt(5, 10))),
    related_topic: null,
    created_by: sub.teacherUserId,
  });
  if (!a2Err) assignment_count++;
  else console.error(`assignment (future) insert failed:`, a2Err.message);
}
console.log(`  ✓ ${lesson_count} tagged lessons, ${assignment_count} tagged assignments, ${grade_count} grades`);

// ─── Summary ────────────────────────────────────────────────────────────
console.log(`
═══════════════════════════════════════════════════════════════════════════
🎉 Iqra Demo Academy seeded successfully.

🏫 SCHOOL
   Name:  ${orgName}
   ID:    ${orgId}
   URL:   https://iqraifs.com/school/orgs/${orgId}

👤 PRINCIPAL (your existing Supabase Auth account)
   Email:    ${PRINCIPAL_EMAIL}
   Password: (use your existing password)

👥 STAFF ACCOUNTS  (all share the password below)
   ${STAFF.map((s, i) => {
     const info = staffByKey.get(s.key)!;
     return `${s.role.padEnd(18)}  ${info.name.padEnd(20)}  ${info.email}`;
   }).join("\n   ")}

🔑 Shared staff password:  ${SHARED_PASSWORD}

🎓 STUDENTS  (${allStudents.length} total, all PIN: ${STUDENT_PIN_DEFAULT})
   Log in at: https://iqraifs.com/school-login
   Org slug:  ${orgSlug}
${[1,2,3,4,5].map((g) =>
`   Grade ${g}:  ${studentsByGrade[g].map((s) => `${s.name} (${s.gr})`).join(", ")}`
).join("\n")}

👪 PARENTS  (${parentRows.length} total, all PIN: ${PARENT_PIN_DEFAULT})
   Log in at: https://iqraifs.com/school-login (use phone as login identifier)
   ${parentRows.slice(0, 8).map((p) => `${p.name.padEnd(20)} ${p.phone}  → ${p.children.join(", ")}`).join("\n   ")}
   …and ${parentRows.length - 8} more.

📊 DEMO DATA
   - ${attendanceCount} attendance rows across 4 weeks
   - ${behaviorCount} behavior events (mix positive/concern)
   - ${hifzCount} hifz progress entries (grades 3-5)
   - ${feeCount} fee status rows (current + prior month)
   - ${rosterCount} pending roster change requests
   - ${cs_count} class subjects (Math/English/Urdu/Science/Islamiat/Quran per grade)
   - ${ss_count} per-section teacher assignments (Quran → Sheikh, others → class teacher)
   - ${cur_count} curricula for ${ACADEMIC_YEAR} with ${topic_count} topics
   - ${resource_count} topic resources (worksheet / video / quiz / PDF samples)
   - ${lesson_count} tagged lessons + ${assignment_count} tagged assignments
   - ${grade_count} grades across past assignments (avg ~70-80%)

🧹 CLEANUP
   When done: log in as principal → Settings → Danger Zone → Delete school.
   That cascade-deletes everything above. The staff Auth users remain
   (use the Supabase dashboard to delete them if needed).

═══════════════════════════════════════════════════════════════════════════
`);
