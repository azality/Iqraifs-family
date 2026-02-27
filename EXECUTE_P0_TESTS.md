# 🚀 EXECUTE P0 TESTS NOW

**This guide will walk you through executing P0 tests RIGHT NOW.**  
**Follow these steps in order. Total time: ~30 minutes.**

---

## ✅ PRE-FLIGHT CHECKLIST

Before starting, ensure:
- [ ] Development server is running (`npm run dev`)
- [ ] Supabase functions are running (backend is up)
- [ ] You have admin access to create test families
- [ ] Browser console is open (F12)

---

## 🎬 STEP 1: START YOUR APP (2 minutes)

### 1.1 Start Development Server

```bash
npm run dev
```

Wait for:
```
VITE v5.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
```

### 1.2 Open Browser

Navigate to: `http://localhost:5173`

### 1.3 Open Console

- **Windows/Linux:** Press `F12`
- **Mac:** Press `Cmd + Option + I`
- Click the **Console** tab

### 1.4 Verify Test Suite Loaded

You should see in console:
```
🧪 P0 Test Suite available! Run: loadTestSuite()
```

If not visible, run manually:
```javascript
loadTestSuite()
```

---

## 🏗️ STEP 2: CREATE TEST DATA (10 minutes)

### 2.1 Create Parent Account A

1. Click **"Get Started"** or navigate to `/signup`
2. Sign up with:
   - Email: `test-parent-a@example.com`
   - Password: `TestPassword123!`
3. Complete onboarding:
   - Family name: `Family A Test`
   - Add yourself as parent

### 2.2 Create Test Children for Family A

In browser console:

```javascript
// Create two test children
const child1 = await testHelpers.setupTestChild(
  localStorage.getItem('fgs_family_id'), 
  'Alice', 
  '1111'
);

const child2 = await testHelpers.setupTestChild(
  localStorage.getItem('fgs_family_id'), 
  'Ahmed', 
  '2222'
);

// Save test configuration
window.testConfig = {
  familyAId: localStorage.getItem('fgs_family_id'),
  childA1Id: child1.id,
  childA2Id: child2.id
};

console.log('✅ Family A setup complete!');
console.log('📋 Test Config:', window.testConfig);
```

**Expected Output:**
```
✅ Child created: { id: "child:xxx", name: "Alice", ... }
✅ Child created: { id: "child:yyy", name: "Ahmed", ... }
✅ Family A setup complete!
📋 Test Config: { familyAId: "family:xxx", childA1Id: "child:xxx", ... }
```

### 2.3 Create Parent Account B

**IMPORTANT:** You need a second family for cross-family access tests.

1. **Sign out** from Family A (click profile → Sign Out)
2. **Sign up** with new account:
   - Email: `test-parent-b@example.com`
   - Password: `TestPassword123!`
3. Complete onboarding:
   - Family name: `Family B Test`

### 2.4 Create Test Child for Family B

In browser console:

```javascript
// Reload test suite first (since you logged out)
await loadTestSuite();

// Create child for Family B
const childB = await testHelpers.setupTestChild(
  localStorage.getItem('fgs_family_id'), 
  'Bilal', 
  '3333'
);

// Update test config
window.testConfig = {
  ...window.testConfig,
  familyBId: localStorage.getItem('fgs_family_id'),
  childB1Id: childB.id
};

console.log('✅ Family B setup complete!');
console.log('📋 Full Test Config:', window.testConfig);
```

### 2.5 Switch Back to Family A

1. **Sign out** from Family B
2. **Login** as Family A (`test-parent-a@example.com`)
3. Wait for dashboard to load

In console, restore test config:

```javascript
// Restore test config (copy values from Step 2.4)
window.testConfig = {
  familyAId: 'family:YOUR_FAMILY_A_ID',  // Replace with actual ID
  familyBId: 'family:YOUR_FAMILY_B_ID',  // Replace with actual ID
  childA1Id: 'child:YOUR_ALICE_ID',      // Replace with actual ID
  childA2Id: 'child:YOUR_AHMED_ID',      // Replace with actual ID
  childB1Id: 'child:YOUR_BILAL_ID'       // Replace with actual ID
};

console.log('✅ Test config restored:', window.testConfig);
```

---

## 🧪 STEP 3: RUN AUTOMATED TESTS (15 minutes)

