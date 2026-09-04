// seed-assessment-datesheet.ts — the school's published "1st Assessment
// 2026-27 Written Time Table" (two documents: Classes I–III and IV–X).
//
//   npx deno run --allow-net --allow-env --env=.env scripts/seed-assessment-datesheet.ts
//
// Idempotent: upserts on (class_id, exam_date, subject_label). Subject
// labels are stored VERBATIM from the school's sheet ("Sst",
// "Pak.studies", "Computer/Biology"); class_subject_id is linked only
// when the label maps confidently to one of the class's subjects.
//
// Timings from the sheet: Mon–Thu & Sat 08:00–12:15, Fri 08:00–11:30.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const sb = createClient(URL_, SR) as any;

// ── The two documents, transcribed. "—" = no paper that day. ──────────
const DATES = [
  "2026-09-11", // Friday
  "2026-09-12", // Saturday
  "2026-09-14", // Monday
  "2026-09-15", // Tuesday
  "2026-09-16", // Wednesday
  "2026-09-17", // Thursday
  "2026-09-18", // Friday
  "2026-09-19", // Saturday
];

// Sheet 2 — Classes I–III (same paper each day; III adds Sindhi).
const JUNIOR: Record<string, Array<string | null>> = {
  "Class I":   ["Urdu", "Science", "English", "Math", "Computer", "Islamiat", "S.st", null],
  "Class II":  ["Urdu", "Science", "English", "Math", "Computer", "Islamiat", "S.st", null],
  "Class III": ["Urdu", "Science", "English", "Math", "Computer", "Islamiat", "S.st", "Sindhi"],
};

// Sheet 1 — Classes IV–X.
const SENIOR: Record<string, Array<string | null>> = {
  "Class IV":   ["Maths", "Sst", "Science", "Urdu", "English", "Computer", "Islamiat", "Sindhi"],
  "Class V":    ["Maths", "Sst", "Science", "Urdu", "English", "Computer", "Islamiat", "Sindhi"],
  "Class VI":   ["English", "Computer", "Maths", "Sst", "Islamiat", "Sindhi", "Urdu", "Science"],
  "Class VII":  ["English", "Computer", "Maths", "Sst", "Islamiat", "Sindhi", "Urdu", "Science"],
  "Class VIII": ["Sindhi", "Science", "Maths", "Islamiat", "Computer", "Urdu", "Pak. studies", "English"],
  "Class IX":   ["Urdu", "Maths", "English", "Computer/Biology", "Islamiat", "Chemistry", "Physics", null],
  "Class X":    ["Sindhi", "Maths", "Pak.studies", "English", "Physics", "Chemistry", "Computer/Biology", null],
};

// Sheet 3 — Class Senior. Its own document: NO Saturday papers, and
// several papers are combined ("Norani Qaidah/ Islamiyat"), so dates
// are listed explicitly rather than positionally.
const SENIOR_CLASS: Record<string, Array<[string, string]>> = {
  "Senior": [
    ["2026-09-11", "Maths writing"],
    ["2026-09-14", "Urdu writing"],
    ["2026-09-15", "Ufaq Zakhera / General Knowledge"],
    ["2026-09-16", "English writing"],
    ["2026-09-17", "1000 Picture Book / Radiant Way"],
    ["2026-09-18", "Norani Qaidah / Islamiyat"],
  ],
};

// Sandbox (the DEMO family's class) gets a matching demo datesheet so
// the parent portal demo shows the feature end-to-end. Sandbox is
// excluded from every real rollup, so this never touches school data.
const SANDBOX: Record<string, Array<string | null>> = {
  "Sandbox": ["Urdu", "Maths", "English", "Islamiyat", "Maths", "English", "Urdu", null],
};

const INSTRUCTIONS = [
  "Fee Clearance: All dues up to September 2026, including previous outstanding dues, along with Annual Fee 2026 must be cleared before the Assessment. Unpaid students will not be allowed to appear.",
  "No Re-Assessment will be conducted for absent students.",
  "Timings: Mon–Thu & Saturday 8:00 AM–12:15 PM · Friday 8:00 AM–11:30 AM.",
  "Students must arrive on time with the required stationery.",
];

// Friday is a short day.
const isFriday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 5;
const startTime = () => "08:00";
const endTime = (iso: string) => (isFriday(iso) ? "11:30" : "12:15");

