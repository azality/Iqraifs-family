// Three children completed the Quran in September 2026.
//
// The school announced them by name for the دعائیہ تقریب on Saturday
// 19 September 2026: Bisma Sajid, Fahad Ansari and Aroush Azeem Khan.
//
// Marking them sets student.hafiz_since, which is what the exam syllabus
// reads to propose the whole Quran (Para 1-30) instead of inferring a
// portion from the log.
//
// Muskan Muhammad is NOT here. She looked like a fourth khatam in the
// data and the school corrected it: she has around half a para still to
// go, which is what her record already says.
//
// The DATE is the ceremony's, not the day each child finished, which the
// record does not reliably hold. Correct it per child in Student detail
// if the school knows better — it is a plain date field there.
//
// hafiz_confirmed_by is deliberately left null: the API sets it to the
// signed-in user who declares a child hafiz, and that was not a person
// here. Re-ticking the box in Student detail attributes it properly.
//
// Idempotent: a child already marked is left exactly as they are.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/mark-huffaz-sep-2026.ts

import { createClient } from "npm:@supabase/supabase-js@2";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const CEREMONY = "2026-09-19";

const NAMES = [
  "Bisma Sajid",
  "Fahad Ansari",
  "Aroush Azeem Khan",
];

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: students, error } = await admin
  .from("student")
  .select("id, full_name, gr_number, hafiz_since")
  .eq("org_id", ORG)
  .eq("status", "active")
  .in("full_name", NAMES);
if (error) throw new Error(`lookup: ${error.message}`);

const found = (students ?? []) as Array<
  { id: string; full_name: string; gr_number: string | null; hafiz_since: string | null }
>;

for (const name of NAMES) {
  const matches = found.filter((s) => s.full_name === name);
  if (matches.length === 0) {
    console.error(`  NOT FOUND  ${name} — check the spelling on the roll`);
    continue;
  }
  if (matches.length > 1) {
    // Never guess between two children with the same name.
    console.error(`  AMBIGUOUS  ${name} — ${matches.length} active students share it, skipped`);
    continue;
  }
  const s = matches[0];
  if (s.hafiz_since) {
    console.log(`  already     ${name} (GR ${s.gr_number}) — hafiz since ${s.hafiz_since.slice(0, 10)}`);
    continue;
  }
  const { error: upErr } = await admin
    .from("student").update({ hafiz_since: CEREMONY }).eq("id", s.id);
  if (upErr) throw new Error(`${name}: ${upErr.message}`);
  console.log(`  marked      ${name} (GR ${s.gr_number}) — hafiz since ${CEREMONY}`);
}

console.log("\nTheir exam portion is now the whole Quran, Para 1-30.");
