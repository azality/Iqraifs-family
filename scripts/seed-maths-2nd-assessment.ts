// Maths 2nd Assessment syllabus, Classes IV–X (doc: "syllabus/mathematics
// syllabus 2026-2027 2nd Assessment.docx", received 2026-09-01).
//
// Every topic is tagged academic_term_id = the org's "2nd Assessment"
// term, so loading it now does NOT pollute 1st-Assessment coverage/pace
// numbers (term-aware rollups count only current-term + untagged topics).
//
// Collisions with already-seeded 1st-Assessment topics are renamed
// (the seeder skips case-insensitive duplicate names):
//   - Class IV  Ch 7 Geometry      -> suffixed with its actual content
//   - Class VI  Ch 7 Intro Algebra -> "(continued)"
//   - Class VII Unit 8 Algebraic Identities -> SKIPPED (identical name +
//     same Ex 8 already seeded in 1st Assessment; flagged to Muneeb)
//   - VIII/IX/X "Theorems"         -> "Theorems — 2nd Assessment"
//   - Class X   Ch 18 Variations   -> Ex range in name (1st already
//     claims Ex 18.1–18.7; source conflict flagged to Muneeb)
//
//   deno run --allow-net --allow-env --env=.env scripts/seed-maths-2nd-assessment.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG_ID = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const YEAR = "2026-27";

type Topic = { name: string; description?: string };
const PLAN: Array<{ className: string; topics: Topic[] }> = [
  {
    className: "Class IV",
    topics: [
      { name: "Chapter 3: Fractions", description: "Like and unlike fractions; Equivalent fractions; Comparing fractions; Ordering fractions; Types of fractions; Addition and subtraction of fractions; Multiplication and division of fractions" },
      { name: "Chapter 4: Decimals", description: "Decimal places; Decimals and fractions; Multiplication of decimal by whole number; Division of decimal by whole number" },
      { name: "Chapter 7: Geometry — Angles, Circle, Quadrilateral", description: "Angles and types of angles; Measuring angles using the protractor; Drawing angles; Circle; Quadrilateral" },
    ],
  },
  {
    className: "Class V",
    topics: [
      { name: "Chapter 3: Fractions", description: "Addition and subtraction of fractions; Multiplication and division of fractions by whole number and by another fraction; Multiplication and division of fractions involving brackets; Application of BODMAS rule on fractions" },
      { name: "Chapter 4: Decimals and Percentages", description: "Comparing and ordering of decimals; Addition and subtraction of decimals; Multiplication and division of decimals; Rounding of decimals; Percentage; Conversion of percentage into decimals and fractions" },
      { name: "Chapter 8: Perimeter and Area", description: "Perimeter of squares and rectangles; Area of squares and rectangles; Use formula to find perimeter and area" },
    ],
  },
  {
    className: "Class VI",
    topics: [
      { name: "Chapter 3: Factors and Multiples", description: "Factors; Tests of divisibility; Multiples; Prime and composite numbers" },
      { name: "Chapter 4: HCF and LCM", description: "Prime and composite factorization; Highest common factor; Least common multiple" },
      { name: "Chapter 7: Introduction to Algebra (continued)", description: "Addition and subtraction of algebraic expressions; Simplification; Number sequences" },
      { name: "Chapter 11: Triangles", description: "Triangle and its types; Interior and exterior angles; Properties" },
      { name: "Chapter 12: Perimeter and Area", description: "Perimeter; Area and its units; Measurement of area using formula" },
    ],
  },
  {
    className: "Class VII",
    topics: [
      { name: "Unit 3: Decimal Numbers", description: "Ex: 3" },
      { name: "Unit 4: Squares and Square Roots", description: "Ex: 4" },
      // Unit 8: Algebraic Identities (Ex 8) intentionally omitted — already
      // seeded under 1st Assessment with the same exercise; confirm with
      // school whether it is re-examined or was mis-listed.
      { name: "Unit 9: Factorization of Algebraic Expressions", description: "Ex: 9a, 9b" },
      { name: "Unit 13: Circles", description: "Ex: 13a, 13c" },
      { name: "Unit 14: Perimeter and Area", description: "Ex: 14a, 14b" },
    ],
  },
  {
    className: "Class VIII",
    topics: [
      { name: "Chapter 3: Algebraic Expressions and Formulas", description: "Ex 3.1 – 3.4" },
      { name: "Chapter 4: Factorization", description: "Ex 4.1 – 4.5" },
      { name: "Chapter 16: Introduction to Quadratic Geometry", description: "Ex 16.1 – 16.2 (source wording; possibly 'Coordinate Geometry' — confirm with school)" },
      { name: "Theorems — 2nd Assessment", description: "As given in book" },
    ],
  },
  {
    className: "Class IX",
    topics: [
      { name: "Chapter 3: Algebraic Expressions and Formulas", description: "Ex 3.1 – 3.4" },
      { name: "Chapter 4: Factorization", description: "Ex 4.1 – 4.8" },
      { name: "Chapter 16: Introduction to Quadratic Geometry", description: "Ex 16.1 – 16.3 (source wording; possibly 'Coordinate Geometry' — confirm with school)" },
      { name: "Theorems — 2nd Assessment", description: "As given in book" },
    ],
  },
  {
    className: "Class X",
    topics: [
      { name: "Chapter 18: Variations (Ex 18.5 – 18.7)", description: "Source overlap: 1st Assessment topic already lists Ex 18.1 – 18.7 — confirm split with school" },
      { name: "Chapter 20: Theory of Quadratic Equations", description: "Ex 20.1 – 20.7" },
      { name: "Chapter 21: Partial Fractions", description: "Ex 21.1 – 21.4" },
      { name: "Chapter 30: Introduction to Trigonometry", description: "Ex 30.1 – 30.5" },
      { name: "Theorems — 2nd Assessment", description: "As given in book" },
    ],
  },
];

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
) as any;

