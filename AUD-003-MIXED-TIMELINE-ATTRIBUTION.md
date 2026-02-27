# ✅ AUD-003: MIXED CREATORS IN TIMELINE SHOW CORRECT NAMES CONSISTENTLY (P0)

**Priority:** P0 (Critical UX)  
**Type:** Parent Mode & Kid Mode - Audit Trail Display  
**Purpose:** Ensure mixed timelines (parent + kid events) show correct attribution for each event type

---

## 🎯 **Test Purpose**

Validate that when both parents and kids create events, the audit timeline:
1. **Parent events show parent name** (or email fallback)
2. **Kid events show kid name/label**
3. **Order and attribution are correct** (chronological, properly attributed)
4. **No cross-contamination** (parent events don't show kid name, vice versa)
5. **Consistent display format** across all event types

This ensures the audit trail is trustworthy and accurately represents who did what, even in complex mixed scenarios.

---

## 📋 **Preconditions**

- **Family A** exists with parent and child
  - Parent A1 (with display name: "Sarah Johnson")
  - Kid A1 (with name: "Ahmed")
- Both Parent A1 and Kid A1 have tokens/authentication
- System supports both parent-logged and kid-logged events

---

## 🔍 **Test Steps**

### **Step 1: Parent creates 2 point events**

**Parent logs events manually:**
```typescript
const parentEvents = [];

// Event 1: Parent logs morning prayer
const event1Response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${parentA1Token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      child_id: kidA1.id,
      behavior_name: 'Morning Prayer',
      points: 10,
      notes: 'Parent-logged event 1',
      occurred_at: new Date().toISOString()
    })
  }
);

const event1 = await event1Response.json();
parentEvents.push(event1);

// Wait 100ms to ensure different timestamps
await sleep(100);

// Event 2: Parent logs homework completion
const event2Response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${parentA1Token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      child_id: kidA1.id,
      behavior_name: 'Homework Completion',
      points: 15,
      notes: 'Parent-logged event 2',
      occurred_at: new Date().toISOString()
    })
  }
);

const event2 = await event2Response.json();
parentEvents.push(event2);

console.log('✅ Parent created 2 point events');
console.log(`   Event 1: Morning Prayer (+10 points)`);
console.log(`   Event 2: Homework Completion (+15 points)\n`);
```

**Expected:**
- 2 events created with `logged_by = parentA1.id`
- Stored in database with parent UUID
- Should display with parent name

---

### **Step 2: Kid logs in**

**Authenticate as kid:**
```typescript
const kidLoginResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/kid-login`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pin: kidA1.pin,
      family_id: familyA.id
    })
  }
);

const { access_token, child } = await kidLoginResponse.json();
const kidToken = access_token;

console.log('✅ Kid logged in');
console.log(`   Name: ${child.name}`);
console.log(`   ID: ${child.id}\n`);
```

---

### **Step 3: Kid completes 2 quests (creates 2 point events)**

**Kid completes quests:**
```typescript
const kidEvents = [];

// Wait 100ms to ensure separation from parent events
await sleep(100);

// Quest 1: Kid completes reading quest
const quest1Response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests`,
  {
    headers: { 'Authorization': `Bearer ${kidToken}` }
  }
);

const quests = await quest1Response.json();
const activeQuest1 = quests[0];

const complete1Response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests/${activeQuest1.id}/complete`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kidToken}`,
      'Content-Type': 'application/json'
    }
  }
);

const result1 = await complete1Response.json();
kidEvents.push(result1);

console.log(`✅ Kid completed quest 1: ${activeQuest1.behavior_name}`);

// Wait 100ms
await sleep(100);

// Quest 2: Kid completes another quest
const activeQuest2 = quests[1];

const complete2Response = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quests/${activeQuest2.id}/complete`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kidToken}`,
      'Content-Type': 'application/json'
    }
  }
);

const result2 = await complete2Response.json();
kidEvents.push(result2);

console.log(`✅ Kid completed quest 2: ${activeQuest2.behavior_name}\n`);
```

**Expected:**
- 2 events created with `logged_by = kidA1.id`
- Stored in database with kid UUID
- Should display with kid name

---

### **Step 4: View full audit timeline**

**Fetch complete event history:**
```typescript
const timelineResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events?childId=${kidA1.id}`,
  {
    headers: { 'Authorization': `Bearer ${parentA1Token}` }
  }
);

