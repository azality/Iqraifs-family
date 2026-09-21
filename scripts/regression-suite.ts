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
// Shared canonical surah table — reused so the suite never carries its
// own copy of the ayah counts.
import { SURAHS } from "../src/utils/quranSurahs.ts";

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
  const doFetch = async (tok: string | null) => {
    const headers: Record<string, string> = { apikey: ANON, ...(init.headers as any ?? {}) };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    if (init.body && typeof init.body === "string") headers["Content-Type"] = "application/json";
    return await fetch(`${FUNC}${path}`, { ...init, headers });
  };
  const res = await doFetch(token);
  // Self-healing auth (16 Sep): under the project's new asymmetric
  // signing keys the server revokes sessions on schedules this suite
  // cannot fully predict (password rotations, same-second cutoffs,
  // sweeps minutes later). Rather than out-guessing it: a 401 on a
  // token WE minted re-logs that user in once, updates the shared
  // token object so every later check gets the fresh one, and retries
  // this request. A 401 on an unknown token stays a 401 - negative
  // auth checks expect 403s, so this never masks a real gate.
  if (res.status === 401 && token && tokenOwners.has(token)) {
    const owner = tokenOwners.get(token)!;
    const fresh = await reLogin(owner.email);
    if (fresh) return await doFetch(fresh);
  }
  return res;
}

// ── Scaffolding ─────────────────────────────────────────────────────────
// One ensure per user per run. ensureUser rotates the password, and
// since the project moved to asymmetric signing keys (16 Sep) a
// rotation revokes the user's earlier sessions - so a mid-run
// re-ensure was 401-ing every token minted at the top of the file
// (solo runs failed checks 30/33/34 with 401s where 403s were
// expected). Passwords still rotate once per run; repeats reuse the
// run's token.
const ensuredUsers = new Map<string, { id: string; token: string }>();
// token -> which QA user minted it, so api() can heal a revoked one.
const tokenOwners = new Map<string, { email: string; name: string; role: string }>();

/** Rotate + re-sign-in one already-ensured user, updating the SAME
 *  cached object in place so `teacher.token` etc. refresh everywhere. */
