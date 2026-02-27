# 🎯 START HERE - Test Environment Setup

**Complete test data setup in 3 commands**

---

## 🚀 **Step 1: Refresh Browser**

```
Press F5 (or Cmd+R on Mac)
Wait 3 seconds
```

Look for this in console:
```
✅ Test suite ready!
```

✅ If you see this, proceed to Step 2.

❌ If NOT, try: `loadTestSuite()` and wait for it to complete.

---

## 🚀 **Step 2: Create Test Families**

Copy-paste into browser console:

```javascript
await setupTestEnvironment()
```

**Expected output:**
```
📋 Creating Test Family A...
  ✅ Parent created
  ✅ Family created: family:xxx
  ✅ Invite code: ABC123
  ✅ Child created: Kid A1 (PIN: 1111)
  ✅ Child created: Kid A2 (PIN: 2222)
  ✅ Second parent joined
✅ Test Family A complete!

📋 Creating Test Family B...
  ✅ Parent created
  ✅ Family created: family:yyy
  ✅ Invite code: DEF456
  ✅ Child created: Kid B1 (PIN: 3333)
✅ Test Family B complete!

🎉 TEST ENVIRONMENT READY!
```

---

## 🚀 **Step 3: Verify Everything Works**

Copy-paste into browser console:

```javascript
await auditTestEnvironment()
```

**Expected output:**
```
✅ [TD-1.1] Invite Code Mapping - Family A
✅ [TD-1.1] Invite Code Mapping - Family B
✅ [TD-1.1] Invite Code Uniqueness
✅ [TD-1.1] PIN Hashing - Kid A1
✅ [TD-1.1] PIN Hashing - Kid A2
✅ [TD-1.1] PIN Hashing - Kid B1
✅ [TD-1.1] Family Structure - Family A
✅ [TD-1.1] Family Structure - Family B
✅ [Security] Cross-Family Isolation
✅ [Integrity] Data Integrity - Family A
✅ [Integrity] Data Integrity - Family B

🔍 AUDIT SUMMARY
✅ PASSED:   11
❌ FAILED:   0
⚠️  WARNINGS: 0

🎉 ALL AUDIT CHECKS PASSED!
```

---

## ✅ **Done!**

You now have:

- ✅ **Family A**: 2 parents + 2 kids
- ✅ **Family B**: 1 parent + 1 kid
- ✅ **Unique invite codes** for each family
- ✅ **Hashed PINs** (SHA-256, not exposed)
- ✅ **Verified security** (cross-family isolation working)

---

## 📋 **Get Your Credentials**

```javascript
printTestCredentials()
```

**Output:**
```
🔑 TEST CREDENTIALS

📧 FAMILY A:
   Invite Code: ABC123
   Parent A1:
     Email: parent-a1@fgs-test.com
     Password: TestPassword123!
   Kid A1: PIN 1111
   Kid A2: PIN 2222

📧 FAMILY B:
   Invite Code: DEF456
   Parent B1:
     Email: parent-b1@fgs-test.com
     Password: TestPassword123!
   Kid B1: PIN 3333
```

**Save these!** You'll need them for testing.

---

## 🎯 **What To Do Next**

Choose one:

### **Option A: Test Redemption Flow**
```javascript
await testRedemptionFlow()
```
7 automated tests in ~5 seconds

---

### **Option B: Setup Device Simulation**
```javascript
await simulateDevices()
```
Creates 3 virtual devices for manual testing

---

### **Option C: Run Full P0 Tests**
```javascript
const env = getTestEnvironment()
await runP0Tests({
  childId: env.familyA.children[0].childId,
  familyBId: env.familyB.familyId
})
```
10 P0 tests in ~15 seconds

---

## 📚 **Need Help?**

| Document | When To Use |
|----------|-------------|
| `/QUICK_START_60_SECONDS.md` | Quick reference |
| `/TEST_DATA_SUMMARY.md` | Command reference |
| `/TEST_ENVIRONMENT_GUIDE.md` | Detailed guide |
| `/TEST_SUITE_STATUS.md` | Status overview |

---

## 🆘 **Troubleshooting**

### **"setupTestEnvironment is not defined"**

1. Refresh page (F5)
2. Wait 3 seconds
3. Look for "✅ Test suite ready!"
4. Try again

---

### **"Failed to create family"**

Possible causes:
- Email already exists (reset first)
- Network issue (check connection)
- Backend error (check logs)

**Solution:**
```javascript
await resetTestEnvironment()
// Wait 10 seconds
await setupTestEnvironment()
```

---

### **Audit shows failures**

**DO NOT PROCEED** - Fix issues first!

Common failures:
- ❌ Plain PIN exposed (fix backend)
- ❌ Cross-family access not blocked (fix middleware)
- ❌ Missing fields (check models)

---

## ✅ **Success Checklist**

- [ ] Refreshed browser
- [ ] Saw "✅ Test suite ready!"
- [ ] Ran `setupTestEnvironment()` - completed successfully
- [ ] Ran `auditTestEnvironment()` - **11/11 PASSED**
- [ ] Ran `printTestCredentials()` - saved credentials

**All checked?** ✅ **YOU'RE READY TO TEST!**

---

## 🎉 **You're All Set!**

Your test environment is ready. Choose what to test:

1. **Redemption Flow** - `await testRedemptionFlow()`
2. **Device Simulation** - `await simulateDevices()`
3. **P0 Test Suite** - `await runP0Tests({...})`
4. **Manual Testing** - Use credentials above

**Happy Testing! 🚀**

---

**Setup Time:** ~60 seconds  
**Audit Time:** ~20 seconds  
**Total Time:** ~90 seconds

**Status:** ✅ Production Ready