### 3.1 Run Full P0 Test Suite

In browser console:

```javascript
// Run all P0 tests
const results = await runP0Tests({
  familyAId: window.testConfig.familyAId,
  familyBId: window.testConfig.familyBId,
  familyBChildId: window.testConfig.childB1Id,
  childId: window.testConfig.childA1Id
});

// View summary
console.log(`
🧪 ========================================
🧪 P0 TEST RESULTS
🧪 ========================================

✅ PASSED:  ${results.passed}
❌ FAILED:  ${results.failed}
⏭️  SKIPPED: ${results.skipped}
📊 TOTAL:   ${results.total}
⏱️  TIME:    ${results.duration}ms

${results.failed === 0 && results.passed > 0 ? '🎉 ALL TESTS PASSED! 🎉' : '⚠️  REVIEW FAILURES ABOVE'}
`);
```

**Expected Output:**
```
🧪 ========================================
🧪 P0 AUTOMATED TEST SUITE
🧪 ========================================

📋 P0-1: AUTH BYPASS PREVENTION

✅ Unauthenticated Parent Route Access: Protected endpoint correctly rejected...
✅ Invalid JWT Rejection: Invalid JWT correctly rejected
✅ Kid Token on Parent Endpoint: Kid token correctly blocked...

📋 P0-2: CROSS-FAMILY ACCESS PREVENTION

✅ Cross-Family API Access Prevention: Cross-family access correctly blocked
✅ Cross-Family Child Access Prevention: Cross-child access correctly blocked

📋 P0-3: TOKEN PERSISTENCE & REFRESH

✅ Session Persistence After Refresh: Session persisted correctly
✅ Token Auto-Refresh: Session refresh successful

📋 P0-4: POINTS MATH INTEGRITY

✅ Positive Points Addition: 10 + 10 = 20 ✓
✅ Negative Points Subtraction: 20 - 5 = 15 ✓

📋 P0-5: RATE LIMITING

⏭️ Kid PIN Rate Limiting: Manual test required
✅ Event Spam Prevention: Rate limit triggered: 30 succeeded, 5 blocked

🧪 ========================================
🧪 TEST SUMMARY
🧪 ========================================

✅ PASSED:  8
❌ FAILED:  0
⏭️  SKIPPED: 1
⏱️  TIME:    3524ms

🎉 ALL TESTS PASSED! 🎉
```

### 3.2 Run Quick Tests (Alternative)

If you want a faster test:

```javascript
await testHelpers.quickTest(window.testConfig.childA1Id);
```

**Expected:**
```
⚡ Running quick P0 tests...

Test 1: Points Addition
  Before: 15 points
  After: 25 points
  Change: 10 (expected: 10)
✅ Math correct!

Test 2: Points Subtraction
  Before: 25 points
  After: 20 points
  Change: -5 (expected: -5)
✅ Math correct!

Test 3: Session Persistence
✅ Session persists

📊 Quick Test Summary:
  ✅ Points Addition
  ✅ Points Subtraction
  ✅ Session Persistence

🎉 All quick tests passed!
```

---

## 🧪 STEP 4: MANUAL VERIFICATION TESTS (5 minutes)

These tests cannot be automated and require manual interaction.

### Test 4.1: Route Protection

1. **Open Incognito/Private Window**
2. Navigate to: `http://localhost:5173/settings`
3. **Expected:** Should redirect to `/login`
4. **Result:** ✅ PASS / ❌ FAIL

### Test 4.2: Session Persistence

1. Login as parent (regular window)
2. Navigate to `/settings`
3. Press **F5** (hard refresh)
4. **Expected:** Should stay on `/settings` (no redirect)
5. **Result:** ✅ PASS / ❌ FAIL

### Test 4.3: Kid PIN Lockout

1. Navigate to `/kid-login-new`
2. Enter Family A's invite code
3. Select Alice
4. Enter **WRONG PIN** 5 times
5. **Expected:** After 3 failures, should show "Too many attempts" error
6. **Result:** ✅ PASS / ❌ FAIL

In console, verify lockout:

```javascript
// This should show locked status
// Note: Backend logs will show PIN lockout details
```

### Test 4.4: Cross-Family Access

In console:

