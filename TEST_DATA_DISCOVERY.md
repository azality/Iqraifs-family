# 🔍 TEST DATA DISCOVERY - User Guide

**Feature:** Automatically discover and reuse existing test families  
**Purpose:** Run tests without hitting rate limits  
**Added:** February 21, 2026  

---

## 🎯 PROBLEM SOLVED

**Before:**
```
❌ Tests skip because no test data found
❌ "Reset & Recreate" hits rate limits (429 errors)
❌ Cannot run tests after extensive testing
⏰ Must wait 1 hour for rate limit reset
```

**After:**
```
✅ Tests automatically discover existing families
✅ Reuses test data from previous runs
✅ No new signups required = no rate limits
🚀 Tests run immediately
```

---

## 🚀 HOW IT WORKS

### **Step 1: Tests Check for Data**
When you run a test (e.g., "Data Flows (P0)"), it first checks:
1. Is there test data in localStorage?
2. If not, can we discover existing test families?

### **Step 2: Auto-Discovery Process**
The system tries to login with common test credentials:
- `parent1@testfamily.com`
- `parent.a@testfamily.com`
- `test.parent@example.com`
- `parent@test.com`

With common passwords:
- `TestPassword123!`
- `Password123!`
- `TestPass123!`

### **Step 3: Fetch Family Data**
Once logged in, it fetches:
- Family details (ID, name, invite code)
- Children list
- Tests common PINs (1234, 0000, 1111, 9999)

### **Step 4: Save to localStorage**
Discovered data is saved so future tests can reuse it immediately.

---

## 🎮 HOW TO USE

### **Option 1: Automatic (Recommended)**

Just run any test! It will auto-discover if needed:

```
Purple button → "Data Flows (P0)"
Purple button → "API Security Audit (P0)"
Purple button → "Validation & Routing (P0)"
```

**What happens:**
1. Test checks for data
2. No data found → auto-discovers
3. Finds existing family → uses it
4. Tests run successfully ✅

---

### **Option 2: Manual Discovery**

Explicitly discover test data first:

```
Purple button → "Discover Test Data"
```

**Console output:**
```
🔍 Discovering existing test data...

📝 Step 1: Attempting to find existing test parent...
   ✅ Found existing test parent: parent1@testfamily.com

📝 Step 2: Fetching family data...
   ✅ Found family: Test Family A (ABC123)

📝 Step 3: Fetching children...
   ✅ Found child: Kid A1 (PIN: 1234)

📝 Step 4: Saving discovered data to localStorage...
   ✅ Test data saved to localStorage

═══════════════════════════════════════════════════════════
📊 DISCOVERED TEST DATA SUMMARY
═══════════════════════════════════════════════════════════
✅ Parent:  parent1@testfamily.com
✅ Family:  Test Family A (ABC123)
✅ Child:   Kid A1
═══════════════════════════════════════════════════════════

🎉 Complete test data discovered! Tests can now run.
```

---

## ✅ SUCCESS SCENARIOS

### **Scenario 1: You've Run Tests Before**
```
✅ Previous "Reset & Recreate" created test families
✅ Discovery finds: parent1@testfamily.com
✅ Tests run using existing family
✅ No rate limits hit
```

### **Scenario 2: You Manually Created Test User**
```
✅ You signed up with parent1@testfamily.com
✅ Discovery finds your test family
✅ Tests run successfully
```

### **Scenario 3: Fresh Database**
```
❌ No test families exist
⚠️  Discovery fails (expected)
💡 Solution: Click "Reset & Recreate"
```

---

## ⚠️ COMMON SCENARIOS

### **Discovery Found Partial Data**

**Console output:**
```
⚠️  Partial test data discovered. Some tests may be skipped.

✅ Parent:  parent1@testfamily.com
✅ Family:  Test Family A (ABC123)
⚠️  Child:   Not found
```

**What to do:**
- Tests requiring children will skip
- Tests not requiring children will run
- Optional: Add children manually or run "Reset & Recreate"

---

### **Discovery Found No Data**

**Console output:**
```
⚠️  No existing test parent found with common credentials

💡 SOLUTION:
   1. Click "Reset & Recreate" to create fresh test environment
   2. Or manually create a test parent with email: parent1@testfamily.com
```

**What to do:**
1. **If not rate-limited:** Click "Reset & Recreate"
2. **If rate-limited:** Wait 1 hour, then "Reset & Recreate"
3. **Alternative:** Manually sign up with test credentials

---

### **Rate Limited But Have Old Test Data**

**Before this feature:**
```
❌ Tests skip because localStorage was cleared
❌ "Reset & Recreate" fails with 429 errors
⏰ Must wait 1 hour
```

**With this feature:**
```
✅ Discovery finds old test families
✅ Tests run immediately
🚀 No waiting required
```

---

## 🔧 TECHNICAL DETAILS

### **What Gets Discovered**

```typescript
{
  familyA: {
    id: "uuid-123",
    code: "ABC123",
    name: "Test Family A"
  },
  parentA: {
    email: "parent1@testfamily.com",
    password: "TestPassword123!",
    userId: "uuid-456",
    token: "eyJhbGci..."
  },
  childA1: {
    id: "uuid-789",
    name: "Kid A1",
    pin: "1234"
  }
}
```

