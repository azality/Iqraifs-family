// One-off: Catch Up's pre-system attendance into
// student_attendance_opening.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/import-catchup-attendance-2026-09.ts [--apply]
//
// Catch Up admits through the year, so unlike every other class each
// child has their OWN window - the school sent one line per child
// ("Umer Israr 6 April - 2 Sept, 48/74"), all ending 2 Sep, with the
// system's roll call complete from 3 Sep. Per-child working_days is
// exactly what the model stores; as_of is 2 Sep for everyone, and the
// few system rows marked in late August fall under it, so the overlap
// rule drops them and nothing counts twice.
//
// The seven lines cover exactly the seven children still in Catch Up.
// The three who moved out this week (2404 Ayaan Adnan -> Hifz I, 2405
// Aaliyan + 2251 Ikrash -> Hifz IV) were NOT on the sheet - their
// Catch Up months still belong to them, so ask the school for their
// three numbers; this script deliberately leaves them out.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const SOURCE = "catchup-register-2026-09";
const AS_OF = "2026-09-02";
const APPLY = Deno.args.includes("--apply");

// gr, present, working days, the child's own window as written
const ROWS = [
  { gr: "2413", days: 48, total: 74, window: "6 Apr - 2 Sep", written: "Umer Israr" },
  { gr: "2455", days: 29, total: 40, window: "22 May - 2 Sep", written: "Yousha" },
  { gr: "2456", days: 34, total: 41, window: "1 Jun - 2 Sep", written: "Taimoor" },
  { gr: "2470", days: 14, total: 15, window: "11 Aug - 2 Sep", written: "Abdur Rehman" },
  { gr: "2475", days: 15, total: 15, window: "12 Aug - 2 Sep", written: "Umer Muavia" },
  { gr: "2467", days: 19, total: 20, window: "3 Aug - 2 Sep", written: "Faraz Sajjad" },
  { gr: "1626", days: 19, total: 19, window: "5 Aug - 2 Sep", written: "Areeba" },
];

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const { data: cls } = await db.from("class")
  .select("id,class_section(id)").eq("org_id", ORG).eq("name", "Catch Up");
const secIds = (cls ?? []).flatMap((c: any) => c.class_section.map((s: any) => s.id));
const { data: students } = await db.from("student")
  .select("id,gr_number,full_name").in("class_section_id", secIds).eq("status", "active");
const byGr = new Map((students ?? []).map((s) => [String(s.gr_number), s]));

let bad = 0;
const upserts: Array<Record<string, unknown>> = [];
for (const r of ROWS) {
  const s = byGr.get(r.gr);
  if (!s) { console.error(`!! GR ${r.gr} (${r.written}) not on Catch Up's active roll`); bad++; continue; }
  if (r.days > r.total) { console.error(`!! GR ${r.gr}: ${r.days} > ${r.total}`); bad++; continue; }
  console.log(`${r.gr} ${s.full_name}: ${r.days}/${r.total} (${r.window})`);
  upserts.push({
    org_id: ORG, student_id: s.id, days_present: r.days,
    working_days: r.total, as_of_date: AS_OF, source: SOURCE,
    notes: `Catch Up register (${r.window}), written as "${r.written}"`,
  });
}
for (const s of students ?? []) {
  if (!ROWS.some((r) => r.gr === String(s.gr_number))) {
    console.error(`!! on roll but not on the sheet: ${s.gr_number} ${s.full_name}`);
    bad++;
  }
}
if (bad > 0) { console.error(`\n${bad} mismatches - NOTHING written.`); Deno.exit(1); }
console.log(`\n${upserts.length} balances ready.`);
if (!APPLY) { console.log("Dry run - re-run with --apply to write."); Deno.exit(0); }
const { error } = await db.from("student_attendance_opening")
  .upsert(upserts, { onConflict: "student_id" });
if (error) { console.error("write failed:", error.message); Deno.exit(1); }
console.log(`Wrote ${upserts.length} carried-forward balances.`);
