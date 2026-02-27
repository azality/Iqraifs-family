# Family Growth System - Comprehensive Testing Checklist
## iOS Launch Testing Protocol

**Date:** February 20, 2026  
**Version:** 1.0.2  
**Testing Environment:** Production-Ready System  

---

## 🧪 TEST EXECUTION INSTRUCTIONS

### Setup
1. Clear all browser data (localStorage, cookies, cache)
2. Open browser DevTools → Console
3. Monitor console logs for errors
4. Have test credentials ready:
   - Parent email: test@example.com
   - Parent password: test1234
   - Family code: Will be generated
   - Kid PIN: 1234

---

## ✅ AUTHENTICATION TESTS

### AT-001: Parent Signup Flow
**Priority:** CRITICAL  
**Route:** `/signup`

**Steps:**
1. Navigate to `/signup`
2. Enter email: `parent_test_${Date.now()}@example.com`
3. Enter password: `Test1234!`
4. Enter name: `Test Parent`
5. Click "Sign Up"

**Expected:**
- [ ] No console errors
- [ ] Redirect to `/onboarding`
- [ ] localStorage contains:
  - `user_role` = "parent"
  - `fgs_user_id` = [user_id]
- [ ] Supabase session created

**Console Verification:**
```javascript
localStorage.getItem('user_role') === 'parent'
localStorage.getItem('fgs_user_id') !== null
```

---

### AT-002: Parent Login Flow
**Priority:** CRITICAL  
**Route:** `/login` or `/parent-login`

**Steps:**
1. Navigate to `/login`
2. Enter credentials from AT-001
3. Click "Sign In"

**Expected:**
- [ ] No console errors
- [ ] Redirect to `/` (dashboard) or `/onboarding`
- [ ] AuthContext.accessToken populated
- [ ] localStorage `user_role` = "parent"

**Console Verification:**
```javascript
console.log('Auth check:', {
  role: localStorage.getItem('user_role'),
  userId: localStorage.getItem('fgs_user_id'),
  familyId: localStorage.getItem('fgs_family_id')
});
```

---

### AT-003: Parent Login - Invalid Credentials
**Priority:** HIGH  
**Route:** `/login`

**Steps:**
1. Navigate to `/login`
2. Enter email: `wrong@example.com`
3. Enter password: `wrongpassword`
4. Click "Sign In"

**Expected:**
- [ ] Error message displayed
- [ ] No redirect
- [ ] No console errors (handled gracefully)
- [ ] Rate limiting after 5 failed attempts

---

### AT-004: Kid Login - Valid Family Code
**Priority:** CRITICAL  
**Route:** `/kid/login`

**Prerequisites:** Complete AT-001 and AT-006 (family + child created)

**Steps:**
1. Log out parent (clear localStorage)
2. Navigate to `/kid/login`
3. Enter family code (from AT-006)
4. Click "Next"

**Expected:**
- [ ] No console errors
- [ ] Children list displayed with avatars
- [ ] localStorage does NOT contain parent session
- [ ] UI shows "Select Your Avatar"

**Console Verification:**
```javascript
console.log('Family code validated:', {
  familyId: // should be visible in network response
});
```

---

### AT-005: Kid Login - Invalid Family Code
**Priority:** HIGH  
**Route:** `/kid/login`

**Steps:**
1. Navigate to `/kid/login`
2. Enter family code: `INVALID`
3. Click "Next"

**Expected:**
- [ ] Error message: "Invalid family code"
- [ ] No redirect
- [ ] No children displayed
- [ ] Rate limiting after 5 attempts

---

### AT-006: Kid Login - PIN Verification
**Priority:** CRITICAL  
**Route:** `/kid/login`

**Prerequisites:** Complete AT-004

**Steps:**
1. Select child from list
2. Enter PIN: `1234`
3. Click "Login"

**Expected:**
- [ ] No console errors
- [ ] Redirect to `/kid/home`
- [ ] localStorage contains:
  - `user_role` = "child"
  - `kid_access_token` = [JWT token]
  - `kid_id` = [child_id]
  - `fgs_family_id` = [family_id]
  - `kid_family_code` = [family_code]
- [ ] Console shows `auth-changed` event dispatched
- [ ] FamilyContext loads child data

