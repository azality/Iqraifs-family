// Seed 1st Assessment (2026-27) syllabi for Junior + Senior classes.
// Sources (WhatsApp from Head Teacher, 2026-08-24):
//   - Urdu_Syllabus_Worksheet.docx        -> Junior Urdu Writing + Ufaq Zakhera
//   - English_Syllabus.docx               -> Junior English Writing + Phonic Reader
//   - Mathematics_Worksheet_Syllabus.docx -> Junior Maths Writing
//   - first assessment syllabus class senior (1).docx -> Senior (all subjects)
// Idempotent: skips any (class, subject) that already has topics for 2026-27.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
) as any;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";

const PLAN: Record<string, Record<string, string[]>> = {
  Junior: {
    "Urdu Writing": [
      "حروف تہجی کی مکمل اشکال کی پہچان اور لکھائی (ا سے ی تک)",
      "حروف کی آدھی اشکال کی پہچان (ب سے ی تک)",
      "تصویر کا پہلا حرف لکھیں",
      "حروف کو تصویر سے ملائیں",
      "خالی جگہ پُر کریں",
      "حروف تہجی کی پوری اور آدھی اشکال",
      "حروف تہجی کو «ا» سے ملائیں (با سے یا)",
      "دو حرفی الفاظ",
      "«ا» کے الفاظ",
      "گنتی ہندسوں میں (1 سے 10 تک)",
    ],
    "Ufaq Zakhera (Urdu Reading)": [
      "افق ذخیرہ الفاظ (2)",
      "خالہ کا گھر",
      "آؤ مل جل کر کھیلیں",
    ],
    "English Writing": [
      "Write three letter words (ex: cat, pin) — IFS worksheets",
      "Vowels: a, e, i, o, u",
      "Write three letter words according to picture",
      "Phonograms (ex: shop, chip)",
      "What comes after",
      "What comes before",
      "Fill in the missing letter",
    ],
    "Phonic Reader": [
      "ORT (Oxford Reading Tree) Stage 3",
      "Phonic Reader",
    ],
    "Maths Writing": [
      "Number writing in figures (1 – 100) — IFS worksheets",
      "Backward counting (30 – 1)",
      "Write in words (1 – 10)",
      "What comes before",
      "What comes after / write missing numbers",
      "Simple addition — count & write",
    ],
  },
  Senior: {
    "English Writing": [
      "Write Aa to Zz",
      "Use of A and An",
      "Sh words",
      "Ch words",
      "Colours name",
      "Fill in the blank",
    ],
    "Maths Writing": [
      "Write counting (1 – 100)",
      "Backward counting (30 – 1)",
      "In words counting (1 – 10)",
      "Shapes name",
      "Addition (+)",
    ],
    "Urdu Writing": [
      "حروف تہجی ا سے ے تک",
      "حروف کو ا، و، ی، ے سے ملائیں",
      "رنگوں کے نام",
      "خالی جگہ پُر کریں",
      "حرف توڑیے جوڑیے",
    ],
    "Islamic Studies": [
      "حدیث نمبر 1، 2، 3",
      "سوالات 1 تا 7",
    ],
    "Deeniyat": [
      "کلمے 1 سے 4",
      "صبح شام کی خاص دعا",
      "سواری پر سوار ہوتے وقت کی دعا",
      "سواری سے اترتے وقت کی دعا",
      "مسجد میں داخل ہوتے وقت کی دعا",
      "ایمان مجمل",
    ],
    "Norani Qaidah": [
      "تختی نمبر 1 تا 9 — سبق تک یاد کریں",
    ],
    "Radiant Way Reading": [
      "Read pages 4 to 12",
    ],
    "1000 Picture Reading (G.K)": [
      "G.K: Our body parts",
      "G.K: Plants and trees",
      "G.K: Colours (from syllabus)",
      "1000 Pictures: The family",
      "1000 Pictures: It's time to wake up",
      "1000 Pictures: In the bathroom",
    ],
    "Ufaq Zakhera (Urdu Reading)": [
      "افق ذخیرہ الفاظ — پڑھائی صفحہ نمبر 1 تا 8",
    ],
  },
};

// created_by = Muneeb's admin account.
const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 500 });
const adminUser = users.users.find(
  (u: any) => (u.email ?? "").toLowerCase() === "muneeb@azality.com",
);
if (!adminUser) throw new Error("admin user not found");

for (const [className, subjects] of Object.entries(PLAN)) {
  const { data: cls } = await sb
    .from("class").select("id").eq("org_id", ORG).eq("name", className).single();
  if (!cls) { console.log(`SKIP class missing: ${className}`); continue; }
  for (const [subjectName, topics] of Object.entries(subjects)) {
    const { data: cs } = await sb
      .from("class_subject").select("id").eq("class_id", cls.id)
      .eq("name", subjectName).is("archived_at", null).maybeSingle();
    if (!cs) { console.log(`SKIP subject missing: ${className} / ${subjectName}`); continue; }
    let { data: cur } = await sb
      .from("curriculum").select("id").eq("class_subject_id", cs.id)
      .eq("academic_year", YEAR).maybeSingle();
    if (!cur) {
      const { data, error } = await sb.from("curriculum").insert({
        org_id: ORG,
        class_subject_id: cs.id,
        academic_year: YEAR,
        title: `${subjectName} · ${YEAR}`,
        description: "1st Assessment syllabus (Head Teacher, Aug 2026)",
        created_by: adminUser.id,
      }).select().single();
      if (error) { console.log(`FAIL curriculum ${className}/${subjectName}: ${error.message}`); continue; }
      cur = data;
    }
    const { count } = await sb
      .from("curriculum_topic").select("id", { count: "exact", head: true })
      .eq("curriculum_id", cur.id);
    if ((count ?? 0) > 0) {
      console.log(`SKIP already has ${count} topics: ${className} / ${subjectName}`);
      continue;
    }
    const rows = topics.map((name, i) => ({
      curriculum_id: cur.id, name, display_order: i,
    }));
    const { error: tErr } = await sb.from("curriculum_topic").insert(rows);
    console.log(
      tErr
        ? `FAIL topics ${className}/${subjectName}: ${tErr.message}`
        : `OK ${className} / ${subjectName}: ${topics.length} topics`,
    );
  }
}
console.log("done");
