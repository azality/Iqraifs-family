// seed-term2-syllabus-c.ts — third batch of 2nd Assessment (میقات دوم)
// syllabi, from the five documents + the Urdu WhatsApp text sent 5 Sep 2026.
//
//   Second Assessment syllabus 26-27.docx  → Class I, every subject
//   Syllabus of science 4 and 5.docx       → Science, Classes IV–V
//   Syllabus of COMPUTER 4 till 8.docx     → Computer, Classes IV–VIII
//   Computer_Class_X_Syllabus_...docx      → Computer, Class X
//   Syllabus_of_2nd_Assessment.docx        → Social Studies IV–VIII + X
//   (pasted Urdu text)                     → Urdu, Classes IV–IX
//
//   npx deno run --allow-net --allow-env --env=.env scripts/seed-term2-syllabus-c.ts
//
// SAFETY: every topic is tagged academic_term_id = "2nd Assessment", so none
// of it counts toward 1st-Assessment pace (exams start 11 Sep).
//
// Text is stored VERBATIM. Regional-language spellings are the school's.
//
// Mapping decisions forced by how the school's subjects are set up:
//   • Class I has one "English" subject; the document splits English and
//     English (Grammar) — kept as a "Text:" / "Grammar:" topic prefix.
//   • Class I has one "Urdu" subject; the document splits اردو and
//     اردو(قواعد) — same treatment via the اسباق/نظم/مشق/قواعد prefixes.
//   • Class I spells it "Islamiat" and "Maths" (not Mathematics).
//   • Class X has no "Social Studies" — its equivalent is "Pakistan
//     Studies", which is where the document's "2nd Assessment of X" goes.
//   • The repeated "Working:-" / "مشق:-" / "سرگرمیاں:-" blocks (Q/A, F/B,
//     T/F, Exercises, Short Note) are exercise FORMATS, not lessons. Folded
//     into a single topic per subject so pace stays meaningful instead of
//     five near-identical rows per subject.
//
// UNCONFIRMED: the Urdu text's first block carried no class heading. The
// blocks that follow run پنجم(V) ہشتم(VI) ہفتم(VII) ہشتم(VIII) نہم(IX), so
// it is seeded as Class IV. Flagged for Ambreen to confirm.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";
const sb = createClient(URL_, SR) as any;

type Plan = { className: string; subject: string; topics: string[] };

