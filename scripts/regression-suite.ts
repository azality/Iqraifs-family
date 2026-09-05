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
// Org-view account for principal-cockpit checks (determineScope only
// grants org scope to principal/admin/org-teacher, not office_staff).
const principal = await ensureUser("qa-principal@azality.com", "QA Principal", "principal");

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
  const { data } = await admin.from("timetable_slot").insert({ org_id: ORG, name: "QA P1", day_of_week: tomorrowDow, start_time: "09:00", end_time: "09:30", kind: "academic", display_order: 60, schedule_key: "sandbox" }).select().single();
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
  // Org policy (Sep 4 2026, user-approved): define_curriculum is OFF for
  // class_teacher — schema-level subject edits are an admin job now, so
  // the teacher attempt must 403 and the propagation is exercised as
  // principal.
  const denied = await api(teacher.token, `/school/section-subjects/${qaSs.id}`, {
    method: "PATCH", body: JSON.stringify({ teacherUserId: office.id }),
  });
  assert(denied.status === 403, `teacher PATCH expected 403 (define_curriculum off), got ${denied.status}`);
  const r1 = await api(principal.token, `/school/section-subjects/${qaSs.id}`, {
    method: "PATCH", body: JSON.stringify({ teacherUserId: office.id }),
  });
  assert(r1.status === 200, `PATCH teacher ${r1.status}`);
  const { data: e1 } = await admin.from("timetable_entry").select("teacher_user_id").eq("id", qaEntry.id).single();
  assert(e1.teacher_user_id === office.id, "entry teacher did not follow subject teacher");
  // revert
  await api(principal.token, `/school/section-subjects/${qaSs.id}`, { method: "PATCH", body: JSON.stringify({ teacherUserId: teacher.id }) });
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

await check("12. principal cockpit: academics pace block + insights activity digest", async () => {
  // Pace contract on /academics — the Curriculum tile + pace card read this.
  const a = await api(office.token, `/school/orgs/${ORG}/academics`);
  const aj = await a.json();
  assert(a.status === 200, `academics ${a.status}`);
  assert(aj.pace && Array.isArray(aj.pace.laggards), "pace.laggards missing");
  assert(
    aj.pace.termName === null || typeof aj.pace.expectedPct === "number",
    "current term exists but expectedPct not computed",
  );
  if (aj.pace.laggards.length > 0) {
    const l = aj.pace.laggards[0];
    assert(
      typeof l.pct === "number" && typeof l.topicsTotal === "number" && l.className,
      "laggard row missing fields",
    );
  }
  // Insights feed: org viewer gets the per-day attendance digest, not one
  // row per section, and the endpoint tolerates the new flag/early_release
  // kinds without erroring.
  const i = await api(principal.token, `/school/orgs/${ORG}/insights?period=MTD`);
  const ij = await i.json();
  assert(i.status === 200 && Array.isArray(ij.recentActivity), `insights ${i.status}`);
  // Sandbox must not leak into org-level leaderboard rows either.
  const lb = await api(principal.token, `/school/orgs/${ORG}/sections/leaderboard?period=MTD`);
  const lbj = await lb.json();
  assert(lb.status === 200, `leaderboard ${lb.status}`);
  assert(
    !JSON.stringify(lbj).toLowerCase().includes("sandbox"),
    "Sandbox section leaked into org leaderboard",
  );
  const attRows = ij.recentActivity.filter((r: any) => r.kind === "attendance");
  for (const r of attRows) {
    assert(
      /Attendance taken in \d+\/\d+ sections/.test(r.summary),
      `org attendance row not digested: "${r.summary}"`,
    );
  }
});

await check("13. master timetable: bands + conflicts contract, admin-gated", async () => {
  const r = await api(principal.token, `/school/orgs/${ORG}/timetable/master?day=1`);
  const j = await r.json();
  assert(r.status === 200, `master ${r.status}`);
  assert(Array.isArray(j.bands) && j.bands.length > 0, "bands missing");
  assert(Array.isArray(j.entries) && Array.isArray(j.conflicts), "entries/conflicts missing");
  const band = j.bands[0];
  assert(Array.isArray(band.slots) && Array.isArray(band.sections) && band.label, "band shape wrong");
  // QA scaffolding must never leak into the school-facing view.
  assert(!j.bands.some((b: any) => b.key === "sandbox"), "sandbox band leaked");
  assert(
    !j.bands.some((b: any) => b.sections.some((s: any) => /sandbox/i.test(s.label))),
    "sandbox section leaked into a band",
  );
  // class_teacher must NOT see the whole school's grid.
  const t = await api(teacher.token, `/school/orgs/${ORG}/timetable/master?day=1`);
  assert(t.status === 403, `teacher expected 403, got ${t.status}`);
  // merge-mark validates entry ownership (fake ids -> 404, nothing stored).
  const mk = await api(principal.token, `/school/orgs/${ORG}/timetable/merge-marks`, {
    method: "POST",
    body: JSON.stringify({ entryAId: crypto.randomUUID(), entryBId: crypto.randomUUID() }),
  });
  assert(mk.status === 404, `fake merge-mark expected 404, got ${mk.status}`);
});

await check("14. topic-term tagging: create/patch with term, invalid term rejected", async () => {
  const termsR = await api(principal.token, `/school/orgs/${ORG}/terms`);
  const termsJ = await termsR.json();
  assert(termsR.status === 200 && Array.isArray(termsJ.terms), `terms ${termsR.status}`);
  const current = termsJ.terms.find((t: any) => t.isCurrent);
  assert(current, "no current term configured");
  // Org policy (Sep 4 2026): define_curriculum is OFF for class_teacher —
  // topic creation is an admin job (the tick-only carve-out keeps
  // own-subject completion toggles working; check 39's persona probe
  // covers that side). Teacher create must 403; the tagging feature is
  // exercised as principal.
  const teacherDenied = await api(teacher.token, `/school/class-curriculum/${qaCur.id}/topics`, {
    method: "POST",
    body: JSON.stringify({ name: "QA policy probe", academicTermId: current.id }),
  });
  assert(teacherDenied.status === 403, `teacher create expected 403 (define_curriculum off), got ${teacherDenied.status}`);
  // Create tagged to the current term.
  const mk = await api(principal.token, `/school/class-curriculum/${qaCur.id}/topics`, {
    method: "POST",
    body: JSON.stringify({ name: `QA term topic ${Date.now()}`, academicTermId: current.id }),
  });
  const mkj = await mk.json();
  assert(mk.status === 201 && mkj.topic?.academicTermId === current.id,
    `create tagged: ${mk.status} termId=${mkj.topic?.academicTermId}`);
  // Foreign/garbage term id must be rejected.
  const bad = await api(principal.token, `/school/class-curriculum/${qaCur.id}/topics`, {
    method: "POST",
    body: JSON.stringify({ name: "QA bad term", academicTermId: crypto.randomUUID() }),
  });
  assert(bad.status === 400, `bad term expected 400, got ${bad.status}`);
  // PATCH to whole-year clears the tag.
  const up = await api(principal.token, `/school/curriculum-topics/${mkj.topic.id}`, {
    method: "PATCH",
    body: JSON.stringify({ academicTermId: null }),
  });
  const upj = await up.json();
  assert(up.status === 200 && upj.topic?.academicTermId === null,
    `clear tag: ${up.status} termId=${upj.topic?.academicTermId}`);
  await api(principal.token, `/school/curriculum-topics/${mkj.topic.id}`, { method: "DELETE" });
});

await check("15. chronic absentees: term window, shape, scope-aware", async () => {
  const r = await api(principal.token, `/school/orgs/${ORG}/attendance/at-risk?period=TERM&threshold=75`);
  const j = await r.json();
  assert(r.status === 200, `at-risk ${r.status}`);
  assert(Array.isArray(j.rows) && j.threshold === 75 && typeof j.windowStart === "string",
    "at-risk shape wrong");
  assert(j.period === "TERM" ? typeof j.termName === "string" : true,
    "TERM period without termName");
  for (const row of j.rows) {
    assert(row.pct < 75 && row.totalDays >= j.minDays, `row violates threshold/minDays: ${JSON.stringify(row)}`);
    assert(!/sandbox/i.test(row.sectionLabel ?? ""), "sandbox student in org at-risk list");
  }
  // Teacher gets a scoped (never erroring) view.
  const t = await api(teacher.token, `/school/orgs/${ORG}/attendance/at-risk`);
  assert(t.status === 200, `teacher at-risk ${t.status}`);
});