**Console Verification:**
```javascript
console.log('Kid login check:', {
  role: localStorage.getItem('user_role'),
  kidId: localStorage.getItem('kid_id'),
  hasToken: !!localStorage.getItem('kid_access_token'),
  familyId: localStorage.getItem('fgs_family_id')
});
```

---

### AT-007: Kid Login - Wrong PIN
**Priority:** HIGH  
**Route:** `/kid/login`

**Prerequisites:** Complete AT-004

**Steps:**
1. Select child from list
2. Enter PIN: `9999`
3. Click "Login"

**Expected:**
- [ ] Error message: "Invalid PIN"
- [ ] No redirect
- [ ] Rate limiting after 5 attempts (PIN locked for 15 minutes)
- [ ] Console shows PIN failure tracking

---

### AT-008: Session Persistence - Parent
**Priority:** HIGH

**Steps:**
1. Complete parent login (AT-002)
2. Refresh page (F5)
3. Wait for page load

**Expected:**
- [ ] No redirect to login
- [ ] User remains on dashboard
- [ ] AuthContext.accessToken still valid
- [ ] No console errors
- [ ] Session refreshed automatically

---

### AT-009: Session Persistence - Kid
**Priority:** HIGH

**Steps:**
1. Complete kid login (AT-006)
2. Refresh page (F5)
3. Wait for page load

**Expected:**
- [ ] No redirect to login
- [ ] User remains on `/kid/home`
- [ ] Child dashboard loads
- [ ] FamilyContext.getCurrentChild() returns kid
- [ ] No console errors

---

### AT-010: Logout - Parent
**Priority:** MEDIUM

**Steps:**
1. Complete parent login
2. Click "Logout" button (in sidebar or settings)
3. Observe behavior

**Expected:**
- [ ] Redirect to `/login` or `/welcome`
- [ ] localStorage cleared
- [ ] Supabase session cleared
- [ ] No console errors

---

### AT-011: Logout - Kid
**Priority:** MEDIUM

**Steps:**
1. Complete kid login
2. Click "Logout" button
3. Observe behavior

**Expected:**
- [ ] Redirect to `/kid/login`
- [ ] Kid session cleared from localStorage
- [ ] Kid token revoked on server
- [ ] No console errors

---

## 👨‍👩‍👧‍👦 FAMILY MANAGEMENT TESTS

### FM-001: Create Family (Onboarding)
**Priority:** CRITICAL  
**Route:** `/onboarding`

**Prerequisites:** Complete AT-001 (parent signup)

**Steps:**
1. After signup, should auto-redirect to `/onboarding`
2. Enter family name: `Test Family ${Date.now()}`
3. Click "Create Family"
4. Observe invite code generated

**Expected:**
- [ ] Family created successfully
- [ ] Invite code displayed (6 uppercase letters, e.g., "ABC123")
- [ ] localStorage `fgs_family_id` set
- [ ] Toast notification: "Family created!"
- [ ] Proceed to child creation step

**Console Verification:**
```javascript
const familyId = localStorage.getItem('fgs_family_id');
const inviteCode = // displayed in UI
console.log('Family created:', { familyId, inviteCode });
```

**Save for later tests:**
- [ ] Copy invite code for kid login tests
- [ ] Copy familyId for API tests

---

### FM-002: Add Child to Family
**Priority:** CRITICAL  
**Route:** `/onboarding` (step 2) or `/settings`

**Prerequisites:** Complete FM-001

**Steps:**
1. Enter child name: `Ahmed`
2. Select avatar: 🧒
3. Enter PIN: `1234`
4. Confirm PIN: `1234`
5. Click "Add Child"

**Expected:**
- [ ] Child created successfully
- [ ] Child appears in children list
- [ ] Child has unique ID (child:timestamp format)
- [ ] PIN hashed in database (never stored plain text)
- [ ] No console errors

**Console Verification:**
```javascript
// Check in Settings page → Children tab
// Should see child in list
```

---

### FM-003: Add Second Child
**Priority:** HIGH  
**Route:** `/settings`

**Prerequisites:** Complete FM-002

**Steps:**
1. Navigate to `/settings`
2. Click "Children" tab
3. Click "Add Child"
4. Enter name: `Fatima`
5. Select avatar: 👧
6. Enter PIN: `4321`
7. Confirm PIN: `4321`
8. Click "Save"

**Expected:**
- [ ] Second child created
- [ ] Both children visible in dropdown
- [ ] Each child has unique ID
- [ ] No conflicts with existing child

---

