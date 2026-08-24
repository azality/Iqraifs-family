// IFS pilot API regression suite.
//
// Replays every pilot-reported bug class as an automated check against
// the LIVE backend, so regressions are caught by us — not the school.
// All writes are confined to the "Sandbox" class (see
// seed-sandbox-teacher.ts) and two dedicated QA accounts; volatile rows
// (students, assignments, uploads) are deleted at the end, stable
// scaffolding (QA Subject / QA slot) is reused across runs.
//
// Run AFTER every Edge Function deploy (and before calling a fix done):
//   npm run test:regression
//
// Requires .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_ANON_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) as any;
const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059";
const FUNC = `${URL_}/functions/v1/make-server-f116e23f`;

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
    console.log(`FAIL  ${name} — ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function api(token: string | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { apikey: ANON, ...(init.headers as any ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && typeof init.body === "string") headers["Content-Type"] = "application/json";
  return await fetch(`${FUNC}${path}`, { ...init, headers });
}

// ── Scaffolding ─────────────────────────────────────────────────────────
async function ensureUser(email: string, name: string, role: string): Promise<{ id: string; token: string }> {
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  let u = listed.users.find((x: any) => (x.email ?? "").toLowerCase() === email);
  const password = crypto.randomUUID();
  if (!u) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    u = data.user;
  } else {
    await admin.auth.admin.updateUserById(u.id, { password });
  }
  const { data: r } = await admin.from("user_roles").select("id").eq("user_id", u.id)
    .eq("scope_type", "organization").eq("scope_id", ORG).is("revoked_at", null).maybeSingle();
  if (!r) {
    await admin.from("user_roles").insert({ user_id: u.id, role_type: role, scope_type: "organization", scope_id: ORG, granted_by: u.id });
  }
  const anon = createClient(URL_, ANON) as any;
  const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signin ${email}: ${sErr.message}`);
  return { id: u.id, token: sess.session.access_token };
}

console.log("== IFS regression suite ==");
const t0 = Date.now();

// Sandbox class + section (created by seed-sandbox-teacher.ts).
const { data: sandboxClass } = await admin.from("class").select("id").eq("org_id", ORG).eq("name", "Sandbox").maybeSingle();
if (!sandboxClass) { console.error("Sandbox class missing — run scripts/seed-sandbox-teacher.ts first."); Deno.exit(1); }
const { data: sandboxSec } = await admin.from("class_section").select("id").eq("class_id", sandboxClass.id).eq("name", "A").maybeSingle();

const teacher = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
const office = await ensureUser("qa-office@azality.com", "QA Office", "office_staff");

// QA Subject in Sandbox, taught by qa-teacher (subject teacher, NOT the CT
// — that asymmetry is exactly what the access checks exercise).
let { data: qaCs } = await admin.from("class_subject").select("id").eq("class_id", sandboxClass.id).eq("name", "QA Subject").maybeSingle();
if (!qaCs) {
  const { data } = await admin.from("class_subject").insert({ org_id: ORG, class_id: sandboxClass.id, name: "QA Subject", sort_order: 50, created_by: teacher.id }).select().single();
  qaCs = data;
}
let { data: qaSs } = await admin.from("section_subject").select("id").eq("class_subject_id", qaCs.id).eq("class_section_id", sandboxSec.id).maybeSingle();
if (!qaSs) {
  const { data } = await admin.from("section_subject").insert({ org_id: ORG, class_section_id: sandboxSec.id, class_subject_id: qaCs.id, name: "QA Subject", teacher_user_id: teacher.id, sort_order: 50 }).select().single();
  qaSs = data;
} else {
  await admin.from("section_subject").update({ teacher_user_id: teacher.id }).eq("id", qaSs.id);
}
let { data: qaCur } = await admin.from("curriculum").select("id").eq("class_subject_id", qaCs.id).eq("academic_year", "2026-27").maybeSingle();
if (!qaCur) {
  const { data } = await admin.from("curriculum").insert({ org_id: ORG, class_subject_id: qaCs.id, academic_year: "2026-27", title: "QA Subject · 2026-27", description: "regression suite", created_by: teacher.id }).select().single();
  qaCur = data;
}
const { data: qaTopics } = await admin.from("curriculum_topic").select("id").eq("curriculum_id", qaCur.id);
if ((qaTopics?.length ?? 0) === 0) {
  await admin.from("curriculum_topic").insert([
    { curriculum_id: qaCur.id, name: "QA Topic 1", display_order: 0 },
    { curriculum_id: qaCur.id, name: "QA Topic 2", display_order: 1 },
  ]);
}
// QA timetable slot tomorrow + entry for the QA subject.
const tomorrowDow = (((new Date().getDay() + 6) % 7) + 1) % 7 + 1; // 1..7, tomorrow
let { data: qaSlot } = await admin.from("timetable_slot").select("id").eq("org_id", ORG).eq("name", "QA P1").eq("day_of_week", tomorrowDow).is("archived_at", null).maybeSingle();
if (!qaSlot) {
  const { data } = await admin.from("timetable_slot").insert({ org_id: ORG, name: "QA P1", day_of_week: tomorrowDow, start_time: "09:00", end_time: "09:30", kind: "academic", display_order: 60 }).select().single();
  qaSlot = data;
}
let { data: qaEntry } = await admin.from("timetable_entry").select("id").eq("slot_id", qaSlot.id).eq("scope_section_id", sandboxSec.id).maybeSingle();
if (!qaEntry) {
  const { data } = await admin.from("timetable_entry").insert({ org_id: ORG, slot_id: qaSlot.id, scope_section_id: sandboxSec.id, scope_hifz_group_id: null, section_subject_id: qaSs.id, teacher_user_id: teacher.id, room: null, notes: null }).select().single();
  qaEntry = data;
} else {
  await admin.from("timetable_entry").update({ section_subject_id: qaSs.id, teacher_user_id: teacher.id }).eq("id", qaEntry.id);
}