const timeline = await timelineResponse.json();

console.log('📋 Full Audit Timeline:');
console.log(`   Total events: ${timeline.length}\n`);

// Expected order (most recent first):
// 1. Kid event 2 (most recent)
// 2. Kid event 1
// 3. Parent event 2
// 4. Parent event 1 (oldest)

timeline.forEach((event, index) => {
  console.log(`   ${index + 1}. ${event.behavior_name}`);
  console.log(`      Points: +${event.points}`);
  console.log(`      Logged by (raw): ${event.logged_by}`);
  console.log(`      Logged by (display): ${event.logged_by_display || '(not set)'}`);
  console.log(`      Time: ${event.occurred_at}\n`);
});
```

---

### **Step 5: Verify attribution is correct for each event**

**Check each event's attribution:**
```typescript
console.log('📋 Verifying Attribution:\n');

const parentId = parentA1.id;
const kidId = kidA1.id;

const errors = [];

timeline.forEach((event, index) => {
  const loggedBy = event.logged_by;
  const loggedByDisplay = event.logged_by_display || event.logged_by_name || event.logged_by;
  
  // Determine expected creator
  let expectedCreator: 'parent' | 'kid';
  let expectedName: string;
  
  if (loggedBy === parentId) {
    expectedCreator = 'parent';
    expectedName = parentA1.display_name || parentA1.email;
  } else if (loggedBy === kidId) {
    expectedCreator = 'kid';
    expectedName = kidA1.name;
  } else {
    errors.push({
      event: index + 1,
      error: 'Unknown logged_by ID',
      logged_by: loggedBy
    });
    return;
  }
  
  // Check if display name is correct
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(loggedByDisplay);
  
  if (isUUID) {
    errors.push({
      event: index + 1,
      error: 'Logged by shows raw UUID',
      display: loggedByDisplay
    });
  } else if (!loggedByDisplay.includes(expectedName)) {
    errors.push({
      event: index + 1,
      error: 'Logged by shows incorrect name',
      expected: expectedName,
      actual: loggedByDisplay
    });
  } else {
    console.log(`   ✅ Event ${index + 1}: ${event.behavior_name}`);
    console.log(`      Creator: ${expectedCreator}`);
    console.log(`      Display: "${loggedByDisplay}" ✅\n`);
  }
});

if (errors.length > 0) {
  console.log('❌ Attribution errors found:\n');
  errors.forEach(err => {
    console.log(`   Event ${err.event}: ${err.error}`);
    if (err.expected) {
      console.log(`     Expected: ${err.expected}`);
      console.log(`     Actual: ${err.actual}`);
    }
    console.log('');
  });
  throw new Error(`${errors.length} attribution errors in timeline`);
}

console.log('✅ All events have correct attribution!\n');
```

---

### **Step 6: Verify chronological order**

**Check timeline is sorted correctly:**
```typescript
console.log('📋 Verifying Chronological Order:\n');

let previousTime = new Date(timeline[0].occurred_at);

for (let i = 1; i < timeline.length; i++) {
  const currentTime = new Date(timeline[i].occurred_at);
  
  // Timeline should be most recent first (descending order)
  if (currentTime > previousTime) {
    throw new Error(
      `Timeline order incorrect at event ${i}: ` +
      `${currentTime.toISOString()} is after ${previousTime.toISOString()}`
    );
  }
  
  previousTime = currentTime;
}

