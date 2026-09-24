// =============================================================================
// School Pilot — Phase F routes (announcements + lesson completion + PIN fees)
//
// Mounted onto the existing `school` Hono sub-app via installAnnounce(school)
// (invoked from school.tsx).
//
// Creator endpoints (require family JWT, inherit requireAuth):
//   POST   /school/orgs/:orgId/announcements
//   GET    /school/orgs/:orgId/announcements?creatorOnly=true
//   GET    /school/orgs/:orgId/announcements/:announcementId
//   DELETE /school/orgs/:orgId/announcements/:announcementId
//
//   GET    /school/orgs/:orgId/sections/:sectionId/lessons/:lessonId/completions
//
// PIN-authenticated endpoints (X-Pin-Token, /pin-me/* bypasses requireAuth):
//   GET    /school/pin-me/announcements
//   POST   /school/pin-me/students/:studentId/lessons/:lessonId/complete
//   DELETE /school/pin-me/students/:studentId/lessons/:lessonId/complete
//   GET    /school/pin-me/students/:studentId/lessons/:lessonId/completion
//   GET    /school/pin-me/students/:studentId/fees
// =============================================================================

import type { Hono, Context } from "npm:hono";
import { paymentsByFeeId, renderFeeReceiptHtml, bankAccountFromSettings } from "./schoolFeePayments.tsx";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { userHasRoleRow, hasAdminOrPrincipal, hasAnyRoleInOrg, teachesSubjectInSection } from "./schoolAuth.ts";
import { verifyPinToken } from "./schoolPhaseA.tsx";
import { nextSchedule, type RecurrenceFreq } from "./announceRecurrence.ts";
import type { PinTokenPayload } from "./schoolPhaseA.tsx";

// Returns set of section ids this teacher "owns":
//   - class_section.class_teacher_user_id = userId (in this org)
//   - user_roles with role_type=visiting_teacher, scope_type=class, scope_id=<sectionId>
//     and the section belongs to this org.
//
// DELIBERATELY NARROWER than schoolAuth.teacherSectionIds: incharges and
// subject teachers cannot author announcements at all (permissions audit,
// 16 Sep — documented, not changed). Announcements reach parents, so
// widening who can broadcast — e.g. incharge → whole wing — is a product
// call for the school, not a code cleanup. If that call is made, swap
// this for teacherSectionIds so all surfaces stay in lockstep.
async function getTeacherSections(userId: string, orgId: string): Promise<string[]> {
  const out = new Set<string>();

  // 1) Class teacher rows. class_section -> class -> org_id.
  const { data: ctRows, error: ctErr } = await serviceRoleClient
    .from("class_section")
    .select("id, class:class_id(org_id)")
    .eq("class_teacher_user_id", userId);
  if (!ctErr && ctRows) {
    for (const r of ctRows as any[]) {
      if (r?.class?.org_id === orgId) out.add(r.id);
    }
  }

  // 2) visiting_teacher rows scoped to specific class_section ids.
  const { data: vtRows, error: vtErr } = await serviceRoleClient
    .from("user_roles")
    .select("scope_id")
    .eq("user_id", userId)
    .eq("role_type", "visiting_teacher")
    .eq("scope_type", "class")
    .is("revoked_at", null);
  if (!vtErr && vtRows && vtRows.length > 0) {
    const ids = (vtRows as any[]).map((r) => r.scope_id).filter(Boolean);
    if (ids.length > 0) {
      const { data: secs } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .in("id", ids);
      if (secs) {
        for (const r of secs as any[]) {
          if (r?.class?.org_id === orgId) out.add(r.id);
        }
      }
    }
  }

  // 3) Hifz teacher attachment (PR feat/hifz-teacher-section-listing).
  //    A teacher attached ONLY via class_section.hifz_teacher_user_id
  //    still owns those sections for announcement and dashboard purposes.
  const { data: hifzRows, error: hifzErr } = await serviceRoleClient
    .from("class_section")
    .select("id, class:class_id(org_id)")
    .eq("hifz_teacher_user_id", userId);
  if (!hifzErr && hifzRows) {
    for (const r of hifzRows as any[]) {
      if (r?.class?.org_id === orgId) out.add(r.id);
    }
  }

  return Array.from(out);
}

// -----------------------------------------------------------------------------
// PIN auth helper (reads X-Pin-Token directly to avoid coupling to schoolPortal).
// -----------------------------------------------------------------------------
async function requirePin(
  c: Context,
): Promise<PinTokenPayload | { __error: true; status: 401; body: { error: string } }> {
  const header = c.req.header("X-Pin-Token") || "";
  if (!header) return { __error: true, status: 401, body: { error: "missing pin token" } };
  const payload = await verifyPinToken(header);
  if (!payload) {
    return { __error: true, status: 401, body: { error: "invalid or expired pin token" } };
  }
  return payload;
}

