# ✅ SEL-003: SINGLE-CHILD PERSISTENCE ACROSS NAVIGATION (P0)

**Priority:** P0 (Critical UX)  
**Type:** Parent Mode UX - Navigation & Refresh Persistence  
**Purpose:** Ensure single-child selection persists across navigation and page refreshes

---

## 🎯 **Test Purpose**

Validate that when a parent with exactly one child navigates between pages or performs hard refreshes, the child selection is maintained throughout, preventing:
- Lost selection context on route changes
- "Undefined child" API errors
- Intermittent empty states
- Unnecessary re-selection prompts

---

## 📋 **Preconditions**

- **Family S** exists (single-child family)
  - Parent S1 (parent account)
  - Kid S1 (exactly ONE child - no siblings)
- Parent S1 logged in
- Child auto-selected (SEL-001 passed)

---

## 🔍 **Test Steps**

### **Step 1: Go to /challenges → Confirm child auto-selected**
```
Route: /challenges
Expected: 
  - Child auto-selected in localStorage
  - Page loads successfully
  - No "Please select a child" prompt
  - Data loaded for selected child
```

### **Step 2: Navigate to /attendance → Verify child context preserved**
```
Route: /attendance (navigated from /challenges)
Expected:
  - Same child still selected
  - Selection preserved in localStorage
  - No re-selection needed
  - Data loaded for same child
  - No "undefined child" API calls
```

### **Step 3: Hard refresh /attendance**
```
Action: F5 or Cmd+R on /attendance page
Expected:
  - localStorage restored on page load
  - Same child still selected
  - Page loads successfully
  - No "Please select a child" prompt
  - No API calls with missing childId
```

### **Step 4: Go back to /challenges**
```
Route: /challenges (navigated from /attendance)
Expected:
  - Same child still selected
  - Selection preserved through navigation
  - No re-selection needed
  - Data loaded for same child
```

### **Step 5: Hard refresh /challenges**
```
Action: F5 or Cmd+R on /challenges page
Expected:
  - localStorage restored on page load
  - Same child still selected
  - Page loads successfully
  - No "Please select a child" prompt
  - No API calls with missing childId
```

---

## ✅ **Acceptance Criteria**

1. ✅ **Selection persists across routes**  
   Child selection maintained when navigating between pages (/challenges ↔ /attendance)

2. ✅ **Selection persists across hard refresh**  
   Child selection restored from localStorage after F5/Cmd+R

3. ✅ **No "undefined child" API calls occur**  
   All API requests include valid `childId` parameter  
   No requests made with `childId=undefined` or `childId=null`

4. ✅ **No re-selection prompts**  
   User never sees "Please select a child" after navigating or refreshing

5. ✅ **Consistent user experience**  
   Same child context maintained throughout entire session

---

## 🔬 **Test Implementation**

### **Navigation Flow Test**

```typescript
// SEL-003: Test navigation persistence
async function testNavigationPersistence() {
  const singleChild = children[0]; // Only 1 child in family
  
  // 1. Navigate to /challenges
  window.location.href = '/challenges';
  await waitForPageLoad();
  
  // Verify selection
  const selectedId1 = localStorage.getItem('selectedChildId');
  expect(selectedId1).toBe(singleChild.id);
  
  // 2. Navigate to /attendance
  window.location.href = '/attendance';
  await waitForPageLoad();
  
  // Verify selection preserved
  const selectedId2 = localStorage.getItem('selectedChildId');
  expect(selectedId2).toBe(singleChild.id);
  expect(selectedId2).toBe(selectedId1); // Same child
  
  // 3. Hard refresh /attendance
  window.location.reload();
  await waitForPageLoad();
  
  // Verify selection restored
  const selectedId3 = localStorage.getItem('selectedChildId');
  expect(selectedId3).toBe(singleChild.id);
  
  // 4. Navigate back to /challenges
  window.location.href = '/challenges';
  await waitForPageLoad();
  
  // Verify selection preserved
  const selectedId4 = localStorage.getItem('selectedChildId');
  expect(selectedId4).toBe(singleChild.id);
  
  // 5. Hard refresh /challenges
  window.location.reload();
  await waitForPageLoad();
  
  // Verify selection restored
  const selectedId5 = localStorage.getItem('selectedChildId');
  expect(selectedId5).toBe(singleChild.id);
  
  console.log('✅ Selection persisted through all navigation steps');
}
```

### **API Call Monitoring**

