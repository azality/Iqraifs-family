# 🧪 Test Environment Setup Guide

**Family Growth System - Comprehensive Test Data & Device Simulation**

---

## 📋 Overview

This guide covers setting up comprehensive test data for P0 testing:

- **TD-1.1: Test Families** - Create Family A and Family B with parents and kids
- **TD-1.2: Device Simulation** - Simulate multiple devices for testing scenarios
- **Audit & Verification** - Verify invite codes, PIN hashing, and data integrity

---

## 🚀 Quick Start (5 Minutes)

### **Step 1: Setup Test Families**

```javascript
// Open browser console (F12)
await loadTestSuite()
await setupTestEnvironment()
```

**Expected Output:**
```
🧪 TEST ENVIRONMENT SETUP

📋 Creating Test Family A...
  ✅ Parent created: user-xxx
  ✅ Signed in as parent-a1@fgs-test.com
  ✅ Family created: family:xxx
  ✅ Invite code: ABC123
  ✅ Child created: child:xxx (PIN: 1111)
  ✅ Child created: child:yyy (PIN: 2222)
  ✅ Second parent joined: user-yyy
✅ Test Family A complete!

📋 Creating Test Family B...
  ✅ Parent created: user-zzz
  ✅ Signed in as parent-b1@fgs-test.com
  ✅ Family created: family:zzz
  ✅ Invite code: DEF456
  ✅ Child created: child:zzz (PIN: 3333)
✅ Test Family B complete!

🎉 TEST ENVIRONMENT READY!

📊 SUMMARY:

✅ Family A: family:xxx
   Invite Code: ABC123
   Parents: 2
   Children: 2

✅ Family B: family:zzz
   Invite Code: DEF456
   Parents: 1
   Children: 1

⏱️  Setup Time: 8523ms

💾 Data saved to: localStorage.fgs_test_environment
```

### **Step 2: Audit Environment**

```javascript
await auditTestEnvironment()
```

**Expected Output:**
```
🔍 TEST ENVIRONMENT AUDIT

📋 TD-1.1: TEST FAMILIES

✅ [TD-1.1] Invite Code Mapping - Family A: Invite code ABC123 maps to family:xxx
✅ [TD-1.1] Invite Code Mapping - Family B: Invite code DEF456 maps to family:zzz

✅ [TD-1.1] Invite Code Uniqueness: Invite codes are unique

✅ [TD-1.1] PIN Hashing - Kid A1: PIN correctly hashed (SHA-256)
✅ [TD-1.1] PIN Hashing - Kid A2: PIN correctly hashed (SHA-256)
✅ [TD-1.1] PIN Hashing - Kid B1: PIN correctly hashed (SHA-256)

✅ [TD-1.1] Family Structure - Family A: Structure correct: 2 parent(s), 2 child(ren)
✅ [TD-1.1] Family Structure - Family B: Structure correct: 1 parent(s), 1 child(ren)

📋 SECURITY CHECKS

✅ [Security] Cross-Family Isolation: Cross-family access correctly blocked (403)

📋 DATA INTEGRITY

✅ [Integrity] Data Integrity - Family A: All required fields present and valid
✅ [Integrity] Data Integrity - Family B: All required fields present and valid

🔍 AUDIT SUMMARY

✅ PASSED:   11
❌ FAILED:   0
⚠️  WARNINGS: 0
⏱️  TIME:     3245ms

🎉 ALL AUDIT CHECKS PASSED!

✅ Test environment is correctly configured
✅ Invite codes map to correct families
✅ PINs are properly hashed
✅ Cross-family isolation working
✅ Data integrity verified
```

### **Step 3: Setup Device Simulation**

```javascript
await simulateDevices()
```

**Expected Output:**
```
📱 DEVICE SIMULATION SETUP

📋 Creating devices...

✅ Created 3 virtual devices

📱 Device 1: Fresh Kid Install
   - No session
   - No localStorage
   - Simulates first-time app open

📱 Device 2: Parent Device
   - Logging in as Parent A1...
   ✅ Parent A1 logged in

📱 Device 3: Second Kid Device
   - Kid A2 session prepared
   - For testing session/device corner cases

✅ Device simulation ready!

📋 DEVICE SUMMARY:

Device 1: Kid Device (Fresh Install)
  - Use for: First-time kid login testing
  - Family Code: ABC123
  - Kid: Kid A1, PIN: 1111

Device 2: Parent Device
  - Use for: Parent operations
  - Email: parent-a1@fgs-test.com
  - Password: TestPassword123!

Device 3: Second Kid Device
  - Use for: Session conflict testing
  - Kid: Kid A2, PIN: 2222

💡 Commands:
   switchToDevice("device1") - Switch to fresh kid device
   switchToDevice("device2") - Switch to parent device
   switchToDevice("device3") - Switch to second kid device
   showDeviceStatus()        - Show all devices

📝 Current Device: device1 (Fresh Install)
💡 Refresh page to see device state
```

