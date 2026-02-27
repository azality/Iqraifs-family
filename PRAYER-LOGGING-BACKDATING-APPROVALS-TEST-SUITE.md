# 🕌 PRAYER LOGGING + BACKDATING + APPROVALS - COMPREHENSIVE TEST SUITE (P0)

**Last Updated:** February 22, 2026  
**Status:** PRODUCTION-CRITICAL - NEW FUNCTIONAL REQUIREMENTS  
**Priority:** P0 (Blocking - Core Feature)  
**Purpose:** Test parent backdating, kid prayer claims, parent approvals, and double-points logic

---

## 🎯 **OVERVIEW**

These tests validate two **new functional requirements** that touch:
- Data integrity
- Streak/quest logic
- Permissions
- Concurrency
- Notifications
- Audit trail display

---

## 📋 **DEFINITIONS AND RULES**

### **R1 — Backdate Logging (Parent)**

Parent can log a behavior for **yesterday** (exactly 1 day back).

**Backdated logs must:**
- ✅ Count toward **streak continuity**
- ✅ Satisfy **quest completion/eligibility** if quest system is enabled
- ✅ Update **daily prayer completion** if the behavior is a prayer
- ✅ Use **family timezone** (not UTC-shifted)

---

### **R2 — Kid-Initiated Prayer Claim + Parent Approvals**

- ✅ Kid can claim: "I prayed Fajr/Dhuhr/Asr/Maghrib/Isha" for a specific day (default = today)
- ✅ Parents receive a notification
- ✅ Each parent can approve independently
- ✅ Points are granted **per parent approval**, up to 2 approvals
- ✅ A prayer can only be **claimed once per day** (no multiple claims)

---

### **R3 — Once Per Day Constraint**

For a given **child + prayer + date** (local family timezone):
- ✅ Only **one prayer log** may exist
- ✅ That log can be created by:
  - Parent direct log
  - Kid claim
  - Parent backdated log
- ✅ Approvals must **not create new logs**; they add approval state and award points

---

### **R4 — Multi-Parent Approval = Double Points (Capped)**

- ✅ If 2 parents exist and both approve: grant **2x points** (exactly once per parent)
- ✅ If only 1 parent exists: max is 1x points
- ✅ Re-approving must not award extra points (idempotent)
- ✅ Approvals are tracked per-parent on a single prayer log

---

## 🚨 **EXPLICIT PRODUCT DECISIONS (TO AVOID AMBIGUITY)**

### **Decision 1: Kid claims prayer, then parent tries to log the same prayer/day directly**

**Product Rule:** **MERGE (not duplicate)**

**Rationale:**
- Avoids duplicate logs violating once-per-day constraint
- Parent direct log is an implicit approval of the kid's claim
- Simpler UX (no confusing "already logged" error for parents)

**Behavior:**
```typescript
if (pendingClaimExists) {
  // Convert pending claim to approved-by-that-parent
  // Award 1x points for that parent's approval
  // Return success: "Prayer approved (was pending kid claim)"
} else {
  // Create new prayer log as parent-logged
  // Award 1x points
}
```

**Test:** PR-007

---

### **Decision 2: One parent denies, other parent approves**

**Product Rule:** **Approvals are independent per-parent**

**Rationale:**
- Respects parental autonomy (both parents may have different standards)
- Kid still gets points from approving parent
- Denial doesn't override other parent's decision

**Behavior:**
```typescript
// Parent A1 denies → kid gets 0 points from A1
// Parent A2 approves → kid gets 1x points from A2
// Total: 1x points (not 0, not 2x)
```

**Test:** PR-008

---

### **Decision 3: Kid can claim for yesterday?**

**Product Rule:** **Yes, but only if today is not yet logged**

**Rationale:**
- Allows flexibility for missed prayers
- Prevents retroactive "completion" of already-failed streaks
- Must respect once-per-day constraint

**Behavior:**
```typescript
// Kid can claim yesterday if:
// 1. Yesterday prayer not yet logged
// 2. Parent approval still required
// 3. Affects yesterday's quest/streak (not today's)
```

**Test:** QS-002

---

### **Decision 4: Parent backdates while kid claim is pending**

**Product Rule:** **Merge (backdate = implicit approval)**

**Rationale:**
- Parent backdating is stronger signal than kid claim
- Avoids duplicate logs
- Parent intent is clear: "This prayer happened"

**Behavior:**
```typescript
if (pendingClaimExistsForDate) {
  // Convert to approved-by-that-parent
  // Award 1x points
  // Status: "Approved by Parent A1 (backdated)"
} else {
  // Create backdated log
  // Award 1x points
}
```

**Test:** CON-002

---

## 📋 **TEST SUITE**

---

## A) BACKDATED BEHAVIOR LOGGING (PARENT) - 5 TESTS

---

### **BD-001 (P0): Parent can log a behavior for yesterday**

**Preconditions:**
- Family has a configured "prayer trackable" or behavior that yields points
- Parent is logged in
- Family timezone is set (or default is consistent)

**Steps:**

1. **Navigate to "Log Behavior" page**
```typescript
await page.goto('/parent/log-behavior');
await page.waitForSelector('[data-testid="log-behavior-form"]');
```

2. **Set date selector to Yesterday**
```typescript
const datePicker = await page.getByTestId('date-selector');
await datePicker.selectOption('yesterday');

// Verify only Today and Yesterday are available
const options = await datePicker.locator('option').all();
const optionTexts = await Promise.all(options.map(o => o.textContent()));
expect(optionTexts).toEqual(['Today', 'Yesterday']);
```

