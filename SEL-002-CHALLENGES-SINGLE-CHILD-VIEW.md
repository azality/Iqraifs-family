# ✅ SEL-002: CHALLENGES PAGE "SINGLE CHILD VIEW" TEST (P0)

**Priority:** P0 (Critical UX)  
**Type:** Parent Mode UX - Challenges Page  
**Purpose:** Ensure Challenges page renders personalized header and stats for single-child families

---

## 🎯 **Test Purpose**

Validate that the Challenges page displays a personalized "Single Child View" when exactly one child exists in the family, with:
1. Personalized header using child's name
2. Stats scoped to that specific child
3. Action buttons that generate quests for that child only
4. No multi-child overview UI shown

---

## 📋 **Preconditions**

- **Family S** exists (single-child family)
  - Parent S1 (parent account)
  - Kid S1 (exactly ONE child - no siblings)
- Parent S1 logged in
- Child already auto-selected (SEL-001 passed)

---

## 🔍 **Test Steps**

### **Step 1: Navigate to Challenges Page**
```
Route: /challenges
Expected: Page loads with personalized single-child view
```

### **Step 2: Verify Personalized Header**
Check that page header includes child's name:

**Expected patterns:**
- ✅ `"{ChildName}'s Challenges"` (e.g., "Ahmed's Challenges")
- ✅ `"Challenges for {ChildName}"` (e.g., "Challenges for Ahmed")
- ✅ `"{ChildName} - Challenges"` (e.g., "Ahmed - Challenges")

**NOT acceptable:**
- ❌ "Challenges" (generic, no child name)
- ❌ "All Children's Challenges" (multi-child view)
- ❌ "Select a child" (should never appear)

**Check via:**
```typescript
// Look for testid attribute
const header = document.querySelector('[data-testid="challenges-header"]');
const headerText = header?.textContent || '';

// Should include child name
expect(headerText).toContain(singleChild.name);

// Examples that PASS:
// "Ahmed's Challenges" ✅
// "Challenges for Ahmed" ✅

// Examples that FAIL:
// "Challenges" ❌ (no child name)
// "All Challenges" ❌ (generic)
```

---

### **Step 3: Verify Stats Scoped to Single Child**

Check that stats (Active/Completed/Available) correspond to ONLY that child's challenges:

**Expected UI:**
```
┌─────────────────────────────────────┐
│ Ahmed's Challenges                  │
├─────────────────────────────────────┤
│ Active: 3                           │
│ Completed: 12                       │
│ Available: 5                        │
└─────────────────────────────────────┘
```

**Check via:**
```typescript
// Fetch challenges for the single child
const childChallenges = await fetch(
  `/api/challenges?childId=${singleChild.id}`,
  { headers: { Authorization: `Bearer ${parentToken}` } }
).then(r => r.json());

// Count by status
const active = childChallenges.filter(c => c.status === 'active').length;
const completed = childChallenges.filter(c => c.status === 'completed').length;
const available = childChallenges.filter(c => c.status === 'available').length;

// Verify UI matches
const activeStat = document.querySelector('[data-testid="stat-active"]');
const completedStat = document.querySelector('[data-testid="stat-completed"]');
const availableStat = document.querySelector('[data-testid="stat-available"]');

expect(activeStat?.textContent).toContain(active.toString());
expect(completedStat?.textContent).toContain(completed.toString());
expect(availableStat?.textContent).toContain(available.toString());
```

**Stats must be scoped to:**
- ✅ Only the single child's challenges
- ✅ NOT all challenges in the family
- ✅ NOT challenges across multiple children
- ✅ Exact count matches API data for that child

---

### **Step 4: Verify Action Buttons Scoped to Single Child**

Test that "Create Challenge" or "Generate Quest" buttons create challenges for ONLY that child:

**Test flow:**
```typescript
// 1. Click "Create Challenge" or similar button
const createButton = document.querySelector('[data-testid="create-challenge-btn"]');
createButton?.click();

// 2. Submit form (or trigger generation)
// ... form submission logic ...

// 3. Verify challenge was created for the SINGLE child only
const newChallenges = await fetch(
  `/api/challenges?childId=${singleChild.id}`,
  { headers: { Authorization: `Bearer ${parentToken}` } }
).then(r => r.json());

// 4. Check that new challenge is scoped to single child
const latestChallenge = newChallenges[0];
expect(latestChallenge.child_id).toBe(singleChild.id);
expect(latestChallenge.child_ids).toEqual([singleChild.id]); // if array format
```

**Expected behavior:**
- ✅ Challenge created for the single child
- ✅ Child ID matches the auto-selected child
- ✅ NO challenges created for non-existent other children
- ✅ Form may pre-select or hide child selector (only 1 child)

---

### **Step 5: Verify No Multi-Child Overview UI**

