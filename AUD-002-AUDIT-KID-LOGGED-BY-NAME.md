# ✅ AUD-002: KID-CREATED EVENT SHOWS "LOGGED BY: <KID NAME>" (P0)

**Priority:** P0 (Critical UX + Security)  
**Type:** Kid Mode & Parent Mode - Audit Trail Display + Security  
**Purpose:** Ensure kid-created events show human-readable names and cannot be spoofed

---

## 🎯 **Test Purpose**

Validate that when a kid completes a quest (creating a point event), the audit trail:
1. **Shows human-readable "Logged by" label** (kid name or "Kid (Child Name)")
2. **NEVER shows raw UUIDs** (e.g., `fb090fa9-...`)
3. **Server determines `loggedBy` from auth context** (cannot be spoofed by client)

This ensures both **UX quality** (readable audit trail) and **security** (no client-side manipulation).

---

## 📋 **Preconditions**

- **Family A** exists with parent and child
  - Parent A1 (parent account)
  - Kid A1 (child account with name: "Ahmed")
- Kid A1 logged in to Kid Mode
- Active quest exists for Kid A1
- Kid A1 has permission to complete quests

---

## 🔍 **Test Steps**

### **Step 1: Kid A1 logs in**

**Authenticate as kid:**
```typescript
const kidLoginResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/kid-login`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pin: '1234',
      family_id: familyA.id
    })
  }
);

const { access_token, child } = await kidLoginResponse.json();

console.log('✅ Kid logged in');
console.log(`   Name: ${child.name}`);
console.log(`   ID: ${child.id}`);

// Store for later verification
const expectedLoggedBy = child.name; // "Ahmed"
const kidToken = access_token;
```

**Expected:**
- Login succeeds
- Access token received
- Child profile returned with name

---

### **Step 2: Complete a quest as kid (creates point event)**

**Kid completes quest via API:**
```typescript
// First, get an active quest
const questsResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
  {
    headers: { 'Authorization': `Bearer ${kidToken}` }
  }
);

const quests = await questsResponse.json();
const activeQuest = quests.find(q => q.status === 'active');

if (!activeQuest) {
  throw new Error('No active quest available for kid');
}

console.log('📝 Active quest found:');
console.log(`   Quest: ${activeQuest.behavior_name}`);
console.log(`   Points: ${activeQuest.points_reward}`);

// Complete the quest
const completeResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests/${activeQuest.id}/complete`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kidToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // ⚠️ SECURITY TEST: Try to spoof loggedBy
      // Server MUST ignore this and use auth context
      logged_by: 'fake-parent-uuid-attempt-to-spoof'
    })
  }
);

expect(completeResponse.ok).toBe(true);
const result = await completeResponse.json();

console.log('✅ Quest completed');
console.log(`   Point event ID: ${result.point_event_id}`);

// Store event ID for audit verification
const pointEventId = result.point_event_id;
```

**Expected behavior:**
```typescript
// On server side (Deno edge function):
app.post('/quests/:id/complete', async (c) => {
  // 1. Get authenticated kid from JWT token
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  
  // 2. Get child profile from user
  const { data: child } = await supabase
    .from('children')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  // 3. Create point event with child.id as logged_by
  // ⚠️ IGNORE any logged_by from client payload!
  const { data: pointEvent } = await supabase
    .from('point_events')
    .insert({
      child_id: child.id,
      behavior_id: quest.behavior_id,
      points: quest.points_reward,
      logged_by: child.id, // ← Server determines from auth, NOT client
      event_type: 'quest_completion',
      quest_id: quest.id
    })
    .select()
    .single();
  
  return c.json({ point_event_id: pointEvent.id });
});
```

**Security check:**
- Server MUST use `child.id` from auth token
- Server MUST ignore `logged_by` from client payload
- No way for kid to spoof another user's ID

---

### **Step 3: Fetch point events (verify loggedBy is kid's ID)**

**Verify server stored kid's ID, not spoofed value:**
```typescript
// Admin check: Fetch raw event from database
const { data: rawEvent, error } = await supabase
  .from('point_events')
  .select('*')
  .eq('id', pointEventId)
  .single();

console.log('📊 Raw database record:');
console.log(`   ID: ${rawEvent.id}`);
console.log(`   Child ID: ${rawEvent.child_id}`);
console.log(`   Logged by: ${rawEvent.logged_by}`);
console.log(`   Event type: ${rawEvent.event_type}`);

// SECURITY VERIFICATION
expect(rawEvent.logged_by).toBe(child.id); // Must be kid's ID
expect(rawEvent.logged_by).not.toBe('fake-parent-uuid-attempt-to-spoof'); // Not spoofed value

console.log('✅ Security check passed: loggedBy is kid ID (not spoofed)');
```