// ── Checks ──────────────────────────────────────────────────────────────

await check("1. health endpoint reports a server version", async () => {
  const r = await fetch(`${FUNC}/health`);
  const j = await r.json();
  assert(r.ok && typeof j.serverVersion === "string", `status ${r.status}`);
});

await check("2. public site + instagram feed respond anonymously", async () => {
  const a = await fetch(`${FUNC}/school/public-site/iqra-ifs`);
  assert(a.status === 200, `public-site ${a.status}`);
  const b = await fetch(`${FUNC}/school/public-site/iqra-ifs/instagram`);
  const jb = await b.json();
  assert(b.status === 200 && Array.isArray(jb.posts), `instagram ${b.status}`);
});

await check("3. subject teacher sees taught section in leaderboard (#337)", async () => {
  const r = await api(teacher.token, `/school/orgs/${ORG}/sections/leaderboard`);
  const j = await r.json();
  assert(r.ok, `leaderboard ${r.status}`);
  const row = (j.sections ?? []).find((s: any) => s.sectionId === sandboxSec.id);
  assert(row, "Sandbox section missing from subject teacher's leaderboard");
  assert("classTeacherUserId" in (row ?? {}), "leaderboard row missing classTeacherUserId (#341 contract)");
});

let assignmentId: string | null = null;
await check("4. assignment create → edit with sectionSubjectId (#334) → delete", async () => {
  const c = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/assignments`, {
    method: "POST",
    body: JSON.stringify({ title: "QA assignment", kind: "homework", maxScore: 10, sectionSubjectId: qaSs.id, assignedDate: new Date().toISOString().slice(0, 10) }),
  });
  const cj = await c.json();
  assert(c.status === 201, `create ${c.status}: ${JSON.stringify(cj).slice(0, 120)}`);
  assignmentId = cj.assignment?.id ?? cj.id;
  assert(assignmentId, "no assignment id in create response");
  assert(typeof (cj.assignment?.maxScore ?? cj.maxScore) === "number", "maxScore missing from payload (#329 contract)");
  const p = await api(teacher.token, `/school/orgs/${ORG}/assignments/${assignmentId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "QA assignment 2", sectionSubjectId: qaSs.id }),
  });
  assert(p.status === 200, `PATCH with sectionSubjectId returned ${p.status} — #334 regression`);
});
if (assignmentId) {
  await api(teacher.token, `/school/orgs/${ORG}/assignments/${assignmentId}`, { method: "DELETE" });
}

await check("5. subject-teacher change propagates to timetable entries (#346)", async () => {
  const r1 = await api(teacher.token, `/school/section-subjects/${qaSs.id}`, {
    method: "PATCH", body: JSON.stringify({ teacherUserId: office.id }),
  });
  assert(r1.status === 200, `PATCH teacher ${r1.status}`);
  const { data: e1 } = await admin.from("timetable_entry").select("teacher_user_id").eq("id", qaEntry.id).single();
  assert(e1.teacher_user_id === office.id, "entry teacher did not follow subject teacher");
  // revert
  await api(teacher.token, `/school/section-subjects/${qaSs.id}`, { method: "PATCH", body: JSON.stringify({ teacherUserId: teacher.id }) });
  const { data: e2 } = await admin.from("timetable_entry").select("teacher_user_id").eq("id", qaEntry.id).single();
  assert(e2.teacher_user_id === teacher.id, "revert did not propagate");
});

