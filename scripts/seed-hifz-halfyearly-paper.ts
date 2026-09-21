// The Hifz half-yearly paper (17 Oct 2026), from the school's own slip.
//
//   عنوان                کل نمبر
//   سوال اول               20   ┐
//   سوال دوم               20   ├ حفظ القرآن / ناظرہ  (60)
//   سوال سوم               20   ┘
//   صفات و مخارج           20
//   لہجہ                   10
//   مسائل                  10
//   میزان                 100
//
// The three questions are NOT sabaq / sabqi / manzil. Ambreen, 18 Sep:
// "aisa nahi hota ke pehle hum sabaq mein se sunte hain, phir sabqi, phir
// manzil — woh overall jitna bhi syllabus mein hai hum utna sunte hain."
// Three questions from the child's whole memorised portion. And مسائل is
// Islamiyat's ten marks; Mutala is not examined at all.
//
// Also attaches the "Hifz — لیاقت" grade scale so the میزان names a band
// without anyone looking it up.
//
// Idempotent: re-running replaces the rows, and refuses if marks have
// already been entered against them.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/seed-hifz-halfyearly-paper.ts

import { createClient } from "npm:@supabase/supabase-js@2";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const EXAM_NAME = "ششماہی امتحان — Half-yearly (Hifz)";
// The school calls the grade column کیفیت (22 Sep). The earlier name
// came from my reading of a photographed slip.
const SCALE_NAME = "Hifz — کیفیت";
const QURAN = "حفظ القرآن / ناظرہ";
const QURAN_EN = "Hifz al-Quran / Nazra";

const ROWS = [
  // name = what the slip prints; name_en = the same row for an English
  // reader. Transliterations, because that is what the teachers say.
  { name: "سوال اول", name_en: "Question 1", group_label: QURAN, group_label_en: QURAN_EN, max_marks: 20 },
  { name: "سوال دوم", name_en: "Question 2", group_label: QURAN, group_label_en: QURAN_EN, max_marks: 20 },
  { name: "سوال سوم", name_en: "Question 3", group_label: QURAN, group_label_en: QURAN_EN, max_marks: 20 },
  { name: "صفات و مخارج", name_en: "Sifaat & Makharij", group_label: null, group_label_en: null, max_marks: 20 },
  { name: "لہجہ", name_en: "Lahja", group_label: null, group_label_en: null, max_marks: 10 },
  { name: "مسائل", name_en: "Masail", group_label: null, group_label_en: null, max_marks: 10 },
];

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: exam, error: examErr } = await admin
  .from("exam").select("id, name, grade_scale_id")
  .eq("org_id", ORG).eq("name", EXAM_NAME).is("archived_at", null).maybeSingle();
if (examErr) throw new Error(`exam: ${examErr.message}`);
if (!exam) throw new Error(`No exam named "${EXAM_NAME}" — run create-hifz-halfyearly-exam.ts first.`);
const examId = (exam as { id: string }).id;

// Refuse to disturb marks already entered.
const { data: existing } = await admin
  .from("exam_component").select("id").eq("exam_id", examId);
const ids = ((existing ?? []) as Array<{ id: string }>).map((r) => r.id);
if (ids.length > 0) {
  const { count } = await admin
    .from("exam_component_score").select("id", { count: "exact", head: true })
    .in("component_id", ids);
  if ((count ?? 0) > 0) {
    console.error(`${count} marks are already entered against this paper. Not touching it.`);
    Deno.exit(1);
  }
  const { error } = await admin.from("exam_component").delete().eq("exam_id", examId);
  if (error) throw new Error(`clear: ${error.message}`);
  console.log(`Replaced ${ids.length} existing rows (no marks entered yet).`);
}

const { error: insErr } = await admin.from("exam_component").insert(
  ROWS.map((r, i) => ({ ...r, org_id: ORG, exam_id: examId, sort_order: i })),
);
if (insErr) throw new Error(`insert: ${insErr.message}`);

// Attach the bands.
const { data: scale } = await admin
  .from("grade_scale").select("id").eq("org_id", ORG).eq("name", SCALE_NAME).maybeSingle();
if (!scale) {
  console.error(`No grade scale named "${SCALE_NAME}" — run create-hifz-grade-scale.ts.`);
} else if ((exam as { grade_scale_id: string | null }).grade_scale_id !== (scale as { id: string }).id) {
  const { error } = await admin
    .from("exam").update({ grade_scale_id: (scale as { id: string }).id }).eq("id", examId);
  if (error) throw new Error(`attach scale: ${error.message}`);
  console.log(`Attached grade scale "${SCALE_NAME}".`);
}

const total = ROWS.reduce((s, r) => s + r.max_marks, 0);
console.log(`\nPaper set for "${EXAM_NAME}":`);
for (const r of ROWS) {
  console.log(`  ${r.name.padEnd(14)} ${String(r.max_marks).padStart(3)}${r.group_label ? `   (${r.group_label})` : ""}`);
}
console.log(`  ${"میزان".padEnd(14)} ${String(total).padStart(3)}`);