Check that NO multi-child UI elements are shown:

**Should NOT appear:**
- ❌ Child selector dropdown (when only 1 child)
- ❌ "All Children" tab or button
- ❌ Multi-child comparison view
- ❌ "Select child to view challenges" banner

**Should appear:**
- ✅ Single child view (personalized)
- ✅ Child name in header
- ✅ Stats for one child only
- ✅ Clean, focused UI

**Check via:**
```typescript
// Look for elements that indicate multi-child view
const childSelector = document.querySelector('[data-testid="child-selector"]');
const allChildrenTab = document.querySelector('[data-testid="all-children-tab"]');
const multiChildView = document.querySelector('[data-testid="multi-child-view"]');

// These should NOT exist or be hidden for single-child families
expect(childSelector).toBeNull() || expect(childSelector).toHaveStyle('display: none');
expect(allChildrenTab).toBeNull();
expect(multiChildView).toBeNull();
```

---

## ✅ **Acceptance Criteria**

1. ✅ Page header includes child name (e.g., "Ahmed's Challenges")
2. ✅ Stats (Active/Completed/Available) correspond to only that child's challenges
3. ✅ Quest generation actions create challenges/events scoped to that child only
4. ✅ No "multi-child overview" UI is shown when there is only one child
5. ✅ Page loads without errors or empty states
6. ✅ Child selector is hidden OR disabled (not needed for single-child)

---

## 🚨 **Known Pain Point**

**Why this test matters:**
> "You implemented a special UX. QA should assert page identity and correct scoping to the single child."

**The Problem:**
- Challenges page may show generic "Challenges" header (no child name)
- Stats may aggregate across all children (even with only 1)
- Action buttons may not scope to the single child
- Multi-child UI still visible (unnecessary for single-child families)

**SEL-002 Ensures:**
- Personalized, tailored UX for single-child families
- Correct data scoping (no leakage or aggregation)
- Clean UI without unnecessary multi-child controls
- Page identity is clear ("This is Ahmed's page")

---

## 💻 **Expected Implementation Patterns**

### **1. Personalized Header**

```typescript
// In Challenges page component
function ChallengesPage() {
  const { children, selectedChildId } = useAuth();
  const selectedChild = children.find(c => c.id === selectedChildId);
  
  // Single-child personalization
  const header = children.length === 1 && selectedChild
    ? `${selectedChild.name}'s Challenges`
    : 'Challenges';
  
  return (
    <div>
      <h1 data-testid="challenges-header">{header}</h1>
      {/* ... rest of page ... */}
    </div>
  );
}
```

### **2. Scoped Stats**

```typescript
// Fetch challenges for selected child only
useEffect(() => {
  if (!selectedChildId) return;
  
  fetchChallenges(selectedChildId).then(challenges => {
    const active = challenges.filter(c => c.status === 'active').length;
    const completed = challenges.filter(c => c.status === 'completed').length;
    const available = challenges.filter(c => c.status === 'available').length;
    
    setStats({ active, completed, available });
  });
}, [selectedChildId]);
```

### **3. Scoped Actions**

```typescript
// Create challenge scoped to selected child
async function handleCreateChallenge(data) {
  const challenge = {
    ...data,
    child_id: selectedChildId, // Scope to single selected child
    child_ids: [selectedChildId], // If using array format
    family_id: familyId
  };
  
  await createChallenge(challenge);
}
```

### **4. Hide Multi-Child UI**

```typescript
// Conditionally show/hide child selector
{children.length > 1 && (
  <ChildSelector
    value={selectedChildId}
    onChange={setSelectedChildId}
    children={children}
  />
)}

{/* For single child, show name as label instead */}
{children.length === 1 && (
  <span className="child-label">
    {children[0].name}
  </span>
)}
```

---

## 📊 **Test Output Example**

```
═══════════════════════════════════════════════════════════════
👶 CHILD SELECTION TESTS (P0)
═══════════════════════════════════════════════════════════════

  ✅ SEL-001 (P0): Parent with exactly 1 child auto-selects child everywhere
  ✅ SEL-002 (P0): Challenges page "Single Child View" renders correct personalized header and stats

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test SEL-002: Challenges page "Single Child View"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Navigate to /challenges
✅ Page loaded successfully

Step 2: Verify personalized header
  Header text: "Ahmed's Challenges"
  Expected pattern: "{ChildName}'s Challenges"
  ✅ Header includes child name: Ahmed

Step 3: Verify stats scoped to single child
  API: Fetching challenges for child ID: uuid-ahmed
  
  Challenge counts from API:
    Active: 3 challenges
    Completed: 12 challenges
    Available: 5 challenges
  
  UI Stats:
    Active stat element: "3"
    Completed stat element: "12"
    Available stat element: "5"
  
  ✅ All stats match API data for single child