3. **Select behavior "Isha" (or any prayer behavior)**
```typescript
await page.getByTestId('behavior-selector').selectOption('Isha');
await page.getByTestId('child-selector').selectOption(kidA1.id);
```

4. **Submit**
```typescript
await page.getByTestId('submit-log').click();
await page.waitForSelector('[data-testid="success-message"]');
```

**Acceptance Criteria:**

✅ **UI allows selecting Yesterday only** (not earlier)
```typescript
// Date picker should only show Today and Yesterday
expect(datePicker).toHaveOptions(['Today', 'Yesterday']);
```

✅ **Event is created with date = yesterday (in family timezone)**
```typescript
const events = await fetchEvents(kidA1.id);
const yesterdayEvent = events.find(e => e.behavior_name === 'Isha');

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const expectedDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

expect(yesterdayEvent.occurred_at).toContain(expectedDate);
```

✅ **Points are added as expected**
```typescript
const childProfile = await fetchChildProfile(kidA1.id);
expect(childProfile.total_points).toBeGreaterThan(previousPoints);
```

✅ **The log appears on yesterday's timeline (not today)**
```typescript
const yesterdayEvents = await fetchEventsByDate(kidA1.id, yesterday);
expect(yesterdayEvents).toContainEqual(
  expect.objectContaining({ behavior_name: 'Isha' })
);

const todayEvents = await fetchEventsByDate(kidA1.id, new Date());
expect(todayEvents).not.toContainEqual(
  expect.objectContaining({ behavior_name: 'Isha' })
);
```

---

### **BD-002 (P0): Backdated log triggers quest completion eligibility**

**Preconditions:**
- Quest system enabled
- Yesterday has an "Isha" quest available/required to continue streak

**Steps:**

1. **Confirm yesterday's quest is currently incomplete**
```typescript
const quests = await fetchQuests(kidA1.id);
const yesterdayIshaQuest = quests.find(q => 
  q.behavior_name === 'Isha' && 
  q.date === yesterdayDate &&
  q.status === 'incomplete'
);

expect(yesterdayIshaQuest).toBeDefined();
```

2. **Log "Isha" for yesterday as parent**
```typescript
await createPointEvent({
  childId: kidA1.id,
  behaviorName: 'Isha',
  points: 10,
  occurredAt: yesterday,
  parentId: parentA1.id
});
```

3. **Refresh challenges/quests view**
```typescript
const updatedQuests = await fetchQuests(kidA1.id);
const updatedIshaQuest = updatedQuests.find(q => 
  q.behavior_name === 'Isha' && 
  q.date === yesterdayDate
);
```

**Acceptance Criteria:**

✅ **Quest for yesterday becomes completed**
```typescript
expect(updatedIshaQuest.status).toBe('completed');
```

✅ **Kid's quest/streak is updated correctly (no break)**
```typescript
const streakInfo = await fetchStreak(kidA1.id);
expect(streakInfo.currentStreak).toBeGreaterThan(0);
expect(streakInfo.lastCompletedDate).toBe(yesterdayDate);
```

✅ **No duplicate quest completions occur**
```typescript
const allQuests = await fetchQuests(kidA1.id);
const ishaQuestsForYesterday = allQuests.filter(q => 
  q.behavior_name === 'Isha' && 
  q.date === yesterdayDate
);

expect(ishaQuestsForYesterday).toHaveLength(1);
```

---

### **BD-003 (P0): Backdated log restores streak continuity (no gap)**

**Preconditions:**
- Streak would break if yesterday remains unlogged
- Today is logged

**Steps:**

1. **Ensure today has "Isha" logged**
```typescript
const todayEvents = await fetchEventsByDate(kidA1.id, today);
const todayIsha = todayEvents.find(e => e.behavior_name === 'Isha');
expect(todayIsha).toBeDefined();
```

2. **Ensure yesterday is missing**
```typescript
const yesterdayEvents = await fetchEventsByDate(kidA1.id, yesterday);
const yesterdayIsha = yesterdayEvents.find(e => e.behavior_name === 'Isha');
expect(yesterdayIsha).toBeUndefined();
```

3. **Confirm streak currently shows broken or "at risk"**
```typescript
const streakBefore = await fetchStreak(kidA1.id);
expect(streakBefore.currentStreak).toBe(0); // Broken
// OR
expect(streakBefore.status).toBe('at_risk'); // Depending on implementation
```

4. **Backdate-log "Isha" for yesterday**
```typescript
await createPointEvent({
  childId: kidA1.id,
  behaviorName: 'Isha',
  points: 10,
  occurredAt: yesterday,
  parentId: parentA1.id
});
```

5. **Reload dashboard**
```typescript
const streakAfter = await fetchStreak(kidA1.id);
```

**Acceptance Criteria:**

✅ **Streak becomes continuous across yesterday → today**
```typescript
expect(streakAfter.currentStreak).toBeGreaterThan(0);
expect(streakAfter.status).not.toBe('broken');
```

✅ **Streak count matches expected (no off-by-one)**
```typescript
// If this was day 5 of a streak that broke:
// After backdating, should restore to day 5 (or 6 if today also logged)
expect(streakAfter.currentStreak).toBe(expectedStreakCount);
```

