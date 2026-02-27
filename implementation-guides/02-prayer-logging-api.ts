// ============================================================================
// PRAYER LOGGING API ENDPOINTS
// ============================================================================
// File: /supabase/functions/server/prayer-logging-api.ts
// Purpose: Server-side endpoints for prayer claims, approvals, and denials
// ============================================================================

import { Hono } from 'npm:hono';
import { createClient } from 'npm:@supabase/supabase-js@2';

const app = new Hono();

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get authenticated user from token
 */
async function getAuthenticatedUser(c: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Get family timezone
 */
async function getFamilyTimezone(familyId: string): Promise<string> {
  const { data: family } = await supabase
    .from('families')
    .select('timezone')
    .eq('id', familyId)
    .single();

  return family?.timezone || 'America/New_York';
}

/**
 * Get today's date in family timezone
 */
function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now); // Returns YYYY-MM-DD
}

/**
 * Send notification to parents
 */
async function notifyParents(familyId: string, childId: string, prayer: string, date: string) {
  // Get all parents in family
  const { data: parents } = await supabase
    .from('users')
    .select('id, email, display_name')
    .eq('family_id', familyId);

  // Create notifications
  const notifications = parents?.map(parent => ({
    user_id: parent.id,
    type: 'prayer_claim',
    title: 'Prayer Approval Needed',
    message: `Your child claims to have prayed ${prayer} on ${date}`,
    data: {
      child_id: childId,
      prayer,
      date
    }
  })) || [];

  await supabase.from('notifications').insert(notifications);
}

// ============================================================================
// ENDPOINT 1: CREATE PRAYER CLAIM (Kid or Parent)
// ============================================================================
app.post('/make-server-f116e23f/prayer-claims', async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    const body = await c.req.json();

    const { child_id, prayer, date } = body;

    // Validate prayer
    const validPrayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    if (!validPrayers.includes(prayer)) {
      return c.json({ error: 'Invalid prayer name' }, 400);
    }

    // Get child's family
    const { data: child } = await supabase
      .from('children')
      .select('family_id')
      .eq('id', child_id)
      .single();

    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }

    // Get family timezone
    const timezone = await getFamilyTimezone(child.family_id);

    // Use today if no date provided
    const claimDate = date || getTodayInTimezone(timezone);

    // Check if prayer already logged for this day
    const { data: existingClaim } = await supabase
      .from('prayer_claims')
      .select('id, status')
      .eq('child_id', child_id)
      .eq('prayer', prayer)
      .eq('date', claimDate)
      .maybeSingle();

    if (existingClaim) {
      return c.json(
        { error: `${prayer} already logged for ${claimDate}` },
        409 // Conflict
      );
    }

    // Check if parent already logged this directly
    const { data: existingPointEvent } = await supabase
      .from('point_events')
      .select('id')
      .eq('child_id', child_id)
      .eq('behavior_name', prayer)
      .gte('occurred_at', `${claimDate}T00:00:00`)
      .lt('occurred_at', `${claimDate}T23:59:59`)
      .maybeSingle();

    if (existingPointEvent) {
      return c.json(
        { error: `${prayer} already logged for ${claimDate}` },
        409
      );
    }

    // Create pending claim
    const { data: claim, error } = await supabase
      .from('prayer_claims')
      .insert({
        child_id,
        prayer,
        date: claimDate,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating claim:', error);
      return c.json({ error: error.message }, 500);
    }

    // Notify parents
    await notifyParents(child.family_id, child_id, prayer, claimDate);

    return c.json(claim, 201);

  } catch (error) {
    console.error('Error in prayer-claims POST:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
});