// Resolve the 2nd Assessment term — create it if the school hasn't yet.
// is_current stays false, so current-term rollups are untouched; dates
// are a starting guess (day after 1st Assessment ends) the admin can
// adjust in Settings → Terms.
const { data: terms, error: termErr } = await sb
  .from("academic_term")
  .select("id, name, start_date, end_date, academic_year_id, is_current")
  .eq("org_id", ORG_ID)
  .is("archived_at", null);
if (termErr) { console.error(termErr); Deno.exit(1); }
let term = (terms ?? []).find((t: any) => /2nd/i.test(t.name));
if (!term) {
  const first = (terms ?? []).find((t: any) => /1st/i.test(t.name));
  if (!first) { console.error("No 1st Assessment term to anchor on. Terms:", terms); Deno.exit(1); }
  const start = new Date(`${first.end_date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const startDate = start.toISOString().slice(0, 10);
  const { data: created, error: cErr } = await sb
    .from("academic_term")
    .insert({
      org_id: ORG_ID,
      academic_year_id: first.academic_year_id,
      name: "2nd Assessment",
      start_date: startDate,
      end_date: "2027-03-31",
      is_current: false,
    })
    .select("*")
    .single();
  if (cErr) { console.error("term insert failed:", cErr.message); Deno.exit(1); }
  term = created;
  console.log(`Created term "2nd Assessment" ${startDate} → 2027-03-31 (not current; dates adjustable in UI)`);
}
console.log(`Tagging topics to term: ${term.name} (${term.id})`);

const { data: subs, error: sErr } = await sb
  .from("class_subject")
  .select("id, name, class:class_id(name)")
  .eq("org_id", ORG_ID);
if (sErr) { console.error(sErr); Deno.exit(1); }

for (const p of PLAN) {
  const cs = (subs ?? []).find(
    (s: any) => s.class?.name === p.className && /^math(s|ematics)?$/i.test(s.name),
  );
  if (!cs) { console.log(`${p.className}: no Maths subject — SKIPPED`); continue; }

  const { data: cur } = await sb
    .from("curriculum")
    .select("id")
    .eq("class_subject_id", cs.id)
    .eq("academic_year", YEAR)
    .maybeSingle();
  if (!cur) { console.log(`${p.className}: no ${YEAR} curriculum — SKIPPED (expected one from 1st Assessment)`); continue; }

  const { data: existing } = await sb
    .from("curriculum_topic")
    .select("name, display_order")
    .eq("curriculum_id", cur.id);
  const have = new Set((existing ?? []).map((r: any) => String(r.name).toLowerCase()));
  const startOrder = (existing ?? []).reduce(
    (m: number, r: any) => Math.max(m, r.display_order ?? 0), -1,
  ) + 1;

  const rows = p.topics
    .filter((t) => !have.has(t.name.toLowerCase()))
    .map((t, i) => ({
      curriculum_id: cur.id,
      name: t.name,
      description: t.description ?? null,
      target_date: null,
      display_order: startOrder + i,
      academic_term_id: term.id,
    }));
  const skipped = p.topics.length - rows.length;
  if (rows.length === 0) { console.log(`${p.className}: all ${p.topics.length} topics already present — skipped`); continue; }
  const { error: tErr } = await sb.from("curriculum_topic").insert(rows);
  console.log(tErr
    ? `${p.className}: FAILED: ${tErr.message}`
    : `${p.className}: ${rows.length} topics added (term-tagged)${skipped ? `, ${skipped} name-collision skipped` : ""}`);
}
