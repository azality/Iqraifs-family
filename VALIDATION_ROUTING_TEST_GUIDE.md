# 🧪 VALIDATION & ROUTING TESTS (P0) - Quick Start Guide

**Purpose:** Complete P0 validation and routing tests before iOS deployment  
**Time:** 15 minutes total  
**Status:** Ready to run  

---

## 📋 OVERVIEW

This test suite verifies:

### ✅ **VAL-P0.1: Input Validation (Zod Schemas)**
- Signup endpoint validation
- Child creation validation
- Point event validation  
- PIN verification & sensitive data protection

### 🔒 **ROUTE-P0.1 to P0.4: Route Protection**
- Public routes accessible without auth
- Protected routes redirect properly
- Parent/kid route isolation enforced

---

## 🚀 QUICK START (3 Steps)

### **Step 1: Check Test Environment**
```
Purple button → "Inspect localStorage"
```

**What to look for:**
- ✅ Family A exists
- ✅ 2 children
- ✅ Parent token available

**If missing:** Click "Reset & Recreate" first (wait 60 seconds)

---

### **Step 2: Run Validation & Routing Tests**
```
Purple button → "Validation & Routing (P0)"
```

**What happens:**
- Tests all validation endpoints (4 tests)
- Checks route protection (4 tests requiring manual verification)
- Takes ~30 seconds

---

### **Step 3: Verify Results**

**Expected Output:**
```
═══════════════════════════════════════════════════════════
📊 VALIDATION & ROUTING AUDIT SUMMARY (P0)
═══════════════════════════════════════════════════════════
Total Tests:     9
✅ Passed:        4  (automated validation tests)
❌ Failed:        0
⚠️  Warnings:     0
📋 Manual:        4  (routing tests - require browser testing)
⏭️  Skipped:      1  (if no test data)
═══════════════════════════════════════════════════════════
```

---

## 📊 TEST BREAKDOWN

### **Automated Tests (4)**

#### **VAL-P0.1a: Signup Validation**
Tests:
- ✅ Missing required fields → 400
- ✅ Invalid email format → 400
- ✅ Weak password → 400
- ✅ Short family name → 400
- ✅ Extra fields handled consistently

#### **VAL-P0.1b: Child Creation Validation**
Tests:
- ✅ Missing required fields → 400
- ✅ Invalid PIN length → 400
- ✅ PIN never echoed in response ⚠️ SECURITY
- ✅ Name too short → 400
- ✅ Invalid avatar → 400 or sanitized

#### **VAL-P0.1c: Point Event Validation**
Tests:
- ✅ Missing required fields → 400
- ✅ Points out of range (< -1000) → 400
- ✅ Points out of range (> 1000) → 400
- ✅ Wrong type (string instead of number) → 400
- ✅ Notes too long (> 500 chars) → 400

#### **VAL-P0.1d: PIN Validation & Security**
Tests:
- ✅ Invalid PIN format → 400/401
- ✅ Wrong PIN → 401
- ✅ **CRITICAL:** PIN never echoed back in ANY response
- ✅ No pinHash, submittedPin, or correctPin in error responses

---

### **Manual Tests (4) - Browser Verification Required**

#### **ROUTE-P0.1: Public Routes Accessible**
**Manual steps:**
1. Clear localStorage (`localStorage.clear()`)
2. Navigate to `/welcome`
3. Navigate to `/kid/login`

**Expected:**
- ✅ Both pages load without authentication
- ✅ No API retry loops
- ✅ No errors in console

---

#### **ROUTE-P0.2: Protected Routes Redirect**
**Manual steps:**
1. Clear localStorage
2. Try direct navigation to:
   - `/settings`
   - `/`
   - `/kid/home`
   - `/attendance`

**Expected:**
- ✅ Redirect to `/welcome` or login flow
- ✅ No protected data flash before redirect
- ✅ No 401 error spam in console

---

#### **ROUTE-P0.3: Parent Cannot Access Kid Routes**
**Manual steps:**
1. Login as parent
2. Try to navigate to:
   - `/kid/home`
   - `/kid/wishlist`

**Expected:**
- ✅ Access blocked (redirect or 403 screen)
- ✅ No kid dashboard data fetch succeeds
- ✅ Check Network tab - no kid-specific API calls

---