### FM-004: Update Child Profile
**Priority:** MEDIUM  
**Route:** `/settings`

**Prerequisites:** Complete FM-002

**Steps:**
1. Navigate to `/settings` → Children tab
2. Select child to edit
3. Change name to `Ahmed Updated`
4. Change avatar to 👦
5. Click "Save"

**Expected:**
- [ ] Child updated successfully
- [ ] Changes reflected immediately
- [ ] Toast notification
- [ ] No console errors

---

### FM-005: Change Child PIN
**Priority:** HIGH (Security)  
**Route:** `/settings`

**Prerequisites:** Complete FM-002

**Steps:**
1. Navigate to `/settings` → Children tab
2. Select child
3. Click "Change PIN"
4. Enter new PIN: `5678`
5. Confirm PIN: `5678`
6. Click "Save"

**Expected:**
- [ ] PIN updated successfully
- [ ] Old PIN no longer works for login
- [ ] New PIN works for login (verify with AT-006)
- [ ] PIN hashed in database

---

### FM-006: Generate Invite Code
**Priority:** HIGH  
**Route:** `/settings`

**Prerequisites:** Complete FM-001

**Steps:**
1. Navigate to `/settings` → Family tab
2. View invite code
3. Click "Regenerate" (if available)

**Expected:**
- [ ] Invite code displayed
- [ ] Code is 6 uppercase letters
- [ ] Code works for kid login
- [ ] Old code invalidated if regenerated

---

### FM-007: Family Invite System
**Priority:** MEDIUM  
**Route:** `/settings` → Invites

**Prerequisites:** Parent account

**Steps:**
1. Navigate to `/settings` → Invites tab
2. Click "Create Invite"
3. Select invite type (if applicable)
4. Copy invite link/code

**Expected:**
- [ ] Invite created
- [ ] Invite code/link generated
- [ ] Invite visible in list
- [ ] Pending status

---

### FM-008: Accept Family Invite
**Priority:** MEDIUM  
**Route:** `/join-pending` or invite link

**Prerequisites:** FM-007

**Steps:**
1. Logout current parent
2. Signup new parent account
3. Use invite link/code from FM-007
4. Accept invitation

**Expected:**
- [ ] Redirected to family dashboard
- [ ] Access to family data
- [ ] Cannot modify other parents' children (if applicable)

---

## 📊 DATA FLOW TESTS

### DF-001: Parent Dashboard - Load Family Data
**Priority:** CRITICAL  
**Route:** `/`

**Prerequisites:** Parent logged in, family created, children added

**Steps:**
1. Login as parent
2. Navigate to `/` (dashboard)
3. Observe data loading

**Expected:**
- [ ] Children list loaded
- [ ] First child auto-selected
- [ ] Quick stats displayed (points, events, attendance)
- [ ] Activity feed populated
- [ ] No "Please select a child" message
- [ ] No console errors

**Console Verification:**
```javascript
// Open React DevTools → Components → FamilyContext
// Verify:
// - children array has items
// - selectedChildId is set
// - pointEvents array populated
```

---

### DF-002: Kid Dashboard - Load Child Data
**Priority:** CRITICAL  
**Route:** `/kid/home`

**Prerequisites:** Kid logged in

**Steps:**
1. Login as kid (AT-006)
2. Navigate to `/kid/home` (should auto-redirect after login)
3. Observe data loading

**Expected:**
- [ ] Child dashboard loads
- [ ] Points display shows current points
- [ ] Daily trackables visible (checkboxes)
- [ ] Quest cards displayed (if any)
- [ ] Milestones progress shown
- [ ] No "Please select a child" error
- [ ] No 401 errors in console

**Console Verification:**
```javascript
// Check console for:
// "Kid logged in, auto-selecting child: child:xxx"
// "Family data loaded: { childCount: X }"
// NO errors like "Child not found" or "401 Unauthorized"
```

---

### DF-003: Select Different Child (Parent Mode)
**Priority:** HIGH  
**Route:** `/`

**Prerequisites:** Parent logged in, multiple children exist

**Steps:**
1. Login as parent
2. Dashboard shows child selector dropdown
3. Select different child from dropdown
4. Observe data refresh

**Expected:**
- [ ] Dashboard updates with new child's data
- [ ] Points reflect selected child
- [ ] Activity feed changes
- [ ] No flicker or double-loading
- [ ] Console shows "Setting selectedChildId: child:xxx"

