// School module — Parent ↔ school messaging (PR feat/parent-contact-school).
//
// Two surfaces share one table (parent_message):
//   - Parent (PIN auth): start threads, view their own threads, reply.
//   - Admin/office (JWT): org-wide inbox, view + reply to any thread.
//
// Threads are folded by thread_id (the first message's id). Direction is
// encoded by sent_by_role so a thread renders as a chat:
//   parent: "Can my child come late tomorrow?"
//   school: "Yes — please send a note with him."
//
// read_at semantics: set on the OTHER party reading the message.
//   parent → school messages: read_at set when ANY school user opens the thread
//   school → parent messages: read_at set when the parent opens the thread

import type { Context, Hono } from "npm:hono";
import { loadSchoolWeek, schoolDaysWaiting } from "./schoolWeek.ts";
import { todayInOrgTz, orgTimezone } from "./tz.ts";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { verifyPinToken } from "./schoolPhaseA.tsx";

// ─── Auth helpers ─────────────────────────────────────────────────────
async function isSchoolStaff(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles").select("role_type")
    .eq("user_id", userId).eq("scope_type", "organization")
    .eq("scope_id", orgId).is("revoked_at", null);
  return (data ?? []).some((r: any) =>
    r.role_type === "principal" ||
    r.role_type === "admin" ||
    r.role_type === "office_staff",
  );
}

// PIN gate — verifies the token + ensures the parent owns the student
// (when the request scopes to one). Returns the parent's user_id on
// success. Students can read but NOT send (front-office wouldn't act on
// kid messages without parental context).
async function pinGate(c: Context): Promise<
  | { ok: true; parentUserId: string; orgId: string; subjectType: "parent" | "student"; subjectId: string }
  | { ok: false; resp: Response }
> {
  const authHeader = c.req.header("X-Pin-Token") || "";
  const verified = await verifyPinToken(authHeader);
  if (!verified) {
    return { ok: false, resp: c.json({ error: "unauthenticated" }, 401) };
  }
  if (verified.subjectType !== "parent") {
    return { ok: false, resp: c.json({ error: "only parents can use messaging" }, 403) };
  }
  return {
    ok: true,
    parentUserId: verified.subjectId,
    orgId: verified.orgId,
    subjectType: verified.subjectType,
    subjectId: verified.subjectId,
  };
}

// Resolve a sender id to a display name. parent_message rows store
// either a parent.id (when sent_by_role='parent') or an auth.users.id
// (sent_by_role='school'), and parent_user_id always stores parent.id.
// We try the parent table first (cheaper, also handles the common case)
// and fall back to auth.users for school senders.
async function resolveSenderName(id: string): Promise<string | null> {
  if (!id) return null;
  const { data: p } = await serviceRoleClient
    .from("parent")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();
  if (p && (p as any).full_name) return (p as any).full_name as string;
  try {
    const { data: u } = await (serviceRoleClient as any).auth.admin.getUserById(id);
    return u?.user?.user_metadata?.name || u?.user?.email || null;
  } catch {
    return null;
  }
}

function messageToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    threadId: r.thread_id,
    parentUserId: r.parent_user_id,
    studentId: r.student_id,
    subject: r.subject,
    body: r.body,
    sentBy: r.sent_by,
    sentByRole: r.sent_by_role as "parent" | "school",
    sentByName: r.__sent_by_name ?? null,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

// ─── Thread list shape (latest message + counts) ──────────────────────
function threadToJson(latest: any, allInThread: any[], otherSideRole: "parent" | "school") {
  // On the school side this counts parent messages not yet ANSWERED; on
  // the parent side, school messages the parent has not yet opened. Same
  // column, and in both cases it means "still owed attention by whoever
  // is looking".
  const unreadCount = allInThread.filter(
    (m) => m.sent_by_role !== otherSideRole && m.read_at === null,
  ).length;
  return {
    threadId: latest.thread_id,
    subject: allInThread[0]?.subject ?? "(no subject)",
    studentId: latest.student_id,
    parentUserId: latest.parent_user_id,
    latestBody: latest.body,
    latestSentByRole: latest.sent_by_role,
    latestAt: latest.created_at,
    unreadCount,
    messageCount: allInThread.length,
  };
}