### **Where It's Stored**

```
localStorage key: 'fgs_test_environment'
```

**Structure:**
```json
{
  "timestamp": "2026-02-21T...",
  "source": "discovered",
  "familyA": {
    "familyId": "...",
    "familyName": "...",
    "inviteCode": "...",
    "parents": [...],
    "children": [...]
  }
}
```

### **Tests That Auto-Discover**

- ✅ Data Flows (P0)
- ✅ API Security Audit (P0) - Coming soon
- ✅ Validation & Routing (P0) - Coming soon
- ⏭️ Auth Audit - Not needed (uses fresh signups)
- ⏭️ System Audit - Not needed (uses fresh signups)

---

## 📋 BEST PRACTICES

### **1. Run Discovery After Rate Limiting**

```
You've been testing extensively → hit 429 errors
↓
Click "Discover Test Data"
↓
Finds old test families
↓
Resume testing immediately ✅
```

### **2. Verify Data Before Big Test Run**

```
Purple button → "Inspect localStorage"
↓
Check if test data exists
↓
If missing → "Discover Test Data"
↓
Run comprehensive test suite
```

### **3. Clear and Recreate Monthly**

```
Every 30 days:
  1. "Reset Test Environment" (clear old data)
  2. "Reset & Recreate" (create fresh families)
  3. Tests use new clean data
```

---

## 🎯 WHEN TO USE EACH BUTTON

| Button | When to Use | What It Does | Rate Limit Risk |
|--------|-------------|--------------|-----------------|
| **Discover Test Data** | After rate limits hit | Finds existing families | ❌ None |
| **Reset & Recreate** | Fresh test environment needed | Deletes + creates new | ⚠️ High |
| **Inspect localStorage** | Verify what data exists | Read-only inspection | ❌ None |
| **Reset Test Environment** | Clear old test data | Deletes only | ❌ None |

---

## 🔍 TROUBLESHOOTING

### **Issue: Discovery finds wrong family**

**Symptoms:**
```
✅ Found family: My Real Family (not a test family!)
```

**Cause:** You previously logged in with a real account

**Fix:**
1. Logout from the app
2. Click "Reset Test Environment"
3. Click "Discover Test Data" again

---

### **Issue: Discovery finds family but wrong PIN**

**Symptoms:**
```
✅ Found child: Kid A1
⚠️  Found child "Kid A1" but could not determine PIN
```

**Cause:** Child's PIN is not a common test PIN

**Fix:**
- Discovery will default to PIN "1234"
- If that doesn't work, manually set child PIN to "1234"
- Or use "Reset & Recreate" for fresh test environment

---

### **Issue: Tests still skip after discovery**

**Symptoms:**
```
⚠️  No test data available. Skipping data flow tests.
```

**Cause:** Discovery failed or returned incomplete data

**Steps to debug:**
1. Click "Inspect localStorage"
2. Check if `fgs_test_environment` exists
3. Verify it has: familyA, parentA, children
4. If incomplete → run "Reset & Recreate"

---

## 🎉 BENEFITS

### **Before This Feature:**
- ⏰ Wait 1 hour after rate limiting
- ❌ Cannot run tests after extensive testing
- 🔄 Must carefully plan test runs
- 😤 Frustrating workflow

### **After This Feature:**
- 🚀 Run tests immediately
- ✅ Reuse existing test families
- 🔄 Test → Rate limit → Discover → Test again
- 😊 Smooth workflow

---

## 📊 COMPATIBILITY

| Test Suite | Auto-Discovery | Manual Required |
|------------|----------------|-----------------|
| Data Flows (P0) | ✅ Yes | ❌ No |
| API Security (P0) | 🔄 Coming | ✅ Currently |
| Validation & Routing | 🔄 Coming | ✅ Currently |
| Auth Audit | ❌ No | ✅ Yes (needs fresh signups) |
| System Audit | ❌ No | ✅ Yes (needs fresh signups) |

---

## 🚀 EXAMPLE WORKFLOW

### **Typical Testing Session:**

```
1. Morning Testing:
   - Run "Reset & Recreate" (creates fresh test environment)
   - Run all P0 tests
   - Everything works ✅

2. Afternoon Testing:
   - Try to run tests again
   - Hit rate limits (429 errors) ❌
   
3. Use Discovery:
   - Click "Discover Test Data"
   - Finds families from morning session ✅
   - Resume testing immediately 🚀

4. Evening Testing:
   - Tests auto-discover
   - No manual intervention needed
   - Everything works ✅
```

---

## 📝 SUMMARY

**Key Points:**
- ✅ Automatically finds existing test families
- ✅ Avoids rate limits by reusing data
- ✅ Works across test sessions
- ✅ No manual credential entry
- ✅ Saves to localStorage for future use

**When to use:**
- After hitting rate limits
- When localStorage is cleared
- After browser refresh
- When tests skip due to missing data

**What it enables:**
- Continuous testing without waits
- Reliable test execution
- Better developer experience
- Faster iteration cycles

---

**Last Updated:** February 21, 2026  
**Version:** 1.0  
**Status:** ✅ Production Ready  
**Feature:** Auto-discovery of existing test families
