# 🔄 DATA FLOWS TESTS (P0) - Quick Start Guide

**Purpose:** Verify parent and kid mode user experiences work correctly  
**Time:** 5 minutes  
**Tests:** 2 comprehensive data flow tests  

---

## 📋 OVERVIEW

This test suite verifies the **core user experience** by testing:

### **FLOW-P0.1: Parent Mode Family Load Sequence**
Ensures parents see correct data when they login:
- ✅ Family details load (including invite code)
- ✅ Children list loads
- ✅ First child auto-selected
- ✅ Events and attendance load for selected child
- ✅ Switching children updates data correctly
- ✅ **NO "Please select a child" errors**

### **FLOW-P0.2: Kid Mode Family Load Sequence**
Ensures kids see their own data automatically:
- ✅ Kid login sets correct mode
- ✅ Family context loads
- ✅ Kid auto-selected (themselves)
- ✅ Dashboard shows points, quests, trackables
- ✅ **Kid NEVER sees "select a child" UI**
- ✅ Session persists correctly

---

## 🚀 QUICK START

### **Step 1: Verify Test Environment**
```
Purple button → "Inspect localStorage"
```

**Check for:**
- ✅ Family A with test data
- ✅ Parent credentials
- ✅ Child credentials (with PIN)

**If missing:** Click "Reset & Recreate" first

---

### **Step 2: Run Data Flows Test**
```
Purple button → "Data Flows (P0)"
```

**What happens:**
- Tests parent login and family loading (8 steps)
- Tests kid login and dashboard loading (6 steps)
- Takes ~30 seconds

---

### **Step 3: Verify Results**

**Expected Output:**
```
═══════════════════════════════════════════════════════════
📊 DATA FLOWS AUDIT SUMMARY (P0)
═══════════════════════════════════════════════════════════
Total Tests:     2
✅ Passed:        2
❌ Failed:        0
⏭️  Skipped:      0
═══════════════════════════════════════════════════════════
```

---

## 📊 TEST DETAILS

### **FLOW-P0.1: Parent Mode (8 Steps)**

#### **Step 1: Login as Parent**
- Uses Supabase auth to login
- Verifies access token obtained

#### **Step 2: Fetch Family Details**
- Calls GET /family
- Verifies: id, name, inviteCode present
- **Critical:** inviteCode must be included for display

#### **Step 3: Fetch Children List**
- Calls GET /family/{id}/children
- Verifies array of children returned
- Checks first child structure (id, name, avatar, points)

#### **Step 4: Verify Auto-Selection**
- Confirms first child has required fields
- Ensures FamilyContext can auto-select

#### **Step 5: Fetch Events for First Child**
- Calls GET /family/{id}/events?childId={childId}
- Verifies events array returned
- Confirms data loads without "select child" error

#### **Step 6: Fetch Attendance for First Child**
- Calls GET /family/{id}/attendance?childId={childId}
- Verifies attendance array returned
- Confirms dashboard can display data

#### **Step 7: Test Child Switching** (if 2+ children)
- Fetches events for second child
- Confirms different child's data loads
- Verifies switching updates downstream pages

#### **Step 8: Verify No "Please Select" Errors**
- Checks for scenarios that would cause error
- Confirms auto-selection would work
- Validates data flow sequence

---

### **FLOW-P0.2: Kid Mode (6 Steps)**

#### **Step 1: Login as Kid**
- Calls POST /kid/verify-pin
- Verifies kidToken obtained
- Kid authentication successful

#### **Step 2: Fetch Kid Dashboard**
- Calls GET /kid/dashboard
- Verifies: points, quests array, trackables array
- Confirms kid sees their own data

#### **Step 3: Verify Auto-Selection**
- Kid should automatically see their own data
- No "select a child" UI should appear
- Dashboard loads immediately

#### **Step 4: Fetch Family Info**
- Calls GET /kid/family
- Verifies family data for kid
- Confirms context loads correctly

#### **Step 5: Verify No "Select Child" Scenarios**
- Checks points are visible
- Checks quests are visible
- **CRITICAL:** Kid never sees "select a child" UI

