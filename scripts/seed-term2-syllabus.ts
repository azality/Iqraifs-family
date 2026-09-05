// seed-term2-syllabus.ts — 2nd Assessment (میقات دوم) syllabi as sent by
// the school: Sindhi for Classes IV, V, VI, VII, VIII, X and Islamiyat
// for Classes VIII and IX.
//
//   npx deno run --allow-net --allow-env --env=.env scripts/seed-term2-syllabus.ts
//
// SAFETY: every topic is tagged academic_term_id = "2nd Assessment", so
// it does NOT count toward 1st-Assessment pace. That only holds once
// v1.0.95 ships — before it, /sections/:id/curriculum-progress and the
// teacher "my subjects" widget counted every topic regardless of term.
// Run this AFTER that deploy.
//
// Text is stored VERBATIM as the school sent it (including spellings
// like "ٺثو" / "ثپالي" / "ڦ سرمست" that look like keyboard slips) —
// correcting a syllabus on the school's behalf is their call, not ours.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";
const sb = createClient(URL_, SR) as any;

type Plan = { className: string; subject: string; topics: string[] };

const PLANS: Plan[] = [
  {
    className: "Class IV", subject: "Sindhi",
    topics: [
      "سبق ١: سنڌ",
      "سبق ٢: مڪلي جو سير",
      "سبق ٣: مور",
      "نظم: نعت",
      "قواعد: واحد/جمع، اکر/ضد، مذڪر/مونث",
      "انگ (١١-٢٠)",
      "تعريفون (اسم جي اقسام)",
      "مضمون: مور",
      "سنڌي - اردو ترجمو",
    ],
  },
  {
    className: "Class V", subject: "Sindhi",
    topics: [
      "سبق ١: شاھ ڪريم ڀلڙي وارو",
      "سبق ٢: حاتم طائي",
      "سبق ٣: ثيلويزن",
      "سبق ٤: شھري ۽ ڳوٺاڻو",
      "نظم: ڌڻي جي وڏائي",
      "قواعد: واحد/جمع، اکر/ضد، مذڪر/مونث",
      "انگ (٤٠-٥٠)",
      "تعريفون (صفت، صفت جي اقسام)",
      "خط",
      "مضمون: پيارو پاڪستان",
      "سنڌي - اردو ترجمو",
    ],
  },
  {
    className: "Class VI", subject: "Sindhi",
    topics: [
      "سبق ١: ٺثو",
      "سبق ٢: شھري شعور",
      "سبق ٣: سگھڙ زال",
      "سبق ٤: ثپالي",
      "نظم: نعت",
      "قواعد: واحد/جمع، اکر/ضد، مذڪر/مونث",
      "انگ (٦٠-٧٠)",
      "تعريفون",
      "مضمون",
      "درخواست",
      "خط",
      "سنڌي پيراگراف جو اردو ترجمو",
    ],
  },
  {
    className: "Class VII", subject: "Sindhi",
    topics: [
      "سبق ١: جنڊي جو ڪم",
      "سبق ٢: مليريا",
      "سبق ٣: وڏن جو چيو مڃجي",
      "سبق ٤: ٽيلفون",
      "سبق ٥: صحت جي سنڀال",
      "نظم: نعت",
      "قواعد: واحد/جمع، اکر/ضد، مذڪر/مونث",
      "تعريفون مثالن سان گڏ",
      "خط",
      "درخواست",
      "مضمون",
      "سنڌي پيراگراف جو اردو ترجمو",
    ],
  },
  {
    className: "Class VIII", subject: "Sindhi",
    topics: [
      "سبق ١: اجرڪ",
      "سبق ٢: ڪينجھر ڍنڍ",
      "سبق ٣: سنڌي ادب جي مختصر تاريخ",
      "سبق ٤: مولانا دين محمد وفائي",
      "سبق ٥: اتحاد، تنظيم، يقين محڪم",
      "نظم ١: سچل سرمست",
      "نظم ٢: پيارا وطن",
      "نظم ٣: نيڪي (مرڪزي خيال، حوالو، سمجھاڻي)",
      "قواعد: واحد/جمع، اکر/ضد، مذڪر/مونث",
      "تعريفون",
      "مضمون",
      "خط",
      "درخواست",
      "سنڌي پيراگراف جو اردو ترجمو",
    ],
  },
  {
    className: "Class X", subject: "Sindhi",
    topics: [
      "سبق ١: مائي خيري",
      "سبق ٢: ھنر دولت آھي",
      "سبق ٣: خط",
      "سبق ٤: بين الاقوامي عدالت",
      "سبق ٥: اجرڪ",
      "سبق ٦: ميرن جي دربار",
      "نظم ١: دعا",
      "نظم ٢: ڦ سرمست",
      "نظم ٣: پيارا وطن",
      "(مرڪزي خيال، حوالو، سمجهاڻي)",
      "قواعد: واحد/جمع، اکر/ضد، مذڪر/مونث",
      "تعريفون",
      "خط",
      "مضمون",
      "عبارتي تفهيم",
      "سنڌي پيراگراف جو اردو ترجمو",
    ],
  },
  {
    className: "Class VIII", subject: "Islamiyat",
    topics: [
      "آیات کا ترجمہ اور تشریح (٦ تا ١٠)",
      "احادیث کا ترجمہ اور تشریح (٦ تا ١٠)",
      "موضوعاتی مطالعہ ١: بعثت نبوی ﷺ",
      "موضوعاتی مطالعہ ٢: دعوت و تبلیغ",
      "موضوعاتی مطالعہ ٣: ہجرت مدینہ اور غزوات",
      "موضوعاتی مطالعہ ۴: علم کی اہمیت",
      "مشاہیر اسلام: حضرت ابو عبیدہ بن جراح رضی اللہ عنہ",
    ],
  },
  {
    className: "Class IX", subject: "Islamiyat",
    topics: [
      "آیات کا ترجمہ اور تشریح (۸ تا ١٦)",
      "احادیث کا ترجمہ اور تشریح (١١ تا ٢٠)",
      "موضوعاتی مطالعہ ١: جہاد",
      "موضوعاتی مطالعہ ٢: ہجرت مدینہ اور غزوات",
      "موضوعاتی مطالعہ ٣: اسلام میں خاندان کی اہمیت",
      "موضوعاتی مطالعہ ۴: مناقب اہل بیت اطہار رضی اللہ عنہ",
      "موضوعاتی مطالعہ ٥: خصال و شمال نبوی ﷺ",
      "موضوعاتی مطالعہ ٦: احترام انسانیت",
      "مشاہیر اسلام: جابر بن حیان",
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

let added = 0, skipped = 0;
for (const plan of PLANS) {
  const cid = classId.get(plan.className);
  if (!cid) { console.error(`class not found: ${plan.className}`); continue; }
  const { data: cs } = await sb.from("class_subject")
    .select("id").eq("class_id", cid).eq("name", plan.subject).maybeSingle();
  if (!cs) { console.error(`subject not found: ${plan.className} / ${plan.subject}`); continue; }

  let { data: cur } = await sb.from("curriculum")
    .select("id").eq("class_subject_id", cs.id).eq("academic_year", YEAR).maybeSingle();
  if (!cur) {
    const ins = await sb.from("curriculum")
      .insert({ org_id: ORG, class_subject_id: cs.id, academic_year: YEAR, title: `${plan.subject} · ${YEAR}` })
      .select().single();
    if (ins.error) { console.error(`curriculum ${plan.className}/${plan.subject}: ${ins.error.message}`); continue; }
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
  if (error) { console.error(`${plan.className}/${plan.subject}: ${error.message}`); continue; }
  added += rows.length;
  console.log(`${plan.className} ${plan.subject}: +${rows.length} topics (term "${term.name}")`);
}

console.log(`\ntotal: ${added} topics added, ${skipped} already present — all tagged to "${term.name}"`);