✅ **Streak update is deterministic and consistent across parent and kid views**
```typescript
const parentViewStreak = await fetchStreak(kidA1.id, parentA1.token);
const kidViewStreak = await fetchStreak(kidA1.id, kidA1.token);

expect(parentViewStreak.currentStreak).toBe(kidViewStreak.currentStreak);
```

---

### **BD-004 (P0): Backdated log is blocked if that prayer already logged for that day**

**Preconditions:**
- Yesterday already has an "Isha" log (from kid claim or other parent)

**Steps:**

1. **Create initial log for yesterday**
```typescript
await createPointEvent({
  childId: kidA1.id,
  behaviorName: 'Isha',
  points: 10,
  occurredAt: yesterday,
  parentId: parentA1.id
});
```

2. **Try to log "Isha" for yesterday again**
```typescript
const response = await fetch('/point-events', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${parentA2.token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    childId: kidA1.id,
    behaviorName: 'Isha',
    points: 10,
    occurredAt: yesterday
  })
});
```

**Acceptance Criteria:**

✅ **System blocks the second log with deterministic error (409 Conflict)**
```typescript
expect(response.status).toBe(409);
```

✅ **UI shows clear message: "Isha already logged for yesterday"**
```typescript
const error = await response.json();
expect(error.message).toContain('Isha already logged for');
expect(error.message).toContain('yesterday');
```

✅ **No extra points are awarded**
```typescript
const pointsBefore = await fetchChildProfile(kidA1.id).total_points;
// Attempt duplicate log
await attemptDuplicateLog();
const pointsAfter = await fetchChildProfile(kidA1.id).total_points;

expect(pointsAfter).toBe(pointsBefore); // No change
```

✅ **No duplicate entries are created**
```typescript
const events = await fetchEventsByDate(kidA1.id, yesterday);
const ishaEvents = events.filter(e => e.behavior_name === 'Isha');

expect(ishaEvents).toHaveLength(1); // Only one
```

---

### **BD-005 (P1): Date boundary correctness around midnight**

**Preconditions:**
- Family timezone is known (e.g., America/New_York)
- Test near midnight local time (or simulate)

**Steps:**

1. **Set system time to 11:59 PM family local time**
```typescript
// Simulate time near midnight
const nearMidnight = new Date('2026-02-22T23:59:00-05:00'); // EST
mockSystemTime(nearMidnight);
```

2. **Create "Today" log**
```typescript
await createPointEvent({
  childId: kidA1.id,
  behaviorName: 'Fajr',
  points: 10,
  occurredAt: 'today' // System interprets as "now"
});
```

3. **Advance time to 12:01 AM (next day)**
```typescript
const afterMidnight = new Date('2026-02-23T00:01:00-05:00');
mockSystemTime(afterMidnight);
```

4. **Attempt "Yesterday" log**
```typescript
await createPointEvent({
  childId: kidA1.id,
  behaviorName: 'Isha',
  points: 10,
  occurredAt: 'yesterday'
});
```

5. **Verify logs land on correct calendar days**
```typescript
const events = await fetchEvents(kidA1.id);
```

**Acceptance Criteria:**

✅ **"Yesterday" is computed in family local timezone**
```typescript
const yesterdayEvent = events.find(e => e.behavior_name === 'Isha');
const expectedDate = '2026-02-22'; // Feb 22 in EST

expect(yesterdayEvent.occurred_at).toContain(expectedDate);
```

✅ **No accidental shifting due to UTC conversion**
```typescript
// Event should NOT show Feb 21 or Feb 23
expect(yesterdayEvent.occurred_at).not.toContain('2026-02-21');
expect(yesterdayEvent.occurred_at).not.toContain('2026-02-23');
```

✅ **Logs always display under the correct day**
```typescript
const feb22Events = await fetchEventsByDate(kidA1.id, '2026-02-22');
expect(feb22Events).toContainEqual(
  expect.objectContaining({ behavior_name: 'Isha' })
);
```

---

## B) KID PRAYER CLAIM + NOTIFICATIONS + PARENT APPROVALS - 8 TESTS

---

### **PR-001 (P0): Kid can submit a prayer claim for today**

**Preconditions:**
- Kid is logged in
- Prayer logging feature enabled
- Parents exist (Parent A1 and Parent A2)

**Steps:**

1. **Kid selects "Prayed Fajr"**
```typescript
// Kid logs in
const kidLoginResponse = await fetch('/auth/kid-login', {
  method: 'POST',
  body: JSON.stringify({ pin: '1234', familyId: familyA.id })
});

const { access_token: kidToken } = await kidLoginResponse.json();

// Navigate to prayer logging
await page.goto('/kid/prayers');
```

2. **Submit claim**
```typescript
await page.getByTestId('prayer-fajr').click();
await page.getByTestId('claim-prayer').click();
```

3. **Kid sees pending state**
```typescript
await page.waitForSelector('[data-testid="prayer-status-pending"]');
```

**Acceptance Criteria:**

✅ **Claim is accepted once and recorded as pending approval**
```typescript
const prayerClaims = await fetch('/prayer-claims', {
  headers: { 'Authorization': `Bearer ${kidToken}` }
}).then(r => r.json());

const fajrClaim = prayerClaims.find(c => c.prayer === 'Fajr' && c.date === today);

expect(fajrClaim).toBeDefined();
expect(fajrClaim.status).toBe('pending');
```

✅ **Kid sees status like "Awaiting approval"**
```typescript
const statusElement = await page.getByTestId('prayer-status-pending');
const statusText = await statusElement.textContent();

expect(statusText).toContain('Awaiting approval');
```

