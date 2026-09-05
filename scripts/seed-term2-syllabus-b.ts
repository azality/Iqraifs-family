// seed-term2-syllabus-b.ts — second batch of 2nd Assessment (میقات دوم)
// syllabi, from the three documents sent on 5 Sep 2026:
//
//   syllabus for 2nd assessment.docx        → Class III, every subject
//   Class_IX_Computer_Syllabus.docx         → Class IX Computer
//   2nd_Assessment_English_Syllabus_2026-27 → English, Classes IV–X
//
//   npx deno run --allow-net --allow-env --env=.env scripts/seed-term2-syllabus-b.ts
//
// SAFETY: every topic is tagged academic_term_id = "2nd Assessment", so it
// does NOT count toward 1st-Assessment pace. Requires v1.0.95+ (term-scoped
// pace); on the deployed v1.0.96 that holds.
//
// Text is stored VERBATIM as the school wrote it. Regional-language
// spellings are the school's, not typos — see the Sindhi note from Ambreen.
//
// Two structural notes, both forced by how the school's subjects are set up:
//   • Class III has ONE "Science" subject, but the document splits it into
//     Biology / Chemistry / Physics — kept as a prefix on the topic name.
//   • Class III has ONE "English" subject, but the document splits it into
//     English "A" (literature) and English "B" (grammar) — same treatment.
//   • Class III's Islamiyat subject is spelled "Islamiat"; Classes IV+ use
//     "Islamiyat". Both spellings appear below deliberately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";
const sb = createClient(URL_, SR) as any;

type Plan = { className: string; subject: string; topics: string[] };

