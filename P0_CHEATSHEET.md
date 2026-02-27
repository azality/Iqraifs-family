# 🧪 P0 Testing Cheatsheet

**Quick reference for P0 test execution.**

---

## ⚡ 60-Second Setup

```bash
# 1. Start app
npm run dev

# 2. Open http://localhost:5173
# 3. Press F12 (console)
# 4. Run:
loadTestSuite()
```

---

## 🎯 Essential Commands

### **Setup Test Data**
```javascript
// Login as parent first, then:
const familyId = localStorage.getItem('fgs_family_id');
const child = await testHelpers.setupTestChild(familyId, 'Alice', '1111');

window.testConfig = {
  familyAId: familyId,
  childA1Id: child.id
};
```

### **Run Tests**
```javascript
// Quick test (3 tests)
await testHelpers.quickTest(window.testConfig.childA1Id);

// Full test suite (10 tests)
await runP0Tests({ childId: window.testConfig.childA1Id });
```

### **View Results**
```javascript
// Summary
console.log(results);

// Detailed table
console.table(window.p0TestResults);

// Copy to clipboard
copy(JSON.stringify(results, null, 2));
```

---

## 📊 Test Coverage

| Category | Tests | Command |
|----------|-------|---------|
| Auth Bypass | 3 | Auto (included) |
| Cross-Family | 2 | Need Family B IDs |
| Token Persist | 2 | Auto (included) |
| Points Math | 2 | Auto (included) |
| Rate Limit | 2 | 1 auto, 1 manual |

**Minimum:** 6 tests PASS (without Family B)  
**Full:** 10 tests PASS (with Family B)

---

## ✅ Success Criteria

```javascript
// Production ready if:
results.passed >= 8     // ✅ 80%+ pass rate
results.failed === 0    // ✅ No failures
pointsMathCorrect       // ✅ 100% accurate
```

---

## 🔧 Helper Functions

```javascript
// Inspection
await testHelpers.inspectSession();
await testHelpers.inspectChild('child:xxx');
await testHelpers.inspectChildEvents('child:xxx');

// Testing
await testHelpers.testAddPoints('child:xxx', 10, 'Test');
await testHelpers.testCrossFamilyAccess('family:yyy');
await testHelpers.testRateLimit('point-events', 35, 'child:xxx');

// Cleanup
testHelpers.clearAllSessions();
```

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| `loadTestSuite not defined` | Refresh page |
| `testHelpers not defined` | Run `loadTestSuite()` |
| `Not logged in` errors | Login via UI first |
| Tests show `SKIP` | Add missing IDs to `testConfig` |

---

## 📚 Full Docs

- **`/START_TESTING_NOW.md`** - 3-step instant start
- **`/EXECUTE_P0_TESTS.md`** - Complete guide
- **`/P0_QUICK_START.md`** - 30-min walkthrough

---

## 🎯 Copy/Paste Test Flow

```javascript
// === FULL TEST FLOW (Copy this entire block) ===

// 1. Setup (after login)
const familyId = localStorage.getItem('fgs_family_id');
const child1 = await testHelpers.setupTestChild(familyId, 'Alice', '1111');

window.testConfig = {
  familyAId: familyId,
  childA1Id: child1.id
};

// 2. Run tests
const results = await runP0Tests({
  childId: window.testConfig.childA1Id
});

// 3. Show results
console.log(`
🎯 RESULTS:
✅ Passed:  ${results.passed}
❌ Failed:  ${results.failed}
⏭️  Skipped: ${results.skipped}
⏱️  Time:    ${results.duration}ms

${results.failed === 0 ? '🎉 ALL TESTS PASSED!' : '⚠️ Review failures above'}
`);

// 4. View details
console.table(window.p0TestResults);
```

---

## 🎉 You're Ready!

**Time to execute:** ~5-10 minutes  
**Tests to pass:** ≥6 (minimum) or 10 (full)  
**Next step:** Open `/START_TESTING_NOW.md`

**GO! 🚀**