✅ **No points are granted until approval**
```typescript
const pointsBefore = await fetchChildProfile(kidA1.id).total_points;
// Submit claim
await submitPrayerClaim('Fajr');
const pointsAfter = await fetchChildProfile(kidA1.id).total_points;

expect(pointsAfter).toBe(pointsBefore); // No change yet
```

---

### **PR-002 (P0): Parents receive notifications for kid claims**

**Preconditions:**
- PR-001 claim exists (Fajr claim pending)

**Steps:**

1. **Verify Parent A1 receives a notification**
```typescript
const parentA1Notifications = await fetchNotifications(parentA1.token);
const fajrNotification = parentA1Notifications.find(n => 
  n.type === 'prayer_claim' &&
  n.childId === kidA1.id &&
  n.prayer === 'Fajr'
);

expect(fajrNotification).toBeDefined();
```

2. **Verify Parent A2 receives a notification**
```typescript
const parentA2Notifications = await fetchNotifications(parentA2.token);
const fajrNotification = parentA2Notifications.find(n => 
  n.type === 'prayer_claim' &&
  n.childId === kidA1.id &&
  n.prayer === 'Fajr'
);

expect(fajrNotification).toBeDefined();
```

**Acceptance Criteria:**

✅ **Both parents get notified**
```typescript
expect(parentA1Notifications.length).toBeGreaterThan(0);
expect(parentA2Notifications.length).toBeGreaterThan(0);
```

✅ **Notification includes child name, prayer name, date, and action buttons**
```typescript
expect(fajrNotification).toMatchObject({
  childName: kidA1.name,
  prayer: 'Fajr',
  date: today,
  actions: expect.arrayContaining(['Approve', 'Deny'])
});
```

---

### **PR-003 (P0): One parent approval grants 1x points and updates quest/streak**

**Preconditions:**
- A pending prayer claim exists (Fajr today)
- Prayer has a configured point value (e.g., 10 points)

**Steps:**

1. **Parent A1 approves**
```typescript
await fetch(`/prayer-claims/${fajrClaimId}/approve`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${parentA1.token}` }
});
```

2. **Refresh kid dashboard and quests/streak views**
```typescript
const updatedProfile = await fetchChildProfile(kidA1.id);
const updatedQuests = await fetchQuests(kidA1.id);
const updatedStreak = await fetchStreak(kidA1.id);
```

**Acceptance Criteria:**

✅ **Points are awarded exactly once for Parent A1 approval**
```typescript
const pointsAwarded = updatedProfile.total_points - initialPoints;
expect(pointsAwarded).toBe(10); // 1x base points
```

✅ **Prayer status becomes "Approved by Parent A1"**
```typescript
const claim = await fetchPrayerClaim(fajrClaimId);
expect(claim.approvals).toContainEqual({
  parentId: parentA1.id,
  parentName: parentA1.display_name,
  approvedAt: expect.any(String)
});
```

✅ **Still shows pending for Parent A2**
```typescript
expect(claim.approvals).toHaveLength(1);
expect(claim.status).toBe('partially_approved'); // or 'pending_second_approval'
```

✅ **Quest completion updated**
```typescript
const fajrQuest = updatedQuests.find(q => q.behavior_name === 'Fajr');
expect(fajrQuest.status).toBe('completed');
```

✅ **Streak updated**
```typescript
expect(updatedStreak.currentStreak).toBeGreaterThan(initialStreak.currentStreak);
```

✅ **No duplicate prayer log created**
```typescript
const events = await fetchEventsByDate(kidA1.id, today);
const fajrEvents = events.filter(e => e.behavior_name === 'Fajr');

