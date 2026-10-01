// How does a report card paginate?
//
// The policy CHANGED on 2 Oct. It used to be "one page, whatever it
// costs" (office, 30 Sep: "it falls again on the second page"). Holding
// that line meant 1.5px row padding, a 7.5pt table heading, hard column
// shares and three-line clamps - and on the office's print it showed:
// "422.5/650" printed on top of the % column, and a class teacher's
// remark cut off mid-sentence with an ellipsis on the copy that goes
// home to a parent. Their call (2 Oct): "it's okay if it spills to the
// next page because it doesn't look nice."
//
// So the rule is now:
//   1. READABLE first - full remarks, room to breathe, nothing clipped.
//   2. One page when it fits naturally.
//   3. If it spills, it spills GRACEFULLY. The remarks block, grading
//      key and signature strip travel together (break-inside/-before
//      avoid), table rows never split, and the table heading repeats
//      on page two. A second page carrying only a signature and a
//      stamp - the office's original complaint - cannot happen.
//
// This check therefore reports ROW COUNT as a size signal, not a
// pass/fail on height. A class well past the usual size is worth a
// human look at a real print before a batch goes out.
//
// MEASURE AT 718px, NOT THE BROWSER'S OWN WIDTH (learned 2 Oct). A4
// portrait with 10mm side margins is 190mm = 718 CSS px. The print rule
// `.print-card { width: 100% !important }` beats an inline width a
// measuring script sets, so a card measured in a ~1000px window wraps
// less and reads ~90px short. Emulate a 718px viewport, inject the
// @media print rules as plain CSS, and force BOTH `img.print-only` and
// `.print-remark-body` visible - they are display:none on screen and
// the remark bodies are most of the remarks block's height.
//
// Reference heights at 718px after the 2 Oct revision (Class IV, 11
// rows, full remarks): 1397px = 1.32 pages, breaking after the
// attendance/behavior strip, with remarks + key + signatures on page
// two.
//
//   node scripts/check-card-print-fit.mjs            (uses .env)
//
// It reads live data, so run it after any change to a class's subjects.

const TYPICAL_MAX_ROWS = 15;   // biggest class today (Class III); above this, eyeball a real print
const A4_LIMIT_PX = 1062;      // 281mm printable at 96dpi

// Read .env ourselves. The deno scripts get it via --env=.env; node does
// not, and PowerShell has no `set -a && . ./.env`, so a plain
// `npm run check:print` failed on the office machine (30 Sep).
import { readFileSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG = process.env.IFS_ORG_ID || "63cd5732-5db4-40e1-8fb9-60782bcfd059";
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  console.error("Run this from the repo root, where .env lives:");
  console.error("  cd C:\\Users\\MuneebZafar\\Documents\\Dev\\Iqraifs-family");
  console.error("  npm run check:print");
  process.exit(2);
}

const rest = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const classes = await rest(`class?org_id=eq.${ORG}&select=id,name`);
const subjects = await rest(`class_subject?select=class_id&archived_at=is.null`);
const sections = await rest(`class_section?select=id,class_id,schedule_key`);
const students = await rest(`student?org_id=eq.${ORG}&status=eq.active&select=id,class_section_id`);
const terms = await rest(`academic_term?org_id=eq.${ORG}&archived_at=is.null&select=id,name`);
const term = terms.find((t) => t.name === "1st Assessment") ?? terms[0];
const cards = term
  ? await rest(`term_report_card?term_id=eq.${term.id}&finalized_at=not.is.null&select=student_id`)
  : [];

const finalized = new Set(cards.map((c) => c.student_id));
const sectionClass = new Map(sections.map((s) => [s.id, s]));
const subjCount = new Map();
for (const s of subjects) subjCount.set(s.class_id, (subjCount.get(s.class_id) ?? 0) + 1);
const headcount = new Map();
for (const st of students) {
  const sec = sectionClass.get(st.class_section_id);
  if (!sec || sec.schedule_key === "sandbox") continue;
  if (!finalized.has(st.id)) continue;
  headcount.set(sec.class_id, (headcount.get(sec.class_id) ?? 0) + 1);
}

console.log(`card pagination check — ${term?.name ?? "term"} · one A4 page = ${A4_LIMIT_PX}px`);
console.log(`typical size today: ${TYPICAL_MAX_ROWS} table rows. Spilling to a second page is`);
console.log(`allowed since 2 Oct; what must never happen is page two carrying only a`);
console.log(`signature — the remarks block travels with it.\n`);
console.log("class            cards  subjects  table rows  size");

const over = [];
for (const c of classes.sort((a, b) => a.name.localeCompare(b.name))) {
  const cardsHere = headcount.get(c.id) ?? 0;
  if (!cardsHere) continue;
  const subs = subjCount.get(c.id) ?? 0;
  const rows = subs + 1; // the overall row
  const ok = rows <= TYPICAL_MAX_ROWS;
  if (!ok) over.push({ name: c.name, rows, cards: cardsHere });
  console.log(
    `  ${c.name.padEnd(14)} ${String(cardsHere).padStart(4)}  ${String(subs).padStart(8)}  ${String(rows).padStart(10)}  ${ok ? "usual" : "BIGGER THAN ANY MEASURED — eyeball a print"}`,
  );
}

if (over.length) {
  console.error(`\nFAIL — ${over.length} class(es) carry more rows than has been measured:`);
  for (const o of over) {
    console.error(`  ${o.name}: ${o.rows} rows across ${o.cards} card(s)`);
  }
  console.error(`\nOpen one of those cards and print-preview it: confirm it reads well, and`);
  console.error(`that any second page carries the remarks block, not just a signature.`);
  console.error(`Raise TYPICAL_MAX_ROWS here once you have looked.`);
  process.exit(1);
}
console.log(`\nevery class is within the usual size. A card may still run to a second page`);
console.log(`with long remarks — that is fine, as long as the remarks travel with it.`);