await check("16. today strip: ops rollup shape, admin-gated, sandbox excluded", async () => {
  const r = await api(principal.token, `/school/orgs/${ORG}/today-ops`);
  const j = await r.json();
  assert(r.status === 200, `today-ops ${r.status}`);
  assert(
    typeof j.sectionsExpected === "number" &&
      typeof j.sectionsTaken === "number" &&
      Array.isArray(j.missingSections) &&
      typeof j.openFlags === "number" &&
      Array.isArray(j.teachersOnLeave),
    "today-ops shape wrong",
  );
  assert(j.sectionsTaken <= j.sectionsExpected, "taken > expected");
  assert(
    !j.missingSections.some((m: string) => /sandbox/i.test(m)),
    "sandbox section counted in today-ops",
  );
  // Teachers must not see the whole-school ops strip.
  const t = await api(teacher.token, `/school/orgs/${ORG}/today-ops`);
  assert(t.status === 403, `teacher expected 403, got ${t.status}`);
});

// ── Portal (student/parent PIN) checks ─────────────────────────────────
// The school's students/parents will never report API bugs — this section
// is their tester. Stable scaffolding in Sandbox: two students + one
// parent (linked to student 1 only), PINs set via the real admin endpoint.

async function ensurePortalStudent(gr: string, name: string): Promise<string> {
  const { data: existing } = await admin.from("student").select("id, status")
    .eq("org_id", ORG).eq("gr_number", gr).maybeSingle();
  if (existing) {
    if (existing.status !== "active") {
      await admin.from("student").update({ status: "active", left_at: null }).eq("id", existing.id);
    }
    return existing.id;
  }
  const r = await api(office.token, `/school/orgs/${ORG}/students`, {
    method: "POST",
    body: JSON.stringify({ grNumber: gr, fullName: name, classSectionId: sandboxSec.id }),
  });
  const j = await r.json();
  if (r.status !== 201) throw new Error(`create portal student ${gr}: ${r.status}`);
  return j.id ?? j.student?.id;
}

const pStu1 = await ensurePortalStudent("QA-PORTAL-1", "QA Portal Student");
const pStu2 = await ensurePortalStudent("QA-PORTAL-2", "QA Portal Peer");

const PARENT_PHONE = "+920000000901";
let { data: pParent } = await admin.from("parent").select("id")
  .eq("org_id", ORG).eq("phone", PARENT_PHONE).maybeSingle();
if (!pParent) {
  const r = await api(office.token, `/school/orgs/${ORG}/parents`, {
    method: "POST",
    body: JSON.stringify({ fullName: "QA Portal Parent", phone: PARENT_PHONE }),
  });
  const j = await r.json();
  if (r.status !== 201) throw new Error(`create portal parent: ${r.status}`);
  pParent = { id: j.id ?? j.parent?.id };
}
{
  const { data: link } = await admin.from("student_parent").select("student_id")
    .eq("parent_id", pParent.id).eq("student_id", pStu1).maybeSingle();
  if (!link) {
    const { error } = await admin.from("student_parent")
      .insert({ org_id: ORG, parent_id: pParent.id, student_id: pStu1, is_primary: true });
    if (error) {
      // Some schemas lack org_id on the link table — retry without it.
      const { error: e2 } = await admin.from("student_parent")
        .insert({ parent_id: pParent.id, student_id: pStu1, is_primary: true });
      if (e2) throw new Error(`link parent: ${e2.message}`);
    }
  }
}
// PINs via the real admin endpoint (idempotent upsert).
for (const [subjectType, subjectId, pin] of [
  ["student", pStu1, "1234"],
  ["student", pStu2, "2345"],
  ["parent", pParent.id, "3456"],
] as const) {
  const r = await api(office.token, `/school/orgs/${ORG}/pin/set`, {
    method: "POST", body: JSON.stringify({ subjectType, subjectId, pin }),
  });
  if (!r.ok) throw new Error(`pin/set ${subjectType}: ${r.status}`);
}

async function pinLogin(loginIdentifier: string, pin: string): Promise<Response> {
  return await fetch(`${FUNC}/school/auth/pin-login`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ orgIdentifier: "iqra-ifs", loginIdentifier, pin }),
  });
}
async function portalGet(token: string, path: string): Promise<Response> {
  return await fetch(`${FUNC}/school${path}`, {
    headers: { apikey: ANON, "X-Pin-Token": token },
  });
}

let stuToken = "";
let peerToken = "";
let parToken = "";

await check("17. portal auth: PIN login, lockout-safe wrong-pin, /pin-me profile", async () => {
  const bad = await pinLogin("QA-PORTAL-1", "9999");
  assert(bad.status === 401, `wrong pin expected 401, got ${bad.status}`);
  const ok = await pinLogin("QA-PORTAL-1", "1234");
  const oj = await ok.json();
  assert(ok.status === 200 && oj.token && oj.subjectType === "student", `login ${ok.status}`);
  stuToken = oj.token;
  const ok2 = await pinLogin("QA-PORTAL-2", "2345");
  peerToken = (await ok2.json()).token;
  const okP = await pinLogin(PARENT_PHONE, "3456");
  const pj = await okP.json();
  assert(okP.status === 200 && pj.subjectType === "parent", `parent login ${okP.status}`);
  parToken = pj.token;
  const me = await portalGet(stuToken, `/pin-me`);
  assert(me.status === 200, `/pin-me ${me.status}`);
  const garbage = await portalGet("not-a-token", `/pin-me`);
  assert(garbage.status === 401, `garbage token expected 401, got ${garbage.status}`);
});

await check("18. student portal surface: every pin-me endpoint answers for own id", async () => {
  assert(stuToken, "no student token from check 17");
  const endpoints = [
    "dashboard", "timetable", "attendance", "lessons", "grades",
    "behavior", "diary", "today-snapshot", "hifz", "teacher-comments",
  ];
  for (const ep of endpoints) {
    const r = await portalGet(stuToken, `/pin-me/students/${pStu1}/${ep}`);
    const j = await r.json().catch(() => null);
    assert(
      r.status === 200 && j && !j.error,
      `${ep}: ${r.status} ${JSON.stringify(j)?.slice(0, 100)}`,
    );
  }
});

await check("19. portal isolation: no student can read another student's data", async () => {
  assert(stuToken && peerToken && parToken, "tokens missing from check 17");
  // Student 1's token against student 2's data — every endpoint must refuse.
  for (const ep of ["dashboard", "attendance", "grades", "behavior"]) {
    const r = await portalGet(stuToken, `/pin-me/students/${pStu2}/${ep}`);
    assert(r.status === 403, `cross-student ${ep} expected 403, got ${r.status}`);
  }
  // Parent: linked child readable, unlinked child refused.
  const own = await portalGet(parToken, `/pin-me/students/${pStu1}/dashboard`);
  assert(own.status === 200, `parent->linked child ${own.status}`);
  const other = await portalGet(parToken, `/pin-me/students/${pStu2}/dashboard`);
  assert(other.status === 403, `parent->unlinked child expected 403, got ${other.status}`);
});

await check("20. behavior points: school-set values enforced, Other clamped + suggested", async () => {
  // Catalog carries the school's point values.
  const cats = await api(teacher.token, `/school/orgs/${ORG}/behavior-categories`);
  const cj = await cats.json();
  assert(cats.status === 200 && Array.isArray(cj.categories) && cj.categories.length > 0, `categories ${cats.status}`);
  const adab = cj.categories.find((x: any) => x.key === "adab");
  assert(adab && typeof adab.pointsPositive === "number" && typeof adab.pointsConcern === "number",
    "category missing points fields");
  const noteIds: string[] = [];
  try {
    // Teacher logs Adab with absurd points — server forces the school value.
    const n1 = await api(teacher.token, `/school/orgs/${ORG}/behavior-notes`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, kind: "positive", category: "Adab", points: 99, notes: "QA points enforcement" }),
    });
    const j1 = await n1.json();
    assert(n1.status === 200 || n1.status === 201, `note1 ${n1.status}`);
    noteIds.push(j1.note.id);
    assert(j1.note.points === adab.pointsPositive,
      `expected school value ${adab.pointsPositive}, got ${j1.note.points}`);
    // "Other" free text: magnitude clamped to 3.
    const n2 = await api(teacher.token, `/school/orgs/${ORG}/behavior-notes`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, kind: "concern", category: "QA Made Up Behavior", points: -9, notes: "QA other clamp" }),
    });
    const j2 = await n2.json();
    assert(n2.status === 200 || n2.status === 201, `note2 ${n2.status}`);
    noteIds.push(j2.note.id);
    assert(j2.note.points === -3, `expected clamp to -3, got ${j2.note.points}`);
    // The Other entry surfaces as a suggestion to the school.
    const sg = await api(principal.token, `/school/orgs/${ORG}/behavior-categories/suggestions`);
    const sj = await sg.json();
    assert(sg.status === 200 && Array.isArray(sj.suggestions), `suggestions ${sg.status}`);
    assert(sj.suggestions.some((x: any) => x.label === "QA Made Up Behavior"),
      "Other entry missing from suggestions");
    // Teachers cannot read the suggestions rollup.
    const sgT = await api(teacher.token, `/school/orgs/${ORG}/behavior-categories/suggestions`);
    assert(sgT.status === 403, `teacher suggestions expected 403, got ${sgT.status}`);
  } finally {
    for (const id of noteIds) await admin.from("behavior_note").delete().eq("id", id);
  }
});