expect(fajrEvents).toHaveLength(1); // Only one log
```

---

### **PR-004 (P0): Second parent approval grants second unit of points (double points total)**

**Preconditions:**
- Parent A1 already approved (from PR-003)
- Parent A2 has not approved yet

**Steps:**

1. **Parent A2 approves the same claim**
```typescript
await fetch(`/prayer-claims/${fajrClaimId}/approve`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${parentA2.token}` }
});
```

2. **Check points and audit trail**
```typescript
const finalProfile = await fetchChildProfile(kidA1.id);
const claim = await fetchPrayerClaim(fajrClaimId);
```

**Acceptance Criteria:**

✅ **Total points awarded becomes 2x base value**
```typescript
const totalPointsAwarded = finalProfile.total_points - initialPoints;
expect(totalPointsAwarded).toBe(20); // 2x base points (10 + 10)
```

✅ **System never exceeds 2 approvals**
```typescript
expect(claim.approvals).toHaveLength(2);
expect(claim.approvals.map(a => a.parentId)).toEqual([parentA1.id, parentA2.id]);
```

✅ **Prayer remains "logged once" for the day**
```typescript
const events = await fetchEventsByDate(kidA1.id, today);
const fajrEvents = events.filter(e => e.behavior_name === 'Fajr');

expect(fajrEvents).toHaveLength(1); // Still only one prayer log
```

✅ **Audit trail clearly shows both approvals**
```typescript
expect(fajrEvents[0].logged_by_display).toContain(kidA1.name);
expect(fajrEvents[0].approved_by).toHaveLength(2);
expect(fajrEvents[0].approved_by).toEqual(
  expect.arrayContaining([parentA1.display_name, parentA2.display_name])
);
```

---

### **PR-005 (P0): Re-approving is idempotent (no extra points)**

**Preconditions:**
- Parent A1 already approved

**Steps:**

1. **Parent A1 taps Approve again (double click, refresh, retry)**
```typescript
const pointsBefore = await fetchChildProfile(kidA1.id).total_points;

// First approval (already done)
await approvePrayerClaim(fajrClaimId, parentA1.token);

// Second approval attempt
await approvePrayerClaim(fajrClaimId, parentA1.token);

const pointsAfter = await fetchChildProfile(kidA1.id).total_points;
```

2. **Parent A1 re-opens notification and approves again**
```typescript
// Simulate retry
await approvePrayerClaim(fajrClaimId, parentA1.token);
await approvePrayerClaim(fajrClaimId, parentA1.token);
```

**Acceptance Criteria:**

✅ **Points do NOT increase again**
```typescript
expect(pointsAfter).toBe(pointsBefore); // No change from re-approval
```

✅ **Approval state remains unchanged**
```typescript
const claim = await fetchPrayerClaim(fajrClaimId);
const parentA1Approvals = claim.approvals.filter(a => a.parentId === parentA1.id);

expect(parentA1Approvals).toHaveLength(1); // Still only one approval record
```

✅ **API returns idempotent success or "already approved" response**
```typescript
const response = await approvePrayerClaim(fajrClaimId, parentA1.token);
expect(response.status).toBe(200); // Success
expect(response.data.message).toContain('already approved');
```

---

### **PR-006 (P0): Once-per-day constraint for prayer claims**

**Preconditions:**
- Kid already claimed "Fajr" for today (pending or approved)

**Steps:**

1. **Kid attempts to claim "Fajr" again for today**
```typescript
const response = await fetch('/prayer-claims', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${kidToken}` },
  body: JSON.stringify({
    prayer: 'Fajr',
    date: today
  })
});
```

**Acceptance Criteria:**

✅ **Blocked with clear message: "Fajr already logged today"**
```typescript
expect(response.status).toBe(409); // Conflict
const error = await response.json();
expect(error.message).toContain('Fajr already logged today');
```

✅ **No second claim created**
```typescript
const claims = await fetchPrayerClaims(kidA1.id);
const fajrClaimsToday = claims.filter(c => 
  c.prayer === 'Fajr' && c.date === today
);

expect(fajrClaimsToday).toHaveLength(1); // Only one
```

✅ **No second notification sent**
```typescript
const parentNotifications = await fetchNotifications(parentA1.token);
const fajrNotifications = parentNotifications.filter(n => 
  n.prayer === 'Fajr' && n.date === today
);