console.log('✅ Timeline is in correct chronological order (most recent first)\n');
```

---

## ✅ **Acceptance Criteria**

1. ✅ **Parent events show parent name** (or email fallback)
   - Example: `"Logged by: Sarah Johnson"`
   - NOT: `"Logged by: fb090fa9-..."`

2. ✅ **Kid events show kid name/label**
   - Example: `"Logged by: Ahmed"`
   - NOT: `"Logged by: 7d3e2b1a-..."`

3. ✅ **Order is correct**
   - Timeline sorted by `occurred_at` (most recent first)
   - All 4 events present in expected order

4. ✅ **Attribution is correct**
   - Parent events: `logged_by = parent UUID`, displays parent name
   - Kid events: `logged_by = kid UUID`, displays kid name
   - No cross-contamination

5. ✅ **Consistent display format**
   - All events use same display pattern
   - Human-readable for all event types
   - No UUIDs visible anywhere

---

## 🚨 **Common Failure Patterns**

### **1. Cross-contamination (all events show same name)**

**Symptom:**
```
Event 1: Morning Prayer - Logged by: Sarah Johnson ✅
Event 2: Homework - Logged by: Sarah Johnson ✅
Event 3: Quest 1 - Logged by: Sarah Johnson ❌ (should be Ahmed)
Event 4: Quest 2 - Logged by: Sarah Johnson ❌ (should be Ahmed)
```

**Cause:**
- Display logic uses wrong field
- Always shows first user or logged-in user
- Not reading `logged_by` field per event

**Fix:**
```typescript
// ❌ BAD: Uses single user for all events
const userName = currentUser.name;
events.forEach(event => {
  display(`Logged by: ${userName}`); // Same for all!
});

// ✅ GOOD: Looks up logger for each event
events.forEach(event => {
  const logger = getLogger(event.logged_by); // Unique per event
  display(`Logged by: ${logger.name}`);
});
```

---

### **2. Incorrect order (not chronological)**

**Symptom:**
```
Timeline:
1. Parent event 1 (oldest) ❌
2. Kid event 1
3. Parent event 2
4. Kid event 2 (newest) ❌
```

**Cause:**
- Missing `ORDER BY occurred_at DESC` in query
- Client-side sorting incorrect

**Fix:**
```typescript
// In server endpoint
const { data: events } = await supabase
  .from('point_events')
  .select('*')
  .eq('child_id', childId)
  .order('occurred_at', { ascending: false }); // ← Most recent first
```

---

### **3. Missing logged_by_display for some events**

**Symptom:**
```
Event 1: Logged by: Sarah Johnson ✅
Event 2: Logged by: fb090fa9-... ❌ (UUID!)
Event 3: Logged by: Ahmed ✅
Event 4: Logged by: 7d3e2b1a-... ❌ (UUID!)
```

**Cause:**
- JOIN only works for parent events (users table)
- Doesn't JOIN with children table for kid events
- Inconsistent data transformation

**Fix:**
```typescript
// Join BOTH users and children tables
const { data: events } = await supabase
  .from('point_events')
  .select(`
    *,
    parent:users!logged_by(display_name, email),
    kid:children!logged_by(name)
  `)
  .eq('child_id', childId);

// Transform to handle both
const eventsWithNames = events.map(event => ({
  ...event,
  logged_by_display: 
    event.parent?.display_name || // Parent name first
    event.parent?.email ||        // Parent email fallback
    event.kid?.name ||            // Kid name
    'User'                        // Generic fallback
}));
```

---

### **4. Duplicate events or missing events**

**Symptom:**
```
Expected 4 events, found 6 events
OR
Expected 4 events, found 2 events
```

**Cause:**
- Test events from previous runs not cleaned up
- Events filtered incorrectly
- Race condition in creation

**Fix:**
```typescript
// Clean setup: Delete old test events first
await supabase
  .from('point_events')
  .delete()
  .eq('child_id', testChild.id)
  .like('notes', '%AUD-003 test%'); // Only delete test events

// Create events with test markers
await supabase.from('point_events').insert({
  // ... fields
  notes: 'AUD-003 test event - parent 1'
});
```

---

## 💻 **Expected Implementation**

### **1. Server-side: JOIN both users and children**

```typescript
// GET /point-events endpoint
app.get('/make-server-f116e23f/point-events', async (c) => {
  const { childId } = c.req.query();
  
  // ⚠️ CRITICAL: Join BOTH tables to support parent AND kid events
  const { data: events, error } = await supabase
    .from('point_events')
    .select(`
      *,
      parent:users!logged_by(id, display_name, email),
      kid:children!logged_by(id, name)
    `)
    .eq('child_id', childId)
    .order('occurred_at', { ascending: false }); // Most recent first
  
  if (error) throw error;
  
  // Transform to include human-readable logger
  const eventsWithNames = events.map(event => {
    // Try parent first (most common for manual logs)
    // Then kid (for quest completions)
    const loggerName = 
      event.parent?.display_name || 
      event.parent?.email || 
      event.kid?.name || 
      'User';
    
    return {
      ...event,
      logged_by_display: loggerName
    };
  });
  
  return c.json(eventsWithNames);
});
```

---

### **2. Database schema consideration**

```sql
-- Ensure foreign keys support BOTH users and children
-- Point events can be logged by parents OR kids