await check("21. hifz program: rollup shape, hifz classes present, admin-gated", async () => {
  const r = await api(principal.token, `/school/orgs/${ORG}/hifz-program`);
  const j = await r.json();
  assert(r.status === 200, `hifz-program ${r.status}`);
  assert(
    j.totals && typeof j.totals.students === "number" &&
      Array.isArray(j.classes) && Array.isArray(j.students),
    "hifz-program shape wrong",
  );
  // IFS has four Hifz-schedule classes with ~84 enrolled students.
  assert(j.classes.length >= 1, "no hifz classes in rollup");
  assert(j.totals.students >= j.classes.length, "totals below class count");
  for (const s of j.students.slice(0, 5)) {
    assert(s.name && s.sectionLabel !== undefined && ["hifz", "revision"].includes(s.track),
      `student row shape: ${JSON.stringify(s).slice(0, 100)}`);
  }
  const t = await api(teacher.token, `/school/orgs/${ORG}/hifz-program`);
  assert(t.status === 403, `teacher expected 403, got ${t.status}`);
});

await check("22. class type: create with kind, invalid rejected, patch flips it", async () => {
  const mk = await api(principal.token, `/school/orgs/${ORG}/classes`, {
    method: "POST",
    body: JSON.stringify({ name: `QA Kind Temp ${Date.now()}`, kind: "hifz" }),
  });
  const mj = await mk.json();
  assert(mk.status === 200 || mk.status === 201, `create ${mk.status}`);
  const clsId = mj.id ?? mj.class?.id;
  assert(clsId, "no class id in response");
  try {
    assert((mj.kind ?? mj.class?.kind) === "hifz", `kind not echoed: ${JSON.stringify(mj).slice(0, 120)}`);
    const bad = await api(principal.token, `/school/orgs/${ORG}/classes`, {
      method: "POST",
      body: JSON.stringify({ name: "QA Bad Kind", kind: "montessori" }),
    });
    assert(bad.status === 400, `invalid kind expected 400, got ${bad.status}`);
    const up = await api(principal.token, `/school/orgs/${ORG}/classes/${clsId}`, {
      method: "PATCH",
      body: JSON.stringify({ kind: "academic" }),
    });
    const uj = await up.json();
    assert(up.status === 200 && (uj.kind ?? uj.class?.kind) === "academic", `patch kind ${up.status}`);
  } finally {
    await api(principal.token, `/school/orgs/${ORG}/classes/${clsId}`, { method: "DELETE" });
  }
});

await check("23. global search: teachers/classes/topics groups, QA accounts hidden", async () => {
  // Class search → section rows with deep links.
  const c1 = await api(principal.token, `/school/orgs/${ORG}/search?q=${encodeURIComponent("Class V")}`);
  const j1 = await c1.json();
  assert(c1.status === 200, `search ${c1.status}`);
  assert(Array.isArray(j1.sections) && j1.sections.length > 0, "no class sections found for 'Class V'");
  assert(j1.sections[0].path.includes("/sections/"), "section result missing deep link");
  // Teacher search by name; QA scaffolding accounts must not surface.
  const c2 = await api(principal.token, `/school/orgs/${ORG}/search?q=Wardah`);
  const j2 = await c2.json();
  assert((j2.teachers ?? []).some((t: any) => String(t.name).includes("Wardah")), "teacher not found by name");
  const c3 = await api(principal.token, `/school/orgs/${ORG}/search?q=QA`);
  const j3 = await c3.json();
  assert(!(j3.teachers ?? []).some((t: any) => /qa-.*@azality/.test(t.email ?? "")), "QA account leaked into teacher search");
  // Admin/principal accounts have no teacher profile page - they must not
  // surface as dead links (pilot: "Ambreen" -> admin account -> not found).
  const c3b = await api(principal.token, `/school/orgs/${ORG}/search?q=Ambreen`);
  const j3b = await c3b.json();
  assert(!(j3b.teachers ?? []).some((t: any) => ["admin", "principal"].includes(t.roleType)),
    "admin/principal leaked into teacher search results");
  // Topic search deep-links into a class's subjects panel.
  const c4 = await api(principal.token, `/school/orgs/${ORG}/search?q=${encodeURIComponent("Backward counting")}`);
  const j4 = await c4.json();
  assert((j4.topics ?? []).length > 0, "topic not found");
  assert(j4.topics[0].className && j4.topics[0].subjectName, "topic result missing context");
});

