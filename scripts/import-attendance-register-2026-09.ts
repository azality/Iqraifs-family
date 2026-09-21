// One-off: load the school's own attendance register into
// student_attendance_opening.
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/import-attendance-register-2026-09.ts [--apply]
//
// IFS opened 4 May 2026 on paper. Roll call in the system starts 19 Aug,
// and the office went on counting by hand past that, so every class
// handed in ONE total per child (photographed sheets + the Senior
// spreadsheet, 21 Sep). attendanceOpening.ts drops our own rows for the
// days a total already covers, so the overlap is never counted twice.
//
// The sheets were written on different days, which their own month
// totals pin down exactly (May 15 + June 12 + August 19 + September
// 14/15/16, counting Mon-Sat):
//   Senior                60 days, to Wed 16 Sep
//   Classes I, II, IX, X  61 days, to Thu 17 Sep
//   Classes III - VIII    62 days, to Fri 18 Sep
//
// Names on the handwritten sheets are first names and nicknames, so
// every class is matched against its own roster and the script REFUSES
// to write unless each class matches 1:1. Senior arrived GR-keyed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const SOURCE = "register-2026-09";
const APPLY = Deno.args.includes("--apply");

const WINDOW: Record<string, { workingDays: number; asOf: string }> = {
  "Senior": { workingDays: 60, asOf: "2026-09-16" },
  "Class I": { workingDays: 61, asOf: "2026-09-17" },
  "Class II": { workingDays: 61, asOf: "2026-09-17" },
  "Class IX": { workingDays: 61, asOf: "2026-09-17" },
  "Class X": { workingDays: 61, asOf: "2026-09-17" },
  "Class III": { workingDays: 62, asOf: "2026-09-18" },
  "Class IV": { workingDays: 62, asOf: "2026-09-18" },
  "Class V": { workingDays: 62, asOf: "2026-09-18" },
  "Class VI": { workingDays: 62, asOf: "2026-09-18" },
  "Class VII": { workingDays: 62, asOf: "2026-09-18" },
  "Class VIII": { workingDays: 62, asOf: "2026-09-18" },
};

// Handwritten sheets: the name as the class teacher wrote it, then days
// present. Matched to the roster below, never trusted as an identifier.
const SHEETS: Record<string, Array<[string, number]>> = {
  "Class IV": [
    ["Abrish Danish", 58], ["Bareera Amjad", 36], ["Hiba Asif", 53], ["Ifrah Irshad", 58],
    ["Maliha Noor", 43], ["Musfirah Talha", 32], ["Misha Vohra", 40], ["Zainab Shafiq", 45],
    ["M. Arham", 39], ["M. Ahmed", 52], ["M. Rayyan", 53], ["M. Ismail", 43],
    ["S. M. Ahmed", 36], ["Moiz Ahmed", 42], ["Abdul Bari", 35], ["Mir Abbas", 61],
    ["Yasir Abdul Qadeer", 44], ["Hadiya Ismail", 45],
  ],
  "Class V": [
    ["Hunain", 41], ["Aaviz", 58], ["Abdullah Imran", 13], ["Arqam", 60], ["Ashar", 56],
    ["Bassim", 56], ["Rohan", 54], ["Shazil", 59], ["Shariq", 46], ["Fizza", 51],
    ["Hareem", 56], ["Sulafah", 62], ["Tooba", 61], ["Habiba", 31], ["Anas", 28],
    ["Abdullah Bilal", 29], ["Abu Bakar", 17], ["Fatimah", 18],
  ],
  "Class VI": [
    ["Nabia", 60], ["Nida", 59], ["Huda", 54], ["Javeria", 59], ["Anas", 57],
    ["Abdullah", 60], ["Hamza", 51], ["Abdul Rehman", 55], ["Syed Mahir Ali", 30],
  ],
  "Class VII": [
    ["Abdullah", 50], ["Abu Bakr", 62], ["Aliyan", 35], ["Arman", 50], ["Ikrash", 40],
    ["Ishaq", 21], ["M. Umer", 29], ["M. Yousuf", 29], ["S. Minhal", 34], ["Sauleh", 61],
    ["Ammarah", 39], ["Atika", 41], ["Ayesha", 21], ["Fatima", 28], ["Hamda", 56],
    ["Jannat", 25], ["Konain", 31], ["Maham", 32], ["Musfirah Siddiqui", 50],
    ["Musfirah Irshad", 61], ["Sabira", 57], ["Umm-ul-Khair", 59], ["Zainab", 60],
  ],
  "Class VIII": [
    ["Abdul Hadi", 33], ["Abdul Ahad", 48], ["Shahzain", 58], ["Suddis", 39],
    ["Amna Noman", 36], ["Eshaal", 37], ["Fariha", 44], ["Hafsa", 55], ["Maryam", 59],
  ],
  "Class IX": [
    ["Abdul Rafay", 6], ["Ayan Azeem", 33], ["Faheem Ashfaq", 21], ["Saad Ansari", 32],
    ["M. Kashan", 25], ["M. Raheel", 36], ["M. Mustafa", 22], ["M. Zaid", 30],
    ["Shayan Shahid", 31], ["Adeena Zulfiqar", 34], ["Areeba Ahmed", 38], ["Fatima Noman", 34],
    ["Falak Asim", 28], ["Fehmida", 41], ["Iqra Asim", 25], ["Kanza Fatima", 34],
    ["Maryam Binte Talha", 14], ["Maryam Talha", 23], ["Radhiya Sheikh", 36], ["Soha", 26],
    ["Wajiha", 35], ["Saniya", 30], ["Haris", 42], ["M. Ubadullah", 30], ["M. Subhan", 18],
  ],
  "Class X": [
    ["M. Umer Farooq", 39], ["M. Maier Khan", 22], ["Mian M. Fayz", 9], ["M. Murtaza", 35],
    ["M. Saad", 35], ["Anaam Nadeem", 54], ["Ayan Khan", 61], ["Nabiyaam Rashid", 22],
    ["M. Ali", 22], ["M. Umar", 1], ["S. M. Saboor", 2], ["Nabiha", 2], ["S. Ishba", 3],
    ["Dua Farooq", 14], ["Eshal Sheikh", 33], ["Arshman", 50], ["Sumbul", 28],
    ["Saniya", 2], ["Fazza-tul-Zehra", 2],
  ],
};

