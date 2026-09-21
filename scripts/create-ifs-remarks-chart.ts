// The main school's REMARKS CHART, from the printed report card.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/create-ifs-remarks-chart.ts [--apply]
//
// IFS had NO grade scale of its own, so every report card for Classes
// I-X fell back to the built-in bands in schoolReportCard.tsx. The
// letters happened to match, but the words did not: a child at 25% read
// "Unsatisfactory" instead of FAIL, and 60-69 read "Satisfactory"
// instead of the school's "Above Average" (Muneeb, 22 Sep).
//
// Their chart (photographed from the report card):
//
//   Excellent        A+   90% - 100%
//   Very Good        A    80% -  89%
//   Good             B    70% -  79%
//   Above Average    C    60% -  69%
//   Average          D    50% -  59%
//   Insatisfactory   F    40% -  49%     <- the card's own spelling
//   Fail             F    Below 40%
//
// Bands are stored half-open [min, max) - except the top, where 100 is
// inclusive - so each row's max is the next row's min. 89.4% is an A,
// 39.9% is a Fail.
//
// The school owns this: Assessment -> Grade scales edits every row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const SCALE_NAME = "IFS — Remarks chart";
const APPLY = Deno.args.includes("--apply");

// "Insatisfactory" is how the printed card spells it. We store the
// correct English; the school can change it in one click if they want
// their card's spelling back, and either way it is THEIR text now.
const BANDS = [
  { letter: "A+", min_pct: 90, max_pct: 100, remark: "Excellent", display_order: 0 },
  { letter: "A", min_pct: 80, max_pct: 90, remark: "Very Good", display_order: 1 },
  { letter: "B", min_pct: 70, max_pct: 80, remark: "Good", display_order: 2 },
  { letter: "C", min_pct: 60, max_pct: 70, remark: "Above Average", display_order: 3 },
  { letter: "D", min_pct: 50, max_pct: 60, remark: "Average", display_order: 4 },
  { letter: "F", min_pct: 40, max_pct: 50, remark: "Unsatisfactory", display_order: 5 },
  { letter: "F", min_pct: 0, max_pct: 40, remark: "Fail", display_order: 6 },
];

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: existing } = await sb.from("grade_scale")
  .select("id, name, is_default").eq("org_id", ORG).eq("name", SCALE_NAME).maybeSingle();
const { data: otherDefaults } = await sb.from("grade_scale")
  .select("id, name").eq("org_id", ORG).eq("is_default", true);

console.log(existing ? `scale exists: ${(existing as any).id}` : `will create "${SCALE_NAME}"`);
console.log("bands:");
for (const b of BANDS) {
  const upper = b.max_pct === 100 ? "100" : `${b.max_pct - 1}`;
  console.log(`  ${b.letter.padEnd(3)} ${String(b.min_pct).padStart(3)} - ${upper.padStart(3)}   ${b.remark}`);
}
const stale = ((otherDefaults ?? []) as any[]).filter((d) => d.id !== (existing as any)?.id);
if (stale.length) console.log("\nwill stop being the default:", stale.map((d) => d.name).join(", "));
console.log("\nThe Hifz paper keeps its own scale — it is attached to that exam directly.");

if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); Deno.exit(0); }

let scaleId = (existing as any)?.id as string | undefined;
if (!scaleId) {
  const { data, error } = await sb.from("grade_scale")
    .insert({ org_id: ORG, name: SCALE_NAME, is_default: true }).select("id").single();
  if (error) { console.error("create failed:", error.message); Deno.exit(1); }
  scaleId = (data as any).id;
} else if (!(existing as any).is_default) {
  await sb.from("grade_scale").update({ is_default: true }).eq("id", scaleId);
}
// One default per org.
for (const d of stale) await sb.from("grade_scale").update({ is_default: false }).eq("id", d.id);

// Rewrite the rows so a re-run always lands exactly this chart.
await sb.from("grade_scale_band").delete().eq("scale_id", scaleId);
const { error: bErr } = await sb.from("grade_scale_band")
  .insert(BANDS.map((b) => ({ ...b, scale_id: scaleId })));
if (bErr) { console.error("bands failed:", bErr.message); Deno.exit(1); }
console.log(`\nWrote "${SCALE_NAME}" with ${BANDS.length} bands, set as the org default.`);
