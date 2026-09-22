// One-off: load the Hifz section's pre-system attendance into
// student_attendance_opening.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/import-hifz-attendance-2026-09.ts [--apply]
//
// The Hifz section counted on paper from 4 May 2026 until the system's
// roll call took over on 3 Sep. The office sent one total per child
// covering 4 May -> 2 Sep (22 Sep): Hifz IV and Hifz II as typed
// GR-keyed spreadsheets, Hifz III as a photographed handwritten sheet.
// Their own month totals pin the window down exactly:
//   May 19 + June 23 + July 26 + Aug 22 + Sep 2 = 92 working days.
// Two Hifz III girls carry 91 (joined a day into the count) and one
// late Hifz IV admission carries 8 - the sheet's own working_days is
// kept per child, never normalised to the batch.
//
// Hifz I has NOT arrived yet and is deliberately absent here.
//
// Muhammad Yousuf (GR 2081) sat these months in Hifz IV but has since
// moved to Class II A; his own Hifz-window number (60/92) is entered
// against HIM, which is why he appears here and not on the Hifz IV
// sheet. attendanceOpening.ts ignores system rows on/before as_of_date,
// so his 3 Sep onward roll call is never double counted.
//
// Hifz II and IV are matched by GR (exact). Hifz III has no GRs on the
// sheet, so each handwritten name was resolved against the live roster
// (they matched 1:1, 23 of 23); the script still verifies every GR
// resolves to an active student in the expected section and REFUSES to
// write anything otherwise.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const SOURCE = "hifz-register-2026-09";
// Hifz II-IV counted through 2 Sep (92 days); Hifz I through 1 Sep
// (91 days = May-Aug 90 + 1 Sep, its own header says so) - roll call
// for Hifz I starts 2 Sep, for the rest 3 Sep.
const AS_OF_BY_CLASS: Record<string, string> = {
  "Hifz I": "2026-09-01",
  "Hifz II": "2026-09-02",
  "Hifz III": "2026-09-02",
  "Hifz IV": "2026-09-02",
  "Class II": "2026-09-02", // Yousuf's Hifz IV window
};
const APPLY = Deno.args.includes("--apply");

type Row = { gr: string; days: number; total: number; written?: string };

