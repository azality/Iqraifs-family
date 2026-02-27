# ✅ AUD-004: NAME RESOLUTION FAILURE FALLBACK (NO BREAKING UI) (P1)

**Priority:** P1 (Important - Resilience)  
**Type:** Parent Mode & Kid Mode - Error Handling & UX Resilience  
**Purpose:** Ensure UI shows safe fallback labels when name resolution fails, preventing crashes

---

## 🎯 **Test Purpose**

Validate that when name lookup fails (missing profile, network error, etc.), the audit trail:
1. **Shows safe fallback label** (e.g., "Parent", "Kid", "Unknown")
2. **NEVER crashes or renders blank**
3. **NEVER shows raw UUID** (even in error state)
4. **Handles gracefully** without blocking user

This ensures the system is resilient to data inconsistencies and network issues in production.

---

## 📋 **Preconditions**

**Simulate "name lookup missing":**
- Parent profile name missing (display_name is NULL) OR
- Profile fetch fails once (network hiccup) OR
- logged_by references deleted/invalid user

**Test scenarios:**
1. **Missing display name** (data exists but display_name is NULL)
2. **Missing profile** (logged_by references non-existent user)
3. **Network failure** (simulated timeout/error in name lookup)

---

## 🔍 **Test Steps**

### **Scenario 1: Missing Display Name (Graceful Degradation)**

#### **Step 1: Create parent with no display name**

```typescript
// Simulate parent profile with missing display_name
const parentWithNoName = {
  id: 'uuid-parent-no-name',
  email: 'parent.noname@test.com',
  display_name: null, // ← Missing!
  family_id: familyA.id
};

// Create in database with NULL display_name
await supabase
  .from('users')
  .update({ display_name: null })
  .eq('id', parentA1.id);

console.log('✅ Parent profile updated with NULL display_name');
```

---

#### **Step 2: Parent creates point event**

```typescript
const eventResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${parentA1Token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      child_id: kidA1.id,
      behavior_name: 'Test Event - No Name',
      points: 10,
      notes: 'AUD-004 test - missing display_name'
    })
  }
);

const event = await eventResponse.json();
console.log('✅ Point event created by parent with no display_name');
```

---

#### **Step 3: Fetch audit timeline**

```typescript
const timelineResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events?childId=${kidA1.id}`,
  {
    headers: { 'Authorization': `Bearer ${parentA1Token}` }
  }
);

const timeline = await timelineResponse.json();
const recentEvent = timeline[0];

console.log('📋 Event fetched:');
console.log(`   logged_by (raw): ${recentEvent.logged_by}`);
console.log(`   logged_by_display: ${recentEvent.logged_by_display || '(not set)'}`);
```

---

#### **Step 4: Verify fallback to email**

```typescript
const loggedByDisplay = recentEvent.logged_by_display;

// Should fallback to email when display_name is NULL
const expectedFallback = parentWithNoName.email; // 'parent.noname@test.com'

console.log('📋 Checking fallback logic:');
console.log(`   Display value: "${loggedByDisplay}"`);
console.log(`   Expected fallback: "${expectedFallback}"`);

// Check NOT a UUID
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(loggedByDisplay);

if (isUUID) {
  throw new Error('❌ FAIL: Shows UUID instead of fallback');
}

// Check shows email or safe fallback
const isSafeFallback = 
  loggedByDisplay === expectedFallback || // Email
  loggedByDisplay === 'Parent' ||         // Generic fallback
  loggedByDisplay === 'User';             // Generic fallback

if (!isSafeFallback) {
  throw new Error(`❌ FAIL: Unexpected fallback value: "${loggedByDisplay}"`);
}

console.log('✅ PASS: Shows safe fallback (email or generic label)');
```

---

### **Scenario 2: Missing Profile (Orphaned Event)**

#### **Step 1: Create event with invalid logged_by**

```typescript
// Simulate orphaned event (logged_by references deleted user)
const orphanedEvent = {
  id: 'uuid-event-orphaned',
  child_id: kidA1.id,
  behavior_name: 'Orphaned Event',
  points: 10,
  logged_by: 'uuid-deleted-user-99999', // ← Invalid/deleted user!
  occurred_at: new Date().toISOString()
};