---

### DF-004: Cross-Family Data Isolation
**Priority:** CRITICAL (Security)  
**Route:** API level

**Prerequisites:** Two separate families created

**Steps:**
1. Login as Parent Family A
2. Note familyId and childId from Family A
3. Logout and login as Parent Family B
4. Attempt to access Family A's data via browser DevTools:
   ```javascript
   // Try to fetch Family A's children with Family B's token
   fetch('https://[PROJECT].supabase.co/functions/v1/make-server-f116e23f/families/[FAMILY_A_ID]/children', {
     headers: {
       'Authorization': `Bearer ${localStorage.getItem('fgs_access_token')}`
     }
   })
   ```

**Expected:**
- [ ] API returns 403 Forbidden
- [ ] Error message: "Access denied to this family"
- [ ] NO data from Family A returned
- [ ] Middleware `requireFamilyAccess()` blocks request

---

## 🎯 BEHAVIOR TRACKING TESTS

### BT-001: Log Positive Behavior (Parent)
**Priority:** CRITICAL  
**Route:** `/log`

**Prerequisites:** Parent logged in, trackable items configured

**Steps:**
1. Navigate to `/log`
2. Select child from dropdown
3. Click "Prayed Fajr" (or any positive habit)
4. Click "Log"

**Expected:**
- [ ] Success toast notification
- [ ] Points added to child's total
- [ ] Event appears in activity feed
- [ ] Dashboard updates immediately
- [ ] No console errors

**Console Verification:**
```javascript
// Check API call:
// POST /point-events
// Response: { id: "event:xxx", points: 10, ... }
```

---

### BT-002: Log Negative Behavior (Parent)
**Priority:** HIGH  
**Route:** `/log`

**Prerequisites:** Parent logged in

**Steps:**
1. Navigate to `/log`
2. Select child
3. Click "Talked back" (or any negative behavior)
4. Enter reason/note
5. Click "Log"

**Expected:**
- [ ] Success toast
- [ ] Points deducted from child's total
- [ ] Event marked as negative (red indicator)
- [ ] Recovery option available for kid
- [ ] No console errors

---

### BT-003: Kid Submits Recovery Action
**Priority:** HIGH  
**Route:** `/kid/home`

**Prerequisites:** Kid logged in, negative event exists

**Steps:**
1. Login as kid
2. Kid dashboard shows recovery opportunity
3. Click "Make it Right"
4. Select recovery action: "Apology", "Reflection", or "Correction"
5. Enter notes
6. Submit

**Expected:**
- [ ] Recovery event logged
- [ ] Points partially restored (2-5 points based on action)
- [ ] Recovery event linked to original negative event
- [ ] Toast notification
- [ ] Dashboard updates

---

### BT-004: Duplicate Detection - Same Item Logged Twice
**Priority:** MEDIUM  
**Route:** `/log`

**Prerequisites:** Parent logged in

**Steps:**
1. Navigate to `/log`
2. Log "Prayed Fajr" for child at 8:00 AM
3. Immediately log "Prayed Fajr" again for same child

**Expected:**
- [ ] Duplicate detection alert (if implemented)
- [ ] OR both events logged with timestamps
- [ ] No data corruption
- [ ] Console may show deduplication logic

---

### BT-005: Manual Point Adjustment
**Priority:** HIGH  
**Route:** `/adjustments`

**Prerequisites:** Parent logged in

**Steps:**
1. Navigate to `/adjustments`
2. Select child
3. Enter points: `50`
4. Enter reason: "Helped grandma for a week"
5. Click "Add Adjustment"

**Expected:**
- [ ] Adjustment logged
- [ ] Event marked as `isAdjustment: true`
- [ ] Points added to child total
- [ ] Reason visible in audit trail
- [ ] Cannot be hidden by kid

---

## 🏆 GAMIFICATION TESTS

### GT-001: Quest Display (Kid View)
**Priority:** HIGH  
**Route:** `/challenges`

**Prerequisites:** Kid logged in, quests configured

**Steps:**
1. Login as kid
2. Navigate to `/challenges`
3. View available quests

**Expected:**
- [ ] Quest cards displayed
- [ ] Each quest shows:
  - Title
  - Description
  - Point reward
  - Progress (if started)
  - Target (e.g., "5/7 days")
- [ ] Active quests have "Start" or "Continue" button
- [ ] Completed quests show checkmark

