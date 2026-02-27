# 📋 QA Quick Reference: 2x2 Navigation Matrix

**Purpose:** Catch role-based navigation bugs before production  
**Time per page:** ~2-3 minutes  
**Critical for:** All dual-mode pages (pages that exist in both parent and kid variants)

---

## 🎯 The 2x2 Rule (Simple!)

For **EVERY** page that exists in both parent and kid modes:

| Test | User Role | Action | Expected | Status |
|------|-----------|--------|----------|---------|
| **1** | 👨 Parent | Click nav link | Lands on **parent** page | □ |
| **2** | 🧒 Kid | Click nav link | Lands on **kid** page | □ |
| **3** | 👨 Parent | Manually enter kid URL | **BLOCKED** | □ |
| **4** | 🧒 Kid | Manually enter parent URL | **BLOCKED** | □ |

---

## 📄 Pages Requiring 2x2 Testing

### **Priority 1: Must Test Before Every Deploy**

| Page | Parent Route | Kid Route |
|------|-------------|-----------|
| **Challenges** | `/challenges` | `/kid/challenges` |
| **Wishlist** | `/wishlist` | `/kid/wishlist` |
| **Attendance** | `/attendance` | `/kid/attendance` |

### **Priority 2: Test Weekly or After Nav Changes**

| Page | Parent Route | Kid Route |
|------|-------------|-----------|
| Home/Dashboard | `/` | `/kid/home` |
| Profile | `/settings` | `/kid/profile` |

---

## ✅ Test 1: Parent Clicks Nav Link

**Setup:**
- Login as parent (parent email + password)
- From any parent page

**Steps:**
1. Click "Challenges" in navigation menu
2. Look at URL bar
3. Look at page content

**✅ PASS if:**
- URL is `/challenges` (NOT `/kid/challenges`)
- See admin controls (Create/Edit/Delete buttons)
- Can manage challenges
- No quest cards or "Accept Quest" buttons

**❌ FAIL if:**
- URL is `/kid/challenges`
- See quest cards instead of admin table
- See "Accept Quest" button
- Adventure theme/UI visible

---

## ✅ Test 2: Kid Clicks Nav Link

**Setup:**
- Login as kid (kid name + access code)
- From any kid page

**Steps:**
1. Click "Challenges" or "Quest Board" in navigation
2. Look at URL bar
3. Look at page content

**✅ PASS if:**
- URL is `/kid/challenges` (NOT `/challenges`)
- See quest cards with adventure UI
- Can accept/view quests
- No admin CRUD buttons

**❌ FAIL if:**
- URL is `/challenges`
- See admin table instead of quest cards
- See Create/Edit/Delete buttons
- Parent admin UI visible

---

## 🔒 Test 3: Parent Tries Kid URL (Security!)

**Setup:**
- Login as parent
- From any parent page

**Steps:**
1. Click in URL bar
2. Manually type: `/kid/challenges`
3. Press Enter

**✅ PASS if:**
- Get **403 Forbidden** or **401 Unauthorized** error
- OR redirected to parent-safe page (like `/`)
- Kid page content NEVER visible (not even briefly)

**❌ FAIL if:**
- Kid page loads successfully
- Can see quest cards
- URL stays on `/kid/challenges`
- Flash of kid UI before redirect

**⚠️ If this fails:** CRITICAL SECURITY BUG - Stop deployment!

---

## 🔒 Test 4: Kid Tries Parent URL (Security!)

**Setup:**
- Login as kid
- From any kid page

**Steps:**
1. Click in URL bar
2. Manually type: `/challenges`
3. Press Enter

**✅ PASS if:**
- Get **403 Forbidden** or **401 Unauthorized** error
- OR redirected to kid-safe page (like `/kid/home`)
- Parent admin content NEVER visible (not even briefly)

**❌ FAIL if:**
- Parent admin page loads successfully
- Can see CRUD controls
- URL stays on `/challenges`
- Flash of parent UI before redirect

**⚠️ If this fails:** CRITICAL SECURITY BUG - Stop deployment!

---

## 🚨 Critical Failure Actions

If **Test 3 or Test 4 fails**:

1. ⛔ **STOP DEPLOYMENT IMMEDIATELY**
2. 📸 Take screenshot showing the issue
3. 🐛 Create P0 bug ticket with:
   - Which test failed (Test 3 or Test 4)
   - Which page (Challenges, Wishlist, etc.)
   - Screenshot
   - URL that should have been blocked
4. 🔔 Notify Tech Lead immediately
5. 🔄 Block production deploy until fixed

**Why critical?**
- Kids could access parent admin controls
- Parents could see wrong UI
- Role separation completely broken
- Security and UX compromised

---

## 📊 Example Test Tracking Sheet

**Page:** Challenges  
**Date:** 2026-02-21  
**Tester:** QA Team Member

| Test | Result | Notes | Screenshot |
|------|--------|-------|------------|
| Test 1: Parent nav | ✅ PASS | Landed on `/challenges`, saw admin controls | - |
| Test 2: Kid nav | ✅ PASS | Landed on `/kid/challenges`, saw quest cards | - |
| Test 3: Parent → kid URL | ✅ PASS | Got 403 Forbidden | - |
| Test 4: Kid → parent URL | ✅ PASS | Got 403 Forbidden | - |

**Overall Result:** ✅ ALL PASSED - Safe to deploy

---

## 🔄 When to Run 2x2 Tests

**Required:**
- ✅ Before every production deployment
- ✅ After any navigation code changes
- ✅ After adding new dual-mode pages

**Recommended:**
- ⭐ Weekly spot checks on high-priority pages
- ⭐ After authentication system changes
- ⭐ After route configuration updates

---

## 💡 Pro Tips for QA

**Faster Testing:**
- Use two browser windows side-by-side (parent + kid)
- Keep test credentials handy
- Test all priority 1 pages in one session

**Common Pitfalls:**
- Don't just check URL - also check page content!
- Clear browser cache between tests if needed
- Watch for brief "flash" of wrong UI before redirect

**Red Flags:**
- URL changes but content doesn't match
- "Loading..." that never resolves to correct page
- Error message but wrong page still visible

---

## 📞 Support

**Questions about this test?**
- See full test plan: `/TEST-PLAN-ROLE-BASED-NAVIGATION.md`
- Run automated suite: Click "NAV / Route Mapping (P0)" in Test Control Panel
- Contact: Tech Lead or QA Lead

---

**Remember:** This simple 2x2 matrix catches critical bugs in 2-3 minutes per page. Don't skip it! 🎯✅
