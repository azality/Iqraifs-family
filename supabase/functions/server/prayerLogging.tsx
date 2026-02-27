/**
 * Prayer Logging Module
 * 
 * Kid-initiated prayer claims with parent approval workflow.
 * Teaches accountability and builds parent-child trust.
 * 
 * Features:
 * - Kids claim prayers (creates pending claim)
 * - Parents approve/deny claims
 * - Points awarded only on approval
 * - One claim per prayer per day
 * - Time window validation (optional)
 * - Daily limits (max 5 prayers)
 */

import * as kv from "./kv_store.tsx";
import { notifyFamilyParents } from "./notifications.tsx";

/**
 * Get today's date in YYYY-MM-DD format using family timezone
 * @param timezone - IANA timezone (e.g., 'America/Toronto')
 */
function getTodayDate(timezone: string = 'UTC'): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now); // Returns YYYY-MM-DD in family timezone
}

// Prayer times (rough guidelines - can be customized per family)
export const PRAYER_TIMES = {
  Fajr: { start: '04:00', end: '06:30', label: '☀️ Fajr (Dawn)' },
  Dhuhr: { start: '12:00', end: '15:00', label: '☀️ Dhuhr (Noon)' },
  Asr: { start: '15:00', end: '18:00', label: '☀️ Asr (Afternoon)' },
  Maghrib: { start: '18:00', end: '20:00', label: '🌙 Maghrib (Sunset)' },
  Isha: { start: '20:00', end: '23:59', label: '🌙 Isha (Night)' }
};

export const PRAYER_NAMES = Object.keys(PRAYER_TIMES);

export interface PrayerClaim {
  id: string;
  childId: string;
  prayerName: string;
  claimedAt: string; // ISO timestamp
  claimedDate: string; // YYYY-MM-DD
  status: 'pending' | 'approved' | 'denied';
  points: number; // Points to award if approved
  approvedBy?: string; // parent user ID
  approvedAt?: string;
  deniedBy?: string; // parent user ID
  deniedAt?: string;
  denialReason?: string;
  backdated?: boolean; // For future backdating feature
  backdateDate?: string; // YYYY-MM-DD
}

/**
 * Generate a unique ID for prayer claims
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a prayer claim (kid-initiated)
 * 
 * @param childId - Child making the claim
 * @param prayerName - Prayer name (Fajr, Dhuhr, etc.)
 * @param points - Points to award if approved
 * @param timezone - Family timezone for accurate date boundaries
 * @param backdateDate - Optional: date to backdate claim to (YYYY-MM-DD)
 * @returns Created prayer claim
 */
export async function createPrayerClaim(
  childId: string,
  prayerName: string,
  points: number = 5,
  timezone: string = 'UTC',
  backdateDate?: string
): Promise<PrayerClaim> {
  // Validate prayer name
  if (!PRAYER_NAMES.includes(prayerName)) {
    throw new Error(`Invalid prayer name: ${prayerName}`);
  }

  // Determine the claim date (using family timezone)
  const claimDate = backdateDate || getTodayDate(timezone);
  const now = new Date().toISOString();

  // Validate backdating (can't backdate more than 7 days)
  if (backdateDate) {
    const backdateTime = new Date(backdateDate).getTime();
    const todayTime = new Date(getTodayDate(timezone)).getTime();
    const daysDiff = (todayTime - backdateTime) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 7) {
      throw new Error('Cannot backdate more than 7 days');
    }
    
    if (daysDiff < 0) {
      throw new Error('Cannot backdate to future date');
    }
  }

  // Check if already claimed this prayer on this date
  const existingClaim = await kv.get(
    `prayer-claim-index:${childId}:${claimDate}:${prayerName}`
  );
  
  if (existingClaim) {
    throw new Error(`Already claimed ${prayerName} for ${claimDate}`);
  }

  // Check daily limit (max 5 prayers per day)
  const dailyIndexKey = `prayer-claims-by-date:${childId}:${claimDate}`;
  const dailyClaims = (await kv.get(dailyIndexKey)) || {};
  
  if (Object.keys(dailyClaims).length >= 5) {
    throw new Error('Maximum 5 prayers per day');
  }

  // Create claim
  const claim: PrayerClaim = {
    id: generateId(),
    childId,
    prayerName,
    claimedAt: now,
    claimedDate: claimDate,
    status: 'pending',
    points,
    backdated: !!backdateDate,
    backdateDate: backdateDate
  };

  // Store claim
  await kv.set(`prayer-claim:${claim.id}`, claim);

  // Update indexes
  await kv.set(
    `prayer-claim-index:${childId}:${claimDate}:${prayerName}`,
    claim.id
  );

  // Update daily claims index
  dailyClaims[prayerName] = claim.id;
  await kv.set(dailyIndexKey, dailyClaims);

  // Add to child's claims list
  const childClaimsKey = `prayer-claims-by-child:${childId}`;
  const childClaims = (await kv.get(childClaimsKey)) || [];
  childClaims.push(claim.id);
  await kv.set(childClaimsKey, childClaims);

  // Notify parents about new prayer claim (non-blocking)
  try {
    const child = await kv.get(`child:${childId}`);
    if (child && child.familyId) {
      await notifyFamilyParents(child.familyId, {
        title: '🕌 Prayer Logged',
        body: `${child.name} logged ${prayerName}`,
        data: {
          type: 'prayer_approval',
          childId: childId,
          itemId: claim.id,
          route: '/prayer-approvals'
        }
      });
    }
  } catch (notifyError) {
    // Non-blocking - don't fail claim creation if notification fails
    console.error('Failed to send prayer notification:', notifyError);
  }

  return claim;
}