async function resolveAccessibleStudents(subject: PinTokenPayload): Promise<string[]> {
  if (subject.subjectType === "student") return [subject.subjectId];
  const { data, error } = await serviceRoleClient
    .from("student_parent")
    .select("student_id")
    .eq("parent_id", subject.subjectId);
  if (error) {
    console.error("[schoolAnnounce.resolveAccessibleStudents]", error);
    return [];
  }
  return (data ?? []).map((r: any) => r.student_id);
}

// -----------------------------------------------------------------------------
// Row shapes
// -----------------------------------------------------------------------------
// Phase F shipped 5 audience kinds. PR feat/announcement-audience-expanded
// adds 5 more for the Iqra pilot — staff, teachers, class, program,
// subject. The single-row model (one audience_kind + a handful of
// discriminator columns) holds for the pilot; cross-bucket unions
// ("Teachers + Grade 3 parents") are out of scope until we see real demand.
const AUDIENCE_KINDS = new Set([
  "whole_school",
  "class_section",
  "parents_only",
  "students_only",
  "specific_students",
  "staff",
  "teachers",
  "class",
  "class_parents",
  "program",
  "subject",
]);
// Staff-only buckets — portal (student/parent) feeds never include these
// since they reach internal staff only.
const STAFF_ONLY_KINDS = new Set(["staff", "teachers"]);

