// Row-cap guard (29 Sep 2026). Supabase returns AT MOST 1000 rows per
// select and says nothing when it truncates. That single fact has now
// produced three real bugs in this codebase:
//
//   - the marking board showed half-finished columns as empty (#620)
//   - 17 "unmarked" Senior students who were actually marked (25 Sep)
//   - the Hifz II round-up telling the qari children had not been heard
//     when he had heard them minutes before (29 Sep) - caught by the
//     TEACHER, not by us, the week the section crossed 1000 rows
//
// The cap only bites where one query's result can grow past 1000, so
// this guard is tiered by how a table grows, not by superstition:
//
//   EVENT tables grow forever (one row per child per day/paper/payment).
//   An unbounded multi-row select against one of these is a bug waiting
//   for enrolment x time, and FAILS CI unless the line above carries
//   `// cap-ok: <reason>` explaining why it is genuinely bounded.
//
//   Everything else (config and roster tables - a school has ~20 classes,
//   ~400 students) is COUNTED and printed so growth is visible, but does
//   not fail: at one-school scale those cannot reach 1000, and blanket
//   markers would be noise nobody reads.
//
// A chain is considered bounded when it (or the query variable it is
// assigned to, within the next 20 lines) carries .single/.maybeSingle/
// .limit/.range, is a write (.insert/.update/.upsert/.delete), or is a
// head-count. Paged loops therefore pass without markers.

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

// One row per child per day / paper / event - grows without limit.
const EVENT_TABLES = new Set([
  "hifz_progress", "school_attendance", "behavior_note", "grade",
  "exam_subject_score", "exam_component_score", "fee_status", "fee_payment",
  "parent_message", "lesson", "lesson_completion", "assignment",
  "assignment_submission", "form_response", "form_response_value",
  "comment_ack", "notification_read", "time_off_request", "term_report_card",
  "diary_entries", "homework", "test_scores", "sabaq_logs", "sabqi_logs",
  "manzil_logs", "sabaq_para_logs", "attendance", "pin_login_event",
]);

const BOUNDED = /\.single\(|\.maybeSingle\(|\.limit\(|\.range\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|head:\s*true|\.csv\(/;
const ROOT = "supabase/functions/make-server-f116e23f";

let files;
try {
  files = globSync(`${ROOT}/**/*.{ts,tsx}`);
} catch {
  // Node < 22.14 has no fs.globSync - walk manually.
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
  files = walk(ROOT);
}

const failures = [];
let eventOk = 0, otherUnbounded = 0, totalChains = 0;

for (const file of files) {
  if (/_test\.tsx?$/.test(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\.from\("([a-z_]+)"\)/);
    if (!m) continue;
    totalChains++;
    const table = m[1];

    // Swallow the chain: this line until the statement ends.
    let chain = lines[i];
    let j = i;
    while (j + 1 < lines.length && !/;\s*$/.test(lines[j]) && j - i < 30) {
      j++;
      chain += "\n" + lines[j];
    }
    let bounded = BOUNDED.test(chain);

    // Inside the allRows() pager (pagedRows.ts) the builder's .range sits
    // on its own `return` line - the helper IS the fix, credit it.
    if (!bounded) {
      const before = lines.slice(Math.max(0, i - 4), i).join("\n");
      if (/\ballRows\s*\(/.test(before)) bounded = true;
    }

    // `let q = sb.from(...)`: bounds are often applied to q later. The
    // assignment may sit on the line above the .from( line.
    if (!bounded) {
      const assign = chain.match(/(?:const|let)\s+(\w+)\s*=[^=]/) ||
        (i > 0 && lines[i - 1].match(/(?:const|let)\s+(\w+)\s*=[^=]/));
      if (assign) {
        const id = assign[1];
        const after = lines.slice(j + 1, j + 21).join("\n");
        const late = new RegExp(`\\b${id}\\b[^\\n]*\\.(?:range|limit|single|maybeSingle)\\(`);
        if (late.test(after)) bounded = true;
      }
    }
    const marked = /cap-ok:/.test(lines[i]) || (i > 0 && /cap-ok:/.test(lines[i - 1]));

    if (!bounded && EVENT_TABLES.has(table)) {
      if (marked) eventOk++;
      else failures.push(`${file}:${i + 1}  ${table}`);
    } else if (!bounded && !marked) {
      otherUnbounded++;
    }
    i = j;
  }
}

console.log(`row-cap guard: ${totalChains} queries scanned`);
console.log(`  event-table unbounded, cap-ok marked: ${eventOk}`);
console.log(`  config/roster unbounded (watched, not failing): ${otherUnbounded}`);
if (failures.length) {
  console.error(`\nFAIL - ${failures.length} unbounded select(s) on EVENT tables with no cap-ok reason:`);
  for (const f of failures) console.error("  " + f);
  console.error(`\nEvent tables grow one row per child per day; Supabase silently`);
  console.error(`truncates at 1000. Page it (see loadExamScores), .limit() it, or`);
  console.error(`justify it in place with: // cap-ok: <why this stays under 1000>`);
  process.exit(1);
}
console.log("  event-table failures: 0");
