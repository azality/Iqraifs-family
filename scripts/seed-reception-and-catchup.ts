// Reception subjects + timetable, Junior Friday time fix, Catch Up
// Sindhi/Science/Computer syllabi.
// Source: "updated Rec, Jr, Sr Time Table and Period timings.docx" +
// Catch-Up PDFs + Sindhi text (Head Teacher, 2026-08-25).
// Idempotent: skips existing slots/subjects/topics.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
) as any;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const YEAR = "2026-27";

const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 500 });
const adminUser = users.users.find((u: any) => (u.email ?? "").toLowerCase() === "muneeb@azality.com");

// ─── 1. Junior Friday fix: P4 ends 11:00 (was 10:55), P5 starts 11:00 ───
{
  const { data: p4 } = await sb.from("timetable_slot").select("id")
    .eq("org_id", ORG).eq("schedule_key", "junior").eq("day_of_week", 5)
    .eq("start_time", "10:15:00").is("archived_at", null).maybeSingle();
  const { data: p5 } = await sb.from("timetable_slot").select("id")
    .eq("org_id", ORG).eq("schedule_key", "junior").eq("day_of_week", 5)
    .eq("start_time", "10:55:00").is("archived_at", null).maybeSingle();
  if (p4) await sb.from("timetable_slot").update({ end_time: "11:00" }).eq("id", p4.id);
  if (p5) await sb.from("timetable_slot").update({ start_time: "11:00" }).eq("id", p5.id);
  console.log(`Junior Fri: P4 -> 10:15-11:00 ${p4 ? "OK" : "SLOT MISSING"}, P5 -> 11:00-11:30 ${p5 ? "OK" : "SLOT MISSING"}`);
}

// ─── 2. Reception build ─────────────────────────────────────────────────
const { data: recCls } = await sb.from("class").select("id").eq("org_id", ORG).eq("name", "Reception").single();
const { data: recSec } = await sb.from("class_section")
  .select("id, class_teacher_user_id, schedule_key").eq("class_id", recCls.id).eq("name", "A").single();
const CT = recSec.class_teacher_user_id;
if (recSec.schedule_key !== "reception") {
  await sb.from("class_section").update({ schedule_key: "reception" }).eq("id", recSec.id);
  console.log("Reception A -> schedule_key 'reception'");
}

const REC_SUBJECTS = [
  "Morning Lesson", "Material Activity", "Soft Board Lesson",
  "Reading Time (English/Urdu/Maths)", "English Writing", "Urdu Writing",
  "Maths Writing", "Urdu Core Reader",
];
const ssByName = new Map<string, string>();
for (let i = 0; i < REC_SUBJECTS.length; i++) {
  const name = REC_SUBJECTS[i];
  let { data: cs } = await sb.from("class_subject").select("id")
    .eq("class_id", recCls.id).eq("name", name).is("archived_at", null).maybeSingle();
  if (!cs) {
    const { data } = await sb.from("class_subject")
      .insert({ org_id: ORG, class_id: recCls.id, name, sort_order: (i + 1) * 10, created_by: adminUser.id })
      .select().single();
    cs = data;
  }
  let { data: ss } = await sb.from("section_subject").select("id")
    .eq("class_subject_id", cs.id).eq("class_section_id", recSec.id).maybeSingle();
  if (!ss) {
    const { data } = await sb.from("section_subject")
      .insert({ org_id: ORG, class_section_id: recSec.id, class_subject_id: cs.id, name, teacher_user_id: CT, sort_order: (i + 1) * 10 })
      .select().single();
    ss = data;
  }
  ssByName.set(name, ss.id);
}
console.log(`Reception subjects ready: ${ssByName.size}`);

// Slots. Mon–Thu share one bell; Friday its own.
type SlotDef = { name: string; day: number; start: string; end: string; kind: string; order: number };
const recSlots: SlotDef[] = [];
for (let d = 1; d <= 4; d++) {
  recSlots.push(
    { name: "Reception P1", day: d, start: "08:30", end: "09:15", kind: "academic", order: 10 },
    { name: "Reception P2", day: d, start: "09:15", end: "10:00", kind: "academic", order: 20 },
    { name: "Reception P3", day: d, start: "10:00", end: "10:45", kind: "academic", order: 30 },
    { name: "Reception P4", day: d, start: "10:45", end: "11:30", kind: "academic", order: 40 },
    { name: "Reception Break", day: d, start: "11:30", end: "11:45", kind: "break", order: 50 },
    { name: "Reception P5", day: d, start: "11:45", end: "12:15", kind: "academic", order: 60 },
  );
}
recSlots.push(
  { name: "Reception P1", day: 5, start: "08:30", end: "09:15", kind: "academic", order: 10 },
  { name: "Reception P2", day: 5, start: "09:15", end: "10:00", kind: "academic", order: 20 },
  { name: "Reception P3", day: 5, start: "10:00", end: "10:45", kind: "academic", order: 30 },
  { name: "Reception P4", day: 5, start: "10:45", end: "11:20", kind: "academic", order: 40 },
  { name: "Reception Break", day: 5, start: "11:20", end: "11:30", kind: "break", order: 50 },
);
const slotId = new Map<string, string>(); // `${day}|${start}` -> id
for (const s of recSlots) {
  let { data: row } = await sb.from("timetable_slot").select("id")
    .eq("org_id", ORG).eq("schedule_key", "reception").eq("day_of_week", s.day)
    .eq("start_time", `${s.start}:00`).is("archived_at", null).maybeSingle();
  if (!row) {
    const { data } = await sb.from("timetable_slot")
      .insert({ org_id: ORG, name: s.name, day_of_week: s.day, start_time: s.start, end_time: s.end, kind: s.kind, display_order: s.order, schedule_key: "reception" })
      .select().single();
    row = data;
  }
  slotId.set(`${s.day}|${s.start}`, row.id);
}
console.log(`Reception slots ready: ${slotId.size}`);