let qaStudentId: string | null = null;
await check("6. GR: next suggestion, duplicate names holder, withdrawn hints re-admit (#344/#345)", async () => {
  const n = await api(office.token, `/school/orgs/${ORG}/students-next-gr`);
  const nj = await n.json();
  assert(n.ok && typeof nj.suggested === "string", `next-gr ${n.status}`);
  const gr = nj.suggested as string;
  const mk = await api(office.token, `/school/orgs/${ORG}/students`, {
    method: "POST", body: JSON.stringify({ grNumber: gr, fullName: "QA Student", classSectionId: sandboxSec.id }),
  });
  const mkj = await mk.json();
  assert(mk.status === 201, `create student ${mk.status}: ${JSON.stringify(mkj).slice(0, 120)}`);
  qaStudentId = mkj.id ?? mkj.student?.id;
  const dup = await api(office.token, `/school/orgs/${ORG}/students`, {
    method: "POST", body: JSON.stringify({ grNumber: gr, fullName: "QA Student Dup", classSectionId: sandboxSec.id }),
  });
  const dj = await dup.json();
  assert(dup.status === 409 && dj.code === "GR_EXISTS" && String(dj.error).includes("QA Student"), `active dup: ${dup.status} ${JSON.stringify(dj).slice(0, 140)}`);
  const ml = await api(office.token, `/school/orgs/${ORG}/students/${qaStudentId}/mark-left`, { method: "POST", body: JSON.stringify({ reason: "qa" }) });
  assert(ml.ok, `mark-left ${ml.status}`);
  const dup2 = await api(office.token, `/school/orgs/${ORG}/students`, {
    method: "POST", body: JSON.stringify({ grNumber: gr, fullName: "QA Student Dup", classSectionId: sandboxSec.id }),
  });
  const dj2 = await dup2.json();
  assert(dup2.status === 409 && dj2.code === "GR_EXISTS_WITHDRAWN" && String(dj2.error).includes("Re-admit"), `withdrawn dup: ${dup2.status} ${JSON.stringify(dj2).slice(0, 140)}`);
});
if (qaStudentId) {
  await api(office.token, `/school/orgs/${ORG}/students/${qaStudentId}`, { method: "DELETE" });
}

await check("7. upload ticket validates type, signed PUT lands in storage (#338)", async () => {
  const bad = await api(teacher.token, `/school/orgs/${ORG}/file-upload-url`, {
    method: "POST", body: JSON.stringify({ fileName: "x.exe", contentType: "application/x-msdownload", size: 1000 }),
  });
  assert(bad.status === 400, `exe accepted?! ${bad.status}`);
  const ok = await api(teacher.token, `/school/orgs/${ORG}/file-upload-url`, {
    method: "POST", body: JSON.stringify({ fileName: "qa.pdf", contentType: "application/pdf", size: 2000 }),
  });
  const oj = await ok.json();
  assert(ok.status === 200 && oj.path && oj.token, `ticket ${ok.status}: ${JSON.stringify(oj).slice(0, 120)}`);
  const anon = createClient(URL_, ANON) as any;
  const bytes = new TextEncoder().encode("%PDF-1.4\nqa regression");
  const { error } = await anon.storage.from("school-files").uploadToSignedUrl(oj.path, oj.token, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf" });
  assert(!error, `signed PUT: ${error?.message}`);
  await admin.storage.from("school-files").remove([oj.path]);
});

await check("8. lesson prep exposes entry + topic + planner fields (#339/#342)", async () => {
  const r = await api(teacher.token, `/school/orgs/${ORG}/me/upcoming?limit=20`);
  const j = await r.json();
  assert(r.ok, `upcoming ${r.status}`);
  const item = (j.upcoming ?? []).find((u: any) => u.sectionId === sandboxSec.id);
  assert(item, "QA entry missing from /me/upcoming");
  assert(item.topic && item.topic.name?.startsWith("QA Topic"), "next-in-sequence topic not surfaced");
  assert(item.classSubjectId && item.entryDate && "sectionSubjectId" in item, "planner fields missing (#342/#343 contract)");
});

const today = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
let erStudentId: string | null = null;
await check("9. early release: reason required, owner-gated, lifecycle", async () => {
  const gr = `QA-ER-${Math.floor(Math.random() * 1e6)}`;
  const mk = await api(office.token, `/school/orgs/${ORG}/students`, {
    method: "POST", body: JSON.stringify({ grNumber: gr, fullName: "QA ER Student", classSectionId: sandboxSec.id }),
  });
  const mkj = await mk.json();
  assert(mk.status === 201, `student ${mk.status}`);
  erStudentId = mkj.id ?? mkj.student?.id;
  const att = await api(office.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance`, {
    method: "POST", body: JSON.stringify({ date: today, entries: [{ studentId: erStudentId, status: "present" }] }),
  });
  assert(att.ok, `attendance save ${att.status}`);
  const noReason = await api(office.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance/early-release`, {
    method: "POST", body: JSON.stringify({ studentId: erStudentId, date: today }),
  });
  assert(noReason.status === 400, `missing reason accepted?! ${noReason.status}`);
  const asSubject = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance/early-release`, {
    method: "POST", body: JSON.stringify({ studentId: erStudentId, date: today, reason: "test" }),
  });
  const asJ = await asSubject.json();
  assert(asSubject.status === 403 && asJ.code === "NOT_ROLLCALL_OWNER", `subject teacher allowed?! ${asSubject.status}`);
  const ok = await api(office.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance/early-release`, {
    method: "POST", body: JSON.stringify({ studentId: erStudentId, date: today, reason: "unwell, guardian informed" }),
  });
  const okJ = await ok.json();
  assert(ok.status === 200 && okJ.leftEarlyAt, `early release ${ok.status}: ${JSON.stringify(okJ).slice(0, 120)}`);
  const roll = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance?date=${today}`);
  const rollJ = await roll.json();
  const entry = (rollJ.entries ?? []).find((e: any) => e.studentId === erStudentId);
  assert(entry?.leftEarlyAt && entry?.leftEarlyReason, "left-early fields missing from GET attendance");
  const clear = await api(office.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance/early-release`, {
    method: "POST", body: JSON.stringify({ studentId: erStudentId, date: today, clear: true }),
  });
  const clearJ = await clear.json();
  assert(clear.status === 200 && clearJ.leftEarlyAt === null, `clear failed ${clear.status}`);
});