```typescript
// Monitor for undefined childId in API calls
const apiCalls: { url: string; hasChildId: boolean }[] = [];

// Intercept fetch calls
const originalFetch = window.fetch;
window.fetch = async (url, options) => {
  const urlString = url.toString();
  
  // Check if URL should have childId parameter
  const requiresChildId = [
    '/challenges',
    '/attendance',
    '/wishlist',
    '/events'
  ].some(path => urlString.includes(path));
  
  if (requiresChildId) {
    const hasChildId = urlString.includes('childId=') && 
                       !urlString.includes('childId=undefined') &&
                       !urlString.includes('childId=null');
    
    apiCalls.push({ url: urlString, hasChildId });
    
    if (!hasChildId) {
      console.error('🚨 API call missing childId:', urlString);
    }
  }
  
  return originalFetch(url, options);
};

// After test, verify all calls had childId
const failedCalls = apiCalls.filter(call => !call.hasChildId);
expect(failedCalls).toHaveLength(0);
```

---

## 🚨 **Common Failure Patterns**

### **1. Selection Lost on Navigation**

**Symptom:**
```
Navigate: /challenges → /attendance
Result: selectedChildId becomes null
Error: "Please select a child" banner appears
```

**Cause:**
- Route change clears state
- localStorage not being read on page mount
- React Router doesn't preserve context

**Fix:**
```typescript
// In AuthProvider or root layout
useEffect(() => {
  // Restore from localStorage on mount
  const storedChildId = localStorage.getItem('selectedChildId');
  if (storedChildId && !selectedChildId) {
    setSelectedChildId(storedChildId);
  }
}, []);
```

---

### **2. Selection Lost on Hard Refresh**

**Symptom:**
```
Hard refresh on /attendance
Result: selectedChildId becomes null
Error: API calls fail with undefined childId
```

**Cause:**
- localStorage not read before API calls
- Race condition: API calls before state restored
- No persistence layer

**Fix:**
```typescript
// Ensure localStorage is read BEFORE making API calls
useEffect(() => {
  const storedChildId = localStorage.getItem('selectedChildId');
  
  if (storedChildId) {
    setSelectedChildId(storedChildId);
    // Then fetch data
    fetchData(storedChildId);
  }
}, []);
```

---

### **3. Undefined childId in API Calls**

**Symptom:**
```
API Request: GET /challenges?childId=undefined
Server Error: 400 Bad Request - Invalid childId
```

**Cause:**
- API call made before state initialized
- Missing null check before fetch
- No loading state

**Fix:**
```typescript
// Add guard to prevent undefined API calls
useEffect(() => {
  if (!selectedChildId) {
    console.warn('No child selected, skipping API call');
    return;
  }
  
  fetchChallenges(selectedChildId);
}, [selectedChildId]);
```

---

## 💻 **Expected Implementation**

### **1. Restore on Mount**

```typescript
// In AuthProvider or root layout
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  
  // Restore from localStorage on mount
  useEffect(() => {
    const storedChildId = localStorage.getItem('selectedChildId');
    if (storedChildId) {
      setSelectedChildId(storedChildId);
    }
  }, []);
  
  // Auto-select if only 1 child
  useEffect(() => {
    if (children.length === 1 && !selectedChildId) {
      const singleChild = children[0];
      setSelectedChildId(singleChild.id);
      localStorage.setItem('selectedChildId', singleChild.id);
    }
  }, [children, selectedChildId]);
  
  // ... rest of provider
}
```

---

### **2. Persist on Change**

```typescript
// Persist whenever selection changes
function handleChildSelect(childId: string) {
  setSelectedChildId(childId);
  localStorage.setItem('selectedChildId', childId);
}
```

---

### **3. Guard API Calls**

```typescript
// In child-dependent pages
useEffect(() => {
  // Don't fetch if no child selected
  if (!selectedChildId) return;
  
  // Fetch with selected child
  fetchChallenges(selectedChildId);
}, [selectedChildId]);
```

---

## 📊 **Test Output Example**

