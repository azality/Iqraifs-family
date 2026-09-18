// The school's grading bands (لیاقت), from their own printed sheet.
//
//   ممتاز 80-100 · جید جدا 65-79 · جید 50-64 · مقبول 40-49 · راسب below 40
//
// Pass mark is 40. Read from the photo Muneeb sent on 18 Sep; the
// percentages on that sheet ARE the distribution, there is no separate
// per-component split.
//
// NOT set as the school's default scale: it is the madrasa scheme for
// the Hifz paper, and the main school's subjects may grade differently.
// Marked default from Assessment -> Grade scales if they want it
// everywhere.
//
// Idempotent: re-running updates the bands in place rather than adding a
// second scale.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/create-hifz-grade-scale.ts

import { createClient } from "npm:@supabase/supabase-js@2";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const SCALE_NAME = "Hifz — لیاقت";

/** Highest first, the way the sheet reads. `remark` carries the English
 *  gloss so a non-Urdu reader can still tell the bands apart. */
const BANDS = [
  { letter: "ممتاز", min_pct: 80, max_pct: 100, remark: "Mumtaz — excellent" },
  { letter: "جید جدا", min_pct: 65, max_pct: 79, remark: "Jayyid jiddan — very good" },
  { letter: "جید", min_pct: 50, max_pct: 64, remark: "Jayyid — good" },
  { letter: "مقبول", min_pct: 40, max_pct: 49, remark: "Maqbool — pass" },
  { letter: "راسب", min_pct: 0, max_pct: 39, remark: "Rasib — did not pass" },
];

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: existing, error: findErr } = await admin
  .from("grade_scale")
  .select("id, name, archived_at")
  .eq("org_id", ORG)
  .eq("name", SCALE_NAME)
  .maybeSingle();
if (findErr) throw new Error(`lookup: ${findErr.message}`);

let scaleId: string;
if (existing) {
  scaleId = (existing as { id: string }).id;
  if ((existing as { archived_at: string | null }).archived_at) {
    const { error } = await admin
      .from("grade_scale").update({ archived_at: null }).eq("id", scaleId);
    if (error) throw new Error(`unarchive: ${error.message}`);
  }
  console.log(`Scale already exists (${scaleId}) — refreshing its bands.`);
} else {
  const { data, error } = await admin
    .from("grade_scale")
    .insert({ org_id: ORG, name: SCALE_NAME, is_default: false })
    .select("id").single();
  if (error) throw new Error(`insert scale: ${error.message}`);
  scaleId = (data as { id: string }).id;
  console.log(`Created scale ${scaleId} — "${SCALE_NAME}"`);
}

// Replace the bands wholesale: five rows, and a partial edit would leave
// a gap in the percentage range.
const { error: delErr } = await admin
  .from("grade_scale_band").delete().eq("scale_id", scaleId);
if (delErr) throw new Error(`clear bands: ${delErr.message}`);

const { error: insErr } = await admin.from("grade_scale_band").insert(
  BANDS.map((b, i) => ({ ...b, scale_id: scaleId, display_order: i })),
);
if (insErr) throw new Error(`insert bands: ${insErr.message}`);

console.log(`Bands set (${BANDS.length}):`);
for (const b of BANDS) {
  console.log(`  ${b.letter.padEnd(9)} ${String(b.min_pct).padStart(3)}–${b.max_pct}  ${b.remark}`);
}
console.log("\nVisible at Assessment → Grade scales. Not the default scale.");
