// One-off: give the Hifz half-yearly paper's rows their English twins,
// and correct the grade scale's name to کیفیت.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/name-hifz-paper-in-english.ts [--apply]
//
// The rows were seeded as the slip prints them, in Urdu, so the English
// marks sheet showed Urdu headings (Muneeb, 22 Sep). `name` still holds
// what the paper prints; `name_en` is the same row in English and the
// sheet picks whichever matches the reader.
//
// The English words are the ones the school's own teachers use when they
// speak English — transliterations, not translations: nobody calls لہجہ
// "intonation". Run it twice and nothing changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");

/** printed name → the English twin. */
const EN: Record<string, string> = {
  "سوال اول": "Question 1",
  "سوال دوم": "Question 2",
  "سوال سوم": "Question 3",
  "صفات و مخارج": "Sifaat & Makharij",
  "لہجہ": "Lahja",
  "مسائل": "Masail",
};

/** braced heading → its English twin. */
const GROUP_EN: Record<string, string> = {
  "حفظ القرآن": "Hifz al-Quran",
  "ناظرہ": "Nazra",
  "حفظ القرآن / ناظرہ": "Hifz al-Quran / Nazra",
};

// The school's own word for the grade column. Read as لیاقت off a
// photographed slip on 17 Sep; the school says کیفیت (22 Sep).
const OLD_SCALE = "Hifz — لیاقت";
const NEW_SCALE = "Hifz — کیفیت";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: comps, error } = await sb
  .from("exam_component")
  .select("id, name, name_en, group_label, group_label_en, exam:exam_id(name)")
  .eq("org_id", ORG).is("archived_at", null).order("sort_order");
if (error) { console.error(error.message); Deno.exit(1); }

const updates: Array<{ id: string; name_en: string; group_label_en: string | null; was: string }> = [];
const unknown: string[] = [];
for (const c of (comps ?? []) as any[]) {
  const en = EN[String(c.name).trim()];
  if (!en) { unknown.push(`${c.exam?.name ?? "?"} / ${c.name}`); continue; }
  const groupEn = c.group_label ? (GROUP_EN[String(c.group_label).trim()] ?? null) : null;
  if (c.name_en === en && c.group_label_en === groupEn) continue;
  updates.push({ id: c.id, name_en: en, group_label_en: groupEn, was: c.name });
}

console.log(`${(comps ?? []).length} rows on file · ${updates.length} to name`);
for (const u of updates) console.log(`  ${u.was.padEnd(16)} -> ${u.name_en}`);
if (unknown.length) {
  console.log("\nNo English twin known for (left alone — the sheet shows the printed name):");
  for (const u of unknown) console.log("  -", u);
}

const { data: scale } = await sb.from("grade_scale")
  .select("id, name").eq("org_id", ORG).eq("name", OLD_SCALE).maybeSingle();
console.log(scale ? `\ngrade scale "${OLD_SCALE}" -> "${NEW_SCALE}"` : `\ngrade scale already named "${NEW_SCALE}"`);

if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); Deno.exit(0); }

for (const u of updates) {
  const { error: e } = await sb.from("exam_component")
    .update({ name_en: u.name_en, group_label_en: u.group_label_en }).eq("id", u.id);
  if (e) { console.error("write failed:", e.message); Deno.exit(1); }
}
if (scale) {
  const { error: e } = await sb.from("grade_scale")
    .update({ name: NEW_SCALE }).eq("id", (scale as any).id);
  if (e) { console.error("scale rename failed:", e.message); Deno.exit(1); }
}
console.log(`\nNamed ${updates.length} rows${scale ? " and renamed the grade scale" : ""}.`);