const PLANS: Plan[] = [
  // ── Class I — "Second Assessment syllabus 26-27.docx" ───────────────
  {
    className: "Class I", subject: "English",
    topics: [
      "Text: Jen's shop",
      "Text: Mr fox and Mr goat",
      "Text: Roy's Toys",
      "Text: Poem — Betty Botter",
      "Text: Working — Words to learn, Words/Meaning, Q/A, Words/Sentences, Exercises",
      "Grammar: Use of This, That, These, Those",
      "Grammar: Use of (a or an)",
      "Grammar: Verb/Pronoun (Exercises)",
      "Grammar: Use of Simple Sentences",
      "Grammar: Reading comprehension",
      "Grammar: Picture Composition",
      "Grammar: Singular/Plural",
      "Grammar: Words/Opposite",
      "Grammar: Masculine/Feminine",
      "Grammar: Essay — My friend, My class",
    ],
  },
  {
    className: "Class I", subject: "Science",
    topics: [
      "All about me",
      "Characteristics of Organisms (Plants and materials)",
      "Light, Sound, Heat",
      "Working: Q/A, F/B, T/F, Exercises, Short Note",
    ],
  },
  {
    className: "Class I", subject: "Social Studies",
    topics: [
      "Unit 1 (Me and my world): My Home",
      "Unit 3 (Our Country): Our Flag",
      "Unit 3 (Our Country): Famous places of Pakistan",
      "Unit 3 (Our Country): Meet Quaid-e-Azam رحمتہ اللہ علیہ",
      "Working: Q/A, F/B, T/F, Exercises, Short Note",
    ],
  },
  {
    className: "Class I", subject: "Computer",
    topics: [
      "Cool machine and devices",
      "Fun with the keyboard",
      "The Clicky Mouse",
      "Working: Q/A, F/B, T/F, Exercises, Short Note",
    ],
  },
  {
    className: "Class I", subject: "Maths",
    topics: [
      "Forward Counting (101-400)",
      "Backward Counting (200-101)",
      "Inwards Counting (31-60)",
      "Tables (5, 6, 7)",
      "Dodging tables and inwards",
      "Multiplication (2, 3, 4, 5)",
      "Roman numbers",
      "Addition/Subtraction (2 digit with carry)",
      "Patterns",
      "Clock Digital/Analogue",
      "Calendar (Months name with no of days)",
      "Geometry: Money — (Coins Shading), (Addition/Subtraction of money)",
      "Geometry: 3D Shapes",
    ],
  },
  {
    className: "Class I", subject: "Urdu",
    topics: [
      "اسباق: پالتو جانور",
      "اسباق: میں علی ہوں",
      "اسباق: ٹریفک کے اشارے",
      "نظم: مزے کی سیر",
      "مشق: مشکل الفاظ، الفاظ/ معنی، سوال/ جواب، الفاظ /جملے، خالی جگہیں، صحیح /غلط",
      "قواعد: فعل کی تعریف اور مشق",
      "قواعد: گنتی (20-11)",
      "قواعد: واحد/جمع",
      "قواعد: مذکر/مونث",
      "قواعد: الفاظ/ضد",
      "قواعد: تصویری تفہیم",
      "قواعد: عبارتی تفہیم",
      "قواعد: مضمون (میرا سکول اور میرا گھر)",
      "قواعد: (یہ اور وہ) کا استعمال",
    ],
  },
  {
    className: "Class I", subject: "Islamiat",
    topics: [
      "بلند خوانی: سورۃ الکوثر اور سورۃ الناس",
      "بلند خوانی: مسجد میں داخل ہونے اور باہر نکلنے کی دعا",
      "بلند خوانی: حضرت موسی علیہ السلام کی دعا",
      "بلند خوانی: دعا (ربی زدنی علما)",
      "سبق: نبوّت ورِسالت",
      "سبق: اذان",
      "سبق: ہمارے پیارے نبی حضرت ُمحمد رسول اللہ خاتم النبی صلی اللہ علیہ وسلم",
      "سرگرمیاں: سوال/جواب، خالی/جگہیں، صحیح /غلط",
      "سرگرمیاں: اللّٰہ کے نام",
      "سرگرمیاں: سورۃ الناس کا ترجمہ",
      "سرگرمیاں: دعا ربی زدنی علما کا ترجمہ",
    ],
  },

  // ── Science IV–V — "Syllabus of science 4 and 5.docx" ───────────────
  {
    className: "Class IV", subject: "Science",
    topics: [
      "Chapter 1: Ecosystem",
      "Chapter 2: Human Health",
      "Chapter 3: Technology in Everyday Life",
    ],
  },
  {
    className: "Class V", subject: "Science",
    topics: [
      "Chapter 1: Microorganisms",
      "Chapter 2: Physical and Chemical Change of Matter",
      "Chapter 3: Flower and Seeds",
      "Chapter 4: Light",
    ],
  },

  // ── Computer IV–VIII — "Syllabus of COMPUTER 4 till 8.docx" ─────────
  {
    className: "Class IV", subject: "Computer",
    topics: [
      "Chapter 1: The Word Processing Studio",
      "Chapter 2: Making Presentation with PowerPoint 2016",
      "Chapter 3: Human verses AI",
    ],
  },
  {
    className: "Class V", subject: "Computer",
    topics: [
      "Chapter 1: Making MS Word",
      "Chapter 2: Expand PowerPoint Skill",
      "Chapter 3: Excel Essentials",
    ],
  },
  {
    className: "Class VI", subject: "Computer",
    topics: [
      "Chapter 1: Basic Programming in Device C++",
      "Chapter 2: Basic Programs in Dev C++",
      "Chapter 3: Web Development in MS Web Expression",
    ],
  },
  {
    className: "Class VII", subject: "Computer",
    topics: [
      "Chapter 1: Advanced MS Excel — Creating and Editing Chart",
      "Chapter 2: Advanced MS Access",
      "Chapter 3: CSS in Web Development",
    ],
  },
  {
    className: "Class VIII", subject: "Computer",
    topics: [
      "Chapter 1: Iteration Control Structure in Dev C++",
      "Chapter 2: Analysing and Presenting Data in MS Access",
      "Chapter 3: Function in C++",
    ],
  },
  // ── Computer X — "Computer_Class_X_Syllabus_..._Updated.docx" ───────
  {
    className: "Class X", subject: "Computer",
    topics: [
      "Theory: Control Structure",
      "Theory: Functions",
      "Practical: 2, 3, 4, 5",
    ],
  },

  // ── Social Studies IV–VIII + X — "Syllabus_of_2nd_Assessment.docx" ──
  {
    className: "Class IV", subject: "Social Studies",
    topics: [
      "Importance of culture",
      "State and Government",
      "Physical feature of Pakistan",
      "Needs and Resources",
      "G.K: Q/A",
      "Presentation + Assignment",
    ],
  },
  {
    className: "Class V", subject: "Social Studies",
    topics: [
      "Means of Communication",
      "The Great leader of Pakistan",
      "Natural disasters",
      "Goods and services",
      "G.K: Q/A",
      "Assignment + Presentation",
    ],
  },
  {
    className: "Class VI", subject: "Social Studies",
    topics: [
      "Buddha & Buddhism",
      "The Subcontinent in eight Century",
      "Agriculture in Pakistan",
      "Visiting Public Place",
      "G.K: Q/A",
      "Assignment + Presentation",
    ],
  },
  {
    className: "Class VII", subject: "Social Studies",
    topics: [
      "The Delhi Saltanath",
      "The Mughal Empire Begins",
      "Natural disasters",
      "Some major Cities in Asia",
      "G.K: Q/A",
      "Presentation + Assignment",
    ],
  },
  {
    className: "Class VIII", subject: "Social Studies",
    topics: [
      "Making of Pakistan",
      "Protection of human rights",
      "Cultural of Pakistan",
    ],
  },
  {
    // The document heads this "2nd Assessment of X" under Social studies;
    // Class X's subject of record is Pakistan Studies.
    className: "Class X", subject: "Pakistan Studies",
    topics: [
      "Education of Pakistan",
      "Cultural of Pakistan",
      "Land and Climate of Pakistan",
      "Industrial Development in Pakistan",
    ],
  },

  // ── Urdu IV–IX — pasted WhatsApp text ───────────────────────────────
  {
    // UNCONFIRMED class — see the header note.
    className: "Class IV", subject: "Urdu",
    topics: [
      "نظم: جوتے میں کیل",
      "نظم: نعت",
      "نثر: اف میرے دانت",
      "نثر: راشد منہاس شہید",
      "نثر: حضرت داؤ د علیہ السلام",
      "نثر: ہماری قومی زبان",
      "قواعد: تعریفیں۔محاورات۔واحد/جمع۔الفاظ/مترادف،الفاظ/ضد،مذکر/ مونث ،خط، درخواست،کہانی نویسی",
    ],
  },
  {
    className: "Class V", subject: "Urdu",
    topics: [
      "نظم: نعت",
      "نظم: پرندے کی فریاد",
      "نثر: اہل زمین عدالت عالیہ میں",
      "نثر: میرا پاکستان",
      "نثر: بوائے اسکاؤٹ گرلز گائیڈ",
      "نثر: ڈاکٹر روتھ فاؤ",
      "قواعد: تعریفیں،واحد/ جمع, تذکیر و تانیث, الفاظ /مترادف ،الفاظ/ متضاد ،محاورات،مضبوط نگاری،کہانی نویسی،خط،درخواست",
    ],
  },
  {
    className: "Class VI", subject: "Urdu",
    topics: [
      "نظم: نعت",
      "نظم: محنتی چیونٹی",
      "نثر: پاکستان ہمارا ملک",
      "نثر: سوار محمد حسین شہید",
      "نثر: حکیم محمد سعید",
      "نثر: بچے",
      "قواعد: تعریفیں۔محاورات۔واحد/جمع۔الفاظ/مترادف،الفاظ/ضد،مذکر/ مونث ،خط، درخواست،کہانی نویسی",
    ],
  },
  {
    className: "Class VII", subject: "Urdu",
    topics: [
      "نظم: نعت",
      "نظم: ادمی نامہ",
      "نثر: چچا چھکن نے ردی نکالی",
      "نثر: ایجادات",
      "نثر: ام المومنین حضرت خدیجہ رضی اللہ تعالی عنہا",
      "نثر: عبدالستار ایدھی",
      "قواعد: تعریفیں۔محاورات۔واحد/جمع۔الفاظ/مترادف،الفاظ/ضد،مذکر/ مونث ،خط، درخواست،کہانی نویسی،ضرب الامثال",
    ],
  },
  {
    className: "Class VIII", subject: "Urdu",
    topics: [
      "نظم: سر راہ شہادت",
      "نظم: نعت",
      "نثر: رشتہ ناتا",
      "نثر: سیانا بادشاہ",
      "نثر: اونہہ",
      "غزل: دہن پہ ہیں گماں کیسے کیسے",
      "قواعد: مراسلہ / خط،تعریفیں،محاورات،اصناف ادب",
    ],
  },
  {
    className: "Class IX", subject: "Urdu",
    topics: [
      "نظم: برسات کا تماشہ",
      "نظم: گرمی کی شدت",
      "نثر: بوڑھی کاکی",
      "نثر: رشتہ ناتا",
      "نثر: نام دیو مالی",
      "نثر: ڈسٹرکٹ بورڈ کی ڈسپنسری",
      "نثر: اوہہہ",
      "غزل: بہن پہ ہیں گھما کیسے کیسے",
      "غزل: ہر ایک بات پہ کہتے ہو تم کہ تو کیا ہے",
      "قواعد: مراسلہ / خط،تعریفیں،محاورات،اصناف ادب",
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