---

### **Step 4: Navigate to event/audit list UI**

**Access audit trail (parent or kid view):**
```typescript
// Option A: Parent views kid's audit trail
window.location.href = `/events?childId=${child.id}`;
await waitForPageLoad();

// Option B: Kid views own audit trail
window.location.href = `/my-activity`;
await waitForPageLoad();

console.log('✅ Navigated to audit/event list UI');
```

**Note:** Test both views to ensure consistent display

---

### **Step 5: Locate newly created event in audit list**

**Find the event:**
```typescript
// Find event by ID
const eventRow = document.querySelector(`[data-event-id="${pointEventId}"]`);

// OR find most recent event
const eventsList = document.querySelectorAll('[data-testid="event-row"]');
const mostRecentEvent = eventsList[0]; // Assuming sorted by time

expect(eventRow || mostRecentEvent).not.toBeNull();

console.log('✅ Located newly created event in audit list');
```

---

### **Step 6: Inspect "Logged by" display**

**Check what's shown to the user:**
```typescript
const loggedByElement = eventRow.querySelector('[data-testid="logged-by"]');
const loggedByText = loggedByElement?.textContent || '';

console.log('Logged by display:');
console.log(`  Text shown: "${loggedByText}"`);
console.log(`  Expected: "${expectedLoggedBy}" or "Kid (${expectedLoggedBy})"`);

// Verify NOT a UUID
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(loggedByText.trim());

if (isUUID) {
  throw new Error(
    `AUDIT BUG: Logged by shows raw UUID! Found: "${loggedByText}" ` +
    `Expected: "${expectedLoggedBy}" or "Kid (${expectedLoggedBy})"`
  );
}

// Verify it contains kid's name
const containsKidName = loggedByText.includes(expectedLoggedBy);

if (!containsKidName) {
  throw new Error(
    `AUDIT BUG: Logged by doesn't show kid's name! ` +
    `Found: "${loggedByText}", Expected to contain: "${expectedLoggedBy}"`
  );
}

console.log('✅ Logged by shows kid name (not UUID)');
```

---

## ✅ **Acceptance Criteria**