// Senior came as a spreadsheet with GR numbers — no matching needed.
const SENIOR_BY_GR: Record<string, number> = {
  "2187": 46, "2195": 57, "2199": 55, "2205": 49, "2212": 48, "2227": 58, "2249": 57,
  "2253": 54, "2259": 38, "2262": 54, "2263": 57, "2272": 20, "2277": 49, "2280": 36,
  "2286": 28, "2288": 57, "2306": 54, "2322": 60, "2332": 52, "2334": 20, "2336": 49,
  "2352": 56, "2353": 55, "2356": 59, "2368": 46, "2370": 41, "2391": 48, "2394": 60,
  "2398": 54, "2429": 60, "2434": 46, "2441": 58, "2447": 45, "2459": 26, "2463": 31,
  "2474": 25, "2484": 3,
};

// Where a sheet's name is not simply a shortened roster name. Each one
// was read off the photo and checked against the class list by hand.
const ALIAS: Record<string, string> = {
  "Class IV|Misha Vohra": "Mirha Vohra",
  "Class IV|Musfirah Talha": "Musfira Talha",
  "Class IV|M. Ahmed": "Muhammad Ahmed",
  "Class IV|S. M. Ahmed": "Syed Muhammad Ahmed",
  "Class IV|Yasir Abdul Qadeer": "Muhammad Yasir",
  "Class IV|Mir Abbas": "Mir Abbas Uddin",
  "Class V|Aaviz": "Muhammad Aariz",
  "Class V|Bassim": "Baasim Ahmed",
  "Class V|Rohan": "Muhammad Rohaan Khan",
  "Class V|Sulafah": "Sulafa Qasim",
  "Class V|Habiba": "Umme Habiba",
  "Class V|Fatimah": "Fatima Zehra",
  "Class VI|Nabia": "Nabiha Shahzad",
  "Class VI|Abdullah": "Abdullah Siddiqui",
  "Class VI|Syed Mahir Ali": "Syed Mayir Ali",
  "Class VII|Abu Bakr": "Muhammad Abu Bakar Imran",
  "Class VII|M. Umer": "Muhammad Umar Rizwan",
  "Class VII|S. Minhal": "Syed Minhaal Ahmed",
  "Class VII|Musfirah Irshad": "Musfirah",
  "Class VII|Umm-ul-Khair": "Ummul Khair",
  "Class VII|Fatima": "Fatima Sheikh",
  "Class VIII|Suddis": "Sudais",
  "Class VIII|Eshaal": "Eshal Asim",
  "Class VIII|Maryam": "Maryam Imran",
  "Class IX|Ayan Azeem": "Muhammad Ayan",
  "Class IX|Faheem Ashfaq": "Muhammad Faheem",
  "Class IX|M. Mustafa": "Muhammad Mustufa",
  "Class IX|Adeena Zulfiqar": "Adina Fatima",
  "Class IX|Radhiya Sheikh": "Radeyah Sheikh",
  "Class IX|Saniya": "Sania",
  "Class IX|M. Ubadullah": "Muhammad Ubaidullah",
  "Class IX|Haris": "Muhammad Haris",
  // Two boys whose names differ only by a surname - the alias pins each
  // one so neither can take the other's number.
  "Class X|M. Umer Farooq": "Muhammad Umar Farooq",
  "Class X|M. Umar": "Muhammad Umar",
  "Class X|M. Maier Khan": "Muhammad Maier Khan",
  "Class X|Mian M. Fayz": "Mian Muhammad Fayz",
  "Class X|Anaam Nadeem": "Aman",
  "Class X|Ayan Khan": "Ayyan Khan",
  "Class X|Nabiyaam Rashid": "Nabian Rashid",
  "Class X|M. Ali": "Muhammad Ali Ayaz",
  "Class X|S. M. Saboor": "Sh. Muhammad Abdul  Saboor",
  "Class X|Nabiha": "Nabiha Fatima",
  "Class X|S. Ishba": "Syeda Ishba Ali",
  "Class X|Eshal Sheikh": "Eshal Shaikh",
  "Class X|Fazza-tul-Zehra": "Fizza Tul Zehra",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z\s.]/g, " ").split(/[\s.]+/).filter(Boolean);