const PLANS: Plan[] = [
  // ── Class III — "syllabus for 2nd assessment.docx" ──────────────────
  {
    className: "Class III", subject: "Science",
    topics: [
      "Biology: Ecosystem and Habitats",
      "Chemistry: Changing State of Matter",
      "Physics: Energy (Natural Source of Energy)",
    ],
  },
  {
    className: "Class III", subject: "Computer",
    topics: [
      "Organising Your Digital World (Files and Folders)",
      "Creating with Ms Word 2016 (Your Digital Notebook)",
      "More Fun with Scratch",
    ],
  },
  {
    className: "Class III", subject: "Social Studies",
    topics: [
      "Unit 2 (Rules and Responsibilities): Getting Along with Others",
      "Unit 2 (Rules and Responsibilities): Rules Keep us Safe",
      "Unit 2 (Rules and Responsibilities): Local Government and a Pledge",
      "Unit 3 (Our Country): The Rivers of Pakistan",
      "Unit 3 (Our Country): Our Quaid",
      "Unit 3 (Our Country): Allama Iqbal",
      "Unit 4 (The Earth and the Environment): The Weather and its Effects",
    ],
  },
  {
    className: "Class III", subject: "English",
    topics: [
      "English A — Chapter: Majid goes Shopping",
      "English A — Chapter: Three Language",
      "English A — Poem: The Letter",
      "English A — Poem: Hide and Seek",
      "English B — Adverb (Definition, Exercise)",
      "English B — Preposition (Definition, Exercise)",
      "English B — Forms of Verb",
      "English B — Composition",
      "English B — My Hobby",
      "English B — Application",
      "English B — Synonyms",
      "English B — Antonyms",
      "English B — Reading Comprehension",
      "English B — Translate. Past Indefinite (Negative, Affirmative)",
    ],
  },
  {
    className: "Class III", subject: "Maths",
    topics: [
      "Place Value",
      "Expanded Form",
      "Predecessor & Successor",
      "Ascending / Descending Order",
      "< , > , = Signs",
      "Addition / Subtraction (4 digits number)",
      "Skip Counting",
      "Multiplication / Division (Remainder / No Remainder)",
      "Fractions",
      "Tables (13 - 15)",
      "Money (Addition / Subtraction)",
      "Geometry: Length / Weight / Capacity",
      "Geometry: Draw Line Segments",
      "Geometry: 2D Shapes (Remaining)",
      "Geometry: Definitions / Perimeter",
    ],
  },
  {
    className: "Class III", subject: "Islamiat",
    topics: [
      "ناظرہ:9-16۔ پارہ نمبر .۔ دورود شریف۔ حدیث نبوی نمبر3۔ سورۃ الناس اور سورۃ الفلق",
      "سبق: قبلہ و مسجد",
      "سبق: حضرت محمد ﷺ رسول اللہ ﷺ کی صداقت و امانت داری، حسنِ معاملات",
      "سبق: حضرت محمد ﷺ رسول اللہ ﷺ کی رواداری اور صبر و تحمل",
      "سبق: سچ کی اہمیت",
      "سبق: گفتگو کے آداب",
    ],
  },
  {
    className: "Class III", subject: "Urdu",
    topics: [
      "سبق: دیانت داری) سیرت طیبہ",
      "سبق: جب عائشہ بیمار ہوئی",
      "سبق: میں بھی لوگوں کے کام اؤں گا",
      "نظم: کچھوے",
      "قواعد: اسے میں نکرہ اسے میں معرفہ کی تعریف میں مثالوں کے ساتھ",
      "تفہیم",
      "درخواست",
      "گنتی 51 سے 70",
      "نثر: واحد/ جمع،مذکر /مؤنث الفاظ /متضاد",
    ],
  },
  {
    className: "Class III", subject: "Sindhi",
    topics: [
      "١.ستون (ڦ)",
      "٢.اٺون (ڄ)",
      "٣.نائون (ڃ)",
      "٤.ڏھون (ڇ)",
      "٥.يارھون ( ڌ)",
      "٦.بارھون ( ڏ)",
      "قواعد: واحد/جمع، اکر/ضد، مذڪر/مونث، انگ (١١- ٢٠) ميون جا نالا، موسمن جا نالا",
      "زباني: حمد - واھدڙي تارا",
    ],
  },

  // ── Class IX Computer — "Class_IX_Computer_Syllabus.docx" ───────────
  {
    className: "Class IX", subject: "Computer",
    topics: [
      "Data Communication and Computer Networks",
      "Computer Security and Ethics",
      "Practical",
    ],
  },

  // ── English IV–X — "2nd_Assessment_English_Syllabus_2026-27.docx" ───
  {
    className: "Class IV", subject: "English",
    topics: [
      "Baba Yaga",
      "A Legend of Rübezahl",
      "Poem: Dreams",
      "Essay Writing",
      "Letter Writing",
      "Application",
      "Types of Noun with Examples",
      "Adjectives",
      "Definition Conjunction with Examples",
      "Subject and Predicate",
      "Types of Sentences",
      "Punctuation Paragraph",
      "Question Words (Wh-family)",
      "Sentence Formation (Basic)",
      "Perfect Tenses (Present, Past, Future)",
      "Word - Synonyms",
      "Word - Antonyms",
      "Passage - Picture Composition",
      "Story",
    ],
  },
  {
    className: "Class V", subject: "English",
    topics: [
      "Natasha's Doll",
      "Three Men in a Boat",
      "Poem: Leisure",
      "Essay Writing",
      "Letter Writing",
      "Application",
      "Types of Sentences",
      "Subject & Predicate",
      "Punctuation Paragraph",
      "Sentence Formation (Basic)",
      "Tenses (All Types)",
      "Modals (Can, Must, Should)",
      "Wh-family with Sentences",
      "Word - Synonyms",
      "Word - Antonyms",
      "Passage - Picture Composition - Story",
    ],
  },
  {
    className: "Class VI", subject: "English",
    topics: [
      "The Golden Crab",
      "The Flying Trunk",
      "Poem: The Snake",
      "Essay Writing",
      "Letter Writing",
      "Application",
      "Punctuation",
      "Article (with Ex) (R)",
      "Preposition (with Ex) (R)",
      "Tenses (All Types) (R)",
      "Transitive and Intransitive Verb",
      "Phrases and Clauses",
      "Modal Verb",
      "Determiners",
      "Sentence Transformation",
      "Subject-Verb Agreement",
      "Passage",
    ],
  },
  {
    className: "Class VII", subject: "English",
    topics: [
      "My Big Brother",
      "Meet Tom Sawyer",
      "Poem: English Is Tough",
      "Essay Writing",
      "Letter Writing",
      "Application",
      "Punctuation (R)",
      "E-mail Writing",
      "Modal Verbs",
      "Types of Sentences",
      "Tenses (All Types) (R)",
      "Word Formation",
      "Passage",
      "Paragraph Writing",
      "Idioms",
      "Passage - Story Completion",
    ],
  },
  // The document gives Classes VIII and IX one shared list.
  ...["Class VIII", "Class IX"].map((className) => ({
    className, subject: "English",
    topics: [
      "The Great Discoveries",
      "Health Problem Caused by Mosquitoes",
      "The Secret of Success",
      "Poem: Abu Ben Adhem",
      "Poem: The Miller of the Dee",
      "Essay Writing (with Types)",
      "Applications",
      "E-mail Writing",
      "Tenses (All Types) (R)",
      "Articles (R)",
      "Preposition (R)",
      "Types of Parts of Speech",
      "Word Formation / Idioms",
      "Paragraph Translation",
      "Unseen Passage",
      "Active & Passive Voice",
      "Past Papers",
    ],
  })),
  {
    className: "Class X", subject: "English",
    topics: [
      "Social Media",
      "A Bad Dream",
      "Speak Gently",
      "Essay Writing",
      "Letter Writing",
      "Tenses (All Types)",
      "Passive Voice / Active Voice",
      "Parts of Speech (All Types)",
      "Word Formation",
      "Paragraph Translation",
      "Passage",
      "Idioms",
      "Past Papers",
    ],
  },
];

