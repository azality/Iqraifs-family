# 🧪 P0 Test Execution Guide - INTERACTIVE

**Quick Start:** Follow these steps to execute all P0 tests in ~30 minutes.

---

## 🚀 Setup (5 minutes)

### **Step 1: Start Your Development Environment**

```bash
# Terminal 1: Start frontend
npm run dev

# Terminal 2: Ensure Supabase functions are running
supabase functions serve
```

### **Step 2: Load Test Scripts**

1. Open your app in browser: `http://localhost:5173`
2. Open browser DevTools (F12)
3. Go to Console tab
4. Run this command to load test utilities:

```javascript
// Import test runner and helpers
import('/src/tests/p0-test-runner.ts');
import('/src/tests/test-helpers.ts');
```

✅ **You should see:**
```
✅ P0 Test Runner loaded!
✅ Test helpers loaded!
```

---

## 📋 Test Preparation (10 minutes)

### **Step 3: Create Test Data**

#### **3a. Create Family A (Your Primary Test Family)**

```javascript
// Login as parent first (use the UI)
// Then in console:

const familyA = await testHelpers.setupTestFamily('Family A - Test');
console.log('Family A ID:', familyA.id);

// Create 2 children in Family A
const childA1 = await testHelpers.setupTestChild(familyA.id, 'Alice', '1111');
const childA2 = await testHelpers.setupTestChild(familyA.id, 'Ahmed', '2222');

console.log('Child A1 ID:', childA1.id);
console.log('Child A2 ID:', childA2.id);

// Save these IDs - you'll need them!
window.testConfig = {
  familyAId: familyA.id,
  childA1Id: childA1.id,
  childA2Id: childA2.id
};
```

#### **3b. Create Family B (For Cross-Family Tests)**

**Important:** Log out and create a NEW parent account for Family B.

1. Click "Sign Out" in the UI
2. Go to `/signup`
3. Create a new account with different email
4. After login, create Family B:

```javascript
const familyB = await testHelpers.setupTestFamily('Family B - Test');
const childB1 = await testHelpers.setupTestChild(familyB.id, 'Bilal', '3333');

console.log('Family B ID:', familyB.id);
console.log('Child B ID:', childB1.id);

// Save these IDs
window.testConfig.familyBId = familyB.id;
window.testConfig.childB1Id = childB1.id;
```

#### **3c. Log Back in as Family A**

Log out from Family B, then log back in with Family A credentials.

---

## 🧪 Execute P0 Tests (15 minutes)

### **Step 4: Run Automated Test Suite**

```javascript
// Make sure you're logged in as Family A parent
// Then run the full test suite:

const results = await runP0Tests({
  familyAId: window.testConfig.familyAId,
  familyBId: window.testConfig.familyBId,
  familyBChildId: window.testConfig.childB1Id,
  childId: window.testConfig.childA1Id
});

// View summary
console.log(`
  ✅ PASSED:  ${results.passed}
  ❌ FAILED:  ${results.failed}
  ⏭️  SKIPPED: ${results.skipped}
  ⏱️  TIME:    ${results.duration}ms
`);
```

### **Step 5: Review Results**

Check the console output for:
- ✅ Green checkmarks = PASS
- ❌ Red X's = FAIL
- ⏭️ Gray arrows = SKIPPED (need manual testing)

**Expected Results:**
- Most tests should PASS ✅
- Some tests will SKIP (manual testing required)
- Rate limit tests might FAIL if rate limiting is not configured

---

## 🔍 Manual Testing (Additional tests that require UI interaction)

### **Test M1: Frontend Route Protection**

**Test:** Unauthenticated access to parent routes

1. Open new incognito window
2. Navigate to `http://localhost:5173/settings`
3. **Expected:** Should redirect to `/login`
4. Check console for: `"🔒 ProtectedRoute - No session, redirecting to login"`

✅ **PASS** if redirected  
❌ **FAIL** if dashboard loads

---

### **Test M2: Kid Login Route Protection**

**Test:** Unauthenticated access to kid routes

1. In incognito window, navigate to `http://localhost:5173/kid/home`
2. **Expected:** Should redirect to `/kid/login`
3. Check console for: `"❌ RequireKidAuth: Not in kid mode, redirecting to /kid/login"`

✅ **PASS** if redirected  
❌ **FAIL** if kid dashboard loads

---

### **Test M3: Session Persistence After Refresh**

**Test:** Session survives page reload

1. Log in as parent (Family A)
2. Navigate to `/settings`
3. Press **F5** (hard refresh)
4. **Expected:** Should stay on `/settings`, NOT redirect to login
5. Check console for: `"🔄 Refreshing session before loading family data..."`

✅ **PASS** if no redirect  
❌ **FAIL** if redirected to login

---

### **Test M4: Kid PIN Rate Limiting**

**Test:** Account locks after 3 failed PIN attempts