#### **Step 6: Verify Session Persistence**
- Checks localStorage for kid mode flags
- Verifies: fgs_kid_mode = 'true'
- Verifies: fgs_family_id set
- Verifies: fgs_selected_child_id set
- Ensures session persists on page refresh

---

## ✅ SUCCESS CRITERIA

### **For Parent Mode:**
- [ ] Family details load successfully
- [ ] Children list loads (at least 1 child)
- [ ] First child has complete data (id, name, avatar, points)
- [ ] Events load for selected child
- [ ] Attendance loads for selected child
- [ ] Switching children works (if applicable)
- [ ] No "Please select a child" error scenarios

### **For Kid Mode:**
- [ ] Kid login successful (kidToken obtained)
- [ ] Dashboard loads with points
- [ ] Quests array present
- [ ] Trackables array present
- [ ] Family info loads
- [ ] Kid mode flags set in localStorage
- [ ] **CRITICAL:** Kid never sees "select a child" UI

---

## 🎯 WHAT GETS TESTED

### **API Endpoints Verified:**

**Parent Mode:**
```
✅ GET  /family
✅ GET  /family/{id}/children
✅ GET  /family/{id}/events?childId={childId}
✅ GET  /family/{id}/attendance?childId={childId}
```

**Kid Mode:**
```
✅ POST /kid/verify-pin
✅ GET  /kid/dashboard
✅ GET  /kid/family
```

### **Data Flow Sequence:**

**Parent Flow:**
```
Login → Fetch Family → Fetch Children → Auto-select First
  → Fetch Events → Fetch Attendance → Dashboard Ready ✅
```

**Kid Flow:**
```
Login → Fetch Dashboard → Auto-select Self → Show Data ✅
```

---

## ⚠️ COMMON ISSUES & FIXES

### **Issue: "Parent login failed"**

**Cause:** Test data not available or invalid credentials  

**Fix:**
```
1. Click "Reset & Recreate"
2. Wait for completion
3. Run "Data Flows (P0)" again
```

---

### **Issue: "No children found"**

**Cause:** Test environment incomplete  

**Fix:**
```
1. Verify test environment has children
2. Run "Inspect localStorage"
3. Check children count > 0
4. If 0, run "Reset & Recreate"
```

---

### **Issue: "Family data missing inviteCode"**

**Cause:** Backend not returning invite code  

**Fix:**
```
1. Check GET /family endpoint response
2. Verify backend includes inviteCode in family data
3. Update backend if needed
```

**Is this a blocker?** YES - Parents need to see invite code

---

### **Issue: "Kid sees 'select a child' UI"**

**Cause:** CRITICAL BUG - Auto-selection not working  

**Fix:**
```
1. Check kid login response includes kidToken
2. Verify localStorage has fgs_selected_child_id
3. Check FamilyContext auto-selection logic
4. Verify kid dashboard endpoint returns data
```

**Is this a blocker?** YES - Critical UX bug

---

### **Issue: "Session not persisting"**

**Cause:** localStorage flags not set  

**Fix:**
```
1. Verify kid login sets:
   - fgs_kid_mode = 'true'
   - fgs_family_id = {familyId}
   - fgs_selected_child_id = {childId}
2. Check setKidMode() function
3. Update auth flow if needed
```

**Is this a blocker?** YES - Session must persist

---

## 📋 DETAILED VERIFICATION

### **Parent Mode Checklist:**

**Family Load:**
- [ ] Family ID returned
- [ ] Family name displayed
- [ ] Invite code visible ⚠️ IMPORTANT
- [ ] No errors in console

**Children Load:**
- [ ] Children array returned
- [ ] At least 1 child present
- [ ] First child has: id, name, avatar, currentPoints
- [ ] Child data complete and valid

**Events Load:**
- [ ] Events array for first child
- [ ] No "select a child" error
- [ ] Dashboard can display events

**Attendance Load:**
- [ ] Attendance array for first child
- [ ] No errors fetching data
- [ ] Attendance page would render correctly