// Entries (all taught by the class teacher).
// Fri P3 is "Soft Board lesson / Core reader" in the doc — modelled as
// Soft Board Lesson (primary label).
const GRID: Record<number, Array<[string, string]>> = {
  1: [["08:30", "Morning Lesson"], ["09:15", "Material Activity"], ["10:00", "Soft Board Lesson"], ["10:45", "English Writing"], ["11:45", "Urdu Core Reader"]],
  2: [["08:30", "Morning Lesson"], ["09:15", "Material Activity"], ["10:00", "Soft Board Lesson"], ["10:45", "Urdu Writing"], ["11:45", "Urdu Core Reader"]],
  3: [["08:30", "Morning Lesson"], ["09:15", "Reading Time (English/Urdu/Maths)"], ["10:00", "Soft Board Lesson"], ["10:45", "Maths Writing"], ["11:45", "Urdu Core Reader"]],
  4: [["08:30", "Morning Lesson"], ["09:15", "Reading Time (English/Urdu/Maths)"], ["10:00", "Soft Board Lesson"], ["10:45", "English Writing"], ["11:45", "Urdu Core Reader"]],
  5: [["08:30", "Morning Lesson"], ["09:15", "Reading Time (English/Urdu/Maths)"], ["10:00", "Soft Board Lesson"], ["10:45", "Urdu Writing"]],
};
let entryCount = 0;
for (const [day, cells] of Object.entries(GRID)) {
  for (const [start, subject] of cells) {
    const sid = slotId.get(`${day}|${start}`);
    const ssid = ssByName.get(subject);
    if (!sid || !ssid) { console.log(`SKIP d${day} ${start} ${subject}`); continue; }
    const { data: existing } = await sb.from("timetable_entry").select("id")
      .eq("slot_id", sid).eq("scope_section_id", recSec.id).maybeSingle();
    if (existing) {
      await sb.from("timetable_entry").update({ section_subject_id: ssid, teacher_user_id: CT }).eq("id", existing.id);
    } else {
      await sb.from("timetable_entry")
        .insert({ org_id: ORG, slot_id: sid, scope_section_id: recSec.id, scope_hifz_group_id: null, section_subject_id: ssid, teacher_user_id: CT, room: null, notes: null });
    }
    entryCount++;
  }
}
console.log(`Reception entries: ${entryCount}`);

// ─── 3. Catch Up syllabi (tagged to current term — Catch Up is assessed) ─
const { data: term } = await sb.from("academic_term").select("id, name")
  .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).single();
const { data: cuCls } = await sb.from("class").select("id").eq("org_id", ORG).eq("name", "Catch Up").single();

const CU: Record<string, string[]> = {
  Sindhi: [
    "سنڌي الف-بي",
    "سنڌي جا اردو ترجما (ٻ کان ڀ)",
    "انگ: هڪ کان ويهه تائين (١–٢٠)",
    "خال ڀريو (ا کان ي)",
    "سنڌي جا اردو ترجما — جملا",
    "واحد/جمع، اکر/ضد، مذڪر/مؤنث",
    "موسمن جا نالا",
    "مضمون",
    "درخواست",
    "اسم جي سڃاڻ، فعل جي سڃاڻ، صفت جي سڃاڻ، حرف جي سڃاڻ",
    "خط",
  ],
  Science: [
    "Living Things",
    "Classifications of Plants",
    "The Teeth and Food",
    "Human Health",
    "Weather",
    "Technology in Our Daily Life",
    "Activity: Label the Plants",
    "Activity: Animals Group Match",
    "Activity: Body Parts and Care",
  ],
  Computer: [
    "Introduction of Computers and its Parts",
    "Input and Output Devices",
    "Windows and Operating System",
    "Uses of Computers",
    "Hardware and Software",
    "Activity: Label the Computers",
    "Activity: Input and Output — put the pictures in the correct box",
  ],
};
for (const [subjectName, topics] of Object.entries(CU)) {
  const { data: cs } = await sb.from("class_subject").select("id")
    .eq("class_id", cuCls.id).eq("name", subjectName).is("archived_at", null).maybeSingle();
  if (!cs) { console.log(`SKIP CatchUp subject missing: ${subjectName}`); continue; }
  let { data: cur } = await sb.from("curriculum").select("id")
    .eq("class_subject_id", cs.id).eq("academic_year", YEAR).maybeSingle();
  if (!cur) {
    const { data } = await sb.from("curriculum").insert({
      org_id: ORG, class_subject_id: cs.id, academic_year: YEAR,
      title: `${subjectName} · ${YEAR}`,
      description: "1st Assessment syllabus (Head Teacher, Aug 2026)",
      created_by: adminUser.id,
    }).select().single();
    cur = data;
  }
  const { count } = await sb.from("curriculum_topic").select("id", { count: "exact", head: true }).eq("curriculum_id", cur.id);
  if ((count ?? 0) > 0) { console.log(`SKIP CatchUp ${subjectName}: already ${count} topics`); continue; }
  const rows = topics.map((name, i) => ({
    curriculum_id: cur.id, name, display_order: i, academic_term_id: term.id,
  }));
  const { error } = await sb.from("curriculum_topic").insert(rows);
  console.log(error ? `FAIL CatchUp ${subjectName}: ${error.message}` : `OK CatchUp ${subjectName}: ${topics.length} topics (term: ${term.name})`);
}
console.log("done");