**Console Verification:**
```javascript
// Check API call:
// GET /children/[childId]/challenges
// Response: array of challenges
```

---

### GT-002: Complete Quest
**Priority:** HIGH  
**Route:** `/challenges` and `/kid/home`

**Prerequisites:** Kid logged in, active quest exists

**Steps:**
1. Identify quest: "Pray Fajr 5 Days"
2. Log Fajr prayer 5 times (via parent at `/log` or kid at `/kid/home`)
3. Navigate to `/challenges`
4. Observe quest status

**Expected:**
- [ ] Quest progress updates (e.g., "4/5 completed")
- [ ] On 5th completion:
  - Quest marked complete
  - Points reward added
  - Confetti animation (if implemented)
  - Toast notification
- [ ] Dashboard points reflect reward

---

### GT-003: Dynamic Quest Generation
**Priority:** MEDIUM (Backend)  
**Route:** Server

**Prerequisites:** Parent configures trackable items

**Steps:**
1. As parent, navigate to `/settings` → Habits
2. Add new habit: "Read Quran 10 minutes"
3. Set points: 15
4. Save
5. Wait for quest system to generate quests
6. Login as kid and check `/challenges`

**Expected:**
- [ ] New quest auto-generated based on habit
- [ ] Quest title includes habit name
- [ ] Quest points related to habit points
- [ ] Quest appears in kid's challenge list

**Console Verification:**
```javascript
// Check server logs (if accessible):
// "Generated quest for trackable: Read Quran"
```

---

### GT-004: Milestone Progress
**Priority:** MEDIUM  
**Route:** `/kid/home` and `/`

**Prerequisites:** Kid has points near a milestone

**Steps:**
1. Check current points (e.g., 45 points)
2. Check next milestone (e.g., 50 points = "Rising Star")
3. Log behavior to earn 5+ points
4. Observe milestone achievement

**Expected:**
- [ ] Progress bar updates
- [ ] On milestone reached:
  - Celebration animation
  - Toast: "You earned: Rising Star! ⭐"
  - Badge/title unlocked
- [ ] Milestone visible in `/titles-badges`

---

### GT-005: Wishlist - Kid Adds Item
**Priority:** HIGH  
**Route:** `/kid/wishlist`

**Prerequisites:** Kid logged in

**Steps:**
1. Navigate to `/kid/wishlist`
2. Click "Add to Wishlist"
3. Enter item name: "New book"
4. Select reward from catalog (if available) or enter custom
5. Click "Request"

**Expected:**
- [ ] Wishlist item created
- [ ] Status: "Pending"
- [ ] Item appears in kid's wishlist
- [ ] Parent can see it in `/wishlist` (parent view)

---

### GT-006: Wishlist - Parent Approves
**Priority:** HIGH  
**Route:** `/wishlist`

**Prerequisites:** GT-005 completed

**Steps:**
1. Login as parent
2. Navigate to `/wishlist`
3. See pending wishlist items
4. Click "Approve" on kid's request

**Expected:**
- [ ] Item status changes to "Approved"
- [ ] Kid can now redeem with points (if enough)
- [ ] Toast notification to parent
- [ ] Kid sees "Approved" status on refresh

---

### GT-007: Reward Redemption Request
**Priority:** HIGH  
**Route:** `/kid/wishlist`

**Prerequisites:** GT-006 completed, kid has enough points

**Steps:**
1. Login as kid
2. Navigate to `/kid/wishlist`
3. Find approved item
4. Click "Redeem" (if button enabled)
5. Confirm redemption

**Expected:**
- [ ] Redemption request created
- [ ] Status: "Pending Fulfillment"
- [ ] Points NOT YET deducted
- [ ] Parent sees request in `/redemption-requests`

---

### GT-008: Redemption - Parent Fulfills
**Priority:** HIGH  
**Route:** `/redemption-requests`

**Prerequisites:** GT-007 completed

**Steps:**
1. Login as parent
2. Navigate to `/redemption-requests`
3. See pending redemption
4. Click "Mark as Fulfilled"
5. Confirm

**Expected:**
- [ ] Points deducted from kid's total
- [ ] Redemption status: "Fulfilled"
- [ ] Wishlist item marked as redeemed
- [ ] Kid sees "Redeemed" status
- [ ] Activity feed shows redemption event

---

## 📅 ATTENDANCE TESTS