#### **ROUTE-P0.4: Kid Cannot Access Parent Routes**
**Manual steps:**
1. Login as kid
2. Try to navigate to:
   - `/settings`
   - `/adjustments`
   - `/rewards`
   - `/audit`
   - `/review`

**Expected:**
- ✅ Access blocked (redirect or forbidden UI)
- ✅ No parent-only API calls succeed with kid token
- ✅ Check Network tab - all parent endpoints return 403

---

## 🎯 SUCCESS CRITERIA

### **For Automated Tests:**
- [ ] All 4 validation tests pass
- [ ] 0 failures
- [ ] No sensitive data (PIN, pinHash) in error responses

### **For Manual Tests:**
- [ ] Complete all 4 manual verification steps above
- [ ] Document any issues found
- [ ] All route protections working as expected

---

## ⚠️ TROUBLESHOOTING

### **Issue: "Skipped - no test data"**

**Cause:** Missing test environment data  

**Fix:**
```
1. Purple button → "Reset & Recreate"
2. Wait 60 seconds for completion
3. Run "Validation & Routing (P0)" again
```

---

### **Issue: "429 Too Many Requests"**

**Cause:** Hit Supabase rate limit  

**Fix:**
```
1. Wait 1 hour
2. OR: Increase rate limits in Supabase (see /RATE_LIMITING_CHECKLIST.md)
3. Then run tests again
```

---

### **Issue: Test fails validation**

**Expected behavior:**
- All endpoints should return 400 for invalid input
- Error messages should be consistent
- No partial writes should occur
- Sensitive values (PIN) never echoed back

**If validation fails:**
1. Note the specific test that failed
2. Check the error message in console
3. Verify the endpoint response structure
4. Fix validation schema in `/supabase/functions/server/validation.tsx`

---

## 📝 MANUAL VERIFICATION CHECKLIST

Use this checklist when performing manual route tests:

### **Public Routes (ROUTE-P0.1)**
- [ ] Cleared localStorage
- [ ] Visited /welcome - loaded successfully
- [ ] Visited /kid/login - loaded successfully
- [ ] No console errors
- [ ] No API retry loops

### **Protected Route Redirects (ROUTE-P0.2)**
- [ ] Cleared localStorage
- [ ] Tried /settings - redirected
- [ ] Tried / - redirected
- [ ] Tried /kid/home - redirected
- [ ] Tried /attendance - redirected
- [ ] No data flash before redirect

### **Parent/Kid Isolation (ROUTE-P0.3)**
- [ ] Logged in as parent
- [ ] Tried /kid/home - blocked
- [ ] Tried /kid/wishlist - blocked
- [ ] No kid data fetched (checked Network tab)

### **Kid/Parent Isolation (ROUTE-P0.4)**
- [ ] Logged in as kid
- [ ] Tried /settings - blocked
- [ ] Tried /adjustments - blocked
- [ ] Tried /rewards - blocked
- [ ] Tried /audit - blocked
- [ ] Tried /review - blocked
- [ ] All parent endpoints return 403 (checked Network tab)

---

## 🎉 COMPLETION

Once you have:
- ✅ 4/4 automated validation tests passing
- ✅ 4/4 manual routing tests verified
- ✅ 0 security issues found
- ✅ No sensitive data leaks

**You're ready for:**
1. Final production readiness check
2. iOS app deployment
3. App Store submission

---

## 📊 NEXT STEPS AFTER COMPLETION

### **If All Tests Pass:**
```
Production Readiness: 98%
Critical Bugs: 0
Ready for: iOS Deployment
```

Proceed to:
1. `/IOS_DEPLOYMENT_GUIDE.md`
2. Apple Developer Account setup
3. App Store submission

### **If Any Test Fails:**
1. Document the failure
2. Fix the validation schema or route protection
3. Re-run tests
4. Verify fix
5. Continue to next test

---

## 🔗 RELATED DOCUMENTATION

- `/PRE_LAUNCH_TESTING_CHECKLIST.md` - Full pre-launch test suite
- `/COMPREHENSIVE_SYSTEM_AUDIT.md` - System-wide audit results
- `/API_SECURITY_AUDIT_GUIDE.md` - API security testing
- `/IOS_DEPLOYMENT_GUIDE.md` - iOS deployment process

---

**Last Updated:** February 21, 2026  
**Version:** 1.0  
**Status:** ✅ Ready for execution