// gr, present days, working days, [name as written on the sheet]
const SHEETS: Record<string, Row[]> = {
  // Handwritten sheet (arrived 22 Sep, after the first apply): NN present
  // days May-Aug of 90, plus a 1/0 prefix for 1 Sep. Every percentage on
  // the sheet equals floor(NN/90), which pins the reading; days below are
  // prefix + NN out of 91. Two boys were absent on 1 Sep.
  "Hifz I": [
    { gr: "2077", days: 71, total: 91, written: "Muhammad Ashar" },
    { gr: "2190", days: 83, total: 91, written: "Fahad Ansari" },
    { gr: "1887", days: 63, total: 91, written: "Abdullah Idreesi" },
    { gr: "2244", days: 78, total: 91, written: "Muhammad Mohib" },
    { gr: "1921", days: 71, total: 91, written: "Syed Shayan Ali" },
    { gr: "1831", days: 71, total: 91, written: "Syed Saffan Ali" },
    { gr: "1690", days: 74, total: 91, written: "Abdul Hannan" },
    { gr: "2294", days: 79, total: 91, written: "Abdullah Rafiq" },
    { gr: "2150", days: 56, total: 91, written: "Abdullah Waseem" },
    { gr: "1926", days: 68, total: 91, written: "Muhammad Mustafa" },
    { gr: "1709", days: 66, total: 91, written: "Hasan Shahid" },
    { gr: "2228", days: 90, total: 91, written: "Muhammad Umar" },
    { gr: "1979", days: 70, total: 91, written: "Arbad Ahmed (absent 1 Sep)" },
    { gr: "2396", days: 86, total: 91, written: "Zain Ul Abideen" },
    { gr: "1967", days: 81, total: 91, written: "Muhammad Affan Abbasi" },
    { gr: "2311", days: 68, total: 91, written: "Rayan Tahir" },
    { gr: "1548", days: 72, total: 91, written: "Ayan Nasir (absent 1 Sep)" },
    { gr: "2035", days: 81, total: 91, written: "Ismail Zubair" },
    { gr: "2408", days: 87, total: 91, written: "Muhammad Muzammil" },
  ],
  "Hifz IV": [
    { gr: "1898", days: 44, total: 92 },
    { gr: "1962", days: 88, total: 92 },
    { gr: "1965", days: 77, total: 92 },
    { gr: "1980", days: 71, total: 92 },
    { gr: "1989", days: 65, total: 92 },
    { gr: "2042", days: 72, total: 92 },
    { gr: "2076", days: 81, total: 92 },
    { gr: "2083", days: 66, total: 92 },
    { gr: "2097", days: 81, total: 92 },
    { gr: "2125", days: 82, total: 92 },
    { gr: "2175", days: 79, total: 92 },
    { gr: "2218", days: 82, total: 92 },
    { gr: "2276", days: 57, total: 92 },
    { gr: "2305", days: 81, total: 92 },
    { gr: "2316", days: 80, total: 92 },
    { gr: "2343", days: 63, total: 92 },
    { gr: "2345", days: 62, total: 92 },
    { gr: "2410", days: 81, total: 92 },
    { gr: "2445", days: 82, total: 92 },
    { gr: "2485", days: 6, total: 8 }, // late admission - her own window
  ],
  "Hifz II": [
    { gr: "1525", days: 65, total: 92 },
    { gr: "1796", days: 70, total: 92 },
    { gr: "1800", days: 85, total: 92 },
    { gr: "1902", days: 70, total: 92 },
    { gr: "1930", days: 69, total: 92 },
    { gr: "1992", days: 79, total: 92 },
    { gr: "2022", days: 75, total: 92 },
    { gr: "2025", days: 66, total: 92 },
    { gr: "2036", days: 82, total: 92 },
    { gr: "2064", days: 63, total: 92 },
    { gr: "2082", days: 80, total: 92 },
    { gr: "2087", days: 60, total: 92 },
    { gr: "2116", days: 64, total: 92 },
    { gr: "2177", days: 75, total: 92 },
    { gr: "2240", days: 75, total: 92 },
    { gr: "2267", days: 65, total: 92 },
    { gr: "2324", days: 65, total: 92 },
    { gr: "2374", days: 81, total: 92 },
    { gr: "2390", days: 67, total: 92 },
    { gr: "2446", days: 85, total: 92 },
    { gr: "2437", days: 84, total: 92 },
  ],
  // Handwritten sheet, rows 1-23; "written" preserves the sheet's name.
  "Hifz III": [
    { gr: "1265", days: 66, total: 92, written: "Rija Qazi" },
    { gr: "1676", days: 82, total: 92, written: "Hareem Shahab" },
    { gr: "1292", days: 59, total: 92, written: "Muskan Muhammad" },
    { gr: "2084", days: 67, total: 92, written: "Bisma Sajid" },
    { gr: "1945", days: 70, total: 92, written: "Mahnoor Imran" },
    { gr: "2184", days: 71, total: 92, written: "Hafsa Fauzan" },
    { gr: "1825", days: 79, total: 92, written: "Muntaha Fatima" },
    { gr: "1762", days: 65, total: 92, written: "Sheeza Ammad" },
    { gr: "1886", days: 78, total: 92, written: "Anaya Salman" },
    { gr: "1847", days: 88, total: 92, written: "Fatima Imran" },
    { gr: "2349", days: 79, total: 92, written: "Umaiza Iqbal" },
    { gr: "1966", days: 79, total: 92, written: "Maria Ayaz" },
    { gr: "2380", days: 62, total: 92, written: "Zainab Azeem" },
    { gr: "2379", days: 61, total: 92, written: "Aroush Azeem" },
    { gr: "2395", days: 49, total: 92, written: "Bareerah Shakeel" },
    { gr: "2397", days: 69, total: 92, written: "Syeda Rameen" },
    { gr: "1947", days: 72, total: 92, written: "Arwa Abdul Basit" },
    { gr: "2217", days: 85, total: 92, written: "Zymal Umair" },
    { gr: "2318", days: 82, total: 92, written: "Aina Maqsood" },
    { gr: "1949", days: 72, total: 92, written: "Fatima Abdul Basit" },
    { gr: "2378", days: 65, total: 91, written: "Amal Azeem" },
    { gr: "2426", days: 68, total: 91, written: "Barira Asif" },
    { gr: "1931", days: 82, total: 92, written: "Tayyaba Muzammil" },
  ],
  // Moved Hifz IV -> Class II A on 21 Sep; number is his own Hifz window.
  "Class II": [
    { gr: "2081", days: 60, total: 92, written: "Muhammad Yousuf (was Hifz IV)" },
  ],
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const upserts: Array<Record<string, unknown>> = [];
let bad = 0;

for (const [className, rows] of Object.entries(SHEETS)) {
  const { data: cls, error: cErr } = await db
    .from("class")
    .select("id,name,class_section(id,name)")
    .eq("org_id", ORG)
    .eq("name", className);
  if (cErr || !cls?.length) { console.error(`class not found: ${className}`); bad++; continue; }
  const sectionIds = cls.flatMap((c: any) => (c.class_section ?? []).map((s: any) => s.id));

  const { data: students, error: sErr } = await db
    .from("student")
    .select("id,gr_number,full_name,status,class_section_id")
    .in("class_section_id", sectionIds)
    .eq("status", "active");
  if (sErr) { console.error(`roster load failed: ${className}: ${sErr.message}`); bad++; continue; }

  const byGr = new Map((students ?? []).map((s) => [String(s.gr_number), s]));
  console.log(`\n${className}: ${rows.length} sheet rows vs ${byGr.size} on roll`);

  for (const r of rows) {
    const s = byGr.get(r.gr);
    if (!s) { console.error(`  !! GR ${r.gr} not on ${className}'s active roll`); bad++; continue; }
    if (r.days > r.total) { console.error(`  !! GR ${r.gr}: ${r.days} > ${r.total}`); bad++; continue; }
    console.log(`  ${r.gr}  ${s.full_name}  ${r.days}/${r.total}`);
    upserts.push({
      org_id: ORG, student_id: s.id, days_present: r.days,
      working_days: r.total, as_of_date: AS_OF_BY_CLASS[className], source: SOURCE,
      notes: r.written
        ? `Hifz register (4 May - ${AS_OF_BY_CLASS[className] === "2026-09-01" ? "1" : "2"} Sep), written as "${r.written}"`
        : "Hifz register spreadsheet (4 May - 2 Sep)",
    });
  }

  // The whole class must be accounted for - except Class II, where only
  // Yousuf carries a Hifz number (the rest got theirs in the Sep import).
  if (className !== "Class II") {
    for (const s of students ?? []) {
      if (!rows.some((r) => r.gr === String(s.gr_number))) {
        console.error(`  !! on roll but not on sheet: ${s.gr_number} ${s.full_name}`);
        bad++;
      }
    }
  }
}

if (bad > 0) { console.error(`\n${bad} mismatches - NOTHING written.`); Deno.exit(1); }
console.log(`\n${upserts.length} balances ready.`);
if (!APPLY) { console.log("Dry run - re-run with --apply to write."); Deno.exit(0); }

for (let i = 0; i < upserts.length; i += 100) {
  const { error } = await db.from("student_attendance_opening")
    .upsert(upserts.slice(i, i + 100), { onConflict: "student_id" });
  if (error) { console.error("write failed:", error.message); Deno.exit(1); }
}
console.log(`Wrote ${upserts.length} carried-forward balances.`);