/**
 * Get all claims for a child
 * 
 * @param childId - Child ID
 * @param status - Optional status filter
 * @param limit - Max number of claims to return (default: 50)
 * @returns Array of prayer claims
 */
export async function getChildClaims(
  childId: string,
  status?: 'pending' | 'approved' | 'denied',
  limit: number = 50
): Promise<PrayerClaim[]> {
  const childClaimsKey = `prayer-claims-by-child:${childId}`;
  const claimIds = (await kv.get(childClaimsKey)) || [];

  const claims: PrayerClaim[] = [];
  
  for (const claimId of claimIds.slice(-limit)) {
    const claim = await kv.get(`prayer-claim:${claimId}`);
    if (claim && (!status || claim.status === status)) {
      claims.push(claim);
    }
  }

  // Sort by claimed date (most recent first)
  return claims.sort((a, b) => 
    new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime()
  );
}

/**
 * Get claims for a specific date
 * 
 * @param childId - Child ID
 * @param date - Date in YYYY-MM-DD format
 * @returns Array of prayer claims for that date
 */
export async function getClaimsForDate(
  childId: string,
  date: string
): Promise<PrayerClaim[]> {
  const dailyIndexKey = `prayer-claims-by-date:${childId}:${date}`;
  const dailyClaims = (await kv.get(dailyIndexKey)) || {};

  const claims: PrayerClaim[] = [];
  
  for (const claimId of Object.values(dailyClaims)) {
    const claim = await kv.get(`prayer-claim:${claimId}`);
    if (claim) {
      claims.push(claim);
    }
  }

  return claims;
}

/**
 * Get all pending claims for a family (for parent approval)
 * 
 * @param familyId - Family ID
 * @returns Array of pending prayer claims
 */
export async function getPendingClaimsForFamily(
  familyId: string
): Promise<PrayerClaim[]> {
  // Get all children in family
  const children = await kv.getByPrefix(`child:`) || [];
  const familyChildren = children.filter((child: any) => child.familyId === familyId);

  const pendingClaims: PrayerClaim[] = [];

  for (const child of familyChildren) {
    const claims = await getChildClaims(child.id, 'pending');
    pendingClaims.push(...claims);
  }

  // Sort by claimed date (oldest first for approval queue)
  return pendingClaims.sort((a, b) => 
    new Date(a.claimedAt).getTime() - new Date(b.claimedAt).getTime()
  );
}

/**
 * Approve a prayer claim (parent action)
 * 
 * @param claimId - Claim ID
 * @param parentId - Parent user ID
 * @returns Updated claim and created point event
 */