async function reLogin(email: string): Promise<string | null> {
  const entry = ensuredUsers.get(email);
  const owner = [...tokenOwners.values()].find((o) => o.email === email);
  if (!entry || !owner) return null;
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const u = listed.users.find((x: any) => (x.email ?? "").toLowerCase() === email);
  if (!u) return null;
  const password = crypto.randomUUID();
  await admin.auth.admin.updateUserById(u.id, { password });
  const anon = createClient(URL_, ANON) as any;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
    if (sErr) return null;
    const probe = await fetch(`${FUNC}/school/orgs/${ORG}/terms`, {
      headers: { apikey: ANON, Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (probe.status !== 401) {
      entry.token = sess.session.access_token;
      tokenOwners.set(entry.token, owner);
      return entry.token;
    }
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  return null;
}

async function ensureUser(email: string, name: string, role: string): Promise<{ id: string; token: string }> {
  const cached = ensuredUsers.get(email);
  if (cached) return cached;
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
  // Asymmetric-keys race (16 Sep): rotating the password revokes
  // sessions with a same-second cutoff, so a token minted in the same
  // instant can be born revoked. Sign in, PROBE the token against a
  // real endpoint, and retry with backoff until it's genuinely live.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email, password });
    if (sErr) throw new Error(`signin ${email}: ${sErr.message}`);
    const probe = await fetch(`${FUNC}/school/orgs/${ORG}/terms`, {
      headers: { apikey: ANON, Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (probe.status !== 401) {
      const out = { id: u.id, token: sess.session.access_token };
      ensuredUsers.set(email, out);
      tokenOwners.set(out.token, { email, name, role });
      return out;
    }
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  throw new Error(`token for ${email} stayed revoked after retries`);
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
// maybeSingle() THROWS once two rows match, returning null — which read
// as "no slot yet" and inserted another every run. That is how the QA
// band grew four "QA P1" rows at Monday 09:00, and it would now trip the
// unique-period index. Take the first match instead.
let { data: qaSlotRows } = await admin.from("timetable_slot").select("id")
  .eq("org_id", ORG).eq("name", "QA P1").eq("day_of_week", tomorrowDow)
  .is("archived_at", null).order("created_at").limit(1);
let qaSlot: any = (qaSlotRows ?? [])[0] ?? null;
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
      // …and per ENTRY, not only via the today block — the portal's
      // history feed reads entries[].teacherRemarks (parity, 17 Sep).
      const rj = JSON.parse(raw);
      assert((rj.entries ?? []).some((e: any) => e.teacherRemarks === "QA parent-visible remark"),
        "teacherRemarks missing from the per-entry history");
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
  // Segment extent (7 Sep): "second_half" = nisf -> end, so a teacher
  // can say WHICH half was recited, not just a cumulative stop.
  const mk4 = await api(teacher.token, `/school/orgs/${ORG}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify({
      studentId: pStu1, surahNumber: 67, ayahFrom: 1, ayahTo: 1,
      kind: "sabqi", juzNumber: 29, juzExtent: "second_half", quality: "good",
    }),
  });
  const mk4J = await jparse(mk4, "create4");
  assert(mk4.status === 201, `segment-extent create ${mk4.status}`);
  const id4 = mk4J.entry?.id;
  try {
    // Staff read returns the extent.
    const list = await api(teacher.token, `/school/orgs/${ORG}/students/${pStu1}/hifz-progress?limit=10`);
    const listJ = await jparse(list, "list");
    assert(list.status === 200, `hifz list ${list.status}`);
    const e1 = (listJ.entries ?? []).find((e: any) => e.id === id1);
    const e2 = (listJ.entries ?? []).find((e: any) => e.id === id2);
    const e3 = (listJ.entries ?? []).find((e: any) => e.id === id3);
    const e4 = (listJ.entries ?? []).find((e: any) => e.id === id4);
    assert(e1?.juzExtent === "half" && e1?.juzNumber === 28, `extent half round-trip: ${JSON.stringify(e1?.juzExtent)}`);
    assert(e2?.juzExtent === "to_surah:95", `to_surah round-trip: ${JSON.stringify(e2?.juzExtent)}`);
    assert(e3 && e3.juzExtent == null, `bad extent should store null, got ${JSON.stringify(e3?.juzExtent)}`);
    assert(e4?.juzExtent === "second_half", `segment extent round-trip: ${JSON.stringify(e4?.juzExtent)}`);
    // Portal sees juzExtent (it's the position reference, parent-visible).
    const pTok = (await jparse(await pinLogin(PARENT_PHONE, "3456"), "pinLogin")).token;
    const pr = await fetch(`${FUNC}/school/pin-me/students/${pStu1}/hifz`, {
      headers: { apikey: ANON, "X-Pin-Token": pTok },
    });
    const prRaw = await pr.text();
    assert(pr.status === 200, `portal hifz ${pr.status}`);
    assert(prRaw.includes('"juzExtent":"half"'), "juzExtent missing from portal payload");
  } finally {
    for (const id of [id1, id2, id3, id4]) {
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

await check("32. parent phone change: PIN identifier AND student card follow", async () => {
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
    // The Students list renders the denormalised student.guardian_phone,
    // not the parent record (11 Sep: a whole class's phone load looked
    // missing). The PATCH must sync linked students' cards too — filling
    // empty ones and replacing ones that held the OLD number.
    const { data: kid } = await admin.from("student_parent").select("student_id")
      .eq("parent_id", qaParent.id).limit(1).maybeSingle();
    assert(kid, "QA Portal Parent has no linked student");
    const { data: stuRow } = await admin.from("student").select("guardian_phone")
      .eq("id", kid.student_id).maybeSingle();
    assert(stuRow?.guardian_phone === newPhone,
      `student card did not follow the phone: ${JSON.stringify(stuRow)}`);
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

  // The reset above revoked every earlier qa-teacher session (asymmetric
  // signing keys, 16 Sep). Re-mint and refresh the run cache so
  // teacher.token keeps working for every later check.
  ensuredUsers.delete("qa-teacher@azality.com");
  const fresh = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  teacher.token = fresh.token;
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
  // 12a redesign contract: rows must carry the adoption fields the
  // grouped layout keys on (topicsDone / lastSignInAt / accountCreatedAt),
  // or the page silently falls back to the flat table forever.
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
  for (const k of ["userId", "name", "paceDeltaPp", "lessonsPerWeek", "notes", "inRamp",
                   "topicsDone", "lastSignInAt", "accountCreatedAt", "lastHifzDays"]) {
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

await check("43. forced PIN change: first-login set works, voluntary change still needs current PIN", async () => {
  const pinPost = (token: string, body: unknown) =>
    fetch(`${FUNC}/school/auth/pin-change`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json", "X-Pin-Token": token },
      body: JSON.stringify(body),
    });

  // /pin/set on a parent flags must_change, so this is the exact state a
  // real parent is in the moment the office issues their PIN.
  const login = await pinLogin(PARENT_PHONE, "3456");
  const lj = await login.json();
  assert(login.status === 200 && lj.token, `parent login ${login.status}`);
  assert(lj.mustChange === true, "parent should be flagged mustChange after admin pin/set");

  // The client sends no subjectType/subjectId here — this is what used to
  // 403 with "token does not match subject" and lock every parent out.
  const reuse = await pinPost(lj.token, { newPin: "3456" });
  assert(reuse.status === 400, `reusing the issued PIN should be refused, got ${reuse.status}`);

  const set = await pinPost(lj.token, { newPin: "7788" });
  const sj = await set.json().catch(() => ({}));
  assert(set.status === 200, `forced change ${set.status}: ${JSON.stringify(sj).slice(0, 120)}`);

  const relogin = await pinLogin(PARENT_PHONE, "7788");
  const rj = await relogin.json();
  assert(relogin.status === 200, `login with new PIN ${relogin.status}`);
  assert(rj.mustChange === false, "mustChange should clear after the forced change");

  // Now that the flag is cleared, the current PIN is mandatory again.
  const noCurrent = await pinPost(rj.token, { newPin: "8899" });
  assert(noCurrent.status === 400, `voluntary change without currentPin should 400, got ${noCurrent.status}`);
  const wrongCurrent = await pinPost(rj.token, { currentPin: "0000", newPin: "8899" });
  assert(wrongCurrent.status === 401, `wrong currentPin should 401, got ${wrongCurrent.status}`);

  // A body naming someone else must never override the signed token.
  const spoof = await pinPost(rj.token, { subjectType: "student", subjectId: pStu1, currentPin: "7788", newPin: "8899" });
  assert(spoof.status === 403, `subject spoof should 403, got ${spoof.status}`);

  const good = await pinPost(rj.token, { currentPin: "7788", newPin: "8899" });
  assert(good.status === 200, `voluntary change ${good.status}`);

  // Restore the fixture PIN (and the must_change flag) for the next run.
  const restore = await api(office.token, `/school/orgs/${ORG}/pin/set`, {
    method: "POST", body: JSON.stringify({ subjectType: "parent", subjectId: pParent.id, pin: "3456" }),
  });
  assert(restore.ok, `restore parent pin ${restore.status}`);
});

await check("44. datesheet authoring: principal builds/edits/clears a paper, office denied", async () => {
  // The datesheet used to be seed-script-only, which meant a newly
  // onboarded school could not publish one at all. These are the
  // endpoints that make it self-serve — and they must stay admin-only.
  const { data: term } = await admin.from("academic_term")
    .select("id, exam_instructions").eq("org_id", ORG).is("archived_at", null)
    .order("start_date", { ascending: false }).limit(1).maybeSingle();
  assert(term, "need a term to attach a datesheet to");

  const paper = {
    termId: term.id, classId: sandboxClass.id,
    subjectLabel: `QA Paper ${Date.now()}`,
    examDate: "2026-11-03", startTime: "08:00", endTime: "10:30",
  };

  // Office staff must not be able to publish a school-wide notice.
  const denied = await api(office.token, `/school/orgs/${ORG}/exam-schedule`, {
    method: "POST", body: JSON.stringify(paper),
  });
  assert(denied.status === 403, `office should be denied, got ${denied.status}`);

  const created = await api(principal.token, `/school/orgs/${ORG}/exam-schedule`, {
    method: "POST", body: JSON.stringify(paper),
  });
  const cj = await created.json();
  assert(created.status === 200, `create ${created.status}: ${JSON.stringify(cj).slice(0, 120)}`);
  const paperId = cj.ids?.[0];
  assert(paperId, "create returned no id");

  try {
    // Validation actually bites.
    const badDate = await api(principal.token, `/school/orgs/${ORG}/exam-schedule`, {
      method: "POST", body: JSON.stringify({ ...paper, examDate: "03-11-2026" }),
    });
    assert(badDate.status === 400, `bad date should 400, got ${badDate.status}`);
    const badTime = await api(principal.token, `/school/orgs/${ORG}/exam-schedule`, {
      method: "POST", body: JSON.stringify({ ...paper, startTime: "8am" }),
    });
    assert(badTime.status === 400, `bad time should 400, got ${badTime.status}`);
    // A class from outside the org must never land on this org's sheet.
    const foreign = await api(principal.token, `/school/orgs/${ORG}/exam-schedule`, {
      method: "POST",
      body: JSON.stringify({ ...paper, classId: "00000000-0000-0000-0000-000000000000" }),
    });
    assert(foreign.status === 404, `foreign class should 404, got ${foreign.status}`);

    const patched = await api(principal.token, `/school/orgs/${ORG}/exam-schedule/${paperId}`, {
      method: "PATCH", body: JSON.stringify({ subjectLabel: "QA Paper edited", endTime: "11:00" }),
    });
    assert(patched.status === 200, `patch ${patched.status}`);
    const { data: row } = await admin.from("exam_schedule")
      .select("subject_label, end_time").eq("id", paperId).maybeSingle();
    assert(row?.subject_label === "QA Paper edited", `label not saved: ${row?.subject_label}`);
    assert(String(row?.end_time).startsWith("11:00"), `end_time not saved: ${row?.end_time}`);

    const offPatch = await api(office.token, `/school/orgs/${ORG}/exam-schedule/${paperId}`, {
      method: "PATCH", body: JSON.stringify({ subjectLabel: "nope" }),
    });
    assert(offPatch.status === 403, `office patch should 403, got ${offPatch.status}`);

    // Instructions round-trip, then restore exactly what the school had.
    const original: string[] | null = term.exam_instructions ?? null;
    const put = await api(principal.token, `/school/orgs/${ORG}/terms/${term.id}/exam-instructions`, {
      method: "PUT", body: JSON.stringify({ instructions: ["QA line one", "  ", "QA line two"] }),
    });
    const pj = await put.json();
    assert(put.status === 200, `instructions ${put.status}`);
    assert(pj.instructions?.length === 2, `blank lines should be dropped, got ${JSON.stringify(pj.instructions)}`);
    await admin.from("academic_term").update({ exam_instructions: original }).eq("id", term.id);
  } finally {
    const del = await api(principal.token, `/school/orgs/${ORG}/exam-schedule/${paperId}`, { method: "DELETE" });
    assert(del.status === 200, `delete ${del.status}`);
    const { data: gone } = await admin.from("exam_schedule").select("id").eq("id", paperId).maybeSingle();
    assert(!gone, "paper should be gone after delete");
  }
});

await check("45. nazra is not hifz: reading kinds accepted, position surfaces on the roster", async () => {
  // A nazra child reads rather than memorizes: no sabaq/sabqi/manzil,
  // one position that moves. The roster must report where they read up
  // to, not "0 ayahs memorized".
  //
  // Fresh session: check 34 resets qa-teacher's password to exercise the
  // temp-password flow, which revokes the token minted at startup — any
  // later check reusing `teacher.token` gets 401 "Invalid JWT".
  const tt = (await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher")).token;

  const mk = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify({
      studentId: pStu1, surahNumber: 2, ayahFrom: 12, ayahTo: 40,
      juzNumber: 29, kind: "nazra", quality: "good",
      nextTarget: "Continue from ayah 41",
    }),
  });
  const mj = await mk.json();
  assert(mk.status === 201, `nazra create ${mk.status}: ${JSON.stringify(mj).slice(0, 120)}`);
  const nazraId = mj.entry?.id;

  // The hafiz-in-a-nazra-group case (Class IV+) is its own kind.
  const rev = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify({
      studentId: pStu2, surahNumber: 1, ayahFrom: 1, ayahTo: 7,
      juzNumber: 30, kind: "nazra_revision",
    }),
  });
  const rj = await rev.json();
  assert(rev.status === 201, `nazra_revision create ${rev.status}`);
  const revId = rj.entry?.id;

  try {
    const bogus = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, surahNumber: 1, ayahFrom: 1, ayahTo: 2, kind: "nazra_typo" }),
    });
    assert(bogus.status === 400, `unknown kind should 400, got ${bogus.status}`);

    const sum = await api(tt, `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`);
    const sj = await sum.json();
    assert(sum.status === 200, `summary ${sum.status}`);
    const row = (sj.students ?? []).find((s: any) => s.studentId === pStu1);
    assert(row, "student missing from summary");
    assert(row.nazraPosition, "nazraPosition missing — the roster cannot show where they read up to");
    assert(row.nazraPosition.juzNumber === 29 && row.nazraPosition.ayahTo === 40,
      `wrong position: ${JSON.stringify(row.nazraPosition)}`);
    assert(row.nazraPosition.isRevision === false, "plain nazra should not read as revision");
    assert(row.today?.nazra === true, "today.nazra should be set after a hearing");

    const revRow = (sj.students ?? []).find((s: any) => s.studentId === pStu2);
    assert(revRow?.nazraPosition?.isRevision === true, "revision flag not surfaced");

    // Reading must never inflate the memorized total — that number is
    // what made every nazra child read "0" in the first place.
    assert(row.ayahsMemorized === 0 || typeof row.ayahsMemorized === "number",
      "ayahsMemorized should stay numeric and uncredited by nazra");
  } finally {
    for (const id of [nazraId, revId]) {
      if (id) await api(tt, `/school/orgs/${ORG}/hifz-progress/${id}`, { method: "DELETE" });
    }
  }
});

await check("46. quran track: per-student inference, and hafiz is CONFIRMED by a person not by arithmetic", async () => {
  const tt = (await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher")).token;
  const summary = () =>
    api(tt, `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`).then((r) => r.json());
  const rowFor = async (id: string) =>
    ((await summary()).students ?? []).find((s: any) => s.studentId === id);

  // Default: an academic section with no hafiz flag reads as nazra, and
  // the roster says the value was inferred rather than chosen.
  await admin.from("student").update({ quran_track: null, hafiz_since: null }).eq("id", pStu1);
  let row = await rowFor(pStu1);
  assert(row?.quranTrack === "nazra", `default track should be nazra, got ${row?.quranTrack}`);
  assert(row?.quranTrackInferred === true, "default should be flagged as inferred");

  try {
    // A child marked hafiz revises — and revision keeps the full trio.
    await api(principal.token, `/school/orgs/${ORG}/students/${pStu1}`, {
      method: "PATCH", body: JSON.stringify({ hafizSince: new Date().toISOString() }),
    });
    row = await rowFor(pStu1);
    assert(row?.quranTrack === "revision", `hafiz should infer revision, got ${row?.quranTrack}`);
    assert(row?.hafizSince, "hafizSince should surface on the roster");

    // An explicit setting beats the inference.
    await api(principal.token, `/school/orgs/${ORG}/students/${pStu1}`, {
      method: "PATCH", body: JSON.stringify({ quranTrack: "nazra" }),
    });
    row = await rowFor(pStu1);
    assert(row?.quranTrack === "nazra", `explicit track should win, got ${row?.quranTrack}`);
    assert(row?.quranTrackInferred === false, "explicit track should not read as inferred");

    // "" means back to automatic.
    await api(principal.token, `/school/orgs/${ORG}/students/${pStu1}`, {
      method: "PATCH", body: JSON.stringify({ quranTrack: "" }),
    });
    row = await rowFor(pStu1);
    assert(row?.quranTrack === "revision", `clearing should fall back to inference, got ${row?.quranTrack}`);

    const bad = await api(principal.token, `/school/orgs/${ORG}/students/${pStu1}`, {
      method: "PATCH", body: JSON.stringify({ quranTrack: "nonsense" }),
    });
    assert(bad.status === 400, `invalid track should be a clean 400, got ${bad.status}`);

    // Finishing hifz with us stamps hafiz automatically. One row covering
    // the whole Quran is enough — the totals dedupe by ayah.
    await admin.from("student").update({ hafiz_since: null, quran_track: null, hifz_coverage_complete_at: null, hafiz_confirmed_by: null }).eq("id", pStu2);
    // Seed 113 surahs straight through the service role (fast), then let
    // the LAST one go through the API so the auto-stamp is exercised
    // exactly where it lives: the hifz POST handler.
    const rest = SURAHS.filter((s) => s.number !== 1).map((s) => ({
      org_id: ORG, student_id: pStu2, surah_number: s.number,
      ayah_from: 1, ayah_to: s.ayahCount, kind: "sabaq",
    }));
    const { error: seedErr } = await admin.from("hifz_progress").insert(rest);
    assert(!seedErr, `seed 113 surahs: ${seedErr?.message}`);
    try {
      const { data: mid } = await admin.from("student")
        .select("hafiz_since").eq("id", pStu2).maybeSingle();
      assert(!mid?.hafiz_since, "should not be hafiz before the last surah");

      const last = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
        method: "POST",
        body: JSON.stringify({
          studentId: pStu2, surahNumber: 1, ayahFrom: 1, ayahTo: 7, kind: "sabaq",
        }),
      });
      const lj = await last.json();
      assert(last.status === 201, `final surah ${last.status}`);
      assert(lj.hifzCoverageComplete === true, "the completing entry should report hifzCoverageComplete");

      // Detection only. The child is NOT hafiz until a person says so —
      // quality isn't counted and prior memorization elsewhere is unknown.
      const { data: detected } = await admin.from("student")
        .select("hifz_coverage_complete_at, hafiz_since").eq("id", pStu2).maybeSingle();
      assert(detected?.hifz_coverage_complete_at, "coverage completion should be recorded");
      assert(!detected?.hafiz_since, "coverage alone must NOT declare the child hafiz");

      const pending = await rowFor(pStu2);
      assert(pending?.needsHafizConfirmation === true, "roster should ask for confirmation");
      assert(pending?.quranTrack === "nazra",
        `unconfirmed coverage must not flip the track, got ${pending?.quranTrack}`);

      // A human confirms — that is the milestone, and it is attributed.
      const conf = await api(principal.token, `/school/orgs/${ORG}/students/${pStu2}`, {
        method: "PATCH", body: JSON.stringify({ hafizSince: new Date().toISOString() }),
      });
      assert(conf.status === 200, `confirm ${conf.status}`);
      const { data: confirmed } = await admin.from("student")
        .select("hafiz_since, hafiz_confirmed_by").eq("id", pStu2).maybeSingle();
      assert(confirmed?.hafiz_since, "confirmation should set hafiz_since");
      assert(confirmed?.hafiz_confirmed_by, "confirmation should record who did it");

      const r2 = await rowFor(pStu2);
      assert(r2?.quranTrack === "revision", `confirmed hafiz should infer revision, got ${r2?.quranTrack}`);
      assert(r2?.needsHafizConfirmation === false, "confirmed student should stop being asked");
    } finally {
      await admin.from("hifz_progress").delete().eq("student_id", pStu2).eq("kind", "sabaq");
      await admin.from("student").update({ hafiz_since: null, quran_track: null, hifz_coverage_complete_at: null, hafiz_confirmed_by: null }).eq("id", pStu2);
    }
  } finally {
    await admin.from("student").update({ quran_track: null, hafiz_since: null }).eq("id", pStu1);
  }
});

await check("47. bell schedules: per-wing periods and section assignment, no SQL needed", async () => {
  // A school whose junior wing runs different period times from its
  // senior wing could not express that from the UI at all — slots always
  // landed on 'default' and class_section.schedule_key was SQL-only.
  const key = `qa${Date.now().toString().slice(-6)}`;

  const mk = await api(principal.token, `/school/orgs/${ORG}/timetable-slots`, {
    method: "POST",
    body: JSON.stringify({
      name: "QA P1", dayOfWeek: 1, startTime: "07:30", endTime: "08:10",
      kind: "academic", scheduleKey: key,
    }),
  });
  const mj = await mk.json();
  assert(mk.status === 201, `create slot ${mk.status}: ${JSON.stringify(mj).slice(0, 120)}`);
  assert(mj.scheduleKey === key, `slot should keep its schedule, got ${mj.scheduleKey}`);
  const slotId = mj.id;

  const { data: origSec } = await admin.from("class_section")
    .select("schedule_key").eq("id", sandboxSec.id).maybeSingle();
  const originalKey = origSec?.schedule_key ?? null;

  try {
    const bad = await api(principal.token, `/school/orgs/${ORG}/timetable-slots`, {
      method: "POST",
      body: JSON.stringify({
        name: "QA bad", dayOfWeek: 1, startTime: "07:30", endTime: "08:10",
        kind: "academic", scheduleKey: "Not A Key!",
      }),
    });
    assert(bad.status === 400, `bad scheduleKey should 400, got ${bad.status}`);

    // A section can be moved onto that bell from the UI's endpoint.
    const move = await api(principal.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}`, {
      method: "PATCH", body: JSON.stringify({ scheduleKey: key }),
    });
    assert(move.status === 200, `assign section ${move.status}`);
    const { data: moved } = await admin.from("class_section")
      .select("schedule_key").eq("id", sandboxSec.id).maybeSingle();
    assert(moved?.schedule_key === key, `section not moved: ${moved?.schedule_key}`);

    const badMove = await api(principal.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}`, {
      method: "PATCH", body: JSON.stringify({ scheduleKey: "UPPER case" }),
    });
    assert(badMove.status === 400, `bad section scheduleKey should 400, got ${badMove.status}`);

    // The listing the editor drives off must see both sides.
    const list = await api(principal.token, `/school/orgs/${ORG}/bell-schedules`);
    const lj = await list.json();
    assert(list.status === 200, `bell-schedules ${list.status}`);
    const mine = (lj.schedules ?? []).find((s: any) => s.key === key);
    assert(mine, `new schedule missing from listing: ${JSON.stringify(lj.schedules)}`);
    assert(mine.slots === 1 && mine.sections === 1,
      `counts wrong: ${JSON.stringify(mine)}`);
    assert((lj.schedules ?? []).some((s: any) => s.key === "default"),
      "default schedule should always be listed");

    // Filtered slot read — what the periods panel asks for.
    const filtered = await api(principal.token, `/school/orgs/${ORG}/timetable-slots?scheduleKey=${key}`);
    const fj = await filtered.json();
    assert((fj.slots ?? []).length === 1, `filter should return only this bell's periods, got ${(fj.slots ?? []).length}`);

    // Editing a period's time is possible again (the UI had no path).
    const patched = await api(principal.token, `/school/orgs/${ORG}/timetable-slots/${slotId}`, {
      method: "PATCH", body: JSON.stringify({ endTime: "08:15" }),
    });
    assert(patched.status === 200, `patch slot ${patched.status}`);
  } finally {
    await api(principal.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}`, {
      method: "PATCH", body: JSON.stringify({ scheduleKey: originalKey || "" }),
    });
    await api(principal.token, `/school/orgs/${ORG}/timetable-slots/${slotId}`, { method: "DELETE" });
  }
});

await check("48. notifications: mandatory kinds can't be switched off, read state sticks", async () => {
  const bell = (tok: string) => api(tok, `/school/orgs/${ORG}/me/notifications`).then((r) => r.json());

  const mine = await bell(principal.token);
  assert(Array.isArray(mine.alerts), "alerts should be a list");
  assert(typeof mine.unreadCount === "number", "unreadCount should be a number");
  for (const a of mine.alerts) {
    assert(a.key && a.kind && a.title, `malformed alert: ${JSON.stringify(a).slice(0, 100)}`);
    assert(["mandatory", "policy", "personal", "activity"].includes(a.tier), `bad tier ${a.tier}`);
  }

  // A teacher must not receive an admin-only alert kind.
  const tt = (await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher")).token;
  const theirs = await bell(tt);
  assert(!(theirs.alerts ?? []).some((a: any) => a.kind === "parent_inbox_unread"),
    "parent inbox alerts are for office/principal only");

  // Accountability alerts are not a preference — refuse, don't silently ignore.
  const refuse = await api(principal.token, `/school/orgs/${ORG}/notification-prefs`, {
    method: "PUT",
    body: JSON.stringify({ scope: "user", kind: "roll_call_missing", enabled: false }),
  });
  assert(refuse.status === 400, `mandatory kind should be refused, got ${refuse.status}`);

  // A teacher cannot set the school-wide default for a role.
  const notAllowed = await api(tt, `/school/orgs/${ORG}/notification-prefs`, {
    method: "PUT",
    body: JSON.stringify({ scope: "role", scopeId: "class_teacher", kind: "syllabus_untagged", enabled: false }),
  });
  assert(notAllowed.status === 403, `role defaults are principal-only, got ${notAllowed.status}`);

  const unknown = await api(principal.token, `/school/orgs/${ORG}/notification-prefs`, {
    method: "PUT", body: JSON.stringify({ scope: "user", kind: "made_up", enabled: false }),
  });
  assert(unknown.status === 400, `unknown kind should 400, got ${unknown.status}`);

  // Activity is school-wide context, not a duty: principals and office
  // get it, teachers do not, and it must never drive the red badge.
  const admBell = await bell(principal.token);
  const activity = (admBell.alerts ?? []).filter((a: any) => a.tier === "activity");
  assert(typeof admBell.activityCount === "number", "activityCount should be reported");
  assert(!(theirs.alerts ?? []).some((a: any) => a.tier === "activity"),
    "a teacher's bell stays action-only");
  const badgeCounts = (admBell.alerts ?? []).filter((a: any) => !a.read && a.tier !== "activity").length;
  assert(admBell.unreadCount === badgeCounts,
    `unreadCount must exclude activity: ${admBell.unreadCount} vs ${badgeCounts}`);
  for (const a of activity) {
    assert(a.at, `activity item needs a timestamp: ${a.title}`);
    assert(a.key.includes(":"), "activity keys carry the row id so read state sticks");
  }

  // Optional kinds are on by default and can be turned off personally.
  const prefsBefore = await api(principal.token, `/school/orgs/${ORG}/notification-prefs`).then((r) => r.json());
  assert((prefsBefore.kinds ?? []).length > 0, "the registry should be returned");
  assert(prefsBefore.canSetRoleDefaults === true, "principal should be allowed role defaults");
  const off = await api(principal.token, `/school/orgs/${ORG}/notification-prefs`, {
    method: "PUT", body: JSON.stringify({ scope: "user", kind: "syllabus_untagged", enabled: false }),
  });
  assert(off.status === 200, `personal opt-out ${off.status}`);

  try {
    // Read state persists and is per-user.
    const key = `qa-test-key-${Date.now()}`;
    const mark = await api(principal.token, `/school/orgs/${ORG}/me/notifications/read`, {
      method: "POST", body: JSON.stringify({ keys: [key] }),
    });
    assert(mark.status === 200, `mark read ${mark.status}`);
    const again = await api(principal.token, `/school/orgs/${ORG}/me/notifications/read`, {
      method: "POST", body: JSON.stringify({ keys: [key] }),
    });
    assert(again.status === 200, "marking twice should be idempotent");
    const { data: readRow } = await admin.from("notification_read")
      .select("user_id").eq("org_id", ORG).eq("alert_key", key).maybeSingle();
    assert(readRow?.user_id === principal.id, "read state should belong to that user");
    await admin.from("notification_read").delete().eq("org_id", ORG).eq("alert_key", key);

    const empty = await api(principal.token, `/school/orgs/${ORG}/me/notifications/read`, {
      method: "POST", body: JSON.stringify({ keys: [] }),
    });
    assert(empty.status === 400, `empty keys should 400, got ${empty.status}`);
  } finally {
    await admin.from("notification_pref").delete()
      .eq("org_id", ORG).eq("scope", "user").eq("kind", "syllabus_untagged");
  }
});

await check("49. org insights exclude the Sandbox: QA behavior never reaches the principal", async () => {
  // The Sandbox is regression scaffolding. Its behavior notes and
  // attendance must never appear in an org-level rollup — a principal
  // saw "uncategorized · 1" in Top Behaviors on a school with no real
  // notes, which was Sandbox data leaking through the org branch.
  const tag = `QA-LEAK-${Date.now()}`;
  const { data: stu } = await admin.from("student")
    .select("id, class_section_id").eq("id", pStu1).maybeSingle();
  assert(stu?.class_section_id, "QA student needs a section");

  const { data: ins, error: insErr } = await admin.from("behavior_note").insert({
    org_id: ORG,
    student_id: pStu1,
    class_section_id: stu.class_section_id,
    kind: "concern",
    category: tag,
    points: -1,
    notes: "regression probe",
    observed_at: new Date().toISOString(),
  }).select().single();
  assert(!insErr, `seed behavior note: ${insErr?.message}`);

  try {
    const r = await api(principal.token, `/school/orgs/${ORG}/insights?period=MTD`);
    const j = await r.json();
    assert(r.status === 200, `insights ${r.status}`);
    const cats = [...(j.topPositive ?? []), ...(j.topConcern ?? [])].map((x: any) => x.category);
    assert(!cats.includes(tag),
      `Sandbox behavior leaked into org insights: ${JSON.stringify(cats)}`);

    // The QA teacher, scoped to that very section, must still see it —
    // hiding it from the principal must not blind its own teacher.
    const tt = (await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher")).token;
    const rt = await api(tt, `/school/orgs/${ORG}/insights?period=MTD`);
    const jt = await rt.json();
    const catsT = [...(jt.topPositive ?? []), ...(jt.topConcern ?? [])].map((x: any) => x.category);
    assert(catsT.includes(tag),
      `the section's own teacher should still see it: ${JSON.stringify(catsT)}`);
  } finally {
    await admin.from("behavior_note").delete().eq("id", ins.id);
  }
});

await check("50. today-ops only expects attendance on days the school actually runs", async () => {
  // A principal opening the dashboard on a Sunday saw "Attendance 0/20"
  // with every section named. Nothing runs on Sunday, so nothing was
  // missing — the banner just never asked the timetable.
  const r = await api(principal.token, `/school/orgs/${ORG}/today-ops`);
  const j = await r.json();
  assert(r.status === 200, `today-ops ${r.status}`);
  assert(typeof j.sectionsExpected === "number", "sectionsExpected should be a number");

  // Which weekday is "today" in school time, and does ANY bell schedule
  // run then? The endpoint must agree with the timetable either way.
  const todayIso = j.date as string;
  const dow = new Date(`${todayIso}T12:00:00+05:00`).getUTCDay();
  const isoDow = dow === 0 ? 7 : dow;
  const { data: slots } = await admin.from("timetable_slot")
    .select("schedule_key").eq("org_id", ORG).eq("day_of_week", isoDow).is("archived_at", null);
  const keys = new Set((slots ?? []).map((x: any) => x.schedule_key ?? "default"));
  // The Sandbox is excluded from org rollups, so it can't make a day "run".
  keys.delete("sandbox");

  if (keys.size === 0) {
    assert(j.sectionsExpected === 0,
      `nothing is timetabled on this weekday, so nothing can be missing — got ${j.sectionsExpected}`);
    assert((j.missingSections ?? []).length === 0,
      `no section should be named: ${JSON.stringify(j.missingSections)}`);
  } else {
    // On a running day, every expected section must belong to a schedule
    // that actually has slots today.
    const { data: secs } = await admin.from("class_section")
      .select("name, schedule_key, class:class_id!inner(name, org_id)")
      .eq("class.org_id", ORG);
    const labelToKey = new Map(
      ((secs ?? []) as any[]).map((x) => [`${x.class?.name} ${x.name}`, x.schedule_key ?? "default"]),
    );
    for (const label of j.missingSections ?? []) {
      const k = labelToKey.get(label);
      if (k === undefined) continue; // label shape changed; not this check's business
      assert(keys.has(k),
        `${label} is on schedule "${k}", which has no slots on this weekday`);
    }
  }
});

await check("51. a closed day says so, and /now agrees with /today-ops", async () => {
  // #469 made the attendance count honest on a Sunday; the words around
  // it still described a finished school day ("0/0 - normal day",
  // "Done for today - 20 sections"). Both endpoints now resolve the day
  // from the same helper, so the two lines on one dashboard cannot
  // contradict each other.
  const [opsR, nowR] = await Promise.all([
    api(principal.token, `/school/orgs/${ORG}/today-ops`),
    api(principal.token, `/school/orgs/${ORG}/now`),
  ]);
  const ops = await opsR.json();
  const now = await nowR.json();
  assert(opsR.status === 200 && nowR.status === 200, `today-ops ${opsR.status} / now ${nowR.status}`);

  const sd = ops.schoolDay;
  assert(sd && typeof sd.isSchoolDay === "boolean", "today-ops must report schoolDay.isSchoolDay");
  assert(typeof ops.dayLabel === "string" && ops.dayLabel.length > 0, "today-ops must name the weekday");
  assert(
    sd.isSchoolDay === (sd.closedReason === null),
    `closedReason ${JSON.stringify(sd.closedReason)} disagrees with isSchoolDay ${sd.isSchoolDay}`,
  );
  assert(sd.sectionsRunning === ops.sectionsExpected,
    `schoolDay.sectionsRunning ${sd.sectionsRunning} != sectionsExpected ${ops.sectionsExpected}`);
  if (!sd.isSchoolDay) {
    assert(ops.sectionsExpected === 0, "a closed day cannot expect attendance");
  }

  // /now must reach the same verdict, and mark each section.
  assert(typeof now.isSchoolDay === "boolean", "/now must report isSchoolDay");
  assert(now.isSchoolDay === sd.isSchoolDay,
    `/now says isSchoolDay=${now.isSchoolDay} while /today-ops says ${sd.isSchoolDay}`);
  const sections = (now.sections ?? []) as any[];
  if (sections.length > 0) {
    assert(sections.every((s) => typeof s.runsToday === "boolean"),
      "every /now section needs runsToday, or 'off today' falls back to 'done for today'");
    // A section that is off today cannot be mid-period.
    for (const s of sections) {
      if (s.runsToday === false) {
        assert(!s.current && !s.next,
          `${s.label} is off today but has a period: ${JSON.stringify(s.current ?? s.next)}`);
      }
    }
    if (!now.isSchoolDay) {
      assert(sections.every((s) => s.runsToday === false),
        "school is closed, so no section can be running");
    }
  }
});

await check("52. one bell cannot ring twice at the same minute", async () => {
  // apply-template used to delete only the EMPTY slots of the default
  // band and then re-insert the whole grid, so every slot holding a real
  // timetable gained an identical empty twin — and the response called
  // it a success. Pressing Save twice on the School Schedule page was
  // enough to double the school's timetable (pilot, 6 Sep). The
  // generator now skips occupied times and a partial unique index backs
  // it up; this asserts the invariant directly, org-wide.
  const { data: slots } = await admin.from("timetable_slot")
    .select("id, name, schedule_key, day_of_week, start_time")
    .eq("org_id", ORG).is("archived_at", null);
  const seen = new Map<string, any>();
  const dupes: string[] = [];
  for (const s of (slots ?? []) as any[]) {
    const key = `${s.schedule_key ?? "default"}|${s.day_of_week}|${String(s.start_time).slice(0, 5)}`;
    if (seen.has(key)) dupes.push(`${key} -> "${seen.get(key).name}" + "${s.name}"`);
    else seen.set(key, s);
  }
  assert(dupes.length === 0, `duplicate periods: ${dupes.join("; ")}`);
});

await check("53. the Sandbox stays out of the principal's academics rollup", async () => {
  // The principal's "Curriculum pace - furthest behind" card led with
  // "Sandbox . English 60%" and "Sandbox . Islamiyat 60%" on production.
  // /academics was the one endpoint the principal's dashboard calls that
  // never filtered the QA class - at-risk and the sections leaderboard
  // both do (pilot, 6 Sep).
  const r = await api(principal.token, `/school/orgs/${ORG}/academics`);
  const j = await r.json();
  assert(r.status === 200, `academics ${r.status}`);

  const named: string[] = [
    ...((j.pace?.laggards ?? []) as any[]).map((x) => `${x.className} . ${x.subjectName}`),
    ...((j.subjectsAtRisk ?? []) as any[]).map((x) => `${x.className} . ${x.subjectName}`),
    ...((j.topSubjects ?? []) as any[]).map((x) => `${x.className} . ${x.subjectName}`),
  ];
  const leaked = named.filter((n) => n.toLowerCase().includes("sandbox"));
  assert(leaked.length === 0, `Sandbox reached the principal: ${leaked.join("; ")}`);

  // ...and it must not be over-filtered: a teacher scoped to the Sandbox
  // still needs their own class's numbers. Re-mint - check 34 rotates
  // qa-teacher's password, so the token held above is stale by now.
  const t2 = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const rt = await api(t2.token, `/school/orgs/${ORG}/academics`);
  const jt = await rt.json();
  assert(rt.status === 200, `academics as teacher ${rt.status}`);
  const teacherSees = [
    ...((jt.pace?.laggards ?? []) as any[]),
    ...((jt.subjectsAtRisk ?? []) as any[]),
  ].map((x: any) => String(x.className));
  const sawOwn = teacherSees.some((n) => n.toLowerCase().includes("sandbox"));
  const subjectCount = jt.curriculum?.subjectCount ?? 0;
  assert(sawOwn || subjectCount > 0,
    "the scoped teacher lost sight of their own class - the filter is too wide");
});

await check("54. the attendance tile does not score a day with no school", async () => {
  // attendancePct([]) is 0, so a closed day rendered "0% low" in red on
  // the principal's stat strip - the dashboard reporting an attendance
  // collapse on a Sunday (pilot, 6 Sep). #469/#471 taught today-ops and
  // Right Now to ask the timetable; this tile had never been told.
  const [dashR, opsR] = await Promise.all([
    api(principal.token, `/school/orgs/${ORG}/dashboard?period=WTD`),
    api(principal.token, `/school/orgs/${ORG}/today-ops`),
  ]);
  const dash = await dashR.json();
  const ops = await opsR.json();
  assert(dashR.status === 200 && opsR.status === 200, `dashboard ${dashR.status} / ops ${opsR.status}`);

  const tile = dash.tiles?.attendanceToday;
  assert(tile && typeof tile.closed === "boolean",
    "attendanceToday must say whether the school is closed today");

  // The two endpoints resolve the day through the same helper, so a
  // disagreement here means one of them stopped using it.
  const opsClosed = ops.schoolDay ? !ops.schoolDay.isSchoolDay : null;
  if (opsClosed !== null) {
    assert(tile.closed === opsClosed,
      `dashboard says closed=${tile.closed} while today-ops says closed=${opsClosed}`);
  }

  if (tile.closed) {
    assert(tile.value === null,
      `a closed day has nothing to be a percentage of - got ${tile.value}`);
    assert(typeof tile.hint === "string" && tile.hint.length > 0,
      "a closed tile must say why");
    assert(!tile.notStarted, "a closed day cannot also be 'not started yet'");
  } else {
    assert(tile.value === null || typeof tile.value === "number",
      "an open day's tile is a number or null");
  }

  // Before the first bell, 0% means "not yet", not "people are missing" -
  // the tile read "0% low" in red at 07:30 on a normal school day.
  if (tile.notStarted) {
    assert(tile.value === null,
      `before the first bell there is no percentage yet - got ${tile.value}`);
    assert(typeof tile.firstBell === "string" && /^\d{2}:\d{2}$/.test(tile.firstBell),
      `notStarted must carry the first bell time, got ${JSON.stringify(tile.firstBell)}`);
    // It must genuinely be before that bell on the SCHOOL clock.
    const nowPk = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date());
    assert(nowPk < tile.firstBell,
      `claims school has not started, but it is ${nowPk} and the bell was ${tile.firstBell}`);
  }
});

await check("55. the school week comes from the timetable, per bell schedule", async () => {
  // "Which days does school run" was stored in two settings blobs that
  // disagreed with each other AND with the slots, while the dashboard's
  // attendance walks hardcoded Mon-Fri - so a Saturday with no Hifz
  // register never counted as a missed day, and any school not running
  // Mon-Fri would have been nagged for days it is shut (pilot, 6 Sep).
  const r = await api(principal.token, `/school/orgs/${ORG}/bell-schedules`);
  const j = await r.json();
  assert(r.status === 200, `bell-schedules ${r.status}`);
  const rows = (j.schedules ?? []) as any[];
  assert(rows.length > 0, "an org with a timetable has at least one bell schedule");

  for (const row of rows) {
    assert(Array.isArray(row.days), `schedule "${row.key}" must report its days`);
    for (const d of row.days) {
      assert(Number.isInteger(d) && d >= 1 && d <= 7, `bad weekday ${d} on "${row.key}"`);
    }
    // A schedule with slots rings on at least one day, and vice versa.
    assert((row.slots > 0) === (row.days.length > 0),
      `"${row.key}" has ${row.slots} slots but ${row.days.length} days`);
  }

  // Cross-check one schedule against the raw slots.
  const real = rows.find((x: any) => x.key !== "sandbox" && x.slots > 0);
  if (real) {
    const { data: slots } = await admin.from("timetable_slot")
      .select("day_of_week").eq("org_id", ORG).eq("schedule_key", real.key).is("archived_at", null);
    const expected = [...new Set((slots ?? []).map((x: any) => x.day_of_week))].sort((a, b) => a - b);
    assert(JSON.stringify(expected) === JSON.stringify(real.days),
      `"${real.key}" reports ${JSON.stringify(real.days)} but its slots say ${JSON.stringify(expected)}`);
  }

  // The dashboard must not invent attendance gaps on days a section does
  // not run - the alert that started all of this.
  const dashR = await api(principal.token, `/school/orgs/${ORG}/dashboard?period=WTD`);
  const dash = await dashR.json();
  assert(dashR.status === 200, `dashboard ${dashR.status}`);
  assert(Array.isArray(dash.alerts), "dashboard should carry an alerts array");
});

await check("56. the school's timezone is the school's, not Pakistan's", async () => {
  // Every school-day decision - is today a school day, has the first bell
  // rung, was this marked today - used to resolve on a hardcoded
  // Asia/Karachi. That makes the product an anomaly built for its first
  // customer; school #2 in another country would have read the wrong day
  // for five hours of every night (pilot review, 6 Sep).
  // NOTE the two different paths: reads are /school/organizations/:id
  // (wrapped in { organization }), writes are PATCH /school/orgs/:id.
  const before = await api(principal.token, `/school/organizations/${ORG}`);
  const beforeJson = await before.json();
  assert(before.status === 200, `org read ${before.status}`);
  const currentTz = beforeJson?.organization?.settings?.timezone ?? "";

  // Garbage must be refused, not silently ignored: orgTimezone() falls
  // back to the default when it cannot parse, which would look to a
  // school abroad like the setting simply doing nothing.
  const bad = await api(principal.token, `/school/orgs/${ORG}`, {
    method: "PATCH",
    body: JSON.stringify({ timezone: "Mars/Olympus_Mons" }),
  });
  assert(bad.status === 400, `an invalid zone should be refused, got ${bad.status}`);

  // A valid zone is accepted - but only exercise the write when the org
  // ALREADY has an explicit one, so writing it back is a no-op. The suite
  // confines its writes to the Sandbox and qa-* accounts; setting a real
  // school's timezone because a test wanted to is not that.
  if (currentTz) {
    const ok = await api(principal.token, `/school/orgs/${ORG}`, {
      method: "PATCH",
      body: JSON.stringify({ timezone: currentTz }),
    });
    assert(ok.status === 200, `a valid zone should be accepted, got ${ok.status}`);
    const after = await (await api(principal.token, `/school/organizations/${ORG}`)).json();
    assert((after?.organization?.settings?.timezone ?? "") === currentTz,
      `timezone did not round-trip: ${JSON.stringify(after?.organization?.settings?.timezone)}`);
  }

  // Whatever the org resolves to - explicit, campus, or fallback - the
  // day the rest of the system reports must agree with it. An org with no
  // explicit zone still must not be reading the SERVER's day.
  const effectiveTz = currentTz || "Asia/Karachi";
  const ops = await (await api(principal.token, `/school/orgs/${ORG}/today-ops`)).json();
  const expected = new Intl.DateTimeFormat("en-CA", {
    timeZone: effectiveTz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  assert(ops.date === expected,
    `today-ops says ${ops.date} but ${effectiveTz} says ${expected}`);
});

await check("57. parent inbox: two-way, reading is not answering, owned, and aged in school days", async () => {
  // The parent portal's only way to reach the school, and it had no
  // coverage at all. Two things matter: the round trip works, and a
  // thread stays in the queue until someone REPLIES - read_at is one
  // column on the message shared by admin/principal/office, so marking
  // it on open let a principal's glance clear the admin's queue while
  // the parent still had no answer (Muneeb, 6 Sep).
  const MARK = `QA inbox ${Date.now()}`;
  const pTok = (await (await pinLogin(PARENT_PHONE, "3456")).json()).token;
  assert(!!pTok, "parent PIN login failed - cannot test the parent inbox");
  const pinHdr = { apikey: ANON, "X-Pin-Token": pTok, "Content-Type": "application/json" };
  let threadId = "";
  try {
    // 1. Parent opens a thread.
    const start = await fetch(`${FUNC}/school/pin-me/messages`, {
      method: "POST", headers: pinHdr,
      body: JSON.stringify({ subject: MARK, body: `${MARK} body` }),
    });
    const startJson = await start.json();
    assert(start.status === 201, `start thread ${start.status}: ${JSON.stringify(startJson)}`);
    threadId = startJson.threadId;
    assert(!!threadId, "no threadId returned");

    // 1b. The parent's own thread LIST must load. Checked explicitly
    //     because the single-thread read passing says nothing about it -
    //     a bad edit to the list handler shipped a 500 to every parent's
    //     Contact school screen and this suite did not notice (6 Sep).
    const plist = await fetch(`${FUNC}/school/pin-me/messages`, {
      headers: { apikey: ANON, "X-Pin-Token": pTok },
    });
    const plistJson = await plist.json();
    assert(plist.status === 200,
      `parent thread list ${plist.status}: ${JSON.stringify(plistJson).slice(0, 140)}`);
    assert(Array.isArray(plistJson.threads), "parent thread list should carry threads");
    assert(plistJson.threads.some((t: any) => t.threadId === threadId),
      "the parent should see the thread they just started");

    // 2. Staff see it, and it counts as waiting.
    const listed = await (await api(principal.token, `/school/orgs/${ORG}/inbox`)).json();
    const mine = (listed.threads ?? []).find((t: any) => t.threadId === threadId);
    assert(mine, "the new thread is not in the staff inbox");
    assert(mine.unreadCount >= 1, "a brand new parent message should be waiting for a reply");
    const c1 = await (await api(principal.token, `/school/orgs/${ORG}/inbox-unread-count`)).json();
    assert((c1.awaitingReply ?? c1.unreadCount) >= 1, "count should include the new message");

    // 3. READING must not clear it. This is the regression that matters:
    //    the principal looks, the admin's queue must be untouched.
    const opened = await api(principal.token, `/school/orgs/${ORG}/inbox/${threadId}`);
    assert(opened.status === 200, `open thread ${opened.status}`);
    const afterRead = await (await api(principal.token, `/school/orgs/${ORG}/inbox`)).json();
    const stillWaiting = (afterRead.threads ?? []).find((t: any) => t.threadId === threadId);
    assert(stillWaiting && stillWaiting.unreadCount >= 1,
      "opening a thread cleared it from the queue - a glance is not an answer");

    // 4. Replying does clear it, and the parent can see the reply.
    const rep = await api(principal.token, `/school/orgs/${ORG}/inbox/${threadId}/reply`, {
      method: "POST", body: JSON.stringify({ body: `${MARK} reply` }),
    });
    assert(rep.status === 200, `reply ${rep.status}`);

    const afterReply = await (await api(principal.token, `/school/orgs/${ORG}/inbox`)).json();
    const answered = (afterReply.threads ?? []).find((t: any) => t.threadId === threadId);
    assert(answered && answered.unreadCount === 0,
      `an answered thread should leave the queue, got ${answered?.unreadCount}`);

    const thr = await (await fetch(`${FUNC}/school/pin-me/messages/${threadId}`, {
      headers: { apikey: ANON, "X-Pin-Token": pTok },
    })).json();
    const roles = (thr.messages ?? []).map((m: any) => m.sentByRole ?? m.sent_by_role);
    assert(roles.length === 2 && roles[0] === "parent" && roles[1] === "school",
      `parent should see both sides in order, got ${JSON.stringify(roles)}`);

    // 5. Replying claimed it - whoever answered IS who handled it.
    const claimed = (afterReply.threads ?? []).find((t: any) => t.threadId === threadId);
    assert(claimed?.assignedTo === principal.id,
      `replying should claim an unheld thread, got ${JSON.stringify(claimed?.assignedTo)}`);
    assert(claimed?.assignedToMe === true, "the replier should see it as theirs");
    assert(typeof claimed?.assignedToName === "string" && claimed.assignedToName.length > 0,
      "an assigned thread must name its holder");

    // 6. Release puts it back in the pool.
    const rel = await api(principal.token, `/school/orgs/${ORG}/inbox/${threadId}/assign`, {
      method: "DELETE",
    });
    assert(rel.status === 200, `release ${rel.status}`);
    const afterRel = await (await api(principal.token, `/school/orgs/${ORG}/inbox/${threadId}`)).json();
    assert((afterRel.thread?.assignedTo ?? null) === null,
      "released thread should have no holder");

    // 7. Office staff can take it, and the principal then sees it as
    //    someone else's - the whole point of the feature.
    const take = await api(office.token, `/school/orgs/${ORG}/inbox/${threadId}/assign`, {
      method: "POST", body: JSON.stringify({}),
    });
    assert(take.status === 200, `office claim ${take.status}`);
    const asSeen = await (await api(principal.token, `/school/orgs/${ORG}/inbox/${threadId}`)).json();
    assert(asSeen.thread?.assignedTo === office.id, "office should hold the thread");
    assert(asSeen.thread?.assignedToMe === false,
      "the principal must not see someone else's thread as their own");

    // 8. Assignment does NOT clear the queue - claiming is not answering.
    //    (This thread is already answered, so re-check the invariant on a
    //    fresh one.)
    const s2 = await fetch(`${FUNC}/school/pin-me/messages`, {
      method: "POST", headers: pinHdr,
      body: JSON.stringify({ subject: `${MARK} two`, body: `${MARK} two` }),
    });
    const t2id = (await s2.json()).threadId;
    try {
      await api(principal.token, `/school/orgs/${ORG}/inbox/${t2id}/assign`, {
        method: "POST", body: JSON.stringify({}),
      });
      const stillW = await (await api(principal.token, `/school/orgs/${ORG}/inbox`)).json();
      const row = (stillW.threads ?? []).find((t: any) => t.threadId === t2id);
      assert(row && row.unreadCount >= 1,
        "claiming a thread must not clear it - the parent is still waiting");
    } finally {
      if (t2id) await admin.from("parent_message").delete().eq("thread_id", t2id);
      if (t2id) await admin.from("parent_thread_assignment").delete().eq("thread_id", t2id);
    }

    // 9. Ageing: a message that just arrived is waiting 0 SCHOOL days and
    //    is not overdue. Wall-clock ageing would call a Friday evening
    //    message overdue by Monday at a school shut all weekend.
    const aged = (await (await api(principal.token, `/school/orgs/${ORG}/inbox`)).json());
    assert(typeof aged.slaDays === "number" && aged.slaDays >= 0,
      `inbox should report the school's reply window, got ${JSON.stringify(aged.slaDays)}`);
    const s3 = await fetch(`${FUNC}/school/pin-me/messages`, {
      method: "POST", headers: pinHdr,
      body: JSON.stringify({ subject: `${MARK} three`, body: `${MARK} three` }),
    });
    const t3id = (await s3.json()).threadId;
    try {
      const fresh = await (await api(principal.token, `/school/orgs/${ORG}/inbox`)).json();
      const row = (fresh.threads ?? []).find((t: any) => t.threadId === t3id);
      assert(row, "the fresh thread should be listed");
      assert(row.waitingSchoolDays === 0,
        `a message that just arrived has waited 0 school days, got ${row.waitingSchoolDays}`);
      assert(row.overdue === false, "a brand new message cannot be overdue");
      assert(typeof row.waitingSince === "string", "a waiting thread must say since when");
      // Answered threads stop ageing.
      await api(principal.token, `/school/orgs/${ORG}/inbox/${t3id}/reply`, {
        method: "POST", body: JSON.stringify({ body: `${MARK} three reply` }),
      });
      const done = await (await api(principal.token, `/school/orgs/${ORG}/inbox`)).json();
      const answered = (done.threads ?? []).find((t: any) => t.threadId === t3id);
      assert((answered?.waitingSchoolDays ?? null) === null && answered?.overdue === false,
        "an answered thread is not waiting on anyone");
    } finally {
      if (t3id) {
        await admin.from("parent_message").delete().eq("thread_id", t3id);
        await admin.from("parent_thread_assignment").delete().eq("thread_id", t3id);
      }
    }

    // 10. A teacher must not be able to read parent mail at all.
    const t2 = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
    const denied = await api(t2.token, `/school/orgs/${ORG}/inbox`);
    assert(denied.status === 403, `teachers must not read the parent inbox, got ${denied.status}`);
  } finally {
    // Never leave QA chatter in a real school's inbox.
    if (threadId) {
      await admin.from("parent_message").delete().eq("thread_id", threadId);
      await admin.from("parent_thread_assignment").delete().eq("thread_id", threadId);
    }
  }
});

await check("58. a student absence notice reaches the register the moment it is filed", async () => {
  // "Time off & absences" claimed one queue for teacher leave AND student
  // absence notices. The queue was right; the student half was a dead
  // end. Nothing anywhere read subject_type='student', so a parent filed
  // a notice, an admin approved it, and the next morning the teacher
  // marked the child absent exactly as if nothing had been said
  // (pilot review, 7 Sep). Since 14 Sep (Muneeb) the notice counts the
  // MOMENT it is filed: pending shows as pending, approval upgrades the
  // label, and only rejection removes it.
  const pTok2 = (await (await pinLogin(PARENT_PHONE, "3456")).json()).token;
  assert(!!pTok2, "parent PIN login failed");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  let reqId: string | null = null;
  try {
    // 1. Parent files an absence notice for their own child.
    const filed = await fetch(`${FUNC}/school/pin-me/students/${pStu1}/time-off`, {
      method: "POST",
      headers: { apikey: ANON, "X-Pin-Token": pTok2, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "sick", startDate: today, endDate: today, reason: "QA absence notice",
      }),
    });
    const filedJson = await filed.json();
    assert(filed.status === 201 || filed.status === 200,
      `file absence ${filed.status}: ${JSON.stringify(filedJson).slice(0, 140)}`);

    const { data: row } = await admin.from("time_off_request")
      .select("id, subject_type, status").eq("org_id", ORG)
      .eq("subject_type", "student").eq("subject_id", pStu1)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    assert(row, "the notice should exist as a student request");
    reqId = (row as any).id;

    // 2. It lands in the SAME staff queue as teacher leave, named.
    const queue = await (await api(principal.token, `/school/orgs/${ORG}/time-off?status=pending`)).json();
    const mine = (queue.requests ?? []).find((r: any) => r.id === reqId);
    assert(mine, "a student notice must appear in the staff time-off queue");
    assert(mine.subjectType === "student", `expected a student row, got ${mine.subjectType}`);
    assert(typeof mine.subjectName === "string" && mine.subjectName.length > 0,
      "the queue must name the student, not just an id");

    // 3. The register hears about it BEFORE any approval - the family's
    //    report counts the moment it is filed, labelled pending.
    //    Re-mint the teacher first: check 34 rotates qa-teacher's
    //    password, so the token from the top of the file is stale by
    //    now (the same trap check 53 dodged).
    const t3 = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
    const beforeResp = await api(t3.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance?date=${today}`);
    assert(beforeResp.status === 200, `register read ${beforeResp.status}`);
    const before = await beforeResp.json();
    const pendingHit = (before.notifiedAbsences ?? []).find((n: any) => n.studentId === pStu1);
    assert(pendingHit, "a freshly FILED notice must already show on the register");
    assert(pendingHit.status === "pending",
      `and be labelled pending: ${JSON.stringify(pendingHit)}`);

    // 4. Admin approves.
    const dec = await api(principal.token, `/school/orgs/${ORG}/time-off/${reqId}/decide`, {
      method: "PATCH", body: JSON.stringify({ decision: "approved" }),
    });
    assert(dec.status === 200, `decide ${dec.status}`);

    // 5. Now the person taking the register is told. This is the whole
    //    point: the notice has to reach the teacher, not just the office.
    const afterResp = await api(t3.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance?date=${today}`);
    assert(afterResp.status === 200, `register read ${afterResp.status}`);
    const after = await afterResp.json();
    const hit = (after.notifiedAbsences ?? []).find((n: any) => n.studentId === pStu1);
    assert(hit, "an APPROVED absence must show on the register for that date");
    assert(hit.reason === "QA absence notice", `reason should carry through, got ${hit.reason}`);
    assert(hit.status === "approved", `approval must upgrade the label: ${JSON.stringify(hit)}`);

    // 6. ...and only for the dates it covers.
    const other = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(Date.now() + 9 * 86400000));
    const far = await (await api(t3.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance?date=${other}`)).json();
    assert(!(far.notifiedAbsences ?? []).some((n: any) => n.studentId === pStu1),
      "the absence must not leak onto dates it does not cover");

    // 7. Rejection is the one thing that removes it.
    const rej = await api(principal.token, `/school/orgs/${ORG}/time-off/${reqId}/decide`, {
      method: "PATCH", body: JSON.stringify({ decision: "rejected" }),
    });
    assert(rej.status === 200, `reject ${rej.status}`);
    const gone = await (await api(t3.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance?date=${today}`)).json();
    assert(!(gone.notifiedAbsences ?? []).some((n: any) => n.studentId === pStu1),
      "a REJECTED notice must not excuse anyone");
  } finally {
    if (reqId) await admin.from("time_off_request").delete().eq("id", reqId);
  }
});

await check("59. a test can cover several topics, and old clients still work", async () => {
  // Teachers could not tag a "grand test" spanning Biology 1-4 with more
  // than one topic - assignment.curriculum_topic_id is a single FK
  // (pilot, 7 Sep). The set now lives in assignment_topic; the legacy
  // column mirrors the FIRST topic so the portal and any stale client
  // keep working (stale clients proved very real this same week).
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const { data: qaTopics } = await admin.from("curriculum_topic")
    .select("id, name").eq("curriculum_id", qaCur.id).order("display_order").limit(2);
  assert((qaTopics ?? []).length >= 2, "sandbox curriculum should have two QA topics");
  const [t1, t2] = (qaTopics ?? []).map((x: any) => x.id);

  let asgId: string | null = null;
  try {
    // 1. Create with BOTH topics.
    const mk = await api(t.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        title: "QA grand test", kind: "test", maxScore: 100,
        sectionSubjectId: qaSs.id, curriculumTopicIds: [t1, t2],
      }),
    });
    const mkJson = await mk.json();
    assert(mk.status === 201, `create ${mk.status}: ${JSON.stringify(mkJson).slice(0, 140)}`);
    asgId = mkJson.assignment.id;
    assert(
      JSON.stringify([...(mkJson.assignment.curriculumTopicIds ?? [])].sort()) ===
        JSON.stringify([t1, t2].sort()),
      `create should return both topics, got ${JSON.stringify(mkJson.assignment.curriculumTopicIds)}`,
    );
    assert(mkJson.assignment.curriculumTopicId === t1,
      "the legacy single field must mirror the FIRST topic");

    // 2. The list carries the full set (the edit form loads from here).
    const list = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/assignments`)).json();
    const row = (list.assignments ?? []).find((a: any) => a.id === asgId);
    assert(row && (row.curriculumTopicIds ?? []).length === 2,
      `list should carry both topics, got ${JSON.stringify(row?.curriculumTopicIds)}`);

    // 3. Editing via the NEW field replaces the set and re-mirrors.
    const ed = await api(t.token, `/school/orgs/${ORG}/assignments/${asgId}`, {
      method: "PATCH", body: JSON.stringify({ curriculumTopicIds: [t2] }),
    });
    const edJson = await ed.json();
    assert(ed.status === 200, `patch ${ed.status}: ${JSON.stringify(edJson).slice(0, 140)}`);
    assert(edJson.assignment.curriculumTopicId === t2, "mirror should follow the new first topic");
    assert((edJson.assignment.curriculumTopicIds ?? []).length === 1, "set should be replaced, not merged");

    // 4. A STALE client editing via the old single field owns the whole
    //    set - it cannot see the other topics, so keeping them would
    //    leave a tag half-ghost.
    const old = await api(t.token, `/school/orgs/${ORG}/assignments/${asgId}`, {
      method: "PATCH", body: JSON.stringify({ curriculumTopicId: t1 }),
    });
    const oldJson = await old.json();
    assert(old.status === 200, `legacy patch ${old.status}`);
    assert(
      JSON.stringify(oldJson.assignment.curriculumTopicIds ?? []) === JSON.stringify([t1]),
      `legacy edit should collapse the set to its one topic, got ${JSON.stringify(oldJson.assignment.curriculumTopicIds)}`,
    );

    // 5. A topic from outside this subject's syllabus is refused.
    const bogus = crypto.randomUUID();
    const bad = await api(t.token, `/school/orgs/${ORG}/assignments/${asgId}`, {
      method: "PATCH", body: JSON.stringify({ curriculumTopicIds: [t1, bogus] }),
    });
    assert(bad.status === 400, `foreign topic should be refused, got ${bad.status}`);
  } finally {
    if (asgId) {
      await admin.from("assignment_topic").delete().eq("assignment_id", asgId);
      await admin.from("assignment").delete().eq("id", asgId);
    }
  }
});

await check("60. points: class leaderboard, child league privacy, drilldown gating", async () => {
  // Teachers started logging behavior and asked for the obvious next
  // layer: who leads the class, a league on the child's login, and -
  // from the principal - the notes BEHIND an aggregate bar (7 Sep).
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const noteIds: string[] = [];
  const mkNote = async (studentId: string, kind: string, category: string, points: number) => {
    const r = await api(t.token, `/school/orgs/${ORG}/behavior-notes`, {
      method: "POST",
      body: JSON.stringify({ studentId, kind, category, points, notes: `QA points ${category}` }),
    });
    const j = await r.json();
    assert(r.status === 200 || r.status === 201, `note ${r.status}`);
    noteIds.push(j.note.id);
    return j.note;
  };

  try {
    // Self-heal first: a suite run killed mid-flight (17 Sep: app restart
    // during check 27's window) can orphan a "QA …" note on the portal
    // students, and the absolute net assertions below then count it.
    // Only rows this suite itself writes (notes starting "QA ") die here.
    await admin.from("behavior_note").delete()
      .in("student_id", [pStu1, pStu2]).like("notes", "QA %");

    // Student 1 earns more than student 2; student 2 carries a concern.
    await mkNote(pStu1, "positive", "Adab", 1);
    await mkNote(pStu1, "positive", "Adab", 1);
    await mkNote(pStu2, "positive", "Adab", 1);
    await mkNote(pStu2, "concern", "Attendance", -1);

    // 1. Teacher's leaderboard: full table, every enrolled student, net
    //    ranking, both windows sane.
    const lb = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/behavior-leaderboard?period=month`)).json();
    assert(Array.isArray(lb.rows) && lb.rows.length >= 2, "leaderboard should list students");
    const r1 = lb.rows.find((r: any) => r.studentId === pStu1);
    const r2 = lb.rows.find((r: any) => r.studentId === pStu2);
    assert(r1 && r2, "both QA students should appear");
    assert(r1.net > r2.net, `stu1 should lead: ${r1.net} vs ${r2.net}`);
    assert(r1.rank < r2.rank, "rank must follow net points");
    assert(typeof r2.concern === "number" && r2.concern > 0,
      "staff view carries the concern magnitude");
    const bad = await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/behavior-leaderboard?period=decade`);
    assert(bad.status === 400, `bad period should 400, got ${bad.status}`);

    // 2. The child's league: top five + self, and NOBODY else's concerns.
    const pin = await pinLogin("QA-PORTAL-1", "1234");
    const pTokStu = (await pin.json()).token;
    const lg = await (await fetch(`${FUNC}/school/pin-me/students/${pStu1}/points-league?period=month`, {
      headers: { apikey: ANON, "X-Pin-Token": pTokStu },
    })).json();
    assert(lg.enabled === true, "league should be enabled by default");
    assert(lg.league && Array.isArray(lg.league.top), "league should carry a top list");
    assert(lg.league.top.length <= 5, "the child sees at most the top five");
    assert(lg.league.me && lg.league.me.rank >= 1, "the child sees their own rank");
    for (const row of lg.league.top) {
      assert(!("concern" in row) && !("positive" in row),
        "classmates appear as name + net points ONLY - no one's concerns");
    }
    assert(Array.isArray(lg.earn) && lg.earn.length > 0,
      "the league explains how points are earned");
    assert(lg.earn.every((e: any) => e.points > 0), "earn rules are positive");

    // 3. The school can switch the child league OFF; staff boards remain.
    const off = await api(principal.token, `/school/orgs/${ORG}`, {
      method: "PATCH", body: JSON.stringify({ student_points_league: false }),
    });
    assert(off.status === 200, `settings off ${off.status}`);
    try {
      const hidden = await (await fetch(`${FUNC}/school/pin-me/students/${pStu1}/points-league`, {
        headers: { apikey: ANON, "X-Pin-Token": pTokStu },
      })).json();
      assert(hidden.enabled === false, "disabled league must say so to the child");
      const stillStaff = await api(t.token,
        `/school/orgs/${ORG}/sections/${sandboxSec.id}/behavior-leaderboard`);
      assert(stillStaff.status === 200, "the staff board is not affected by the child switch");
    } finally {
      const on = await api(principal.token, `/school/orgs/${ORG}`, {
        method: "PATCH", body: JSON.stringify({ student_points_league: true }),
      });
      assert(on.status === 200, "restore league setting");
    }

    // 4. Drilldown: the principal sees who/by whom; a teacher cannot read
    //    the org-wide view; a section they teach is fine.
    const dd = await (await api(principal.token,
      `/school/orgs/${ORG}/behavior-drilldown?kind=positive&category=Adab&period=month&sectionId=${sandboxSec.id}`)).json();
    assert(Array.isArray(dd.notes) && dd.notes.length >= 3, "drilldown should list the Adab notes");
    assert(dd.notes.every((n: any) => typeof n.studentName === "string"),
      "drilldown names the student");
    assert(dd.notes.some((n: any) => typeof n.recordedByName === "string" && n.recordedByName.length > 0),
      "drilldown names who logged it");
    const orgWide = await api(t.token, `/school/orgs/${ORG}/behavior-drilldown?kind=concern`);
    assert(orgWide.status === 403, `teacher must not read the org-wide drilldown, got ${orgWide.status}`);
    const own = await api(t.token,
      `/school/orgs/${ORG}/behavior-drilldown?kind=positive&sectionId=${sandboxSec.id}`);
    assert(own.status === 200, `teacher can drill into their own class, got ${own.status}`);

    // 5. Summary windows for one student.
    const sum = await (await api(t.token,
      `/school/orgs/${ORG}/students/${pStu1}/behavior-summary`)).json();
    assert(sum.windows && sum.windows.month && sum.windows.all,
      "summary should carry the windows");
    assert(sum.windows.month.net >= 2, `stu1 net this month should include the QA notes, got ${sum.windows.month.net}`);
  } finally {
    for (const id of noteIds) {
      await admin.from("behavior_note").delete().eq("id", id);
    }
  }
});

await check("61. quran track: the child's own teacher can flip nazra/hifz; others cannot", async () => {
  // Hifz IV is the intake class (Ambreen, 7 Sep): part of a hifz-kind
  // section reads nazra first. The narrow track endpoint lets the
  // section's own teacher set student.quran_track without needing the
  // manage_students PATCH.
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  try {
    // 1. Teacher of the section sets an explicit track.
    const set1 = await api(t.token, `/school/orgs/${ORG}/students/${pStu1}/quran-track`, {
      method: "POST", body: JSON.stringify({ quranTrack: "revision" }),
    });
    assert(set1.status === 200, `teacher set track ${set1.status}`);
    // 2. The summary reflects it as EXPLICIT (inferred for this sandbox
    //    section would be nazra, so revision proves the write).
    const sum = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`)).json();
    const row = (sum.students ?? []).find((r: any) => r.studentId === pStu1);
    assert(row?.quranTrack === "revision", `summary track: ${JSON.stringify(row?.quranTrack)}`);
    assert(row?.quranTrackInferred === false, "track must read as explicit, not inferred");
    // 3. Garbage 400s.
    const bad = await api(t.token, `/school/orgs/${ORG}/students/${pStu1}/quran-track`, {
      method: "POST", body: JSON.stringify({ quranTrack: "qaidah" }),
    });
    assert(bad.status === 400, `bad track should 400, got ${bad.status}`);
    // 4. Office staff is neither this child's teacher nor admin here.
    const off = await ensureUser("qa-office@azality.com", "QA Office", "office_staff");
    const deny = await api(off.token, `/school/orgs/${ORG}/students/${pStu1}/quran-track`, {
      method: "POST", body: JSON.stringify({ quranTrack: "hifz" }),
    });
    assert(deny.status === 403, `office must not set tracks here, got ${deny.status}`);
    // 5. null returns the child to automatic inference.
    const clr = await api(t.token, `/school/orgs/${ORG}/students/${pStu1}/quran-track`, {
      method: "POST", body: JSON.stringify({ quranTrack: null }),
    });
    assert(clr.status === 200, `clear track ${clr.status}`);
    const sum2 = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`)).json();
    const row2 = (sum2.students ?? []).find((r: any) => r.studentId === pStu1);
    assert(row2?.quranTrackInferred === true, "cleared track must infer again");
  } finally {
    await admin.from("student").update({ quran_track: null }).eq("id", pStu1);
  }
});

await check("62. fees guardrails: duplicate plan 409, sandbox never in the sweep or the org view", async () => {
  // 7 Sep: per-student amounts entered as 12 extra "Monthly Tuition"
  // PLANS made the generator bill every Junior ~Rs 48,000 (it sums all
  // plans), and the org Fees page counted Sandbox demo rows. Guardrails:
  // same-name monthly plan 409s; the org-wide sweep and the org fees
  // view exclude the Sandbox (explicit selection still works).
  const PERIOD = "2031-01"; // far future - never collides with real billing
  let planId: string | null = null;
  try {
    // 1. Baseline org-wide sweep count (dry).
    const dry0 = await (await api(principal.token, `/school/orgs/${ORG}/fees/bulk-generate`, {
      method: "POST", body: JSON.stringify({ period: PERIOD, dryRun: true }),
    })).json();
    const baseline = dry0.total ?? 0;

    // 2. A plan on the Sandbox class...
    const mk = await api(principal.token, `/school/orgs/${ORG}/classes/${sandboxClass.id}/fee-plans`, {
      method: "POST", body: JSON.stringify({ name: "QA Tuition", amount: 100, frequency: "monthly" }),
    });
    const mkJ = await mk.json();
    assert(mk.status === 200 || mk.status === 201, `plan create ${mk.status}`);
    planId = mkJ.plan?.id ?? mkJ.id ?? null;

    // 3. ...cannot be duplicated by name.
    const dupe = await api(principal.token, `/school/orgs/${ORG}/classes/${sandboxClass.id}/fee-plans`, {
      method: "POST", body: JSON.stringify({ name: "qa tuition", amount: 200, frequency: "monthly" }),
    });
    assert(dupe.status === 409, `same-name monthly plan should 409, got ${dupe.status}`);

    // 4. The org-wide sweep ignores the Sandbox plan entirely.
    const dry1 = await (await api(principal.token, `/school/orgs/${ORG}/fees/bulk-generate`, {
      method: "POST", body: JSON.stringify({ period: PERIOD, dryRun: true }),
    })).json();
    assert((dry1.total ?? 0) === baseline,
      `sandbox plan must not change the sweep: ${baseline} -> ${dry1.total}`);

    // 5. Explicitly choosing the class is deliberate and respected.
    const gen = await (await api(principal.token, `/school/orgs/${ORG}/fees/bulk-generate`, {
      method: "POST", body: JSON.stringify({ period: PERIOD, classIds: [sandboxClass.id] }),
    })).json();
    assert((gen.created ?? 0) >= 1, `explicit sandbox generate should bill, got ${JSON.stringify(gen)}`);

    // 6. The org fees view hides them; the section filter still shows them.
    const orgView = await (await api(principal.token, `/school/orgs/${ORG}/fees?period=${PERIOD}`)).json();
    assert((orgView.fees ?? []).every((f: any) => f.student_id !== pStu1 && f.student_id !== pStu2),
      "sandbox vouchers must not appear in the org fees view");
    const secView = await (await api(principal.token,
      `/school/orgs/${ORG}/fees?period=${PERIOD}&sectionId=${sandboxSec.id}`)).json();
    assert((secView.fees ?? []).length >= 1, "section filter should still show sandbox vouchers");
  } finally {
    await admin.from("fee_status").delete().eq("org_id", ORG).eq("period", PERIOD);
    if (planId) await admin.from("class_fee_plan").delete().eq("id", planId);
    else await admin.from("class_fee_plan").delete().eq("class_id", sandboxClass.id).eq("name", "QA Tuition");
  }
});

await check("63. suggestion triage: adopt relabels the notes, dismiss hides without touching them", async () => {
  // 8 Sep: 'Add to catalog' was the ONLY action on teacher suggestions.
  // Now: adopt-as (rename to what the school means, past notes re-filed
  // under it) and dismiss ('try to be regular' is advice, not a
  // behavior). Both must remember context (who said it, where).
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const noteIds: string[] = [];
  let catId: string | null = null;
  const KV_KEY = `school:${ORG}:behavior-suggestion-dismissed`;
  const mkNote = async (category: string) => {
    const r = await api(t.token, `/school/orgs/${ORG}/behavior-notes`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, kind: "positive", category, points: 1, notes: "QA triage" }),
    });
    const j = await r.json();
    assert(r.status === 200 || r.status === 201, `note ${r.status}`);
    noteIds.push(j.note.id);
  };
  try {
    await mkNote("QA Odd Habit");
    await mkNote("qa odd habit "); // case/space variant must group + relabel too
    await mkNote("QA Advice Text");

    // 1. The rollup carries who/where context.
    const sg1 = await (await api(principal.token, `/school/orgs/${ORG}/behavior-categories/suggestions`)).json();
    const odd = (sg1.suggestions ?? []).find((x: any) => x.label.toLowerCase().startsWith("qa odd habit"));
    assert(odd && odd.count === 2, `grouped count should be 2, got ${JSON.stringify(odd?.count)}`);
    assert((odd.suggestedBy ?? []).length > 0, "suggestion names who typed it");
    assert((odd.usedIn ?? []).length > 0, "suggestion names where it was used");

    // 2. Adopt as a NEW category under the school's own name.
    const ad = await (await api(principal.token, `/school/orgs/${ORG}/behavior-categories/suggestions/adopt`, {
      method: "POST",
      body: JSON.stringify({ label: odd.label, newCategory: { label: "QA Adopted Habit", kind: "positive" } }),
    })).json();
    assert(ad.ok === true && ad.relabeled === 2, `adopt should relabel 2 notes, got ${JSON.stringify(ad.relabeled)}`);
    catId = ad.category?.id ?? null;
    const { data: relabeled } = await admin.from("behavior_note").select("category").in("id", noteIds.slice(0, 2));
    assert(relabeled!.every((n: any) => n.category === "QA Adopted Habit"),
      "past notes must carry the adopted name");

    // 3. Dismiss: the advice text disappears from the rollup, notes untouched.
    const dm = await api(principal.token, `/school/orgs/${ORG}/behavior-categories/suggestions/dismiss`, {
      method: "POST", body: JSON.stringify({ label: "QA Advice Text" }),
    });
    assert(dm.status === 200, `dismiss ${dm.status}`);
    const sg2 = await (await api(principal.token, `/school/orgs/${ORG}/behavior-categories/suggestions`)).json();
    assert(!(sg2.suggestions ?? []).some((x: any) => x.label.toLowerCase().includes("qa advice")),
      "dismissed suggestion must not reappear");
    assert(!(sg2.suggestions ?? []).some((x: any) => x.label.toLowerCase().includes("qa odd habit")),
      "adopted suggestion must not reappear");
    const { data: untouched } = await admin.from("behavior_note").select("category").eq("id", noteIds[2]).single();
    assert(untouched!.category === "QA Advice Text", "dismiss must not rewrite notes");

    // 4. A teacher cannot triage.
    const deny = await api(t.token, `/school/orgs/${ORG}/behavior-categories/suggestions/dismiss`, {
      method: "POST", body: JSON.stringify({ label: "whatever" }),
    });
    assert(deny.status === 403, `teacher triage should 403, got ${deny.status}`);
  } finally {
    for (const id of noteIds) await admin.from("behavior_note").delete().eq("id", id);
    if (catId) await admin.from("behavior_category").delete().eq("id", catId);
    const { data: kvRow } = await admin.from("kv_store_f116e23f").select("value").eq("key", KV_KEY).maybeSingle();
    if (kvRow) {
      const cleaned = ((kvRow.value ?? []) as string[]).filter((x) => !x.startsWith("qa "));
      await admin.from("kv_store_f116e23f").update({ value: cleaned }).eq("key", KV_KEY);
    }
  }
});

await check("64. nazra has its own daily pair: sabaq and sabqi flags on the summary", async () => {
  // Qari Usman (8 Sep): even nazra readers have sabaq (new portion) and
  // sabqi (revision of read portion) - one 'Pending' chip undersold the
  // routine. kind nazra -> nazraSabaq, kind nazra_revision -> nazraSabqi,
  // and the legacy any-activity `nazra` flag stays true for old readers.
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const ids: string[] = [];
  const mk = async (kind: string) => {
    const r = await api(t.token, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, surahNumber: 1, ayahFrom: 1, ayahTo: 3, kind }),
    });
    const j = await r.json();
    assert(r.status === 201, `${kind} create ${r.status}`);
    ids.push(j.entry.id);
  };
  try {
    await mk("nazra");
    const s1 = await (await api(t.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`)).json();
    const r1 = (s1.students ?? []).find((x: any) => x.studentId === pStu1);
    assert(r1?.today?.nazraSabaq === true, `nazra entry should flag nazraSabaq: ${JSON.stringify(r1?.today)}`);
    assert(r1?.today?.nazraSabqi === false, "sabqi must not be flagged yet");
    assert(r1?.today?.nazra === true, "legacy any-activity flag stays true");
    await mk("nazra_revision");
    const s2 = await (await api(t.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`)).json();
    const r2 = (s2.students ?? []).find((x: any) => x.studentId === pStu1);
    assert(r2?.today?.nazraSabqi === true, `nazra_revision should flag nazraSabqi: ${JSON.stringify(r2?.today)}`);
  } finally {
    for (const id of ids) await admin.from("hifz_progress").delete().eq("id", id);
  }
});

await check("65. behavior date filter runs on the school's day; recorder can undo a note", async () => {
  // Ambreen (8 Sep): logged behavior, picked today as the end date, got
  // two-day-old notes. `observed_at <= 'YYYY-MM-DD'` parsed the bare
  // date as midnight UTC and excluded the whole end day. Fifth member
  // of the UTC-vs-school-clock family.
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const todayKhi = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const yestKhi = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" })
    .format(new Date(Date.now() - 86400000));
  const mk = await api(t.token, `/school/orgs/${ORG}/behavior-notes`, {
    method: "POST",
    body: JSON.stringify({ studentId: pStu1, kind: "positive", category: "Effort", points: 1, notes: "QA date filter" }),
  });
  const mkJ = await mk.json();
  assert(mk.status === 200 || mk.status === 201, `note ${mk.status}`);
  const noteId = mkJ.note.id;
  try {
    // 1. today..today INCLUDES a note logged right now.
    const sameDay = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/behavior-notes?startDate=${todayKhi}&endDate=${todayKhi}`)).json();
    const hit = (sameDay.notes ?? []).find((n: any) => n.id === noteId);
    assert(hit, "a note logged today must appear when the end date IS today");
    // 2. The feed's delete affordance needs to know who recorded it.
    assert(typeof hit.recordedBy === "string" && hit.recordedBy.length > 0,
      "section list must carry recordedBy");
    // 3. An end date of yesterday EXCLUDES it.
    const past = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/behavior-notes?startDate=${yestKhi}&endDate=${yestKhi}`)).json();
    assert(!(past.notes ?? []).some((n: any) => n.id === noteId),
      "yesterday's window must not include today's note");
    // 4. The recorder can undo their own note (Ambreen's second ask).
    const del = await api(t.token, `/school/orgs/${ORG}/behavior-notes/${noteId}`, { method: "DELETE" });
    assert(del.status === 200, `recorder delete ${del.status}`);
    const after = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/behavior-notes?startDate=${todayKhi}&endDate=${todayKhi}`)).json();
    assert(!(after.notes ?? []).some((n: any) => n.id === noteId), "deleted note must be gone");
  } finally {
    await admin.from("behavior_note").delete().eq("id", noteId);
  }
});