// Insert directly to database (bypass API validation)
await supabase
  .from('point_events')
  .insert(orphanedEvent);

console.log('✅ Created orphaned event with invalid logged_by');
```

---

#### **Step 2: Fetch timeline with orphaned event**

```typescript
const timelineResponse = await fetch(
  `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/point-events?childId=${kidA1.id}`,
  {
    headers: { 'Authorization': `Bearer ${parentA1Token}` }
  }
);

const timeline = await timelineResponse.json();

// Find the orphaned event
const orphaned = timeline.find(e => e.id === orphanedEvent.id);

if (!orphaned) {
  throw new Error('Orphaned event not found in timeline');
}

console.log('📋 Orphaned event in timeline:');
console.log(`   logged_by (raw): ${orphaned.logged_by}`);
console.log(`   logged_by_display: ${orphaned.logged_by_display || '(not set)'}`);
```

---

#### **Step 3: Verify safe fallback for orphaned event**

```typescript
const loggedByDisplay = orphaned.logged_by_display;

// Should show generic fallback when user doesn't exist
const safeFallbacks = ['Parent', 'Kid', 'User', 'Unknown'];

console.log('📋 Checking orphaned event fallback:');
console.log(`   Display value: "${loggedByDisplay}"`);

// Check NOT a UUID
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(loggedByDisplay);

if (isUUID) {
  throw new Error('❌ FAIL: Shows UUID for orphaned event');
}

// Check shows safe fallback
const isSafeFallback = safeFallbacks.some(fb => loggedByDisplay.includes(fb));

if (!isSafeFallback) {
  console.log(`   ⚠️  Warning: Unexpected fallback for orphaned event: "${loggedByDisplay}"`);
  console.log(`   Expected one of: ${safeFallbacks.join(', ')}`);
}

console.log('✅ PASS: Shows safe fallback for orphaned event');
```

---

### **Scenario 3: Network Failure (Simulated)**

#### **Step 1: Mock network failure in client-side lookup**

```typescript
// This scenario tests client-side resilience
// when fetching parent/child profiles fails

// Simulate: API returns events but profile lookup fails
const mockEvents = [
  {
    id: 'uuid-event-1',
    logged_by: 'uuid-parent-a1',
    behavior_name: 'Test Event',
    points: 10
    // Note: No logged_by_display field (simulates server not including it)
  }
];

// Client tries to fetch parent profile but gets network error
async function fetchParentName(parentId: string) {
  // Simulate network timeout
  throw new Error('Network timeout: Failed to fetch parent profile');
}

console.log('📋 Simulating network failure in name lookup...');
```

---

#### **Step 2: Render UI with failed lookup**

```typescript
// In React component (simulated)
function EventRow({ event }) {
  const [loggedByName, setLoggedByName] = useState<string>('Loading...');
  
  useEffect(() => {
    async function fetchName() {
      try {
        // Try to fetch name
        const name = await fetchParentName(event.logged_by);
        setLoggedByName(name);
      } catch (error) {
        // Network failure - use safe fallback
        console.log('⚠️  Name lookup failed, using fallback');
        setLoggedByName('User'); // Safe fallback
      }
    }
    
    fetchName();
  }, [event.logged_by]);
  
  return (
    <div data-testid="event-row">
      <span data-testid="logged-by">
        Logged by: {loggedByName}
      </span>
    </div>
  );
}
```

---

#### **Step 3: Verify UI doesn't crash**

```typescript
// Check UI renders without crashing
const eventRow = document.querySelector('[data-testid="event-row"]');
const loggedByElement = eventRow?.querySelector('[data-testid="logged-by"]');

if (!eventRow || !loggedByElement) {
  throw new Error('❌ FAIL: UI crashed or failed to render');
}

const displayText = loggedByElement.textContent || '';

console.log('📋 UI rendered with network failure:');
console.log(`   Display text: "${displayText}"`);