### AT-101: Create Attendance Provider
**Priority:** MEDIUM  
**Route:** `/attendance`

**Prerequisites:** Parent logged in

**Steps:**
1. Navigate to `/attendance`
2. Click "Add Activity"
3. Enter name: "Quran Class"
4. Enter schedule: "Monday, Wednesday"
5. Enter cost: "50" (optional)
6. Click "Save"

**Expected:**
- [ ] Provider created
- [ ] Appears in provider list
- [ ] No console errors

---

### AT-102: Log Attendance
**Priority:** MEDIUM  
**Route:** `/attendance`

**Prerequisites:** AT-101 completed

**Steps:**
1. Select child from dropdown
2. Select provider: "Quran Class"
3. Select date: Today
4. Mark "Attended"
5. Click "Save"

**Expected:**
- [ ] Attendance record created
- [ ] Record appears in attendance history
- [ ] Toast notification

---

### AT-103: Duplicate Attendance Detection
**Priority:** HIGH  
**Route:** `/attendance`

**Prerequisites:** AT-102 completed

**Steps:**
1. Attempt to log attendance for same:
   - Child
   - Provider
   - Date
2. Click "Save"

**Expected:**
- [ ] Error message: "Attendance already logged for this date"
- [ ] Duplicate NOT created
- [ ] Existing record unchanged

---

### AT-104: Export Attendance to PDF
**Priority:** LOW  
**Route:** `/attendance`

**Prerequisites:** Multiple attendance records exist

**Steps:**
1. Navigate to `/attendance`
2. Select date range
3. Click "Export to PDF"

**Expected:**
- [ ] PDF generated
- [ ] Contains all attendance records in range
- [ ] Formatted table with dates, children, providers
- [ ] Download triggered

---

## 🔒 SECURITY TESTS

### SEC-001: Token Expiration Handling
**Priority:** CRITICAL  
**Route:** Any protected route

**Prerequisites:** Parent logged in

**Steps:**
1. Login as parent
2. Manually expire token (in DevTools):
   ```javascript
   // Wait 1 hour OR manually corrupt token
   localStorage.setItem('fgs_access_token', 'invalid_token');
   ```
3. Make an API call (e.g., navigate to `/log`)

**Expected:**
- [ ] 401 Unauthorized error
- [ ] AuthContext attempts session refresh
- [ ] If refresh fails, redirect to login
- [ ] User prompted to re-authenticate
- [ ] No data corruption

---

### SEC-002: Kid Session Isolation
**Priority:** CRITICAL  
**Route:** API level

**Prerequisites:** Kid logged in

**Steps:**
1. Login as kid
2. Note kid_access_token from localStorage
3. Attempt to access parent-only endpoint via DevTools:
   ```javascript
   fetch('https://[PROJECT].supabase.co/functions/v1/make-server-f116e23f/families', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${localStorage.getItem('kid_access_token')}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({ name: 'Hacked Family' })
   })
   ```

**Expected:**
- [ ] API returns 403 Forbidden
- [ ] Error: "Parent access required"
- [ ] No family created
- [ ] Middleware `requireParent()` blocks request

---

### SEC-003: Rate Limiting - Login
**Priority:** HIGH  
**Route:** `/login`

**Steps:**
1. Navigate to `/login`
2. Enter invalid credentials
3. Submit 6 times in a row

**Expected:**
- [ ] After 5 failed attempts:
  - Error: "Too many attempts. Try again in 15 minutes"
  - Login form disabled
  - Rate limit enforced
- [ ] Backend logs rate limit violation
- [ ] IP/user locked temporarily

---

### SEC-004: Rate Limiting - PIN Attempts
**Priority:** CRITICAL (Kid Security)  
**Route:** `/kid/login`

**Steps:**
1. Navigate to `/kid/login`
2. Enter valid family code
3. Select child
4. Enter wrong PIN 6 times

**Expected:**
- [ ] After 5 failed attempts:
  - Error: "Too many failed attempts. Account locked for 15 minutes"
  - PIN input disabled
  - Kid cannot login
- [ ] Backend tracks PIN failures
- [ ] Device hash + childId combination locked

---

### SEC-005: XSS Prevention
**Priority:** HIGH  
**Route:** Any input field

**Steps:**
1. Navigate to `/log`
2. In notes field, enter:
   ```html
   <script>alert('XSS')</script>
   ```
3. Submit