expect(fajrNotifications).toHaveLength(1); // Only one notification
```

---

### **PR-007 (P0): Parent direct log for same prayer/day after kid claim is blocked or merges correctly**

**Product Decision:** **MERGE** (parent direct log = implicit approval)

**Preconditions:**
- Kid claim exists for "Fajr today" (pending)

**Steps:**

1. **Parent tries to log "Fajr today" directly via Log Behavior**
```typescript
const response = await fetch('/point-events', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${parentA1.token}` },
  body: JSON.stringify({
    childId: kidA1.id,
    behaviorName: 'Fajr',
    points: 10,
    occurredAt: today
  })
});
```

**Acceptance Criteria:**

✅ **Parent direct log merges with pending claim (converted to approval)**
```typescript
expect(response.status).toBe(200);
const result = await response.json();
expect(result.message).toContain('Prayer approved');
```

✅ **Kid claim becomes approved by that parent**
```typescript
const claim = await fetchPrayerClaim(fajrClaimId);
expect(claim.approvals).toContainEqual({
  parentId: parentA1.id,
  parentName: parentA1.display_name,
  approvedAt: expect.any(String)
});
```

✅ **1x points awarded**
```typescript
const pointsAwarded = await fetchChildProfile(kidA1.id).total_points - initialPoints;
expect(pointsAwarded).toBe(10); // 1x base points
```

✅ **Still only one prayer log exists for the day**
```typescript
const events = await fetchEventsByDate(kidA1.id, today);
const fajrEvents = events.filter(e => e.behavior_name === 'Fajr');

expect(fajrEvents).toHaveLength(1);
```

✅ **No double counting, no duplicate entries**
```typescript
// Verify database has exactly one record
const dbEvents = await queryDatabase(
  'SELECT * FROM point_events WHERE child_id = ? AND behavior_name = ? AND DATE(occurred_at) = ?',
  [kidA1.id, 'Fajr', today]
);

expect(dbEvents).toHaveLength(1);
```

---

### **PR-008 (P1): Deny flow (if supported)**

**Product Decision:** **Approvals are independent per-parent**

**Preconditions:**
- Pending claim exists (Dhuhr today)

**Steps:**

1. **Parent A1 denies**
```typescript
await fetch(`/prayer-claims/${dhuhrClaimId}/deny`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${parentA1.token}` }
});
```

2. **Observe kid UI state**
```typescript
const claim = await fetchPrayerClaim(dhuhrClaimId, kidToken);
```

3. **Parent A2 approves after denial (if allowed)**
```typescript
await fetch(`/prayer-claims/${dhuhrClaimId}/approve`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${parentA2.token}` }
});
```

**Acceptance Criteria:**

✅ **Denial is recorded per-parent**
```typescript
expect(claim.denials).toContainEqual({
  parentId: parentA1.id,
  deniedAt: expect.any(String)
});
```

✅ **Other parent can still approve (approvals are independent)**
```typescript
const finalClaim = await fetchPrayerClaim(dhuhrClaimId);
expect(finalClaim.approvals).toContainEqual({
  parentId: parentA2.id
});
```

✅ **Points awarded for approving parent only (1x, not 0 or 2x)**
```typescript
const pointsAwarded = await fetchChildProfile(kidA1.id).total_points - initialPoints;
expect(pointsAwarded).toBe(10); // 1x from Parent A2
```

✅ **Kid sees clear final state**
```typescript
expect(claim.status).toBe('partially_approved');
expect(claim.statusDisplay).toContain('Approved by Parent A2');
expect(claim.statusDisplay).toContain('Denied by Parent A1');
```

---

## C) QUEST/STREAK INTERACTIONS (PRAYER-SPECIFIC) - 2 TESTS

---

### **QS-001 (P0): Approved prayer claim completes the corresponding prayer quest**

**Preconditions:**
- Quest system enabled
- A "Fajr" quest exists for today

**Steps:**

1. **Kid submits claim**
```typescript
await submitPrayerClaim('Fajr', today, kidToken);
```

2. **Parent approves (one parent)**
```typescript
await approvePrayerClaim(fajrClaimId, parentA1.token);
```

3. **Open kid challenges**
```typescript
const quests = await fetchQuests(kidA1.id);
const fajrQuest = quests.find(q => q.behavior_name === 'Fajr' && q.date === today);
```

**Acceptance Criteria:**

✅ **Quest is marked completed after approval**
```typescript
expect(fajrQuest.status).toBe('completed');
```

✅ **Double-approval does NOT mark "twice completed"**
```typescript
// Parent A2 also approves
await approvePrayerClaim(fajrClaimId, parentA2.token);

const updatedQuests = await fetchQuests(kidA1.id);
const fajrQuestsToday = updatedQuests.filter(q => 
  q.behavior_name === 'Fajr' && q.date === today
);

expect(fajrQuestsToday).toHaveLength(1); // Only one completion
expect(fajrQuestsToday[0].status).toBe('completed');
```

---

### **QS-002 (P0): Backdated approval applies to yesterday quest/streak**

**Preconditions:**
- Kid can claim yesterday (or parent can select yesterday during approval)
- Yesterday quest exists and is currently incomplete

**Steps:**

1. **Create claim for yesterday**
```typescript
// Kid claims yesterday (if allowed)
await submitPrayerClaim('Isha', yesterday, kidToken);
```

2. **Parent approves it**
```typescript
await approvePrayerClaim(ishaClaimId, parentA1.token);
```

3. **Verify yesterday quest and streak impact**
```typescript
const quests = await fetchQuests(kidA1.id);
const streak = await fetchStreak(kidA1.id);
```

**Acceptance Criteria:**

✅ **Yesterday quest becomes completed**
```typescript
const yesterdayIshaQuest = quests.find(q => 
  q.behavior_name === 'Isha' && q.date === yesterday
);

expect(yesterdayIshaQuest.status).toBe('completed');
```

✅ **Streak continuity restored if yesterday was missing**
```typescript
expect(streak.currentStreak).toBeGreaterThan(0);
expect(streak.lastCompletedDate).toBe(yesterday);
```

---

## D) AUDIT TRAIL DISPLAY REQUIREMENTS - 1 TEST

---

### **AT-PR-001 (P0): Prayer log shows "Logged by" and "Approved by" as names**

**Preconditions:**
- One prayer claim exists and has approvals from one or two parents

**Steps:**

1. **Open audit trail (parent view)**
```typescript
await page.goto('/parent/audit');
await page.waitForSelector('[data-testid="audit-timeline"]');
```

2. **Locate the prayer event entry**
```typescript
const prayerEvent = await page
  .getByTestId('event-row')
  .filter({ hasText: 'Fajr' })
  .first();
```

3. **Check fields: Logged by, Approved by**
```typescript
const loggedBy = await prayerEvent.getByTestId('logged-by').textContent();
const approvedBy = await prayerEvent.getByTestId('approved-by').textContent();
```

**Acceptance Criteria:**

✅ **Logged by shows "Kid <name>" if kid claimed**
```typescript
expect(loggedBy).toContain(`Logged by: ${kidA1.name}`);
expect(loggedBy).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // No UUID
```

✅ **Logged by shows "Parent <name>" if parent logged directly**
```typescript
// For parent-logged events
expect(loggedBy).toContain(`Logged by: ${parentA1.display_name}`);
```

✅ **Approved by shows parent names (not UUIDs)**
```typescript
expect(approvedBy).toContain(parentA1.display_name);
expect(approvedBy).toContain(parentA2.display_name);
expect(approvedBy).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // No UUID
```

✅ **UUIDs never appear in UI**
```typescript
const allText = await page.textContent('[data-testid="audit-timeline"]');
expect(allText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
```

---

## E) CONCURRENCY + EDGE CASES - 2 TESTS

---

### **CON-001 (P0): Both parents approve simultaneously → exactly 2x points (not more)**

**Preconditions:**
- Two parents exist
- Pending claim exists

**Steps:**

1. **Parent A1 and Parent A2 approve at nearly same time (two devices)**
```typescript
const initialPoints = await fetchChildProfile(kidA1.id).total_points;

// Simulate simultaneous approvals
const [approval1, approval2] = await Promise.all([
  approvePrayerClaim(fajrClaimId, parentA1.token),
  approvePrayerClaim(fajrClaimId, parentA2.token)
]);
```

2. **Reload points**
```typescript
const finalPoints = await fetchChildProfile(kidA1.id).total_points;
```

**Acceptance Criteria:**

✅ **Exactly two approvals recorded**
```typescript
const claim = await fetchPrayerClaim(fajrClaimId);
expect(claim.approvals).toHaveLength(2);
```

✅ **Exactly two point awards recorded (or one record with multiplier=2)**
```typescript
const pointsAwarded = finalPoints - initialPoints;
expect(pointsAwarded).toBe(20); // Exactly 2x base points
```

✅ **No race condition produces 3+ awards**
```typescript
// Check database for duplicate point events
const dbEvents = await queryDatabase(
  'SELECT * FROM point_events WHERE child_id = ? AND behavior_name = ? AND DATE(occurred_at) = ?',
  [kidA1.id, 'Fajr', today]
);

expect(dbEvents).toHaveLength(1); // Only one prayer log

// Check approval records
const approvalRecords = await queryDatabase(
  'SELECT * FROM prayer_approvals WHERE claim_id = ?',
  [fajrClaimId]
);

expect(approvalRecords).toHaveLength(2); // Exactly two approvals
```

---

### **CON-002 (P0): Parent logs directly while other parent approves kid claim**

**Product Decision:** **MERGE** (direct log = implicit approval)

**Preconditions:**
- Pending claim exists

**Steps:**

1. **Parent A1 attempts direct log for the same prayer/day**
```typescript
const directLogPromise = createPointEvent({
  childId: kidA1.id,
  behaviorName: 'Fajr',
  points: 10,
  occurredAt: today,
  parentId: parentA1.id
});
```

2. **Parent A2 approves claim simultaneously**
```typescript
const approvalPromise = approvePrayerClaim(fajrClaimId, parentA2.token);

await Promise.all([directLogPromise, approvalPromise]);
```

**Acceptance Criteria:**

✅ **System enforces once-per-day prayer log and resolves deterministically**
```typescript
const events = await fetchEventsByDate(kidA1.id, today);
const fajrEvents = events.filter(e => e.behavior_name === 'Fajr');

expect(fajrEvents).toHaveLength(1); // Only one prayer log
```

✅ **Either direct log is blocked/merged, approvals remain consistent**
```typescript
const claim = await fetchPrayerClaim(fajrClaimId);

// Both parents should have approvals recorded
expect(claim.approvals).toHaveLength(2);
expect(claim.approvals.map(a => a.parentId)).toEqual(
  expect.arrayContaining([parentA1.id, parentA2.id])
);
```

✅ **Final points equal expected cap (max 2x)**
```typescript
const pointsAwarded = await fetchChildProfile(kidA1.id).total_points - initialPoints;
expect(pointsAwarded).toBe(20); // Exactly 2x base points
```

---

## F) UX ACCEPTANCE REQUIREMENTS - 2 TESTS

---

### **UX-001 (P0): Parent "Log Behavior" date selector is constrained and obvious**

**Acceptance Criteria:**

✅ **Date selector offers: Today, Yesterday**
```typescript
const datePicker = await page.getByTestId('date-selector');
const options = await datePicker.locator('option').all();
const optionTexts = await Promise.all(options.map(o => o.textContent()));

expect(optionTexts).toEqual(['Today', 'Yesterday']);
```

✅ **It does NOT allow older days**
```typescript
// Should not have options like "2 days ago", "Last week", etc.
expect(optionTexts.length).toBe(2);
```

✅ **UI clearly labels "Yesterday" to prevent accidental backdating**
```typescript
const yesterdayOption = await datePicker.locator('option[value="yesterday"]');
expect(await yesterdayOption.textContent()).toBe('Yesterday');

// Optional: Show warning when backdating
await datePicker.selectOption('yesterday');
const warning = await page.getByTestId('backdate-warning');
expect(await warning.isVisible()).toBe(true);
expect(await warning.textContent()).toContain('This will log for yesterday');
```

---

### **UX-002 (P0): Notifications are actionable and consistent across both parents**

**Acceptance Criteria:**

✅ **Both parents can see pending claims in an "Approvals" inbox**
```typescript
// Even if they miss push notifications
await page.goto('/parent/approvals');
const pendingClaims = await page.getByTestId('pending-claim').all();

expect(pendingClaims.length).toBeGreaterThan(0);
```

✅ **Claims display prayer + date + child**
```typescript
const claimCard = pendingClaims[0];
expect(await claimCard.textContent()).toContain('Fajr');
expect(await claimCard.textContent()).toContain(today);
expect(await claimCard.textContent()).toContain(kidA1.name);
```

✅ **Approve action has confirmation and is idempotent**
```typescript
await claimCard.getByTestId('approve-button').click();

// Confirmation dialog
await page.getByTestId('confirm-approve').click();

// Success message
await page.waitForSelector('[data-testid="approval-success"]');

// Re-clicking does nothing (button disabled or shows "Already approved")
const approveButton = await claimCard.getByTestId('approve-button');
expect(await approveButton.isDisabled()).toBe(true);
// OR
expect(await approveButton.textContent()).toContain('Approved');
```

---

## 🎯 **PRODUCTION GATE CHECKLIST**

### **Must-Pass P0 Tests (Blocking for Release):**

**Backdating (5 tests):**
- [ ] BD-001: Parent can log for yesterday
- [ ] BD-002: Backdated log triggers quest completion
- [ ] BD-003: Backdated log restores streak continuity
- [ ] BD-004: Duplicate backdated log blocked
- [ ] BD-005: Date boundary correctness

**Prayer Claims + Approvals (8 tests):**
- [ ] PR-001: Kid can submit prayer claim
- [ ] PR-002: Parents receive notifications
- [ ] PR-003: One parent approval grants 1x points
- [ ] PR-004: Second parent approval grants 2x points total
- [ ] PR-005: Re-approving is idempotent
- [ ] PR-006: Once-per-day constraint enforced
- [ ] PR-007: Parent direct log merges with kid claim
- [ ] PR-008: Deny flow (approvals are independent)

**Quest/Streak Integration (2 tests):**
- [ ] QS-001: Approved claim completes quest
- [ ] QS-002: Backdated approval applies to yesterday quest/streak

**Audit Trail (1 test):**
- [ ] AT-PR-001: Shows names (not UUIDs) for logged by and approved by

**Concurrency (2 tests):**
- [ ] CON-001: Simultaneous approvals = exactly 2x points
- [ ] CON-002: Direct log + approval resolved deterministically

**UX (2 tests):**
- [ ] UX-001: Date selector constrained and obvious
- [ ] UX-002: Notifications actionable and consistent

**Total P0 tests:** 20

---

## 🚨 **CRITICAL ISSUES TO PREVENT**

### **1. Double-award bug (most critical)**
```sql
-- MUST prevent this:
SELECT child_id, behavior_name, DATE(occurred_at), COUNT(*)
FROM point_events
WHERE child_id = ?
GROUP BY child_id, behavior_name, DATE(occurred_at)
HAVING COUNT(*) > 1
```

**Prevention:**
```sql
-- Add unique constraint
CREATE UNIQUE INDEX idx_one_prayer_per_day 
ON point_events (child_id, behavior_name, DATE(occurred_at))
WHERE behavior_type = 'prayer';
```

---

### **2. Timezone bugs (midnight boundary)**
```typescript
// ❌ BAD: Uses UTC
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

// ✅ GOOD: Uses family timezone
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';

const familyTimezone = family.timezone || 'America/New_York';
const nowInTimezone = utcToZonedTime(new Date(), familyTimezone);
const yesterdayInTimezone = new Date(nowInTimezone);
yesterdayInTimezone.setDate(yesterdayInTimezone.getDate() - 1);
```

---

### **3. Race conditions in approvals**
```typescript
// ❌ BAD: Not atomic
const claim = await getPrayerClaim(id);
if (!claim.approvals.includes(parentId)) {
  claim.approvals.push(parentId);
  await awardPoints(childId, points);
  await updateClaim(claim);
}

// ✅ GOOD: Atomic with database constraints
await db.transaction(async (trx) => {
  const inserted = await trx('prayer_approvals').insert({
    claim_id: claimId,
    parent_id: parentId
  }).onConflict(['claim_id', 'parent_id']).ignore(); // Idempotent
  
  if (inserted.rowCount > 0) {
    await trx('point_events').insert({
      child_id: childId,
      points: basePoints,
      approved_by: parentId
    });
  }
});
```

---

## 📊 **DATABASE SCHEMA RECOMMENDATIONS**

### **prayer_claims table**
```sql
CREATE TABLE prayer_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id),
  prayer VARCHAR(20) NOT NULL, -- Fajr, Dhuhr, Asr, Maghrib, Isha
  date DATE NOT NULL, -- Local family timezone date
  status VARCHAR(20) DEFAULT 'pending', -- pending, partially_approved, fully_approved, denied
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one claim per child/prayer/day
  CONSTRAINT one_claim_per_day UNIQUE (child_id, prayer, date)
);
```

### **prayer_approvals table**
```sql
CREATE TABLE prayer_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES prayer_claims(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  points_awarded INT NOT NULL,
  
  -- Unique constraint: one approval per parent per claim
  CONSTRAINT one_approval_per_parent UNIQUE (claim_id, parent_id)
);
```

### **prayer_denials table** (optional)
```sql
CREATE TABLE prayer_denials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES prayer_claims(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES users(id),
  denied_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  
  -- Unique constraint: one denial per parent per claim
  CONSTRAINT one_denial_per_parent UNIQUE (claim_id, parent_id)
);
```

### **point_events table** (update)
```sql
-- Add columns for prayer approval tracking
ALTER TABLE point_events
ADD COLUMN prayer_claim_id UUID REFERENCES prayer_claims(id),
ADD COLUMN approved_by UUID REFERENCES users(id),
ADD COLUMN approval_number INT; -- 1 or 2 (first or second parent)

-- Unique constraint: one prayer per child per day
CREATE UNIQUE INDEX idx_one_prayer_per_day 
ON point_events (child_id, behavior_name, DATE(occurred_at AT TIME ZONE family_timezone))
WHERE behavior_type = 'prayer';
```

---

## 🎉 **SUCCESS CRITERIA**

**This test suite PASSES when:**

1. ✅ All 20 P0 tests pass (100% pass rate)
2. ✅ No double-award bugs possible (database constraints enforce)
3. ✅ No race conditions (atomic transactions)
4. ✅ No timezone bugs (family timezone used consistently)
5. ✅ No duplicate logs (unique constraints)
6. ✅ No UUIDs in UI (human-readable names everywhere)
7. ✅ Notifications work for both parents
8. ✅ Approvals are idempotent
9. ✅ Quest/streak integration correct
10. ✅ Audit trail shows complete approval history

**Your prayer logging system is production-ready when all tests pass!** ✅🕌🙏📱💚
