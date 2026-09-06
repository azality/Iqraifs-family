// seed-term2-science.ts — 2nd Assessment science syllabi, from
// "Syllabus of 2nd Assessment .docx" sent 6 Sep 2026.
//
//   npx deno run --allow-net --allow-env --env=.env scripts/seed-term2-science.ts
//
// Closes the science half of the gap list: Science VI–VIII, and
// Biology / Chemistry / Physics for IX and X.
//
// Classes VI–VIII carry ONE "Science" subject while the document splits
// it into Biological / Physical / Earth science, so that grouping is
// kept as a topic-name prefix (same treatment as Class III's Bio/Chem/
// Physics split). Classes IX and X have the three as real separate
// subjects, so they are seeded separately.
//
// The graded Activity and Presentation-chart items carry their marks in
// the topic name because that is how the school wrote them, and a
// teacher ticking coverage needs to see they are worth marks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";
const sb = createClient(URL_, SR) as any;

type Plan = { className: string; subject: string; topics: string[] };

const PLANS: Plan[] = [
  {
    className: "Class VI", subject: "Science",
    topics: [
      "Biological science — Unit 3: Balanced diet",
      "Physical science — Unit 7: Mixture",
      "Physical science — Unit 8: Energy",
      "Earth science — Technology in everyday life",
      "Activity (5 marks): Making cheese with milk and lemon juice, pg 134",
      "Activity (5 marks): How to make yogurt with the help of milk",
      "Presentation chart (10 marks): Balanced food web according to their percentages pyramid",
    ],
  },
  {
    className: "Class VII", subject: "Science",
    topics: [
      "Biological science — Unit 2: Human Respiratory System",
      "Physical science — Unit 6: Physical & Chemical Changes",
      "Physical science — Unit 10: Waves & Energy",
      "Physical science — Unit 11: Heat & Temperature",
      "Activity (5 marks): Making a sanitizer using isopropyl alcohol and hydrogen peroxide, pg 146",
      "Presentation chart (10 marks): Heat & Temperature — particle arrangement in solid, liquid and gas",
    ],
  },
  {
    className: "Class VIII", subject: "Science",
    topics: [
      "Biological science — Ch 2: Human Nervous System",
      "Physical science — Ch 7: Acid, Base and Salt",
      "Physical science — Ch 8: Force and Pressure",
      "Earth science — Ch 12: Technology in everyday life",
      "Presentation chart (10 marks): Electronic chart of CO2",
      "Activity (5 marks): The nature of compound with the help of litmus paper",
    ],
  },

  {
    className: "Class IX", subject: "Biology",
    topics: [
      "Ch 4: Cell and Tissues",
      "Ch 5: Cell Cycle",
      "Ch 6: Enzymes",
    ],
  },
  {
    className: "Class IX", subject: "Physics",
    topics: [
      "Turning effects",
      "Gravitation",
      "Properties of matter",
    ],
  },
  {
    className: "Class IX", subject: "Chemistry",
    topics: [
      "Chapter 3: Periodic Table and Periodicity of Properties",
      "Chapter 4: Chemical Bonding",
      "Chapter 5: Physical state",
    ],
  },

  {
    className: "Class X", subject: "Physics",
    topics: [
      "Geometrical optics",
      "Electrostatics",
      "Current electricity",
    ],
  },
  {
    className: "Class X", subject: "Chemistry",
    topics: [
      "Organic chemistry",
      "Biochemistry",
      "Environmental chemistry I",
    ],
  },
  {
    className: "Class X", subject: "Biology",
    topics: [
      "Support and movement",
      "Reproduction",
      "Inheritance",
    ],
  },
];

const { data: term } = await sb.from("academic_term")
  .select("id, name, is_current").eq("org_id", ORG).eq("name", "2nd Assessment").maybeSingle();
if (!term) { console.error("2nd Assessment term not found"); Deno.exit(1); }
if (term.is_current) {
  console.log(`note: "${term.name}" is already the CURRENT term — these topics count toward live pace immediately.`);
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