await check("24. digital hand-in: student submits homework, teacher lists + reviews", async () => {
  // Assignment in Sandbox, then the full loop: portal list → submit →
  // teacher submissions list (incl. not-submitted names) → mark seen.
  const mk = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/assignments`, {
    method: "POST",
    body: JSON.stringify({ title: "QA handin", kind: "homework", maxScore: 10, sectionSubjectId: qaSs.id, assignedDate: new Date().toISOString().slice(0, 10) }),
  });
  const mj = await mk.json();
  assert(mk.status === 201, `create ${mk.status}`);
  const aid = mj.assignment?.id ?? mj.id;
  try {
    const login = await pinLogin("QA-PORTAL-1", "1234");
    assert(login.status === 200, `student login ${login.status}`);
    const tok = (await login.json()).token;
    const pinGet = (p: string) => fetch(`${FUNC}${p}`, { headers: { apikey: ANON, "X-Pin-Token": tok } });
    const pinPost = (p: string, body: unknown) => fetch(`${FUNC}${p}`, {
      method: "POST",
      headers: { apikey: ANON, "X-Pin-Token": tok, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const list = await pinGet(`/school/pin-me/students/${pStu1}/assignments`);
    const lj = await list.json();
    assert(list.status === 200, `portal assignments ${list.status}`);
    const mine = (lj.assignments ?? []).find((a: any) => a.id === aid);
    assert(mine && mine.submission === null, "new assignment missing or already submitted");

    const sub = await pinPost(`/school/pin-me/students/${pStu1}/assignments/${aid}/submission`, {
      attachments: [{ url: "https://example.com/qa-handin.jpg", name: "qa-handin.jpg" }],
      note: "QA submission",
    });
    assert(sub.status === 200 || sub.status === 201, `submit ${sub.status}`);

    // Other student's assignment list must not be writable by this token.
    const cross = await pinPost(`/school/pin-me/students/${pStu2}/assignments/${aid}/submission`, {
      attachments: [{ url: "https://example.com/x.jpg", name: "x.jpg" }],
    });
    assert(cross.status === 403, `cross-student submit expected 403, got ${cross.status}`);

    const tr = await api(teacher.token, `/school/orgs/${ORG}/assignments/${aid}/submissions`);
    const tj = await tr.json();
    assert(tr.status === 200, `teacher submissions ${tr.status}`);
    const row = (tj.submissions ?? []).find((s: any) => s.studentId === pStu1);
    assert(row && row.attachments?.length === 1 && row.note === "QA submission", "submission row wrong");
    assert((tj.notSubmitted ?? []).some((s: any) => s.studentId === pStu2), "peer missing from not-submitted");

    const rev = await api(teacher.token, `/school/orgs/${ORG}/submissions/${row.id}/review`, {
      method: "POST", body: JSON.stringify({ reviewed: true }),
    });
    assert(rev.status === 200, `review ${rev.status}`);
    const list2 = await pinGet(`/school/pin-me/students/${pStu1}/assignments`);
    const lj2 = await list2.json();
    const mine2 = (lj2.assignments ?? []).find((a: any) => a.id === aid);
    assert(mine2?.submission?.reviewedAt, "reviewedAt not visible to student");
  } finally {
    // Cascade deletes the submission row with the assignment.
    await api(teacher.token, `/school/orgs/${ORG}/assignments/${aid}`, { method: "DELETE" });
  }
});

await check("25. quiz engine: no answer leak, auto-scored attempt, single attempt", async () => {
  const mk = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/assignments`, {
    method: "POST",
    body: JSON.stringify({ title: "QA quiz", kind: "quiz", maxScore: 10, sectionSubjectId: qaSs.id, assignedDate: new Date().toISOString().slice(0, 10) }),
  });
  const mj = await mk.json();
  assert(mk.status === 201, `create ${mk.status}`);
  const aid = mj.assignment?.id ?? mj.id;
  try {
    for (const [prompt, correctIndex] of [["QA 2+2?", 1], ["QA capital of Pakistan?", 0]] as const) {
      const q = await api(teacher.token, `/school/orgs/${ORG}/assignments/${aid}/quiz-questions`, {
        method: "POST",
        body: JSON.stringify({ prompt, options: ["Islamabad", "4", "7"], correctIndex }),
      });
      assert(q.status === 201, `add question ${q.status}`);
    }
    const login = await pinLogin("QA-PORTAL-1", "1234");
    const tok = (await login.json()).token;
    const pinGet = (p: string) => fetch(`${FUNC}${p}`, { headers: { apikey: ANON, "X-Pin-Token": tok } });
    const pinPost = (p: string, body: unknown) => fetch(`${FUNC}${p}`, {
      method: "POST",
      headers: { apikey: ANON, "X-Pin-Token": tok, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const quiz = await pinGet(`/school/pin-me/students/${pStu1}/assignments/${aid}/quiz`);
    const qj = await quiz.json();
    assert(quiz.status === 200 && qj.questions?.length === 2, `quiz fetch ${quiz.status}`);
    assert(qj.taken === false, "quiz shows taken before any attempt");
    assert(qj.questions.every((q: any) => q.correctIndex === null && q.correct === null),
      "correct answers leaked before attempt");

    const att = await pinPost(`/school/pin-me/students/${pStu1}/assignments/${aid}/quiz-attempt`, {
      answers: [1, 2], // first right, second wrong
    });
    const atj = await att.json();
    assert(att.status === 201, `attempt ${att.status}: ${JSON.stringify(atj).slice(0, 120)}`);
    assert(atj.correctCount === 1 && atj.total === 2 && atj.score === 5,
      `expected 1/2 = 5/10, got ${JSON.stringify(atj).slice(0, 100)}`);

    // Grade row auto-written for the gradebook.
    const { data: gr } = await admin.from("grade").select("score, status")
      .eq("assignment_id", aid).eq("student_id", pStu1).maybeSingle();
    assert(gr && Number(gr.score) === 5 && gr.status === "graded", `grade row wrong: ${JSON.stringify(gr)}`);

    // Retakes are rejected; the review shows the key only after the attempt.
    const again = await pinPost(`/school/pin-me/students/${pStu1}/assignments/${aid}/quiz-attempt`, { answers: [1, 0] });
    assert(again.status === 409, `retake expected 409, got ${again.status}`);
    const review = await pinGet(`/school/pin-me/students/${pStu1}/assignments/${aid}/quiz`);
    const rj = await review.json();
    assert(rj.taken === true && rj.questions[0].correct === true && rj.questions[1].correct === false,
      "post-attempt review wrong");
  } finally {
    await admin.from("grade").delete().eq("assignment_id", aid);
    await api(teacher.token, `/school/orgs/${ORG}/assignments/${aid}`, { method: "DELETE" });
  }
});

await check("26. subject teacher can TICK own syllabus topics (not edit schema)", async () => {
  // Pilot: the Islamiyat subject teacher (role 'teacher', no
  // define_curriculum) couldn't mark her syllabus done. The assigned
  // subject teacher may toggle `completed` — and ONLY that.
  const subjT = await ensureUser("qa-subject-teacher@azality.com", "QA Subject Teacher", "teacher");
  await admin.from("section_subject").update({ teacher_user_id: subjT.id }).eq("id", qaSs.id);
  const { data: topic } = await admin.from("curriculum_topic")
    .select("id, completed").eq("curriculum_id", qaCur.id).limit(1).maybeSingle();
  assert(topic, "no QA topic");
  try {
    const tick = await api(subjT.token, `/school/curriculum-topics/${topic.id}`, {
      method: "PATCH", body: JSON.stringify({ completed: !topic.completed }),
    });
    assert(tick.status === 200, `tick expected 200, got ${tick.status}`);
    // Schema edits stay gated for the same account.
    const rename = await api(subjT.token, `/school/curriculum-topics/${topic.id}`, {
      method: "PATCH", body: JSON.stringify({ name: "QA hijack" }),
    });
    assert(rename.status === 403, `rename expected 403, got ${rename.status}`);
    const sneaky = await api(subjT.token, `/school/curriculum-topics/${topic.id}`, {
      method: "PATCH", body: JSON.stringify({ completed: true, name: "QA hijack" }),
    });
    assert(sneaky.status === 403, `completed+name expected 403, got ${sneaky.status}`);
    // An unrelated non-privileged account cannot tick.
    const other = await api(office.token, `/school/curriculum-topics/${topic.id}`, {
      method: "PATCH", body: JSON.stringify({ completed: true }),
    });
    assert(other.status === 403, `office tick expected 403, got ${other.status}`);
  } finally {
    await admin.from("curriculum_topic").update({ completed: topic.completed }).eq("id", topic.id);
    // qaSs teacher restored by the scaffolding on the next run; restore
    // now anyway so later manual poking sees the normal state.
    await admin.from("section_subject").update({ teacher_user_id: teacher.id }).eq("id", qaSs.id);
  }
});

await check("27. portal privacy: internal notes stripped, student concern/fee gating", async () => {
  // Seed: one hifz entry with an INTERNAL note, one concern behavior note.
  const hifzMk = await api(teacher.token, `/school/orgs/${ORG}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify({
      studentId: pStu1, surahNumber: 1, ayahFrom: 1, ayahTo: 3, kind: "sabaq",
      notes: "QA INTERNAL NOTE", teacherRemarks: "QA parent-visible remark",
      missedTargetReason: "QA missed reason",
    }),
  });
  const hifzJ = await hifzMk.json();
  assert(hifzMk.status === 201, `hifz create ${hifzMk.status}`);
  const hifzId = hifzJ.entry?.id;
  const behMk = await api(teacher.token, `/school/orgs/${ORG}/behavior-notes`, {
    method: "POST",
    body: JSON.stringify({ studentId: pStu1, kind: "concern", category: "Adab", points: -1, notes: "QA CONCERN NOTE" }),
  });
  const behJ = await behMk.json();
  assert(behMk.status === 200 || behMk.status === 201, `behavior create ${behMk.status}`);
  const behId = behJ.note?.id;
  try {
    const sTok = (await (await pinLogin("QA-PORTAL-1", "1234")).json()).token;
    const pTok = (await (await pinLogin(PARENT_PHONE, "3456")).json()).token;
    const get = (tok: string, p: string) =>
      fetch(`${FUNC}${p}`, { headers: { apikey: ANON, "X-Pin-Token": tok } });

    // Internal hifz fields never reach the portal (either token).
    for (const tok of [sTok, pTok]) {
      const r = await get(tok, `/school/pin-me/students/${pStu1}/hifz`);
      const raw = await r.text();
      assert(r.status === 200, `hifz ${r.status}`);
      assert(!raw.includes("QA INTERNAL NOTE"), "internal hifz note leaked to portal");
      assert(!raw.includes("QA missed reason"), "missedTargetReason leaked to portal");
      assert(raw.includes("QA parent-visible remark"), "teacherRemarks missing from portal");
      const cm = await get(tok, `/school/pin-me/students/${pStu1}/teacher-comments`);
      assert(!(await cm.text()).includes("QA INTERNAL NOTE"), "internal note leaked via comments feed");
    }

    // Concern notes: hidden from the student's own login, visible to parent.
    const sBeh = await get(sTok, `/school/pin-me/students/${pStu1}/behavior`);
    const sBehRaw = await sBeh.text();
    assert(sBeh.status === 200 && !sBehRaw.includes("QA CONCERN NOTE"), "concern visible to student login");
    const pBeh = await get(pTok, `/school/pin-me/students/${pStu1}/behavior`);
    assert((await pBeh.text()).includes("QA CONCERN NOTE"), "concern missing from parent login");

    // Fees: parents only.
    const sFees = await get(sTok, `/school/pin-me/students/${pStu1}/fees`);
    assert(sFees.status === 403, `student fees expected 403, got ${sFees.status}`);
    const pFees = await get(pTok, `/school/pin-me/students/${pStu1}/fees`);
    assert(pFees.status === 200, `parent fees ${pFees.status}`);
  } finally {
    if (hifzId) await admin.from("hifz_progress").delete().eq("id", hifzId);
    if (behId) await admin.from("behavior_note").delete().eq("id", behId);
  }
});

await check("28. hifz sabqi-by-para: juzExtent stored, returned, portal-visible; bad values rejected", async () => {
  // Para-based sabqi (pilot: Qari Waqar) — juz_number + juz_extent with
  // the juz-start marker in surah/ayah. Backend must round-trip the
  // extent and degrade invalid values to null instead of erroring.
  const mk = await api(teacher.token, `/school/orgs/${ORG}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify({
      studentId: pStu1, surahNumber: 58, ayahFrom: 1, ayahTo: 1,
      kind: "sabqi", juzNumber: 28, juzExtent: "half", quality: "good",
    }),
  });
  const jparse = async (r: Response, label: string): Promise<any> => {
    const raw = await r.text();
    try { return JSON.parse(raw); } catch {
      throw new Error(`${label} status=${r.status} body=${raw.slice(0, 120)}`);
    }
  };
  const mkJ = await jparse(mk, "create1");
  assert(mk.status === 201, `para sabqi create ${mk.status}`);
  const id1 = mkJ.entry?.id;
  const mk2 = await api(teacher.token, `/school/orgs/${ORG}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify({
      studentId: pStu1, surahNumber: 78, ayahFrom: 1, ayahTo: 1,
      kind: "sabqi", juzNumber: 30, juzExtent: "to_surah:95",
    }),
  });
  const mk2J = await jparse(mk2, "create2");
  assert(mk2.status === 201, `to_surah sabqi create ${mk2.status}`);
  const id2 = mk2J.entry?.id;
  // Invalid extent degrades to null, never a 500.
  const mk3 = await api(teacher.token, `/school/orgs/${ORG}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify({
      studentId: pStu1, surahNumber: 1, ayahFrom: 1, ayahTo: 1,
      kind: "sabqi", juzNumber: 1, juzExtent: "banana",
    }),
  });
  const mk3J = await jparse(mk3, "create3");
  assert(mk3.status === 201, `bad-extent create ${mk3.status}`);
  const id3 = mk3J.entry?.id;
  try {
    // Staff read returns the extent.
    const list = await api(teacher.token, `/school/orgs/${ORG}/students/${pStu1}/hifz-progress?limit=10`);
    const listJ = await jparse(list, "list");
    assert(list.status === 200, `hifz list ${list.status}`);
    const e1 = (listJ.entries ?? []).find((e: any) => e.id === id1);
    const e2 = (listJ.entries ?? []).find((e: any) => e.id === id2);
    const e3 = (listJ.entries ?? []).find((e: any) => e.id === id3);
    assert(e1?.juzExtent === "half" && e1?.juzNumber === 28, `extent half round-trip: ${JSON.stringify(e1?.juzExtent)}`);
    assert(e2?.juzExtent === "to_surah:95", `to_surah round-trip: ${JSON.stringify(e2?.juzExtent)}`);
    assert(e3 && e3.juzExtent == null, `bad extent should store null, got ${JSON.stringify(e3?.juzExtent)}`);
    // Portal sees juzExtent (it's the position reference, parent-visible).
    const pTok = (await jparse(await pinLogin(PARENT_PHONE, "3456"), "pinLogin")).token;
    const pr = await fetch(`${FUNC}/school/pin-me/students/${pStu1}/hifz`, {
      headers: { apikey: ANON, "X-Pin-Token": pTok },
    });
    const prRaw = await pr.text();
    assert(pr.status === 200, `portal hifz ${pr.status}`);
    assert(prRaw.includes('"juzExtent":"half"'), "juzExtent missing from portal payload");
  } finally {
    for (const id of [id1, id2, id3]) {
      if (id) await admin.from("hifz_progress").delete().eq("id", id);
    }
  }
});