// ── Fixtures ─────────────────────────────────────────────────────────
const { data: term } = await sb.from("academic_term")
  .select("id, name, is_current").eq("org_id", ORG).eq("name", "2nd Assessment").maybeSingle();
if (!term) { console.error("2nd Assessment term not found"); Deno.exit(1); }
if (term.is_current) {
  console.log(`note: "${term.name}" is already the CURRENT term — these topics will count toward live pace immediately.`);
}

const { data: classes } = await sb.from("class").select("id, name").eq("org_id", ORG);
const classId = new Map<string, string>(((classes ?? []) as any[]).map((c) => [c.name, c.id]));

let added = 0, skipped = 0, failed = 0;
for (const plan of PLANS) {
  const cid = classId.get(plan.className);
  if (!cid) { console.error(`class not found: ${plan.className}`); failed++; continue; }
  const { data: cs } = await sb.from("class_subject")
    .select("id").eq("class_id", cid).eq("name", plan.subject).maybeSingle();
  if (!cs) { console.error(`subject not found: ${plan.className} / ${plan.subject}`); failed++; continue; }

  let { data: cur } = await sb.from("curriculum")
    .select("id").eq("class_subject_id", cs.id).eq("academic_year", YEAR).maybeSingle();
  if (!cur) {
    const ins = await sb.from("curriculum")
      .insert({ org_id: ORG, class_subject_id: cs.id, academic_year: YEAR, title: `${plan.subject} · ${YEAR}` })
      .select().single();
    if (ins.error) { console.error(`curriculum ${plan.className}/${plan.subject}: ${ins.error.message}`); failed++; continue; }
    cur = ins.data;
  }

  const { data: existing } = await sb.from("curriculum_topic")
    .select("name, display_order").eq("curriculum_id", cur.id);
  const have = new Set(((existing ?? []) as any[]).map((t) => t.name));
  let order = Math.max(-1, ...((existing ?? []) as any[]).map((t) => t.display_order ?? 0)) + 1;

  const rows = plan.topics
    .filter((name) => { if (have.has(name)) { skipped++; return false; } return true; })
    .map((name) => ({
      curriculum_id: cur.id, name, display_order: order++,
      completed: false, academic_term_id: term.id,
    }));
  if (rows.length === 0) { console.log(`${plan.className} ${plan.subject}: already seeded`); continue; }
  const { error } = await sb.from("curriculum_topic").insert(rows);
  if (error) { console.error(`${plan.className}/${plan.subject}: ${error.message}`); failed++; continue; }
  added += rows.length;
  console.log(`${plan.className} ${plan.subject}: +${rows.length} topics (term "${term.name}")`);
}

console.log(`\ntotal: ${added} topics added, ${skipped} already present, ${failed} failed — all tagged to "${term.name}"`);
if (failed > 0) Deno.exit(1);