function announcementToJson(r: any, authorName?: string | null) {
  return {
    id: r.id,
    orgId: r.org_id,
    authorUserId: r.author_user_id,
    authorName: authorName ?? null,
    audienceKind: r.audience_kind,
    audienceSectionId: r.audience_section_id,
    audienceStudentIds: r.audience_student_ids ?? [],
    // Expanded audience discriminators (PR feat/announcement-audience-
    // expanded). Null on legacy rows; UI treats their absence as the
    // "the audience kind doesn't need this field" signal.
    audienceClassId: r.audience_class_id ?? null,
    audienceSubjectId: r.audience_subject_id ?? null,
    audienceProgram: r.audience_program ?? null,
    title: r.title,
    body: r.body,
    attachments: r.attachments ?? [],
    publishedAt: r.published_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

function feeToJson(r: any) {
  // Shape matches the frontend FeeStatus type: snake_case throughout,
  // the same contract schoolPhaseCD's feeToJson was already fixed to.
  // This copy had stayed camelCase, so the PARENT portal fees page
  // (which reads f.amount_due / f.due_date) rendered "—" for every
  // amount and Rs. 0 totals while real balances existed (demo parent
  // screenshot, 17 Sep).
  return {
    id: r.id,
    org_id: r.org_id,
    student_id: r.student_id,
    period: r.period,
    amount_due: r.amount_due === null || r.amount_due === undefined ? null : Number(r.amount_due),
    amount_paid: r.amount_paid === null || r.amount_paid === undefined ? null : Number(r.amount_paid),
    status: r.status,
    due_date: r.due_date,
    paid_date: r.paid_date,
    receipt_url: r.receipt_url,
    notes: r.notes,
    recorded_by: r.recorded_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// Batch resolve auth.users names for display.
async function resolveAuthorNames(userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniq = Array.from(new Set(userIds.filter(Boolean)));
  if (uniq.length === 0) return out;
  // Try kv-like store? Use admin auth API via service-role client.
  for (const uid of uniq) {
    try {
      // @ts-ignore — supabase-js admin api
      const { data, error } = await (serviceRoleClient as any).auth.admin.getUserById(uid);
      if (!error && data?.user) {
        const u = data.user;
        const name =
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          u.email ||
          null;
        out.set(uid, name);
      } else {
        out.set(uid, null);
      }
    } catch (e) {
      console.error("[schoolAnnounce.resolveAuthorNames]", e);
      out.set(uid, null);
    }
  }
  return out;
}

// =============================================================================
// installAnnounce
// =============================================================================
export function installAnnounce(school: Hono): void {
  // ---------------------------------------------------------------------------
  // POST /school/orgs/:orgId/announcements — create
  // ---------------------------------------------------------------------------
  school.post("/orgs/:orgId/announcements", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const bodyText = typeof body?.body === "string" ? body.body : "";
    const audienceKind = body?.audienceKind;
    const audienceSectionId = body?.audienceSectionId ?? null;
    const audienceClassId = body?.audienceClassId ?? null;
    const audienceSubjectId = body?.audienceSubjectId ?? null;
    const audienceProgram = typeof body?.audienceProgram === "string" ? body.audienceProgram : null;
    const audienceStudentIds: string[] = Array.isArray(body?.audienceStudentIds)
      ? body.audienceStudentIds.filter((x: any) => typeof x === "string")
      : [];
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
    const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt : null;

    if (!title) return c.json({ error: "title required" }, 400);
    if (!bodyText) return c.json({ error: "body required" }, 400);
    if (!AUDIENCE_KINDS.has(audienceKind)) {
      return c.json({ error: "invalid audienceKind" }, 400);
    }
    if (audienceKind === "class_section" && !audienceSectionId) {
      return c.json({ error: "audienceSectionId required for class_section" }, 400);
    }
    if (audienceKind === "specific_students" && audienceStudentIds.length === 0) {
      return c.json({ error: "audienceStudentIds required for specific_students" }, 400);
    }
    // Discriminator presence checks per new kind.
    if ((audienceKind === "class" || audienceKind === "class_parents") && !audienceClassId) {
      return c.json({ error: "audienceClassId required for class kind" }, 400);
    }
    if (audienceKind === "subject" && !audienceSubjectId) {
      return c.json({ error: "audienceSubjectId required for subject kind" }, 400);
    }
    if (audienceKind === "program") {
      if (audienceProgram !== "hifz" && audienceProgram !== "conventional") {
        return c.json({ error: "audienceProgram must be 'hifz' or 'conventional'" }, 400);
      }
    }

    // Permission: admin/principal can target anything in org.
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin) {
      // class_teacher / visiting_teacher only — must constrain to their sections.
      const teacherSections = await getTeacherSections(userId, orgId);
      if (teacherSections.length === 0) {
        return c.json({ error: "forbidden" }, 403);
      }
      // Broad-reach kinds are admin/principal only. Teachers can still
      // address their own sections + specific students (handled below).
      if (
        audienceKind === "whole_school" ||
        audienceKind === "parents_only" ||
        audienceKind === "students_only" ||
        audienceKind === "staff" ||
        audienceKind === "teachers" ||
        audienceKind === "class" ||
        audienceKind === "class_parents" ||
        audienceKind === "program" ||
        audienceKind === "subject"
      ) {
        return c.json({ error: "forbidden: only admin/principal can post this kind" }, 403);
      }
      if (audienceKind === "class_section") {
        if (!teacherSections.includes(audienceSectionId)) {
          return c.json({ error: "forbidden: not your section" }, 403);
        }
      }
      if (audienceKind === "specific_students") {
        // Verify every student is in one of the teacher's sections.
        const { data: stus, error: stuErr } = await serviceRoleClient
          .from("student")
          .select("id, class_section_id, org_id")
          .in("id", audienceStudentIds);
        if (stuErr) return c.json({ error: stuErr.message }, 500);
        for (const s of stus ?? []) {
          if ((s as any).org_id !== orgId) {
            return c.json({ error: "forbidden: student not in org" }, 403);
          }
          const secId = (s as any).class_section_id;
          if (!secId || !teacherSections.includes(secId)) {
            return c.json({ error: "forbidden: student not in your sections" }, 403);
          }
        }
      }
    }

    // Verify audience section, if provided, belongs to org.
    if (audienceSectionId) {
      const { data: sec } = await serviceRoleClient
        .from("class_section")
        .select("id, class:class_id(org_id)")
        .eq("id", audienceSectionId)
        .maybeSingle();
      if (!sec || (sec as any).class?.org_id !== orgId) {
        return c.json({ error: "section not in this org" }, 404);
      }
    }
    // Verify audience class belongs to this org.
    if ((audienceKind === "class" || audienceKind === "class_parents") && audienceClassId) {
      const { data: cls } = await serviceRoleClient
        .from("class")
        .select("id, org_id")
        .eq("id", audienceClassId)
        .maybeSingle();
      if (!cls || (cls as any).org_id !== orgId) {
        return c.json({ error: "class not in this org" }, 404);
      }
    }
    // Verify subject belongs to a class in this org.
    if (audienceKind === "subject" && audienceSubjectId) {
      const { data: cs } = await serviceRoleClient
        .from("class_subject")
        .select("id, class:class_id(org_id)")
        .eq("id", audienceSubjectId)
        .maybeSingle();
      if (!cs || (cs as any).class?.org_id !== orgId) {
        return c.json({ error: "subject not in this org" }, 404);
      }
    }

    const insertRow: any = {
      org_id: orgId,
      author_user_id: userId,
      audience_kind: audienceKind,
      audience_section_id: audienceSectionId,
      audience_student_ids: audienceKind === "specific_students" ? audienceStudentIds : null,
      audience_class_id: audienceKind === "class" || audienceKind === "class_parents" ? audienceClassId : null,
      audience_subject_id: audienceKind === "subject" ? audienceSubjectId : null,
      audience_program: audienceKind === "program" ? audienceProgram : null,
      title,
      body: bodyText,
      attachments,
      expires_at: expiresAt,
      publish_publicly: !!body?.publishPublicly,
    };

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("announcement")
      .insert(insertRow)
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({ announcement: announcementToJson(ins) }, 201);
  });


  // ===========================================================================
  // Recurring announcements (24 Sep: "last friday of the month")
  // ===========================================================================
  // No cron: due rules materialize an announcement instance on the next
  // feed read (same lazy pattern as results-day publishing). The
  // instance expires at the end of its occurrence day, and the rule
  // advances to the next occurrence.
  function recurrenceToJson(r: any) {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      audienceKind: r.audience_kind,
      audienceSectionId: r.audience_section_id ?? null,
      audienceClassId: r.audience_class_id ?? null,
      audienceSubjectId: r.audience_subject_id ?? null,
      audienceProgram: r.audience_program ?? null,
      freq: r.freq,
      weekday: Number(r.weekday),
      leadDays: Number(r.lead_days),
      nextOccurrence: r.next_occurrence,
      nextPostAt: r.next_post_at,
      active: !!r.active,
      createdAt: r.created_at,
    };
  }

  async function applyRecurringAnnouncements(orgId: string): Promise<void> {
    const { data: due } = await serviceRoleClient
      .from("announcement_recurrence")
      .select("*")
      .eq("org_id", orgId)
      .eq("active", true)
      .lte("next_post_at", new Date().toISOString());
    for (const r of (due ?? []) as any[]) {
      const occ = r.next_occurrence as string;
      await serviceRoleClient.from("announcement").insert({
        org_id: orgId,
        author_user_id: r.author_user_id,
        audience_kind: r.audience_kind,
        audience_section_id: r.audience_section_id,
        audience_class_id: r.audience_class_id,
        audience_subject_id: r.audience_subject_id,
        audience_program: r.audience_program,
        title: r.title,
        body: r.body,
        attachments: [],
        expires_at: new Date(occ + "T18:59:00Z").toISOString(), // 23:59 PKT
        publish_publicly: false,
      });
      const next = nextSchedule(
        r.freq as RecurrenceFreq, Number(r.weekday), Number(r.lead_days), new Date());
      await serviceRoleClient.from("announcement_recurrence")
        .update({ next_occurrence: next.occurrence, next_post_at: next.postAt })
        .eq("id", r.id);
    }
  }

  const RECUR_KINDS = new Set([
    "whole_school", "parents_only", "students_only", "staff", "teachers",
    "class", "class_parents", "class_section", "program", "subject",
  ]);

  // POST /orgs/:orgId/announcement-recurrences  (admin/principal)
  school.post("/orgs/:orgId/announcement-recurrences", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "invalid json" }, 400);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body : "";
    if (!title || !bodyText) return c.json({ error: "title and body required" }, 400);
    if (!RECUR_KINDS.has(body.audienceKind)) return c.json({ error: "invalid audienceKind" }, 400);
    if ((body.audienceKind === "class" || body.audienceKind === "class_parents") && !body.audienceClassId) {
      return c.json({ error: "audienceClassId required" }, 400);
    }
    if (body.audienceKind === "class_section" && !body.audienceSectionId) {
      return c.json({ error: "audienceSectionId required" }, 400);
    }
    const freq = body.freq as RecurrenceFreq;
    if (!["weekly", "monthly_first", "monthly_last"].includes(freq)) {
      return c.json({ error: "freq must be weekly, monthly_first or monthly_last" }, 400);
    }
    const weekday = Number(body.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return c.json({ error: "weekday must be 0 (Sunday) to 6 (Saturday)" }, 400);
    }
    const leadDays = Number.isInteger(Number(body.leadDays)) ? Number(body.leadDays) : 1;
    if (leadDays < 0 || leadDays > 14) return c.json({ error: "leadDays must be 0-14" }, 400);
    const sched = nextSchedule(freq, weekday, leadDays, new Date());
    const { data: ins, error } = await serviceRoleClient
      .from("announcement_recurrence")
      .insert({
        org_id: orgId, author_user_id: userId,
        title, body: bodyText,
        audience_kind: body.audienceKind,
        audience_section_id: body.audienceSectionId ?? null,
        audience_class_id: body.audienceClassId ?? null,
        audience_subject_id: body.audienceSubjectId ?? null,
        audience_program: body.audienceProgram ?? null,
        freq, weekday, lead_days: leadDays,
        next_occurrence: sched.occurrence, next_post_at: sched.postAt,
      }).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ recurrence: recurrenceToJson(ins) }, 201);
  });

  // GET /orgs/:orgId/announcement-recurrences  (admin/principal)
  school.get("/orgs/:orgId/announcement-recurrences", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { data } = await serviceRoleClient
      .from("announcement_recurrence")
      .select("*").eq("org_id", orgId)
      .order("created_at", { ascending: false });
    return c.json({ recurrences: ((data ?? []) as any[]).map(recurrenceToJson) });
  });

  // PATCH (pause/resume) + DELETE
  school.patch("/orgs/:orgId/announcement-recurrences/:recurrenceId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.active !== "boolean") return c.json({ error: "active (boolean) required" }, 400);
    // Resuming re-anchors the clock to NOW, so a rule paused across its
    // moment never back-posts a stale instance.
    const patch: any = { active: body.active };
    if (body.active) {
      const { data: row } = await serviceRoleClient
        .from("announcement_recurrence").select("freq, weekday, lead_days")
        .eq("id", c.req.param("recurrenceId")).eq("org_id", orgId).maybeSingle();
      if (!row) return c.json({ error: "not found" }, 404);
      const sched = nextSchedule(
        (row as any).freq, Number((row as any).weekday), Number((row as any).lead_days), new Date());
      patch.next_occurrence = sched.occurrence;
      patch.next_post_at = sched.postAt;
    }
    const { error } = await serviceRoleClient
      .from("announcement_recurrence").update(patch)
      .eq("id", c.req.param("recurrenceId")).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  school.delete("/orgs/:orgId/announcement-recurrences/:recurrenceId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    if (!(await hasAdminOrPrincipal(userId, orgId))) return c.json({ error: "forbidden" }, 403);
    const { error } = await serviceRoleClient
      .from("announcement_recurrence").delete()
      .eq("id", c.req.param("recurrenceId")).eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/announcements
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/announcements", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const creatorOnly = c.req.query("creatorOnly") === "true";
    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    // A due "every last Friday" rule becomes a real announcement on
    // whichever feed reads first.
    await applyRecurringAnnouncements(orgId);

    // Non-admin staff feed: in addition to their own authored
    // announcements, they should see anything addressed to their
    // role bucket (staff / teachers / whole_school). Pull the wider
    // set and filter in-memory — keeps the query simple and the
    // pilot's announcement table is tiny.
    let teacherRoles = false;
    if (!isAdmin) {
      const sections = await getTeacherSections(userId, orgId);
      teacherRoles = sections.length > 0;
    }

    let q = serviceRoleClient
      .from("announcement")
      .select("*")
      .eq("org_id", orgId)
      .order("published_at", { ascending: false })
      .limit(200);

    if (creatorOnly) {
      // Author asked for "only my announcements" — narrow to that
      // regardless of admin / staff status.
      q = q.eq("author_user_id", userId);
    }

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);

    let rows = (data ?? []) as any[];
    if (!isAdmin && !creatorOnly) {
      // Filter to:
      //   - announcements they authored (always visible to author)
      //   - whole_school + staff (every staff member sees)
      //   - teachers (only if caller is a class/visiting teacher)
      // Other kinds (parents_only, students_only, class_section, class,
      // program, subject, specific_students) go through the portal feed,
      // not the staff list.
      rows = rows.filter((r) => {
        if (r.author_user_id === userId) return true;
        const k = r.audience_kind;
        if (k === "whole_school") return true;
        if (k === "staff") return true;
        if (k === "teachers") return teacherRoles;
        return false;
      });
    }

    const names = await resolveAuthorNames(rows.map((r) => r.author_user_id));
    const announcements = rows.map((r: any) =>
      announcementToJson(r, names.get(r.author_user_id) ?? null),
    );
    return c.json({ announcements });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/announcements/:announcementId
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/announcements/:announcementId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("announcementId");

    if (!(await hasAnyRoleInOrg(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data: row, error } = await serviceRoleClient
      .from("announcement")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!row) return c.json({ error: "not found" }, 404);
    if ((row as any).org_id !== orgId) return c.json({ error: "not found" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && (row as any).author_user_id !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const names = await resolveAuthorNames([(row as any).author_user_id]);
    return c.json({
      announcement: announcementToJson(row, names.get((row as any).author_user_id) ?? null),
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /school/orgs/:orgId/announcements/:announcementId
  // ---------------------------------------------------------------------------
  school.delete("/orgs/:orgId/announcements/:announcementId", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const id = c.req.param("announcementId");

    const { data: row, error: rErr } = await serviceRoleClient
      .from("announcement")
      .select("id, org_id, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (rErr) return c.json({ error: rErr.message }, 500);
    if (!row) return c.json({ error: "not found" }, 404);
    if ((row as any).org_id !== orgId) return c.json({ error: "not found" }, 404);

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    if (!isAdmin && (row as any).author_user_id !== userId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { error: delErr } = await serviceRoleClient
      .from("announcement")
      .delete()
      .eq("id", id);
    if (delErr) return c.json({ error: delErr.message }, 500);

    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // GET /school/pin-me/announcements — recipient feed
  // ---------------------------------------------------------------------------
  school.get("/pin-me/announcements", async (c) => {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return c.json(e.body, e.status);
    }
    const subject = auth as PinTokenPayload;

    // Resolve accessible students + section ids for filter.
    const studentIds = await resolveAccessibleStudents(subject);
    let sectionIds: string[] = [];
    let classIds: string[] = [];
    let programs: string[] = [];
    if (studentIds.length > 0) {
      // Pull all metadata we need to match expanded audience kinds in
      // one query — keeps the in-memory filter cheap.
      const { data: stus } = await serviceRoleClient
        .from("student")
        .select("id, class_section_id, program, class_section:class_section_id(class_id)")
        .in("id", studentIds);
      sectionIds = ((stus ?? []) as any[])
        .map((s) => s.class_section_id)
        .filter((x) => !!x);
      classIds = Array.from(
        new Set(
          ((stus ?? []) as any[])
            .map((s) => (s.class_section as any)?.class_id)
            .filter((x) => !!x),
        ),
      );
      programs = Array.from(
        new Set(((stus ?? []) as any[]).map((s) => s.program).filter((x) => !!x)),
      );
    }

    // A due recurring rule posts itself before the feed is read, so a
    // parent opening the portal is enough to surface "last Friday".
    await applyRecurringAnnouncements(subject.orgId);

    // Pull recent announcements for this org and filter in-memory (small set).
    const { data, error } = await serviceRoleClient
      .from("announcement")
      .select("*")
      .eq("org_id", subject.orgId)
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);

    // Subject kind — resolve class_subject.id → class_id once for every
    // subject announcement in the batch, so the per-row filter can check
    // overlap in O(1). Done before the filter to avoid N queries.
    const subjectIds = Array.from(
      new Set(
        ((data ?? []) as any[])
          .filter((r) => r.audience_kind === "subject" && r.audience_subject_id)
          .map((r) => r.audience_subject_id as string),
      ),
    );
    const subjectClassMap = new Map<string, string>();
    if (subjectIds.length > 0) {
      const { data: subs } = await serviceRoleClient
        .from("class_subject")
        .select("id, class_id")
        .in("id", subjectIds);
      for (const s of subs ?? []) {
        subjectClassMap.set((s as any).id, (s as any).class_id);
      }
    }

    const now = Date.now();
    const matched = ((data ?? []) as any[]).filter((r) => {
      if (r.expires_at && new Date(r.expires_at).getTime() < now) return false;
      const kind = r.audience_kind;
      // Staff-only kinds never reach the portal feed regardless of who's
      // logged in. Keep this above the rest as an early-exit.
      if (STAFF_ONLY_KINDS.has(kind)) return false;
      if (kind === "whole_school") return true;
      // Audience kinds that depend on student/section/class/program
      // overlap apply equally to students and parents — both see what
      // touches "their" students. Check them up front so we don't
      // duplicate the same 5 branches in the two role blocks below.
      if (kind === "class_section") {
        return sectionIds.includes(r.audience_section_id);
      }
      if (kind === "class") {
        return r.audience_class_id && classIds.includes(r.audience_class_id);
      }
      // Parents of one class - the office's "Montessori parents" ask
      // (24 Sep). Students of the class deliberately do NOT see it.
      if (kind === "class_parents") {
        return subject.subjectType === "parent" &&
          r.audience_class_id && classIds.includes(r.audience_class_id);
      }
      if (kind === "program") {
        return r.audience_program && programs.includes(r.audience_program);
      }
      if (kind === "subject") {
        const cid = subjectClassMap.get(r.audience_subject_id);
        return !!cid && classIds.includes(cid);
      }
      if (kind === "specific_students") {
        const ids: string[] = r.audience_student_ids ?? [];
        return studentIds.some((sid) => ids.includes(sid));
      }
      // Role-bucket kinds — students vs parents disagree on which apply.
      if (subject.subjectType === "student") {
        if (kind === "students_only") return true;
        return false;
      }
      // parent
      if (kind === "parents_only") return true;
      return false;
    }).slice(0, 50);

    const names = await resolveAuthorNames(matched.map((r) => r.author_user_id));
    const announcements = matched.map((r) =>
      announcementToJson(r, names.get(r.author_user_id) ?? null),
    );
    return c.json({ announcements });
  });

  // ===========================================================================
  // Lesson completion
  // ===========================================================================

  // Helper: validate student access for pin subject + ensure student is the
  // subject themselves (writes only allowed by student, not parent).
  async function gateStudentSelf(
    c: Context,
  ): Promise<
    | { ok: true; subject: PinTokenPayload; studentId: string; lessonId: string }
    | { ok: false; resp: Response }
  > {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return { ok: false, resp: c.json(e.body, e.status) };
    }
    const subject = auth as PinTokenPayload;
    const studentId = c.req.param("studentId");
    const lessonId = c.req.param("lessonId");
    if (!studentId || !lessonId) {
      return { ok: false, resp: c.json({ error: "studentId and lessonId required" }, 400) };
    }
    if (subject.subjectType !== "student" || subject.subjectId !== studentId) {
      return { ok: false, resp: c.json({ error: "forbidden: only the student may mark complete" }, 403) };
    }
    // Verify the lesson is for the student's section.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, class_section_id, org_id")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return { ok: false, resp: c.json({ error: "student not found" }, 404) };
    if ((stu as any).org_id !== subject.orgId) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    const { data: lesson } = await serviceRoleClient
      .from("lesson")
      .select("id, org_id, class_section_id")
      .eq("id", lessonId)
      .maybeSingle();
    if (!lesson) return { ok: false, resp: c.json({ error: "lesson not found" }, 404) };
    if ((lesson as any).org_id !== subject.orgId) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    if ((lesson as any).class_section_id !== (stu as any).class_section_id) {
      return { ok: false, resp: c.json({ error: "forbidden: lesson not for student's section" }, 403) };
    }
    return { ok: true, subject, studentId, lessonId };
  }

  // Helper for GET completion — allow parent too (read).
  async function gateStudentRead(
    c: Context,
  ): Promise<
    | { ok: true; subject: PinTokenPayload; studentId: string; lessonId: string }
    | { ok: false; resp: Response }
  > {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return { ok: false, resp: c.json(e.body, e.status) };
    }
    const subject = auth as PinTokenPayload;
    const studentId = c.req.param("studentId");
    const lessonId = c.req.param("lessonId");
    if (!studentId || !lessonId) {
      return { ok: false, resp: c.json({ error: "studentId and lessonId required" }, 400) };
    }
    const accessible = await resolveAccessibleStudents(subject);
    if (!accessible.includes(studentId)) {
      return { ok: false, resp: c.json({ error: "forbidden" }, 403) };
    }
    return { ok: true, subject, studentId, lessonId };
  }

  // POST /school/pin-me/students/:studentId/lessons/:lessonId/complete
  school.post("/pin-me/students/:studentId/lessons/:lessonId/complete", async (c) => {
    const g = await gateStudentSelf(c);
    if (!g.ok) return g.resp;
    const { subject, studentId, lessonId } = g;

    const { data: existing } = await serviceRoleClient
      .from("lesson_completion")
      .select("id, completed_at")
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (existing) {
      return c.json({ ok: true, completedAt: (existing as any).completed_at });
    }

    const { data: ins, error: insErr } = await serviceRoleClient
      .from("lesson_completion")
      .insert({
        org_id: subject.orgId,
        lesson_id: lessonId,
        student_id: studentId,
      })
      .select()
      .single();
    if (insErr) return c.json({ error: insErr.message }, 500);

    return c.json({ ok: true, completedAt: (ins as any).completed_at });
  });

  // DELETE /school/pin-me/students/:studentId/lessons/:lessonId/complete
  school.delete("/pin-me/students/:studentId/lessons/:lessonId/complete", async (c) => {
    const g = await gateStudentSelf(c);
    if (!g.ok) return g.resp;
    const { studentId, lessonId } = g;

    const { error: delErr } = await serviceRoleClient
      .from("lesson_completion")
      .delete()
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId);
    if (delErr) return c.json({ error: delErr.message }, 500);
    return c.json({ ok: true });
  });

  // GET /school/pin-me/students/:studentId/lessons/:lessonId/completion
  school.get("/pin-me/students/:studentId/lessons/:lessonId/completion", async (c) => {
    const g = await gateStudentRead(c);
    if (!g.ok) return g.resp;
    const { studentId, lessonId } = g;

    const { data, error } = await serviceRoleClient
      .from("lesson_completion")
      .select("completed_at")
      .eq("lesson_id", lessonId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);

    if (!data) return c.json({ completed: false, completedAt: null });
    return c.json({ completed: true, completedAt: (data as any).completed_at });
  });

  // ---------------------------------------------------------------------------
  // GET /school/orgs/:orgId/sections/:sectionId/lessons/:lessonId/completions
  // Teacher-of-section OR admin+.
  // ---------------------------------------------------------------------------
  school.get("/orgs/:orgId/sections/:sectionId/lessons/:lessonId/completions", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");
    const sectionId = c.req.param("sectionId");
    const lessonId = c.req.param("lessonId");

    // Verify section belongs to org.
    const { data: sec } = await serviceRoleClient
      .from("class_section")
      .select("id, class_teacher_user_id, class:class_id(org_id)")
      .eq("id", sectionId)
      .maybeSingle();
    if (!sec || (sec as any).class?.org_id !== orgId) {
      return c.json({ error: "section not in this org" }, 404);
    }

    const isAdmin = await hasAdminOrPrincipal(userId, orgId);
    let allowed = isAdmin;
    if (!allowed) {
      if ((sec as any).class_teacher_user_id === userId) {
        allowed = true;
      } else if (await teachesSubjectInSection(userId, sectionId)) {
        allowed = true;
      } else if (await userHasRoleRow(userId, "visiting_teacher", "class", sectionId)) {
        allowed = true;
      } else if (await userHasRoleRow(userId, "visiting_teacher", "organization", orgId)) {
        allowed = true;
      }
    }
    if (!allowed) return c.json({ error: "forbidden" }, 403);

    // Verify lesson exists + belongs to section.
    const { data: lesson } = await serviceRoleClient
      .from("lesson")
      .select("id, class_section_id, org_id")
      .eq("id", lessonId)
      .maybeSingle();
    if (!lesson) return c.json({ error: "lesson not found" }, 404);
    if ((lesson as any).org_id !== orgId || (lesson as any).class_section_id !== sectionId) {
      return c.json({ error: "lesson not in this section" }, 404);
    }

    const { data: comps, error: compErr } = await serviceRoleClient
      .from("lesson_completion")
      .select("student_id, completed_at")
      .eq("lesson_id", lessonId);
    if (compErr) return c.json({ error: compErr.message }, 500);

    const { count: sectionSize } = await serviceRoleClient
      .from("student")
      .select("id", { count: "exact", head: true })
      .eq("class_section_id", sectionId);

    const completions = (comps ?? []).map((r: any) => ({
      studentId: r.student_id,
      completedAt: r.completed_at,
    }));
    return c.json({
      completions,
      totalStudents: sectionSize ?? 0,
      completedCount: completions.length,
    });
  });

  // ===========================================================================
  // GET /school/pin-me/students/:studentId/fees
  // ===========================================================================
  school.get("/pin-me/students/:studentId/fees", async (c) => {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return c.json(e.body, e.status);
    }
    const subject = auth as PinTokenPayload;
    const studentId = c.req.param("studentId");
    if (!studentId) return c.json({ error: "studentId required" }, 400);

    // Fees are family business — parents only. The nav already hides the
    // tab for student logins; this makes the API itself enforce it
    // (pilot security review 2026-09-02).
    if (subject.subjectType !== "parent") {
      return c.json({ error: "fees are visible to parents only" }, 403);
    }

    const accessible = await resolveAccessibleStudents(subject);
    if (!accessible.includes(studentId)) {
      return c.json({ error: "forbidden" }, 403);
    }

    // Verify same org.
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("id, org_id, class_section:class_section_id(class_id)")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu) return c.json({ error: "student not found" }, 404);
    if ((stu as any).org_id !== subject.orgId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const { data, error } = await serviceRoleClient
      .from("fee_status")
      .select("*")
      .eq("student_id", studentId)
      .order("period", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);

    // Which bank account this child's fees go to (school, 14 Sep): IFS
    // banks per class group, so settings.fee_bank_accounts holds a list
    // of { bank, title, accountNumber, classIds } the office edits in
    // Org Settings. Null when no account covers the class — the page
    // then shows no deposit card.
    const classId = (stu as any).class_section?.class_id ?? null;
    let bankAccount: { bank: string | null; title: string | null; accountNumber: string | null; iban: string | null } | null = null;
    if (classId) {
      const { data: orgRow } = await serviceRoleClient
        .from("organizations").select("settings").eq("id", subject.orgId).maybeSingle();
      const accounts = ((orgRow as any)?.settings?.fee_bank_accounts ?? []) as any[];
      const acct = accounts.find(
        (a) => Array.isArray(a?.classIds) && a.classIds.includes(classId),
      );
      if (acct) {
        bankAccount = {
          bank: acct.bank ?? null,
          title: acct.title ?? null,
          accountNumber: acct.accountNumber ?? null,
          // Optional: online-banking apps add beneficiaries by IBAN.
          // The office fills settings.fee_bank_accounts[].iban when the
          // school shares them; absent = row simply not shown.
          iban: acct.iban ?? null,
        };
      }
    }

    const payMap = await paymentsByFeeId((data ?? []).map((r: any) => r.id));
    return c.json({
      fees: (data ?? []).map((r: any) => ({ ...feeToJson(r), payments: payMap.get(r.id) ?? [] })),
      bankAccount,
    });
  });

  // GET /school/pin-me/fees/:feeId/receipt - the PAYER's own printable
  // receipt (17 Sep). The staff route authenticates with a family JWT,
  // which a PIN-signed parent doesn't hold, so parents could see fees
  // but never print one. Same shared renderer, PIN-gated to a parent of
  // the fee's student.
  school.get("/pin-me/fees/:feeId/receipt", async (c) => {
    const auth = await requirePin(c);
    if ((auth as any).__error) {
      const e = auth as any;
      return c.json(e.body, e.status);
    }
    const subject = auth as PinTokenPayload;
    if (subject.subjectType !== "parent") {
      return c.json({ error: "fees are visible to parents only" }, 403);
    }
    const feeId = c.req.param("feeId");
    const { data: fee } = await serviceRoleClient
      .from("fee_status")
      .select("*, students:student_id(id, full_name, gr_number, class_section:class_section_id(name, class_id))")
      .eq("id", feeId)
      .maybeSingle();
    if (!fee || (fee as any).org_id !== subject.orgId) {
      return c.json({ error: "fee not found" }, 404);
    }
    const accessible = await resolveAccessibleStudents(subject);
    if (!accessible.includes((fee as any).student_id)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: org } = await serviceRoleClient
      .from("organizations").select("name, settings").eq("id", subject.orgId).maybeSingle();
    const payMap = await paymentsByFeeId([feeId]);
    const html = renderFeeReceiptHtml({
      bankAccount: bankAccountFromSettings(
        (org as any)?.settings ?? {},
        (fee as any).students?.class_section?.class_id ?? null,
      ),
      feeId,
      fee: fee as any,
      student: (fee as any).students || {},
      orgName: (org as any)?.name ?? "School",
      orgSettings: (org as any)?.settings ?? {},
      payments: payMap.get(feeId) ?? [],
    });
    // c.html, not a raw Response: headers set on a bare Response were
    // arriving as text/plain through the mount/middleware chain (the
    // suite's receipt-must-be-HTML assertion caught it, 17 Sep) - Hono's
    // own helpers survive it, exactly like c.json everywhere else.
    c.header("cache-control", "no-store");
    return c.html(html);
  });
}

export default installAnnounce;