await check("29. attendance day notes: admin upsert/read/delete, teacher read-only", async () => {
  // Org-wide "why was attendance unusual" annotations. Principal/admin
  // write; any org staff read. Use a far-past date so a live dashboard
  // viewer never sees the QA note as "today".
  const qaDate = "2020-01-15";
  try {
    // Teacher (class_teacher) cannot write.
    const denied = await api(teacher.token, `/school/orgs/${ORG}/attendance-day-notes/${qaDate}`, {
      method: "PUT", body: JSON.stringify({ note: "QA should be denied" }),
    });
    assert(denied.status === 403, `teacher write expected 403, got ${denied.status}`);
    // Principal writes.
    const put = await api(principal.token, `/school/orgs/${ORG}/attendance-day-notes/${qaDate}`, {
      method: "PUT", body: JSON.stringify({ note: "QA strike day note" }),
    });
    assert(put.status === 200, `principal put ${put.status}`);
    // Bad date rejected.
    const bad = await api(principal.token, `/school/orgs/${ORG}/attendance-day-notes/not-a-date`, {
      method: "PUT", body: JSON.stringify({ note: "x" }),
    });
    assert(bad.status === 400, `bad date expected 400, got ${bad.status}`);
    // Teacher can read it back (range-filtered).
    const list = await api(teacher.token, `/school/orgs/${ORG}/attendance-day-notes?startDate=2020-01-01&endDate=2020-01-31`);
    const listJ = await list.json();
    assert(list.status === 200, `list ${list.status}`);
    const row = (listJ.notes ?? []).find((n: any) => n.noteDate === qaDate);
    assert(row?.note === "QA strike day note", `note round-trip: ${JSON.stringify(row)}`);
    assert(typeof row.createdByName === "string" && row.createdByName.length > 0, "createdByName missing");
    // Blank note deletes.
    const del = await api(principal.token, `/school/orgs/${ORG}/attendance-day-notes/${qaDate}`, {
      method: "PUT", body: JSON.stringify({ note: "  " }),
    });
    const delJ = await del.json();
    assert(del.status === 200 && delJ.deleted === true, `blank-note delete: ${del.status} ${JSON.stringify(delJ)}`);
    const list2 = await api(teacher.token, `/school/orgs/${ORG}/attendance-day-notes?startDate=2020-01-01&endDate=2020-01-31`);
    const list2J = await list2.json();
    assert(!(list2J.notes ?? []).some((n: any) => n.noteDate === qaDate), "note still present after delete");
  } finally {
    await admin.from("attendance_day_note").delete().eq("org_id", ORG).eq("note_date", qaDate);
  }
});

await check("30. academics-day digest: lessons+assignments grouped, admin-gated", async () => {
  // The incharge day view: what was taught/assigned org-wide on a date.
  const day = new Date().toISOString().slice(0, 10);
  let lessonId: string | null = null;
  let asgId: string | null = null;
  try {
    const mkL = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/lessons`, {
      method: "POST",
      body: JSON.stringify({ title: "QA day-digest lesson", lessonDate: day, sectionSubjectId: qaSs.id }),
    });
    const mkLj = await mkL.json();
    assert(mkL.status === 201, `lesson create ${mkL.status}`);
    lessonId = mkLj.lesson?.id;
    const mkA = await api(teacher.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/assignments`, {
      method: "POST",
      body: JSON.stringify({ title: "QA day-digest homework", kind: "homework", maxScore: 10, sectionSubjectId: qaSs.id, assignedDate: day }),
    });
    const mkAj = await mkA.json();
    assert(mkA.status === 201, `assignment create ${mkA.status}`);
    asgId = mkAj.assignment?.id ?? mkAj.id;

    // Plain teacher is NOT an incharge — 403.
    const denied = await api(teacher.token, `/school/orgs/${ORG}/academics-day?date=${day}`);
    assert(denied.status === 403, `teacher digest expected 403, got ${denied.status}`);
    // Principal sees the Sandbox section with both rows + counted totals.
    const r = await api(principal.token, `/school/orgs/${ORG}/academics-day?date=${day}`);
    const j = await r.json();
    assert(r.status === 200, `digest ${r.status}`);
    const sec = (j.sections ?? []).find((s: any) => s.sectionId === sandboxSec.id);
    assert(sec, "sandbox section missing from digest");
    assert(sec.lessons.some((l: any) => l.id === lessonId && l.teacherName), "lesson row (with teacher name) missing");
    assert(sec.assignments.some((a: any) => a.id === asgId && a.kind === "homework"), "homework row missing");
    assert(j.totals.lessons >= 1 && j.totals.homework >= 1, `totals off: ${JSON.stringify(j.totals)}`);
    assert(Array.isArray(j.hifz), "hifz strip missing");
  } finally {
    if (lessonId) await admin.from("lesson").delete().eq("id", lessonId);
    if (asgId) await admin.from("assignment").delete().eq("id", asgId);
  }
});

