// Create the Hifz half-yearly exam (ششماہی امتحان) — Sat 17 Oct 2026.
//
// Source of the date: the school's own handwritten slip (photo, 17 Sep),
// whose header reads "17th October 2026 · بروز ہفتہ · ششماہی امتحان
// (Half yearly) Exam". 17 Oct 2026 is indeed a Saturday, and Hifz is the
// wing whose bell schedule runs Mon–Sat.
//
// Idempotent: re-running finds the existing exam by (org, term, name)
// and only fills in a missing date. Safe to run repeatedly.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/create-hifz-halfyearly-exam.ts

import { createClient } from "npm:@supabase/supabase-js@2";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const EXAM_NAME = "ششماہی امتحان — Half-yearly (Hifz)";
const EXAM_DATE = "2026-10-17";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// The term that actually contains the exam date — never "the current
// one", which would put an October paper in a term that ends in
// September.
const { data: terms, error: termErr } = await admin
  .from("academic_term")
  .select("id, name, start_date, end_date")
  .eq("org_id", ORG)
  .is("archived_at", null)
  .order("start_date");
if (termErr) throw new Error(`terms: ${termErr.message}`);

const term = (terms ?? []).find(
  (t: any) => t.start_date <= EXAM_DATE && EXAM_DATE <= t.end_date,
);
if (!term) {
  console.error(`No term contains ${EXAM_DATE}. Terms:`);
  for (const t of (terms ?? []) as any[]) {
    console.error(`  ${t.name}: ${t.start_date} → ${t.end_date}`);
  }
  Deno.exit(1);
}
console.log(`Term for ${EXAM_DATE}: ${(term as any).name}`);

const { data: existing } = await admin
  .from("exam")
  .select("id, name, exam_date, archived_at")
  .eq("org_id", ORG)
  .eq("term_id", (term as any).id)
  .eq("name", EXAM_NAME)
  .maybeSingle();

if (existing) {
  const row = existing as any;
  if (row.exam_date !== EXAM_DATE || row.archived_at) {
    const { error } = await admin
      .from("exam")
      .update({ exam_date: EXAM_DATE, archived_at: null })
      .eq("id", row.id);
    if (error) throw new Error(`update: ${error.message}`);
    console.log(`Exam already existed (${row.id}) — date set to ${EXAM_DATE}.`);
  } else {
    console.log(`Exam already exists and is correct: ${row.id}`);
  }
  Deno.exit(0);
}

const { data: created, error: insErr } = await admin
  .from("exam")
  .insert({
    org_id: ORG,
    term_id: (term as any).id,
    name: EXAM_NAME,
    // Half-yearly sits mid-year; 'final' is reserved for the year's last.
    exam_type: "midterm",
    weight: 1,
    exam_date: EXAM_DATE,
  })
  .select("id")
  .single();
if (insErr) throw new Error(`insert: ${insErr.message}`);

console.log(`Created exam ${(created as any).id} — "${EXAM_NAME}" on ${EXAM_DATE}`);
console.log("Next: Academics → Assessment → Exam syllabus, pick this exam + a Hifz section.");
