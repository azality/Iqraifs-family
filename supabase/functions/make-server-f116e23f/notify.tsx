// Notification dispatcher (rec #2).
//
// Provider-agnostic. Trigger points across the codebase call
// `queueNotification(...)` which writes a row to notification_event.
// The actual sender process (sender.tsx, optional cron) picks up
// queued rows and hands them to the channel-specific sender.
//
// Today only the 'log' sender is wired up — it console.logs the
// notification, no external call. To enable real SMS/email:
//
//   1. Set the provider env vars (SMS_PROVIDER, SMS_API_KEY, etc.)
//   2. Implement the corresponding sender below
//   3. Change the channel passed at the trigger point from 'log' to 'sms' / 'email'
//
// Templates live in TEMPLATES — a small registry of (key → render fn).
// Trigger points pass template_key + vars; the render fn builds the
// message body at SEND time so the renderer can re-fetch fresh data
// (e.g. amount after a payment landed mid-queue).

import { serviceRoleClient } from "./middleware.tsx";

export type NotificationChannel = "sms" | "email" | "push" | "log";

export interface QueueArgs {
  orgId: string;
  channel: NotificationChannel;
  recipient: string;
  templateKey: string;
  templateVars?: Record<string, unknown>;
  subjectType?: "student" | "parent" | "fee" | "message" | "announcement" | "report_card";
  subjectId?: string;
  scheduledFor?: Date;
  dedupKey?: string;       // suppress duplicate sends within an org
  maxAttempts?: number;
}

/** Insert a notification row. Safe to call from any trigger point — the
 *  UNIQUE(org_id, dedup_key) index makes duplicate insertions no-op. */
export async function queueNotification(args: QueueArgs): Promise<void> {
  try {
    await serviceRoleClient.from("notification_event").insert({
      org_id: args.orgId,
      channel: args.channel,
      recipient: args.recipient,
      template_key: args.templateKey,
      template_vars: args.templateVars ?? {},
      subject_type: args.subjectType ?? null,
      subject_id: args.subjectId ?? null,
      scheduled_for: (args.scheduledFor ?? new Date()).toISOString(),
      dedup_key: args.dedupKey ?? null,
      max_attempts: args.maxAttempts ?? 3,
    });
  } catch (err) {
    // Trigger points are best-effort — a notification failure shouldn't
    // break the main flow (e.g. a fee billing run). Log + carry on.
    console.error("[notify.queue] insert failed", err);
  }
}

// ─── Templates ─────────────────────────────────────────────────────────
// Each template_key → render(vars) → {subject, body}. The renderer
// runs at SEND time so the message reflects fresh state.

interface RenderedMessage {
  subject: string;  // for email / push title
  body: string;     // for SMS / email body / push body
}

const TEMPLATES: Record<string, (vars: Record<string, any>) => RenderedMessage> = {
  fee_due: (v) => ({
    subject: "Fee reminder",
    body: `As-salāmu ʿalaykum. ${v.studentName ?? "Your child"}'s ${v.periodLabel ?? ""} fee of Rs. ${v.amount ?? "—"} is due ${v.dueDate ?? "soon"}. View invoice in the school portal.`,
  }),
  message_reply: (v) => ({
    subject: "School replied",
    body: `${v.schoolName ?? "The school"} replied to your message "${v.subject ?? "(no subject)"}". Open the parent portal to read it.`,
  }),
  report_card_published: (v) => ({
    subject: "Report card available",
    body: `${v.termName ?? "The latest"} report card for ${v.studentName ?? "your child"} is now available in the parent portal.`,
  }),
  announcement: (v) => ({
    subject: v.title ?? "Announcement",
    body: v.body ?? "",
  }),
  attendance_absent: (v) => ({
    subject: "Absence noted",
    body: `${v.studentName ?? "Your child"} was marked absent today (${v.date ?? ""}). Please reply if this was unexpected.`,
  }),
  hifz_milestone: (v) => ({
    subject: "Hifz milestone",
    body: `${v.studentName ?? "Your child"} completed ${v.milestone ?? "a Hifz milestone"} today. MāshāAllāh.`,
  }),
};

// ─── Sender channels ───────────────────────────────────────────────────
//
// Each channel implements: send(recipient, msg) → { ok, error? }
// `log` is the no-op default. Real providers replace this with their
// own implementations (Twilio, JazzSMS, Mailgun, FCM).

interface SendResult { ok: boolean; error?: string }

async function sendLog(recipient: string, msg: RenderedMessage): Promise<SendResult> {
  console.log(`[notify.log] → ${recipient}\n  ${msg.subject}\n  ${msg.body}`);
  return { ok: true };
}

async function sendSms(_r: string, _m: RenderedMessage): Promise<SendResult> {
  // TODO: integrate with provider — e.g. JazzSMS for PK, Twilio global.
  // Until then, fail fast so operators notice.
  return { ok: false, error: "SMS sender not configured" };
}

async function sendEmail(_r: string, _m: RenderedMessage): Promise<SendResult> {
  return { ok: false, error: "Email sender not configured" };
}

async function sendPush(_r: string, _m: RenderedMessage): Promise<SendResult> {
  return { ok: false, error: "Push sender not configured" };
}

const CHANNEL_SENDERS: Record<NotificationChannel, (r: string, m: RenderedMessage) => Promise<SendResult>> = {
  sms: sendSms,
  email: sendEmail,
  push: sendPush,
  log: sendLog,
};

/** Pull queued rows and attempt to send them. Idempotent: rows get
 *  status='sending' before send, then 'sent' or 'failed' after. Caller
 *  is responsible for invoking this on a schedule (cron or on-demand). */
export async function processNotificationQueue(limit = 50): Promise<{ processed: number; sent: number; failed: number }> {
  const nowIso = new Date().toISOString();
  const { data: due } = await serviceRoleClient
    .from("notification_event")
    .select("*")
    .in("status", ["queued", "failed"])
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of ((due ?? []) as any[])) {
    if (row.attempts >= row.max_attempts) {
      // Don't retry — flip to 'cancelled' so the queue doesn't loop.
      await serviceRoleClient
        .from("notification_event")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      continue;
    }
    // Mark in-flight to suppress double-send if the worker re-runs.
    await serviceRoleClient
      .from("notification_event")
      .update({ status: "sending", attempts: row.attempts + 1 })
      .eq("id", row.id);

    const render = TEMPLATES[row.template_key];
    if (!render) {
      await serviceRoleClient
        .from("notification_event")
        .update({ status: "failed", last_error: `unknown template_key '${row.template_key}'` })
        .eq("id", row.id);
      failed++;
      continue;
    }
    const msg = render(row.template_vars ?? {});
    const sender = CHANNEL_SENDERS[row.channel as NotificationChannel];
    const res = await sender(row.recipient, msg).catch(
      (e): SendResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    if (res.ok) {
      await serviceRoleClient
        .from("notification_event")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } else {
      await serviceRoleClient
        .from("notification_event")
        .update({ status: "failed", last_error: res.error ?? "unknown error" })
        .eq("id", row.id);
      failed++;
    }
  }
  return { processed: (due ?? []).length, sent, failed };
}
