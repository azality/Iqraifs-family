// Expand already-imported exercise lines into one tickable topic each
// (28 Sep 2026).
//
// The maths syllabus was uploaded BEFORE the parser learned to split an
// exercise list, so the office is looking at rows like
//
//     Ex :20.1,20.2 ,20.3 ,20.4,…….20.7
//
// where Ambreen asked for "2.1 exercise, phir 2.2 exercise" - one caption
// per exercise. Re-uploading would not mend these: dedupe stops duplicates
// but leaves the squashed row sitting there. This rewrites them in place so
// nobody has to delete a class's syllabus and start again.
//
// It imports expandExerciseLine from the app itself, so the repair and the
// upload can never disagree about what an exercise line means.
//
// Safe by construction:
//   - only rows that expandExerciseLine claims are exercise lists
//   - only rows NOT yet ticked; a teacher's progress is never rewritten
//   - the original row becomes the first exercise, so its id survives
//   - display_order is renumbered per curriculum, keeping every topic's
//     position and the exercises directly under their chapter
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/expand-curriculum-exercises.ts [--apply]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { expandExerciseLine } from "../src/utils/docxText.ts";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: curricula, error: cErr } = await sb
  .from("curriculum")
  .select("id, class_subject:class_subject_id(name, class:class_id(name))")
  .eq("org_id", ORG);
if (cErr) { console.error(cErr.message); Deno.exit(1); }

let expandedRows = 0, newTopics = 0, skippedTicked = 0;

for (const cur of (curricula ?? []) as any[]) {
  const label = `${cur.class_subject?.class?.name ?? "?"} / ${cur.class_subject?.name ?? "?"}`;
  const { data: topics } = await sb
    .from("curriculum_topic")
    .select("id, name, description, display_order, completed, academic_term_id")
    .eq("curriculum_id", cur.id)
    .order("display_order", { ascending: true });
  const rows = (topics ?? []) as any[];
  if (!rows.length) continue;

  // Build what this curriculum SHOULD look like, in order.
  const planned: Array<{ id?: string; name: string; description: string | null; completed: boolean; termId: string | null }> = [];
  let touched = false;
  for (const t of rows) {
    const parts = expandExerciseLine(t.name);
    if (!parts || parts.length < 2) {
      // Not an exercise list, or a single exercise already - leave it be.
      planned.push({ id: t.id, name: t.name, description: t.description, completed: t.completed, termId: t.academic_term_id });
      continue;
    }
    if (t.completed) {
      // A teacher has ticked this line. Splitting it would either lose
      // that tick or invent five. Leave it and say so.
      console.log(`!  ${label}: "${t.name}" is already ticked — left alone`);
      skippedTicked++;
      planned.push({ id: t.id, name: t.name, description: t.description, completed: t.completed, termId: t.academic_term_id });
      continue;
    }
    touched = true;
    expandedRows++;
    console.log(`~  ${label}: "${t.name}"`);
    parts.forEach((p, i) => {
      console.log(`     → ${p}`);
      // The first reuses the original row, so its id and any links survive.
      planned.push({ id: i === 0 ? t.id : undefined, name: p, description: i === 0 ? t.description : null, completed: false, termId: t.academic_term_id });
      if (i > 0) newTopics++;
    });
  }
  if (!touched || !APPLY) continue;

  // Renumber everything in this curriculum so the new exercises sit under
  // their chapter and nothing else shifts relative to its neighbours.
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    if (p.id) {
      const { error } = await sb.from("curriculum_topic")
        .update({ name: p.name, description: p.description, display_order: i + 1 })
        .eq("id", p.id);
      if (error) console.log(`   ✗ update failed: ${error.message}`);
    } else {
      const { error } = await sb.from("curriculum_topic").insert({
        curriculum_id: cur.id,
        name: p.name,
        description: p.description,
        display_order: i + 1,
        completed: false,
        academic_term_id: p.termId,
      });
      if (error) console.log(`   ✗ insert failed: ${error.message}`);
    }
  }
}

console.log(
  `\n${APPLY ? "Expanded" : "Would expand"} ${expandedRows} squashed rows into ` +
  `${expandedRows + newTopics} topics (${newTopics} new). ` +
  `${skippedTicked} left alone because a teacher had ticked them.`,
);
if (!APPLY) console.log("Dry run — re-run with --apply to write.");