---

## 📊 Test Data Structure

### **TD-1.1: Test Families**

#### **Family A (Multi-Parent, Multiple Kids)**

**Structure:**
```
Family A
├── Parent A1 (parent-a1@fgs-test.com)
├── Parent A2 (parent-a2@fgs-test.com)
├── Kid A1 (PIN: 1111, avatar: 👧)
└── Kid A2 (PIN: 2222, avatar: 👦)
```

**Details:**
- **Family ID**: `family:xxx` (auto-generated)
- **Invite Code**: `ABC123` (6 alphanumeric characters)
- **Created**: Auto timestamp
- **Parents**: 2 (both have full access)
- **Children**: 2 (separate PINs)

**Use Cases:**
- Multi-parent collaboration testing
- Multiple kids on same device
- Family invite system (Parent A2 joined via invite)
- Cross-child isolation

---

#### **Family B (Single Parent, One Kid)**

**Structure:**
```
Family B
├── Parent B1 (parent-b1@fgs-test.com)
└── Kid B1 (PIN: 3333, avatar: 👶)
```

**Details:**
- **Family ID**: `family:yyy` (auto-generated)
- **Invite Code**: `DEF456` (6 alphanumeric characters)
- **Created**: Auto timestamp
- **Parents**: 1
- **Children**: 1

**Use Cases:**
- Single-parent family testing
- Cross-family isolation testing (Family A cannot access Family B data)
- Simple family structure scenarios

---

### **TD-1.2: Device Simulation**

#### **Device 1: Kid Device (Fresh Install)**

**Purpose:** Simulates first-time app installation on kid's device

**State:**
- ❌ No session (not logged in)
- ❌ No localStorage data
- ❌ No family ID stored
- ❌ No child selected

**Use For:**
- First-time kid login flow
- Family code entry
- Kid selection
- PIN entry
- Fresh onboarding experience

**Test Scenario:**
```javascript
await switchToDevice("device1")
// Refresh page
// Navigate to /kid-login-new
// Enter family code: ABC123
// Select Kid A1
// Enter PIN: 1111
// Verify dashboard loads
```

---

#### **Device 2: Parent Device**

**Purpose:** Simulates logged-in parent device

**State:**
- ✅ Session active (Parent A1)
- ✅ localStorage populated
- ✅ Family ID: family:xxx
- ✅ View mode: parent

**Use For:**
- Parent operations (approve/decline)
- Family management
- Child point allocation
- Reward configuration
- Analytics viewing

**Test Scenario:**
```javascript
await switchToDevice("device2")
// Refresh page
// Already logged in as Parent A1
// Navigate to /redemption-requests
// Approve pending requests
```

---

#### **Device 3: Second Kid Device**

**Purpose:** Simulates session conflict scenarios

**State:**
- ⚠️ Prepared for Kid A2
- ✅ localStorage with family ID
- ✅ Child ID: Kid A2
- ⚠️ Session may conflict with Device 1

**Use For:**
- Session conflict testing
- Multiple kids on same device
- Device switching scenarios
- Session persistence testing
- Session expiry testing

**Test Scenario:**
```javascript
// Kid A1 logs in on device1
await switchToDevice("device1")
// Login as Kid A1...

// Kid A2 logs in on device3
await switchToDevice("device3")
// Login as Kid A2...

// Switch back to device1
await switchToDevice("device1")
// Does Kid A1 session persist?
// Or does it correctly expire?
```

---

## ✅ Acceptance Criteria Verification

### **TD-1.1.1: Unique Invite Codes**

**Requirement:** Each family has a unique invite code

**Audit Check:**
```javascript
await auditTestEnvironment()
// Look for: "Invite Code Uniqueness" test
```

**Verification:**
1. ✅ Family A has invite code (e.g., ABC123)
2. ✅ Family B has invite code (e.g., DEF456)
3. ✅ Codes are different (ABC123 ≠ DEF456)
4. ✅ Codes are 6 alphanumeric characters
5. ✅ Codes map to correct familyId in KV store

**Storage Format:**
```typescript
// In KV store:
{
  key: "invite:ABC123",
  value: {
    familyId: "family:xxx",
    createdAt: "2026-02-20T...",
    ...
  }
}
```

---

### **TD-1.1.2: Hashed PINs**

