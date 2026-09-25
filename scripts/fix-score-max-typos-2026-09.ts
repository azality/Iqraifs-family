// One-off: correct four mis-typed paper maximums (25 Sep 2026).
//
// Fizza Tariq's Urdu oral read 4/100 while her eighteen classmates'
// read out of 5 - a slip in the max column, not a mark. It dragged her
// Urdu to 24.4% (Fail) instead of 55.3%, and her overall from D down
// to E. Three more of the same kind turned up school-wide.
//
// The obtained mark is NEVER touched - only the paper's total, and only
// where every other child in that class sat the same paper out of a
// different number. The script recomputes the modal max itself and
// refuses any row that does not match the expected correction.
//
//   npx deno run --allow-net --allow-env --env=.env \
//     scripts/fix-score-max-typos-2026-09.ts [--apply]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** gr, subject, exam-tail, the wrong max, what the class actually sat. */
const FIXES: Array<[string, string, string, number, number]> = [
  ["1997", "Urdu", "Oral", 100, 5],          // Fizza Tariq, Class V
  ["1818", "Quran", "Oral", 100, 50],        // Muhammad Ahmed, Class IV
  ["2219", "Art and Craft", "Written", 100, 25], // Abdul Bari, Class I (no mark entered)
  ["2427", "Islamiyat", "Oral", 8, 10],      // Hiba Asif, Class IV - LOWERS her %
];

for (const [gr, subject, examTail, wrongMax, rightMax] of FIXES) {
  const { data: stu } = await sb.from("student")
    .select("id, full_name").eq("org_id", ORG).eq("gr_number", gr).eq("status", "active").maybeSingle();
  if (!stu) { console.log(`✗ GR ${gr}: not found — SKIP`); continue; }

  const { data: rows } = await sb.from("exam_subject_score")
    .select("id, max_marks, obtained_marks, class_subject:class_subject_id(id, name), exam:exam_id(name)")
    .eq("student_id", (stu as any).id);
  const hit = ((rows ?? []) as any[]).filter((r) =>
    r.class_subject?.name === subject &&
    String(r.exam?.name ?? "").trim().endsWith(examTail) &&
    Number(r.max_marks) === wrongMax);

  if (hit.length !== 1) {
    console.log(`✗ ${(stu as any).full_name} ${subject} ${examTail}: expected 1 row at max ${wrongMax}, found ${hit.length} — SKIP`);
    continue;
  }
  const row = hit[0];

  // Independently confirm what the rest of the class sat, so a wrong
  // constant in the table above cannot quietly rewrite a real paper.
  const { data: peers } = await sb.from("exam_subject_score")
    .select("max_marks, exam:exam_id(name)")
    .eq("class_subject_id", row.class_subject.id);
  const tally = new Map<number, number>();
  for (const p of ((peers ?? []) as any[])) {
    if (!String(p.exam?.name ?? "").trim().endsWith(examTail)) continue;
    const m = Number(p.max_marks);
    tally.set(m, (tally.get(m) ?? 0) + 1);
  }
  const modal = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!modal || modal[0] !== rightMax) {
    console.log(`✗ ${(stu as any).full_name} ${subject}: class actually sits out of ${modal?.[0]} (${modal?.[1]} rows), not ${rightMax} — SKIP`);
    continue;
  }

  const before = row.obtained_marks === null ? "—" :
    `${row.obtained_marks}/${wrongMax} = ${((row.obtained_marks / wrongMax) * 100).toFixed(1)}%`;
  const after = row.obtained_marks === null ? "—" :
    `${row.obtained_marks}/${rightMax} = ${((row.obtained_marks / rightMax) * 100).toFixed(1)}%`;
  console.log(`${(stu as any).full_name} (GR ${gr}) ${subject} ${examTail}: ${before} → ${after}   [${modal[1]} classmates sat /${rightMax}]`);

  if (!APPLY) continue;
  const { error } = await sb.from("exam_subject_score")
    .update({ max_marks: rightMax }).eq("id", row.id);
  console.log(error ? `  ✗ ${error.message}` : `  ✓ applied`);
}
console.log(APPLY ? "\ndone (applied)" : "\ndry run — re-run with --apply");