export async function approvePrayerClaim(
  claimId: string,
  parentId: string
): Promise<{ claim: PrayerClaim; pointEvent: any }> {
  // Get claim
  const claim = await kv.get(`prayer-claim:${claimId}`);
  
  if (!claim) {
    throw new Error('Prayer claim not found');
  }

  if (claim.status !== 'pending') {
    throw new Error(`Cannot approve claim with status: ${claim.status}`);
  }

  // Update claim status
  claim.status = 'approved';
  claim.approvedBy = parentId;
  claim.approvedAt = new Date().toISOString();
  await kv.set(`prayer-claim:${claimId}`, claim);

  // Get parent name for audit trail
  const parent = await kv.get(`user:${parentId}`);
  const parentName = parent?.name || 'Parent';

  // Award points (create point event)
  const pointEventId = generateId();
  const pointEvent = {
    id: pointEventId,
    childId: claim.childId,
    trackableItemId: 'prayer',
    itemName: `Prayer: ${claim.prayerName}`,
    points: claim.points,
    loggedBy: parentId,
    loggedByName: parentName,
    loggedByRole: 'parent',
    timestamp: new Date().toISOString(),
    notes: claim.backdated 
      ? `Prayer: ${claim.prayerName} (backdated to ${claim.backdateDate})`
      : `Prayer: ${claim.prayerName}`,
    prayerClaimId: claimId,
    backdated: claim.backdated,
    backdateDate: claim.backdateDate
  };

  await kv.set(`event:${pointEventId}`, pointEvent);

  // Update child points
  const child = await kv.get(`child:${claim.childId}`);
  if (child) {
    child.currentPoints = (child.currentPoints || 0) + claim.points;
    await kv.set(`child:${claim.childId}`, child);

    // Add event to child's event list
    const childEventsKey = `events-by-child:${claim.childId}`;
    const childEvents = (await kv.get(childEventsKey)) || [];
    childEvents.push(pointEventId);
    await kv.set(childEventsKey, childEvents);
  }

  return { claim, pointEvent };
}

/**
 * Deny a prayer claim (parent action)
 * 
 * @param claimId - Claim ID
 * @param parentId - Parent user ID
 * @param reason - Optional reason for denial
 * @returns Updated claim
 */
export async function denyPrayerClaim(
  claimId: string,
  parentId: string,
  reason?: string
): Promise<PrayerClaim> {
  // Get claim
  const claim = await kv.get(`prayer-claim:${claimId}`);
  
  if (!claim) {
    throw new Error('Prayer claim not found');
  }

  if (claim.status !== 'pending') {
    throw new Error(`Cannot deny claim with status: ${claim.status}`);
  }

  // Update claim status
  claim.status = 'denied';
  claim.deniedBy = parentId;
  claim.deniedAt = new Date().toISOString();
  claim.denialReason = reason;
  await kv.set(`prayer-claim:${claimId}`, claim);

  return claim;
}

/**
 * Get prayer statistics for a child
 * 
 * @param childId - Child ID
 * @param days - Number of days to look back (default: 7)
 * @returns Prayer statistics
 */
export async function getPrayerStats(
  childId: string,
  days: number = 7
): Promise<{
  totalClaimed: number;
  totalApproved: number;
  totalDenied: number;
  pendingCount: number;
  approvalRate: number;
  streak: number;
  byPrayer: Record<string, { claimed: number; approved: number }>;
}> {
  const claims = await getChildClaims(childId);

  const stats = {
    totalClaimed: claims.length,
    totalApproved: claims.filter(c => c.status === 'approved').length,
    totalDenied: claims.filter(c => c.status === 'denied').length,
    pendingCount: claims.filter(c => c.status === 'pending').length,
    approvalRate: 0,
    streak: 0,
    byPrayer: {} as Record<string, { claimed: number; approved: number }>
  };

  // Calculate approval rate
  if (stats.totalClaimed > 0) {
    stats.approvalRate = Math.round((stats.totalApproved / stats.totalClaimed) * 100);
  }

  // Calculate by-prayer stats
  for (const prayerName of PRAYER_NAMES) {
    stats.byPrayer[prayerName] = {
      claimed: claims.filter(c => c.prayerName === prayerName).length,
      approved: claims.filter(c => c.prayerName === prayerName && c.status === 'approved').length
    };
  }

  // Calculate streak (consecutive days with at least one approved prayer)
  const today = getTodayDate();
  let streak = 0;
  let currentDate = new Date(today);

  while (true) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dateClaims = await getClaimsForDate(childId, dateStr);
    const hasApprovedPrayer = dateClaims.some(c => c.status === 'approved');

    if (hasApprovedPrayer) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }

    // Safety limit
    if (streak >= 365) break;
  }

  stats.streak = streak;

  return stats;
}