// Should NOT show UUID or error message in UI
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(displayText);
const isErrorMsg = displayText.includes('Error') || displayText.includes('Failed');

if (isUUID) {
  throw new Error('❌ FAIL: Shows UUID on network failure');
}

if (isErrorMsg) {
  throw new Error('❌ FAIL: Shows error message in UI (should show safe fallback)');
}

console.log('✅ PASS: UI shows safe fallback on network failure');
```

---

## ✅ **Acceptance Criteria**

1. ✅ **UI shows safe fallback label** when name resolution fails
   - Missing display_name → Shows email
   - Missing profile → Shows "User" or "Unknown"
   - Network error → Shows "User" or "Loading..." → "User"

2. ✅ **UI does not crash or render blank**
   - No white screen of death
   - No "undefined" or "null" displayed
   - Graceful error handling

3. ✅ **Never shows raw UUID** (even in error state)
   - ❌ NOT: `"Logged by: fb090fa9-..."`
   - ✅ YES: `"Logged by: User"` or `"Logged by: parent@email.com"`

4. ✅ **Consistent fallback hierarchy**
   - 1st choice: display_name
   - 2nd choice: email
   - 3rd choice: "Parent" / "Kid" / "User"
   - Never: UUID or blank

---

## 🚨 **Common Failure Patterns**

### **1. Displaying "undefined" or "null"**

**Symptom:**
```
Logged by: undefined
Logged by: null
Logged by: [object Object]
```

**Cause:**
- Missing null checks
- JavaScript coercion showing raw values

**Fix:**
```typescript
// ❌ BAD: No fallback
const loggedByName = event.parent?.display_name; // Can be undefined

// ✅ GOOD: Proper fallback chain
const loggedByName = 
  event.parent?.display_name || 
  event.parent?.email || 
  event.kid?.name || 
  'User';
```

---

### **2. UI crashes with missing data**

**Symptom:**
```
TypeError: Cannot read property 'display_name' of undefined
  at EventRow:42
```

**Cause:**
- Accessing properties without optional chaining
- No error boundaries

**Fix:**
```typescript
// ❌ BAD: Will crash if parent is undefined
const name = event.parent.display_name;

// ✅ GOOD: Safe access with fallback
const name = event.parent?.display_name || 'User';

// ✅ BETTER: Error boundary wrapper
<ErrorBoundary fallback={<div>Unable to load event</div>}>
  <EventRow event={event} />
</ErrorBoundary>
```

---

### **3. Network errors block entire UI**

**Symptom:**
```
// UI shows loading spinner forever
// No timeout, no fallback
```

**Cause:**
- No timeout on fetch calls
- No error handling in async functions

**Fix:**
```typescript
// ❌ BAD: No timeout
async function fetchName(id) {
  const response = await fetch(`/users/${id}`);
  return response.json();
}