// ============================================================================
// ENDPOINT 2: GET PRAYER CLAIMS (Parent or Kid view)
// ============================================================================
app.get('/make-server-f116e23f/prayer-claims', async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    const { child_id, status } = c.req.query();

    let query = supabase
      .from('prayer_claims')
      .select(`
        *,
        child:children(id, name),
        approvals:prayer_approvals(
          id,
          parent_id,
          parent:users(display_name, email),
          approved_at,
          points_awarded
        ),
        denials:prayer_denials(
          id,
          parent_id,
          parent:users(display_name, email),
          denied_at,
          reason
        )
      `)
      .order('date', { ascending: false });

    // Filter by child if specified
    if (child_id) {
      query = query.eq('child_id', child_id);
    }

    // Filter by status if specified
    if (status) {
      query = query.eq('status', status);
    }

    const { data: claims, error } = await query;

    if (error) {
      console.error('Error fetching claims:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json(claims);

  } catch (error) {
    console.error('Error in prayer-claims GET:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
});

// ============================================================================
// ENDPOINT 3: APPROVE PRAYER CLAIM
// ============================================================================
app.post('/make-server-f116e23f/prayer-claims/:id/approve', async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    const claimId = c.req.param('id');

    // Get claim details
    const { data: claim, error: claimError } = await supabase
      .from('prayer_claims')
      .select('*, child:children(id, family_id, total_points)')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return c.json({ error: 'Claim not found' }, 404);
    }

    // Verify user is a parent in this family
    const { data: parent } = await supabase
      .from('users')
      .select('id, family_id')
      .eq('id', user.id)
      .eq('family_id', claim.child.family_id)
      .single();

    if (!parent) {
      return c.json({ error: 'Unauthorized: Not a parent in this family' }, 403);
    }

    // Check if already approved by this parent
    const { data: existingApproval } = await supabase
      .from('prayer_approvals')
      .select('id')
      .eq('claim_id', claimId)
      .eq('parent_id', user.id)
      .maybeSingle();

    if (existingApproval) {
      // Idempotent: Return success but don't award extra points
      return c.json({
        message: 'Already approved by this parent',
        approval: existingApproval
      }, 200);
    }

    // Get prayer point value from trackables
    const { data: trackable } = await supabase
      .from('trackables')
      .select('points')
      .eq('family_id', claim.child.family_id)
      .eq('behavior_name', claim.prayer)
      .single();

    const basePoints = trackable?.points || 10;

    // Use transaction to prevent race conditions
    // Note: Supabase doesn't support transactions directly, so we use unique constraints

    // Insert approval (will fail if duplicate due to UNIQUE constraint)
    const { data: approval, error: approvalError } = await supabase
      .from('prayer_approvals')
      .insert({
        claim_id: claimId,
        parent_id: user.id,
        points_awarded: basePoints
      })
      .select()
      .single();

    if (approvalError) {
      if (approvalError.code === '23505') { // Unique violation
        return c.json({ message: 'Already approved' }, 200);
      }
      throw approvalError;
    }

    // Count total approvals
    const { data: allApprovals } = await supabase
      .from('prayer_approvals')
      .select('id')
      .eq('claim_id', claimId);

    const approvalCount = allApprovals?.length || 0;

    // Determine approval number (1st or 2nd)
    const approvalNumber = approvalCount;

    // Create or update point event
    let pointEventId: string;

    if (approvalNumber === 1) {
      // First approval: Create point event
      const { data: pointEvent } = await supabase
        .from('point_events')
        .insert({
          child_id: claim.child_id,
          behavior_name: claim.prayer,
          points: basePoints,
          occurred_at: `${claim.date}T12:00:00`, // Noon on claim date
          logged_by: claim.child_id, // Kid claimed
          approved_by: user.id,
          prayer_claim_id: claimId,
          approval_number: 1
        })
        .select()
        .single();

      pointEventId = pointEvent?.id;

    } else if (approvalNumber === 2) {
      // Second approval: Add another point event (or update existing)
      const { data: pointEvent } = await supabase
        .from('point_events')
        .insert({
          child_id: claim.child_id,
          behavior_name: claim.prayer,
          points: basePoints,
          occurred_at: `${claim.date}T12:00:00`,
          logged_by: claim.child_id,
          approved_by: user.id,
          prayer_claim_id: claimId,
          approval_number: 2
        })
        .select()
        .single();

      pointEventId = pointEvent?.id;
    }

    // Update child's total points
    const newTotal = (claim.child.total_points || 0) + basePoints;
    await supabase
      .from('children')
      .update({ total_points: newTotal })
      .eq('id', claim.child_id);

    // Update claim status
    const newStatus = approvalCount >= 2 ? 'fully_approved' : 'partially_approved';
    await supabase
      .from('prayer_claims')
      .update({ status: newStatus })
      .eq('id', claimId);

    // Check if this completes a quest
    const { data: quest } = await supabase
      .from('quests')
      .select('id, status')
      .eq('child_id', claim.child_id)
      .eq('behavior_name', claim.prayer)
      .eq('date', claim.date)
      .maybeSingle();

    if (quest && quest.status !== 'completed') {
      await supabase
        .from('quests')
        .update({ status: 'completed' })
        .eq('id', quest.id);
    }

    return c.json({
      success: true,
      approval,
      points_awarded: basePoints,
      total_points: newTotal,
      approval_count: approvalCount,
      status: newStatus
    });

  } catch (error) {
    console.error('Error approving prayer claim:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
});

// ============================================================================
// ENDPOINT 4: DENY PRAYER CLAIM
// ============================================================================
app.post('/make-server-f116e23f/prayer-claims/:id/deny', async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    const claimId = c.req.param('id');
    const body = await c.req.json();
    const { reason } = body;

    // Get claim details
    const { data: claim } = await supabase
      .from('prayer_claims')
      .select('*, child:children(family_id)')
      .eq('id', claimId)
      .single();

    if (!claim) {
      return c.json({ error: 'Claim not found' }, 404);
    }

    // Verify user is parent in this family
    const { data: parent } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .eq('family_id', claim.child.family_id)
      .single();

    if (!parent) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Check if already denied
    const { data: existingDenial } = await supabase
      .from('prayer_denials')
      .select('id')
      .eq('claim_id', claimId)
      .eq('parent_id', user.id)
      .maybeSingle();

    if (existingDenial) {
      return c.json({ message: 'Already denied' }, 200);
    }

    // Insert denial
    const { data: denial, error } = await supabase
      .from('prayer_denials')
      .insert({
        claim_id: claimId,
        parent_id: user.id,
        reason: reason || null
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Note: Denials are independent per-parent
    // Other parent can still approve

    return c.json({ success: true, denial });

  } catch (error) {
    console.error('Error denying prayer claim:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
});

// ============================================================================
// ENDPOINT 5: PARENT BACKDATES PRAYER LOG
// ============================================================================
app.post('/make-server-f116e23f/prayer-logs/backdate', async (c) => {
  try {
    const user = await getAuthenticatedUser(c);
    const body = await c.req.json();

    const { child_id, prayer, date } = body;

    // Validate date is yesterday only
    const { data: child } = await supabase
      .from('children')
      .select('family_id')
      .eq('id', child_id)
      .single();

    if (!child) {
      return c.json({ error: 'Child not found' }, 404);
    }

    const timezone = await getFamilyTimezone(child.family_id);
    const today = getTodayInTimezone(timezone);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (date !== yesterdayStr) {
      return c.json({ error: 'Can only backdate to yesterday' }, 400);
    }

    // Check if pending claim exists
    const { data: pendingClaim } = await supabase
      .from('prayer_claims')
      .select('id, status')
      .eq('child_id', child_id)
      .eq('prayer', prayer)
      .eq('date', date)
      .maybeSingle();

    if (pendingClaim) {
      // MERGE: Convert pending claim to approved
      // This calls the approve endpoint internally
      return c.redirect(`/make-server-f116e23f/prayer-claims/${pendingClaim.id}/approve`);
    }

    // Check if already logged
    const { data: existingLog } = await supabase
      .from('point_events')
      .select('id')
      .eq('child_id', child_id)
      .eq('behavior_name', prayer)
      .gte('occurred_at', `${date}T00:00:00`)
      .lt('occurred_at', `${date}T23:59:59`)
      .maybeSingle();

    if (existingLog) {
      return c.json({ error: `${prayer} already logged for ${date}` }, 409);
    }

    // Get points from trackable
    const { data: trackable } = await supabase
      .from('trackables')
      .select('points')
      .eq('family_id', child.family_id)
      .eq('behavior_name', prayer)
      .single();

    const points = trackable?.points || 10;

    // Create backdated point event
    const { data: pointEvent } = await supabase
      .from('point_events')
      .insert({
        child_id,
        behavior_name: prayer,
        points,
        occurred_at: `${date}T12:00:00`,
        logged_by: user.id, // Parent logged
        notes: 'Backdated'
      })
      .select()
      .single();

    // Update child points
    const { data: childData } = await supabase
      .from('children')
      .select('total_points')
      .eq('id', child_id)
      .single();

    await supabase
      .from('children')
      .update({ total_points: (childData?.total_points || 0) + points })
      .eq('id', child_id);

    // Check if completes yesterday's quest
    const { data: quest } = await supabase
      .from('quests')
      .select('id')
      .eq('child_id', child_id)
      .eq('behavior_name', prayer)
      .eq('date', date)
      .eq('status', 'incomplete')
      .maybeSingle();

    if (quest) {
      await supabase
        .from('quests')
        .update({ status: 'completed' })
        .eq('id', quest.id);
    }

    return c.json({ success: true, point_event: pointEvent });

  } catch (error) {
    console.error('Error backdating prayer:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
});

export default app;