**Child Switching (if applicable):**
- [ ] Second child events load
- [ ] Different data than first child
- [ ] Downstream pages update
- [ ] No data leakage between children

---

### **Kid Mode Checklist:**

**Login:**
- [ ] PIN verification successful
- [ ] kidToken obtained
- [ ] No errors during login

**Dashboard Load:**
- [ ] Points value present
- [ ] Quests array returned
- [ ] Trackables array returned
- [ ] All data for correct child

**Auto-Selection:**
- [ ] Kid sees own data immediately
- [ ] No "select a child" UI shown ⚠️ CRITICAL
- [ ] Dashboard renders without manual selection

**Family Context:**
- [ ] Family info loads
- [ ] Family name visible
- [ ] Context includes kid's family

**Session Persistence:**
- [ ] fgs_kid_mode = 'true'
- [ ] fgs_family_id set
- [ ] fgs_selected_child_id set
- [ ] Page refresh maintains session

---

## 🎉 COMPLETION

Once you have:
- ✅ 2/2 data flow tests passing
- ✅ Parent mode loading correctly
- ✅ Kid mode auto-selection working
- ✅ No "please select a child" errors
- ✅ Sessions persisting correctly

**You've verified:**
- ✅ Core user experience works
- ✅ Data loads in correct sequence
- ✅ Auto-selection prevents errors
- ✅ Parent and kid modes isolated
- ✅ Dashboard correctness confirmed

---

## 📊 EXPECTED OUTPUT

### **Successful Test Run:**

```
🔍 ========================================
🔍 DATA FLOWS AUDIT (P0)
🔍 ========================================

📝 FLOW-P0.1: Testing parent mode family load sequence...
   Step 1: Login as parent...
   ✓ Parent logged in
   Step 2: Fetch family details...
   ✓ Family loaded: Test Family A (ABC123)
   Step 3: Fetch children list...
   ✓ Children loaded: 2 children
   ✓ First child: Kid A1 (0 points)
   Step 4: Verify first child auto-selection logic...
   ✓ First child has required fields for auto-selection
   Step 5: Fetch events for first child...
   ✓ Events loaded: 5 events
   Step 6: Fetch attendance for first child...
   ✓ Attendance loaded: 3 records
   Step 7: Test switching to second child...
   ✓ Child switching works: Second child has 2 events
   Step 8: Verify no "Please select a child" scenarios...
   ✓ No "Please select a child" scenarios detected

📝 FLOW-P0.2: Testing kid mode family load sequence...
   Step 1: Login as kid...
   ✓ Kid logged in
   Step 2: Fetch kid dashboard data...
   ✓ Dashboard loaded: 0 points, 3 quests, 5 trackables
   Step 3: Verify kid auto-selection...
   ✓ Kid sees their own data (auto-selection working)
   Step 4: Fetch family info for kid...
   ✓ Family loaded: Test Family A
   Step 5: Verify no "select a child" scenarios for kid...
   ✓ Kid auto-selection working (no "select a child" UI)
   Step 6: Verify kid session data...
   ✓ Kid mode flag set in localStorage
   ✓ Family ID set in localStorage
   ✓ Selected child ID set in localStorage

═══════════════════════════════════════════════════════════
📊 DATA FLOWS AUDIT SUMMARY (P0)
═══════════════════════════════════════════════════════════
Total Tests:     2
✅ Passed:        2
❌ Failed:        0
⚠️  Warnings:     0
⏭️  Skipped:      0
═══════════════════════════════════════════════════════════
```

---

## 🔗 RELATED DOCUMENTATION

- `/P0_FINAL_CHECKLIST.md` - Complete P0 test checklist
- `/COMPREHENSIVE_P0_COMPLETE.md` - Full P0 implementation
- `/IOS_DEPLOYMENT_GUIDE.md` - Next steps after testing

---

**Last Updated:** February 21, 2026  
**Version:** 1.0  
**Status:** ✅ Ready for execution  
**Time to Complete:** 5 minutes
