// Merge the maths docx's chapter bullets and exercises UNDER the chapter
// rows the school typed by hand (29 Sep 2026).
//
// Ambreen: "class 4 math... the bullet points are still not in, they are
// the same one what the teacher entered". Classes IV-VII never got the
// file's bullets: the old upload collapsed them, so teachers typed the
// CHAPTERS in by hand - and in Class VII one is already ticked. So this
// does NOT replace anything. It keeps every existing row and its tick,
// matches each docx chapter to the school's own row BY NUMBER
// ("Chapter no 3" -> "Chapter 3: Fractions"), inserts the missing topic
// bullets and expanded exercises directly after it, deletes only the
// listed junk leftovers of the old broken import, and renumbers.
//
// Input: scratch/maths_sections.json - the docx's lines per class,
// produced by the Python extractor in the same session. Exercise lines
// expand through the app's own expandExerciseLine, so this and the
// upload can never disagree.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/merge-maths-chapter-topics.ts [--apply]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { expandExerciseLine } from "../src/utils/docxText.ts";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CLASS_OF: Record<string, string> = {
  "4": "Class IV", "5": "Class V", "6": "Class VI", "7": "Class VII",
};

// Leftovers of the OLD broken import, deleted only if not ticked.
const JUNK: Record<string, string[]> = {
  "Class IV": ["Mathematics Syllabus for 2nd assessment", "Fractions"],
  "Class V": ["Mathematics syllabus for 2nd Assessment", "Fractions"],
  "Class VI": ["Arithmetic"],
  "Class VII": [
    "Arithmetic",
    "Unit no 3 Decimal numbers Ex 3 Unit no 4 Squares and square roots Ex :4",
  ],
};

const CHAPTER_RE = /^(?:chapter|unit)\s*(?:no\.?)?\s*(\d+)\s*[:.\-]?\s*(.*)$/i;

interface DocxChapter { num: string; title: string; children: string[] }

/** The docx section's lines -> chapters with their topic/exercise children. */
function parseSection(lines: string[]): DocxChapter[] {
  const chapters: DocxChapter[] = [];
  let cur: DocxChapter | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(mathematics\s+)?syllabus\b/i.test(line)) continue;   // section heading
    if (/^topics?\s*[:\-]?$/i.test(line)) continue;             // cell column header
    const ch = CHAPTER_RE.exec(line);
    if (ch) {
      cur = { num: ch[1], title: ch[2].trim(), children: [] };
      chapters.push(cur);
      continue;
    }
    if (!cur) continue; // table group headers before the first chapter
    const ex = expandExerciseLine(line);
    if (ex) { cur.children.push(...ex); continue; }
    // A bare line right after the chapter number is its TITLE, not a topic.
    if (!cur.title && cur.children.length === 0) { cur.title = line; continue; }
    cur.children.push(line);
  }
  return chapters;
}

const sections: Record<string, string[]> =
  JSON.parse(await Deno.readTextFile("scratch/maths_sections.json"));

// The docx IS the 2nd Assessment syllabus, and Classes IV and VI carry the
// SAME chapter number in both terms (Chapter 7 twice). Without this, the
// dry run hung the new bullets under the 1st Assessment's finished
// chapter. Children may only attach to a 2nd Assessment row.
const { data: term2 } = await sb.from("academic_term").select("id")
  .eq("org_id", ORG).eq("name", "2nd Assessment").single();
const TERM2 = (term2 as any).id as string;

let inserted = 0, junkGone = 0, unmatched = 0;

for (const [token, lines] of Object.entries(sections)) {
  const className = CLASS_OF[token];
  if (!className) continue;
  const chapters = parseSection(lines);

  const { data: cur } = await sb
    .from("curriculum")
    .select("id, class_subject:class_subject_id!inner(name, class:class_id!inner(name, org_id))")
    .eq("class_subject.class.org_id", ORG)
    .eq("class_subject.class.name", className)
    .ilike("class_subject.name", "math%");
  const curriculumId = (cur ?? [])[0]?.id;
  if (!curriculumId) { console.log(`✗ ${className}: no maths curriculum — SKIP`); continue; }

  const { data: topics } = await sb
    .from("curriculum_topic")
    .select("id, name, display_order, completed, academic_term_id")
    .eq("curriculum_id", curriculumId)
    .order("display_order", { ascending: true });
  const rows = (topics ?? []) as any[];
  const have = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const junk = new Set((JUNK[className] ?? []).map((n) => n.toLowerCase()));

  console.log(`\n=== ${className} — ${rows.length} rows now`);

  // Rebuild the ordered list: keep every real row, hang new children off
  // the matching chapter, drop junk.
  type Planned = { id?: string; name: string; termId: string | null };
  const planned: Planned[] = [];
  const usedChapters = new Set<string>();
  for (const r of rows) {
    if (junk.has(r.name.trim().toLowerCase()) && !r.completed) {
      console.log(`  - junk removed: "${r.name.slice(0, 60)}"`);
      junkGone++;
      continue;
    }
    planned.push({ id: r.id, name: r.name, termId: r.academic_term_id });
    if (r.academic_term_id !== TERM2) continue;
    const ch = CHAPTER_RE.exec(r.name.trim());
    if (!ch) continue;
    const docx = chapters.find((c) => c.num === ch[1] && !usedChapters.has(c.num));
    if (!docx) continue;
    usedChapters.add(docx.num);
    for (const child of docx.children) {
      if (have.has(child.trim().toLowerCase())) continue;
      planned.push({ name: child, termId: r.academic_term_id });
      have.add(child.trim().toLowerCase());
      inserted++;
      console.log(`  + ${r.name.split(":")[0]}: ${child}`);
    }
  }
  for (const c of chapters) {
    if (!usedChapters.has(c.num)) {
      unmatched++;
      console.log(`  ! docx chapter ${c.num} (${c.title || "?"}) matched no school row — left out`);
    }
  }

  if (!APPLY) continue;
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    if (p.id) {
      const { error } = await sb.from("curriculum_topic")
        .update({ display_order: i + 1 }).eq("id", p.id);
      if (error) console.log(`  ✗ reorder failed: ${error.message}`);
    } else {
      const { error } = await sb.from("curriculum_topic").insert({
        curriculum_id: curriculumId, name: p.name,
        display_order: i + 1, completed: false, academic_term_id: p.termId,
      });
      if (error) console.log(`  ✗ insert failed: ${error.message}`);
    }
  }
  // Junk rows were left out of `planned`; remove them now.
  for (const r of rows) {
    if (junk.has(r.name.trim().toLowerCase()) && !r.completed) {
      await sb.from("curriculum_topic").delete().eq("id", r.id);
    }
  }
}

console.log(
  `\n${APPLY ? "Applied" : "Would apply"}: ${inserted} topics added under their chapters, ` +
  `${junkGone} junk rows removed, ${unmatched} docx chapters unmatched.`,
);
if (!APPLY) console.log("Dry run — re-run with --apply to write.");