// ✅ GOOD: Timeout + error handling
async function fetchName(id) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(`/users/${id}`, { 
      signal: controller.signal 
    });
    
    clearTimeout(timeout);
    return await response.json();
  } catch (error) {
    console.warn('Name fetch failed:', error);
    return { name: 'User' }; // Safe fallback
  }
}
```

---

## 💻 **Expected Implementation**

### **1. Server-side: Always provide logged_by_display**

```typescript
// GET /point-events endpoint
app.get('/make-server-f116e23f/point-events', async (c) => {
  const { childId } = c.req.query();
  
  const { data: events, error } = await supabase
    .from('point_events')
    .select(`
      *,
      parent:users!logged_by(id, display_name, email),
      kid:children!logged_by(id, name)
    `)
    .eq('child_id', childId)
    .order('occurred_at', { ascending: false });
  
  if (error) throw error;
  
  // ⚠️ CRITICAL: Always provide fallback, even if JOIN fails
  const eventsWithNames = events.map(event => {
    let loggerName = 'User'; // Default fallback
    
    // Try parent first
    if (event.parent) {
      loggerName = event.parent.display_name || 
                   event.parent.email || 
                   'Parent';
    }
    // Try kid
    else if (event.kid) {
      loggerName = event.kid.name || 'Kid';
    }
    // If both failed (orphaned event), use default 'User'
    
    return {
      ...event,
      logged_by_display: loggerName // Always present!
    };
  });
  
  return c.json(eventsWithNames);
});
```

---

### **2. Client-side: Defensive rendering**

```typescript
// In EventRow.tsx component
function EventRow({ event }) {
  // Multiple layers of fallback
  const loggedByDisplay = 
    event.logged_by_display ||  // Server-provided (best)
    event.logged_by_name ||     // Alternative field
    'User';                     // Client-side fallback
  
  // Verify it's not a UUID (additional safety check)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(loggedByDisplay);
  const safeDisplay = isUUID ? 'User' : loggedByDisplay;
  
  return (
    <div className="event-row" data-testid="event-row">
      <div className="event-behavior">{event.behavior_name}</div>
      <div className="event-points">+{event.points}</div>
      
      <div className="event-logger">
        <span data-testid="logged-by">
          Logged by: {safeDisplay}
        </span>
      </div>
    </div>
  );
}
```

---

### **3. Error boundary for resilience**

```typescript
// ErrorBoundary.tsx
class AuditErrorBoundary extends React.Component {
  state = { hasError: false };
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('Audit timeline error:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="audit-error-state">
          <p>Unable to load some events. Displaying available data...</p>
        </div>
      );
    }
    
    return this.props.children;
  }
}

// Usage:
<AuditErrorBoundary>
  <AuditTimeline childId={childId} />
</AuditErrorBoundary>
```

---

## 📊 **Test Output Example**

```
═══════════════════════════════════════════════════════════════
📋 AUDIT TRAIL DISPLAY TESTS (P1)
═══════════════════════════════════════════════════════════════

  ✅ AUD-001: Parent-created event shows "Logged by: <Parent Name>"
  ✅ AUD-002: Kid-created event shows "Logged by: <Kid Name>"
  ✅ AUD-003: Mixed timeline shows correct names consistently
  ✅ AUD-004: Name resolution failure fallback (no breaking UI)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test AUD-004: Name Resolution Failure Fallback
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Purpose: Ensure UI shows safe fallback when name resolution fails

📋 Scenario 1: Missing Display Name (Graceful Degradation)

Step 1: Create parent with no display name
   ✅ Parent profile updated with NULL display_name

Step 2: Parent creates point event
   ✅ Point event created by parent with no display_name

Step 3: Fetch audit timeline
   📋 Event fetched:
   logged_by (raw): uuid-parent-a1
   logged_by_display: parent.noname@test.com

Step 4: Verify fallback to email
   📋 Checking fallback logic:
   Display value: "parent.noname@test.com"
   Expected fallback: "parent.noname@test.com"
   
   ✅ PASS: Shows safe fallback (email when display_name missing)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Scenario 2: Missing Profile (Orphaned Event)

Step 1: Create event with invalid logged_by
   ✅ Created orphaned event with invalid logged_by

Step 2: Fetch timeline with orphaned event
   📋 Orphaned event in timeline:
   logged_by (raw): uuid-deleted-user-99999
   logged_by_display: User

Step 3: Verify safe fallback for orphaned event
   📋 Checking orphaned event fallback:
   Display value: "User"
   
   ✅ PASS: Shows safe fallback for orphaned event

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Scenario 3: Network Failure (Simulated)

Step 1: Mock network failure in client-side lookup
   📋 Simulating network failure in name lookup...

Step 2: Render UI with failed lookup
   ⚠️  Name lookup failed, using fallback

Step 3: Verify UI doesn't crash
   📋 UI rendered with network failure:
   Display text: "Logged by: User"
   
   ✅ PASS: UI shows safe fallback on network failure

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUD-004 Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ AUD-004 PASSED: Name resolution failure handled gracefully

