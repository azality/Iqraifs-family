/**
 * Family Invite System
 * 
 * Secure co-parent invitation flow:
 * 1. Dad creates invite (POST /families/invite)
 * 2. System generates single-use invite code
 * 3. Mom accepts invite and creates account (POST /families/accept-invite)
 * 4. Mom linked to family as co-parent
 */

import * as kv from "./kv_store.tsx";

/**
 * Generate random invite code (6 characters, alphanumeric)
 */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars (0,O,1,I)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create family invite
 */
export async function createInvite(
  familyId: string,
  email: string,
  invitedBy: string
): Promise<{ inviteCode: string; expiresAt: string }> {
  // Check if invite already exists for this email + family
  const existingInvites = await kv.getByPrefix(`invite:`);
  const duplicateInvite = existingInvites.find(
    (inv: any) =>
      inv.familyId === familyId &&
      inv.email.toLowerCase() === email.toLowerCase() &&
      inv.status === "pending"
  );

  if (duplicateInvite) {
    // Return existing invite if still valid
    const expiresAt = new Date(duplicateInvite.expiresAt);
    if (expiresAt > new Date()) {
      return {
        inviteCode: duplicateInvite.code,
        expiresAt: duplicateInvite.expiresAt,
      };
    }
  }

  // Generate unique invite code
  let inviteCode = generateInviteCode();
  let codeExists = await kv.get(`invite:${inviteCode}`);

  // Retry if collision (very unlikely)
  while (codeExists) {
    inviteCode = generateInviteCode();
    codeExists = await kv.get(`invite:${inviteCode}`);
  }

  // Create invite (expires in 72 hours)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72);

  const invite = {
    id: `invite:${inviteCode}`,
    code: inviteCode,
    familyId,
    email: email.toLowerCase(),
    invitedBy,
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await kv.set(`invite:${inviteCode}`, invite);

  return {
    inviteCode,
    expiresAt: invite.expiresAt,
  };
}

/**
 * Validate invite code
 */
export async function validateInvite(
  inviteCode: string,
  email: string
): Promise<{ valid: boolean; familyId?: string; error?: string }> {
  const invite = await kv.get(`invite:${inviteCode.toUpperCase()}`);

  if (!invite) {
    return { valid: false, error: "Invalid invite code" };
  }

  if (invite.status !== "pending") {
    return { valid: false, error: "Invite already used" };
  }

  const expiresAt = new Date(invite.expiresAt);
  if (expiresAt < new Date()) {
    return { valid: false, error: "Invite expired" };
  }

  if (invite.email.toLowerCase() !== email.toLowerCase()) {
    return { valid: false, error: "Invite is for a different email address" };
  }

  return { valid: true, familyId: invite.familyId };
}

/**
 * Accept invite and mark as used
 */
export async function acceptInvite(
  inviteCode: string,
  userId: string
): Promise<void> {
  const invite = await kv.get(`invite:${inviteCode.toUpperCase()}`);

  if (!invite) {
    throw new Error("Invite not found");
  }

  // Mark as accepted
  invite.status = "accepted";
  invite.acceptedBy = userId;
  invite.acceptedAt = new Date().toISOString();

  await kv.set(`invite:${inviteCode.toUpperCase()}`, invite);
}

/**
 * Get pending invites for a family
 */
export async function getFamilyInvites(familyId: string): Promise<any[]> {
  const allInvites = await kv.getByPrefix("invite:");
  return allInvites
    .filter((inv: any) => inv.familyId === familyId)
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/**
 * Revoke/cancel invite
 */
export async function revokeInvite(inviteCode: string): Promise<void> {
  const invite = await kv.get(`invite:${inviteCode.toUpperCase()}`);

  if (invite) {
    invite.status = "revoked";
    invite.revokedAt = new Date().toISOString();
    await kv.set(`invite:${inviteCode.toUpperCase()}`, invite);
  }
}