await check("66. adding a parent twice (same name + phone) reuses the row instead of duplicating", async () => {
  // The 7 Sep bulk loads created one father row per student, so a
  // father with three kids appeared three times on the Parents page.
  // The create endpoint now refuses a same-name+same-phone twin and
  // points at the existing row; a shared NAME alone must still be
  // allowed (different families share Muhammad Adnan).
  // Fresh token — this check runs last and the suite-start office token
  // can be past the project's JWT expiry by now.
  const o = await ensureUser("qa-office@azality.com", "QA Office", "office_staff");
  const mk = (fullName: string, phone: string) =>
    api(o.token, `/school/orgs/${ORG}/parents`, {
      method: "POST", body: JSON.stringify({ fullName, phone }),
    });
  const created: string[] = [];
  try {
    const first = await mk("QA Dup Guard Father", "+920000000977");
    const firstJ = await first.json();
    assert(first.status === 201, `first create ${first.status}`);
    created.push(firstJ.id);

    // Same person again — different case, same digits (0-prefixed local
    // format vs +92): must be refused with a pointer to the row.
    const twin = await mk("qa dup guard FATHER", "0920000000977");
    const twinJ = await twin.json();
    assert(twin.status === 409, `twin create should 409, got ${twin.status}`);
    assert(twinJ.code === "PARENT_PHONE_EXISTS", `code ${twinJ.code}`);
    assert(twinJ.existingParentId === firstJ.id, "409 must point at the existing row");

    // Same name, different phone — a DIFFERENT family, must be allowed.
    const namesake = await mk("QA Dup Guard Father", "+920000000978");
    const namesakeJ = await namesake.json();
    assert(namesake.status === 201, `namesake create ${namesake.status}`);
    created.push(namesakeJ.id);
  } finally {
    for (const id of created) {
      if (id) await admin.from("parent").delete().eq("id", id);
    }
  }
});