1. Go to `/kid-login-new`
2. Enter valid family code (Family A's code)
3. Select a child (Alice)
4. Enter **WRONG PIN** 3 times
5. **Expected:** 
   - After 3rd attempt: "Too many failed attempts. Please try again later."
   - Lockout message: "Locked for 15 minutes"
6. Try entering correct PIN
7. **Expected:** Should still be blocked

✅ **PASS** if locked after 3 attempts  
❌ **FAIL** if can retry indefinitely

---

### **Test M5: Points Display Update**

**Test:** Points update in real-time

1. Log in as parent
2. Navigate to `/log`
3. Note child's current points (e.g., 50 points)
4. Log +10 points for "Prayer"
5. **Expected:** 
   - Points update to 60
   - Audit trail shows new event
   - Toast notification: "Points logged successfully"

✅ **PASS** if points update correctly  
❌ **FAIL** if points don't update or wrong amount

---

## 🧮 Quick Verification Tests

### **Quick Test 1: Points Math**

```javascript
// Test addition and subtraction
await testHelpers.quickTest(window.testConfig.childA1Id);
```

**Expected Output:**
```
✅ Points Addition
✅ Points Subtraction
✅ Session Persistence

🎉 All quick tests passed!
```

---

### **Quick Test 2: Session Inspection**

```javascript
// View current session state
await testHelpers.inspectSession();
```

**Expected Output:**
```
📋 Supabase Session:
  User ID: user_xxx
  Email: yourtest@email.com
  Token: eyJhbGciOiJIUzI1NiIsInR5cCI6...
  Expires: [future date]
  Error: None

📋 LocalStorage:
  user_mode: parent
  user_role: parent
  fgs_family_id: family:xxx
  kid_access_token: None
  kid_id: null
```

---

### **Quick Test 3: Cross-Family Access**

```javascript
// Try to access Family B's data while logged in as Family A
await testHelpers.testCrossFamilyAccess(window.testConfig.familyBId);
```

**Expected Output:**
```
✅ Access correctly blocked (403)
  Error: Access denied to this family
```

---

## 📊 Test Scorecard

Record your results here:

### **Automated Tests**

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| P0-1.1 | Unauth Parent Access | ⬜ | |
| P0-1.2 | Invalid JWT Rejection | ⬜ | |
| P0-1.3 | Kid Token on Parent Endpoint | ⬜ | |
| P0-2.1 | Cross-Family API Access | ⬜ | |
| P0-2.2 | Cross-Child Access | ⬜ | |
| P0-3.1 | Session Persistence | ⬜ | |
| P0-3.2 | Token Auto-Refresh | ⬜ | |
| P0-4.1 | Points Addition | ⬜ | |
| P0-4.2 | Points Subtraction | ⬜ | |
| P0-5.2 | Event Spam Prevention | ⬜ | |

### **Manual Tests**

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| M1 | Frontend Route Protection | ⬜ | |
| M2 | Kid Login Protection | ⬜ | |
| M3 | Session After Refresh | ⬜ | |
| M4 | Kid PIN Rate Limiting | ⬜ | |
| M5 | Points Display Update | ⬜ | |

**Legend:**
- ⬜ PENDING
- ✅ PASS
- ❌ FAIL

---

## 🔧 Troubleshooting

### **"Test helpers not loaded"**

**Solution:**
```javascript
// Re-import the modules
import('/src/tests/p0-test-runner.ts');
import('/src/tests/test-helpers.ts');
```

---

### **"Not logged in" errors**

**Solution:**
1. Check session: `await testHelpers.inspectSession()`
2. If no session, log in via UI first
3. Re-run tests

---

### **"Child ID not provided" skips**

**Solution:**
Make sure you've set up `window.testConfig`:
```javascript
window.testConfig = {
  familyAId: 'family:xxx',
  familyBId: 'family:yyy',
  childA1Id: 'child:aaa',
  childB1Id: 'child:bbb'
};
```

---

### **Rate limit tests failing**

**Solution:**
1. Check backend logs for rate limit messages
2. Verify `rateLimit.tsx` is properly configured
3. Try manual rate limit test:
```javascript
await testHelpers.testRateLimit('point-events', 35, window.testConfig.childA1Id);
```

---

## ✅ Success Criteria

**✅ PASS Gate RG-0.3 if:**

1. **Automated Tests:** ≥ 8/10 tests PASS (80%+)
2. **Manual Tests:** 5/5 tests PASS (100%)
3. **No Critical Failures:** Zero security bypass vulnerabilities
4. **Points Math:** 100% accuracy (no rounding errors)

**Current Status:** ⬜ Not Started

---

## 📝 Next Steps After Testing

### **If All Tests Pass ✅**

1. Mark RG-0.3 as **PASSED**
2. Proceed to performance testing
3. Begin beta family recruitment
4. Plan production deployment

### **If Tests Fail ❌**

1. Record failure details in scorecard
2. Create GitHub issues for each failure
3. Fix issues immediately (P0 = blocker)
4. Re-run failed tests
5. Do NOT proceed to production until 100% pass

---

## 🎯 Quick Commands Reference

```javascript
// Setup
const family = await testHelpers.setupTestFamily('Test Family');
const child = await testHelpers.setupTestChild(family.id, 'Test', '1234');

// Inspection
await testHelpers.inspectSession();
await testHelpers.inspectFamily('family:xxx');
await testHelpers.inspectChild('child:xxx');
await testHelpers.inspectChildEvents('child:xxx');

// Testing
await testHelpers.quickTest('child:xxx');
await testHelpers.testAddPoints('child:xxx', 10, 'Test');
await testHelpers.testCrossFamilyAccess('family:yyy');
await testHelpers.testRateLimit('point-events', 35, 'child:xxx');

// Full Test Suite
await runP0Tests({ childId: 'child:xxx', familyBId: 'family:yyy' });

// Cleanup
await testHelpers.cleanupTestEvents('child:xxx');
testHelpers.clearAllSessions();
```

---

## 📞 Support

If you encounter issues:
1. Check console for error messages
2. Review `/P0_TEST_EXECUTION.md` for detailed test definitions
3. Review `/SYSTEM_ARCHITECTURE.md` for system details
4. Check backend logs in Supabase Functions dashboard

---

**⏱️ Estimated Total Time:** 30-40 minutes  
**🎯 Goal:** 100% P0 test pass rate  
**🚀 Let's execute these tests!**
