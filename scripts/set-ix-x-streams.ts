// One-off: Class IX and X stream choices, from the office (23 Sep).
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/set-ix-x-streams.ts [--apply]
//
// "Class 9th Bio students: Maryam Binte Talha, Kanza Fatima, Muhammad
//  Obaidullah, Muhammad Raheel, Shayan. Class 10th: Fizza tul zehra,
//  Saniya Abid. Class 9: 25 total, 5 bio 20 computer. Class 10: 19
//  total, 2 bio 17 computer."
//
// Sets elective_group = "Stream" on Biology and Computer in both
// classes, the five + two bio choices by GR, everyone else Computer.
// REFUSES unless the final tallies are exactly 5/20 and 2/17.
//
// The Biology columns' 21+17 stale "absent" stamps on computer
// children stop counting from the moment the choices exist - the rule
// filters them wherever marks are summed; no score rows are deleted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");
const GROUP = "Stream";

const BIO: Record<string, string[]> = {
  "Class IX": ["2080", "1788", "2461", "1254", "2206"],
  "Class X": ["2393", "1786"],
};
const EXPECT: Record<string, { bio: number; comp: number }> = {
  "Class IX": { bio: 5, comp: 20 },
  "Class X": { bio: 2, comp: 17 },
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

for (const clsName of ["Class IX", "Class X"]) {
  const { data: cls } = await db.from("class")
    .select("id,class_section(id)").eq("org_id", ORG).eq("name", clsName);
  const c = (cls ?? [])[0] as any;
  const { data: subs } = await db.from("class_subject")
    .select("id,name").eq("class_id", c.id).is("archived_at", null)
    .in("name", ["Biology", "Computer"]);
  const bioSub = (subs ?? []).find((s) => s.name === "Biology");
  const compSub = (subs ?? []).find((s) => s.name === "Computer");
  if (!bioSub || !compSub) { console.error(`${clsName}: Biology/Computer subject missing`); Deno.exit(1); }

  const secIds = c.class_section.map((s: any) => s.id);
  const { data: students } = await db.from("student")
    .select("id,gr_number,full_name").in("class_section_id", secIds).eq("status", "active");
  const bioGrs = new Set(BIO[clsName]);
  const bio = (students ?? []).filter((s) => bioGrs.has(String(s.gr_number)));
  const comp = (students ?? []).filter((s) => !bioGrs.has(String(s.gr_number)));
  if (bio.length !== EXPECT[clsName].bio || comp.length !== EXPECT[clsName].comp) {
    console.error(`${clsName}: tally ${bio.length} bio / ${comp.length} computer != school's ${EXPECT[clsName].bio}/${EXPECT[clsName].comp} - REFUSING`);
    for (const gr of bioGrs) {
      if (!(students ?? []).some((s) => String(s.gr_number) === gr)) console.error(`  bio GR ${gr} not on roll`);
    }
    Deno.exit(1);
  }
  console.log(`\n${clsName}: ${bio.length} Biology / ${comp.length} Computer`);
  for (const s of bio) console.log(`  BIO  ${s.gr_number} ${s.full_name}`);

  if (!APPLY) continue;
  for (const sub of [bioSub, compSub]) {
    await db.from("class_subject").update({ elective_group: GROUP }).eq("id", sub.id);
  }
  const rows = [
    ...bio.map((s) => ({ student_id: s.id, class_subject_id: bioSub.id })),
    ...comp.map((s) => ({ student_id: s.id, class_subject_id: compSub.id })),
  ];
  // one choice per group: clear both subjects' rows, then insert
  await db.from("student_subject_choice").delete()
    .in("class_subject_id", [bioSub.id, compSub.id]);
  const { error } = await db.from("student_subject_choice")
    .insert(rows.map((r) => ({ org_id: ORG, ...r })));
  if (error) { console.error(`write failed: ${error.message}`); Deno.exit(1); }
  console.log(`  ${rows.length} choices written; Biology+Computer grouped as "${GROUP}"`);
}
if (!APPLY) console.log("\nDry run - re-run with --apply to write.");