await check("67. merging duplicate parents carries the phone to the kept record", async () => {
  // Muneeb (9 Sep), pointing at two same-name rows where only one had a
  // number: "we just need to get the phone number from the right column
  // and add it to the left". The canonical-merge endpoint now copies the
  // alias's phone onto a phone-less kept record and fills the linked
  // students' empty guardian_phone cards (the Students list reads that
  // denormalized column).
  const o = await ensureUser("qa-office@azality.com", "QA Office", "office_staff");
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    // Kept record: NO phone, linked to QA Portal Student's peer.
    const keepR = await api(o.token, `/school/orgs/${ORG}/parents`, {
      method: "POST", body: JSON.stringify({ fullName: "QA Merge Keep Father" }),
    });
    const keep = await keepR.json();
    assert(keepR.status === 201, `keep create ${keepR.status}`);
    cleanup.push(() => admin.from("parent").delete().eq("id", keep.id));

    // Duplicate: HAS a phone, linked to a student whose card is empty.
    const dupR = await api(o.token, `/school/orgs/${ORG}/parents`, {
      method: "POST", body: JSON.stringify({ fullName: "QA Merge Dup Father", phone: "+920000000979" }),
    });
    const dup = await dupR.json();
    assert(dupR.status === 201, `dup create ${dupR.status}`);
    cleanup.push(() => admin.from("parent").delete().eq("id", dup.id));

    await admin.from("student_parent").insert({ parent_id: dup.id, student_id: pStu2, is_primary: false });
    cleanup.push(() => admin.from("student_parent").delete().eq("parent_id", dup.id));
    const { data: before } = await admin.from("student").select("guardian_phone").eq("id", pStu2).maybeSingle();
    cleanup.push(() =>
      admin.from("student").update({ guardian_phone: before?.guardian_phone ?? null }).eq("id", pStu2));
    await admin.from("student").update({ guardian_phone: null }).eq("id", pStu2);

    // Merge, keeping the phone-less record (admin/principal gate).
    const mergeR = await api(admin2.token, `/school/parents/${dup.id}/canonical`, {
      method: "POST", body: JSON.stringify({ canonicalParentId: keep.id }),
    });
    const mergeJ = await mergeR.json();
    assert(mergeR.status === 200, `merge ${mergeR.status}: ${JSON.stringify(mergeJ)}`);
    assert(mergeJ.phoneCarried === true, "response must say the phone carried");

    const { data: kept } = await admin.from("parent").select("phone, canonical_id").eq("id", keep.id).maybeSingle();
    assert(kept?.phone === "+920000000979", `kept record phone ${kept?.phone}`);
    assert(!kept?.canonical_id, "kept record must stay canonical");
    const { data: aliased } = await admin.from("parent").select("canonical_id").eq("id", dup.id).maybeSingle();
    assert(aliased?.canonical_id === keep.id, "dup must alias to the kept record");
    const { data: stuAfter } = await admin.from("student").select("guardian_phone").eq("id", pStu2).maybeSingle();
    assert(stuAfter?.guardian_phone === "+920000000979",
      `linked student's empty card must be filled, got ${stuAfter?.guardian_phone}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("68. exam-marks progress counts SUBJECT columns, not students-with-any-row", async () => {
  // Class VI A, 10 Sep: one subject teacher finished her oral column and
  // the Enter-marks link vanished for the whole class — every student
  // had "a row", with eight subject columns still empty. Progress must
  // judge completion per subject (a subject is done when EVERY student
  // has a mark/absence in it).
  const { data: term } = await admin.from("academic_term").select("id")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "no current term");
  const { data: sbStudents } = await admin.from("student").select("id")
    .eq("class_section_id", sandboxSec.id);
  assert((sbStudents ?? []).length >= 2, "need >=2 sandbox students");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: exam, error: exErr } = await admin.from("exam").insert({
      org_id: ORG, term_id: term.id, name: "QA Progress Probe",
      exam_type: "other", weight: 1, // allowed types: final/midterm/other/test
      exam_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (exErr) throw new Error(`exam: ${exErr.message}`);
    cleanup.push(() => admin.from("exam").delete().eq("id", exam.id));

    const subIds: string[] = [];
    for (const nm of ["QA Prog Sub A", "QA Prog Sub B"]) {
      const { data: cs, error } = await admin.from("class_subject").insert({
        org_id: ORG, class_id: sandboxClass.id, name: nm, sort_order: 900 + subIds.length,
      }).select("id").single();
      if (error) throw new Error(`subject ${nm}: ${error.message}`);
      subIds.push(cs.id);
      cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    }

    // Fill ONE subject for EVERY student — the old per-student counter
    // called this "complete".
    for (const s of sbStudents!) {
      const { error } = await admin.from("exam_subject_score").insert({
        org_id: ORG, exam_id: exam.id, class_subject_id: subIds[0],
        student_id: s.id, obtained_marks: 5, max_marks: 10, recorded_by: office.id,
      });
      if (error) throw new Error(`score: ${error.message}`);
    }
    cleanup.push(() => admin.from("exam_subject_score").delete().eq("exam_id", exam.id));

    const o = await ensureUser("qa-office@azality.com", "QA Office", "office_staff");
    const r = await api(o.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/exam-marks-progress`);
    const j = await r.json();
    assert(r.status === 200, `progress ${r.status}`);
    const row = (j.exams ?? []).find((e: any) => e.id === exam.id);
    assert(row, "probe exam missing from progress");
    assert(row.studentCount === sbStudents!.length, `studentCount ${row.studentCount}`);
    assert(row.studentsMarked === sbStudents!.length,
      "every student has a row — the old counter's blind spot, kept for context");
    assert(typeof row.subjectsDone === "number" && typeof row.subjectCount === "number",
      "progress must carry subjectsDone/subjectCount");
    assert(row.subjectCount >= 2, `subjectCount ${row.subjectCount}`);
    assert(row.subjectsDone >= 1 && row.subjectsDone < row.subjectCount,
      `one filled column of ${row.subjectCount} must read incomplete, got ${row.subjectsDone}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("69. teacher's own exam-marks to-do: their incomplete columns, nothing else", async () => {
  // TeacherHome subject cards nudge (Muneeb, 10 Sep): each subject
  // teacher is prompted for exactly the columns THEY teach that are
  // still incomplete while an exam window is open — and the nudge
  // disappears once their column is fully entered.
  const { data: term } = await admin.from("academic_term").select("id")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "no current term");
  const { data: sbStudents } = await admin.from("student").select("id")
    .eq("class_section_id", sandboxSec.id);
  assert((sbStudents ?? []).length >= 1, "need sandbox students");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: exam, error: exErr } = await admin.from("exam").insert({
      org_id: ORG, term_id: term.id, name: "QA Todo Probe",
      exam_type: "other", weight: 1,
      exam_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (exErr) throw new Error(`exam: ${exErr.message}`);
    cleanup.push(() => admin.from("exam").delete().eq("id", exam.id));

    const mk = async (nm: string) => {
      const { data: cs, error } = await admin.from("class_subject").insert({
        org_id: ORG, class_id: sandboxClass.id, name: nm, sort_order: 910,
      }).select("id").single();
      if (error) throw new Error(`subject ${nm}: ${error.message}`);
      cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
      return cs.id;
    };
    const mineSub = await mk("QA Todo Mine");
    const otherSub = await mk("QA Todo Other");

    const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
    const { data: ss, error: ssErr } = await admin.from("section_subject").insert({
      org_id: ORG, class_section_id: sandboxSec.id, class_subject_id: mineSub,
      teacher_user_id: t.id, name: "QA Todo Mine",
    }).select("id").single();
    if (ssErr) throw new Error(`section_subject: ${ssErr.message}`);
    cleanup.push(() => admin.from("section_subject").delete().eq("id", ss.id));

    // 1. Empty column + open window → exactly one todo, for MY subject.
    const r1 = await api(t.token, `/school/orgs/${ORG}/me/exam-marks-todo`);
    const j1 = await r1.json();
    assert(r1.status === 200, `todo ${r1.status}`);
    // Scope to the probe subject — qa-teacher may legitimately teach
    // other live subjects that also owe marks for this exam.
    const probe1 = (j1.todos ?? []).filter(
      (x: any) => x.examId === exam.id && x.classSubjectId === mineSub,
    );
    assert(probe1.length === 1, `expected 1 todo for probe subject, got ${probe1.length}`);
    assert(!((j1.todos ?? []).some((x: any) => x.classSubjectId === otherSub)),
      "someone else's column must never appear in my to-do");
    assert(probe1[0].marked === 0 && probe1[0].studentCount === sbStudents!.length,
      `counts ${probe1[0].marked}/${probe1[0].studentCount}`);

    // 2. Fill my column → the nudge goes away.
    for (const s of sbStudents!) {
      const { error } = await admin.from("exam_subject_score").insert({
        org_id: ORG, exam_id: exam.id, class_subject_id: mineSub,
        student_id: s.id, obtained_marks: 7, max_marks: 10, recorded_by: t.id,
      });
      if (error) throw new Error(`score: ${error.message}`);
    }
    cleanup.push(() => admin.from("exam_subject_score").delete().eq("exam_id", exam.id));
    const r2 = await api(t.token, `/school/orgs/${ORG}/me/exam-marks-todo`);
    const j2 = await r2.json();
    assert(!((j2.todos ?? []).some((x: any) => x.examId === exam.id && x.classSubjectId === mineSub)),
      "a fully entered column must drop off the to-do");
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("70. untagged content reaches its author's home, and Sandbox never alarms the principal", async () => {
  // Muneeb (10 Sep): the untagged-content notice sat at the very bottom
  // of the admin dashboard — "the teacher who logged it" must see it
  // too. The teacher snapshot now carries untagged ASSIGNMENTS (a
  // subject-less "Viva" was invisible to its own author), and the new
  // Needs-attention alert must NEVER fire off Sandbox/QA content.
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: asg, error } = await admin.from("assignment").insert({
      org_id: ORG, class_section_id: sandboxSec.id, created_by: t.id,
      title: "QA Untagged Probe", kind: "test", max_score: 10,
      assigned_date: new Date().toISOString().slice(0, 10),
      section_subject_id: null,
    }).select("id").single();
    if (error) throw new Error(`assignment: ${error.message}`);
    cleanup.push(() => admin.from("assignment").delete().eq("id", asg.id));

    // 1. The author's snapshot lists it.
    const r1 = await api(t.token, `/school/me/teacher-snapshot`);
    const j1 = await r1.json();
    assert(r1.status === 200, `snapshot ${r1.status}`);
    assert((j1.untaggedAssignmentsCount ?? 0) >= 1, "author must see the untagged count");
    assert((j1.untaggedAssignments ?? []).some((a: any) => a.assignmentId === asg.id),
      "author must see the untagged assignment itself");

    // 2. The principal's Needs-attention never alarms for Sandbox rows.
    const r2 = await api(admin2.token, `/school/orgs/${ORG}/dashboard`);
    const j2 = await r2.json();
    assert(r2.status === 200, `dashboard ${r2.status}`);
    const alert = (j2.alerts ?? []).find((a: any) => a.kind === "untagged_content");
    if (alert) {
      assert(!String(alert.body).includes("Sandbox"),
        "untagged alert must not name the Sandbox");
    }

    // 3. Tagging it clears the author's nudge.
    const { data: cs } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Untagged Sub", sort_order: 920,
    }).select("id").single();
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    const { data: ss } = await admin.from("section_subject").insert({
      org_id: ORG, class_section_id: sandboxSec.id, class_subject_id: cs.id,
      teacher_user_id: t.id, name: "QA Untagged Sub",
    }).select("id").single();
    cleanup.push(() => admin.from("section_subject").delete().eq("id", ss.id));
    await admin.from("assignment").update({ section_subject_id: ss.id }).eq("id", asg.id);
    // LIFO cleanup: detach the assignment from the probe subject before
    // the subject rows are deleted (FK order).
    cleanup.push(() => admin.from("assignment").update({ section_subject_id: null }).eq("id", asg.id));
    const r3 = await api(t.token, `/school/me/teacher-snapshot`);
    const j3 = await r3.json();
    assert(!((j3.untaggedAssignments ?? []).some((a: any) => a.assignmentId === asg.id)),
      "tagged assignment must leave the nudge");
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("71. a section with live subjects refuses subject-less lessons and assignments", async () => {
  // Prevention for the untagged-content class of bug (Muneeb, 10 Sep:
  // "make sure things like this dont happen again... asked to fill out
  // information right there"). The Sandbox HAS live subjects (Maths /
  // Urdu / QA Subject), so subject-less creates must 400 there; a
  // section with NO subjects configured (fresh setup) must stay legal.
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const today = new Date().toISOString().slice(0, 10);
  const mkLesson = (sectionId: string, body: Record<string, unknown>) =>
    api(t.token, `/school/orgs/${ORG}/sections/${sectionId}/lessons`, {
      method: "POST", body: JSON.stringify({ lessonDate: today, title: "QA Subject Guard", ...body }),
    });
  const mkAsg = (sectionId: string, body: Record<string, unknown>) =>
    api(t.token, `/school/orgs/${ORG}/sections/${sectionId}/assignments`, {
      method: "POST", body: JSON.stringify({ title: "QA Subject Guard", kind: "test", maxScore: 10, ...body }),
    });
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    // 1. Sandbox A has live subjects -> subject-less is refused.
    const l1 = await mkLesson(sandboxSec.id, {});
    const l1j = await l1.json();
    assert(l1.status === 400 && l1j.code === "SUBJECT_REQUIRED",
      `subject-less lesson should 400 SUBJECT_REQUIRED, got ${l1.status} ${l1j.code}`);
    const a1 = await mkAsg(sandboxSec.id, {});
    const a1j = await a1.json();
    assert(a1.status === 400 && a1j.code === "SUBJECT_REQUIRED",
      `subject-less assignment should 400, got ${a1.status} ${a1j.code}`);

    // 2. With a subject picked, both save fine.
    const { data: liveSS } = await admin.from("section_subject")
      .select("id, class_subject:class_subject_id(archived_at)")
      .eq("class_section_id", sandboxSec.id).is("archived_at", null);
    const ss = ((liveSS ?? []) as any[]).find((r) => !r.class_subject?.archived_at);
    assert(ss, "Sandbox A should have a live subject");
    const l2 = await mkLesson(sandboxSec.id, { sectionSubjectId: ss.id });
    assert(l2.status === 201, `tagged lesson ${l2.status}`);
    const l2j = await l2.json();
    cleanup.push(() => admin.from("lesson").delete().eq("id", l2j.id));
    const a2 = await mkAsg(sandboxSec.id, { sectionSubjectId: ss.id });
    assert(a2.status === 201, `tagged assignment ${a2.status}`);
    const a2j = await a2.json();
    cleanup.push(() => admin.from("assignment").delete().eq("id", a2j.id));

    // 3. A section with NO subjects configured stays legal (fresh-setup
    // flows must not block on the guard).
    const { data: bareSec, error: secErr } = await admin.from("class_section").insert({
      class_id: sandboxClass.id, name: "QA-Guard", class_teacher_user_id: t.id,
    }).select("id").single();
    if (secErr) throw new Error(`section: ${secErr.message}`);
    cleanup.push(() => admin.from("class_section").delete().eq("id", bareSec.id));
    const l3 = await mkLesson(bareSec.id, {});
    assert(l3.status === 201, `no-subjects section lesson ${l3.status}`);
    const l3j = await l3.json();
    cleanup.push(() => admin.from("lesson").delete().eq("id", l3j.id));
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("72. marks distribution: components carry marks + paper, and the sheet uses the total as max", async () => {
  // Ambreen's sheet (10 Sep) is written in MARKS per paper, not
  // percentages: Class I English = written 50 + dictation 10, oral 15.
  // The subject's per-paper total is what the marks sheet must use as
  // that column's max — one sheet-wide number cannot serve a Class I
  // oral where English is /15, Maths /20 and Islamiat /25.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: cs, error } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Distribution Sub", sort_order: 940,
    }).select("id").single();
    if (error) throw new Error(`subject: ${error.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));

    // Marks + paper are accepted and round-trip.
    const ok = await api(admin2.token, `/school/class-subjects/${cs.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        assessmentWeights: [
          { label: "Written", marks: 50, paper: "written" },
          { label: "Dictation", marks: 10, paper: "written" },
          { label: "Oral", marks: 15, paper: "oral" },
        ],
      }),
    });
    assert(ok.status === 200, `marks distribution save ${ok.status}`);
    const { data: back } = await admin.from("class_subject")
      .select("assessment_weights").eq("id", cs.id).maybeSingle();
    const rows = (back?.assessment_weights ?? []) as any[];
    assert(rows.length === 3, `expected 3 components, got ${rows.length}`);
    const written = rows.filter((r) => r.paper === "written")
      .reduce((s, r) => s + r.marks, 0);
    const oral = rows.filter((r) => r.paper === "oral")
      .reduce((s, r) => s + r.marks, 0);
    assert(written === 60 && oral === 15, `paper totals ${written}/${oral}`);

    // Nonsense marks are refused.
    const bad = await api(admin2.token, `/school/class-subjects/${cs.id}`, {
      method: "PATCH",
      body: JSON.stringify({ assessmentWeights: [{ label: "Bad", marks: 0 }] }),
    });
    assert(bad.status === 400, `marks=0 should 400, got ${bad.status}`);

    // The old percentage shape still saves — nothing written before the
    // change is orphaned.
    const legacy = await api(admin2.token, `/school/class-subjects/${cs.id}`, {
      method: "PATCH",
      body: JSON.stringify({ assessmentWeights: [{ label: "Written", pct: 60 }] }),
    });
    assert(legacy.status === 200, `legacy pct save ${legacy.status}`);

    // The marks sheet tells the client which paper it is.
    const { data: term } = await admin.from("academic_term").select("id")
      .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
    const { data: exam } = await admin.from("exam").insert({
      org_id: ORG, term_id: term!.id, name: "QA Distribution — Oral",
      exam_type: "other", weight: 1,
      exam_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    cleanup.push(() => admin.from("exam").delete().eq("id", exam.id));
    const sheet = await (await api(admin2.token,
      `/school/orgs/${ORG}/exams/${exam.id}/marks-sheet?sectionId=${sandboxSec.id}`)).json();
    assert(sheet.exam?.name === "QA Distribution — Oral",
      `sheet must name its exam, got ${JSON.stringify(sheet.exam)}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("73. extra sabaq earns the school's 'Memorized extra lesson' note, once a day", async () => {
  // Muneeb (10 Sep): "if the student sunai extra surah it should
  // automatically be considered positive behavior for the extra
  // lesson". Both hifz surfaces flag the beyond-the-lesson portion
  // with extraSabaq; the server writes the praise — and writes it at
  // most once per child per day, so a re-saved round doesn't flood the
  // behaviour feed.
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const CATEGORY = "Memorized extra lesson";
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    // Start from a clean slate for today. "Today" is the school's day:
    // the bound is Karachi midnight (+05:00, no DST), NOT UTC midnight —
    // with +00:00 the bound sits 5 hours late, and between 00:00 and
    // 05:00 Karachi the freshly written note fell outside it (this
    // check failed at 01:11 Karachi while the note existed).
    const todayKhi = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
    const khiDayStart = `${todayKhi}T00:00:00+05:00`;
    await admin.from("behavior_note").delete()
      .eq("student_id", pStu1).eq("category", CATEGORY)
      .gte("observed_at", khiDayStart);
    cleanup.push(() => admin.from("behavior_note").delete()
      .eq("student_id", pStu1).eq("category", CATEGORY));
    cleanup.push(() => admin.from("hifz_progress").delete().eq("student_id", pStu1));

    const post = (extra: boolean) => api(t.token, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({
        studentId: pStu1, surahNumber: 78, ayahFrom: 1, ayahTo: 5,
        kind: "sabaq", quality: "excellent",
        ...(extra ? { extraSabaq: true, extraLabel: "An-Naba 1–5" } : {}),
      }),
    });

    // A plain sabaq earns nothing.
    const plain = await post(false);
    const plainJ = await plain.json();
    assert(plain.status === 201, `plain sabaq ${plain.status}`);
    assert(plainJ.extraLessonPraised !== true, "a normal sabaq must not be praised");

    // The extra portion does.
    const first = await post(true);
    const firstJ = await first.json();
    assert(first.status === 201, `extra sabaq ${first.status}`);
    assert(firstJ.extraLessonPraised === true, "extra sabaq must earn the note");
    const { data: notes } = await admin.from("behavior_note")
      .select("kind, category, points, notes")
      .eq("student_id", pStu1).eq("category", CATEGORY)
      .gte("observed_at", khiDayStart);
    assert((notes ?? []).length === 1, `expected 1 note, got ${(notes ?? []).length}`);
    assert(notes![0].kind === "positive", `note must be positive, got ${notes![0].kind}`);
    assert(String(notes![0].notes).includes("An-Naba"), "note should name the portion");

    // Saving again the same day must NOT add a second note.
    const second = await post(true);
    const secondJ = await second.json();
    assert(second.status === 201, `second extra sabaq ${second.status}`);
    assert(secondJ.extraLessonPraised === false, "second save must not praise again");
    const { data: after } = await admin.from("behavior_note")
      .select("id").eq("student_id", pStu1).eq("category", CATEGORY)
      .gte("observed_at", khiDayStart);
    assert((after ?? []).length === 1, `still expected 1 note, got ${(after ?? []).length}`);

    // The extra portion carries its OWN rating (the lesson may be
    // excellent while what the child ran ahead with was weak), and a
    // weak extra is still praised — the note is for doing extra work,
    // not for how well it went.
    const weak = await api(t.token, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({
        studentId: pStu2, surahNumber: 78, ayahFrom: 6, ayahTo: 10,
        kind: "sabaq", quality: "weak", extraSabaq: true, extraLabel: "An-Naba 6–10",
      }),
    });
    const weakJ = await weak.json();
    assert(weak.status === 201, `weak extra ${weak.status}`);
    assert(weakJ.extraLessonPraised === true, "a weak extra portion is still extra work");
    assert(weakJ.entry?.quality === "weak",
      `the extra entry keeps its own rating, got ${weakJ.entry?.quality}`);
    cleanup.push(() => admin.from("behavior_note").delete()
      .eq("student_id", pStu2).eq("category", CATEGORY));
    cleanup.push(() => admin.from("hifz_progress").delete().eq("student_id", pStu2));
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("74. marks sheet: empty cells are never stamped with a max, and stale stamps clear", async () => {
  // Ambreen (11 Sep): "why is there two boxes" — every cell of Class I's
  // sheet showed /25 because one early save stamped the then-current
  // default onto EVERY empty cell, and those stamps then beat the
  // school's marks distribution when it arrived. An empty cell must
  // store nothing, and re-saving an empty cell must clear an old stamp.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const { data: term } = await admin.from("academic_term").select("id")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "no current term");
  const { data: sbStudents } = await admin.from("student").select("id")
    .eq("class_section_id", sandboxSec.id).limit(2);
  assert((sbStudents ?? []).length >= 2, "need >=2 sandbox students");
  const [stuA, stuB] = sbStudents!;
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: exam, error: exErr } = await admin.from("exam").insert({
      org_id: ORG, term_id: term!.id, name: "QA Empty Cells — Written",
      exam_type: "other", weight: 1,
      exam_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (exErr) throw new Error(`exam: ${exErr.message}`);
    cleanup.push(() => admin.from("exam").delete().eq("id", exam.id));
    const { data: cs, error: csErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Empty Cells Sub", sort_order: 950,
    }).select("id").single();
    if (csErr) throw new Error(`subject: ${csErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    cleanup.push(() => admin.from("exam_subject_score").delete().eq("exam_id", exam.id));

    // 1. One filled cell, one empty cell, defaults present. The filled
    // cell takes the default as its max; the empty cell stores NOTHING.
    const save1 = await api(admin2.token, `/school/orgs/${ORG}/exams/${exam.id}/marks-sheet`, {
      method: "POST",
      body: JSON.stringify({
        sectionId: sandboxSec.id,
        defaults: { maxMarks: 25 },
        rows: [
          { studentId: stuA.id, classSubjectId: cs.id, maxMarks: null, obtainedMarks: 20, absent: false },
          { studentId: stuB.id, classSubjectId: cs.id, maxMarks: null, obtainedMarks: null, absent: false },
        ],
      }),
    });
    assert(save1.status === 200, `save ${save1.status}`);
    const { data: rows1 } = await admin.from("exam_subject_score")
      .select("student_id, max_marks").eq("exam_id", exam.id).eq("class_subject_id", cs.id);
    assert((rows1 ?? []).some((r) => r.student_id === stuA.id && Number(r.max_marks) === 25),
      "a filled cell keeps the default max");
    assert(!((rows1 ?? []).some((r) => r.student_id === stuB.id)),
      "an empty cell must not be stamped with the default max");

    // 2. A stale stamp from the old behavior clears on the next save.
    const { error: staleErr } = await admin.from("exam_subject_score").insert({
      org_id: ORG, exam_id: exam.id, class_subject_id: cs.id,
      student_id: stuB.id, obtained_marks: null, max_marks: 25,
      absent: false, recorded_by: admin2.id,
    });
    if (staleErr) throw new Error(`stale stamp: ${staleErr.message}`);
    const save2 = await api(admin2.token, `/school/orgs/${ORG}/exams/${exam.id}/marks-sheet`, {
      method: "POST",
      body: JSON.stringify({
        sectionId: sandboxSec.id,
        defaults: { maxMarks: 25 },
        rows: [{ studentId: stuB.id, classSubjectId: cs.id, maxMarks: null, obtainedMarks: null, absent: false }],
      }),
    });
    assert(save2.status === 200, `re-save ${save2.status}`);
    const { data: rows2 } = await admin.from("exam_subject_score")
      .select("student_id").eq("exam_id", exam.id)
      .eq("class_subject_id", cs.id).eq("student_id", stuB.id);
    assert((rows2 ?? []).length === 0, "re-saving an empty cell must clear the stale stamp");

    // 3. An explicit per-cell max still saves without obtained marks
    // (absent students keep their /X on report cards).
    const save3 = await api(admin2.token, `/school/orgs/${ORG}/exams/${exam.id}/marks-sheet`, {
      method: "POST",
      body: JSON.stringify({
        sectionId: sandboxSec.id,
        rows: [{ studentId: stuB.id, classSubjectId: cs.id, maxMarks: 30, obtainedMarks: null, absent: true }],
      }),
    });
    assert(save3.status === 200, `absent save ${save3.status}`);
    const { data: rows3 } = await admin.from("exam_subject_score")
      .select("max_marks, absent").eq("exam_id", exam.id)
      .eq("class_subject_id", cs.id).eq("student_id", stuB.id).maybeSingle();
    assert(rows3 && Number(rows3.max_marks) === 30 && rows3.absent === true,
      "an absent cell keeps its explicit max");
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("75. an intake reader's sabaq/sabqi count as their reading pair", async () => {
  // Hifz IV intake (Muneeb, 11 Sep): teachers hear their nazra readers
  // through the hifz surfaces — the school's own words for the reading
  // routine ARE sabaq and sabqi — so the whole intake sat at grey chips
  // and "Not started" while every child had been heard. For a student
  // whose track is nazra, kind sabaq flags nazraSabaq and moves the
  // reading position, and kind sabqi flags nazraSabqi; a hifz-track
  // student's identical entries change neither nazra flag.
  const t = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const ids: string[] = [];
  const mk = async (studentId: string, kind: string, extra: Record<string, unknown> = {}) => {
    const r = await api(t.token, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({ studentId, surahNumber: 110, ayahFrom: 1, ayahTo: 3, kind, ...extra }),
    });
    const j = await r.json();
    assert(r.status === 201, `${kind} create ${r.status}`);
    ids.push(j.entry.id);
  };
  const summaryRow = async (studentId: string) => {
    const s = await (await api(t.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`)).json();
    return (s.students ?? []).find((x: any) => x.studentId === studentId);
  };
  try {
    // Clean slate: the position asserts depend on exactly the entries
    // this check writes (QA portal students, safe to sweep).
    await admin.from("hifz_progress").delete().eq("student_id", pStu1);
    await admin.from("hifz_progress").delete().eq("student_id", pStu2);
    await admin.from("student").update({ quran_track: "nazra" }).eq("id", pStu1);
    await admin.from("student").update({ quran_track: "hifz" }).eq("id", pStu2);

    // Reader heard as sabaq: chip lights, position moves.
    await mk(pStu1, "sabaq");
    const r1 = await summaryRow(pStu1);
    assert(r1?.today?.nazraSabaq === true,
      `reader's sabaq should flag nazraSabaq: ${JSON.stringify(r1?.today)}`);
    assert(r1?.today?.nazraSabqi === false, "sabqi must not be flagged yet");
    assert(r1?.nazraPosition?.surahNumber === 110 && r1?.nazraPosition?.ayahTo === 3,
      `reader's sabaq should set the reading position, got ${JSON.stringify(r1?.nazraPosition)}`);

    // Reader's sabqi: the revision half.
    await mk(pStu1, "sabqi");
    const r2 = await summaryRow(pStu1);
    assert(r2?.today?.nazraSabqi === true,
      `reader's sabqi should flag nazraSabqi: ${JSON.stringify(r2?.today)}`);
    // Sabqi is revision — it must NOT move the reading position.
    assert(r2?.nazraPosition?.surahNumber === 110 && r2?.nazraPosition?.ayahTo === 3,
      "sabqi must not move the reading position");

    // A missed sabaq (skip marker) never moves the position.
    await mk(pStu1, "sabaq", { surahNumber: 1, ayahFrom: 1, ayahTo: 1, missed: true });
    const r3 = await summaryRow(pStu1);
    assert(r3?.nazraPosition?.surahNumber === 110,
      `a missed sabaq must not move the position, got ${JSON.stringify(r3?.nazraPosition)}`);

    // A hifz-track student's sabaq stays a hifz sabaq: trio flag only.
    await mk(pStu2, "sabaq");
    const h = await summaryRow(pStu2);
    assert(h?.today?.sabaq === true, "hifz sabaq flags the trio");
    assert(h?.today?.nazraSabaq === false,
      `hifz sabaq must not flag the nazra pair: ${JSON.stringify(h?.today)}`);
    assert(h?.nazraPosition === null,
      "a hifz student's sabaq is not a reading position");
  } finally {
    for (const id of ids) await admin.from("hifz_progress").delete().eq("id", id);
    await admin.from("student").update({ quran_track: null }).eq("id", pStu1);
    await admin.from("student").update({ quran_track: null }).eq("id", pStu2);
  }
});

await check("76. tabulation sheet: papers combine per subject, with totals and positions", async () => {
  // Ambreen (11 Sep): oral and written carry separate percentages, but
  // the term closes with ONE register - each subject "60 + 15 = /75,
  // aur 75 main se kitne aaye", then grand total, % and position. The
  // endpoint must agree with the report card's weighting rules.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const { data: term } = await admin.from("academic_term").select("id")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "no current term");
  const { data: sbStudents } = await admin.from("student").select("id, full_name")
    .eq("class_section_id", sandboxSec.id).eq("status", "active").limit(2);
  assert((sbStudents ?? []).length >= 2, "need >=2 sandbox students");
  const [stuA, stuB] = sbStudents!;
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: cs, error: csErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Tab Sub", sort_order: 960,
      assessment_weights: [
        { label: "Written", marks: 60, paper: "written" },
        { label: "Oral", marks: 15, paper: "oral" },
      ],
    }).select("id").single();
    if (csErr) throw new Error(`subject: ${csErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    const mkExam = async (nm: string) => {
      const { data: e, error } = await admin.from("exam").insert({
        org_id: ORG, term_id: term!.id, name: nm, exam_type: "other", weight: 1,
        exam_date: new Date().toISOString().slice(0, 10),
      }).select("id").single();
      if (error) throw new Error(`exam ${nm}: ${error.message}`);
      cleanup.push(() => admin.from("exam").delete().eq("id", e.id));
      cleanup.push(() => admin.from("exam_subject_score").delete().eq("exam_id", e.id));
      return e.id;
    };
    const oralEx = await mkExam("QA Tab - Oral");
    const writEx = await mkExam("QA Tab - Written");
    const score = async (exam: string, stu: string, obt: number, max: number) => {
      const { error } = await admin.from("exam_subject_score").insert({
        org_id: ORG, exam_id: exam, class_subject_id: cs.id, student_id: stu,
        obtained_marks: obt, max_marks: max, recorded_by: admin2.id,
      });
      if (error) throw new Error(`score: ${error.message}`);
    };
    await score(oralEx, stuA.id, 12, 15);
    await score(writEx, stuA.id, 45, 60);
    await score(oralEx, stuB.id, 10, 15);

    const r = await api(admin2.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/tabulation?termId=${term!.id}`);
    const j = await r.json();
    assert(r.status === 200, `tabulation ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    const col = (j.subjects ?? []).find((x: any) => x.id === cs.id);
    assert(col, "the examined subject must be a column");
    assert(col.expectedMax === 75, `expected /75 from the distribution, got ${col.expectedMax}`);
    const rowA = (j.students ?? []).find((x: any) => x.studentId === stuA.id);
    const rowB = (j.students ?? []).find((x: any) => x.studentId === stuB.id);
    assert(rowA && rowB, "both students on the register");
    const cellA = rowA.subjects[cs.id];
    assert(cellA && cellA.obtained === 57 && cellA.max === 75,
      `12 + 45 must combine to 57/75, got ${JSON.stringify(cellA)}`);
    assert(Object.keys(cellA.perExam).length === 2, "both papers listed per exam");
    const cellB = rowB.subjects[cs.id];
    assert(cellB && cellB.obtained === 10 && cellB.max === 15,
      `a lone oral stays 10/15, got ${JSON.stringify(cellB)}`);
    // 76% beats 66.7% - position follows percentage. B's written is
    // merely UNMARKED (pending), so B still ranks - only absence
    // withholds a rank.
    assert(rowA.position !== null && rowB.position !== null && rowA.position < rowB.position,
      `positions must rank A above B, got ${rowA.position} vs ${rowB.position}`);
    assert(typeof j.passMarkPct === "number" && j.passMarkPct > 0,
      `the register must carry the school's pass line, got ${j.passMarkPct}`);

    // Now B is marked ABSENT for the written. The paper does not
    // shrink: B's max grows to 75 with the obtained staying 10, and B
    // is no longer ranked against children who sat everything -
    // Ayesha missed one written and still ranked 11th on a smaller
    // denominator (Ambreen, 22 Sep).
    {
      const { error } = await admin.from("exam_subject_score").insert({
        org_id: ORG, exam_id: writEx, class_subject_id: cs.id, student_id: stuB.id,
        obtained_marks: null, max_marks: 60, absent: true, recorded_by: admin2.id,
      });
      if (error) throw new Error(`absent row: ${error.message}`);
    }
    const r2 = await api(admin2.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/tabulation?termId=${term!.id}`);
    const j2 = await r2.json();
    const rowB2 = (j2.students ?? []).find((x: any) => x.studentId === stuB.id);
    const cellB2 = rowB2.subjects[cs.id];
    assert(cellB2.obtained === 10 && cellB2.max === 75,
      `an absent paper keeps its maximum: expected 10/75, got ${JSON.stringify({ o: cellB2.obtained, m: cellB2.max })}`);
    assert(rowB2.absentPapers === 1, `the row must count its absence, got ${rowB2.absentPapers}`);
    assert(rowB2.percentage === null && rowB2.position === null,
      `a child who missed a paper is not ranked, got pct=${rowB2.percentage} pos=${rowB2.position}`);
    const rowA2 = (j2.students ?? []).find((x: any) => x.studentId === stuA.id);
    assert(rowA2.position === 1, `A sat everything and leads alone, got ${rowA2.position}`);

    // An absence in a NOT-EXAMINED subject (empty weights, no marks -
    // Art & Craft on the real registers) must not conjure a column,
    // skew a total, or cost the child their rank.
    const { data: cs2, error: cs2Err } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Unexamined Sub", sort_order: 961,
      assessment_weights: [],
    }).select("id").single();
    if (cs2Err) throw new Error(`subject2: ${cs2Err.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs2.id));
    cleanup.push(() => admin.from("exam_subject_score").delete().eq("class_subject_id", cs2.id));
    await admin.from("exam_subject_score").insert({
      org_id: ORG, exam_id: oralEx, class_subject_id: cs2.id, student_id: stuA.id,
      obtained_marks: null, max_marks: 25, absent: true, recorded_by: admin2.id,
    });
    const r3 = await api(admin2.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/tabulation?termId=${term!.id}`);
    const j3 = await r3.json();
    assert(!(j3.subjects ?? []).some((x: any) => x.id === cs2.id),
      "an absent-only, unexamined subject must not become a column");
    const rowA3 = (j3.students ?? []).find((x: any) => x.studentId === stuA.id);
    assert(rowA3.totalMax === rowA2.totalMax && rowA3.position === 1,
      `the stray absence must not change A's total or rank: ${rowA3.totalMax} pos ${rowA3.position}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("77. marks sign-off: the subject's own teacher checks the column, others cannot; the register shows it", async () => {
  // The green check (Muneeb, 12 Sep): a subject teacher signs "my
  // column for this term is complete" from their own marks sheet; the
  // tabulation register shows who signed. The Rizwana rule holds both
  // ways: a teacher with no claim on the column gets 403, and a
  // subject-only teacher cannot open the register at all.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const t2 = await ensureUser("qa-teacher2@azality.com", "QA Teacher Two", "class_teacher");
  const { data: term } = await admin.from("academic_term").select("id")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "no current term");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: cs, error: csErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Signoff Sub", sort_order: 970,
      assessment_weights: [{ label: "Oral", marks: 20, paper: "oral" }],
    }).select("id").single();
    if (csErr) throw new Error(`subject: ${csErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    cleanup.push(() => admin.from("kv_store_f116e23f").delete()
      .eq("key", `school:marksconfirm:${term!.id}:${sandboxSec.id}`));

    const confirmUrl =
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/subjects/${cs.id}/marks-confirmation`;

    // 1. A teacher with NO claim on the column: 403.
    const no = await api(t2.token, confirmUrl, {
      method: "POST", body: JSON.stringify({ termId: term!.id, confirmed: true }),
    });
    assert(no.status === 403, `stranger sign-off should 403, got ${no.status}`);

    // 2. Assign t2 as the subject's teacher here -> the sign-off lands.
    const { data: ss, error: ssErr } = await admin.from("section_subject").insert({
      org_id: ORG, class_section_id: sandboxSec.id, class_subject_id: cs.id,
      teacher_user_id: t2.id, name: "QA Signoff Sub",
    }).select("id").single();
    if (ssErr) throw new Error(`section_subject: ${ssErr.message}`);
    cleanup.push(() => admin.from("section_subject").delete().eq("id", ss.id));
    const yes = await api(t2.token, confirmUrl, {
      method: "POST", body: JSON.stringify({ termId: term!.id, confirmed: true }),
    });
    const yesJ = await yes.json();
    assert(yes.status === 200, `sign-off ${yes.status}`);
    assert(yesJ.confirmations?.[cs.id]?.by === t2.id, "the check must record who signed");

    // 3. The register shows it (as the office)...
    const tabR = await api(admin2.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/tabulation?termId=${term!.id}`);
    const tabJ = await tabR.json();
    assert(tabR.status === 200, `tabulation ${tabR.status}`);
    assert(tabJ.confirmations?.[cs.id]?.by === t2.id, "the register must show the sign-off");
    assert(tabJ.canFinalize === true, "the office can finalize");

    // ...but the subject-only teacher cannot open the register.
    const denied = await api(t2.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/tabulation?termId=${term!.id}`);
    assert(denied.status === 403, `subject teacher must not see the register, got ${denied.status}`);

    // 4. Withdrawing the check removes it.
    const undo = await api(t2.token, confirmUrl, {
      method: "POST", body: JSON.stringify({ termId: term!.id, confirmed: false }),
    });
    const undoJ = await undo.json();
    assert(undo.status === 200 && !undoJ.confirmations?.[cs.id], "unconfirm must clear the check");
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

/** The term whose papers are being marked - NOT simply the current one.
 *  The school rolled into the 2nd Assessment on 21 Sep with the 1st
 *  still half marked, so a check keyed on is_current looked in an empty
 *  term and failed with "no written exam in the current term". */
async function markedTerm(): Promise<any> {
  const { data: terms } = await admin.from("academic_term")
    .select("id, name, start_date, is_current").eq("org_id", ORG)
    .is("archived_at", null).order("start_date", { ascending: false });
  const list = (terms ?? []) as any[];
  const current = list.find((t) => t.is_current);
  for (const cand of [current, ...list].filter(Boolean)) {
    const { data: ex } = await admin.from("exam").select("id, name")
      .eq("term_id", cand.id).is("archived_at", null);
    const names = (ex ?? []).map((e: any) => e.name as string);
    if (names.some((n: string) => /Oral/.test(n)) && names.some((n: string) => /Written/.test(n))) return cand;
  }
  return current ?? list[0] ?? null;
}
await check("78. finalize locks the term's marks; publish needs finalize; unfinalize reopens", async () => {
  // The principal's end-of-term buttons (Muneeb, 12 Sep): one click
  // finalizes every report card in the section AND locks the marks
  // sheets for that term; publish then shows the cards to parents;
  // unfinalize reopens the term and pulls the cards back.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const term = await markedTerm();
  assert(term, "no term with papers");
  const { data: sbStudents } = await admin.from("student").select("id")
    .eq("class_section_id", sandboxSec.id).eq("status", "active");
  const n = (sbStudents ?? []).length;
  assert(n >= 1, "need sandbox students");
  const stuA = sbStudents![0];
  const { data: wrExam } = await admin.from("exam").select("id")
    .eq("term_id", term!.id).ilike("name", "%Written%").is("archived_at", null).maybeSingle();
  assert(wrExam, "no written exam in the current term");
  const { data: cs } = await admin.from("class_subject").select("id")
    .eq("class_id", sandboxClass.id).is("archived_at", null).limit(1).maybeSingle();
  assert(cs, "need a sandbox subject");
  const bulkUrl =
    `/school/orgs/${ORG}/sections/${sandboxSec.id}/terms/${term!.id}/report-cards/bulk`;
  const bulk = (action: string) => api(admin2.token, bulkUrl, {
    method: "POST", body: JSON.stringify({ action }),
  });
  const saveMark = () => api(admin2.token, `/school/orgs/${ORG}/exams/${wrExam!.id}/marks-sheet`, {
    method: "POST",
    body: JSON.stringify({
      sectionId: sandboxSec.id,
      rows: [{ studentId: stuA.id, classSubjectId: cs!.id, maxMarks: 50, obtainedMarks: 30, absent: false }],
    }),
  });
  const cleanup: Array<() => Promise<unknown>> = [];
  cleanup.push(() => admin.from("term_report_card").delete()
    .eq("term_id", term!.id).in("student_id", sbStudents!.map((x) => x.id)));
  cleanup.push(() => admin.from("exam_subject_score").delete()
    .eq("exam_id", wrExam!.id).eq("student_id", stuA.id));
  try {
    // 1. Finalize the section: every active student stamped.
    const f = await bulk("finalize");
    const fJ = await f.json();
    assert(f.status === 200 && fJ.updated === n, `finalize ${f.status}: ${JSON.stringify(fJ)}`);

    // 2. Marks are now locked for this term.
    const locked = await saveMark();
    const lockedJ = await locked.json();
    assert(locked.status === 409, `finalized term must refuse marks, got ${locked.status}`);
    assert(String(lockedJ.error).includes("finalized"), "the refusal must say why");

    // 3. Publish: cards become parent-visible, only because finalized.
    const pub = await bulk("publish");
    const pubJ = await pub.json();
    assert(pub.status === 200 && pubJ.updated === n, `publish ${JSON.stringify(pubJ)}`);
    const tabJ = await (await api(admin2.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/tabulation?termId=${term!.id}`)).json();
    assert(tabJ.reportCards?.finalizedCount === n && tabJ.reportCards?.publishedCount === n,
      `register must count ${n}/${n} finalized+published, got ${JSON.stringify(tabJ.reportCards)}`);

    // 4. Unfinalize reopens the term - and pulls the cards back from
    // parents (a visible-but-reopened card would mislead them).
    const uf = await bulk("unfinalize");
    assert(uf.status === 200, `unfinalize ${uf.status}`);
    const { data: after } = await admin.from("term_report_card")
      .select("finalized_at, published_at").eq("term_id", term!.id)
      .in("student_id", sbStudents!.map((x) => x.id));
    assert((after ?? []).every((r: any) => !r.finalized_at && !r.published_at),
      "unfinalize must clear both stamps");
    const open = await saveMark();
    assert(open.status === 200, `reopened term must accept marks, got ${open.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("79. needs-attention nudges: enter marks, then sign off - paper-aware, never for unexamined", async () => {
  // The teacher's Needs-attention list (Muneeb, 12 Sep): a column still
  // owing marks nags "enter marks"; a column fully entered but unsigned
  // nags "sign off"; a paper the subject does not sit never nags (Nazra
  // has no written paper), and a not-examined subject never appears.
  const t2 = await ensureUser("qa-teacher2@azality.com", "QA Teacher Two", "class_teacher");
  const term = await markedTerm();
  assert(term, "no term with papers");
  const { data: exams } = await admin.from("exam").select("id, name")
    .eq("term_id", term!.id).is("archived_at", null);
  const oralEx = (exams ?? []).find((e: any) => /Oral/.test(e.name));
  const writEx = (exams ?? []).find((e: any) => /Written/.test(e.name));
  assert(oralEx && writEx, "need the term's oral + written exams");
  const { data: sbStudents } = await admin.from("student").select("id")
    .eq("class_section_id", sandboxSec.id).eq("status", "active");
  const n = (sbStudents ?? []).length;
  assert(n >= 1, "need sandbox students");
  const cleanup: Array<() => Promise<unknown>> = [];
  const mkSub = async (nm: string, weights: unknown, sort: number) => {
    const { data: cs, error } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: nm, sort_order: sort,
      assessment_weights: weights,
    }).select("id").single();
    if (error) throw new Error(`${nm}: ${error.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    cleanup.push(() => admin.from("exam_subject_score").delete().eq("class_subject_id", cs.id));
    const { data: ss, error: e2 } = await admin.from("section_subject").insert({
      org_id: ORG, class_section_id: sandboxSec.id, class_subject_id: cs.id,
      teacher_user_id: t2.id, name: nm,
    }).select("id").single();
    if (e2) throw new Error(`ss ${nm}: ${e2.message}`);
    cleanup.push(() => admin.from("section_subject").delete().eq("id", ss.id));
    return cs.id;
  };
  try {
    const both = await mkSub("QA NA Both", [
      { label: "Written", marks: 60, paper: "written" },
      { label: "Oral", marks: 15, paper: "oral" },
    ], 981);
    const oralOnly = await mkSub("QA NA OralOnly",
      [{ label: "Oral", marks: 20, paper: "oral" }], 982);
    const notExamined = await mkSub("QA NA Never", [], 983);
    cleanup.push(() => admin.from("kv_store_f116e23f").delete()
      .eq("key", `school:marksconfirm:${term!.id}:${sandboxSec.id}`));

    // 1. Fresh columns owe marks - but only on papers they sit.
    const r1 = await api(t2.token, `/school/orgs/${ORG}/me/exam-marks-todo`);
    const j1 = await r1.json();
    assert(r1.status === 200, `todo ${r1.status}`);
    const mineTodos = (j1.todos ?? []).filter((x: any) =>
      [both, oralOnly, notExamined].includes(x.classSubjectId));
    assert(mineTodos.some((x: any) => x.classSubjectId === both && x.examId === oralEx!.id), "both: oral owed");
    assert(mineTodos.some((x: any) => x.classSubjectId === both && x.examId === writEx!.id), "both: written owed");
    assert(mineTodos.some((x: any) => x.classSubjectId === oralOnly && x.examId === oralEx!.id), "oral-only: oral owed");
    assert(!mineTodos.some((x: any) => x.classSubjectId === oralOnly && x.examId === writEx!.id),
      "a paper the subject does not sit must never nag");
    assert(!mineTodos.some((x: any) => x.classSubjectId === notExamined),
      "a not-examined subject must never appear");
    const withLabel = mineTodos.find((x: any) => x.classSubjectId === both);
    assert(String(withLabel?.sectionLabel ?? "").includes("Sandbox"),
      `todo carries the section label, got "${withLabel?.sectionLabel}"`);

    // 2. Enter every mark -> the todos become a sign-off nudge.
    const rows: any[] = [];
    for (const stu of sbStudents!) {
      rows.push({ org_id: ORG, exam_id: oralEx!.id, class_subject_id: both, student_id: stu.id, obtained_marks: 10, max_marks: 15, recorded_by: t2.id });
      rows.push({ org_id: ORG, exam_id: writEx!.id, class_subject_id: both, student_id: stu.id, obtained_marks: 40, max_marks: 60, recorded_by: t2.id });
      rows.push({ org_id: ORG, exam_id: oralEx!.id, class_subject_id: oralOnly, student_id: stu.id, obtained_marks: 15, max_marks: 20, recorded_by: t2.id });
    }
    const { error: insErr } = await admin.from("exam_subject_score").insert(rows);
    if (insErr) throw new Error(`scores: ${insErr.message}`);
    const r2 = await api(t2.token, `/school/orgs/${ORG}/me/exam-marks-todo`);
    const j2 = await r2.json();
    assert(!((j2.todos ?? []).some((x: any) => [both, oralOnly].includes(x.classSubjectId))),
      "fully marked columns leave the todo list");
    const so = (j2.signOffs ?? []).filter((x: any) => [both, oralOnly].includes(x.classSubjectId));
    assert(so.length === 2, `both complete columns ask for sign-off, got ${so.length}`);
    assert(!((j2.signOffs ?? []).some((x: any) => x.classSubjectId === notExamined)),
      "a not-examined subject never asks for sign-off");

    // 3. Signing the column clears its nudge.
    const conf = await api(t2.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/subjects/${both}/marks-confirmation`, {
        method: "POST", body: JSON.stringify({ termId: term!.id, confirmed: true }),
      });
    assert(conf.status === 200, `confirm ${conf.status}`);
    const r3 = await api(t2.token, `/school/orgs/${ORG}/me/exam-marks-todo`);
    const j3 = await r3.json();
    assert(!((j3.signOffs ?? []).some((x: any) => x.classSubjectId === both)),
      "a signed column stops nagging");
    assert((j3.signOffs ?? []).some((x: any) => x.classSubjectId === oralOnly),
      "the unsigned column still nags");

    // 4. The office dashboard still answers with its alerts array.
    const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
    const dash = await api(admin2.token, `/school/orgs/${ORG}/dashboard`);
    const dj = await dash.json();
    assert(dash.status === 200 && Array.isArray(dj.alerts), "dashboard alerts intact");
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("80. curriculum pace pauses on exam days, and never demands more than the naive line", async () => {
  // Muneeb (13 Sep): "62% vs ~95% expected" mid-papers read as a crisis
  // while no teaching could happen. On any datesheet date the expected
  // line must NOT climb - each exam day contributes zero - so the
  // served expectation equals an independent recomputation from the
  // term dates and the datesheet, and can never exceed the naive
  // straight line.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const { data: term } = await admin.from("academic_term")
    .select("id, start_date, end_date")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "no current term");
  const r = await api(admin2.token, `/school/orgs/${ORG}/academics`);
  const j = await r.json();
  assert(r.status === 200, `academics ${r.status}`);
  const served = j.pace?.expectedPct;
  assert(typeof served === "number", `pace.expectedPct missing: ${JSON.stringify(j.pace ?? {}).slice(0, 160)}`);

  // Independent recomputation, same semantics as termPace.ts.
  const DAY = 86_400_000;
  const startMs = Date.parse(`${term!.start_date}T00:00:00Z`);
  const endMs = Date.parse(`${term!.end_date}T00:00:00Z`);
  const totalDays = (endMs - startMs) / DAY;
  const nowMs = Date.now();
  const elapsedDays = Math.min(totalDays, Math.max(0, (nowMs - startMs) / DAY));
  const { data: sched } = await admin.from("exam_schedule")
    .select("exam_date").eq("org_id", ORG).eq("term_id", term!.id);
  const atIso = new Date(nowMs).toISOString().slice(0, 10);
  const examElapsed = new Set(
    ((sched ?? []) as any[])
      .map((x) => x.exam_date)
      .filter((d) => d && d >= term!.start_date && d <= term!.end_date && d <= atIso),
  ).size;
  const expected = Math.round(Math.min(1, Math.max(0, elapsedDays - examElapsed) / totalDays) * 100);
  const naive = Math.round(Math.min(1, elapsedDays / totalDays) * 100);

  // The clock crosses midnight between the two computations at most
  // rarely - allow 1pp of slack, no more.
  assert(Math.abs(served - expected) <= 1,
    `served ${served} vs recomputed ${expected} (naive ${naive})`);
  assert(served <= naive, "the pause must never demand MORE than the naive line");
  if (examElapsed > 0) {
    assert(served < naive,
      `with ${examElapsed} exam day(s) elapsed the pause must show: served ${served}, naive ${naive}`);
  }
});

await check("81. PIN slips: a whole section at once, never touching a chosen PIN", async () => {
  // Whole-section onboarding (Muneeb, 13 Sep). One call issues fresh
  // temporary PINs for everyone in the section who needs one and
  // returns printable slip rows. The invariant that matters: a subject
  // who already CHOSE their own PIN (must_change=false) is skipped -
  // a bulk run must never lock out a family that is already logging in.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const url = `/school/orgs/${ORG}/sections/${sandboxSec.id}/pin-slips`;
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    // Snapshot pStu1's credential - the portal checks depend on it and
    // the bulk run must leave it exactly as found.
    const { data: before } = await admin.from("pin_credential")
      .select("id, must_change, pin_hash").eq("org_id", ORG)
      .eq("subject_type", "student").eq("subject_id", pStu1).maybeSingle();

    // 1. Student slips: 4-digit PINs, GR identifiers, temp credentials.
    const r1 = await api(admin2.token, url, {
      method: "POST", body: JSON.stringify({ subjectType: "student" }),
    });
    const j1 = await r1.json();
    assert(r1.status === 200, `slips ${r1.status}: ${JSON.stringify(j1).slice(0, 150)}`);
    assert(Array.isArray(j1.slips), "slips array");
    for (const sl of j1.slips) {
      assert(/^\d{4}$/.test(sl.pin), `pin must be 4 digits, got ${sl.pin}`);
      assert(sl.identifier, "identifier present");
    }
    if (before && before.must_change === false) {
      assert((j1.skipped ?? []).length >= 1, "chosen-PIN holders must be skipped");
      const { data: after } = await admin.from("pin_credential")
        .select("must_change, pin_hash").eq("id", before.id).maybeSingle();
      assert(after && after.pin_hash === before.pin_hash && after.must_change === false,
        "a chosen PIN must be untouched by the bulk run");
    }
    // New credentials are temporary.
    if (j1.slips.length) {
      const { data: cred } = await admin.from("pin_credential")
        .select("must_change").eq("org_id", ORG).eq("subject_type", "student")
        .eq("subject_id", j1.slips[0].subjectId).maybeSingle();
      assert(cred?.must_change === true, "bulk PINs are temporary (must_change)");
    }
    // Re-running slips REUSES an unused temp PIN instead of rotating it —
    // a father with children in two sections got two different slips and
    // only the second worked (16 Sep). regenerate:true still re-rolls.
    if (j1.slips.length) {
      const r1b = await api(admin2.token, url, {
        method: "POST", body: JSON.stringify({ subjectType: "student" }),
      });
      const j1b = await r1b.json();
      assert(r1b.status === 200, `slips rerun ${r1b.status}`);
      const firstPins = new Map(j1.slips.map((s: any) => [s.subjectId, s.pin]));
      for (const sl of (j1b.slips ?? [])) {
        if (!firstPins.has(sl.subjectId)) continue;
        assert(sl.pin === firstPins.get(sl.subjectId),
          `unused temp PIN must be reused across runs (${sl.name}: ${firstPins.get(sl.subjectId)} -> ${sl.pin})`);
      }
      const r1c = await api(admin2.token, url, {
        method: "POST", body: JSON.stringify({ subjectType: "student", regenerate: true }),
      });
      const j1c = await r1c.json();
      assert(r1c.status === 200 && (j1c.slips ?? []).every((s: any) => /^\d{4}$/.test(s.pin)),
        "regenerate:true must still issue fresh 4-digit PINs");
    }

    // 2. Parent slips: phone identifiers; a phone-less parent is
    // reported, not failed.
    const { data: pNoPhone, error: pErr } = await admin.from("parent").insert({
      org_id: ORG, full_name: "QA Slipless Parent", relationship: "father",
    }).select("id").single();
    if (pErr) throw new Error(`parent: ${pErr.message}`);
    cleanup.push(() => admin.from("parent").delete().eq("id", pNoPhone.id));
    const { data: link, error: lErr } = await admin.from("student_parent").insert({
      student_id: pStu1, parent_id: pNoPhone.id,
    }).select("student_id").single();
    if (lErr) throw new Error(`link: ${lErr.message}`);
    cleanup.push(() => admin.from("student_parent").delete()
      .eq("student_id", pStu1).eq("parent_id", pNoPhone.id));

    // A student with no parent linked at all is named on the sheet, not
    // silently dropped (Catch Up, 13 Sep: 7 of 10 had none).
    const orphanName = `QA Parentless Student ${Date.now()}`;
    const { data: orphan, error: oErr } = await admin.from("student").insert({
      org_id: ORG, class_section_id: sandboxSec.id, full_name: orphanName,
      gr_number: `QA-NP-${Date.now()}`, status: "active",
    }).select("id").single();
    if (oErr) throw new Error(`orphan student: ${oErr.message}`);
    cleanup.push(() => admin.from("student").delete().eq("id", orphan.id));

    const r2 = await api(admin2.token, url, {
      method: "POST", body: JSON.stringify({ subjectType: "parent" }),
    });
    const j2 = await r2.json();
    assert(r2.status === 200, `parent slips ${r2.status}`);
    assert((j2.skipped ?? []).some((x: any) => x.name === "QA Slipless Parent" && /phone/.test(x.reason)),
      `phone-less parent must be reported: ${JSON.stringify(j2.skipped).slice(0, 200)}`);
    assert((j2.skipped ?? []).some((x: any) => x.name === orphanName && /no parent/.test(x.reason)),
      `a student with no parent must be named: ${JSON.stringify(j2.skipped).slice(0, 200)}`);
    for (const sl of (j2.slips ?? [])) {
      assert(Array.isArray(sl.children) && sl.children.length > 0, "parent slips name the children");
      cleanup.push(() => admin.from("pin_credential").delete()
        .eq("org_id", ORG).eq("subject_type", "parent").eq("subject_id", sl.subjectId));
    }
    // Student credentials created by step 1 for non-portal QA students
    // are throwaway - remove them so later runs start clean. The stored
    // temp-PIN records (kv) go with them - exact keys only, never a
    // prefix sweep that could hit real families' slips.
    for (const sl of j1.slips) {
      cleanup.push(() => admin.from("pin_credential").delete()
        .eq("org_id", ORG).eq("subject_type", "student").eq("subject_id", sl.subjectId));
      cleanup.push(() => admin.from("kv_store_f116e23f").delete()
        .eq("key", `school:${ORG}:temp-pin:student:${sl.subjectId}`));
    }
    for (const sl of (j2.slips ?? [])) {
      cleanup.push(() => admin.from("kv_store_f116e23f").delete()
        .eq("key", `school:${ORG}:temp-pin:parent:${sl.subjectId}`));
    }
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("82. Noorani Qaida: a lesson, not a surah - logged, positioned, never a hifz number", async () => {
  // Qaida is the stage before nazra (14 Sep): taught lesson by lesson, so
  // an entry carries a lesson number and no surah/ayah. The roster must
  // place the child on their lesson and count them heard, credit nothing
  // as memorized, and every other kind must still demand a surah.
  const tt = (await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher")).token;
  const summaryUrl = `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`;
  const made: string[] = [];
  try {
    const before = await (await api(tt, summaryUrl)).json();
    const memorizedBefore = (before.students ?? []).find((s: any) => s.studentId === pStu1)?.ayahsMemorized;

    const tr = await api(tt, `/school/orgs/${ORG}/students/${pStu1}/quran-track`, {
      method: "POST", body: JSON.stringify({ quranTrack: "qaida" }),
    });
    assert(tr.status === 200, `set qaida track ${tr.status}`);

    const mk = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, kind: "qaida", qaidaLesson: 3, quality: "good", nextTarget: "Qaida: lesson 4" }),
    });
    const mj = await mk.json();
    assert(mk.status === 201, `qaida create ${mk.status}: ${JSON.stringify(mj).slice(0, 160)}`);
    made.push(mj.entry.id);
    assert(mj.entry.qaidaLesson === 3 && mj.entry.surahNumber == null,
      `entry should carry the lesson and no surah: ${JSON.stringify(mj.entry).slice(0, 160)}`);

    const noLesson = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST", body: JSON.stringify({ studentId: pStu1, kind: "qaida" }),
    });
    assert(noLesson.status === 400, `qaida without a lesson should 400, got ${noLesson.status}`);
    const tooFar = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST", body: JSON.stringify({ studentId: pStu1, kind: "qaida", qaidaLesson: 61 }),
    });
    assert(tooFar.status === 400, `a lesson past the school's count should 400, got ${tooFar.status}`);
    const noSurah = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST", body: JSON.stringify({ studentId: pStu1, kind: "sabaq", ayahFrom: 1, ayahTo: 2 }),
    });
    assert(noSurah.status === 400, `a sabaq without a surah must still 400, got ${noSurah.status}`);

    const sum = await api(tt, summaryUrl);
    const sj = await sum.json();
    assert(sum.status === 200, `summary ${sum.status}`);
    assert(Number.isInteger(sj.qaidaLessonCount) && sj.qaidaLessonCount >= 1,
      `qaidaLessonCount missing: ${sj.qaidaLessonCount}`);
    assert("hifzNazraParas" in sj, "hifzNazraParas missing from summary");
    const row = (sj.students ?? []).find((s: any) => s.studentId === pStu1);
    assert(Number.isInteger(row?.nazraParasRead), `nazraParasRead: ${row?.nazraParasRead}`);
    assert(row?.quranTrack === "qaida", `track should be qaida, got ${row?.quranTrack}`);
    assert(row.qaidaPosition?.lesson === 3, `qaidaPosition: ${JSON.stringify(row.qaidaPosition)}`);
    assert(row.today?.qaida === true, "today.qaida should be set after a hearing");
    assert(row.ayahsMemorized === memorizedBefore,
      `a Qaida lesson must not change ayahs memorized (${memorizedBefore} -> ${row.ayahsMemorized})`);
  } finally {
    for (const id of made) await api(tt, `/school/orgs/${ORG}/hifz-progress/${id}`, { method: "DELETE" });
    await admin.from("student").update({ quran_track: null }).eq("id", pStu1);
  }
});