/** How long the school gives itself to answer a parent, in SCHOOL days.
 *  A policy, so the school owns it: settings.parent_reply_sla_days.
 *  Two school days by default — a message on Monday is overdue on
 *  Wednesday, and a Friday message is not overdue on Monday. */
async function replySlaDays(orgId: string): Promise<number> {
  const { data } = await serviceRoleClient
    .from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const raw = (data as any)?.settings?.parent_reply_sla_days;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? Math.round(n) : 2;
}

export function installMessages(school: Hono): void {
  // ─── Parent portal ─────────────────────────────────────────────────
  // GET /school/pin-me/messages — thread list
  school.get("/pin-me/messages", async (c) => {
    const g = await pinGate(c);
    if (!g.ok) return g.resp;
    const { parentUserId, orgId } = g;
    const { data: rows } = await serviceRoleClient
      .from("parent_message")
      .select("*")
      .eq("org_id", orgId)
      .eq("parent_user_id", parentUserId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    // Group by thread.
    const threads = new Map<string, any[]>();
    for (const m of (rows ?? []) as any[]) {
      const arr = threads.get(m.thread_id) ?? [];
      arr.push(m);
      threads.set(m.thread_id, arr);
    }
    const out: any[] = [];
    for (const [, list] of threads) {
      const latest = list[list.length - 1];
      // For parent: "the other side" is school.
      out.push(threadToJson(latest, list, "parent"));
    }
    // Newest first. (Ageing and the reply window belong to the STAFF
    // inbox; a parent is not chasing their own message.)
    out.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
    return c.json({ threads: out });
  });

  // GET thread messages (parent view)
  school.get("/pin-me/messages/:threadId", async (c) => {
    const g = await pinGate(c);
    if (!g.ok) return g.resp;
    const { parentUserId, orgId } = g;
    const threadId = c.req.param("threadId");

    const { data } = await serviceRoleClient
      .from("parent_message")
      .select("*")
      .eq("org_id", orgId)
      .eq("thread_id", threadId)
      .eq("parent_user_id", parentUserId)
      .order("created_at", { ascending: true });
    if (!data || data.length === 0) {
      return c.json({ error: "thread not found" }, 404);
    }

    // Mark unread school→parent messages as read.
    const unreadIds = (data as any[])
      .filter((m) => m.sent_by_role === "school" && m.read_at === null)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      await serviceRoleClient
        .from("parent_message")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
    }

    // Hydrate sender names (parent or staff — resolveSenderName handles both).
    const senderIds = Array.from(new Set((data as any[]).map((m) => m.sent_by)));
    const names = new Map<string, string>();
    for (const sid of senderIds) {
      const n = await resolveSenderName(sid);
      if (n) names.set(sid, n);
    }
    const messages = (data as any[]).map((m) => ({
      ...m,
      __sent_by_name: names.get(m.sent_by) ?? null,
    })).map(messageToJson);
    return c.json({ messages });
  });

  // POST start a thread
  school.post("/pin-me/messages", async (c) => {
    const g = await pinGate(c);
    if (!g.ok) return g.resp;
    const { parentUserId, orgId } = g;
    const body = await c.req.json().catch(() => ({}));
    const subject = body.subject ? String(body.subject).slice(0, 200).trim() : null;
    const text = String(body.body ?? "").trim();
    const studentId = body.studentId ? String(body.studentId) : null;
    if (!text) return c.json({ error: "message body required" }, 400);
    if (text.length > 4000) return c.json({ error: "message too long (4000 char limit)" }, 400);
    if (!subject) return c.json({ error: "subject required for new threads" }, 400);

    // If studentId provided, verify the parent owns the student.
    if (studentId) {
      const { data: link } = await serviceRoleClient
        .from("student_parent")
        .select("student_id")
        .eq("parent_id", parentUserId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (!link) return c.json({ error: "student not yours" }, 403);
    }

    // Two-step: insert, then update thread_id = id.
    const { data: ins, error } = await serviceRoleClient
      .from("parent_message")
      .insert({
        org_id: orgId,
        thread_id: "00000000-0000-0000-0000-000000000000", // placeholder
        parent_user_id: parentUserId,
        student_id: studentId,
        subject,
        body: text,
        sent_by: parentUserId,
        sent_by_role: "parent",
      })
      .select("id").single();
    if (error) return c.json({ error: error.message }, 500);
    const id = (ins as any).id;
    await serviceRoleClient.from("parent_message").update({ thread_id: id }).eq("id", id);
    return c.json({ threadId: id }, 201);
  });

  // POST reply in thread (parent side)
  school.post("/pin-me/messages/:threadId/reply", async (c) => {
    const g = await pinGate(c);
    if (!g.ok) return g.resp;
    const { parentUserId, orgId } = g;
    const threadId = c.req.param("threadId");
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.body ?? "").trim();
    if (!text) return c.json({ error: "body required" }, 400);
    if (text.length > 4000) return c.json({ error: "body too long" }, 400);

    // Verify the thread belongs to this parent.
    const { data: first } = await serviceRoleClient
      .from("parent_message")
      .select("org_id, parent_user_id, student_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!first || (first as any).parent_user_id !== parentUserId || (first as any).org_id !== orgId) {
      return c.json({ error: "thread not found" }, 404);
    }
    const { error } = await serviceRoleClient
      .from("parent_message")
      .insert({
        org_id: orgId,
        thread_id: threadId,
        parent_user_id: parentUserId,
        student_id: (first as any).student_id,
        body: text,
        sent_by: parentUserId,
        sent_by_role: "parent",
      });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Admin inbox ───────────────────────────────────────────────────
  // GET /school/orgs/:orgId/inbox
  school.get("/orgs/:orgId/inbox", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isSchoolStaff(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: rows } = await serviceRoleClient
      .from("parent_message")
      .select("*")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    const threads = new Map<string, any[]>();
    for (const m of (rows ?? []) as any[]) {
      const arr = threads.get(m.thread_id) ?? [];
      arr.push(m);
      threads.set(m.thread_id, arr);
    }
    // Hydrate parent names (one lookup per unique parent).
    const parentIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.parent_user_id)),
    );
    const parentNames = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents } = await serviceRoleClient
        .from("parent")
        .select("id, full_name")
        .in("id", parentIds);
      for (const p of ((parents ?? []) as any[])) {
        parentNames.set(p.id, p.full_name);
      }
    }
    // Hydrate student labels for tagged threads.
    const studentIds = Array.from(
      new Set(((rows ?? []) as any[]).map((r) => r.student_id).filter((x): x is string => !!x)),
    );
    const studentLabels = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: studs } = await serviceRoleClient
        .from("student")
        .select("id, full_name")
        .in("id", studentIds);
      for (const s of ((studs ?? []) as any[])) {
        studentLabels.set(s.id, s.full_name);
      }
    }

    // Ageing, in SCHOOL days. Computed once for the whole inbox.
    const [week, tz, slaDays] = await Promise.all([
      loadSchoolWeek(orgId), orgTimezone(orgId), replySlaDays(orgId),
    ]);
    const todayIso = todayInOrgTz(tz);

    // Who is holding each thread. One query for the whole inbox.
    const { data: assigns } = await serviceRoleClient
      .from("parent_thread_assignment")
      .select("thread_id, assigned_to")
      .eq("org_id", orgId);
    const assignedTo = new Map<string, string>(
      ((assigns ?? []) as any[]).map((a) => [a.thread_id, a.assigned_to]),
    );
    const assigneeNames = new Map<string, string>();
    for (const uid of new Set(assignedTo.values())) {
      const n = await resolveSenderName(uid);
      if (n) assigneeNames.set(uid, n);
    }

    const out: any[] = [];
    for (const [, list] of threads) {
      const latest = list[list.length - 1];
      // For admin: "the other side" is parent.
      const t = threadToJson(latest, list, "school");
      const holder = assignedTo.get(latest.thread_id) ?? null;
      // The clock starts at the OLDEST unanswered parent message, not the
      // newest: a parent who wrote twice has been waiting since the first.
      const oldestWaiting = list
        .filter((m: any) => m.sent_by_role === "parent" && m.read_at === null)
        .map((m: any) => m.created_at)
        .sort()[0] ?? null;
      const waitingDays = oldestWaiting
        ? schoolDaysWaiting(week, oldestWaiting, todayIso)
        : null;
      out.push({
        ...t,
        parentName: parentNames.get(latest.parent_user_id) ?? null,
        studentName: latest.student_id ? studentLabels.get(latest.student_id) ?? null : null,
        assignedTo: holder,
        assignedToName: holder ? assigneeNames.get(holder) ?? null : null,
        assignedToMe: holder === userId,
        waitingSince: oldestWaiting,
        waitingSchoolDays: waitingDays,
        overdue: waitingDays !== null && waitingDays >= slaDays && slaDays > 0,
      });
    }
    out.sort((a, b) => {
      // Overdue first, longest wait at the top; everything else by
      // recency. An overdue parent must not be pushed down the page by
      // chatter on a thread that has already been answered.
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.overdue && b.overdue) {
        return (b.waitingSchoolDays ?? 0) - (a.waitingSchoolDays ?? 0);
      }
      return a.latestAt < b.latestAt ? 1 : -1;
    });
    return c.json({ threads: out, slaDays });
  });

  school.get("/orgs/:orgId/inbox/:threadId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isSchoolStaff(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const threadId = c.req.param("threadId");
    const { data } = await serviceRoleClient
      .from("parent_message")
      .select("*")
      .eq("org_id", orgId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    if (!data || data.length === 0) {
      return c.json({ error: "thread not found" }, 404);
    }
    // NOT marked read on open, deliberately.
    //
    // read_at is one column on the MESSAGE, not one per staff member, and
    // three roles share this inbox (admin, principal, office). Marking on
    // open meant the principal glancing at a thread cleared it from the
    // admin's queue while the parent still had no answer - and at this
    // school the admin works the inbox and the principal only watches
    // (Muneeb, 6 Sep). So read_at now means ANSWERED, and it is set when
    // the school replies. The badge counts parents still waiting, which
    // is the thing a principal should be looking at anyway.
    // Hydrate sender names + parent/student labels.
    const senderIds = Array.from(new Set((data as any[]).map((m) => m.sent_by)));
    const names = new Map<string, string>();
    for (const sid of senderIds) {
      const n = await resolveSenderName(sid);
      if (n) names.set(sid, n);
    }
    const first = (data as any)[0];
    const parentName: string | null = await resolveSenderName(first.parent_user_id);
    let studentName: string | null = null;
    if (first.student_id) {
      const { data: s } = await serviceRoleClient
        .from("student").select("full_name").eq("id", first.student_id).maybeSingle();
      studentName = (s as any)?.full_name ?? null;
    }
    const messages = (data as any[]).map((m) => ({
      ...m,
      __sent_by_name: names.get(m.sent_by) ?? null,
    })).map(messageToJson);
    const { data: asn } = await serviceRoleClient
      .from("parent_thread_assignment")
      .select("assigned_to")
      .eq("thread_id", threadId)
      .maybeSingle();
    const holder = (asn as any)?.assigned_to ?? null;

    return c.json({
      thread: {
        threadId,
        subject: first.subject,
        parentUserId: first.parent_user_id,
        parentName,
        studentId: first.student_id,
        studentName,
        assignedTo: holder,
        assignedToName: holder ? await resolveSenderName(holder) : null,
        assignedToMe: holder === userId,
      },
      messages,
    });
  });

  school.post("/orgs/:orgId/inbox/:threadId/reply", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isSchoolStaff(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const threadId = c.req.param("threadId");
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.body ?? "").trim();
    if (!text) return c.json({ error: "body required" }, 400);
    if (text.length > 4000) return c.json({ error: "body too long" }, 400);
    const { data: first } = await serviceRoleClient
      .from("parent_message")
      .select("org_id, parent_user_id, student_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!first || (first as any).org_id !== orgId) {
      return c.json({ error: "thread not found" }, 404);
    }
    const { error } = await serviceRoleClient
      .from("parent_message")
      .insert({
        org_id: orgId,
        thread_id: threadId,
        parent_user_id: (first as any).parent_user_id,
        student_id: (first as any).student_id,
        body: text,
        sent_by: userId,
        sent_by_role: "school",
      });
    if (error) return c.json({ error: error.message }, 500);

    // Answering an unclaimed thread claims it. Whoever replied IS the
    // person who handled it, and making them press "take" first would
    // only mean the record is empty exactly when it matters. An existing
    // holder is left alone - taking over is an explicit act.
    await serviceRoleClient
      .from("parent_thread_assignment")
      .upsert(
        { thread_id: threadId, org_id: orgId, assigned_to: userId, assigned_by: userId },
        // Claim only if unclaimed: an existing holder is left alone.
        { onConflict: "thread_id", ignoreDuplicates: true },
      );

    // The parent has an answer, so the thread stops counting as waiting.
    // (read_at on a parent→school row means "answered" - see the note in
    // the thread GET above.)
    await serviceRoleClient
      .from("parent_message")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("sent_by_role", "parent")
      .is("read_at", null);

    // Notification trigger (PR feat/notification-scaffold).
    // Channel is 'log' until the operator wires an SMS/email provider —
    // the row still lands in notification_event so analytics + a future
    // back-fill can see what was supposed to go out.
    try {
      const { data: parent } = await serviceRoleClient
        .from("parent")
        .select("phone, email, full_name")
        .eq("id", (first as any).parent_user_id)
        .maybeSingle();
      const recipient = (parent as any)?.phone || (parent as any)?.email || "";
      if (recipient) {
        const { data: org } = await serviceRoleClient
          .from("organizations").select("name").eq("id", orgId).maybeSingle();
        const { queueNotification } = await import("./notify.tsx");
        await queueNotification({
          orgId, channel: "log", recipient,
          templateKey: "message_reply",
          templateVars: {
            schoolName: (org as any)?.name ?? "the school",
            subject: text.slice(0, 80),
          },
          subjectType: "message",
          subjectId: threadId,
          dedupKey: `msg-reply:${threadId}:${Date.now()}`,
        });
      }
    } catch { /* notification failures don't break the reply */ }

    return c.json({ ok: true });
  });

  // POST .../assign   — take a thread, or hand it to a named colleague.
  // DELETE .../assign — put it back in the pool.
  //
  // Taking over someone else's thread is ALLOWED and deliberately not
  // an error: the person holding it may be off sick, and a front office
  // that cannot reassign is worse than one that occasionally treads on
  // toes. The UI shows who held it before the change.
  school.post("/orgs/:orgId/inbox/:threadId/assign", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isSchoolStaff(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const threadId = c.req.param("threadId");
    const body = await c.req.json().catch(() => ({}));
    const target = typeof body.userId === "string" && body.userId ? body.userId : userId;

    // The thread must exist in this org before we can claim it.
    const { data: first } = await serviceRoleClient
      .from("parent_message")
      .select("org_id")
      .eq("thread_id", threadId)
      .limit(1)
      .maybeSingle();
    if (!first || (first as any).org_id !== orgId) {
      return c.json({ error: "thread not found" }, 404);
    }
    // Handing a thread to someone who cannot open the inbox would make
    // it invisible to its own owner.
    if (target !== userId && !(await isSchoolStaff(target, orgId))) {
      return c.json({ error: "that person does not have access to the parent inbox" }, 400);
    }

    const { error } = await serviceRoleClient
      .from("parent_thread_assignment")
      .upsert({
        thread_id: threadId,
        org_id: orgId,
        assigned_to: target,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      }, { onConflict: "thread_id" });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      ok: true,
      assignedTo: target,
      assignedToName: await resolveSenderName(target),
    });
  });

  school.delete("/orgs/:orgId/inbox/:threadId/assign", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isSchoolStaff(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const threadId = c.req.param("threadId");
    const { error } = await serviceRoleClient
      .from("parent_thread_assignment")
      .delete()
      .eq("thread_id", threadId)
      .eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, assignedTo: null });
  });

  // Lightweight count for dashboards / nav badges: how many parent
  // messages are still WAITING FOR A REPLY (not "unopened" - opening a
  // thread no longer changes anything; see the thread GET).
  school.get("/orgs/:orgId/inbox-unread-count", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await isSchoolStaff(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { count } = await serviceRoleClient
      .from("parent_message")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("sent_by_role", "parent")
      .is("read_at", null)
      .is("archived_at", null);
    // `unreadCount` kept as the wire name so existing callers keep
    // working; `awaitingReply` says what it actually counts now.
    return c.json({ unreadCount: count ?? 0, awaitingReply: count ?? 0 });
  });
}

export default installMessages;