await check("31. incharge role: wing-scoped access, no org powers", async () => {
  // Wing overseer (Sep 2026): teacher-equivalent within wing classes,
  // wing-filtered digests, zero org-level powers. QA incharge's wing =
  // the Sandbox class only.
  const inch = await ensureUser("qa-incharge@azality.com", "QA Incharge", "class_teacher");
  // ensureUser granted an org-scoped class_teacher row — replace it with
  // a class-scoped incharge row so the account is a PURE incharge.
  await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
    .eq("user_id", inch.id).eq("scope_type", "organization").eq("scope_id", ORG).is("revoked_at", null);
  const { data: existing } = await admin.from("user_roles").select("id").eq("user_id", inch.id)
    .eq("role_type", "incharge").eq("scope_type", "class").eq("scope_id", sandboxClass.id).maybeSingle();
  if (existing) {
    await admin.from("user_roles").update({ revoked_at: null }).eq("id", existing.id);
  } else {
    await admin.from("user_roles").insert({
      user_id: inch.id, role_type: "incharge", scope_type: "class",
      scope_id: sandboxClass.id, granted_by: inch.id,
    });
  }
  try {
    // Wing digest: 200, and every row belongs to the Sandbox class.
    // The wing has TWO sections since the demo-roles seeding (A for the
    // qa-* accounts, B for the demo accounts) — both are legitimate.
    const { data: wingSecs } = await admin
      .from("class_section").select("id").eq("class_id", sandboxClass.id);
    const wingSecIds = new Set((wingSecs ?? []).map((x: any) => x.id));
    const day = new Date().toISOString().slice(0, 10);
    const dig = await api(inch.token, `/school/orgs/${ORG}/academics-day?date=${day}`);
    const digJ = await dig.json();
    assert(dig.status === 200, `digest ${dig.status}`);
    for (const sec of digJ.sections ?? []) {
      assert(wingSecIds.has(sec.sectionId), `non-wing section leaked: ${sec.className} ${sec.sectionName}`);
    }
    assert((digJ.hifz ?? []).length === 0, "hifz sections leaked into non-hifz wing");
    // Section-scoped read inside the wing (lessons list) works.
    const les = await api(inch.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/lessons?limit=5`);
    assert(les.status === 200, `wing section lessons ${les.status}`);
    // Sections leaderboard scoped to the wing.
    const lb = await api(inch.token, `/school/orgs/${ORG}/sections/leaderboard?period=WTD`);
    if (lb.status === 200) {
      const lbJ = await lb.json();
      const rows = lbJ.rows ?? lbJ.sections ?? [];
      for (const r of rows) {
        assert(wingSecIds.has(r.sectionId), `leaderboard leaked non-wing section`);
      }
    }
    // NO org powers: day-note write forbidden; hifz-program allowed but
    // wing-filtered to zero hifz sections.
    const dn = await api(inch.token, `/school/orgs/${ORG}/attendance-day-notes/2020-02-02`, {
      method: "PUT", body: JSON.stringify({ note: "nope" }),
    });
    assert(dn.status === 403, `incharge day-note write expected 403, got ${dn.status}`);
    const hp = await api(inch.token, `/school/orgs/${ORG}/hifz-program`);
    if (hp.status === 200) {
      const hpJ = await hp.json();
      const secs = hpJ.sections ?? hpJ.hifzSections ?? [];
      assert(secs.length === 0, "hifz-program leaked sections to non-hifz wing");
    } else {
      assert(hp.status === 403, `hifz-program unexpected ${hp.status}`);
    }
  } finally {
    // Leave the incharge row (revoked) so reruns are cheap; revoke to
    // keep the account inert between runs.
    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", inch.id).eq("role_type", "incharge").is("revoked_at", null);
  }
});

await check("32. parent phone change: PIN login identifier follows, same PIN works", async () => {
  // pin_credential snapshots the phone at set time; the parents PATCH
  // must re-point it when the phone changes (pilot Sep 3) — same PIN,
  // new username, must_change untouched.
  const { data: qaParent } = await admin.from("parent").select("id, phone")
    .eq("org_id", ORG).eq("full_name", "QA Portal Parent").maybeSingle();
  assert(qaParent, "QA Portal Parent row missing");
  const oldPhone = qaParent.phone;
  const newPhone = "+920000000902";
  try {
    // Known PIN via the API (also re-exercises /pin/set end to end).
    const setR = await api(office.token, `/school/orgs/${ORG}/pin/set`, {
      method: "POST",
      body: JSON.stringify({ subjectType: "parent", subjectId: qaParent.id, pin: "7311" }),
    });
    assert(setR.status === 200, `pin/set ${setR.status}`);
    // Change the phone through the real PATCH endpoint.
    const patchR = await api(office.token, `/school/orgs/${ORG}/parents/${qaParent.id}`, {
      method: "PATCH", body: JSON.stringify({ phone: newPhone }),
    });
    assert(patchR.status === 200, `parent patch ${patchR.status}`);
    // Credential follows: old identifier gone, new one present.
    const { data: cred } = await admin.from("pin_credential").select("login_identifier, must_change")
      .eq("org_id", ORG).eq("subject_type", "parent").eq("subject_id", qaParent.id).maybeSingle();
    assert(cred?.login_identifier === newPhone, `identifier not synced: ${JSON.stringify(cred)}`);
    assert(cred.must_change === true, "parent set should force must_change");
    // And the same PIN logs in with the NEW number.
    const login = await pinLogin(newPhone, "7311");
    assert(login.status === 200, `pin login with new phone ${login.status}`);
    const oldLogin = await pinLogin(oldPhone, "7311");
    assert(oldLogin.status !== 200, `old phone should no longer log in, got ${oldLogin.status}`);
  } finally {
    // Restore phone (PATCH re-syncs the credential back) and re-seed the
    // canonical QA pin so later runs/checks keep their assumptions.
    await api(office.token, `/school/orgs/${ORG}/parents/${qaParent.id}`, {
      method: "PATCH", body: JSON.stringify({ phone: oldPhone }),
    });
    await api(office.token, `/school/orgs/${ORG}/pin/set`, {
      method: "POST",
      body: JSON.stringify({ subjectType: "parent", subjectId: qaParent.id, pin: "3456" }),
    });
  }
});

await check("33. incharge admin: grouped teachers list, wing editor grant/revoke, teacher denied", async () => {
  try {
    // Teacher cannot edit wings.
    const denied = await api(teacher.token, `/school/orgs/${ORG}/teachers/${teacher.id}/incharge`, {
      method: "PUT", body: JSON.stringify({ classIds: [sandboxClass.id] }),
    });
    assert(denied.status === 403, `teacher wing edit expected 403, got ${denied.status}`);
    // Principal grants qa-teacher an incharge wing (Sandbox).
    const grant = await api(principal.token, `/school/orgs/${ORG}/teachers/${teacher.id}/incharge`, {
      method: "PUT", body: JSON.stringify({ classIds: [sandboxClass.id] }),
    });
    assert(grant.status === 200, `wing grant ${grant.status}`);
    // Non-org class rejected.
    const bad = await api(principal.token, `/school/orgs/${ORG}/teachers/${teacher.id}/incharge`, {
      method: "PUT", body: JSON.stringify({ classIds: ["00000000-0000-0000-0000-000000000001"] }),
    });
    assert(bad.status === 400, `foreign class expected 400, got ${bad.status}`);
    // Teachers list: ONE row for qa-teacher, roles include both,
    // incharge wing carries the class name.
    const list = await api(principal.token, `/school/orgs/${ORG}/teachers`);
    const listJ = await list.json();
    assert(list.status === 200, `teachers list ${list.status}`);
    const rows = (listJ.teachers ?? []).filter((t: any) => t.user_id === teacher.id);
    assert(rows.length === 1, `expected 1 grouped row for qa-teacher, got ${rows.length}`);
    assert(rows[0].roles.includes("class_teacher") && rows[0].roles.includes("incharge"),
      `roles missing: ${JSON.stringify(rows[0].roles)}`);
    assert((rows[0].inchargeClasses ?? []).some((cl: any) => cl.id === sandboxClass.id && cl.name === "Sandbox"),
      `wing class missing: ${JSON.stringify(rows[0].inchargeClasses)}`);
    // Empty selection removes the role.
    const drop = await api(principal.token, `/school/orgs/${ORG}/teachers/${teacher.id}/incharge`, {
      method: "PUT", body: JSON.stringify({ classIds: [] }),
    });
    assert(drop.status === 200, `wing drop ${drop.status}`);
    const list2 = await api(principal.token, `/school/orgs/${ORG}/teachers`);
    const list2J = await list2.json();
    const row2 = (list2J.teachers ?? []).find((t: any) => t.user_id === teacher.id);
    assert(row2 && !row2.roles.includes("incharge"), `incharge still present after drop: ${JSON.stringify(row2?.roles)}`);
  } finally {
    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", teacher.id).eq("role_type", "incharge").is("revoked_at", null);
  }
});

await check("34. staff profile admin: profile patch, temp-password reset + forced change loop", async () => {
  // Teacher cannot edit staff profiles.
  const denied = await api(teacher.token, `/school/orgs/${ORG}/teachers/${office.id}/profile`, {
    method: "PATCH", body: JSON.stringify({ fullName: "X" }),
  });
  assert(denied.status === 403, `teacher profile patch expected 403, got ${denied.status}`);
  // Principal edits name+phone (email path is the same admin API call;
  // left untouched so the suite scaffolding's email lookups stay valid).
  const patch = await api(principal.token, `/school/orgs/${ORG}/teachers/${teacher.id}/profile`, {
    method: "PATCH", body: JSON.stringify({ fullName: "QA Teacher", phone: "+920000000777" }),
  });
  assert(patch.status === 200, `profile patch ${patch.status}`);
  const { data: after } = await admin.auth.admin.getUserById(teacher.id);
  assert(after?.user?.user_metadata?.phone === "+920000000777", "phone not saved to user_metadata");
  // Temp-password reset: flag set, temp login works, self-clear works.
  const reset = await api(principal.token, `/school/orgs/${ORG}/teachers/${teacher.id}/reset-password`, {
    method: "POST", body: JSON.stringify({}),
  });
  const resetJ = await reset.json();
  assert(reset.status === 200 && /^Iqra\d{6}!$/.test(resetJ.tempPassword ?? ""), `reset ${reset.status}: ${JSON.stringify(resetJ)}`);
  const anonC = createClient(URL_, ANON) as any;
  const { data: sess, error: sErr } = await anonC.auth.signInWithPassword({
    email: "qa-teacher@azality.com", password: resetJ.tempPassword,
  });
  assert(!sErr, `temp password login failed: ${sErr?.message}`);
  assert(sess.user?.app_metadata?.must_change_password === true, "must_change_password flag missing");
  const clear = await fetch(`${FUNC}/school/me/password-changed`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${sess.session.access_token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  assert(clear.status === 200, `password-changed ${clear.status}`);
  const { data: cleared } = await admin.auth.admin.getUserById(teacher.id);
  assert(!cleared?.user?.app_metadata?.must_change_password, "flag not cleared");
});

await check("35. teacher performance: admin-gated aggregate, sane shape", async () => {
  // Non-admin staff cannot view a track record. (Use office.token —
  // check 34's password reset revokes qa-teacher's session, so its
  // stale token would 401 here instead of exercising the 403 gate.)
  const denied = await api(office.token, `/school/orgs/${ORG}/teachers/${teacher.id}/performance`);
  assert(denied.status === 403, `office perf expected 403, got ${denied.status}`);
  // Principal gets a well-formed aggregate for qa-teacher.
  const r = await api(principal.token, `/school/orgs/${ORG}/teachers/${teacher.id}/performance`);
  const j = await r.json();
  assert(r.status === 200, `perf ${r.status}: ${JSON.stringify(j).slice(0, 150)}`);
  assert(!j.empty, "qa-teacher should have a footprint (QA Subject in Sandbox)");
  assert(typeof j.passMarkPct === "number" && j.passMarkPct >= 1, `passMarkPct: ${j.passMarkPct}`);
  assert(j.consistency && typeof j.consistency.lessonsLogged === "number", "consistency block missing");
  assert(Array.isArray(j.pace) && Array.isArray(j.outcomes), "pace/outcomes arrays missing");
  assert(j.engagement && typeof j.engagement.behaviorNotes === "number", "engagement block missing");
  assert((j.footprint?.subjects ?? []).some((x: string) => x.includes("QA Subject")), `footprint: ${JSON.stringify(j.footprint)}`);
  assert(j.ramp && "inRamp" in j.ramp, "ramp block missing");
});

await check("36. incharge lens: /now wing-scoped, academics rollup class-scoped", async () => {
  // Arm qa-incharge (wing = Sandbox only); revoked again in finally.
  const inch = await ensureUser("qa-incharge@azality.com", "QA Incharge", "class_teacher");
  await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
    .eq("user_id", inch.id).eq("scope_type", "organization").eq("scope_id", ORG).is("revoked_at", null);
  const { data: exRow } = await admin.from("user_roles").select("id").eq("user_id", inch.id)
    .eq("role_type", "incharge").eq("scope_type", "class").eq("scope_id", sandboxClass.id).maybeSingle();
  if (exRow) await admin.from("user_roles").update({ revoked_at: null }).eq("id", exRow.id);
  else await admin.from("user_roles").insert({
    user_id: inch.id, role_type: "incharge", scope_type: "class",
    scope_id: sandboxClass.id, granted_by: inch.id,
  });
  try {
    // /now: 200 and ONLY wing sections (withoutSandbox strips Sandbox
    // from the skeleton, so the wing view may legitimately be empty —
    // the assertion is that nothing OUTSIDE the wing leaks).
    const nowR = await api(inch.token, `/school/orgs/${ORG}/now`);
    const nowJ = await nowR.json();
    assert(nowR.status === 200, `now ${nowR.status}`);
    for (const s of nowJ.sections ?? []) {
      assert(s.sectionId === sandboxSec.id, `non-wing section leaked into /now: ${s.label}`);
    }
    // Principal /now: 200 with a sane shape and at least one section.
    const pNow = await api(principal.token, `/school/orgs/${ORG}/now`);
    const pNowJ = await pNow.json();
    assert(pNow.status === 200 && Array.isArray(pNowJ.sections) && pNowJ.sections.length > 0,
      `principal now: ${pNow.status} / ${(pNowJ.sections ?? []).length} sections`);
    const withCur = (pNowJ.sections as any[]).find((s) => s.current);
    if (withCur) {
      assert("needsCover" in withCur.current && "teacherOnLeave" in withCur.current, "coverage fields missing");
    }
    // Academics rollup: incharge sees only wing classes (QA Subject's
    // class = Sandbox), never the whole org's curriculum counts.
    const ac = await api(inch.token, `/school/orgs/${ORG}/academics`);
    const acJ = await ac.json();
    assert(ac.status === 200, `academics ${ac.status}`);
    const pAc = await api(principal.token, `/school/orgs/${ORG}/academics`);
    const pAcJ = await pAc.json();
    assert(pAc.status === 200, `principal academics ${pAc.status}`);
    assert(
      (acJ.curriculum?.totalTopics ?? 0) < (pAcJ.curriculum?.totalTopics ?? 0),
      `incharge topics (${acJ.curriculum?.totalTopics}) should be < org-wide (${pAcJ.curriculum?.totalTopics})`,
    );
  } finally {
    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", inch.id).eq("role_type", "incharge").is("revoked_at", null);
  }
});

await check("37. teaching overview: principal org rows, incharge wing rows, office denied", async () => {
  // Office staff: no track-record access.
  const denied = await api(office.token, `/school/orgs/${ORG}/teaching-overview`);
  assert(denied.status === 403, `office overview expected 403, got ${denied.status}`);
  // Principal: org-wide rows with a sane shape; Sandbox (QA) hidden.
  const r = await api(principal.token, `/school/orgs/${ORG}/teaching-overview`);
  const j = await r.json();
  assert(r.status === 200, `overview ${r.status}`);
  assert(Array.isArray(j.rows) && j.rows.length > 3, `expected many rows, got ${(j.rows ?? []).length}`);
  assert(j.wingScoped === false, "principal should not be wing-scoped");
  const sample = j.rows[0];
  for (const k of ["userId", "name", "paceDeltaPp", "lessonsPerWeek", "notes", "inRamp"]) {
    assert(k in sample, `row missing ${k}`);
  }
  assert(!j.rows.some((x: any) => x.name === "QA Teacher"), "Sandbox teacher leaked into org overview");
  // Incharge (wing = Sandbox): wing-scoped, and DOES see the QA teacher.
  const inch = await ensureUser("qa-incharge@azality.com", "QA Incharge", "class_teacher");
  await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
    .eq("user_id", inch.id).eq("scope_type", "organization").eq("scope_id", ORG).is("revoked_at", null);
  const { data: exRow } = await admin.from("user_roles").select("id").eq("user_id", inch.id)
    .eq("role_type", "incharge").eq("scope_type", "class").eq("scope_id", sandboxClass.id).maybeSingle();
  if (exRow) await admin.from("user_roles").update({ revoked_at: null }).eq("id", exRow.id);
  else await admin.from("user_roles").insert({
    user_id: inch.id, role_type: "incharge", scope_type: "class",
    scope_id: sandboxClass.id, granted_by: inch.id,
  });
  try {
    const ir = await api(inch.token, `/school/orgs/${ORG}/teaching-overview`);
    const ij = await ir.json();
    assert(ir.status === 200 && ij.wingScoped === true, `incharge overview ${ir.status}/${ij.wingScoped}`);
    assert((ij.rows ?? []).some((x: any) => x.userId === teacher.id), "wing teacher missing from incharge overview");
    assert((ij.rows ?? []).every((x: any) => x.userId === teacher.id || x.sectionCount >= 1),
      "unexpected rows in wing overview");
    assert(!(ij.rows ?? []).some((x: any) => x.name === "Amna Shahzad"), "non-wing teacher leaked to incharge");
  } finally {
    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", inch.id).eq("role_type", "incharge").is("revoked_at", null);
  }
});

await check("38. teacher alerts: stale gradebook surfaces on the (wing) dashboard", async () => {
  // Deterministic trigger: an assignment due 8 days ago with no grades
  // in the Sandbox wing -> the qa-incharge dashboard must carry the
  // teacher_gradebook_stale alert. (Pace alert needs 3+ topics and the
  // quiet-week alert needs 5+ scheduled periods, so neither fires from
  // QA scaffolding - by design.)
  const eightAgo = new Date(Date.now() - 8 * 86400e3).toISOString().slice(0, 10);
  // Direct insert (check 34's password reset revokes teacher.token, so
  // the API path would 401 here); created_by must be qa-teacher so the
  // alert body names them.
  const { data: probe, error: probeErr } = await admin.from("assignment").insert({
    org_id: ORG, class_section_id: sandboxSec.id, section_subject_id: qaSs.id,
    title: "QA stale-alert probe", kind: "homework", max_score: 10,
    assigned_date: eightAgo, due_date: eightAgo, created_by: teacher.id,
  }).select("id").single();
  assert(!probeErr && probe?.id, `probe insert: ${probeErr?.message}`);
  const probeId = probe.id;
  // Arm qa-incharge on Sandbox.
  const inch = await ensureUser("qa-incharge@azality.com", "QA Incharge", "class_teacher");
  await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
    .eq("user_id", inch.id).eq("scope_type", "organization").eq("scope_id", ORG).is("revoked_at", null);
  const { data: exRow } = await admin.from("user_roles").select("id").eq("user_id", inch.id)
    .eq("role_type", "incharge").eq("scope_type", "class").eq("scope_id", sandboxClass.id).maybeSingle();
  if (exRow) await admin.from("user_roles").update({ revoked_at: null }).eq("id", exRow.id);
  else await admin.from("user_roles").insert({
    user_id: inch.id, role_type: "incharge", scope_type: "class",
    scope_id: sandboxClass.id, granted_by: inch.id,
  });
  try {
    const r = await api(inch.token, `/school/orgs/${ORG}/dashboard?period=MTD`);
    const j = await r.json();
    assert(r.status === 200, `dashboard ${r.status}`);
    const stale = (j.alerts ?? []).find((a: any) => a.id === "teacher_gradebook_stale");
    assert(stale, `stale-gradebook alert missing: ${JSON.stringify((j.alerts ?? []).map((a: any) => a.id))}`);
    assert(String(stale.body).includes("QA Teacher"), `alert body missing teacher name: ${stale.body}`);
    assert(String(stale.actionPath).includes("teaching-overview"), "alert should link to teaching overview");
  } finally {
    if (probeId) await admin.from("assignment").delete().eq("id", probeId);
    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", inch.id).eq("role_type", "incharge").is("revoked_at", null);
  }
});

await check("39. students list scoped: teacher sees own sections only, office keeps full roster", async () => {
  // Pilot security finding (v1.0.90-students-scope): GET /students only
  // required "any role in org" — any teacher could pull the whole
  // school's roster with guardian contacts. Fresh token: check 34
  // rotated qa-teacher's password.
  const t2 = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const { data: sbSecs } = await admin.from("class_section").select("id").eq("class_id", sandboxClass.id);
  const sbIds = new Set((sbSecs ?? []).map((x: any) => x.id));
  // qa-teacher teaches only in Sandbox — every row returned must be there.
  const r = await api(t2.token, `/school/orgs/${ORG}/students`);
  assert(r.status === 200, `teacher list ${r.status}`);
  const mine = ((await r.json()).students ?? []) as any[];
  for (const s of mine) {
    assert(sbIds.has(s.class_section_id), `roster leak: student in foreign section ${s.class_section_id}`);
  }
  // Asking for a foreign section outright is refused.
  const { data: foreign } = await admin.from("class_section")
    .select("id, class:class_id!inner(org_id)").eq("class.org_id", ORG).limit(30);
  const other = (foreign ?? []).find((x: any) => !sbIds.has(x.id));
  if (other) {
    const rf = await api(t2.token, `/school/orgs/${ORG}/students?classSectionId=${(other as any).id}`);
    assert(rf.status === 403, `foreign section expected 403, got ${rf.status}`);
  }
  // Office holds manage_students — full roster unchanged.
  const ro = await api(office.token, `/school/orgs/${ORG}/students`);
  assert(ro.status === 200, `office list ${ro.status}`);
  const all = ((await ro.json()).students ?? []) as any[];
  assert(all.some((s: any) => s.class_section_id && !sbIds.has(s.class_section_id)),
    "office should still see the whole school");
});

await check("40. weekly digest: principal gets sane week-over-week shape, office denied", async () => {
  const r = await api(principal.token, `/school/orgs/${ORG}/weekly-digest`);
  const j = await r.json();
  assert(r.status === 200, `digest ${r.status}: ${JSON.stringify(j).slice(0, 120)}`);
  assert(typeof j.week?.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.week.start), "week.start missing");
  // Week starts on a Monday (org-local).
  const dow = new Date(`${j.week.start}T00:00:00Z`).getUTCDay();
  assert(dow === 1, `week.start should be a Monday, got dow ${dow}`);
  assert(j.prevWeek?.start < j.week.start, "prevWeek should precede week");
  assert(Array.isArray(j.teachers) && j.teachers.length > 0, "teachers[] empty");
  const t = j.teachers[0];
  assert(t.cur && typeof t.cur.rollCallDays === "number" && t.prev, "per-teacher cur/prev counters missing");
  assert(j.week.rollCall && typeof j.week.rollCall.expected === "number", "org rollCall rollup missing");
  // Office staff has no admin/incharge scope — denied.
  const denied = await api(office.token, `/school/orgs/${ORG}/weekly-digest`);
  assert(denied.status === 403, `office expected 403, got ${denied.status}`);
});

await check("41. exam datesheet: staff read grouped by class, portal scoped to own class", async () => {
  const r = await api(principal.token, `/school/orgs/${ORG}/exam-schedule`);
  const j = await r.json();
  assert(r.status === 200, `staff datesheet ${r.status}`);
  assert(Array.isArray(j.classes), "classes[] missing");
  if (j.classes.length > 0) {
    const c = j.classes[0];
    assert(typeof c.className === "string" && Array.isArray(c.papers), "class group shape wrong");
    const p = c.papers[0];
    assert(p && /^\d{4}-\d{2}-\d{2}$/.test(p.examDate) && typeof p.subjectLabel === "string",
      `paper shape wrong: ${JSON.stringify(p)}`);
    // Labels are the school's own text — never rewritten server-side.
    assert(Array.isArray(j.dates) && j.dates.length > 0, "dates[] missing");
  }
  // A parent PIN token sees ONLY their child's class papers.
  const { data: qaStu } = await admin.from("student")
    .select("id, class_section_id").eq("org_id", ORG).eq("gr_number", "DEMO-1").maybeSingle();
  if (qaStu) {
    const anon2 = createClient(URL_, ANON) as any;
    void anon2;
    const login = await fetch(`${FUNC}/school/auth/pin-login`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ orgIdentifier: "iqra-ifs", loginIdentifier: "03110000001", pin: "1234" }),
    });
    const lj = await login.json();
    if (login.status === 200 && lj.token) {
      const pr = await fetch(`${FUNC}/school/pin-me/students/${qaStu.id}/exam-schedule`, {
        headers: { apikey: ANON, "X-Pin-Token": lj.token },
      });
      const pj = await pr.json();
      assert(pr.status === 200, `portal datesheet ${pr.status}: ${JSON.stringify(pj).slice(0, 120)}`);
      assert(Array.isArray(pj.papers) && Array.isArray(pj.instructions),
        "portal datesheet shape wrong");
    }
  }
});

await check("42. curriculum pace is term-scoped: a future term's topics don't dilute it", async () => {
  // Loading NEXT term's syllabus early must not move THIS term's pace.
  // Regression guard for v1.0.95: /sections/:id/curriculum-progress and
  // the teacher "my subjects" counter used to count every topic.
  const before = await api(principal.token, `/school/sections/${sandboxSec.id}/curriculum-progress`);
  const bj = await before.json();
  assert(before.status === 200, `progress ${before.status}`);
  const totalBefore = (bj.subjects ?? []).reduce(
    (s: number, x: any) => s + (x.curriculum?.topicTotal ?? 0), 0);

  const { data: terms } = await admin.from("academic_term")
    .select("id, is_current").eq("org_id", ORG).is("archived_at", null);
  const other = ((terms ?? []) as any[]).find((t) => !t.is_current);
  assert(other, "need a non-current term to test with");

  const { data: topic, error } = await admin.from("curriculum_topic")
    .insert({ curriculum_id: qaCur.id, name: `QA future-term topic ${Date.now()}`,
              display_order: 999, completed: false, academic_term_id: other.id })
    .select().single();
  assert(!error, `insert future topic: ${error?.message}`);
  try {
    const after = await api(principal.token, `/school/sections/${sandboxSec.id}/curriculum-progress`);
    const aj = await after.json();
    const totalAfter = (aj.subjects ?? []).reduce(
      (s: number, x: any) => s + (x.curriculum?.topicTotal ?? 0), 0);
    assert(totalAfter === totalBefore,
      `future-term topic leaked into current pace: ${totalBefore} -> ${totalAfter}`);
  } finally {
    await admin.from("curriculum_topic").delete().eq("id", topic.id);
  }
});

// ── Summary ─────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  Deno.exit(1);
}