**Expected:**
- [ ] Script NOT executed
- [ ] Input sanitized or escaped
- [ ] Displayed as plain text in UI
- [ ] No console errors

---

### SEC-006: SQL Injection Prevention (API)
**Priority:** HIGH  
**Route:** API level

**Steps:**
1. Attempt to inject SQL in API calls:
   ```javascript
   fetch('https://[PROJECT].supabase.co/functions/v1/make-server-f116e23f/children?familyId=family:123 OR 1=1', {
     headers: {
       'Authorization': `Bearer ${token}`
     }
   })
   ```

**Expected:**
- [ ] API validation rejects malformed familyId
- [ ] Error: "Invalid family ID format"
- [ ] No database query executed
- [ ] Middleware `validate()` blocks request

---

## 🚀 PERFORMANCE TESTS

### PERF-001: Initial Page Load
**Priority:** MEDIUM

**Steps:**
1. Clear cache
2. Navigate to `/` (parent dashboard)
3. Measure load time

**Expected:**
- [ ] Page loads in < 3 seconds
- [ ] No blocking JavaScript
- [ ] Images lazy-loaded
- [ ] Tailwind CSS loaded

**Use Chrome DevTools → Performance tab**

---

### PERF-002: Dashboard Data Load
**Priority:** MEDIUM  
**Route:** `/`

**Steps:**
1. Login as parent
2. Dashboard loads family data
3. Measure API call duration

**Expected:**
- [ ] All API calls complete in < 2 seconds
- [ ] Parallel API calls (children + events + attendance)
- [ ] No sequential blocking
- [ ] Loading skeletons displayed during fetch

**Console Verification:**
```javascript
// Check Network tab:
// GET /families/:id → < 500ms
// GET /children → < 500ms
// GET /events → < 1000ms
```

---

### PERF-003: Quest Card Rendering (100+ quests)
**Priority:** LOW  
**Route:** `/challenges`

**Prerequisites:** Generate 100+ quests (test data)

**Steps:**
1. Login as kid
2. Navigate to `/challenges`
3. Observe rendering performance

**Expected:**
- [ ] Page loads smoothly
- [ ] Virtualization or pagination implemented (if 100+)
- [ ] No UI freeze
- [ ] Smooth scrolling

---

## 🐛 ERROR HANDLING TESTS

### ERR-001: Network Failure
**Priority:** HIGH

**Steps:**
1. Login as parent
2. Open DevTools → Network tab
3. Set throttling to "Offline"
4. Navigate to `/log`

**Expected:**
- [ ] Toast error: "Network error. Please check connection"
- [ ] Retry option available
- [ ] UI doesn't break
- [ ] Data not lost

---

### ERR-002: Server Error (500)
**Priority:** HIGH

**Steps:**
1. Simulate 500 error (modify API response in DevTools OR trigger server error)
2. Observe behavior

**Expected:**
- [ ] Toast error: "Server error. Please try again"
- [ ] Error logged to console
- [ ] UI remains functional
- [ ] ErrorBoundary catches error (if React error)

---

### ERR-003: Invalid API Response
**Priority:** MEDIUM

**Steps:**
1. Mock API to return invalid JSON
2. Make API call (e.g., load children)

**Expected:**
- [ ] Error caught gracefully
- [ ] Toast error: "Invalid response from server"
- [ ] UI doesn't crash
- [ ] Console error logged

---

## 🎨 UI/UX TESTS

### UI-001: Responsive Design - Mobile
**Priority:** HIGH

**Steps:**
1. Open DevTools → Toggle device toolbar
2. Select iPhone 12 Pro
3. Navigate through all major pages

**Expected:**
- [ ] All pages responsive
- [ ] No horizontal scroll
- [ ] Buttons accessible (not cut off)
- [ ] Font sizes readable
- [ ] Sidebar collapses to hamburger menu

---

### UI-002: Dark Mode (if implemented)
**Priority:** LOW

**Steps:**
1. Toggle dark mode
2. Navigate through app

**Expected:**
- [ ] All pages respect dark mode
- [ ] No white flashes
- [ ] Contrast sufficient
- [ ] No broken colors

---

### UI-003: Animation Performance
**Priority:** LOW  
**Route:** `/kid/home`

**Steps:**
1. Login as kid
2. Complete quest → trigger confetti
3. Log behavior → points animation

**Expected:**
- [ ] Animations smooth (60fps)
- [ ] No jank
- [ ] Confetti clears after animation