**Requirement:** Each kid has a known PIN stored hashed server-side

**Audit Check:**
```javascript
await auditTestEnvironment()
// Look for: "PIN Hashing" tests
```

**Verification:**
1. ✅ Plain PIN NOT exposed in API responses
2. ✅ `pinHash` field exists in child model
3. ✅ `pinHash` is SHA-256 (64 hex characters)
4. ✅ Computed hash matches stored hash
5. ✅ Different PINs produce different hashes

**Example:**
```typescript
// Kid A1:
PIN: "1111"
pinHash: "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c"

// Kid A2:
PIN: "2222"
pinHash: "3d97a31fce5c1ed1e2b9a00e9c8e6f3e5f7d9c4b2a1e9f8d7c6b5a4e3d2c1b0a"
```

**Security Check:**
```javascript
// Fetch child data
const child = await fetchChild("child:xxx");

// FAIL if plain PIN exposed:
if (child.pin === "1111") {
  console.error("🚨 SECURITY ISSUE: PIN exposed!");
}

// PASS if only hash present:
if (child.pinHash && !child.pin) {
  console.log("✅ PIN properly hashed");
}
```

---

### **TD-1.2: Device Simulation**

**Requirement:** Simulate 3 device types for testing

**Device Check:**
```javascript
showDeviceStatus()
```

**Verification:**
1. ✅ Device 1 exists (fresh kid device)
2. ✅ Device 2 exists (parent device)
3. ✅ Device 3 exists (second kid device)
4. ✅ Can switch between devices
5. ✅ Session state preserved per device
6. ✅ localStorage isolated per device

---

## 🎯 Testing Workflows

### **Workflow 1: Fresh Kid Onboarding**

**Objective:** Test first-time kid login experience

```javascript
// Step 1: Switch to fresh device
await switchToDevice("device1")

// Step 2: Refresh page
// Device has no session or stored data

// Step 3: Manual testing
// Navigate to /kid-login-new
// Enter family code: [Get from printTestCredentials()]
// Select kid: Kid A1
// Enter PIN: 1111

// Step 4: Verify
// - Dashboard loads
// - Kid's name displayed
// - Points shown
// - Quests visible
```

**Expected Result:** ✅ Kid successfully logged in and sees dashboard

---

### **Workflow 2: Parent Approval**

**Objective:** Test parent reviewing and approving kid requests

```javascript
// Step 1: Setup - Kid creates request
await switchToDevice("device1")
// Login as Kid A1
// Request reward from wishlist

// Step 2: Switch to parent device
await switchToDevice("device2")
// Refresh page

// Step 3: Manual testing
// Navigate to /redemption-requests
// See pending request
// Click "Approve"
// Verify points deducted

// Step 4: Verify
// - Request approved
// - Points deducted correctly
// - Point event logged
```

**Expected Result:** ✅ Request approved, points deducted

---

### **Workflow 3: Session Conflict**

**Objective:** Test session handling with multiple kids

```javascript
// Step 1: Kid A1 logs in
await switchToDevice("device1")
// Login as Kid A1 (PIN: 1111)
// Note session state

// Step 2: Kid A2 logs in (different device)
await switchToDevice("device3")
// Login as Kid A2 (PIN: 2222)
// Note session state

// Step 3: Switch back to device 1
await switchToDevice("device1")
// Refresh page

// Step 4: Verify session handling
// Option A: Kid A1 session persists (if using device-local storage)
// Option B: Kid A1 logged out (if using server-side sessions)
// Option C: App detects conflict and prompts re-login
```

**Expected Result:** ✅ App handles session correctly (no data leakage)

---

### **Workflow 4: Cross-Family Isolation**

**Objective:** Verify Family A cannot access Family B data

```javascript
// Step 1: Login as Parent A1
await switchToDevice("device2")
// Already logged in as Parent A1

// Step 2: Try to access Family B data
const env = getTestEnvironment()
const familyBId = env.familyB.familyId

// Try to fetch Family B children (should fail)
const token = await getAuthToken()
const response = await fetch(
  `${API_BASE}/families/${familyBId}/children`,
  { headers: { 'Authorization': `Bearer ${token}` } }
)

// Step 3: Verify
console.log('Status:', response.status)
// Expected: 403 Forbidden
```

**Expected Result:** ✅ 403 error - cross-family access blocked

---

## 🔍 Audit Results Interpretation

### **All Passing (11/11)**

```
✅ PASSED:   11
❌ FAILED:   0
⚠️  WARNINGS: 0
```

**Meaning:**
- ✅ Invite codes unique and properly mapped
- ✅ PINs properly hashed (SHA-256)
- ✅ No plain PINs exposed in API
- ✅ Family structures correct
- ✅ Cross-family isolation working
- ✅ Data integrity verified