```javascript
// Try to access Family B's data while logged in as Family A
await testHelpers.testCrossFamilyAccess(window.testConfig.familyBId);
```

**Expected:**
```
✅ Access correctly blocked (403)
  Error: Access denied to this family
```

---

## 📊 STEP 5: RECORD RESULTS

### 5.1 View Detailed Results

```javascript
// View all test results
console.table(window.p0TestResults);
```

### 5.2 Save Results

```javascript
// Copy results to clipboard
copy(JSON.stringify({
  summary: {
    passed: results.passed,
    failed: results.failed,
    skipped: results.skipped,
    total: results.total,
    duration: results.duration
  },
  details: results.results
}, null, 2));

console.log('✅ Results copied to clipboard!');
```

Paste into `/P0_TESTING_COMPLETE_CHECKLIST.md`

---

## ✅ SUCCESS CRITERIA

### **Production Ready If:**

- ✅ **Automated Tests:** 8+ PASS (≥80% pass rate)
- ✅ **Manual Tests:** 4/4 PASS (100%)
- ✅ **Points Math:** 100% accurate
- ✅ **Security:** No auth bypass or cross-family access
- ✅ **Rate Limiting:** PIN lockout works

### **Your Results:**

| Category | Target | Actual | Status |
|----------|--------|--------|--------|
| Automated Tests | ≥8 PASS | _____ | ⬜ |
| Manual Tests | 4 PASS | _____ | ⬜ |
| Points Math | 100% | _____ | ⬜ |
| Security Tests | PASS | _____ | ⬜ |
| Rate Limiting | PASS | _____ | ⬜ |

---

## 🆘 TROUBLESHOOTING

### Issue: "testHelpers is not defined"

**Solution:**
```javascript
await loadTestSuite();
```

### Issue: "Not logged in" errors

**Solution:**
```javascript
// Check session status
await testHelpers.inspectSession();

// If no session, login via UI
```

### Issue: Tests are skipped

**Solution:**
```javascript
// Verify testConfig has all IDs
console.log(window.testConfig);

// Should show: familyAId, familyBId, childA1Id, childB1Id
// If missing, recreate config from Step 2.5
```

### Issue: Import errors

**Solution:**
```javascript
// Clear cache and reload
window.location.reload(true);

// Then reload test suite
await loadTestSuite();
```

### Issue: Rate limit test fails

**Solution:**
```javascript
// Skip rate limit test (it's destructive)
const results = await runP0Tests({
  ...window.testConfig,
  skipRateLimit: true
});
```

---

## 🧹 CLEANUP (After Testing)

### Option 1: Keep Test Data
Leave test families for future testing.

### Option 2: Clean Up Test Events

```javascript
// Remove test events from children
await testHelpers.cleanupTestEvents(window.testConfig.childA1Id);
await testHelpers.cleanupTestEvents(window.testConfig.childA2Id);
```

### Option 3: Full Reset

```javascript
// Sign out and clear all sessions
testHelpers.clearAllSessions();

// Then manually delete test families from Supabase dashboard
```

---

## 📋 FINAL CHECKLIST

Before marking P0 tests as complete:

- [ ] Automated test suite executed
- [ ] Results recorded (≥8 PASS)
- [ ] Manual tests completed (4/4 PASS)
- [ ] Points math verified (100% accurate)
- [ ] Security tests passed (no bypass)
- [ ] Rate limiting confirmed
- [ ] Results documented in checklist
- [ ] Screenshots saved (optional)
- [ ] No critical failures

---

## 🎉 CONGRATULATIONS!

If all tests passed, your Family Growth System is **PRODUCTION READY** for P0 criteria!

### Next Steps:

1. ✅ Mark RG-0.3 as **PASS** in `/RELEASE_GATE_AUDIT.md`
2. ✅ Proceed to **RG-0.4** (Performance & Accessibility)
3. ✅ Begin beta testing with real families

---

## 📚 Additional Resources

- **`/P0_QUICK_START.md`** - Simplified quick start guide
- **`/TEST_EXECUTION_GUIDE.md`** - Comprehensive test documentation
- **`/P0_TEST_EXECUTION.md`** - Detailed test case definitions
- **`/P0_TESTING_COMPLETE_CHECKLIST.md`** - Results tracking

---

**Good luck! You've got this! 🚀**

*Last updated: February 20, 2026*
