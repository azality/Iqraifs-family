# 🚀 Quick Start: Test Environment in 60 Seconds

**Get your test environment running in under 1 minute!**

---

## ⚡ **IMPORTANT: Refresh Your Page First!**

The test suite is **auto-loaded** when the app starts. If you just made changes:

1. **Refresh the browser** (F5 or Cmd+R)
2. **Wait 2-3 seconds** for the test suite to load
3. **Look for this in console:**
   ```
   🧪 Test suite auto-loading...
   ✅ Test runner loaded
   ✅ Test helpers loaded
   ✅ Environment setup loaded
   ✅ Environment audit loaded
   ✅ Device simulator loaded
   ✅ Test suite ready!
   ```

---

## ⚡ 60-Second Setup

### **Step 1: Verify Auto-Load (0 seconds)**

After refresh, check console for:
```
✅ Test suite ready!
```

If you see this, **all commands are already available!** Skip to Step 2.

If NOT, manually load:
```javascript
loadTestSuite()
```

---

### **Step 2: Setup Test Families (30 seconds)**

```javascript
await setupTestEnvironment()
```

**Output:**
```
✅ Family A created (2 parents, 2 kids)
✅ Family B created (1 parent, 1 kid)
⏱️  Setup Time: 8523ms
```

---

### **Step 3: Verify (20 seconds)**

```javascript
await auditTestEnvironment()
```

**Output:**
```
✅ PASSED: 11/11
🎉 ALL AUDIT CHECKS PASSED!
```

---

## ✅ Done! You now have:

- **Family A**: parent-a1@fgs-test.com / TestPassword123!
  - Kids: A1 (PIN: 1111), A2 (PIN: 2222)
- **Family B**: parent-b1@fgs-test.com / TestPassword123!
  - Kids: B1 (PIN: 3333)
- **Invite Codes**: Unique per family
- **PINs**: Hashed with SHA-256
- **Verified**: All security checks passed

---

## 🎯 What To Do Next

### **Option 1: Test Redemption Flow**

```javascript
await testRedemptionFlow()
// 7 automated tests, ~5 seconds
```

---

### **Option 2: Setup Device Simulation**

```javascript
await simulateDevices()
await switchToDevice("device1")  // Fresh kid device
// Refresh page, start testing!
```

---

### **Option 3: Run P0 Tests**

```javascript
const env = getTestEnvironment()
await runP0Tests({
  childId: env.familyA.children[0].childId,
  familyBId: env.familyB.familyId
})
// 10 P0 tests, ~15 seconds
```

---

## 📋 Print Your Credentials

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
   Kid A1:
     Name: Kid A1
     PIN: 1111
   Kid A2:
     Name: Kid A2
     PIN: 2222

📧 FAMILY B:
   Invite Code: DEF456
   Parent B1:
     Email: parent-b1@fgs-test.com
     Password: TestPassword123!
   Kid B1:
     Name: Kid B1
     PIN: 3333
```

---

## 🔄 Reset & Start Over

```javascript
await resetTestEnvironment()
await resetDeviceSimulation()
// Then re-run step 2-3
```

---

## 🆘 Troubleshooting

### **"setupTestEnvironment is not defined"**

**Solution:** Refresh the page and wait for auto-load

```javascript
// 1. Refresh page (F5)
// 2. Wait 3 seconds
// 3. Check console for "✅ Test suite ready!"
// 4. Try again: await setupTestEnvironment()
```

---

### **Test suite didn't auto-load**

**Solution:** Manually load it

```javascript
// Check if loadTestSuite is available
loadTestSuite()

// Wait for it to complete, then:
await setupTestEnvironment()
```

---

## 📚 Full Guides

- **`/TEST_DATA_SUMMARY.md`** - Quick reference
- **`/TEST_ENVIRONMENT_GUIDE.md`** - Complete guide (50 pages)
- **`/TEST_EXECUTION_GUIDE.md`** - P0 test execution
- **`/REDEMPTION_FLOW_GUIDE.md`** - Redemption testing

---

## ✅ Success Checklist

- [ ] Refreshed page
- [ ] Saw "✅ Test suite ready!" in console
- [ ] Ran `await setupTestEnvironment()` - no errors
- [ ] Ran `await auditTestEnvironment()` - 11/11 passed
- [ ] Saved credentials (ran `printTestCredentials()`)

**Ready? Start testing!** 🎉

---

**Time to complete:** ~60 seconds (after refresh)  
**Result:** Production-ready test environment ✅