await check("10. discrepancy flags: subject teacher raises, roll-call owner resolves", async () => {
  const raise = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance-flags`, {
    method: "POST", body: JSON.stringify({ date: today, studentId: erStudentId, note: "Marked present but not in my class" }),
  });
  const rj = await raise.json();
  assert(raise.status === 201 && rj.flag?.status === "open", `raise ${raise.status}: ${JSON.stringify(rj).slice(0, 120)}`);
  const list = await api(office.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance-flags?status=open`);
  const lj = await list.json();
  const found = (lj.flags ?? []).find((f: any) => f.id === rj.flag.id);
  assert(found && "raisedByName" in found, "flag missing from open list");
  const asSubject = await api(teacher.token, `/school/orgs/${ORG}/attendance-flags/${rj.flag.id}/resolve`, {
    method: "POST", body: JSON.stringify({ status: "resolved" }),
  });
  assert(asSubject.status === 403, `subject teacher resolved?! ${asSubject.status}`);
  const res = await api(office.token, `/school/orgs/${ORG}/attendance-flags/${rj.flag.id}/resolve`, {
    method: "POST", body: JSON.stringify({ status: "resolved", resolution: "early release recorded" }),
  });
  const resJ = await res.json();
  assert(res.status === 200 && resJ.flag?.status === "resolved", `resolve ${res.status}`);
  await admin.from("attendance_flag").delete().eq("id", rj.flag.id);
});
if (erStudentId) {
  await admin.from("school_attendance").delete().eq("student_id", erStudentId);
  await api(office.token, `/school/orgs/${ORG}/students/${erStudentId}`, { method: "DELETE" });
}

await check("11. lessons list carries lessonDate + taughtByName (feed contract)", async () => {
  const mk = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/lessons`, {
    method: "POST", body: JSON.stringify({ title: "QA lesson", lessonDate: today, sectionSubjectId: qaSs.id }),
  });
  const mkj = await mk.json();
  assert(mk.status === 201 && mkj.lesson?.id, `create lesson ${mk.status}`);
  const list = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/lessons?startDate=${today}&endDate=${today}`);
  const lj = await list.json();
  const found = (lj.lessons ?? []).find((l: any) => l.id === mkj.lesson.id);
  assert(found, "created lesson missing from list");
  assert(found.lessonDate === today, `lessonDate wrong: ${found.lessonDate}`);
  assert(typeof found.taughtByName === "string" && found.taughtByName.length > 0, "taughtByName missing (pilot bug: 'Taught by —')");
  await api(teacher.token, `/school/orgs/${ORG}/lessons/${mkj.lesson.id}`, { method: "DELETE" });
});

// ── Summary ─────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  Deno.exit(1);
}