// Best-effort label → class_subject match. Deliberately conservative:
// no guess links "Pak. studies" to "Social Studies" — the label stays
// verbatim and the link stays null rather than asserting something the
// school didn't say.
function matchSubject(label: string, subjects: Array<{ id: string; name: string }>): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const l = norm(label);
  const alias: Record<string, string[]> = {
    maths: ["maths", "math"],
    math: ["maths", "math"],
    sst: ["socialstudies"],
    sst2: [],
    islamiat: ["islamiat", "islamiyat"],
    pakstudies: ["pakistanstudies"],
    computerbiology: [], // elective split — no single subject
  };
  const candidates = new Set<string>([l, ...(alias[l] ?? [])]);
  for (const s of subjects) {
    const n = norm(s.name);
    if (candidates.has(n)) return s.id;
  }
  return null;
}

// ── Resolve fixtures ─────────────────────────────────────────────────
const { data: term } = await sb.from("academic_term")
  .select("id, name").eq("org_id", ORG).eq("name", "1st Assessment").maybeSingle();
if (!term) { console.error("1st Assessment term not found"); Deno.exit(1); }

const { data: classes } = await sb.from("class").select("id, name").eq("org_id", ORG);
const classId = new Map<string, string>(((classes ?? []) as any[]).map((c) => [c.name, c.id]));

const { data: subjRows } = await sb.from("class_subject")
  .select("id, name, class_id, class:class_id!inner(org_id)").eq("class.org_id", ORG).limit(500);
const subjectsByClass = new Map<string, Array<{ id: string; name: string }>>();
for (const s of (subjRows ?? []) as any[]) {
  const list = subjectsByClass.get(s.class_id) ?? [];
  list.push({ id: s.id, name: s.name });
  subjectsByClass.set(s.class_id, list);
}

// ── Build rows ───────────────────────────────────────────────────────
const rows: any[] = [];
let linked = 0, unlinked: string[] = [];
for (const sheet of [JUNIOR, SENIOR, SANDBOX]) {
  for (const [className, papers] of Object.entries(sheet)) {
    const cid = classId.get(className);
    if (!cid) { console.error(`class not found: ${className}`); continue; }
    const subjects = subjectsByClass.get(cid) ?? [];
    papers.forEach((label, i) => {
      if (!label) return;
      const csId = matchSubject(label, subjects);
      if (csId) linked++; else unlinked.push(`${className}/${label}`);
      rows.push({
        org_id: ORG, term_id: term.id, class_id: cid, class_subject_id: csId,
        subject_label: label, exam_date: DATES[i],
        start_time: startTime(), end_time: endTime(DATES[i]), notes: null,
      });
    });
  }
}

// Explicit-date sheets (Senior).
for (const [className, papers] of Object.entries(SENIOR_CLASS)) {
  const cid = classId.get(className);
  if (!cid) { console.error(`class not found: ${className}`); continue; }
  const subjects = subjectsByClass.get(cid) ?? [];
  for (const [date, label] of papers) {
    const csId = matchSubject(label, subjects);
    if (csId) linked++; else unlinked.push(`${className}/${label}`);
    rows.push({
      org_id: ORG, term_id: term.id, class_id: cid, class_subject_id: csId,
      subject_label: label, exam_date: date,
      start_time: startTime(), end_time: endTime(date), notes: null,
    });
  }
}

const { error } = await sb.from("exam_schedule")
  .upsert(rows, { onConflict: "class_id,exam_date,subject_label" });
if (error) { console.error("upsert:", error.message); Deno.exit(1); }

const { error: tErr } = await sb.from("academic_term")
  .update({ exam_instructions: INSTRUCTIONS }).eq("id", term.id);
if (tErr) console.error("instructions:", tErr.message);

const classCount = Object.keys(JUNIOR).length + Object.keys(SENIOR).length
  + Object.keys(SENIOR_CLASS).length + Object.keys(SANDBOX).length;
console.log(`datesheet: ${rows.length} papers across ${classCount} classes (incl. Sandbox demo)`);
console.log(`subject links: ${linked} linked, ${unlinked.length} label-only`);
for (const u of unlinked) console.log(`  label-only: ${u}`);
console.log(`instructions: ${INSTRUCTIONS.length} lines on "${term.name}"`);