**Action:** ✅ Proceed with P0 testing

---

### **With Warnings (11/11 with warnings)**

```
✅ PASSED:   11
❌ FAILED:   0
⚠️  WARNINGS: 2
```

**Common Warnings:**
- ⚠️ `pinHash` format unexpected (not exactly 64 hex chars)
- ⚠️ Parent count mismatch (expected 2, got 1)
- ⚠️ Invite code format unexpected

**Meaning:** Non-critical issues that don't block testing

**Action:** Review warnings, fix if needed, or document as known issues

---

### **With Failures (< 11 passing)**

```
✅ PASSED:   8
❌ FAILED:   3
⚠️  WARNINGS: 0
```

**Common Failures:**
- ❌ Plain PIN exposed in API (SECURITY ISSUE)
- ❌ Invite codes not unique
- ❌ Cross-family access not blocked
- ❌ Missing required fields

**Meaning:** Critical issues found - **DO NOT PROCEED WITH TESTING**

**Action:**
1. Review failure details in console
2. Fix backend/frontend code
3. Reset environment: `await resetTestEnvironment()`
4. Re-setup: `await setupTestEnvironment()`
5. Re-audit: `await auditTestEnvironment()`

---

## 📚 Command Reference

### **Setup Commands**

```javascript
// Load test suite
await loadTestSuite()

// Setup test families (Family A & B)
await setupTestEnvironment()

// Reset environment (clear and recreate)
await resetTestEnvironment()
await setupTestEnvironment()

// Get environment data
const env = getTestEnvironment()

// Print credentials
printTestCredentials()
```

---

### **Audit Commands**

```javascript
// Run full audit
await auditTestEnvironment()

// Check specific aspects (not implemented yet, but could be added):
// await auditInviteCodes()
// await auditPINHashing()
// await auditFamilyIsolation()
```

---

### **Device Commands**

```javascript
// Setup devices
await simulateDevices()

// Switch devices
await switchToDevice("device1")  // Fresh kid device
await switchToDevice("device2")  // Parent device
await switchToDevice("device3")  // Second kid device

// Check status
showDeviceStatus()

// Reset devices
await resetDeviceSimulation()

// Test scenarios
await testScenario_FreshKidLogin()
await testScenario_ParentApproval()
await testScenario_SessionConflict()
```

---

## 🗂️ Data Storage

### **LocalStorage Keys**

The test environment uses localStorage for persistence:

```javascript
// Test environment data
localStorage.getItem('fgs_test_environment')
// Contains: Family A, Family B, credentials, IDs

// Device simulation
localStorage.getItem('fgs_device_simulation')
// Contains: Device states, sessions, localStorage snapshots

// App data (per device)
localStorage.getItem('fgs_family_id')
localStorage.getItem('fgs_selected_child')
localStorage.getItem('fgs_view_mode')
```

### **Accessing Data**

```javascript
// Get full environment
const env = JSON.parse(localStorage.getItem('fgs_test_environment'))

console.log('Family A ID:', env.familyA.familyId)
console.log('Family A Invite:', env.familyA.inviteCode)
console.log('Kid A1 ID:', env.familyA.children[0].childId)
console.log('Kid A1 PIN:', env.familyA.children[0].pin)

// Get device simulation
const sim = JSON.parse(localStorage.getItem('fgs_device_simulation'))

console.log('Active Device:', sim.activeDevice)
console.log('Device 1 Session:', sim.devices[0].sessionData)
```

---

## 🔄 Reset & Cleanup

### **Reset Test Environment**

```javascript
await resetTestEnvironment()
```

**What it does:**
- ❌ Clears localStorage keys
- ❌ Clears test environment data
- ⚠️ Does NOT delete accounts/families from database

**Use when:**
- Need fresh environment
- Credential conflicts
- Testing environment setup itself

---

### **Reset Device Simulation**

```javascript
await resetDeviceSimulation()
```

**What it does:**
- ❌ Clears device simulation data
- ❌ Signs out current session
- ❌ Clears app localStorage

**Use when:**
- Need fresh device state
- Device switching not working
- Session conflicts

---

### **Full Reset (Nuclear Option)**

```javascript
// Reset everything
await resetTestEnvironment()
await resetDeviceSimulation()

// Clear app data
localStorage.clear()

// Sign out
await supabase.auth.signOut()

// Refresh page
location.reload()

// Re-setup from scratch
await loadTestSuite()
await setupTestEnvironment()
await auditTestEnvironment()
await simulateDevices()
```

