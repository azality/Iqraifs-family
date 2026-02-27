# 🚀 P0 Testing - Quick Start

**Execute P0 tests in 3 simple steps. Total time: ~30 minutes.**

---

## ⚡ Step 1: Load Test Suite (2 minutes)

1. **Start your app:**
   ```bash
   npm run dev
   ```

2. **Open browser console:**
   - Navigate to `http://localhost:5173`
   - Press **F12** (or Cmd+Option+I on Mac)
   - Click **Console** tab

3. **Load test scripts:**
   ```javascript
   import('/src/app/utils/loadTestSuite.ts').then(m => m.loadTestSuite())
   ```

4. **Verify:**
   ```
   ✅ Test runner loaded
   ✅ Test helpers loaded
   ✅ Test suite ready!
   ```

---

## 🎯 Step 2: Setup Test Data (10 minutes)

### **2a. Create Family A**

Login as parent, then in console:

```javascript
// Create family and children
const familyA = await testHelpers.setupTestFamily('Family A Test');
const child1 = await testHelpers.setupTestChild(familyA.id, 'Alice', '1111');
const child2 = await testHelpers.setupTestChild(familyA.id, 'Ahmed', '2222');

// Save IDs
window.testConfig = {
  familyAId: familyA.id,
  childA1Id: child1.id,
  childA2Id: child2.id
};

console.log('✅ Family A setup complete!');
console.log('Family ID:', familyA.id);
console.log('Child 1 ID:', child1.id);
```

### **2b. Create Family B**

**Important:** Sign out and create NEW parent account.

```javascript
// After logging in with new account
const familyB = await testHelpers.setupTestFamily('Family B Test');
const childB = await testHelpers.setupTestChild(familyB.id, 'Bilal', '3333');

window.testConfig.familyBId = familyB.id;
window.testConfig.childB1Id = childB.id;

console.log('✅ Family B setup complete!');
```

### **2c. Log back in as Family A**

Sign out from Family B, log back in with Family A credentials.

---

## 🧪 Step 3: Run Tests (15 minutes)

### **3a. Automated Tests**

```javascript
// Run full automated test suite
const results = await runP0Tests({
  familyAId: window.testConfig.familyAId,
  familyBId: window.testConfig.familyBId,
  familyBChildId: window.testConfig.childB1Id,
  childId: window.testConfig.childA1Id
});

// View results
console.log(`
✅ PASSED:  ${results.passed}
❌ FAILED:  ${results.failed}
⏭️  SKIPPED: ${results.skipped}
⏱️  TIME:    ${results.duration}ms
`);
```

**Expected:** Most tests should PASS ✅

---

### **3b. Quick Manual Tests**

**Test 1: Route Protection**
- Open incognito window
- Go to `http://localhost:5173/settings`
- **Should redirect to `/login`** ✅

**Test 2: Session Persistence**
- Login as parent
- Press **F5** to refresh
- **Should stay on same page (no redirect)** ✅

**Test 3: Points Math**
```javascript
await testHelpers.quickTest(window.testConfig.childA1Id);
```
- **All 3 tests should PASS** ✅

---

## ✅ Success Criteria

**You're ready for production if:**

- ✅ Automated tests: **≥80% pass rate** (8+ out of 10)
- ✅ Manual tests: **100% pass** (all 3)
- ✅ No critical failures (auth, security)
- ✅ Points math: **100% accurate**

---

## 🆘 Troubleshooting

### **"Test helpers not loaded"**
```javascript
// Reload the test suite
import('/src/app/utils/loadTestSuite.ts').then(m => m.loadTestSuite())
```

### **"Not logged in" errors**
```javascript
// Check your session
await testHelpers.inspectSession();
// If no session, login via UI first
```

### **Tests are skipped**
Make sure `window.testConfig` has all IDs:
```javascript
console.log(window.testConfig);
// Should show familyAId, familyBId, childA1Id, childB1Id
```

---

## 📚 Full Documentation

For comprehensive test details, see:
- **`/TEST_EXECUTION_GUIDE.md`** - Complete test procedures
- **`/P0_TEST_EXECUTION.md`** - Detailed test definitions
- **`/P0_TESTING_COMPLETE_CHECKLIST.md`** - Tracking checklist

---

## 🎯 Quick Commands Cheatsheet

```javascript
// Setup
await testHelpers.setupTestFamily('Name');
await testHelpers.setupTestChild(familyId, 'Name', 'PIN');

// Inspection
await testHelpers.inspectSession();
await testHelpers.inspectChild('child:xxx');

// Testing
await runP0Tests({ childId: 'child:xxx', familyBId: 'family:yyy' });
await testHelpers.quickTest('child:xxx');
await testHelpers.testAddPoints('child:xxx', 10, 'Test');
await testHelpers.testCrossFamilyAccess('family:yyy');

// Cleanup
testHelpers.clearAllSessions();
```

---

## 🎉 You're Ready!

Follow the 3 steps above and you'll complete P0 testing in ~30 minutes.

**Good luck! 🚀**