1. ✅ **"Logged by" is human-readable label**
   - Example: `"Logged by: Ahmed"`
   - OR: `"Logged by: Kid (Ahmed)"`
   - OR: `"Ahmed"` (kid's name alone)

2. ✅ **Never shows raw UUID**
   - ❌ NOT: `"Logged by: fb090fa9-4e2a-4c3b-8a1f-..."`
   - ✅ YES: `"Logged by: Ahmed"`

3. ✅ **`loggedBy` field cannot be spoofed from client payload**
   - Server determines from auth context
   - Client cannot send `logged_by` in payload
   - Security test: Attempt to spoof fails

4. ✅ **Consistent display across parent and kid views**
   - Parent viewing kid's audit: Shows kid name
   - Kid viewing own audit: Shows kid name

---

## 🚨 **Common Failure Patterns**

### **1. Raw UUID displayed (UX bug)**

**Symptom:**
```
Logged by: fb090fa9-4e2a-4c3b-8a1f-7d3e2b1a0c9f
```

**Cause:**
- UI displays `event.logged_by` directly without resolving to name
- Missing lookup for child name

**Fix:**
```typescript
// In EventRow component
function EventRow({ event }) {
  const { getChildName } = useChildContext();
  
  // Resolve logged_by UUID to child name
  const loggedByName = getChildName(event.logged_by) || 'Kid';
  
  return (
    <div>
      <span data-testid="logged-by">
        Logged by: {loggedByName}
      </span>
    </div>
  );
}
```

---

### **2. Client can spoof loggedBy (SECURITY BUG)**

**Symptom:**
```
Kid sends: { logged_by: 'parent-uuid' }
Server stores: logged_by = 'parent-uuid'
Audit shows: "Logged by: Parent Sarah" (WRONG!)
```

**Cause:**
- Server accepts `logged_by` from client payload
- No server-side auth context validation

**Fix:**
```typescript
// ❌ VULNERABLE CODE:
app.post('/quests/:id/complete', async (c) => {
  const body = await c.req.json();
  
  // BAD: Uses client-provided logged_by
  const pointEvent = await supabase
    .from('point_events')
    .insert({
      ...body, // Includes logged_by from client!
      child_id: childId
    });
});

// ✅ SECURE CODE:
app.post('/quests/:id/complete', async (c) => {
  const body = await c.req.json();
  
  // Get authenticated user from JWT
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  
  // Get child profile
  const { data: child } = await supabase
    .from('children')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  // GOOD: Uses child.id from auth, IGNORES client payload
  const pointEvent = await supabase
    .from('point_events')
    .insert({
      child_id: child.id,
      behavior_id: body.behavior_id,
      points: body.points,
      logged_by: child.id, // ← From auth, NOT from body
      event_type: 'quest_completion'
    });
});
```

---

### **3. Inconsistent display between parent/kid views**

**Symptom:**
```
Parent view: "Logged by: Ahmed"
Kid view: "Logged by: fb090fa9-..." (UUID!)
```

**Cause:**
- Different components use different logic
- One resolves UUID, other doesn't

**Fix:**
```typescript
// Create shared utility
function getLoggedByDisplay(event, children) {
  const child = children.find(c => c.id === event.logged_by);
  return child?.name || 'Kid';
}

// Use in both Parent and Kid components
// ParentEventRow.tsx:
<span data-testid="logged-by">
  Logged by: {getLoggedByDisplay(event, children)}
</span>

// KidEventRow.tsx:
<span data-testid="logged-by">
  {getLoggedByDisplay(event, children)}
</span>
```

---

## 💻 **Expected Implementation**

### **1. Server-side: Determine loggedBy from auth**

```typescript
// /supabase/functions/server/index.tsx
app.post('/make-server-f116e23f/quests/:id/complete', async (c) => {
  const questId = c.req.param('id');
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  // 1. Authenticate user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  // 2. Get child profile (for kid login, user.id links to child)
  const { data: child, error: childError } = await supabase
    .from('children')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  if (childError || !child) {
    return c.json({ error: 'Child not found' }, 404);
  }
  
  // 3. Get quest
  const { data: quest, error: questError } = await supabase
    .from('quests')
    .select('*')
    .eq('id', questId)
    .eq('child_id', child.id) // Ensure quest belongs to this child
    .single();
  
  if (questError || !quest) {
    return c.json({ error: 'Quest not found' }, 404);
  }
  
  if (quest.status !== 'active') {
    return c.json({ error: 'Quest not active' }, 400);
  }
  
  // 4. Create point event
  // ⚠️ SECURITY: Use child.id from auth, NOT from request body
  const { data: pointEvent, error: eventError } = await supabase
    .from('point_events')
    .insert({
      child_id: child.id,
      behavior_id: quest.behavior_id,
      points: quest.points_reward,
      logged_by: child.id, // ← Server determines (SECURE)
      event_type: 'quest_completion',
      quest_id: quest.id,
      occurred_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (eventError) {
    return c.json({ error: 'Failed to create point event' }, 500);
  }
  
  // 5. Update quest status
  await supabase
    .from('quests')
    .update({ 
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', questId);
  
  return c.json({
    success: true,
    point_event_id: pointEvent.id,
    points_earned: pointEvent.points
  });
});
```

---

### **2. Client-side: Resolve UUID to name**

```typescript
// In EventsList.tsx
function EventsList({ childId }) {
  const [events, setEvents] = useState([]);
  const [childrenMap, setChildrenMap] = useState({});
  
  useEffect(() => {
    async function loadEventsWithNames() {
      // Fetch events
      const eventsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events?childId=${childId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      const events = await eventsResponse.json();
      setEvents(events);
      
      // Extract unique child IDs from logged_by field
      const childIds = [...new Set(events.map(e => e.logged_by))];
      
      // Fetch child names
      const childrenResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      const children = await childrenResponse.json();
      
      // Create map: id -> name
      const map = {};
      children.forEach(child => {
        map[child.id] = child.name;
      });
      
      setChildrenMap(map);
    }
    
    loadEventsWithNames();
  }, [childId]);
  
  return (
    <div>
      {events.map(event => (
        <EventRow
          key={event.id}
          event={event}
          loggedByName={childrenMap[event.logged_by] || 'Kid'}
        />
      ))}
    </div>
  );
}

// EventRow component
function EventRow({ event, loggedByName }) {
  return (
    <div data-event-id={event.id} data-testid="event-row">
      <div className="event-behavior">{event.behavior_name}</div>
      <div className="event-points">+{event.points} points</div>
      <div className="event-logger">
        <span data-testid="logged-by">
          Logged by: {loggedByName}
        </span>
      </div>
    </div>
  );
}
```

---

### **3. Alternative: Server-side JOIN (better performance)**

```typescript
// GET /point-events with child name included
app.get('/make-server-f116e23f/point-events', async (c) => {
  const { childId } = c.req.query();
  
  // Join with children table to get logger's name
  const { data: events, error } = await supabase
    .from('point_events')
    .select(`
      *,
      logger:children!logged_by(id, name)
    `)
    .eq('child_id', childId)
    .order('occurred_at', { ascending: false });
  
  if (error) throw error;
  
  // Transform to include human-readable logger name
  const eventsWithNames = events.map(event => ({
    ...event,
    logged_by_display: event.logger?.name || 'Kid'
  }));
  
  return c.json(eventsWithNames);
});
```

**Client usage:**
```typescript
// Much simpler - no client-side lookup needed
<span data-testid="logged-by">
  Logged by: {event.logged_by_display}
</span>
```

---

## 📊 **Test Output Example**

```
═══════════════════════════════════════════════════════════════
📋 AUDIT TRAIL TESTS (P0)
═══════════════════════════════════════════════════════════════

  ✅ AUD-001: Parent-created event shows "Logged by: <Parent Name>"
  ✅ AUD-002: Kid-created event shows "Logged by: <Kid Name>"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test AUD-002: Kid-Created Event Audit Display
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Purpose: Ensure kid-created events show kid name + cannot be spoofed

📋 Preconditions:
   Family: Family A
   Kid: Kid A1 (Ahmed)
   Quest: Active quest available

Step 1: Kid A1 logs in
  Authenticating kid with PIN...
  
  Login successful:
    Name: Ahmed
    ID: uuid-kid-a1
    Token: ey... (received)
  
  Expected "Logged by" display: "Ahmed"
  
  ✅ Kid logged in

Step 2: Complete quest as kid
  Fetching active quests...
  
  Active quest found:
    Quest: Morning Prayer
    Points: 10
  
  Completing quest...
  
  Request:
    POST /quests/uuid-quest-123/complete
    Headers: Authorization: Bearer <kid-token>
    Body: {
      logged_by: "fake-parent-uuid-attempt-to-spoof"  ← Spoofing attempt!
    }
  
  Response:
    Status: 200 OK
    Point event ID: uuid-event-456
    Points earned: 10
  
  ✅ Quest completed successfully

Step 3: Verify server used kid ID (not spoofed value)
  Fetching raw database record...
  
  Database record:
    Point event ID: uuid-event-456
    Child ID: uuid-kid-a1
    Logged by: uuid-kid-a1 ✅ (kid's ID from auth)
    Event type: quest_completion
  
  Security verification:
    ✅ logged_by = kid ID (uuid-kid-a1)
    ✅ NOT spoofed value (fake-parent-uuid-attempt-to-spoof)
  
  ✅ Security check passed: Cannot spoof loggedBy

Step 4: Navigate to audit list UI
  Navigating to /events?childId=uuid-kid-a1
  
  ✅ Audit page loaded

Step 5: Locate newly created event
  Searching for event ID: uuid-event-456
  
  Found event in list:
    Position: Row 1 (most recent)
    Event ID: uuid-event-456
    Behavior: Morning Prayer
    Points: +10
  
  ✅ Event located in audit list

Step 6: Inspect "Logged by" display
  Reading "Logged by" field from UI...
  
  DOM element: <span data-testid="logged-by">
  Text content: "Logged by: Ahmed"
  
  Verification:
    ✅ Is human-readable: YES
    ✅ Contains kid name: YES ("Ahmed")
    ❌ Is raw UUID: NO
    ❌ Contains UUID pattern: NO
  
  ✅ Logged by shows kid name (not UUID)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUD-002 Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ AUD-002 PASSED: Kid-created events show human-readable names + secure

Key findings:
  ✅ "Logged by" displays kid name: "Ahmed"
  ✅ No raw UUIDs visible in UI
  ✅ Server determines loggedBy from auth (SECURE)
  ✅ Client cannot spoof loggedBy field
  ✅ Professional, user-friendly audit trail

🔒 Security Excellence:
  Attempted spoofing: BLOCKED ✅
  Server used auth context: ✅
  No client-side manipulation possible: ✅

🎯 UX Excellence:
  Audit trail is readable: ✅
  Kids/parents can identify who logged events: ✅
  No technical details exposed: ✅
```

---

## 🚨 **If Test Fails - Action Plan**

### **Failure: Client can spoof loggedBy (CRITICAL SECURITY BUG)**

```bash
# Test spoofing:
curl -X POST /quests/123/complete \
  -H "Authorization: Bearer <kid-token>" \
  -d '{"logged_by": "parent-uuid"}'

# Check database:
SELECT logged_by FROM point_events WHERE id = 'event-456';
# If shows "parent-uuid" instead of "kid-uuid" → SECURITY BUG!

# Fix:
1. Remove logged_by from request body parsing
2. Get child.id from auth token
3. Use child.id as logged_by (ignore client input)
```

---

### **Failure: UUID displayed in UI**

```bash
# Check event display:
console.log('Logged by text:', loggedByElement.textContent);
# If shows UUID → UX BUG

# Fix:
1. Add child name lookup in EventRow component
2. Use children context or fetch child profile
3. Display child.name instead of UUID
```

---

## 🎯 **Integration with Test Suite**

**Suite 27:** Audit Trail Display (P0) - 2 tests
- AUD-001: "Logged by" shows parent name ✅
- AUD-002: "Logged by" shows kid name + no spoofing ← **THIS TEST**

**Position:** Suite 27 (between Child Selection and Final Smoke Test)

---

## 📚 **Related Tests**

| Test ID | Name | Relationship |
|---------|------|--------------|
| **AUD-001** | Parent-created event display | Same concept, different actor |
| **AUD-002** | Kid-created event display | Adds security requirement ← **THIS** |
| **SEC-001** | Auth token validation | Related - validates auth context |

---

## 🎉 **Production Readiness Impact**

With AUD-002 implemented:
- ✅ **Professional audit trail** for kid-created events
- ✅ **User-friendly** (kids/parents see names, not IDs)
- ✅ **Secure** (no client-side spoofing possible)
- ✅ **Accountability** (clear who logged each event)
- ✅ **Trust** (system looks polished and secure)

**This test ensures both UX and security for kid-created events!** ✅🔒📋

---

## 🔄 **Test Automation**

```typescript
// Playwright test
test('AUD-002: Kid-created event shows kid name', async ({ page }) => {
  // Login as kid
  const kidToken = await loginAsKid(page, '1234', familyA.id);
  
  // Complete a quest
  const questId = await getActiveQuestId(page);
  
  // Attempt to spoof logged_by
  const response = await page.request.post(`/quests/${questId}/complete`, {
    headers: { 'Authorization': `Bearer ${kidToken}` },
    data: { logged_by: 'fake-parent-uuid' } // Spoofing attempt
  });
  
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  const eventId = result.point_event_id;
  
  // Check database: logged_by should be kid ID (not spoofed)
  const event = await getEventFromDB(eventId);
  expect(event.logged_by).not.toBe('fake-parent-uuid');
  expect(event.logged_by).toBe(kidA1.id);
  
  // Navigate to audit page
  await page.goto(`/events?childId=${kidA1.id}`);
  
  // Find the event
  const eventRow = page.getByTestId(`event-${eventId}`);
  await expect(eventRow).toBeVisible();
  
  // Check "Logged by" field
  const loggedBy = eventRow.getByTestId('logged-by');
  const loggedByText = await loggedBy.textContent();
  
  // Should NOT be a UUID
  expect(loggedByText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  
  // Should be kid's name
  expect(loggedByText).toMatch(/Ahmed/);
});
```

**AUD-002 ensures secure and user-friendly audit trail for kid-created events!** ✅🔒✨

---

## 🎯 **Summary**

**AUD-002** validates that kid-created events (from quest completions) show human-readable names in the audit trail and cannot be spoofed by client payloads.

**Ensures:**
1. ✅ UX: Kid names shown (not UUIDs)
2. ✅ Security: Server determines loggedBy from auth
3. ✅ Trust: No client-side manipulation possible
4. ✅ Consistency: Same display format as parent events

**This test completes the audit trail display suite and adds critical security validation!** 🎉🔒📋✅
