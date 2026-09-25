// Load admission dates from the office's own "Student Data List" export.
//
// Why (25 Sep 2026): student.admission_date was NULL for the whole school,
// so a child admitted in September was shown against their class's full
// register - "present 3 of 60 days", 5% on the report card. The office
// exported two admission-date reports (Iqra IFS + Islamic Foundation);
// with the dates loaded the card can tell a new arrival from a truant.
//
// The .xls files are pupil data and stay in the gitignored attendance/
// folder. This script reads a flat CSV exported from them, so nothing
// identifying is ever committed:
//
//   gr,name,class,admission_date
//   2484,Muhammad Yousuf Arsalan,Senior,2026-09-09
//
// It matches on GR only, and refuses any row whose name does not look like
// the student on file - a GR typo must not stamp a date on the wrong child.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/load-admission-dates.ts attendance/admission-dates.csv [--apply]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");
const csvPath = Deno.args.find((a) => !a.startsWith("--")) ??
  "attendance/admission-dates.csv";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Names are compared loosely: the register writes "Muhammad" where the
 *  system has "Mohammad", and drops or adds a father's name. Two names
 *  match when either is a prefix of the other once squashed, or they share
 *  their first two words. Anything less certain is reported, not applied. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}
function namesAgree(a: string, b: string): boolean {
  const x = squash(a), y = squash(b);
  if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const xw = x.split(" "), yw = y.split(" ");
  return xw.length >= 2 && yw.length >= 2 && xw[0] === yw[0] && xw[1] === yw[1];
}

const text = await Deno.readTextFile(csvPath);
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const header = lines.shift()!.split(",").map((h) => h.trim());
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`CSV is missing a "${name}" column`);
  return i;
};
const [iGr, iName, iDate] = [col("gr"), col("name"), col("admission_date")];

let set = 0, already = 0, missing = 0, mismatched = 0, changed = 0;

for (const line of lines) {
  const f = line.split(",");
  const gr = f[iGr]?.trim();
  const name = f[iName]?.trim() ?? "";
  const date = f[iDate]?.trim() ?? "";
  if (!gr) continue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.log(`✗ GR ${gr} (${name}): "${date}" is not a date — SKIP`);
    mismatched++;
    continue;
  }

  const { data: stu } = await sb.from("student")
    .select("id, full_name, admission_date, status")
    .eq("org_id", ORG).eq("gr_number", gr).maybeSingle();
  if (!stu) {
    console.log(`· GR ${gr} (${name}): not in the system — SKIP`);
    missing++;
    continue;
  }
  const onFile = (stu as any).full_name as string;
  if (!namesAgree(onFile, name)) {
    console.log(`✗ GR ${gr}: register says "${name}", system says "${onFile}" — SKIP`);
    mismatched++;
    continue;
  }

  const current = ((stu as any).admission_date ?? null) as string | null;
  if (current === date) { already++; continue; }
  if (current) {
    console.log(`! GR ${gr} (${onFile}): ${current} → ${date} (overwriting)`);
    changed++;
  } else {
    console.log(`+ GR ${gr} (${onFile}): ${date}`);
  }

  if (APPLY) {
    const { error } = await sb.from("student")
      .update({ admission_date: date })
      .eq("id", (stu as any).id).eq("org_id", ORG);
    if (error) { console.log(`  ✗ write failed: ${error.message}`); continue; }
  }
  set++;
}

console.log(
  `\n${APPLY ? "Applied" : "Would set"} ${set} admission dates ` +
  `(${already} already correct, ${changed} overwritten, ` +
  `${missing} not in the system, ${mismatched} refused).`,
);
if (!APPLY) console.log("Dry run — re-run with --apply to write.");