```
═══════════════════════════════════════════════════════════════
👶 CHILD SELECTION TESTS (P0)
═══════════════════════════════════════════════════════════════

  ✅ SEL-001: Parent with exactly 1 child auto-selects child everywhere
  ✅ SEL-002: Challenges page "Single Child View" renders correct personalized header and stats
  ✅ SEL-003: Single-child selection persists across navigation and refresh

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test SEL-003: Single-child selection persists across navigation and refresh
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Preconditions:
   Family: Family S (single-child)
   Parent: parent.s1@test.com
   Child: Ahmed (exactly 1 child)

Step 1: Navigate to /challenges
  Navigating to /challenges...
  ✅ Page loaded successfully
  ✅ Child auto-selected: Ahmed (uuid-ahmed)
  ✅ localStorage has selectedChildId: uuid-ahmed

Step 2: Navigate to /attendance
  Navigating from /challenges to /attendance...
  ✅ Page loaded successfully
  ✅ Child selection preserved: uuid-ahmed
  ✅ Same child as Step 1: ✅ Match
  ✅ No "Please select a child" prompt

Step 3: Hard refresh on /attendance
  Performing hard refresh (F5)...
  ✅ Page reloaded successfully
  ✅ localStorage restored: uuid-ahmed
  ✅ Child selection intact: uuid-ahmed
  ✅ No API calls with undefined childId

Step 4: Navigate back to /challenges
  Navigating from /attendance to /challenges...
  ✅ Page loaded successfully
  ✅ Child selection preserved: uuid-ahmed
  ✅ Same child as previous steps: ✅ Match

Step 5: Hard refresh on /challenges
  Performing hard refresh (F5)...
  ✅ Page reloaded successfully
  ✅ localStorage restored: uuid-ahmed
  ✅ Child selection intact: uuid-ahmed
  ✅ No API calls with undefined childId

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API Call Monitoring Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total API calls monitored: 12
  ✅ GET /challenges?childId=uuid-ahmed
  ✅ GET /attendance/records?childId=uuid-ahmed
  ✅ GET /attendance/records?childId=uuid-ahmed (after refresh)
  ✅ GET /challenges?childId=uuid-ahmed
  ✅ GET /challenges?childId=uuid-ahmed (after refresh)

Calls with undefined/missing childId: 0 ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEL-003 Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ SEL-003 PASSED: Single-child selection persists perfectly

Key findings:
  ✅ Selection persists across route navigation (5/5 steps)
  ✅ Selection restored after hard refresh (2/2 refreshes)
  ✅ No "undefined child" API calls (0 errors)
  ✅ No re-selection prompts shown
  ✅ Consistent UX throughout session

🎯 Persistence Excellence:
  Single-child context maintained across all navigation scenarios
  localStorage serves as reliable persistence layer
  No user action required to maintain selection
  API calls always include valid childId
```

---

## 🚨 **If Test Fails - Debugging Guide**

### **Navigation Persistence Failure**

```bash
# Check if localStorage is being read on mount
console.log('selectedChildId on mount:', localStorage.getItem('selectedChildId'));

# Check if state is being set
console.log('selectedChildId state:', selectedChildId);

# Check if routes clear state
// Add logging to useEffect in each route component
```

### **Refresh Persistence Failure**

```bash
# Check localStorage before refresh
localStorage.getItem('selectedChildId') // Should be set

# Check localStorage after refresh
localStorage.getItem('selectedChildId') // Should still be set

# Check if state is restored before API calls
// Add logging to restoration logic
```

### **Undefined childId API Calls**

```bash
# Enable fetch logging
window.fetch = new Proxy(window.fetch, {
  apply(target, thisArg, args) {
    console.log('API Call:', args[0]);
    return Reflect.apply(target, thisArg, args);
  }
});

# Check for missing guard clauses
// Ensure all API calls check selectedChildId before fetching
```

---

## 📚 **Related Tests**

| Test ID | Name | Relationship |
|---------|------|--------------|
| **SEL-001** | Single-child auto-selection | Prerequisite - sets up selection |
| **SEL-002** | Challenges page personalization | Verified with persistent selection |
| **NAV-001** | Parent nav routing | Navigation test foundation |

---

## 🎉 **Production Readiness**

With SEL-003 implemented and passing:
- ✅ **Reliable persistence** across navigation
- ✅ **No lost selection** on refresh
- ✅ **No API errors** from undefined childId
- ✅ **Consistent UX** throughout session
- ✅ **Production-ready** for iOS launch

**SEL-003 ensures that single-child selection is bulletproof and never lost!** ✅🔒👶

---

## 🔄 **Test Automation**

This test can be automated using:
- **Playwright/Cypress**: For navigation and refresh testing
- **fetch interceptors**: For monitoring API calls
- **localStorage mocks**: For testing persistence layer

```typescript
// Example Playwright test
test('SEL-003: Persistence across navigation', async ({ page }) => {
  // Login as single-child parent
  await loginAsParent(page, 'parent.s1@test.com');
  
  // Navigate to /challenges
  await page.goto('/challenges');
  const childId1 = await page.evaluate(() => localStorage.getItem('selectedChildId'));
  expect(childId1).toBeTruthy();
  
  // Navigate to /attendance
  await page.goto('/attendance');
  const childId2 = await page.evaluate(() => localStorage.getItem('selectedChildId'));
  expect(childId2).toBe(childId1);
  
  // Hard refresh
  await page.reload();
  const childId3 = await page.evaluate(() => localStorage.getItem('selectedChildId'));
  expect(childId3).toBe(childId1);
  
  // Verify no undefined API calls
  const apiCalls = await page.evaluate(() => window.apiCallLog);
  const undefinedCalls = apiCalls.filter(call => call.includes('undefined'));
  expect(undefinedCalls).toHaveLength(0);
});
```

**SEL-003 provides comprehensive coverage of navigation and persistence scenarios!** 🎯✅
