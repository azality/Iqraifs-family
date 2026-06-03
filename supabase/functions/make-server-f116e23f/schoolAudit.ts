// Invite & staff-change audit logging.
//
// Best-effort fire-and-forget — we NEVER fail the user-visible operation just
// because the audit write hit a transient error. Logs the failure to the edge
// function's stderr and moves on.
//
// Migration 20260603_0015 created the invite_audit_log table.

import { serviceRoleClient } from "./middleware.tsx";

export type AuditAction =
  | "invite_admin"
  | "invite_teacher"
  | "invite_teacher_bulk"
  | "remove_admin"
  | "remove_teacher"
  | "resend_invite"
  | "staff_self_leave"
  | "delete_school";

export interface AuditInput {
  orgId: string;
  actorUserId: string;
  actorEmail?: string | null;
  action: AuditAction;
  targetUserId?: string | null;
  targetEmail?: string | null;
  targetRole?: string | null;
  details?: Record<string, unknown>;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await serviceRoleClient.from("invite_audit_log").insert({
      org_id: input.orgId,
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      target_user_id: input.targetUserId ?? null,
      target_email: input.targetEmail ?? null,
      target_role: input.targetRole ?? null,
      details: input.details ?? {},
    });
  } catch (e) {
    // Don't break the calling flow. Audit gaps are recoverable; failed
    // invites are not.
    console.error("[audit] write failed:", e, input);
  }
}

/** Convenience: lookup actor email by user_id and call logAudit. Useful when
 *  the calling route doesn't already have the email in hand. */
export async function logAuditWithLookup(
  input: Omit<AuditInput, "actorEmail">,
): Promise<void> {
  let actorEmail: string | null = null;
  try {
    const { data: lookup } = await (serviceRoleClient as any).auth.admin.getUserById(input.actorUserId);
    actorEmail = lookup?.user?.email ?? null;
  } catch {
    /* swallow — snapshot is best-effort */
  }
  await logAudit({ ...input, actorEmail });
}