---

## 🎓 Tips & Best Practices

### **1. Always Audit After Setup**

```javascript
await setupTestEnvironment()
await auditTestEnvironment()  // ← Don't skip this!
```

**Why:** Catches issues early before wasting time on failing tests

---

### **2. Print Credentials Before Testing**

```javascript
printTestCredentials()
// Copy-paste credentials for manual testing
```

**Why:** Saves time looking up emails, PINs, invite codes

---

### **3. Use Device Switching for Complex Scenarios**

```javascript
// Instead of manually logging in/out...
await switchToDevice("device1")  // Instant kid device
await switchToDevice("device2")  // Instant parent device
```

**Why:** Faster than manual login, preserves state

---

### **4. Check Device Status Frequently**

```javascript
showDeviceStatus()
// See which device you're on, what session is active
```

**Why:** Easy to lose track during multi-device testing

---

### **5. Save Environment Data**

```javascript
const env = getTestEnvironment()
// Save to file or document for reference
console.log(JSON.stringify(env, null, 2))
```

**Why:** Useful for debugging, documentation, test planning

---

## 🆘 Troubleshooting

### **"No test environment found"**

```javascript
await setupTestEnvironment()
```

---

### **"Not authenticated"**

```javascript
// Check current session
const { data } = await supabase.auth.getSession()
console.log('Session:', data.session)

// Sign in as Parent A1
const env = getTestEnvironment()
await supabase.auth.signInWithPassword({
  email: env.familyA.parents[0].email,
  password: env.familyA.parents[0].password
})
```

---

### **"Failed to create family/child"**

**Possible causes:**
- Email already in use (reset environment)
- Backend error (check server logs)
- Rate limiting (wait 30 seconds)

**Solution:**
```javascript
await resetTestEnvironment()
// Wait 30 seconds
await setupTestEnvironment()
```

---

### **Audit Failures**

**PIN Exposed:**
```
❌ 🚨 SECURITY ISSUE: Plain PIN exposed in API response!
```

**Fix:** Update backend to NOT return `pin` field, only `pinHash`

---

**Cross-Family Access:**
```
❌ 🚨 SECURITY ISSUE: Can access other family's data!
```

**Fix:** Check `requireFamilyAccess` middleware in backend

---

### **Device Switching Not Working**

```javascript
// Reset and recreate
await resetDeviceSimulation()
await simulateDevices()

// Manually check device state
showDeviceStatus()
```

---

## 📖 Complete Example

```javascript
// ============================================
// COMPLETE TEST ENVIRONMENT SETUP
// ============================================

console.log('Starting complete test environment setup...\n')

// 1. Load test suite
console.log('Step 1: Loading test suite...')
await loadTestSuite()
console.log('✅ Loaded\n')

// 2. Setup test families
console.log('Step 2: Creating test families...')
await setupTestEnvironment()
console.log('✅ Created\n')

// 3. Audit environment
console.log('Step 3: Auditing environment...')
const auditResults = await auditTestEnvironment()
if (auditResults.failed > 0) {
  console.error('❌ Audit failed! Fix issues before proceeding.')
  throw new Error('Audit failed')
}
console.log('✅ Audit passed\n')

// 4. Setup devices
console.log('Step 4: Setting up device simulation...')
await simulateDevices()
console.log('✅ Devices ready\n')

// 5. Print credentials
console.log('Step 5: Test credentials:')
printTestCredentials()

// 6. Show device status
console.log('\nStep 6: Device status:')
showDeviceStatus()

console.log('\n🎉 COMPLETE TEST ENVIRONMENT READY!')
console.log('\n📝 Next steps:')
console.log('1. Run redemption tests: await testRedemptionFlow()')
console.log('2. Run P0 tests: await runP0Tests({ childId: "xxx", familyBId: "yyy" })')
console.log('3. Test workflows: await testScenario_FreshKidLogin()\n')
```

---

## ✅ Success Checklist

After setup, verify:

- [ ] `setupTestEnvironment()` completed without errors
- [ ] `auditTestEnvironment()` shows 11/11 passed
- [ ] Family A has 2 parents, 2 kids
- [ ] Family B has 1 parent, 1 kid
- [ ] Invite codes are unique and map correctly
- [ ] PINs are hashed (SHA-256, 64 hex chars)
- [ ] Cross-family access blocked (403)
- [ ] `simulateDevices()` created 3 devices
- [ ] Can switch between devices
- [ ] Credentials printed and saved

**If all checked:** ✅ **Ready for P0 testing!**

---

**Last Updated:** February 20, 2026  
**Status:** Complete  
**Test Environment Version:** 1.0.0