---

## 📱 iOS-SPECIFIC TESTS

### iOS-001: Install as PWA
**Priority:** MEDIUM (if PWA enabled)

**Steps:**
1. Open app in Safari (iOS)
2. Tap "Share" → "Add to Home Screen"
3. Open app from home screen

**Expected:**
- [ ] App installs
- [ ] Icon displays correctly
- [ ] Opens in standalone mode (no Safari UI)
- [ ] Navigation works

---

### iOS-002: Offline Mode (if implemented)
**Priority:** LOW

**Steps:**
1. Use app while online
2. Turn off WiFi/data
3. Navigate app

**Expected:**
- [ ] Cached data still accessible
- [ ] Error messages for network-required actions
- [ ] App doesn't crash

---

## 🔍 EDGE CASES

### EDGE-001: No Children in Family
**Priority:** MEDIUM

**Steps:**
1. Create family (don't add children)
2. Navigate to dashboard

**Expected:**
- [ ] Empty state displayed
- [ ] Message: "Add your first child to get started"
- [ ] CTA button to add child
- [ ] No console errors

---

### EDGE-002: Child with 0 Points
**Priority:** LOW

**Steps:**
1. Create child
2. Log negative behaviors until points = 0 or negative

**Expected:**
- [ ] Points display shows 0 (or negative if allowed)
- [ ] No rewards redeemable
- [ ] UI handles gracefully
- [ ] Recovery options still available

---

### EDGE-003: Expired Quests
**Priority:** MEDIUM

**Steps:**
1. Create quest with end date in past (manual DB edit)
2. Login as kid
3. View `/challenges`

**Expected:**
- [ ] Expired quest NOT displayed
- [ ] OR displayed as "Expired" with grayed out UI
- [ ] Cannot be started/completed

---

### EDGE-004: Multiple Devices (Same Kid)
**Priority:** HIGH

**Prerequisites:** Kid logged in on two devices

**Steps:**
1. Device A: Login as kid
2. Device B: Login as same kid
3. Device A: Complete quest
4. Device B: Refresh

**Expected:**
- [ ] Device B shows updated points/quest status
- [ ] No data conflicts
- [ ] Session valid on both devices
- [ ] Race conditions handled

---

## ✅ FINAL PRE-LAUNCH CHECKLIST

### Code Quality
- [ ] Remove all debug console.logs (or disable in production)
- [ ] Remove debug routes (`/debug-auth`, `/debug-storage`, etc.)
- [ ] No `// TODO` or `// FIXME` comments in critical code
- [ ] All TypeScript errors resolved
- [ ] No unused imports

### Security
- [ ] Environment variables secured (.env not committed)
- [ ] API keys rotated (if shared publicly)
- [ ] Rate limiting tested and working
- [ ] CORS configured correctly
- [ ] JWT secrets strong and secure

### Performance
- [ ] Bundle size optimized
- [ ] Images compressed
- [ ] Lazy loading implemented
- [ ] API calls minimized (no N+1 queries)

### Documentation
- [ ] README.md updated
- [ ] API documentation complete (if public)
- [ ] Architecture diagram available
- [ ] Onboarding guide for new developers

### Deployment
- [ ] Production environment configured (Supabase)
- [ ] Netlify/Vercel deployment successful
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate valid
- [ ] Analytics/monitoring set up (optional)

---

## 🎯 TEST EXECUTION SUMMARY

**Total Tests:** 80+  
**Critical Tests:** 20  
**High Priority:** 35  
**Medium Priority:** 20  
**Low Priority:** 10  

**Recommended Execution Order:**
1. Authentication Tests (AT-001 to AT-011) - 2 hours
2. Family Management Tests (FM-001 to FM-008) - 2 hours
3. Data Flow Tests (DF-001 to DF-004) - 1 hour
4. Behavior Tracking Tests (BT-001 to BT-005) - 1.5 hours
5. Gamification Tests (GT-001 to GT-008) - 2 hours
6. Security Tests (SEC-001 to SEC-006) - 1.5 hours
7. Edge Cases (EDGE-001 to EDGE-004) - 1 hour
8. Final Checklist - 0.5 hours

**Total Estimated Time:** 12 hours

**Suggested Team:**
- QA Lead: 1 person
- Developers: 2 people
- Product Manager: 1 person (for UX tests)

---

**End of Testing Checklist**
