/**
 * Kid Session Management
 * 
 * Secure, scoped sessions for kid-mode access:
 * - PIN-based authentication
 * - Read-only permissions
 * - Short-lived tokens (1-24 hours)
 * - Rate-limited PIN attempts
 */

import * as kv from "./kv_store.tsx";

/**
 * Generate kid session token
 */
function generateKidToken(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const token = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `kid_${token}`;
}

/**
 * Create kid session after successful PIN verification
 */
export async function createKidSession(
  childId: string,
  rememberDevice: boolean = false
): Promise<{ token: string; expiresAt: string }> {
  const token = generateKidToken();
  
  // Session duration: 1 hour default, 24 hours if remembered
  const expiryMs = rememberDevice ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expiryMs);
  
  // Get child to extract familyId
  const child = await kv.get(childId);
  if (!child) {
    throw new Error("Child not found");
  }
  
  const session = {
    token,
    childId,
    familyId: child.familyId,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    rememberDevice,
  };
  
  await kv.set(`kidsession:${token}`, session);
  
  console.log(`Kid session created for child ${childId}, expires: ${expiresAt.toISOString()}`);
  
  return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * Verify kid session token
 */
export async function verifyKidSession(
  token: string
): Promise<{ valid: boolean; childId?: string; familyId?: string; error?: string }> {
  console.log('🔍 verifyKidSession called:', {
    tokenPreview: token?.substring(0, 20) + '...',
    startsWithKid: token?.startsWith('kid_')
  });
  
  if (!token || !token.startsWith('kid_')) {
    console.log('❌ Invalid token format');
    return { valid: false, error: "Invalid token format" };
  }
  
  const sessionKey = `kidsession:${token}`;
  console.log('🔍 Looking up session with key:', sessionKey.substring(0, 35) + '...');
  
  const session = await kv.get(sessionKey);
  
  console.log('🔍 Session lookup result:', {
    found: !!session,
    sessionData: session ? {
      childId: session.childId,
      familyId: session.familyId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt
    } : null
  });
  
  if (!session) {
    console.log('❌ Session not found in KV store');
    return { valid: false, error: "Session not found" };
  }
  
  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  console.log('🔍 Checking expiration:', {
    expiresAt: expiresAt.toISOString(),
    now: now.toISOString(),
    expired: expiresAt < now
  });
  
  if (expiresAt < now) {
    // Session expired - clean up
    console.log('❌ Session expired, cleaning up');
    await kv.del(sessionKey);
    return { valid: false, error: "Session expired" };
  }
  
  console.log('✅ Session valid');
  return {
    valid: true,
    childId: session.childId,
    familyId: session.familyId,
  };
}

/**
 * Revoke kid session (parent override)
 */
export async function revokeKidSession(token: string): Promise<void> {
  await kv.del(`kidsession:${token}`);
}

/**
 * Revoke all sessions for a child (e.g., PIN reset)
 */
export async function revokeAllChildSessions(childId: string): Promise<number> {
  const allSessions = await kv.getByPrefix("kidsession:");
  const childSessions = allSessions.filter((s: any) => s.childId === childId);
  
  for (const session of childSessions) {
    await kv.del(`kidsession:${session.token}`);
  }
  
  console.log(`Revoked ${childSessions.length} sessions for child ${childId}`);
  return childSessions.length;
}

/**
 * Get active sessions for a child (parent dashboard)
 */
export async function getChildSessions(childId: string): Promise<any[]> {
  const allSessions = await kv.getByPrefix("kidsession:");
  const childSessions = allSessions.filter((s: any) => s.childId === childId);
  
  // Filter out expired sessions
  const now = new Date();
  const activeSessions = childSessions.filter((s: any) => new Date(s.expiresAt) > now);
  
  return activeSessions.map((s: any) => ({
    token: s.token.substring(0, 12) + "...", // Partial token for display
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    rememberDevice: s.rememberDevice,
  }));
}

/**
 * Track PIN failure for rate limiting
 */
export async function trackPinFailure(
  childId: string,
  deviceHash: string
): Promise<{ locked: boolean; retryAfter?: number; attemptsRemaining?: number }> {
  const today = new Date().toISOString().split('T')[0];
  const key = `pinfail:${childId}:${today}:${deviceHash}`;
  
  const record = await kv.get(key) || { count: 0, lastAttemptAt: null, lockedUntil: null };
  
  // Check if currently locked
  if (record.lockedUntil) {
    const lockExpiry = new Date(record.lockedUntil);
    if (lockExpiry > new Date()) {
      const retryAfter = Math.ceil((lockExpiry.getTime() - Date.now()) / 1000);
      return { locked: true, retryAfter };
    }
    // Lock expired - reset count
    record.count = 0;
    record.lockedUntil = null;
  }
  
  // Increment failure count
  record.count += 1;
  record.lastAttemptAt = new Date().toISOString();
  
  // Lock after 5 failed attempts
  const MAX_ATTEMPTS = 5;
  if (record.count >= MAX_ATTEMPTS) {
    // Escalating lockout: 5min, 15min, 30min, 1hr, 24hr
    const lockoutMinutes = [5, 15, 30, 60, 1440][Math.min(record.count - MAX_ATTEMPTS, 4)];
    const lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    record.lockedUntil = lockedUntil.toISOString();
    
    await kv.set(key, record);
    
    const retryAfter = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
    console.warn(`PIN locked for child ${childId} (${record.count} failures), retry after ${lockoutMinutes} min`);
    
    return { locked: true, retryAfter };
  }
  
  await kv.set(key, record);
  
  return {
    locked: false,
    attemptsRemaining: MAX_ATTEMPTS - record.count,
  };
}

/**
 * Reset PIN failure tracking (after successful login)
 */
export async function resetPinFailures(childId: string, deviceHash: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `pinfail:${childId}:${today}:${deviceHash}`;
  await kv.del(key);
}

/**
 * Check if PIN attempts are locked
 */
export async function isPinLocked(
  childId: string,
  deviceHash: string
): Promise<{ locked: boolean; retryAfter?: number; attemptsRemaining?: number }> {
  const today = new Date().toISOString().split('T')[0];
  const key = `pinfail:${childId}:${today}:${deviceHash}`;
  
  const record = await kv.get(key);
  if (!record) {
    return { locked: false, attemptsRemaining: 5 };
  }
  
  if (record.lockedUntil) {
    const lockExpiry = new Date(record.lockedUntil);
    if (lockExpiry > new Date()) {
      const retryAfter = Math.ceil((lockExpiry.getTime() - Date.now()) / 1000);
      return { locked: true, retryAfter };
    }
  }
  
  return {
    locked: false,
    attemptsRemaining: Math.max(0, 5 - (record.count || 0)),
  };
}

/**
 * Generate device hash from IP + User-Agent (simple fingerprint)
 */
export function getDeviceHash(ip: string, userAgent: string): string {
  const combined = `${ip}:${userAgent}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  
  // Simple hash (for demo - use crypto.subtle.digest in production)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}