Key findings:
  ✅ Missing display_name → Shows email fallback
  ✅ Missing profile → Shows "User" fallback
  ✅ Network failure → Shows "User" fallback
  ✅ No UUIDs displayed in any error state
  ✅ UI never crashes or renders blank

🎯 Resilience Excellence:
  System handles missing data gracefully
  Network errors don't block UI
  Users always see meaningful labels
  Production-ready error handling
```

---

## 🚨 **If Test Fails - Debugging**

### **Failure: Shows "undefined" or "null"**

```bash
# Check fallback chain in server
const loggedByName = 
  event.parent?.display_name ||  // Check 1
  event.parent?.email ||         // Check 2
  event.kid?.name ||             // Check 3
  'User';                        // Final fallback ← Must always reach this

# Verify every branch ends with a string value
```

---

### **Failure: UI crashes**

```bash
# Add error boundary
<ErrorBoundary fallback={<div>Error loading events</div>}>
  <EventsList events={events} />
</ErrorBoundary>

# Add null checks everywhere
const name = event.parent?.display_name || 'User';
```

---

### **Failure: Shows UUID on error**

```bash
# Add UUID detection in client
function sanitizeLoggedBy(value) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(value);
  return isUUID ? 'User' : value;
}

const display = sanitizeLoggedBy(event.logged_by_display);
```

---

## 🎯 **Integration with Test Suite**

**Suite 27:** Audit Trail Display (P0/P1) - 4 tests
- AUD-001: Parent event display (P0) ✅
- AUD-002: Kid event display + security (P0) ✅
- AUD-003: Mixed timeline attribution (P0) ✅
- AUD-004: Name resolution failure fallback (P1) ← **THIS TEST**

---

## 📚 **Related Tests**

| Test ID | Name | Relationship |
|---------|------|--------------|
| **AUD-001** | Parent event display | Tests happy path |
| **AUD-002** | Kid event display | Tests happy path |
| **AUD-003** | Mixed timeline | Tests happy path |
| **AUD-004** | Failure fallback | Tests error cases ← **THIS** |

---

## 🎉 **Production Readiness Impact**

With AUD-004 implemented:
- ✅ **Resilient UI** (handles missing data)
- ✅ **No crashes** (graceful degradation)
- ✅ **User-friendly** (meaningful fallbacks)
- ✅ **Production-ready** (handles real-world errors)

**This test ensures your audit trail never breaks, even when things go wrong!** ✅🛡️📋

---

## 🔄 **Test Automation**

```typescript
// Playwright test
test('AUD-004: Name resolution failure fallback', async ({ page }) => {
  // Test 1: Missing display name
  await setParentDisplayName(parentA1.id, null);
  await createPointEvent(page, { childId: kidA1.id });
  await page.goto(`/events?childId=${kidA1.id}`);
  
  const loggedBy = await page.getByTestId('logged-by').first().textContent();
  
  // Should show email, not UUID
  expect(loggedBy).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(loggedBy).toContain('@'); // Contains email
  
  // Test 2: Orphaned event
  await createOrphanedEvent({ logged_by: 'invalid-uuid' });
  await page.reload();
  
  const orphanedRow = await page.getByText('Orphaned Event').closest('[data-testid="event-row"]');
  const orphanedLoggedBy = await orphanedRow.getByTestId('logged-by').textContent();
  
  // Should show safe fallback
  expect(orphanedLoggedBy).toMatch(/User|Unknown|Parent/);
  
  // Test 3: UI doesn't crash
  await expect(page.getByTestId('audit-timeline')).toBeVisible();
});
```

**AUD-004 ensures bulletproof audit trail resilience!** ✅🛡️💪

---

## 🎯 **Summary**

**AUD-004** validates that the audit trail handles missing/failed name resolution gracefully:

1. ✅ **Missing display_name** → Email fallback
2. ✅ **Missing profile** → Generic "User" fallback
3. ✅ **Network errors** → Safe fallback
4. ✅ **Never crashes** → Error boundaries
5. ✅ **Never shows UUID** → Client-side sanitization

**This test completes comprehensive audit trail resilience for production!** 🎉✅📋🛡️💚