Step 4: Verify action buttons scoped to single child
  Clicking "Create Challenge" button...
  Creating test challenge with data: { title: "Test Challenge", ... }
  
  Verifying challenge was created for single child...
  Latest challenge child_id: uuid-ahmed
  Expected child_id: uuid-ahmed
  
  ✅ Challenge created for correct child only

Step 5: Verify no multi-child overview UI
  Checking for multi-child UI elements...
  
  Child selector: Not found (hidden) ✅
  "All Children" tab: Not found ✅
  Multi-child view: Not found ✅
  
  ✅ No unnecessary multi-child UI elements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEL-002 Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ SEL-002 PASSED: Challenges page "Single Child View" works perfectly

Key findings:
  ✅ Header personalized with child name: "Ahmed's Challenges"
  ✅ Stats correctly scoped to single child (3 active, 12 completed, 5 available)
  ✅ Action buttons create challenges for single child only
  ✅ No multi-child overview UI shown
  ✅ Clean, focused UX for single-child family

🎯 UX Excellence:
  Single-child families see personalized, tailored experience
  Page identity is clear ("This is Ahmed's Challenges page")
  No unnecessary UI clutter (no child selector)
  Correct data scoping throughout
```

---

## 🚨 **If Test Fails - Action Plan**

### **Likely Causes:**

| Failure | Likely Cause | Fix |
|---------|--------------|-----|
| Generic header ("Challenges") | No personalization logic | Add `{child.name}'s Challenges` pattern |
| Stats don't match | Fetching all challenges, not scoped | Add `?childId=${selectedChildId}` to API call |
| Wrong child in created challenges | Default child_id not set | Pass `selectedChildId` in create function |
| Multi-child UI visible | No conditional rendering | Add `{children.length > 1 && ...}` wrapper |

### **Debugging Steps:**

1. **Check header rendering:**
   - Look for header element
   - Verify it contains child name
   - Check data-testid attributes

2. **Verify API calls:**
   - Open Network tab
   - Check `/challenges` endpoint
   - Confirm `?childId=...` parameter is present

3. **Test action buttons:**
   - Click "Create Challenge"
   - Check request payload
   - Verify `child_id` or `child_ids` field

4. **Inspect DOM:**
   - Look for child selector elements
   - Check if hidden via CSS or removed from DOM
   - Verify no "All Children" tabs

### **Fix Checklist:**

- [ ] Add child name to header when `children.length === 1`
- [ ] Scope API calls to `selectedChildId`
- [ ] Pass `selectedChildId` to all create/update actions
- [ ] Hide child selector when only 1 child
- [ ] Remove "All Children" view for single-child families
- [ ] Add data-testid attributes for testing

---

## 🎯 **Integration with Test Suite**

SEL-002 is part of the **Child Selection (P0)** test suite:

**Suite 26.5:** Child Selection (P0)
- SEL-001: Auto-selection verification
- SEL-002: Challenges page personalization ← **THIS TEST**

**Run Command:**
```typescript
// In Test Control Panel:
Click "Child Selection (P0)" button

// Or in Master Test Suite (Suite 26.5):
Click "Master Test Suite" button
```

---

## 📚 **Related Tests**

| Test ID | Name | Relationship |
|---------|------|--------------|
| **SEL-001** | Single-child auto-selection | Prerequisite - ensures child is selected |
| **NAV-001** | Parent nav routing | Ensures /challenges route works |
| **CHALL-001** | Challenges CRUD | Validates challenge creation logic |

---

## 🎉 **Production Readiness**

With SEL-002 implemented and passing:
- ✅ **Personalized UX** for single-child families
- ✅ **Correct data scoping** on Challenges page
- ✅ **No UI clutter** (hidden multi-child controls)
- ✅ **Clear page identity** (child name in header)
- ✅ **Production-ready** for iOS app launch

**SEL-002 ensures that the Challenges page provides a tailored, personalized experience for the majority use case (single-child families)!** ✅📊👶

---

## 📝 **Implementation Status**

**Current Status:** ⚠️ PARTIALLY IMPLEMENTED

The test file `/src/app/tests/test-child-selection-p0.ts` currently contains SEL-002, but it's a duplicate of SEL-001 logic. A proper implementation should:

1. ✅ Reuse child selection logic from SEL-001
2. 🔄 Add specific Challenges page header check
3. 🔄 Add stats verification logic
4. 🔄 Add action button scoping test
5. 🔄 Add multi-child UI absence check

**Recommended Implementation:**
Create helper functions for the specific SEL-002 checks and add them after SEL-001 completes successfully.

**Next Steps:**
1. Refactor SEL-002 to be distinct from SEL-001
2. Add DOM inspection helpers for header/stats
3. Add API verification for created challenges
4. Add multi-child UI absence checks
5. Test with real Challenges page component