-- Option A: logged_by can reference either table
-- This is flexible but complex

-- Option B: Separate fields (clearer)
ALTER TABLE point_events 
  ADD COLUMN logged_by_type TEXT; -- 'parent' or 'kid'

-- Then use logged_by_type to determine which table to JOIN
```

**Current approach (Option A):**
```typescript
// Server logic determines type by checking which JOIN succeeds
if (event.parent) {
  // Parent created this event
  loggerName = event.parent.display_name || event.parent.email;
} else if (event.kid) {
  // Kid created this event
  loggerName = event.kid.name;
}
```

---

### **3. Client-side: Display timeline**

```typescript
// In AuditTimeline.tsx component
function AuditTimeline({ childId }) {
  const [events, setEvents] = useState([]);
  
  useEffect(() => {
    fetch(`/point-events?childId=${childId}`)
      .then(res => res.json())
      .then(events => setEvents(events));
  }, [childId]);
  
  return (
    <div className="audit-timeline">
      <h2>Activity Timeline</h2>
      
      {events.map(event => (
        <div key={event.id} className="event-row">
          <div className="event-behavior">{event.behavior_name}</div>
          <div className="event-points">+{event.points} points</div>
          
          {/* Human-readable logger name */}
          <div className="event-logger">
            <span data-testid="logged-by">
              Logged by: {event.logged_by_display}
            </span>
          </div>
          
          <div className="event-time">
            {formatTimestamp(event.occurred_at)}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 📊 **Test Output Example**

```
═══════════════════════════════════════════════════════════════
📋 AUDIT TRAIL DISPLAY TESTS (P0)
═══════════════════════════════════════════════════════════════

  ✅ AUD-001: Parent-created event shows "Logged by: <Parent Name>"
  ✅ AUD-002: Kid-created event shows "Logged by: <Kid Name>"
  ✅ AUD-003: Mixed timeline shows correct names consistently

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test AUD-003: Mixed Timeline Attribution
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Purpose: Ensure mixed parent+kid timelines show correct attribution

📋 Step 1: Parent creates 2 point events

   ✅ Parent created 2 point events
   Event 1: Morning Prayer (+10 points)
   Event 2: Homework Completion (+15 points)

📋 Step 2: Kid logs in

   ✅ Kid logged in
   Name: Ahmed
   ID: uuid-kid-a1

📋 Step 3: Kid completes 2 quests

   ✅ Kid completed quest 1: Read Quran
   ✅ Kid completed quest 2: Help with dishes

📋 Step 4: View full audit timeline

   📋 Full Audit Timeline:
   Total events: 4

   1. Help with dishes
      Points: +10
      Logged by (raw): uuid-kid-a1
      Logged by (display): Ahmed
      Time: 2026-02-22T15:45:00Z

   2. Read Quran
      Points: +15
      Logged by (raw): uuid-kid-a1
      Logged by (display): Ahmed
      Time: 2026-02-22T15:44:50Z

   3. Homework Completion
      Points: +15
      Logged by (raw): uuid-parent-a1
      Logged by (display): Sarah Johnson
      Time: 2026-02-22T15:44:30Z

   4. Morning Prayer
      Points: +10
      Logged by (raw): uuid-parent-a1
      Logged by (display): Sarah Johnson
      Time: 2026-02-22T15:44:20Z

📋 Step 5: Verify attribution is correct

   ✅ Event 1: Help with dishes
      Creator: kid
      Display: "Ahmed" ✅

   ✅ Event 2: Read Quran
      Creator: kid
      Display: "Ahmed" ✅

   ✅ Event 3: Homework Completion
      Creator: parent
      Display: "Sarah Johnson" ✅

   ✅ Event 4: Morning Prayer
      Creator: parent
      Display: "Sarah Johnson" ✅

   ✅ All events have correct attribution!

📋 Step 6: Verify chronological order

   ✅ Timeline is in correct chronological order (most recent first)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUD-003 Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ AUD-003 PASSED: Mixed timeline attribution is correct

Key findings:
  ✅ Parent events show parent name (2/2 correct)
  ✅ Kid events show kid name (2/2 correct)
  ✅ Timeline order is chronological (most recent first)
  ✅ No cross-contamination between event types
  ✅ Consistent display format across all events

🎯 UX Excellence:
  Clear attribution throughout timeline
  Parents/kids can track who did what
  Professional, trustworthy audit trail
```

---

## 🚨 **If Test Fails - Debugging**

### **Failure: Some events show UUID**

```bash
# Check server response
curl /point-events?childId=xxx | jq '.data[0]'

# Look for:
{
  "logged_by": "uuid-parent-a1",
  "logged_by_display": "Sarah Johnson"  ← Should exist for ALL events
}

# If missing for some events:
# → Check JOIN includes BOTH users and children tables
# → Verify transformation logic handles both cases
```

---

### **Failure: Wrong names (cross-contamination)**

```bash
# All events show same name

# Debug:
console.log('Events:', events.map(e => ({
  behavior: e.behavior_name,
  logged_by: e.logged_by,
  display: e.logged_by_display
})));

# If logged_by is correct but display is wrong:
# → Check client-side is using event.logged_by_display (not global user)
```

---

### **Failure: Wrong order**

```bash
# Check if ORDER BY is correct in server query

SELECT occurred_at FROM point_events 
WHERE child_id = 'xxx' 
ORDER BY occurred_at DESC;  ← Should be DESC (newest first)

# If correct in DB but wrong in UI:
# → Check client-side isn't re-sorting
```

---

## 🎯 **Integration with Test Suite**

**Suite 27:** Audit Trail Display (P0) - 3 tests
- AUD-001: Parent event display ✅
- AUD-002: Kid event display + security ✅
- AUD-003: Mixed timeline attribution ← **THIS TEST**

---

## 📚 **Related Tests**

| Test ID | Name | Relationship |
|---------|------|--------------|
| **AUD-001** | Parent event display | Tests parent events in isolation |
| **AUD-002** | Kid event display | Tests kid events in isolation |
| **AUD-003** | Mixed timeline | Tests both together ← **THIS** |

---

## 🎉 **Production Readiness Impact**

With AUD-003 implemented:
- ✅ **Real-world scenario tested** (mixed parent/kid activity)
- ✅ **Timeline integrity** (correct order and attribution)
- ✅ **User trust** (accurate "who did what" tracking)
- ✅ **No confusion** (clear distinction between parent/kid actions)

**This test ensures audit trails work correctly in production use!** ✅📋🔄👨‍👩‍👧

---

## 🔄 **Test Automation**

```typescript
// Playwright test
test('AUD-003: Mixed timeline attribution', async ({ page }) => {
  // Login as parent
  await loginAsParent(page, 'parent.a1@test.com');
  
  // Create 2 parent events
  await createPointEvent(page, { behavior: 'Morning Prayer', points: 10 });
  await createPointEvent(page, { behavior: 'Homework', points: 15 });
  
  // Login as kid
  await loginAsKid(page, '1234', familyA.id);
  
  // Complete 2 quests
  await completeQuest(page, questId1);
  await completeQuest(page, questId2);
  
  // View timeline (as parent)
  await loginAsParent(page, 'parent.a1@test.com');
  await page.goto(`/events?childId=${kidA1.id}`);
  
  // Get all logged-by elements
  const eventRows = await page.getByTestId('event-row').all();
  
  for (const row of eventRows) {
    const behavior = await row.getByTestId('behavior').textContent();
    const loggedBy = await row.getByTestId('logged-by').textContent();
    
    // Should NOT be a UUID
    expect(loggedBy).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    
    // Should be human-readable
    expect(loggedBy).toMatch(/Sarah Johnson|Ahmed/);
  }
});
```

**AUD-003 ensures mixed timelines display correctly in production!** ✅📋🔄✨

---

## 🎯 **Summary**

**AUD-003** validates that audit trails work correctly when both parents and kids create events, ensuring:

1. ✅ **Parent events** → Parent name displayed
2. ✅ **Kid events** → Kid name displayed
3. ✅ **Correct order** → Most recent first
4. ✅ **Correct attribution** → No cross-contamination
5. ✅ **Consistent format** → Professional throughout

**This test completes comprehensive audit trail coverage for real-world usage!** 🎉✅📋👨‍👩‍👧💚
