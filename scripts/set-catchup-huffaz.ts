// Catch Up's huffaz: revision track, and they already know all 30 paras.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/set-catchup-huffaz.ts [--apply]
//
// Catch Up is an academic class that mixes readers with children who
// have finished the Quran. With no track set, every child there was
// INFERRED as nazra, so a hafiz was being heard as a reader - one
// moving position instead of the sabaq / sabqi / manzil trio
// (Muneeb, 22 Sep; seven GRs supplied by the school).
//
// Two things are recorded, both facts:
//   quran_track = 'revision'      their daily card is the trio again
//   hifz_baseline_paras = 1..30   they arrived knowing the whole Quran,
//                                 and we have logged nothing for them
//
// hafiz_since is deliberately NOT stamped. It is the milestone, and the
// system's rule is that a human declares it - the teacher ticks
// "confirm hafiz" on the roster, or the school gives us the real
// khatam dates. Inventing today's date would claim seven children
// finished the Quran this afternoon.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");

const GRS = ["1626", "2251", "2404", "2405", "2456", "2470", "2475"];
const ALL_PARAS = Array.from({ length: 30 }, (_, i) => i + 1);

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: studs, error } = await sb.from("student")
  .select("id, gr_number, full_name, status, quran_track, hafiz_since, hifz_baseline_paras, class_section_id")
  .eq("org_id", ORG).in("gr_number", GRS);
if (error) { console.error(error.message); Deno.exit(1); }

// Only this class's children, and only active ones - a GR typo must not
// quietly move a child in some other section onto the revision track.
const { data: catchUp } = await sb.from("class")
  .select("id").eq("org_id", ORG).eq("name", "Catch Up").maybeSingle();
const { data: cuSecs } = await sb.from("class_section")
  .select("id").eq("class_id", (catchUp as any).id);
const cuSecIds = new Set((cuSecs ?? []).map((s: any) => s.id));

const todo: any[] = [];
const refused: string[] = [];
for (const gr of GRS) {
  const s = (studs ?? []).find((x: any) => String(x.gr_number) === gr) as any;
  if (!s) { refused.push(`GR ${gr}: no such student in this org`); continue; }
  if (s.status !== "active") { refused.push(`GR ${gr} ${s.full_name}: status is ${s.status}`); continue; }
  if (!cuSecIds.has(s.class_section_id)) { refused.push(`GR ${gr} ${s.full_name}: not in Catch Up`); continue; }
  const already = s.quran_track === "revision" &&
    Array.isArray(s.hifz_baseline_paras) && s.hifz_baseline_paras.length === 30;
  if (already) { console.log(`  GR ${gr} ${s.full_name} — already set, skipping`); continue; }
  todo.push(s);
}

console.log(`\n${todo.length} to set (of ${GRS.length} asked):`);
for (const s of todo) {
  console.log(`  GR ${String(s.gr_number).padEnd(6)} ${String(s.full_name).padEnd(26)} ` +
    `${s.quran_track ?? "(inferred nazra)"} -> revision, baseline -> paras 1-30`);
}
if (refused.length) {
  console.log("\nREFUSED:");
  for (const r of refused) console.log("  -", r);
}
if (refused.length) { console.log("\nNothing written - fix the list first."); Deno.exit(1); }

if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); Deno.exit(0); }

for (const s of todo) {
  const { error: e } = await sb.from("student")
    .update({ quran_track: "revision", hifz_baseline_paras: ALL_PARAS })
    .eq("id", s.id);
  if (e) { console.error(`write failed for GR ${s.gr_number}:`, e.message); Deno.exit(1); }
}
console.log(`\nSet ${todo.length} children to revision with the full baseline.`);
console.log("hafiz_since left unset - the teacher confirms the milestone, or send the khatam dates.");