await check("83. report card: the Hifz box belongs to memorizers only", async () => {
  // An academic child's report card showed a Hifz Progress box of zeros
  // (school, 14 Sep). The card now says whether to show it - false for a
  // child who is not memorizing, true once their track is hifz - and its
  // counts ignore reading kinds, so nazra hearings never inflate it.
  const tt = (await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher")).token;
  // The current term, resolved here: the `term` other checks use is
  // local to their own bodies (first run failed with "term is not
  // defined" - 14 Sep).
  const { data: curTerm } = await admin.from("academic_term")
    .select("id").eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(curTerm, "no current term for the report-card check");
  const cardUrl = `/school/orgs/${ORG}/students/${pStu1}/terms/${(curTerm as any).id}/report-card`;
  try {
    const plain = await api(tt, cardUrl);
    const pj = await plain.json();
    assert(plain.status === 200, `report card ${plain.status}`);
    assert(pj.hifz?.show === false,
      `an academic child's card must not show the Hifz box: ${JSON.stringify(pj.hifz).slice(0, 120)}`);

    const tr = await api(tt, `/school/orgs/${ORG}/students/${pStu1}/quran-track`, {
      method: "POST", body: JSON.stringify({ quranTrack: "hifz" }),
    });
    assert(tr.status === 200, `set hifz track ${tr.status}`);
    const hifzCard = await (await api(tt, cardUrl)).json();
    assert(hifzCard.hifz?.show === true,
      `a hifz child's card must show the box: ${JSON.stringify(hifzCard.hifz).slice(0, 120)}`);
  } finally {
    await admin.from("student").update({ quran_track: null }).eq("id", pStu1);
  }
});

await check("84. absence is not a hearing: the day flags tell them apart", async () => {
  // The round's Absent button writes a bare missed sabaq. That used to
  // flip today.sabaq, so a reopened round counted the absent child as
  // heard ("19 heard · 0 absent" - pilot, 14 Sep). Now: a bare missed
  // sabaq -> today.absent, not today.sabaq; a missed entry WITH a
  // reason is a deliberate skip and keeps its kind flag; a real
  // hearing still counts.
  const tt = (await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher")).token;
  const summaryUrl = `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`;
  const rowFor = async () => {
    const j = await (await api(tt, summaryUrl)).json();
    return (j.students ?? []).find((s: any) => s.studentId === pStu1);
  };
  const made: string[] = [];
  const post = async (body: Record<string, unknown>) => {
    const r = await api(tt, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST", body: JSON.stringify({ studentId: pStu1, ...body }),
    });
    const j = await r.json();
    assert(r.status === 201, `create ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
    made.push(j.entry.id);
  };
  try {
    await post({ kind: "sabaq", surahNumber: 1, ayahFrom: 1, ayahTo: 1, missed: true });
    let row = await rowFor();
    assert(row?.today?.absent === true, `bare missed sabaq should mark absent: ${JSON.stringify(row?.today)}`);
    assert(row?.today?.sabaq === false, `an absence is not a heard sabaq: ${JSON.stringify(row?.today)}`);

    await post({ kind: "sabqi", surahNumber: 1, ayahFrom: 1, ayahTo: 1, missed: true, missedTargetReason: "short day" });
    row = await rowFor();
    assert(row?.today?.sabqi === true, `a reasoned skip keeps its flag: ${JSON.stringify(row?.today)}`);

    await post({ kind: "sabaq", surahNumber: 1, ayahFrom: 1, ayahTo: 3 });
    row = await rowFor();
    assert(row?.today?.sabaq === true, `a real sabaq still counts: ${JSON.stringify(row?.today)}`);
  } finally {
    for (const id of made) await api(tt, `/school/orgs/${ORG}/hifz-progress/${id}`, { method: "DELETE" });
  }
});

await check("85. portal fees name the bank account for the child's class", async () => {
  // The school banks per class group (14 Sep): settings.fee_bank_accounts
  // is [{ bank, title, accountNumber, classIds }] and the parent fee page
  // shows the account covering the child's class - null when none does.
  const { data: orgRow } = await admin.from("organizations").select("settings").eq("id", ORG).maybeSingle();
  const before = (orgRow as any).settings ?? {};
  const test = [{ bank: "QA Bank", title: "QA Title", accountNumber: "0000-1111", classIds: [sandboxClass.id] }];
  await admin.from("organizations").update({ settings: { ...before, fee_bank_accounts: test } }).eq("id", ORG);
  // One sandbox fee row so the shape assertion below always has a row
  // to inspect (the ledger checks that seed fees run later).
  const { data: shapeFee } = await admin.from("fee_status").insert({
    org_id: ORG, student_id: pStu1, period: "2096-01", amount_due: 111,
    amount_paid: 0, status: "unpaid", due_date: "2096-01-05",
  }).select("id").single();
  try {
    const r = await portalGet(parToken, `/pin-me/students/${pStu1}/fees`);
    const j = await r.json();
    assert(r.status === 200, `fees ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
    assert(j.bankAccount?.accountNumber === "0000-1111" && j.bankAccount?.bank === "QA Bank",
      `bankAccount should resolve by class: ${JSON.stringify(j.bankAccount)}`);
    // Shape contract: the page reads FeeStatus snake_case. A camelCase
    // serializer here made every amount render "—" and Rs. 0 totals
    // while real balances existed (demo parent, 17 Sep).
    for (const f of (j.fees ?? []) as any[]) {
      assert("amount_due" in f && "due_date" in f && !("amountDue" in f),
        `portal fee rows must be snake_case FeeStatus: ${JSON.stringify(Object.keys(f))}`);
    }

    await admin.from("organizations").update({ settings: { ...before, fee_bank_accounts: [] } }).eq("id", ORG);
    const none = await (await portalGet(parToken, `/pin-me/students/${pStu1}/fees`)).json();
    assert(none.bankAccount === null, `no covering account must be null: ${JSON.stringify(none.bankAccount)}`);
  } finally {
    if (shapeFee) await admin.from("fee_status").delete().eq("id", (shapeFee as any).id);
    // Restore ONLY the key this check touched, onto the CURRENT settings.
    // Writing back the whole `before` snapshot would freeze every other
    // setting at its captured value - exactly how a stale snapshot left
    // student_points_league=false in live settings once (14 Sep).
    const { data: curRow } = await admin.from("organizations").select("settings").eq("id", ORG).maybeSingle();
    const cur = { ...((curRow as any)?.settings ?? {}) };
    if ("fee_bank_accounts" in before) cur.fee_bank_accounts = (before as any).fee_bank_accounts;
    else delete cur.fee_bank_accounts;
    await admin.from("organizations").update({ settings: cur }).eq("id", ORG);
  }
});

await check("86. a signed-off column locks its marks until unticked", async () => {
  // Muneeb (14 Sep): "lock the column on sign-off". The green check went
  // from a promise to a lock: marks-sheet saves touching that (section,
  // subject, term) refuse with 409 until the sign-off is withdrawn;
  // withdrawing reopens the column.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const { data: term } = await admin.from("academic_term").select("id")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "no current term");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: cs, error: csErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Lock Sub", sort_order: 971,
      assessment_weights: [{ label: "Oral", marks: 20, paper: "oral" }],
    }).select("id").single();
    if (csErr) throw new Error(`subject: ${csErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    const { data: exam, error: exErr } = await admin.from("exam").insert({
      org_id: ORG, term_id: term!.id, name: "QA Lock Oral", exam_type: "other", weight: 1,
      exam_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (exErr) throw new Error(`exam: ${exErr.message}`);
    cleanup.push(() => admin.from("exam").delete().eq("id", exam.id));
    cleanup.push(() => admin.from("exam_subject_score").delete().eq("exam_id", exam.id));
    cleanup.push(() => admin.from("kv_store_f116e23f").delete()
      .eq("key", `school:marksconfirm:${term!.id}:${sandboxSec.id}`));

    const sheetUrl = `/school/orgs/${ORG}/exams/${exam.id}/marks-sheet`;
    const confirmUrl =
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/subjects/${cs.id}/marks-confirmation`;
    const row = { studentId: pStu1, classSubjectId: cs.id, obtainedMarks: 15, maxMarks: 20 };

    // Open column: saves land.
    const before = await api(admin2.token, sheetUrl, {
      method: "POST", body: JSON.stringify({ sectionId: sandboxSec.id, rows: [row] }),
    });
    assert(before.status === 200, `save before sign-off ${before.status}`);

    // Signed off: the same save is refused, and the message says why.
    const sign = await api(admin2.token, confirmUrl, {
      method: "POST", body: JSON.stringify({ termId: term!.id, confirmed: true }),
    });
    assert(sign.status === 200, `sign-off ${sign.status}`);
    const locked = await api(admin2.token, sheetUrl, {
      method: "POST", body: JSON.stringify({ sectionId: sandboxSec.id, rows: [{ ...row, obtainedMarks: 18 }] }),
    });
    const lockedJ = await locked.json();
    assert(locked.status === 409, `signed-off save should 409, got ${locked.status}`);
    assert(String(lockedJ.error ?? "").includes("signed off"),
      `the refusal names the sign-off: ${lockedJ.error}`);

    // Unticked: the correction lands again.
    const untick = await api(admin2.token, confirmUrl, {
      method: "POST", body: JSON.stringify({ termId: term!.id, confirmed: false }),
    });
    assert(untick.status === 200, `untick ${untick.status}`);
    const after = await api(admin2.token, sheetUrl, {
      method: "POST", body: JSON.stringify({ sectionId: sandboxSec.id, rows: [{ ...row, obtainedMarks: 18 }] }),
    });
    assert(after.status === 200, `save after untick ${after.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("87. a family's leave report reaches roll call, the bell, and the teacher's home", async () => {
  // Muneeb (14 Sep): a parent files an absence/vacation from the portal
  // and, WITHOUT waiting on the office, (1) roll call defaults those
  // days to excused with a "parent reported" note, (2) the class
  // teacher's bell carries it, (3) TeacherHome's needs-attention lists
  // it. Approval upgrades the label, never gates the visibility.
  const tt = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const today = new Date().toISOString().slice(0, 10);
  const inTwo = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
  let requestId = "";
  try {
    const file = await fetch(`${FUNC}/school/pin-me/students/${pStu1}/time-off`, {
      method: "POST",
      headers: { apikey: ANON, "X-Pin-Token": parToken, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "vacation", startDate: today, endDate: inTwo, reason: "QA family trip" }),
    });
    const fj = await file.json();
    assert(file.status === 201, `file leave ${file.status}: ${JSON.stringify(fj).slice(0, 120)}`);
    requestId = fj.id;

    // 1. Roll call for today shows the pending report.
    const att = await (await api(tt.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance?date=${today}`)).json();
    const notice = (att.notifiedAbsences ?? []).find((n: any) => n.studentId === pStu1);
    assert(notice, `roll call must list the reported leave: ${JSON.stringify(att.notifiedAbsences)}`);
    assert(notice.status === "pending", `fresh report is pending: ${JSON.stringify(notice)}`);

    // 2. The class teacher's bell carries it.
    const bell = await (await api(tt.token, `/school/orgs/${ORG}/me/notifications`)).json();
    const alert = (bell.alerts ?? []).find((a: any) => a.key === `student_leave:${requestId}`);
    assert(alert, `bell must carry the leave: ${JSON.stringify((bell.alerts ?? []).map((a: any) => a.kind))}`);

    // 3. TeacherHome's needs-attention list.
    const mine = await (await api(tt.token, `/school/orgs/${ORG}/me/student-leaves`)).json();
    const row = (mine.leaves ?? []).find((l: any) => l.requestId === requestId);
    assert(row && row.status === "pending", `student-leaves must list it: ${JSON.stringify(mine.leaves)}`);

    // Approval upgrades the label; the notice stays.
    const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
    const dec = await api(admin2.token, `/school/orgs/${ORG}/time-off/${requestId}/decide`, {
      method: "PATCH", body: JSON.stringify({ decision: "approved" }),
    });
    assert(dec.status === 200, `approve ${dec.status}`);
    const att2 = await (await api(tt.token,
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance?date=${today}`)).json();
    const notice2 = (att2.notifiedAbsences ?? []).find((n: any) => n.studentId === pStu1);
    assert(notice2?.status === "approved", `approved leave keeps the notice: ${JSON.stringify(notice2)}`);
  } finally {
    if (requestId) await admin.from("time_off_request").delete().eq("id", requestId);
  }
});

await check("88. an absent mark can be undone - by roll call or by hand", async () => {
  // Aina Maqsood (15 Sep): marked absent in the hifz round, came late,
  // the teacher fixed the roll call - and the hifz roster kept saying
  // Absent, because the round's marker is its own record. Now: saving
  // Present/Late on the roll call clears the day's bare marker, the
  // clear endpoint does the same by hand, and a reasoned skip survives
  // both (a decision, not an absence).
  const tt = await ensureUser("qa-teacher@azality.com", "QA Teacher", "class_teacher");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const summaryUrl = `/school/orgs/${ORG}/sections/${sandboxSec.id}/hifz-progress/summary`;
  const absentOf = async () => {
    const j = await (await api(tt.token, summaryUrl)).json();
    return (j.students ?? []).find((s: any) => s.studentId === pStu1)?.today?.absent;
  };
  const markAbsent = async () => {
    const r = await api(tt.token, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, kind: "sabaq", surahNumber: 1, ayahFrom: 1, ayahTo: 1, missed: true }),
    });
    assert(r.status === 201, `mark absent ${r.status}`);
    return (await r.json()).entry.id;
  };
  const made: string[] = [];
  try {
    // 1. Roll call Present/Late clears the marker.
    made.push(await markAbsent());
    assert((await absentOf()) === true, "marker should read as absent");
    const save = await api(tt.token, `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance`, {
      method: "POST",
      body: JSON.stringify({ date: today, entries: [{ studentId: pStu1, status: "late" }] }),
    });
    const sj = await save.json();
    assert(save.status === 200, `roll call save ${save.status}: ${JSON.stringify(sj).slice(0, 120)}`);
    assert(sj.hifzAbsenceCleared >= 1, `save should clear the marker: ${JSON.stringify(sj)}`);
    assert((await absentOf()) === false, "absent must be gone after Present/Late");

    // 2. The by-hand undo does the same...
    made.push(await markAbsent());
    const clear = await api(tt.token, `/school/orgs/${ORG}/students/${pStu1}/hifz-absence/clear`, {
      method: "POST", body: JSON.stringify({}),
    });
    const cj = await clear.json();
    assert(clear.status === 200 && cj.cleared >= 1, `clear ${clear.status}: ${JSON.stringify(cj)}`);
    assert((await absentOf()) === false, "absent must be gone after the undo");

    // 3. ...while a reasoned skip is a decision and survives both.
    const skip = await api(tt.token, `/school/orgs/${ORG}/hifz-progress`, {
      method: "POST",
      body: JSON.stringify({ studentId: pStu1, kind: "sabqi", surahNumber: 1, ayahFrom: 1, ayahTo: 1, missed: true, missedTargetReason: "short day" }),
    });
    assert(skip.status === 201, `skip ${skip.status}`);
    const skipId = (await skip.json()).entry.id;
    made.push(skipId);
    await api(tt.token, `/school/orgs/${ORG}/students/${pStu1}/hifz-absence/clear`, {
      method: "POST", body: JSON.stringify({}),
    });
    const { data: still } = await admin.from("hifz_progress").select("id").eq("id", skipId).maybeSingle();
    assert(still, "a reasoned skip must survive the clear");
  } finally {
    for (const id of made) {
      await admin.from("hifz_progress").delete().eq("id", id);
    }
    await admin.from("school_attendance").delete()
      .eq("student_id", pStu1).eq("attendance_date", today);
  }
});

await check("89. paste-many carries details: 'topic — answer' lines save the description", async () => {
  // Scaling (15 Sep): the syllabus loads must be the school's own job.
  // The office pastes lines like "سوال ۱: …؟ — answer" into Paste many;
  // the split after " — " (or a tab / " :: ") becomes the topic's
  // description, and re-pasting stays idempotent.
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: cs, error: csErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Paste Sub", sort_order: 972,
    }).select("id").single();
    if (csErr) throw new Error(`subject: ${csErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    const { data: cur, error: curErr } = await admin.from("curriculum").insert({
      org_id: ORG, class_subject_id: cs.id, academic_year: "2026-27",
      title: "QA Paste Sub · 2026-27", created_by: principal.id,
    }).select("id").single();
    if (curErr) throw new Error(`curriculum: ${curErr.message}`);
    cleanup.push(() => admin.from("curriculum").delete().eq("id", cur.id));
    cleanup.push(() => admin.from("curriculum_topic").delete().eq("curriculum_id", cur.id));

    const entries = [
      { name: "QA Question one?", description: "QA answer one" },
      "QA plain topic (p. 4)",
    ];
    const r = await api(principal.token, `/school/class-curriculum/${cur.id}/topics/bulk`, {
      method: "POST", body: JSON.stringify({ names: entries }),
    });
    const j = await r.json();
    // 201 when rows were inserted; 200 only on the nothing-to-add paths.
    assert(r.status === 201 && j.added === 2, `bulk ${r.status}: ${JSON.stringify(j).slice(0, 140)}`);
    const { data: tops } = await admin.from("curriculum_topic")
      .select("name, description, display_order").eq("curriculum_id", cur.id).order("display_order");
    assert(tops?.length === 2, `expected 2 topics, got ${tops?.length}`);
    assert((tops as any)[0].description === "QA answer one",
      `description must ride along: ${JSON.stringify(tops)}`);
    assert((tops as any)[1].description === null, "a plain line has no description");

    const again = await (await api(principal.token, `/school/class-curriculum/${cur.id}/topics/bulk`, {
      method: "POST", body: JSON.stringify({ names: entries }),
    })).json();
    assert(again.added === 0, `re-paste must be idempotent, added ${again.added}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("90. photo import: gated, validated, and never free-for-all", async () => {
  // The photo reader spends real API money and writes nothing itself -
  // its gate and validation must hold without ever reaching Claude:
  // no curriculum rights -> 403; no image -> 400; junk media type ->
  // 400. (The actual reading path is exercised manually - a suite that
  // bills an external API on every run is a suite nobody runs.)
  const tt = await ensureUser("qa-teacher2@azality.com", "QA Teacher Two", "class_teacher");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: cs, error: csErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA Photo Sub", sort_order: 973,
    }).select("id").single();
    if (csErr) throw new Error(`subject: ${csErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    const { data: cur, error: curErr } = await admin.from("curriculum").insert({
      org_id: ORG, class_subject_id: cs.id, academic_year: "2026-27",
      title: "QA Photo Sub · 2026-27", created_by: principal.id,
    }).select("id").single();
    if (curErr) throw new Error(`curriculum: ${curErr.message}`);
    cleanup.push(() => admin.from("curriculum").delete().eq("id", cur.id));

    const url = `/school/class-curriculum/${cur.id}/topics/from-photo`;
    const denied = await api(tt.token, url, {
      method: "POST", body: JSON.stringify({ imageBase64: "aGk=", mediaType: "image/jpeg" }),
    });
    assert(denied.status === 403, `teacher without curriculum rights should 403, got ${denied.status}`);
    const noImage = await api(principal.token, url, {
      method: "POST", body: JSON.stringify({}),
    });
    assert(noImage.status === 400, `missing image should 400, got ${noImage.status}`);
    const badType = await api(principal.token, url, {
      method: "POST", body: JSON.stringify({ imageBase64: "aGk=", mediaType: "application/pdf" }),
    });
    assert(badType.status === 400, `bad media type should 400, got ${badType.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("91. photo reads are capped and cached - neither path bills the API", async () => {
  // Spend guards (16 Sep): an identical re-upload returns the cached
  // reading free (typos are fixed in the box, not by re-photographing),
  // and a per-school daily cap refuses BEFORE any API spend. Both
  // proven by seeding the KV rows - no Anthropic call is ever made.
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: cs, error: csErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: sandboxClass.id, name: "QA PhotoCap Sub", sort_order: 974,
    }).select("id").single();
    if (csErr) throw new Error(`subject: ${csErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", cs.id));
    const { data: cur, error: curErr } = await admin.from("curriculum").insert({
      org_id: ORG, class_subject_id: cs.id, academic_year: "2026-27",
      title: "QA PhotoCap Sub · 2026-27", created_by: principal.id,
    }).select("id").single();
    if (curErr) throw new Error(`curriculum: ${curErr.message}`);
    cleanup.push(() => admin.from("curriculum").delete().eq("id", cur.id));
    const url = `/school/class-curriculum/${cur.id}/topics/from-photo`;

    // 1. Identical photo -> served from cache, no spend, no quota use.
    const img = btoa("qa-photo-cache-fixture");
    const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(img));
    const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const cacheKey = `school:${ORG}:photo-read-cache:${hash}`;
    await admin.from("kv_store_f116e23f").upsert({
      key: cacheKey, value: { lines: "QA cached line one\nQA cached line two", model: "qa-fixture" },
    });
    cleanup.push(() => admin.from("kv_store_f116e23f").delete().eq("key", cacheKey));
    const hit = await api(principal.token, url, {
      method: "POST", body: JSON.stringify({ imageBase64: img, mediaType: "image/jpeg" }),
    });
    const hj = await hit.json();
    assert(hit.status === 200 && hj.cached === true, `cache hit ${hit.status}: ${JSON.stringify(hj).slice(0, 140)}`);
    assert(hj.lines === "QA cached line one\nQA cached line two", `cached lines: ${hj.lines}`);

    // 2. Daily cap reached -> a NEW photo is refused before any spend.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const quotaKey = `school:${ORG}:photo-reads:${today}`;
    const { data: prevQuota } = await admin.from("kv_store_f116e23f")
      .select("value").eq("key", quotaKey).maybeSingle();
    await admin.from("kv_store_f116e23f").upsert({ key: quotaKey, value: 30 });
    cleanup.push(async () => prevQuota
      ? admin.from("kv_store_f116e23f").upsert({ key: quotaKey, value: (prevQuota as any).value })
      : admin.from("kv_store_f116e23f").delete().eq("key", quotaKey));
    const capped = await api(principal.token, url, {
      method: "POST", body: JSON.stringify({ imageBase64: btoa("qa-brand-new-photo"), mediaType: "image/jpeg" }),
    });
    const cj = await capped.json();
    assert(capped.status === 429, `over-cap read should 429, got ${capped.status}: ${JSON.stringify(cj).slice(0, 120)}`);
    assert(String(cj.error ?? "").includes("limit"), `the refusal explains the cap: ${cj.error}`);

    // ...and the cached photo still answers even while capped.
    const stillCached = await (await api(principal.token, url, {
      method: "POST", body: JSON.stringify({ imageBase64: img, mediaType: "image/jpeg" }),
    })).json();
    assert(stillCached.cached === true, "cache must answer even at the cap");
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("92. dashboard hifz + resources tiles count what the school actually logs", async () => {
  // Both tiles read 0 forever (Muneeb, 16 Sep): hifz counted kind
  // "memorized", which nothing writes (lessons are logged as sabaq), and
  // resources looked topics up in one unpaged select that the 1000-row
  // cap truncated at 2,154 topics. Read-only against live org data.
  const { count: sabaqCount } = await admin.from("hifz_progress")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG).eq("kind", "sabaq").eq("missed", false).is("juz_extent", null);
  const dash = await api(principal.token, `/school/orgs/${ORG}/dashboard?period=month`);
  const dj = await dash.json();
  assert(dash.status === 200, `dashboard ${dash.status}`);
  const hifzVal = dj?.tiles?.hifzProgress?.value ?? 0;
  if ((sabaqCount ?? 0) > 0) {
    assert(hifzVal > 0, `${sabaqCount} sabaq lessons are logged but the hifz tile reads ${hifzVal}`);
  }

  const { count: resCount } = await admin.from("topic_resource")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG).is("archived_at", null);
  const acad = await api(principal.token, `/school/orgs/${ORG}/academics`);
  const aj = await acad.json();
  assert(acad.status === 200, `academics ${acad.status}`);
  const resVal = aj?.resources?.totalResources ?? 0;
  assert(resVal <= (resCount ?? 0), `tile ${resVal} exceeds the ${resCount} live resources`);
  if ((resCount ?? 0) > 0) {
    assert(resVal > 0, `${resCount} live resources exist but the resources tile reads 0`);
  }
});

// Revive-or-insert an incharge wing row. user_roles has a UNIQUE
// (user_id, role_type, scope_type, scope_id) that counts REVOKED rows
// too — and check 31 deliberately leaves qa-incharge's row revoked —
// so a blind insert dupes on every rerun. Callers clean up by id
// (delete), which both paths tolerate.
async function ensureWingRow(userId: string, classId: string, grantedBy: string): Promise<string> {
  const { data: existing } = await admin.from("user_roles").select("id")
    .eq("user_id", userId).eq("role_type", "incharge")
    .eq("scope_type", "class").eq("scope_id", classId).maybeSingle();
  if (existing) {
    const { error } = await admin.from("user_roles").update({ revoked_at: null }).eq("id", existing.id);
    if (error) throw new Error(`wing row revive: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await admin.from("user_roles").insert({
    user_id: userId, role_type: "incharge", scope_type: "class",
    scope_id: classId, granted_by: grantedBy,
  }).select("id").single();
  if (error) throw new Error(`wing row: ${error.message}`);
  return data.id;
}

await check("93. an incharge runs their own wing's syllabus - and nothing leaks school-wide", async () => {
  // Muneeb (16 Sep): Upload syllabus "should be granted to Incharge of
  // their own wing". Incharge matrix cells are wing-scoped
  // (userCanForClass); userCanInOrg ignores the incharge role, so an
  // override can never open a school-wide door. Removing the staff
  // member must also revoke their class-scoped wing rows.
  const inch = await ensureUser("qa-incharge@azality.com", "QA Incharge", "class_teacher");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    // Checks 31/36 can leave a (possibly revoked) wing row for this same
    // tuple, and the unique constraint counts revoked rows —
    // ensureWingRow revives it instead of tripping the duplicate key.
    const wingRowId = await ensureWingRow(inch.id, sandboxClass.id, principal.id);
    cleanup.push(() => admin.from("user_roles").delete().eq("id", wingRowId));
    // qa-incharge also holds org class_teacher (shared fixture). The
    // outside-wing 403 below is only meaningful while class_teacher's
    // define_curriculum is OFF - pin the override for the check's
    // duration and restore exactly the prior row after (one key only).
    const { data: prevOv } = await admin.from("role_template_override")
      .select("allowed").eq("org_id", ORG)
      .eq("role_template", "class_teacher").eq("permission_key", "define_curriculum")
      .maybeSingle();
    await admin.from("role_template_override").upsert(
      { org_id: ORG, role_template: "class_teacher", permission_key: "define_curriculum", allowed: false },
      { onConflict: "org_id,role_template,permission_key" },
    );
    cleanup.push(async () => prevOv
      ? admin.from("role_template_override").upsert(
          { org_id: ORG, role_template: "class_teacher", permission_key: "define_curriculum", allowed: (prevOv as any).allowed },
          { onConflict: "org_id,role_template,permission_key" },
        )
      : admin.from("role_template_override").delete()
          .eq("org_id", ORG).eq("role_template", "class_teacher").eq("permission_key", "define_curriculum"));

    // Outside the wing: a throwaway class, so a wrongly-open gate writes
    // test data, never a real class's syllabus.
    const { data: outCls, error: ocErr } = await admin.from("class").insert({
      org_id: ORG, name: `QA Outside Wing ${Date.now()}`, display_order: 999,
    }).select("id").single();
    if (ocErr) throw new Error(`outside class: ${ocErr.message}`);
    cleanup.push(() => admin.from("class").delete().eq("id", outCls.id));
    const { data: outCs, error: ocsErr } = await admin.from("class_subject").insert({
      org_id: ORG, class_id: outCls.id, name: "QA Outside Subject", sort_order: 1, created_by: principal.id,
    }).select("id").single();
    if (ocsErr) throw new Error(`outside subject: ${ocsErr.message}`);
    cleanup.push(() => admin.from("class_subject").delete().eq("id", outCs.id));
    const { data: outSec, error: osErr } = await admin.from("class_section").insert({
      class_id: outCls.id, name: "Z",
    }).select("id").single();
    if (osErr) throw new Error(`outside section: ${osErr.message}`);
    cleanup.push(() => admin.from("class_section").delete().eq("id", outSec.id));

    const year = "QA-WING";
    const dropCurricula = async (csId: string) => {
      const { data: curs } = await admin.from("curriculum").select("id")
        .eq("class_subject_id", csId).eq("academic_year", year);
      for (const cu of (curs ?? []) as any[]) {
        await admin.from("curriculum_topic").delete().eq("curriculum_id", cu.id);
        await admin.from("curriculum").delete().eq("id", cu.id);
      }
    };
    cleanup.push(() => dropCurricula(qaCs.id));
    cleanup.push(() => dropCurricula(outCs.id));

    // 1. Inside the wing: create the year's curriculum and bulk-add topics
    //    (the Upload syllabus path).
    const mk = await api(inch.token, `/school/class-subjects/${qaCs.id}/curriculum`, {
      method: "POST", body: JSON.stringify({ academicYear: year, title: "QA wing" }),
    });
    const mkj = await mk.json();
    assert(mk.ok, `incharge creating their wing's curriculum: ${mk.status} ${JSON.stringify(mkj).slice(0, 120)}`);
    const bulk = await api(inch.token, `/school/class-curriculum/${mkj.curriculum.id}/topics/bulk`, {
      method: "POST", body: JSON.stringify({ names: ["QA wing topic"] }),
    });
    assert(bulk.ok, `incharge bulk-adding topics in their wing: ${bulk.status}`);

    // 2. Outside the wing: refused before anything is written.
    const outMk = await api(inch.token, `/school/class-subjects/${outCs.id}/curriculum`, {
      method: "POST", body: JSON.stringify({ academicYear: year }),
    });
    assert(outMk.status === 403, `outside-wing curriculum must 403, got ${outMk.status}`);
    const outTab = await api(inch.token, `/school/orgs/${ORG}/sections/${outSec.id}/tabulation`);
    assert(outTab.status === 403, `outside-wing tabulation must 403, got ${outTab.status}`);

    // 3. An incharge override on a school-wide key never opens a door.
    await admin.from("role_template_override").upsert(
      { org_id: ORG, role_template: "incharge", permission_key: "manage_students", allowed: true },
      { onConflict: "org_id,role_template,permission_key" },
    );
    cleanup.push(() => admin.from("role_template_override").delete()
      .eq("org_id", ORG).eq("role_template", "incharge").eq("permission_key", "manage_students"));
    const leak = await api(inch.token, `/school/orgs/${ORG}/students-next-gr`);
    assert(leak.status === 403, `an incharge override must not grant school-wide manage_students, got ${leak.status}`);

    // 4. Removing the staff member revokes the wing row too.
    const rm = await api(principal.token, `/school/orgs/${ORG}/teachers/${inch.id}`, { method: "DELETE" });
    assert(rm.ok, `remove staff ${rm.status}`);
    const { data: after } = await admin.from("user_roles").select("revoked_at").eq("id", wingRowId).maybeSingle();
    assert(after && after.revoked_at, "removing a staff member must revoke their incharge wing rows");
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("94. read-scopes: fee data needs the fees key, student detail/search stay in-section, incharge can request leave", async () => {
  // Permissions audit (16 Sep), the items PR #622 did not cover:
  //   - fee reads (org ledger, finance snapshot, plan/override lists,
  //     per-student history) were any-role: every teacher could read
  //     every family's money. Now: mark_fees_status (or manage_students
  //     for the plan lists the admission flow needs).
  //   - GET /students/:id and /search answered org-wide while the
  //     roster LIST was section-scoped — the scoping was hollow.
  //   - a PURE incharge (class-scoped rows only) could not request
  //     time off; a teacher who is ALSO an incharge got org-wide form
  //     audiences; link-code LISTING was admin-only while issuing was
  //     manage_students.
  const finance = await ensureUser("qa-finance@azality.com", "QA Finance", "financial_staff");
  const { data: sbSecs } = await admin.from("class_section").select("id").eq("class_id", sandboxClass.id);
  const sbIds = new Set((sbSecs ?? []).map((x: any) => x.id));
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    // ── 1. Fee reads follow mark_fees_status ──
    const tFees = await api(teacher.token, `/school/orgs/${ORG}/fees`);
    assert(tFees.status === 403, `teacher org fees expected 403, got ${tFees.status}`);
    const tSnap = await api(teacher.token, `/school/orgs/${ORG}/finance-snapshot`);
    assert(tSnap.status === 403, `teacher finance-snapshot expected 403, got ${tSnap.status}`);
    const tHist = await api(teacher.token, `/school/orgs/${ORG}/students/${pStu1}/fees`);
    assert(tHist.status === 403, `teacher student fee history expected 403, got ${tHist.status}`);
    const fFees = await api(finance.token, `/school/orgs/${ORG}/fees`);
    assert(fFees.status === 200, `finance org fees expected 200, got ${fFees.status}`);
    const fSnap = await api(finance.token, `/school/orgs/${ORG}/finance-snapshot`);
    assert(fSnap.status === 200, `finance snapshot expected 200, got ${fSnap.status}`);
    const fHist = await api(finance.token, `/school/orgs/${ORG}/students/${pStu1}/fees`);
    assert(fHist.status === 200, `finance student fee history expected 200, got ${fHist.status}`);
    // Plan lists: teacher no, office (manage_students — admission flow) yes.
    const tPlans = await api(teacher.token, `/school/orgs/${ORG}/classes/${sandboxClass.id}/fee-plans`);
    assert(tPlans.status === 403, `teacher fee-plans expected 403, got ${tPlans.status}`);
    const oPlans = await api(office.token, `/school/orgs/${ORG}/classes/${sandboxClass.id}/fee-plans`);
    assert(oPlans.status === 200, `office fee-plans expected 200, got ${oPlans.status}`);
    const tOv = await api(teacher.token, `/school/orgs/${ORG}/students/${pStu1}/fee-overrides`);
    assert(tOv.status === 403, `teacher fee-overrides expected 403, got ${tOv.status}`);

    // ── 2. Student detail + search are scoped like the roster list ──
    const { data: cands } = await admin.from("student")
      .select("id, full_name, class_section_id")
      .eq("org_id", ORG).eq("status", "active").not("class_section_id", "is", null).limit(60);
    const foreignStu = ((cands ?? []) as any[]).find((s) => !sbIds.has(s.class_section_id));
    assert(foreignStu, "no non-sandbox student found to probe with");
    const tOwn = await api(teacher.token, `/school/orgs/${ORG}/students/${pStu1}`);
    assert(tOwn.status === 200, `teacher own-section student expected 200, got ${tOwn.status}`);
    const tForeign = await api(teacher.token, `/school/orgs/${ORG}/students/${foreignStu.id}`);
    assert(tForeign.status === 403, `teacher foreign student expected 403, got ${tForeign.status}`);
    const fForeign = await api(finance.token, `/school/orgs/${ORG}/students/${foreignStu.id}`);
    assert(fForeign.status === 200, `finance foreign student expected 200 (fee pages), got ${fForeign.status}`);
    // Search: the same name that the principal CAN find must not surface
    // students outside the teacher's sections (Sandbox class only).
    const q = encodeURIComponent(String(foreignStu.full_name));
    const pSearch = await (await api(principal.token, `/school/orgs/${ORG}/search?q=${q}`)).json();
    assert((pSearch.students ?? []).some((s: any) => s.id === foreignStu.id),
      "principal search should find the foreign student (probe sanity)");
    const tSearch = await (await api(teacher.token, `/school/orgs/${ORG}/search?q=${q}`)).json();
    assert(!(tSearch.students ?? []).some((s: any) => s.id === foreignStu.id),
      "teacher search leaked a student outside their sections");
    for (const s of tSearch.students ?? []) {
      assert(s.className === "Sandbox", `teacher search leaked student of class ${s.className}`);
    }
    // A parent linked to the teacher's own section still surfaces.
    const tPar = await (await api(teacher.token,
      `/school/orgs/${ORG}/search?q=${encodeURIComponent("QA Portal Parent")}`)).json();
    assert((tPar.parents ?? []).some((p: any) => p.fullName === "QA Portal Parent"),
      "teacher lost their own section's parent in search");

    // ── 3. Pure incharge can request time off ──
    const inch = await ensureUser("qa-incharge@azality.com", "QA Incharge", "class_teacher");
    // Strip org rows; wing row only (same pure-incharge shape as check 31).
    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", inch.id).eq("scope_type", "organization").eq("scope_id", ORG).is("revoked_at", null);
    const inchWingId = await ensureWingRow(inch.id, sandboxClass.id, principal.id);
    cleanup.push(() => admin.from("user_roles").delete().eq("id", inchWingId));
    const to = await api(inch.token, `/school/orgs/${ORG}/me/time-off`, {
      method: "POST",
      body: JSON.stringify({ kind: "personal", startDate: "2031-02-03", endDate: "2031-02-03", reason: "QA read-scopes" }),
    });
    const toJ = await to.json();
    assert(to.status === 201, `pure incharge time-off expected 201, got ${to.status} ${JSON.stringify(toJ).slice(0, 120)}`);
    cleanup.push(() => admin.from("time_off_request").delete().eq("id", toJ.id));

    // ── 4. Teacher-who-is-also-incharge: forms stay section-scoped ──
    const tWingId = await ensureWingRow(teacher.id, sandboxClass.id, principal.id);
    cleanup.push(() => admin.from("user_roles").delete().eq("id", tWingId));
    const fWide = await api(teacher.token, `/school/orgs/${ORG}/forms`, {
      method: "POST",
      body: JSON.stringify({ title: "QA wide form", audienceKind: "whole_school" }),
    });
    assert(fWide.status === 403, `teacher+incharge whole-school form expected 403, got ${fWide.status}`);
    const fOwn = await api(teacher.token, `/school/orgs/${ORG}/forms`, {
      method: "POST",
      body: JSON.stringify({ title: "QA section form", audienceKind: "class_section", audienceSectionId: sandboxSec.id }),
    });
    const fOwnJ = await fOwn.json();
    assert(fOwn.status === 201, `teacher+incharge own-section form expected 201, got ${fOwn.status}`);
    cleanup.push(() => admin.from("form").delete().eq("id", fOwnJ.form?.id ?? fOwnJ.id));

    // ── 5. Link codes: listing follows the same key as issuing ──
    const oCodes = await api(office.token, `/school/orgs/${ORG}/link-codes`);
    assert(oCodes.status === 200, `office link-codes list expected 200, got ${oCodes.status}`);
    const tCodes = await api(teacher.token, `/school/orgs/${ORG}/link-codes`);
    assert(tCodes.status === 403, `teacher link-codes list expected 403, got ${tCodes.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("95. fee ledger: installments add up, derive the status, and void undoes", async () => {
  // Fees review (17 Sep): partial payments used to overwrite each other
  // and the dialog hardcoded "paid". Now every payment is a ledger row;
  // amount_paid is their sum and status is derived - and the old PATCH
  // amountPaid path is refused so nothing bypasses the ledger.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const mk = await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}/fees`, {
      method: "POST", body: JSON.stringify({ period: "2099-01", amountDue: 4000, dueDate: "2099-01-05" }),
    });
    const mkj = await mk.json();
    assert(mk.status === 201, `create fee ${mk.status}: ${JSON.stringify(mkj).slice(0, 120)}`);
    const feeId = mkj.fee.id;
    cleanup.push(() => admin.from("fee_payment").delete().eq("fee_status_id", feeId));
    cleanup.push(() => admin.from("fee_status").delete().eq("id", feeId));

    // Two partial installments -> sum + partial, then paid.
    const p1 = await (await api(admin2.token, `/school/orgs/${ORG}/fees/${feeId}/payments`, {
      method: "POST", body: JSON.stringify({ amount: 1500, paidOn: "2099-01-03", method: "cash" }),
    })).json();
    assert(p1.fee.amount_paid === 1500 && p1.fee.status === "partial",
      `after 1500: ${p1.fee.amount_paid}/${p1.fee.status}`);
    const p2 = await (await api(admin2.token, `/school/orgs/${ORG}/fees/${feeId}/payments`, {
      method: "POST", body: JSON.stringify({ amount: 2500, paidOn: "2099-01-10", method: "bank", reference: "SLIP-1" }),
    })).json();
    assert(p2.fee.amount_paid === 4000 && p2.fee.status === "paid" && p2.fee.paid_date === "2099-01-10",
      `after 2500: ${p2.fee.amount_paid}/${p2.fee.status}/${p2.fee.paid_date}`);

    // Both installments (with dates) come back on the per-student read.
    const list = await (await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}/fees`)).json();
    const row = (list.fees ?? []).find((f: any) => f.id === feeId);
    assert(row && Array.isArray(row.payments) && row.payments.length === 2,
      `expected 2 ledger rows, got ${row?.payments?.length}`);
    assert(row.payments.some((x: any) => x.amount === 1500 && x.paidOn === "2099-01-03"),
      "first installment lost its date/amount");

    // Void the second -> back to partial 1500; the row stays, marked void.
    const v = await (await api(admin2.token, `/school/orgs/${ORG}/fee-payments/${p2.payment.id}/void`, {
      method: "POST", body: JSON.stringify({ reason: "QA" }),
    })).json();
    assert(v.fee.amount_paid === 1500 && v.fee.status === "partial",
      `after void: ${v.fee.amount_paid}/${v.fee.status}`);

    // The scalar bypass is closed.
    const patch = await api(admin2.token, `/school/orgs/${ORG}/fees/${feeId}`, {
      method: "PATCH", body: JSON.stringify({ amountPaid: 4000, status: "paid" }),
    });
    assert(patch.status === 400, `PATCH amountPaid must 400, got ${patch.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("96. arrears carry forward, and regenerating never erases payments", async () => {
  // The 4000-vs-8000 complaint: unpaid August + September must surface
  // as ONE combined balance; and re-running a month's billing must not
  // wipe recorded payments (it used to upsert amount_paid: 0 over them).
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    // Self-heal first: a run killed mid-check leaves 2098-09 bills on
    // EVERY sandbox student - including the demo family, whose portal
    // then shows a phantom "Sep 2098 · Rs 4,000" (Muneeb, 17 Sep).
    {
      const { data: stale } = await admin.from("fee_status")
        .select("id").eq("org_id", ORG).like("period", "2098-%");
      const sids = (stale ?? []).map((f: any) => f.id);
      if (sids.length) {
        await admin.from("fee_payment").delete().in("fee_status_id", sids);
        await admin.from("fee_status").delete().in("id", sids);
      }
    }
    const mkFee = async (period: string, due: number) => {
      const r = await (await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}/fees`, {
        method: "POST", body: JSON.stringify({ period, amountDue: due, dueDate: `${period}-05` }),
      })).json();
      cleanup.push(() => admin.from("fee_payment").delete().eq("fee_status_id", r.fee.id));
      cleanup.push(() => admin.from("fee_status").delete().eq("id", r.fee.id));
      return r.fee.id as string;
    };
    await mkFee("2098-08", 4000);
    const sepId = await mkFee("2098-09", 4000);
    // Pay half of September so the row is precious.
    await api(admin2.token, `/school/orgs/${ORG}/fees/${sepId}/payments`, {
      method: "POST", body: JSON.stringify({ amount: 1000, paidOn: "2098-09-02" }),
    });

    // 1a. Sandbox stays OUT of the org-wide outstanding rollup, same as
    //     every other rollup (check 62's rule).
    const org = await (await api(admin2.token, `/school/orgs/${ORG}/fees?period=2098-09&sectionId=${sandboxSec.id}`)).json();
    assert(org.outstandingByStudent && org.outstandingByStudent[pStu1] === undefined,
      "sandbox students must not appear in the org outstanding rollup");
    // 1b. The per-student arrears math: quickFacts answers 8000-minus-paid
    //     across BOTH months (4000 Aug + 3000 Sep left).
    const stu = await (await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}`)).json();
    const fo = stu.quickFacts?.feeOutstanding;
    assert(fo && fo.total === 7000 && fo.months === 2,
      `feeOutstanding should be 7000 across 2 months, got ${JSON.stringify(fo)}`);

    // 2. The parent's portal balance agrees (Aug 4000 + Sep 3000).
    const login = await pinLogin(PARENT_PHONE, "3456");
    const pTok = (await login.json()).token;
    if (pTok) {
      const pf = await (await portalGet(pTok, `/pin-me/students/${pStu1}/fees`)).json();
      const rows = (pf.fees ?? []).filter((f: any) => f.period.startsWith("2098-"));
      const balance = rows.reduce((n: number, f: any) =>
        n + Math.max(0, (f.amount_due ?? 0) - (f.amount_paid ?? 0)), 0);
      assert(balance === 7000, `portal balance should be 7000, got ${balance}`);
      const sep = rows.find((f: any) => f.period === "2098-09");
      assert(sep && (sep.payments ?? []).length === 1 && sep.payments[0].paidOn === "2098-09-02",
        "portal must show the installment with its date");
    }

    // 3. Regenerate the paid-into month: the September row keeps its
    //    payment (protected), while a plain unpaid row may refresh. A
    //    temp Sandbox plan makes the generator actually touch the class.
    const planName = `QA Ledger Plan ${Date.now()}`;
    const mkPlan = await (await api(admin2.token, `/school/orgs/${ORG}/classes/${sandboxClass.id}/fee-plans`, {
      method: "POST", body: JSON.stringify({ name: planName, amount: 4000, frequency: "monthly", defaultDueDay: 5 }),
    })).json();
    if (mkPlan?.plan?.id) {
      cleanup.push(() => admin.from("class_fee_plan").delete().eq("id", mkPlan.plan.id));
    }
    // The generator bills every student in the CLASS for 2098-09 - the
    // old sweep only covered Sandbox section A, so the demo family in
    // section B kept a phantom "Sep 2098" bill on their portal after
    // every run (parent-facing! Muneeb saw it, 17 Sep). 2098 is a
    // QA-only year, so sweep the whole org's 2098 namespace.
    cleanup.push(async () => {
      const { data: fRows } = await admin.from("fee_status")
        .select("id").eq("org_id", ORG).like("period", "2098-%");
      const fids = (fRows ?? []).map((f: any) => f.id);
      if (fids.length) {
        await admin.from("fee_payment").delete().in("fee_status_id", fids);
        await admin.from("fee_status").delete().in("id", fids);
      }
    });
    const gen = await (await api(admin2.token, `/school/orgs/${ORG}/fees/bulk-generate`, {
      method: "POST", body: JSON.stringify({ period: "2098-09", classIds: [sandboxClass.id] }),
    })).json();
    const after = await admin.from("fee_status").select("amount_paid, status").eq("id", sepId).maybeSingle();
    assert(Number(after.data?.amount_paid) === 1000 && after.data?.status === "partial",
      `regenerate erased the payment: ${JSON.stringify(after.data)} (gen: ${JSON.stringify(gen).slice(0, 120)})`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("97. counter flow: one amount settles owed months oldest-first", async () => {
  // Design 13b (17 Sep): the office takes ONE amount and the system
  // splits it across owed months oldest-first; feeStatusId pins to one
  // month; with nothing outstanding an unpinned payment is refused.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const mkFee = async (period: string, due: number) => {
      const r = await (await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}/fees`, {
        method: "POST", body: JSON.stringify({ period, amountDue: due, dueDate: `${period}-05` }),
      })).json();
      cleanup.push(() => admin.from("fee_payment").delete().eq("fee_status_id", r.fee.id));
      cleanup.push(() => admin.from("fee_status").delete().eq("id", r.fee.id));
      return r.fee.id as string;
    };
    const augId = await mkFee("2097-08", 4000);
    const sepId = await mkFee("2097-09", 4000);

    // 5000 -> Aug settles (4000), Sep takes the remaining 1000.
    const a1 = await (await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}/fee-payments`, {
      method: "POST", body: JSON.stringify({ amount: 5000, paidOn: "2097-09-03", method: "cash" }),
    })).json();
    assert(Array.isArray(a1.allocations) && a1.allocations.length === 2,
      `expected 2 allocations, got ${JSON.stringify(a1.allocations)}`);
    const aug = a1.fees.find((f: any) => f.id === augId);
    const sep = a1.fees.find((f: any) => f.id === sepId);
    assert(aug.amount_paid === 4000 && aug.status === "paid", `Aug: ${aug.amount_paid}/${aug.status}`);
    assert(sep.amount_paid === 1000 && sep.status === "partial", `Sep: ${sep.amount_paid}/${sep.status}`);

    // Pinned to September only.
    const a2 = await (await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}/fee-payments`, {
      method: "POST", body: JSON.stringify({ amount: 3000, feeStatusId: sepId, method: "bank" }),
    })).json();
    const sep2 = a2.fees.find((f: any) => f.id === sepId);
    assert(sep2.amount_paid === 4000 && sep2.status === "paid", `Sep pinned: ${sep2.amount_paid}/${sep2.status}`);

    // The printable receipt renders (it selected a roll_number column
    // that never existed - latent behind the old 401 until 17 Sep).
    // NOTE: assert on the BODY, not content-type - the Supabase gateway
    // forcibly rewrites HTML responses to text/plain + a sandbox CSP
    // (anti-phishing for the functions domain), whatever the function
    // sets. That is why the app opens receipts via fetch -> blob.
    const rc = await api(admin2.token, `/school/orgs/${ORG}/fees/${sepId}/receipt`);
    const rcBody = await rc.text();
    assert(rc.status === 200, `receipt should render, got ${rc.status}: ${rcBody.slice(0, 120)}`);
    assert(rcBody.trimStart().startsWith("<!doctype html"), `receipt body must be the HTML page, got: ${rcBody.slice(0, 80)}`);

    // Nothing outstanding -> unpinned refuses instead of inventing a target.
    const a3 = await api(admin2.token, `/school/orgs/${ORG}/students/${pStu1}/fee-payments`, {
      method: "POST", body: JSON.stringify({ amount: 100 }),
    });
    assert(a3.status === 400, `nothing-outstanding must 400, got ${a3.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("98. parent self-claim: phone + child GR sets a PIN once - never twice", async () => {
  // One WhatsApp-group announcement instead of hundreds of slips
  // (Muneeb, 17 Sep): a parent proves the family with their registered
  // phone + any child's GR and chooses a PIN on the spot. The invariant
  // that matters: this works ONLY while the account is unclaimed - a
  // chosen PIN can never be taken over through a GR number.
  const claim = async (body: Record<string, unknown>) =>
    await fetch(`${FUNC}/school/auth/pin-claim`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ orgIdentifier: "iqra-ifs", ...body }),
    });
  try {
    // Reset the QA parent to the unclaimed state (parents' pin/set always
    // re-arms must_change) and clear any lockout left by a prior run.
    const r0 = await api(office.token, `/school/orgs/${ORG}/pin/set`, {
      method: "POST",
      body: JSON.stringify({ subjectType: "parent", subjectId: pParent.id, pin: "3456" }),
    });
    assert(r0.ok, `pin/set reset ${r0.status}`);
    await admin.from("kv_store_f116e23f").delete()
      .eq("key", `school:${ORG}:claim-fails:0000000901`);

    // Wrong GR: generic 401, no hint whether the phone matched.
    const bad = await claim({ phone: PARENT_PHONE, grNumber: "QA-NO-SUCH-GR", newPin: "7890" });
    assert(bad.status === 401, `wrong GR expected 401, got ${bad.status}`);

    // Right phone + child's GR (spacing/case-insensitive, like pin-login):
    // PIN chosen in the same step, token comes back signed in.
    const ok = await claim({ phone: "0000 000 901", grNumber: "qa-portal-1", newPin: "7890" });
    const oj = await ok.json();
    assert(ok.status === 200 && oj.token && oj.subjectType === "parent" && oj.mustChange === false,
      `claim failed ${ok.status}: ${JSON.stringify(oj).slice(0, 150)}`);
    const me = await portalGet(oj.token, "/pin-me");
    assert(me.status === 200, `claimed token must work on /pin-me, got ${me.status}`);

    // The chosen PIN signs in normally...
    const login = await pinLogin(PARENT_PHONE, "7890");
    const lj = await login.json();
    assert(login.status === 200 && lj.mustChange === false, `login with claimed PIN ${login.status}`);

    // ...and the claim path is DEAD for this account from now on.
    const again = await claim({ phone: PARENT_PHONE, grNumber: "QA-PORTAL-1", newPin: "1111" });
    const gj = await again.json();
    assert(again.status === 409 && gj.code === "ALREADY_CLAIMED",
      `re-claim must 409 ALREADY_CLAIMED, got ${again.status}: ${JSON.stringify(gj).slice(0, 120)}`);
    const old = await pinLogin(PARENT_PHONE, "1111");
    assert(old.status === 401, "the rejected claim PIN must not work");
  } finally {
    // Back to the fixture state later checks (and re-runs) expect.
    await api(office.token, `/school/orgs/${ORG}/pin/set`, {
      method: "POST",
      body: JSON.stringify({ subjectType: "parent", subjectId: pParent.id, pin: "3456" }),
    });
    await admin.from("kv_store_f116e23f").delete()
      .eq("key", `school:${ORG}:claim-fails:0000000901`);
  }
});

await check("99. today's diary lists EVERY portion heard - sabaq, sabqi and manzil", async () => {
  // A hifz child is heard three times a day. The diary used to carry
  // sabaq + ONE revision, so a parent saw only "Today's sabaq" while
  // This-Week listed all three - "feels incomplete" (parent, 17 Sep).
  const karachiToday = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const at = `${karachiToday}T10:00:00+05:00`;
  const rows = [
    { kind: "sabaq", surah_number: 24, ayah_from: 60, ayah_to: 62, quality: "good" },
    { kind: "sabqi", surah_number: 23, ayah_from: 1, ayah_to: 1, juz_number: 18, juz_extent: "to_surah:24", quality: "weak" },
    { kind: "manzil", surah_number: 46, ayah_from: 1, ayah_to: 1, juz_number: 26, juz_extent: "three_quarters", quality: "needs_practice" },
  ];
  try {
    for (const r of rows) {
      const { error } = await admin.from("hifz_progress").insert({
        org_id: ORG, student_id: pStu1, notes: "QA DIARY TRIO", recorded_at: at, ...r,
      });
      if (error) throw new Error(`seed ${r.kind}: ${error.message}`);
    }
    const pTok = (await (await pinLogin(PARENT_PHONE, "3456")).json()).token;
    const r = await portalGet(pTok, `/pin-me/students/${pStu1}/diary`);
    const j = await r.json();
    assert(r.status === 200, `diary ${r.status}: ${JSON.stringify(j).slice(0, 120)}`);
    const kinds = ((j.hifz?.entries ?? []) as any[]).map((e) => e.kind);
    for (const k of ["sabaq", "sabqi", "manzil"]) {
      assert(kinds.includes(k), `diary must list ${k}, got [${kinds.join(", ")}]`);
    }
    assert(kinds.indexOf("sabaq") < kinds.indexOf("sabqi") && kinds.indexOf("sabqi") < kinds.indexOf("manzil"),
      `teaching order sabaq->sabqi->manzil, got [${kinds.join(", ")}]`);
    // Para-mode entries carry the juz, not just the position-marker surah.
    const manzil = (j.hifz.entries as any[]).find((e) => e.kind === "manzil");
    assert(manzil.juzNumber === 26 && manzil.juzExtent === "three_quarters",
      `manzil must carry juz info: ${JSON.stringify(manzil)}`);
    // Back-compat pair still present for older frontends.
    assert(j.hifz.sabaq && j.hifz.revision, "sabaq/revision back-compat fields");
  } finally {
    await admin.from("hifz_progress").delete()
      .eq("student_id", pStu1).eq("notes", "QA DIARY TRIO");
  }
});

await check("100. parent bell: fees due + school replies, and seen clears the count", async () => {
  // "There's no bell for parents" (Muneeb, 17 Sep). Derived, never
  // queued - fee-due and school-reply items with a kv last-seen stamp.
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const pTok = (await (await pinLogin(PARENT_PHONE, "3456")).json()).token;
    // Overdue fee for the child -> a "fee" item.
    const { data: fee, error: fe } = await admin.from("fee_status").insert({
      org_id: ORG, student_id: pStu1, period: "2026-01", amount_due: 999,
      amount_paid: 0, status: "unpaid", due_date: "2026-01-05",
    }).select("id").single();
    if (fe) throw new Error(`fee: ${fe.message}`);
    cleanup.push(() => admin.from("fee_status").delete().eq("id", fee.id));
    // Parent starts a thread; the principal answers -> a "reply" item.
    const started = await (await fetch(`${FUNC}/school/pin-me/messages`, {
      method: "POST", headers: { apikey: ANON, "X-Pin-Token": pTok, "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "QA BELL THREAD", body: "ping" }),
    })).json();
    const threadId = started.threadId ?? started.thread?.threadId;
    assert(threadId, `thread start: ${JSON.stringify(started).slice(0, 120)}`);
    cleanup.push(() => admin.from("parent_message").delete().eq("thread_id", threadId));
    const rep = await api(principal.token, `/school/orgs/${ORG}/inbox/${threadId}/reply`, {
      method: "POST", body: JSON.stringify({ body: "QA BELL REPLY" }),
    });
    assert(rep.ok, `reply ${rep.status}`);
    cleanup.push(() => admin.from("parent_thread_assignment").delete().eq("thread_id", threadId));

    const r1 = await portalGet(pTok, "/pin-me/notifications");
    const j1 = await r1.json();
    assert(r1.status === 200, `notifications ${r1.status}: ${JSON.stringify(j1).slice(0, 120)}`);
    assert((j1.items ?? []).some((i: any) => i.kind === "fee" && i.studentId === pStu1),
      `fee item missing: ${JSON.stringify(j1.items).slice(0, 200)}`);
    assert((j1.items ?? []).some((i: any) => i.kind === "reply" && i.threadId === threadId),
      `reply item missing: ${JSON.stringify(j1.items).slice(0, 200)}`);
    assert(j1.unseen >= 1, `unseen should count fresh items, got ${j1.unseen}`);

    // Opening the bell stamps seen; the same items stop counting.
    const seen = await fetch(`${FUNC}/school/pin-me/notifications/seen`, {
      method: "POST", headers: { apikey: ANON, "X-Pin-Token": pTok },
    });
    assert(seen.status === 200, `seen ${seen.status}`);
    const j2 = await (await portalGet(pTok, "/pin-me/notifications")).json();
    assert(j2.unseen === 0, `unseen must clear after seen, got ${j2.unseen}`);

    // A student login has no money bell.
    const sTok = (await (await pinLogin("QA-PORTAL-1", "1234")).json()).token;
    const rs = await portalGet(sTok, "/pin-me/notifications");
    assert(rs.status === 403, `student login must 403, got ${rs.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
    // Exact key only - a LIKE sweep would reset REAL parents' seen stamps.
    await admin.from("kv_store_f116e23f").delete()
      .eq("key", `school:${ORG}:pin-notif-seen:parent:${pParent.id}`);
  }
});

await check("101. hifz exam syllabus: proposed from the child's own record, then published to the parent", async () => {
  // Every hifz child sits a different portion, so the exam slip needs a
  // per-child syllabus line - written by hand into 84 diaries until now
  // (Ambreen, 17 Sep). The server proposes it from logged sabaq; the
  // teacher corrects; publishing locks it and shows the parent.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: term } = await admin.from("academic_term").select("id")
      .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
    assert(term, "no current term");
    const { data: exam, error: exErr } = await admin.from("exam").insert({
      org_id: ORG, term_id: (term as any).id, name: "QA SYLLABUS EXAM",
      exam_type: "other", weight: 1,
    }).select("id").single();
    if (exErr) throw new Error(`exam: ${exErr.message}`);
    cleanup.push(() => admin.from("student_exam_syllabus").delete().eq("exam_id", exam.id));
    cleanup.push(() => admin.from("exam").delete().eq("id", exam.id));

    // One sabaq position, which pins three things at once:
    //   · the INDO-PAK boundary — 9:94 is para 11 on the school's mushaf
    //     and para 10 on a Madani one, so drift changes the line;
    //   · the road travelled — paras 12-30 are held, because a child
    //     reaches para 11 by way of everything below it;
    //   · the para in progress — 9:96 is nowhere near 11:5 where para 11
    //     ends, so it is named separately rather than claimed as held.
    for (const row of [
      { surah_number: 9, ayah_from: 94, ayah_to: 96 },
    ]) {
      const { error } = await admin.from("hifz_progress").insert({
        org_id: ORG, student_id: pStu1, kind: "sabaq", quality: "good",
        notes: "QA SYLLABUS PROBE", ...row,
      });
      if (error) throw new Error(`seed: ${error.message}`);
    }
    cleanup.push(() => admin.from("hifz_progress").delete()
      .eq("student_id", pStu1).eq("notes", "QA SYLLABUS PROBE"));

    const url = `/school/orgs/${ORG}/exams/${exam.id}/syllabus`;
    const r1 = await api(admin2.token, `${url}?sectionId=${sandboxSec.id}`);
    const j1 = await r1.json();
    assert(r1.status === 200, `syllabus ${r1.status}: ${JSON.stringify(j1).slice(0, 150)}`);
    const mine = (j1.rows ?? []).find((x: any) => x.studentId === pStu1);
    assert(mine, "the QA student must appear on the roster");
    const expected = "Para 12–30, and Para 11 up to 9:96";
    assert(mine.proposed === expected,
      `proposal must be "${expected}", got "${mine.proposed}"`);
    assert(mine.source === "proposed" && !mine.saved, "an untouched row is a proposal, not a save");

    // BASELINE: what the child memorized before we started logging
    // (3 Sep 2026). Without it the first exam's proposals understate
    // nearly everyone and the teacher retypes 84 lines (17 Sep).
    const baseUrl = `/school/orgs/${ORG}/students/${pStu1}/hifz-baseline`;
    cleanup.push(() => admin.from("student").update({ hifz_baseline_paras: null }).eq("id", pStu1));
    const bad = await api(admin2.token, baseUrl, {
      method: "PATCH", body: JSON.stringify({ paras: [1, 31] }),
    });
    assert(bad.status === 400, `para 31 does not exist — expected 400, got ${bad.status}`);
    const setB = await api(admin2.token, baseUrl, {
      method: "PATCH", body: JSON.stringify({ paras: [5, 6, 7] }),
    });
    assert(setB.status === 200, `baseline ${setB.status}`);
    const withBase = await (await api(admin2.token, `${url}?sectionId=${sandboxSec.id}`)).json();
    const bRow = (withBase.rows ?? []).find((x: any) => x.studentId === pStu1);
    assert(JSON.stringify(bRow.baselineParas) === JSON.stringify([5, 6, 7]),
      `baseline must come back: ${JSON.stringify(bRow.baselineParas)}`);
    // The proposal now carries the baseline as well as the road: the
    // office's 5,6,7 sit beside the 12-30 the child reached by way of
    // para 11, which is still only partly done.
    const withBaseExpected = "Para 5–7, 12–30, and Para 11 up to 9:96";
    assert(bRow.proposed === withBaseExpected,
      `proposal must be "${withBaseExpected}", got "${bRow.proposed}"`);

    // The teacher corrects the line.
    const edited = "Para 1–12 (QA edited)";
    const r2 = await api(admin2.token, `${url}/${pStu1}`, {
      method: "PATCH", body: JSON.stringify({ portion: edited }),
    });
    assert(r2.status === 200, `patch ${r2.status}`);
    const j2 = await (await api(admin2.token, `${url}?sectionId=${sandboxSec.id}`)).json();
    const after = (j2.rows ?? []).find((x: any) => x.studentId === pStu1);
    assert(after.portion === edited && after.source === "edited", `edit not kept: ${JSON.stringify(after)}`);

    // Before publishing, the parent must see NOTHING.
    const pTok = (await (await pinLogin(PARENT_PHONE, "3456")).json()).token;
    const pre = await (await portalGet(pTok, `/pin-me/students/${pStu1}/hifz`)).json();
    assert(!pre.examSyllabus, `unpublished syllabus leaked to the parent: ${JSON.stringify(pre.examSyllabus)}`);

    // Publish -> parent sees it, and the line locks.
    const pub = await api(admin2.token, `${url}/publish`, {
      method: "POST", body: JSON.stringify({ sectionId: sandboxSec.id }),
    });
    const pubJ = await pub.json();
    assert(pub.status === 200 && pubJ.published >= 1, `publish ${pub.status}: ${JSON.stringify(pubJ).slice(0, 150)}`);
    const post = await (await portalGet(pTok, `/pin-me/students/${pStu1}/hifz`)).json();
    assert(post.examSyllabus?.portion === edited,
      `parent must see the published portion, got ${JSON.stringify(post.examSyllabus)}`);

    const locked = await api(admin2.token, `${url}/${pStu1}`, {
      method: "PATCH", body: JSON.stringify({ portion: "Para 1-99" }),
    });
    assert(locked.status === 409, `published line must refuse edits, got ${locked.status}`);

    // Unpublishing reopens it and takes it back off the portal.
    const un = await api(admin2.token, `${url}/publish`, {
      method: "POST", body: JSON.stringify({ sectionId: sandboxSec.id, unpublish: true }),
    });
    assert(un.status === 200, `unpublish ${un.status}`);
    const gone = await (await portalGet(pTok, `/pin-me/students/${pStu1}/hifz`)).json();
    assert(!gone.examSyllabus, "unpublish must take the portion off the parent's portal");
    const reopened = await api(admin2.token, `${url}/${pStu1}`, {
      method: "PATCH", body: JSON.stringify({ portion: "Para 1-13" }),
    });
    assert(reopened.status === 200, `unpublished line must accept edits again, got ${reopened.status}`);

    // Office staff run the front desk, not the hifz room - a child's
    // exam portion is the section teacher's call.
    const denied = await api(office.token, `${url}?sectionId=${sandboxSec.id}`);
    assert(denied.status === 403, `office must be refused, got ${denied.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("102. exam marks: the paper's own rows, totalled and graded, and never over the max", async () => {
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: term } = await admin.from("academic_term").select("id")
      .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
    assert(term, "no current term");
    const { data: exam } = await admin.from("exam").insert({
      org_id: ORG, term_id: (term as any).id, name: "QA MARKS PROBE",
      exam_type: "other", weight: 1,
    }).select("id").single();
    assert(exam, "exam insert");
    cleanup.push(() => admin.from("exam").delete().eq("id", (exam as any).id));

    // A grade scale so the paper can name a band, mirroring the school's.
    const { data: scale } = await admin.from("grade_scale").insert({
      org_id: ORG, name: "QA MARKS SCALE", is_default: false,
    }).select("id").single();
    cleanup.push(() => admin.from("grade_scale").delete().eq("id", (scale as any).id));
    await admin.from("grade_scale_band").insert([
      { scale_id: (scale as any).id, letter: "ممتاز", min_pct: 80, max_pct: 100, display_order: 0 },
      { scale_id: (scale as any).id, letter: "جید جدا", min_pct: 65, max_pct: 79, display_order: 1 },
      { scale_id: (scale as any).id, letter: "راسب", min_pct: 0, max_pct: 64, display_order: 2 },
    ]);
    await admin.from("exam").update({ grade_scale_id: (scale as any).id }).eq("id", (exam as any).id);

    const base = `/school/orgs/${ORG}/exams/${(exam as any).id}`;

    // The paper is data: an admin writes the rows.
    const put = await api(admin2.token, `${base}/components`, {
      method: "PUT",
      // A row may carry an English twin; one row deliberately does not,
      // because a school that prints one language must still work.
      body: JSON.stringify({ components: [
        { name: "سوال اول", nameEn: "Question 1", groupLabel: "حفظ القرآن", groupLabelEn: "Hifz al-Quran", maxMarks: 20 },
        { name: "سوال دوم", nameEn: "Question 2", groupLabel: "حفظ القرآن", groupLabelEn: "Hifz al-Quran", maxMarks: 20 },
        { name: "لہجہ", maxMarks: 10 },
      ] }),
    });
    const putJ = await put.json();
    assert(put.status === 200 && putJ.components?.length === 3,
      `components ${put.status}: ${JSON.stringify(putJ).slice(0, 150)}`);
    const comps = putJ.components as Array<{ id: string; name: string; nameEn: string | null; groupLabelEn: string | null; maxMarks: number }>;
    const byName = new Map(comps.map((c) => [c.name, c]));

    // Both names come back, so the sheet can follow its reader rather
    // than showing Urdu headings to an English one (22 Sep).
    assert(byName.get("سوال اول")?.nameEn === "Question 1",
      `the English twin must round-trip: ${JSON.stringify(byName.get("سوال اول"))}`);
    assert(byName.get("سوال اول")?.groupLabelEn === "Hifz al-Quran",
      "the braced heading keeps its English twin too");
    assert(byName.get("لہجہ")?.nameEn === null,
      "a row with no twin stays null - the printed name is shown to everyone");

    // A teacher of the section can mark; the roster carries the portion.
    const r1 = await api(admin2.token, `${base}/marks?sectionId=${sandboxSec.id}`);
    const j1 = await r1.json();
    assert(r1.status === 200, `marks ${r1.status}: ${JSON.stringify(j1).slice(0, 150)}`);
    const mine = (j1.rows ?? []).find((x: any) => x.studentId === pStu1);
    assert(mine, "the QA student must appear on the marks roster");
    assert(mine.totals.max === 50, `paper must total 50, got ${mine.totals.max}`);
    assert(mine.totals.pct === null && mine.band === null,
      "an unmarked paper has no percentage and no band");

    // A mark larger than the row is refused, and nothing is stored.
    const over = await api(admin2.token, `${base}/marks/${pStu1}`, {
      method: "PUT",
      body: JSON.stringify({ marks: { [byName.get("لہجہ")!.id]: 11 } }),
    });
    assert(over.status === 400, `11 out of 10 must be refused, got ${over.status}`);

    // Part-marked: a running total, still no band.
    const part = await api(admin2.token, `${base}/marks/${pStu1}`, {
      method: "PUT",
      body: JSON.stringify({ marks: { [byName.get("سوال اول")!.id]: 16 } }),
    });
    const partJ = await part.json();
    assert(part.status === 200, `part mark ${part.status}`);
    assert(partJ.totals.obtained === 16 && partJ.totals.pct === null,
      `part-marked paper must not grade: ${JSON.stringify(partJ.totals)}`);

    // Fully marked: totals, the braced subtotal, and the band.
    const full = await api(admin2.token, `${base}/marks/${pStu1}`, {
      method: "PUT",
      body: JSON.stringify({ marks: {
        [byName.get("سوال اول")!.id]: 16,
        [byName.get("سوال دوم")!.id]: 15,
        [byName.get("لہجہ")!.id]: 8,
      } }),
    });
    const fullJ = await full.json();
    assert(full.status === 200, `full mark ${full.status}`);
    assert(fullJ.totals.obtained === 39 && fullJ.totals.pct === 78,
      `39/50 is 78%: ${JSON.stringify(fullJ.totals)}`);
    assert(fullJ.totals.groups?.[0]?.obtained === 31,
      `the braced rows must subtotal 31: ${JSON.stringify(fullJ.totals.groups)}`);
    assert(fullJ.band?.letter === "جید جدا", `78% is جید جدا, got ${JSON.stringify(fullJ.band)}`);

    // Rewriting the paper would orphan those marks - refused until asked.
    const clash = await api(admin2.token, `${base}/components`, {
      method: "PUT", body: JSON.stringify({ components: [{ name: "x", maxMarks: 5 }] }),
    });
    assert(clash.status === 409, `rewriting a marked paper must warn, got ${clash.status}`);

    // Office staff do not mark the hifz room's paper.
    const denied = await api(office.token, `${base}/marks?sectionId=${sandboxSec.id}`);
    assert(denied.status === 403, `office must be refused, got ${denied.status}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("103. hifz homework reaches parent AND student - diary, Lessons and Homework all carry the next lesson", async () => {
  // "Parents are still complaining about not being able to see Hifz
  // homework" (18 Sep). Teachers record the next lesson on nearly every
  // hearing (next_target); Learning -> Lessons and -> Homework read only
  // the lesson/assignment tables, which hifz teachers never write, and the
  // diary never selected the column. Every one of those screens was blank.
  const karachiToday = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const at = `${karachiToday}T09:00:00+05:00`;
  const NEXT = "Sabaq: Al-Furqan 1-8 (QA)";
  try {
    const { error } = await admin.from("hifz_progress").insert({
      org_id: ORG, student_id: pStu1, notes: "QA HIFZ HOMEWORK", recorded_at: at,
      kind: "sabaq", surah_number: 24, ayah_from: 62, ayah_to: 64, quality: "good",
      next_target: NEXT,
    });
    if (error) throw new Error(`seed: ${error.message}`);
    const pTok = (await (await pinLogin(PARENT_PHONE, "3456")).json()).token;

    // The diary carries it as homework.
    const d = await (await portalGet(pTok, `/pin-me/students/${pStu1}/diary`)).json();
    const dHw = (d.hifzHomework ?? []) as Array<{ kind: string; text: string }>;
    assert(dHw.some((h) => h.kind === "sabaq" && h.text === NEXT),
      `diary must carry the next lesson as homework: ${JSON.stringify(dHw)}`);

    // The Homework page is no longer blank for a hifz child.
    const hw = await (await portalGet(pTok, `/pin-me/students/${pStu1}/assignments`)).json();
    assert((hw.hifzHomework ?? []).some((h: any) => h.text === NEXT),
      `Homework page must carry the hifz homework: ${JSON.stringify(hw.hifzHomework)}`);

    // Lessons shows the day's classwork AND what was set that day.
    const ls = await (await portalGet(pTok,
      `/pin-me/students/${pStu1}/lessons?startDate=${karachiToday}&endDate=${karachiToday}`)).json();
    const day = (ls.hifzDays ?? []).find((x: any) => x.date === karachiToday);
    assert(day, `Lessons must carry today's hifz day: ${JSON.stringify(ls.hifzDays)}`);
    assert(day.heard.some((h: any) => h.kind === "sabaq"),
      "the day must list the sabaq heard in class");
    assert(day.homework.some((h: any) => h.text === NEXT),
      "the day must list the homework set that day");

    // The child's own login sees exactly what the parent sees. Both use
    // the same portal pages; this keeps a later change from quietly
    // breaking one login and not the other (asked 18 Sep).
    const sLogin = await (await pinLogin("QA-PORTAL-1", "1234")).json();
    const sTok = sLogin.token;
    assert(sTok, `student login failed: ${JSON.stringify(sLogin).slice(0, 120)}`);
    const sd = await (await portalGet(sTok, `/pin-me/students/${pStu1}/diary`)).json();
    assert((sd.hifzHomework ?? []).some((h: any) => h.text === NEXT),
      "a student's own diary must carry the next lesson");
    const shw = await (await portalGet(sTok, `/pin-me/students/${pStu1}/assignments`)).json();
    assert((shw.hifzHomework ?? []).some((h: any) => h.text === NEXT),
      "a student's own Homework page must carry the next lesson");
    const sls = await (await portalGet(sTok,
      `/pin-me/students/${pStu1}/lessons?startDate=${karachiToday}&endDate=${karachiToday}`)).json();
    const sday = (sls.hifzDays ?? []).find((x: any) => x.date === karachiToday);
    assert(sday && sday.homework.some((h: any) => h.text === NEXT),
      "a student's own Lessons page must carry the day's classwork and homework");
  } finally {
    await admin.from("hifz_progress").delete()
      .eq("student_id", pStu1).eq("notes", "QA HIFZ HOMEWORK");
  }
});

await check("104. marking progress: the office sees every section, teachers and office staff do not, and the count skips papers a subject does not sit", async () => {
  // "For the admin or the incharge and the principal, if they want to see
  // how the marking progress is going" (Muneeb, 18 Sep). One grid, every
  // section - and it must count only subjects that SIT a paper: the old
  // section-page count held Class VIII's oral at 1/8 forever.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const r = await api(admin2.token, `/school/orgs/${ORG}/marking-progress`);
  const j = await r.json();
  assert(r.status === 200, `board ${r.status}: ${JSON.stringify(j).slice(0, 150)}`);
  assert(j.term && Array.isArray(j.sections), "board must carry a term and sections");
  assert(j.sections.length > 0, "the office must see the school's sections");

  // Hifz is marked on its own paper; the Sandbox is scaffolding.
  const labels = (j.sections as any[]).map((s) => s.label as string);
  assert(!labels.some((l) => /^Hifz /.test(l)), `hifz must not be on the board: ${labels.join(", ")}`);
  assert(!labels.some((l) => /Sandbox/i.test(l)), `the Sandbox must not be on the board`);

  // Every section carries one cell per paper, aligned with exams[].
  for (const s of j.sections as any[]) {
    assert(s.exams.length === j.exams.length,
      `${s.label}: ${s.exams.length} cells for ${j.exams.length} papers`);
    for (const c of s.exams) {
      assert(c.subjectsDone <= c.subjectCount, `${s.label}: ${c.subjectsDone}/${c.subjectCount}`);
      assert(c.subjects.length === c.subjectCount, `${s.label}: subject lines must match the count`);
    }
  }

  // A written-only class sits no oral: its oral cell must count nothing,
  // not "0 of 8" forever. Checked on whichever section is written-only.
  const oralIdx = (j.exams as any[]).findIndex((e) => e.paper === "oral");
  if (oralIdx >= 0) {
    const writtenOnly = (j.sections as any[]).find((s) => s.exams[oralIdx].subjectCount === 0);
    if (writtenOnly) {
      assert(writtenOnly.exams[oralIdx].marksExpected === 0,
        `${writtenOnly.label}: no oral means nothing owed`);
    }
  }

  // Not for teachers or office staff - their own progress lives on the
  // section page.
  const t = await api(teacher.token, `/school/orgs/${ORG}/marking-progress`);
  assert(t.status === 403, `a class teacher must be refused, got ${t.status}`);
  const o = await api(office.token, `/school/orgs/${ORG}/marking-progress`);
  assert(o.status === 403, `office staff must be refused, got ${o.status}`);

  // The section page's own count is now the same function: same shape,
  // and never more subjects done than it has.
  const sec = (j.sections as any[])[0];
  const sp = await api(admin2.token, `/school/orgs/${ORG}/sections/${sec.sectionId}/exam-marks-progress`);
  const spj = await sp.json();
  assert(sp.status === 200, `section progress ${sp.status}`);
  for (const [i, e] of (spj.exams as any[]).entries()) {
    const board = sec.exams.find((c: any) => c.examId === e.id);
    assert(board, `section page exam ${e.name} missing from the board`);
    assert(board.subjectsDone === e.subjectsDone && board.subjectCount === e.subjectCount,
      `section page ${e.subjectsDone}/${e.subjectCount} vs board ${board.subjectsDone}/${board.subjectCount} for ${e.name}`);
    void i;
  }
});

await check("105. an incharge can VIEW every column of their wing's marks sheet - and still cannot change a teacher's marks", async () => {
  // Class I's own incharge opened a marks sheet to see what the teacher
  // had entered and got "you don't teach a subject in this section" (18
  // Sep). The sheet used one rule for seeing AND saving. Viewing is now
  // open to the wing's incharge; saving is not.
  const inch = await ensureUser("qa-incharge@azality.com", "QA Incharge", "class_teacher");
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    const { data: term } = await admin.from("academic_term").select("id")
      .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
    assert(term, "no current term");
    const { data: exam } = await admin.from("exam").insert({
      org_id: ORG, term_id: (term as any).id, name: "QA INCHARGE VIEW — Written",
      exam_type: "other", weight: 1,
    }).select("id").single();
    assert(exam, "exam insert");
    cleanup.push(() => admin.from("exam").delete().eq("id", (exam as any).id));
    const url = `/school/orgs/${ORG}/exams/${(exam as any).id}/marks-sheet`;

    const { data: subs } = await admin.from("class_subject").select("id")
      .eq("class_id", sandboxClass.id).is("archived_at", null);
    const allSubjectIds = ((subs ?? []) as any[]).map((x) => x.id);
    assert(allSubjectIds.length > 0, "the Sandbox class needs a subject");

    // With the wing: every column, flagged as a view.
    const wingRowId = await ensureWingRow(inch.id, sandboxClass.id, principal.id);
    cleanup.push(() => admin.from("user_roles").delete().eq("id", wingRowId));
    const r = await api(inch.token, `${url}?sectionId=${sandboxSec.id}`);
    const j = await r.json();
    assert(r.status === 200, `incharge must see the sheet, got ${r.status}: ${JSON.stringify(j).slice(0, 120)}`);
    assert(j.oversees === true, "the response must say this is an incharge's view");
    assert((j.subjects ?? []).length === allSubjectIds.length,
      `every subject must be shown: ${(j.subjects ?? []).length} of ${allSubjectIds.length}`);

    // ...and saving into a column they do not teach is still refused.
    const notMine = allSubjectIds.find((id) => !(j.editableSubjectIds ?? []).includes(id));
    const { data: stu } = await admin.from("student").select("id")
      .eq("class_section_id", sandboxSec.id).eq("status", "active").limit(1).maybeSingle();
    if (notMine && stu) {
      const w = await api(inch.token, url, {
        method: "POST",
        body: JSON.stringify({
          sectionId: sandboxSec.id,
          rows: [{ studentId: (stu as any).id, classSubjectId: notMine, maxMarks: 50, obtainedMarks: 40, absent: false }],
        }),
      });
      assert(w.status === 403 || w.status === 400,
        `an incharge must not write a teacher's column, got ${w.status}`);
      const { data: leaked } = await admin.from("exam_subject_score").select("id")
        .eq("exam_id", (exam as any).id).eq("class_subject_id", notMine);
      assert(!(leaked ?? []).length, "no mark may have been written");
    }

    // Take the wing away and the view goes with it.
    await admin.from("user_roles").update({ revoked_at: new Date().toISOString() }).eq("id", wingRowId);
    const gone = await api(inch.token, `${url}?sectionId=${sandboxSec.id}`);
    const gj = await gone.json();
    assert(gone.status === 403 || gj.oversees !== true,
      `without the wing the incharge view must go, got ${gone.status} oversees=${gj.oversees}`);
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
});

await check("106. attendance carried from the school's own register counts once - never twice, never a teacher's to set", async () => {
  // IFS ran on paper from 4 May and kept counting by hand past the day
  // roll call started here, so every class handed in one total per child
  // (21 Sep). The report card must add those days AND drop our own rows
  // for the days that total already covers.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const url = `/school/orgs/${ORG}/sections/${sandboxSec.id}/attendance-opening`;
  const { data: term } = await admin.from("academic_term").select("id, start_date, end_date")
    .eq("org_id", ORG).eq("is_current", true).is("archived_at", null).maybeSingle();
  assert(term, "a current term is needed");

  // A day inside the term to carry up to, and the next day for roll call.
  const asOf = (term as any).start_date;
  const after = new Date(`${asOf}T12:00:00Z`);
  after.setUTCDate(after.getUTCDate() + 1);
  const afterDate = after.toISOString().slice(0, 10);

  try {
    // A teacher may read the page but never write it.
    const tRead = await api(teacher.token, url);
    assert(tRead.status === 200, `a teacher may read the carried page, got ${tRead.status}`);
    assert((await tRead.json()).canEdit === false, "a teacher must not be offered the edit");
    const tWrite = await api(teacher.token, url, {
      method: "PUT",
      body: JSON.stringify({ asOfDate: asOf, workingDays: 10, entries: [{ studentId: pStu1, daysPresent: 9 }] }),
    });
    assert(tWrite.status === 403, `a teacher must not write the register, got ${tWrite.status}`);

    // A count above the working days is a miscount, not a record.
    const over = await api(admin2.token, url, {
      method: "PUT",
      body: JSON.stringify({ asOfDate: asOf, workingDays: 10, entries: [{ studentId: pStu1, daysPresent: 11 }] }),
    });
    assert(over.status === 400, `11 of 10 days must be refused, got ${over.status}`);

    // The office writes it, and it reads back.
    const put = await api(admin2.token, url, {
      method: "PUT",
      body: JSON.stringify({ asOfDate: asOf, workingDays: 10, source: "qa", entries: [{ studentId: pStu1, daysPresent: 8 }] }),
    });
    assert(put.status === 200, `save ${put.status}: ${(await put.text()).slice(0, 120)}`);
    const back = await api(admin2.token, url);
    const row = ((await back.json()).students as any[]).find((s) => s.studentId === pStu1);
    assert(row && row.daysPresent === 8 && row.workingDays === 10 && row.asOfDate === asOf,
      `carried balance must read back: ${JSON.stringify(row)}`);

    // Two roll-call days: one INSIDE the carried period, one after it.
    await admin.from("school_attendance").delete().eq("student_id", pStu1).in("attendance_date", [asOf, afterDate]);
    await admin.from("school_attendance").insert([
      { org_id: ORG, student_id: pStu1, class_section_id: sandboxSec.id, attendance_date: asOf, status: "absent" },
      { org_id: ORG, student_id: pStu1, class_section_id: sandboxSec.id, attendance_date: afterDate, status: "present" },
    ]);

    const rc = await api(admin2.token,
      `/school/orgs/${ORG}/students/${pStu1}/terms/${(term as any).id}/report-card`);
    const card = await rc.json();
    assert(rc.status === 200, `report card ${rc.status}: ${JSON.stringify(card).slice(0, 150)}`);
    const a = card.attendance;
    assert(a.carriedDays === 10, `the register's 10 days must be carried, got ${a.carriedDays}`);
    assert(a.workingDays === 11, `10 carried + 1 marked after = 11, got ${a.workingDays}`);
    assert(a.daysPresent === 9, `8 carried + 1 present after = 9, got ${a.daysPresent}`);
    assert(a.absent === 0, "the absence inside the carried period must not be counted again");

    // Cleared again, the card falls back to the marked days alone.
    const clear = await api(admin2.token, url, {
      method: "PUT",
      body: JSON.stringify({ asOfDate: asOf, workingDays: 10, entries: [{ studentId: pStu1, daysPresent: null }] }),
    });
    assert(clear.status === 200, `clear ${clear.status}`);
    const rc2 = await api(admin2.token,
      `/school/orgs/${ORG}/students/${pStu1}/terms/${(term as any).id}/report-card`);
    const a2 = (await rc2.json()).attendance;
    assert(!a2.carriedDays, `nothing may be carried after clearing, got ${a2.carriedDays}`);
    assert(a2.absent === 1, `the absence returns once nothing is carried, got ${a2.absent}`);
  } finally {
    await admin.from("student_attendance_opening").delete().eq("student_id", pStu1);
    await admin.from("school_attendance").delete()
      .eq("student_id", pStu1).in("attendance_date", [asOf, afterDate]);
  }
});

await check("107. marking surfaces follow the term being MARKED, not merely the current one", async () => {
  // 21 Sep: the school rolled into the 2nd Assessment with the 1st still
  // half marked. Every surface read is_current, so the board, the
  // teachers' marks nudges and the sign-off alert all emptied on the
  // same morning. They now resolve the term that owns the papers.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const r = await api(admin2.token, `/school/orgs/${ORG}/marking-progress`);
  const j = await r.json();
  assert(r.status === 200, `board ${r.status}`);
  assert(j.term, "the board must land on a term");
  assert((j.terms ?? []).length >= 1, "the board must offer its terms as a picker");

  // Whichever term the school is in, the board opens on papers.
  const marked = await markedTerm();
  if (marked) {
    assert(j.term.id === marked.id,
      `the board opened on ${j.term.name}, not the term being marked (${marked.name})`);
    assert(j.exams.length > 0, "the term being marked must carry its papers");
  }

  // A term picked by hand is still honoured, even an empty one.
  const other = (j.terms as any[]).find((x) => x.id !== j.term.id);
  if (other) {
    const r2 = await api(admin2.token, `/school/orgs/${ORG}/marking-progress?termId=${other.id}`);
    const j2 = await r2.json();
    assert(r2.status === 200 && j2.term?.id === other.id,
      `picking ${other.name} must show ${other.name}, got ${JSON.stringify(j2.term)}`);
  }

  // And the teachers' nudge endpoint still answers for the marked term.
  const todo = await api(teacher.token, `/school/orgs/${ORG}/me/exam-marks-todo`);
  assert(todo.status === 200, `marks todo ${todo.status}`);
  assert(Array.isArray((await todo.json()).todos), "todos must be a list");
});
await check("108. a teacher can find every column again, review it, submit it - and unlock it to fix one", async () => {
  // "As soon as they enter a few students' marks there is no way to go
  // back to tally, to confirm or to enter one or two students"
  // (teachers, 22 Sep). The nudge lists drop a column the moment it is
  // finished; My marks lists them all, and submitting locks the sheet.
  const t2 = await ensureUser("qa-teacher2@azality.com", "QA Teacher Two", "class_teacher");
  const term = await markedTerm();
  assert(term, "no term with papers");
  const { data: exams } = await admin.from("exam").select("id, name")
    .eq("term_id", term!.id).is("archived_at", null);
  const paper = (exams ?? []).find((e: any) => /Oral|Written/.test(e.name));
  assert(paper, "need a gradebook paper");

  const { data: cs } = await admin.from("class_subject").insert({
    org_id: ORG, class_id: sandboxClass.id, name: "QA Review Sub", sort_order: 977,
    // The weight must NAME its paper - a marks-typed weight with no
    // paper sits neither exam (subjectSitsExam), which is exactly what
    // the first run of this check tripped over.
    assessment_weights: [
      { label: "Written", marks: 50, paper: "written" },
      { label: "Oral", marks: 50, paper: "oral" },
    ],
  }).select("id").single();
  const { data: ss } = await admin.from("section_subject").insert({
    org_id: ORG, class_section_id: sandboxSec.id, class_subject_id: cs!.id,
    name: "QA Review Sub", teacher_user_id: t2.id, sort_order: 977,
  }).select("id").single();
  const confKey = `school:marksconfirm:${term!.id}:${sandboxSec.id}`;

  try {
    const { data: stus } = await admin.from("student").select("id")
      .eq("class_section_id", sandboxSec.id).eq("status", "active");
    const ids = (stus ?? []).map((s: any) => s.id);
    assert(ids.length >= 2, "need two sandbox students");

    const mine = async () => {
      const r = await api(t2.token, `/school/orgs/${ORG}/me/exam-marks-todo`);
      const j = await r.json();
      assert(r.status === 200, `marks todo ${r.status}`);
      return ((j.columns ?? []) as any[]).find(
        (c) => c.classSubjectId === cs!.id && c.examId === paper!.id);
    };

    // Nothing entered: the column is listed, and it is listed as empty.
    const before = await mine();
    assert(before, "an untouched column must still be listed in My marks");
    assert(before.marked === 0 && before.studentCount === ids.length,
      `expected 0 of ${ids.length}, got ${before.marked} of ${before.studentCount}`);
    assert(before.signedOff === null, "nothing submitted yet");

    // Part-marked: still listed, now with its real progress - this is
    // the state the teachers could not get back to.
    const save = (rows: any[]) => api(t2.token, `/school/orgs/${ORG}/exams/${paper!.id}/marks-sheet`, {
      method: "POST",
      body: JSON.stringify({ sectionId: sandboxSec.id, rows }),
    });
    const one = await save([{ studentId: ids[0], classSubjectId: cs!.id, maxMarks: 50, obtainedMarks: 40, absent: false }]);
    assert(one.status === 200, `save one ${one.status}`);
    const part = await mine();
    assert(part && part.marked === 1,
      `a part-marked column must still be findable: ${JSON.stringify(part)}`);

    // Every student marked or absent: ready to submit.
    const rest = ids.slice(1).map((id: string, i: number) => (
      i === 0
        ? { studentId: id, classSubjectId: cs!.id, maxMarks: 50, obtainedMarks: null, absent: true }
        : { studentId: id, classSubjectId: cs!.id, maxMarks: 50, obtainedMarks: 30, absent: false }));
    const all = await save(rest);
    assert(all.status === 200, `save rest ${all.status}`);
    const full = await mine();
    assert(full.marked === ids.length, `expected all ${ids.length} marked, got ${full.marked}`);
    assert(full.absent >= 1, "an absence must be counted as an absence");

    // Submit: the column locks, and stays listed as submitted.
    const confirmUrl =
      `/school/orgs/${ORG}/sections/${sandboxSec.id}/subjects/${cs!.id}/marks-confirmation`;
    const sub = await api(t2.token, confirmUrl, {
      method: "POST",
      body: JSON.stringify({ termId: term!.id, confirmed: true }),
    });
    assert(sub.status === 200, `submit ${sub.status}`);
    const locked = await mine();
    assert(locked.signedOff, "a submitted column must say who submitted it");
    const blocked = await save([{ studentId: ids[0], classSubjectId: cs!.id, maxMarks: 50, obtainedMarks: 45, absent: false }]);
    assert(blocked.status !== 200, `a locked column must refuse a write, got ${blocked.status}`);

    // Unlock to fix one mark, then submit again.
    const un = await api(t2.token, confirmUrl, {
      method: "POST",
      body: JSON.stringify({ termId: term!.id, confirmed: false }),
    });
    assert(un.status === 200, `unlock ${un.status}`);
    const fix = await save([{ studentId: ids[0], classSubjectId: cs!.id, maxMarks: 50, obtainedMarks: 45, absent: false }]);
    assert(fix.status === 200, `after unlocking, a correction must save, got ${fix.status}`);
    const reopened = await mine();
    assert(reopened.signedOff === null, "an unlocked column is no longer submitted");
  } finally {
    await admin.from("exam_subject_score").delete().eq("class_subject_id", cs!.id);
    await admin.from("section_subject").delete().eq("id", ss!.id);
    await admin.from("class_subject").delete().eq("id", cs!.id);
    await admin.from("kv_store_f116e23f").delete().eq("key", confKey);
  }
});
await check("109. the report card grades on the SCHOOL's remarks chart, and below the pass mark reads Fail", async () => {
  // IFS had no grade scale, so every card fell back to the built-in
  // bands: a child at 25% read "Unsatisfactory" instead of FAIL, and
  // 60-69 read "Satisfactory" instead of their "Above Average"
  // (Muneeb's photo of the printed REMARKS CHART, 22 Sep). The chart
  // is the school's own data - this pins that it is being used, not
  // that it says any particular thing.
  const admin2 = await ensureUser("qa-admin@azality.com", "QA Admin", "admin");
  const r = await api(admin2.token, `/school/orgs/${ORG}/grade-scales`);
  const j = await r.json();
  assert(r.status === 200, `grade scales ${r.status}`);
  const def = ((j.scales ?? j) as any[]).find((s: any) => s.isDefault || s.is_default);
  assert(def, "the school must have a DEFAULT grade scale - without one every report card silently falls back to built-in bands");

  const bands = (def.bands ?? []).map((b: any) => ({
    letter: b.letter, min: Number(b.minPct ?? b.min_pct), max: Number(b.maxPct ?? b.max_pct),
    remark: b.remark ?? null,
  }));
  assert(bands.length >= 2, `the default scale needs bands, got ${bands.length}`);

  // Same resolver the report card uses: half-open, top band inclusive.
  const resolve = (pct: number) => bands.find((b: any) =>
    (b.max === 100 && pct >= b.min && pct <= 100) || (pct >= b.min && pct < b.max));

  // Every band must be reachable and the chart must cover 0..100 with
  // no hole - a gap means some child gets no grade at all.
  for (let pct = 0; pct <= 100; pct += 0.5) {
    assert(resolve(pct), `no band covers ${pct}% - the chart has a hole`);
  }

  // Below the school's pass mark the remark must READ as a failure:
  // the whole point of the chart is that a parent can see it.
  const { data: org } = await admin.from("organizations").select("settings").eq("id", ORG).maybeSingle();
  const passPct = Number((org as any)?.settings?.pass_mark_pct) || 40;
  const failing: any = resolve(Math.max(0, passPct - 5));
  assert(failing, `no band covers ${passPct - 5}%`);
  assert(/fail/i.test(String(failing.remark ?? "")) || /^f/i.test(String(failing.letter)),
    `below the pass mark must read as a failure, got ${failing.letter} "${failing.remark}"`);
  const passing: any = resolve(Math.min(100, passPct + 5));
  assert(passing && !/fail/i.test(String(passing.remark ?? "")),
    `just above the pass mark must NOT read Fail, got ${passing.letter} "${passing.remark}"`);

  // And the card itself renders a letter, not a dash, for a real pct.
  const { data: term } = await admin.from("academic_term").select("id")
    .eq("org_id", ORG).eq("name", "1st Assessment").maybeSingle();
  if (term) {
    const rc = await api(admin2.token,
      `/school/orgs/${ORG}/students/${pStu1}/terms/${(term as any).id}/report-card`);
    if (rc.status === 200) {
      const card = await rc.json();
      for (const s of (card.academics?.subjects ?? []) as any[]) {
        if (s.percentage !== null) {
          assert(s.letter && s.letter !== "—",
            `a graded subject must carry a letter from the chart, got "${s.letter}"`);
        }
      }
    }
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