/** A sheet name matches a roster name when every word of the sheet name
 *  is a word of the roster name (or its prefix, for "M." / "S."). */
function matches(written: string, rosterName: string): boolean {
  const R = tokens(rosterName);
  return tokens(written).every((w) =>
    R.some((r) => r === w || (w.length >= 3 && r.startsWith(w)) || (w.length <= 2 && r.startsWith(w))),
  );
}

const { data: classes } = await sb.from("class").select("id, name").eq("org_id", ORG);
const { data: sections } = await sb.from("class_section").select("id, class_id")
  .in("class_id", (classes ?? []).map((c) => c.id));

type Student = { id: string; gr: string; name: string; cls: string };
const roster: Student[] = [];
for (const sec of sections ?? []) {
  const cls = (classes ?? []).find((c) => c.id === sec.class_id)!;
  const { data: studs } = await sb.from("student")
    .select("id, gr_number, full_name").eq("class_section_id", sec.id).eq("status", "active");
  for (const s of studs ?? []) {
    roster.push({ id: s.id, gr: String(s.gr_number ?? ""), name: s.full_name, cls: cls.name });
  }
}

const upserts: Array<Record<string, unknown>> = [];
const problems: string[] = [];

for (const [className, rows] of Object.entries(SHEETS)) {
  const win = WINDOW[className];
  const students = roster.filter((r) => r.cls === className);
  const left = new Map(students.map((s) => [s.id, s]));
  const resolved: Array<{ s: Student; days: number; written: string }> = [];

  for (const [written, days] of rows) {
    const target = ALIAS[`${className}|${written}`];
    const pool = [...left.values()];
    const hits = target
      ? pool.filter((s) => squash(s.name) === squash(target))
      : pool.filter((s) => matches(written, s.name));
    if (hits.length !== 1) {
      problems.push(`${className}: "${written}" matched ${hits.length} children${hits.length ? ` (${hits.map((h) => h.name).join(", ")})` : ""}`);
      continue;
    }
    left.delete(hits[0].id);
    resolved.push({ s: hits[0], days, written });
  }

  if (left.size > 0) {
    problems.push(`${className}: nothing written for ${[...left.values()].map((s) => `${s.gr} ${s.name}`).join(", ")}`);
  }
  for (const r of resolved) {
    if (r.days > win.workingDays) {
      problems.push(`${className}: ${r.s.name} has ${r.days} of ${win.workingDays} working days`);
    }
    upserts.push({
      org_id: ORG, student_id: r.s.id, days_present: r.days,
      working_days: win.workingDays, as_of_date: win.asOf, source: SOURCE,
      notes: `Register sheet, written as "${r.written}"`,
    });
  }
  console.log(`${className.padEnd(12)} ${resolved.length}/${students.length} matched`);
}

// Senior: GR-keyed, so only existence is checked.
{
  const win = WINDOW["Senior"];
  const seniors = roster.filter((r) => r.cls === "Senior");
  const byGr = new Map(seniors.map((s) => [s.gr, s]));
  let n = 0;
  for (const [gr, days] of Object.entries(SENIOR_BY_GR)) {
    const s = byGr.get(gr);
    if (!s) { problems.push(`Senior: GR ${gr} is not an active senior`); continue; }
    byGr.delete(gr);
    if (days > win.workingDays) problems.push(`Senior: ${s.name} has ${days} of ${win.workingDays}`);
    upserts.push({
      org_id: ORG, student_id: s.id, days_present: days, working_days: win.workingDays,
      as_of_date: win.asOf, source: SOURCE, notes: "Senior attendance spreadsheet",
    });
    n++;
  }
  if (byGr.size > 0) problems.push(`Senior: nothing written for ${[...byGr.values()].map((s) => `${s.gr} ${s.name}`).join(", ")}`);
  console.log(`${"Senior".padEnd(12)} ${n}/${seniors.length} matched`);
}

console.log(`\n${upserts.length} rows ready`);
if (problems.length > 0) {
  console.log("\nPROBLEMS:");
  for (const p of problems) console.log("  -", p);
  console.log("\nRefusing to write: fix the sheet data or the aliases first.");
  Deno.exit(1);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  Deno.exit(0);
}

for (let i = 0; i < upserts.length; i += 100) {
  const { error } = await sb.from("student_attendance_opening")
    .upsert(upserts.slice(i, i + 100), { onConflict: "student_id" });
  if (error) { console.error("write failed:", error.message); Deno.exit(1); }
}
console.log(`Wrote ${upserts.length} carried-forward balances.`);
