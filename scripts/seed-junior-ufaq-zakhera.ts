// Seed Junior "Ufaq Zakhera (Urdu Reading)" — whole-year syllabus from
// the head teacher's handwritten notebook pages (WhatsApp, 10 Sep 2026),
// titled «افق ذخیرہ الفاظ (سلسلہ نمبر 1)».
//
// Page ranges teach one (or two) Urdu letters each, in alphabet order.
// Junior has no assessments — topics carry NO academic_term_id, same as
// every other Junior subject (Deeniyat / Phonic Reader precedent).
//
// Transcription note: the letter on pages 58–59 is read as «ہ» (a plain
// circle in the handwriting; و would show a tail) — flagged to Muneeb
// to confirm with the head teacher.
//
// Idempotent: skips topics whose name already exists (case-insensitive).
//
//   deno run --allow-net --allow-env --env=.env scripts/seed-junior-ufaq-zakhera.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
) as any;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";

const TOPICS: Array<{ name: string }> = [
  { name: "صفحہ 1 تا 3 — حرف ب" },
  { name: "صفحہ 4 تا 6 — حرف پ" },
  { name: "صفحہ 7 تا 9 — حرف ت" },
  { name: "صفحہ 10 تا 11 — حرف ٹ" },
  { name: "صفحہ 12 — حرف ث" },
  { name: "صفحہ 13 تا 14 — حرف ج" },
  { name: "صفحہ 15 تا 16 — حرف چ" },
  { name: "صفحہ 17 تا 18 — حرف ح" },
  { name: "صفحہ 19 تا 20 — حرف خ" },
  { name: "صفحہ 21 تا 23 — حرف د" },
  { name: "صفحہ 24 تا 25 — حرف ڈ" },
  { name: "صفحہ 26 — حرف ذ" },
  { name: "صفحہ 27 تا 29 — حرف ر، ڑ" },
  { name: "صفحہ 30 تا 31 — حرف ز" },
  { name: "صفحہ 32 — حرف ژ" },
  { name: "صفحہ 33 تا 35 — حرف س" },
  { name: "صفحہ 36 تا 37 — حرف ش" },
  { name: "صفحہ 38 تا 39 — حرف ص، ض" },
  { name: "صفحہ 40 تا 41 — حرف ط، ظ" },
  { name: "صفحہ 42 تا 43 — حرف ع، غ" },
  { name: "صفحہ 44 تا 46 — حرف ف، ق" },
  { name: "صفحہ 47 تا 49 — حرف ک" },
  { name: "صفحہ 50 تا 51 — حرف گ" },
  { name: "صفحہ 52 تا 53 — حرف ل" },
  { name: "صفحہ 54 تا 55 — حرف م" },
  { name: "صفحہ 56 تا 57 — حرف ن" },
  { name: "صفحہ 58 تا 59 — حرف ہ" },
];

const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
const adminUser = users.users.find(
  (u: any) => (u.email ?? "").toLowerCase() === "muneeb@azality.com",
);
if (!adminUser) throw new Error("admin user not found");

const { data: cls } = await sb
  .from("class").select("id").eq("org_id", ORG).eq("name", "Junior").single();
if (!cls) throw new Error("Junior class missing");
const { data: cs } = await sb
  .from("class_subject").select("id").eq("class_id", cls.id)
  .eq("name", "Ufaq Zakhera (Urdu Reading)").is("archived_at", null).maybeSingle();
if (!cs) throw new Error("subject missing: Ufaq Zakhera (Urdu Reading)");

let { data: cur } = await sb
  .from("curriculum").select("id").eq("class_subject_id", cs.id)
  .eq("academic_year", YEAR).maybeSingle();
if (!cur) {
  const { data, error } = await sb.from("curriculum").insert({
    org_id: ORG,
    class_subject_id: cs.id,
    academic_year: YEAR,
    title: `Ufaq Zakhera (Urdu Reading) · ${YEAR}`,
    description:
      "افق ذخیرہ الفاظ (سلسلہ نمبر 1) — whole-year, page ranges by letter (Head Teacher notebook, 10 Sep 2026). Junior has no assessments.",
    created_by: adminUser.id,
  }).select("id").single();
  if (error) throw new Error(`curriculum: ${error.message}`);
  cur = data;
}

const { data: existing } = await sb
  .from("curriculum_topic").select("name, display_order").eq("curriculum_id", cur.id);
const have = new Set((existing ?? []).map((t: any) => t.name.trim().toLowerCase()));
let order = Math.max(0, ...((existing ?? []).map((t: any) => t.display_order ?? 0))) + 1;

let added = 0;
for (const t of TOPICS) {
  if (have.has(t.name.trim().toLowerCase())) continue;
  const { error } = await sb.from("curriculum_topic").insert({
    curriculum_id: cur.id,
    name: t.name,
    description: null,
    display_order: order++,
    academic_term_id: null,
  });
  if (error) throw new Error(`topic ${t.name}: ${error.message}`);
  added++;
}
console.log(`Junior / Ufaq Zakhera: +${added} (skipped ${TOPICS.length - added} existing)`);
