// Will every report card print on ONE page?
//
// Office, 30 Sep: "when they try to print it falls again on the second
// page ... we need a check where it reviews all reports to make sure it's
// not falling on the second page - no orphans."
//
// A card's printed height has three drivers:
//
//   1. the subject table - one row per subject, plus the overall row;
//   2. the two remark boxes - capped at 8 printed lines by
//      .print-remark-body, so no amount of typing can grow them further;
//   3. per-subject remarks (1 Oct: findings print by default) - capped
//      at 3 lines x 8.5pt by .print-subject-remark .remark-clamp.
//
// Because (2) and (3) are bounded, the only thing that can push a card
// over a page is (1). Re-measured in Chrome at A4 portrait with the
// print stylesheet after the 1 Oct layout revision (ruled table,
// identity band, grading key, boxed remarks, findings-as-remarks):
//
//   WORST card in the school (Class III, 15 rows, 8 finding
//     remarks, WhatsApp + 2 campus lines) ...... 1034px of 1062px
//   next worst (15 rows, 9 findings) ............ 1025px
//   Senior (12 rows) ............................ ~870px
//
// The header grows with the school's OWN address: IFS prints one line
// per campus, so a school with four campuses would eat ~45px more.
// If a card ever lands near the limit, the header is the first place
// to look, not the table.
//
// So 15 rows is proven to fit even with a finding on every notable
// subject. A class carrying more subjects than that has never been
// measured, and this fails so somebody measures it before the cards
// print rather than after.
//
//   node scripts/check-card-print-fit.mjs            (uses .env)
//
// It reads live data, so run it after any change to a class's subjects.

const PROVEN_SAFE_ROWS = 15;   // measured: fits with maximal remarks
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

console.log(`print-fit check — ${term?.name ?? "term"} · one A4 page = ${A4_LIMIT_PX}px`);
console.log(`proven safe: ${PROVEN_SAFE_ROWS} table rows even with maximal remarks\n`);
console.log("class            cards  subjects  table rows  verdict");

const over = [];
for (const c of classes.sort((a, b) => a.name.localeCompare(b.name))) {
  const cardsHere = headcount.get(c.id) ?? 0;
  if (!cardsHere) continue;
  const subs = subjCount.get(c.id) ?? 0;
  const rows = subs + 1; // the overall row
  const ok = rows <= PROVEN_SAFE_ROWS;
  if (!ok) over.push({ name: c.name, rows, cards: cardsHere });
  console.log(
    `  ${c.name.padEnd(14)} ${String(cardsHere).padStart(4)}  ${String(subs).padStart(8)}  ${String(rows).padStart(10)}  ${ok ? "fits" : "NOT MEASURED — check it"}`,
  );
}

if (over.length) {
  console.error(`\nFAIL — ${over.length} class(es) carry more rows than has been measured:`);
  for (const o of over) {
    console.error(`  ${o.name}: ${o.rows} rows across ${o.cards} card(s)`);
  }
  console.error(`\nOpen one of those cards, print-preview it, and either confirm it fits`);
  console.error(`or trim the class's subject list. Raise PROVEN_SAFE_ROWS here once measured.`);
  process.exit(1);
}
console.log(`\nevery class is within the measured-safe height — no card should reach a second page.`);
