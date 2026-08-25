// Reception syllabus batch 2 (Head Teacher photos + text, 2026-08-25):
// Maths Written (formation rhymes 1-9, geometry, colours, lines) +
// Maths Oral, English Written add-ons + Oral + IFS phonics chart,
// Urdu Oral (appended to existing Urdu Writing formation topics).
// All whole-year (Reception has no assessments). Idempotent by topic name.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
) as any;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";

const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 500 });
const adminUser = users.users.find((u: any) => (u.email ?? "").toLowerCase() === "muneeb@azality.com");
const { data: cls } = await sb.from("class").select("id").eq("org_id", ORG).eq("name", "Reception").single();

async function appendTopics(subjectName: string, description: string, topics: string[]) {
  const { data: cs } = await sb.from("class_subject").select("id")
    .eq("class_id", cls.id).eq("name", subjectName).is("archived_at", null).maybeSingle();
  if (!cs) { console.log(`SKIP subject missing: ${subjectName}`); return; }
  let { data: cur } = await sb.from("curriculum").select("id")
    .eq("class_subject_id", cs.id).eq("academic_year", YEAR).maybeSingle();
  if (!cur) {
    const { data } = await sb.from("curriculum").insert({
      org_id: ORG, class_subject_id: cs.id, academic_year: YEAR,
      title: `${subjectName} · ${YEAR}`, description, created_by: adminUser.id,
    }).select().single();
    cur = data;
  }
  const { data: existing } = await sb.from("curriculum_topic")
    .select("name, display_order").eq("curriculum_id", cur.id);
  const have = new Set((existing ?? []).map((t: any) => t.name));
  let order = (existing ?? []).reduce((m: number, t: any) => Math.max(m, t.display_order ?? 0), -1) + 1;
  const rows = topics.filter((n) => !have.has(n)).map((name) => ({
    curriculum_id: cur.id, name, display_order: order++, academic_term_id: null,
  }));
  if (rows.length === 0) { console.log(`OK ${subjectName}: nothing new (${have.size} existing)`); return; }
  const { error } = await sb.from("curriculum_topic").insert(rows);
  console.log(error ? `FAIL ${subjectName}: ${error.message}` : `OK ${subjectName}: +${rows.length} topics (now ${have.size + rows.length})`);
}

await appendTopics(
  "Maths Writing",
  "Whole-year — Reception has no assessments. Number formation through rhymes, shapes, colours, lines + oral number work (Head Teacher, Aug 2026).",
  [
    "Formation rhyme: 1 is down and down",
    "Formation rhyme: 2 is round and sitting down",
    "Formation rhyme: 3 is round and round",
    "Formation rhyme: 4 is sitting on a chair",
    "Formation rhyme: 5 has a big tummy with a cap",
    "Formation rhyme: 6 is down and going round",
    "Formation rhyme: 7 is like a 7up",
    "Formation rhyme: 8 is like a snake",
    "Formation rhyme: 9 is round and coming down",
    "Geometry: Circle",
    "Geometry: Triangle",
    "Geometry: Square",
    "Geometry: Rectangle",
    "Concept of primary colours — Red, Yellow, Blue",
    "Lines: straight line",
    "Lines: broken line",
    "Lines: curve line",
    "Lines: spiral line",
    "Lines: zigzag line",
    "Lines: wavy line",
    "Oral: numbers 1–20 (Numbers in Jungle)",
    "Oral: concept of quantity 1–9",
    "Oral: recognition of numbers 1–9",
    "Oral: relate the number to the quantity",
    "Oral: concept of zero — '0' means nothing",
  ],
);

await appendTopics(
  "English Writing",
  "Whole-year — Reception has no assessments. Letter work + phonics sounds per the IFS phonics chart (Head Teacher, Aug 2026).",
  [
    "Trace & write the letters",
    "Match the same letter",
    "Relate the letter to the picture",
    "Oral: recognition of small letters a–z (sound and picture)",
    "Oral: phonics sounds a–z (a as in apple … z as in zebra, IFS phonics chart)",
  ],
);

await appendTopics(
  "Urdu Writing",
  "", // curriculum exists from the formation-rhymes batch; description kept.
  [
    "زبانی: حروف کی پہچان (ا سے ی) — اردو قاعدہ، آواز اور تصویروں کے ساتھ",
    "زبانی: ایک سے دس تک گنتی",
  ],
);

console.log("done");
