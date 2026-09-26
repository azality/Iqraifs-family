// Apply the office's per-child attendance denominators (26 Sep 2026).
//
// Background: the carried register gave every child in a class the same
// working-day total, so children admitted mid-term read as truants -
// "3 of 60 days", 5%. v1.17.0 withheld those percentages and handed the
// office a worklist. This loads their answers back in.
//
// The office replied on four sheets - Class I, Class II and Senior by
// hand, Reception as a spreadsheet covering 4 May to 4 Sep. Reception had
// no carried rows at all, so those are inserts; the rest are corrections.
//
// Every row is checked before it is written, because these numbers print
// on a report card a parent reads:
//   - the student exists, is active, and is in this org
//   - days present never exceeds the working days
//   - the working days fit between the child's admission date and the
//     sheet date, counting every day but Sunday (the school teaches
//     Saturdays) - a total that cannot fit is refused, not rounded
//
// The CSV lives in the gitignored attendance/ folder so no pupil data is
// committed:
//
//   gr,days_present,working_days,as_of_date,note
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/apply-attendance-denominators.ts \
//     attendance/attendance-denominators-corrected.csv [--apply]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { maxWorkingDaysBetween } from "../supabase/functions/make-server-f116e23f/admissionStart.ts";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const APPLY = Deno.args.includes("--apply");
const csvPath = Deno.args.find((a) => !a.startsWith("--")) ??
  "attendance/attendance-denominators-corrected.csv";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const text = await Deno.readTextFile(csvPath);
const lines = text.split(/\r?\n/).filter((l) => l.trim());
lines.shift(); // header

let written = 0, inserted = 0, unchanged = 0, refused = 0;

for (const line of lines) {
  // The note is the last field and may itself contain no comma - split
  // on the first four separators only.
  const f = line.split(",");
  const gr = f[0]?.trim();
  const present = Number(f[1]);
  const working = Number(f[2]);
  const asOf = f[3]?.trim();
  const note = f.slice(4).join(",").trim();
  if (!gr) continue;

  const { data: stu } = await sb.from("student")
    .select("id, full_name, status, admission_date")
    .eq("org_id", ORG).eq("gr_number", gr).maybeSingle();
  if (!stu) { console.log(`✗ GR ${gr}: no such student — REFUSED`); refused++; continue; }
  const name = (stu as any).full_name as string;
  if ((stu as any).status !== "active") {
    console.log(`✗ GR ${gr} (${name}): status is ${(stu as any).status} — REFUSED`);
    refused++; continue;
  }
  if (!Number.isInteger(present) || !Number.isInteger(working) || working <= 0 || present < 0) {
    console.log(`✗ GR ${gr} (${name}): ${present}/${working} is not a usable count — REFUSED`);
    refused++; continue;
  }
  if (present > working) {
    console.log(`✗ GR ${gr} (${name}): present ${present} exceeds working days ${working} — REFUSED`);
    refused++; continue;
  }
  const admitted = (stu as any).admission_date as string | null;
  if (admitted) {
    const ceiling = maxWorkingDaysBetween(admitted.slice(0, 10), asOf);
    if (working > ceiling) {
      console.log(
        `✗ GR ${gr} (${name}): ${working} working days cannot fit between ` +
        `admission ${admitted.slice(0, 10)} and ${asOf} (at most ${ceiling}) — REFUSED`,
      );
      refused++; continue;
    }
  }

  const { data: existing } = await sb.from("student_attendance_opening")
    .select("id, days_present, working_days, as_of_date")
    .eq("student_id", (stu as any).id).maybeSingle();

  if (existing
    && (existing as any).days_present === present
    && (existing as any).working_days === working
    && (existing as any).as_of_date === asOf) {
    unchanged++; continue;
  }

  const was = existing
    ? `${(existing as any).days_present}/${(existing as any).working_days}`
    : "(none)";
  const pctWas = existing
    ? ` = ${(100 * (existing as any).days_present / (existing as any).working_days).toFixed(1)}%`
    : "";
  const pctNow = ` = ${(100 * present / working).toFixed(1)}%`;
  console.log(
    `${existing ? "~" : "+"} GR ${gr} (${name}): ${was}${pctWas} → ${present}/${working}${pctNow}`,
  );

  if (APPLY) {
    const row = {
      org_id: ORG,
      student_id: (stu as any).id,
      days_present: present,
      working_days: working,
      as_of_date: asOf,
      source: "office-correction-2026-09",
      notes: note,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await sb.from("student_attendance_opening").update(row).eq("id", (existing as any).id)
      : await sb.from("student_attendance_opening").insert(row);
    if (error) { console.log(`  ✗ write failed: ${error.message}`); refused++; continue; }
  }
  if (existing) written++; else inserted++;
}

console.log(
  `\n${APPLY ? "Applied" : "Would apply"}: ${written} corrected, ${inserted} added, ` +
  `${unchanged} already right, ${refused} refused.`,
);
if (!APPLY) console.log("Dry run — re-run with --apply to write.");
