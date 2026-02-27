# ✅ Authentication Refactor - Implementation Checklist

**Date:** February 19, 2026  
**Estimated Time:** 2-3 hours  
**Risk Level:** 🟢 Low (new files don't affect existing code until activated)

---

## 📋 PRE-IMPLEMENTATION

### Backup Current System
- [ ] Commit all current changes to git
- [ ] Create backup branch: `git checkout -b auth-refactor-backup`
- [ ] Tag current version: `git tag pre-auth-refactor`
- [ ] Test current system works (baseline)

### Verify Files Created
- [ ] `/supabase/functions/server/index.tsx` (POST /kid/login added)
- [ ] `/src/app/utils/auth.ts` (new file)
- [ ] `/src/utils/api-new.ts` (new file)
- [ ] `/src/app/pages/ModeSelection.tsx` (new file)
- [ ] `/src/app/pages/ParentLoginNew.tsx` (new file)
- [ ] `/src/app/pages/KidLoginNew.tsx` (new file)
- [ ] `/src/app/routes-new.tsx` (new file)
- [ ] Documentation files (4 .md files)

---

## 🔧 PHASE 1: BACKEND TESTING (15 min)

### Test Kid Login Endpoint

**1. Deploy Backend Changes**
```bash
cd supabase/functions
supabase functions deploy server
```

**2. Test with curl**
```bash
# Get a family invite code first (from Settings → Family Info)
# Then test the endpoint:

curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-f116e23f/kid/login \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "familyCode": "ABC123",
    "kidName": "YourKidName",
    "pin": "1234"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "kidAccessToken": "kid_abc123...",
  "kid": {
    "id": "child:123",
    "name": "YourKidName",
    "avatar": "👶",
    "familyId": "family:456"
  },
  "familyCode": "ABC123",
  "expiresAt": "2026-02-20T10:00:00Z",
  "message": "Welcome back, YourKidName! ✨"
}
```

**Checklist:**
- [ ] Endpoint returns 200 for valid credentials
- [ ] Endpoint returns 404 for invalid family code
- [ ] Endpoint returns 401 for wrong PIN
- [ ] Endpoint returns kidAccessToken starting with "kid_"
- [ ] Kid object contains id, name, avatar, familyId

---

## 📦 PHASE 2: ACTIVATE NEW FILES (10 min)

### Backup Old Files
```bash
# From project root
mv src/app/routes.tsx src/app/routes-old.tsx
mv src/utils/api.ts src/utils/api-old.ts
```

### Activate New Files
```bash
mv src/app/routes-new.tsx src/app/routes.tsx
mv src/utils/api-new.ts src/utils/api.ts
```

### Verify Imports
- [ ] `/src/app/App.tsx` still imports `router` from `./routes.tsx` (should work)
- [ ] No broken imports in console
- [ ] App compiles without errors

---

## 🧪 PHASE 3: TEST PARENT FLOW (20 min)

### Parent Login Test

**Test Steps:**
1. [ ] Navigate to `/` (should show Mode Selection)
2. [ ] Click "Parent" button
3. [ ] Should redirect to `/parent/login`
4. [ ] Enter valid email + password
5. [ ] Click "Sign In"
6. [ ] Should fetch user's families
7. [ ] Should call `setParentMode(familyId)`
8. [ ] Should redirect to `/parent/home`

**Verify localStorage:**
```javascript
// Open browser console (F12)
localStorage.getItem('user_mode')       // Should be: 'parent'
localStorage.getItem('fgs_family_id')   // Should be: 'family:...'
```

**Test API Call:**
```javascript
// In browser console
import { getAuthToken } from '/src/app/utils/auth';
const { token, type } = await getAuthToken();
console.log(type);  // Should be: 'parent'
console.log(token); // Should be: 'ey...' (Supabase JWT)
```

### Parent Logout Test

**Test Steps:**
1. [ ] Click logout button (if exists) or manually call `logout()`
2. [ ] Should clear `user_mode`
3. [ ] Should clear Supabase session
4. [ ] Should redirect to `/` or `/parent/login`

**Verify localStorage:**
```javascript
localStorage.getItem('user_mode')       // Should be: null
localStorage.getItem('fgs_family_id')   // Should STILL exist! ✅
```

**Checklist:**
- [ ] Parent can log in successfully
- [ ] Parent session stored correctly
- [ ] Parent can access protected routes
- [ ] Parent logout clears session but keeps family ID
- [ ] After logout, can navigate back to Mode Selection

---

## 🧪 PHASE 4: TEST KID FLOW (20 min)

### Kid Login Test

**Prerequisites:**
- [ ] Get family invite code (Parent Settings → Family Info)
- [ ] Know a kid's name in the system
- [ ] Know the kid's PIN

**Test Steps:**
1. [ ] Navigate to `/`
2. [ ] Click "Kid" button
3. [ ] Should redirect to `/kid/login`

**Step 1: Family Code**
4. [ ] Enter family code (e.g., "ABC123")
5. [ ] Click "Next"
6. [ ] Should advance to name step

**Step 2: Kid Name**
7. [ ] Enter kid name (e.g., "Ahmed")
8. [ ] Click "Next"
9. [ ] Should advance to PIN step

**Step 3: PIN Entry**
10. [ ] Click number pad to enter 4-digit PIN
11. [ ] Should auto-submit when 4 digits entered
12. [ ] Should call `POST /kid/login`
13. [ ] Should receive kidAccessToken
14. [ ] Should call `setKidMode(...)`
15. [ ] Should redirect to `/kid/home`

**Verify localStorage:**
```javascript
localStorage.getItem('user_mode')           // Should be: 'kid'
localStorage.getItem('kid_access_token')    // Should be: 'kid_...'
localStorage.getItem('kid_id')              // Should be: 'child:...'
localStorage.getItem('kid_name')            // Should be: kid's name
localStorage.getItem('fgs_family_id')       // Should be: 'family:...'
```

**Test API Call:**
```javascript
import { getAuthToken } from '/src/app/utils/auth';
const { token, type } = await getAuthToken();
console.log(type);  // Should be: 'kid'
console.log(token); // Should be: 'kid_...'
```

### Kid Logout Test

**Test Steps:**
1. [ ] Click logout button or manually call `logout()`
2. [ ] Should clear `user_mode`
3. [ ] Should clear all `kid_*` keys
4. [ ] Should redirect to `/` or `/kid/login`

**Verify localStorage:**
```javascript
localStorage.getItem('user_mode')           // Should be: null
localStorage.getItem('kid_access_token')    // Should be: null
localStorage.getItem('kid_id')              // Should be: null
localStorage.getItem('fgs_family_id')       // Should STILL exist! ✅
```

**Checklist:**
- [ ] Kid can enter family code
- [ ] Kid can enter name
- [ ] Kid can enter PIN with number pad
- [ ] PIN auto-submits at 4 digits
- [ ] Kid login succeeds with valid credentials
- [ ] Kid session stored correctly
- [ ] Kid can access protected routes
- [ ] Kid logout clears session but keeps family ID

---

## 🔄 PHASE 5: TEST CROSS-MODE (CRITICAL!) (20 min)

### Scenario 1: Parent → Kid

**Test Steps:**
1. [ ] Parent logs in successfully
2. [ ] Verify parent mode: `localStorage.getItem('user_mode')` = 'parent'
3. [ ] Parent logs out
4. [ ] Verify mode cleared: `localStorage.getItem('user_mode')` = null
5. [ ] Verify family ID kept: `localStorage.getItem('fgs_family_id')` exists
6. [ ] Kid logs in
7. [ ] **CRITICAL:** Kid login should work (was broken before!)
8. [ ] Verify kid mode: `localStorage.getItem('user_mode')` = 'kid'

**This is the main bug fix - kid login MUST work after parent logout!**

### Scenario 2: Kid → Parent

**Test Steps:**
1. [ ] Kid logs in successfully
2. [ ] Verify kid mode: `localStorage.getItem('user_mode')` = 'kid'
3. [ ] Kid logs out
4. [ ] Verify mode cleared: `localStorage.getItem('user_mode')` = null
5. [ ] Verify family ID kept: `localStorage.getItem('fgs_family_id')` exists
6. [ ] Parent logs in
7. [ ] **CRITICAL:** Parent login should work
8. [ ] Verify parent mode: `localStorage.getItem('user_mode')` = 'parent'

### Scenario 3: Multiple Cycles

**Test Steps:**
1. [ ] Parent login → logout
2. [ ] Kid login → logout
3. [ ] Parent login → logout
4. [ ] Kid login → logout
5. [ ] All cycles should work without issues
6. [ ] `fgs_family_id` should persist throughout

**Checklist:**
- [ ] Parent login → Parent logout → Kid login works ✅
- [ ] Kid login → Kid logout → Parent login works ✅
- [ ] Multiple login/logout cycles work
- [ ] No session collision
- [ ] Family ID persists across all sessions

---

## 🌐 PHASE 6: TEST API CALLS (15 min)

### Test API in Parent Mode

**Steps:**
1. [ ] Log in as parent
2. [ ] Open browser console
3. [ ] Make test API call:

```javascript
import { get } from '/src/utils/api';
const response = await get('/families/YOUR_FAMILY_ID/children');
console.log(response);
```

4. [ ] Check Network tab → Request Headers → Authorization
5. [ ] Should be: `Bearer ey...` (Supabase JWT)

**Checklist:**
- [ ] API call succeeds
- [ ] Uses Supabase JWT token
- [ ] Response contains expected data

### Test API in Kid Mode

**Steps:**
1. [ ] Log out parent
2. [ ] Log in as kid
3. [ ] Open browser console
4. [ ] Make test API call:

```javascript
import { get } from '/src/utils/api';
const response = await get('/children/YOUR_KID_ID/points');
console.log(response);
```

5. [ ] Check Network tab → Request Headers → Authorization
6. [ ] Should be: `Bearer kid_...` (Kid access token)

**Checklist:**
- [ ] API call succeeds
- [ ] Uses kid access token
- [ ] Response contains expected data

---

## 🛡️ PHASE 7: TEST ROUTE PROTECTION (15 min)

### Test Parent Route Protection

**Steps:**
1. [ ] Log in as parent
2. [ ] Try to access `/kid/home`
3. [ ] Should redirect to `/kid/login` (not authenticated as kid)

### Test Kid Route Protection

**Steps:**
1. [ ] Log in as kid
2. [ ] Try to access `/parent/settings`
3. [ ] Should redirect to `/parent/login` (not authenticated as parent)

### Test Unauthenticated Access

**Steps:**
1. [ ] Log out completely
2. [ ] Try to access `/parent/home`
3. [ ] Should redirect to `/parent/login`
4. [ ] Try to access `/kid/home`
5. [ ] Should redirect to `/kid/login`

**Checklist:**
- [ ] Parent routes require parent auth
- [ ] Kid routes require kid auth
- [ ] Cross-mode access blocked
- [ ] Unauthenticated access blocked
- [ ] Redirects work correctly

---

## 🐛 PHASE 8: ERROR TESTING (10 min)

### Test Invalid Credentials

**Parent:**
- [ ] Try wrong email: Should show error
- [ ] Try wrong password: Should show error
- [ ] Should not crash

**Kid:**
- [ ] Try invalid family code: Should show "Invalid family code"
- [ ] Try non-existent kid name: Should show "Child not found"
- [ ] Try wrong PIN: Should show "Incorrect PIN"
- [ ] Try wrong PIN 5 times: Should lock for cooldown period
- [ ] Should not crash

### Test Network Errors

- [ ] Disable network
- [ ] Try to log in: Should show "Check your internet connection"
- [ ] Should not crash

**Checklist:**
- [ ] All error cases handled gracefully
- [ ] User-friendly error messages
- [ ] No console errors
- [ ] No app crashes

---

## 📊 PHASE 9: MIGRATION (30 min)

### Update Existing Components

**Find components using old auth:**
```bash
# Search for old patterns
grep -r "localStorage.getItem('user_role')" src/
grep -r "from '/src/utils/api-old'" src/
```

**Update to new patterns:**
```typescript
// OLD
const role = localStorage.getItem('user_role');

// NEW
import { getCurrentMode } from '/src/app/utils/auth';
const mode = getCurrentMode();
```

**Checklist:**
- [ ] Identify all components using old auth
- [ ] Update to use new auth utilities
- [ ] Test each updated component
- [ ] Remove old auth code

### Update Dashboard Routing

**Current issue:** Dashboard probably loads wrong view

**Fix:** Update dashboard router to use mode-based routing

```typescript
import { getCurrentMode } from '/src/app/utils/auth';

export function DashboardRouter() {
  const mode = getCurrentMode();
  
  if (mode === 'parent') {
    return <Navigate to="/parent/home" />;
  }
  
  if (mode === 'kid') {
    return <Navigate to="/kid/home" />;
  }
  
  return <Navigate to="/" />;
}
```

**Checklist:**
- [ ] Update dashboard router
- [ ] Parent sees parent dashboard
- [ ] Kid sees kid dashboard
- [ ] No mode confusion

---

## 🎨 PHASE 10: UI POLISH (20 min)

### Mode Selection Page
- [ ] Animations smooth
- [ ] Cards hover nicely
- [ ] Icons display correctly
- [ ] Mobile responsive

### Kid Login Page
- [ ] 3-step wizard works
- [ ] Number pad responsive
- [ ] PIN dots animate
- [ ] Back button works
- [ ] Loading states display

### Parent Login Page
- [ ] Form validates
- [ ] Loading states display
- [ ] Error messages clear
- [ ] Sign up link works

**Checklist:**
- [ ] All pages look good on desktop
- [ ] All pages look good on mobile
- [ ] Animations performant
- [ ] No visual glitches

---

## ✅ FINAL VERIFICATION (10 min)

### Complete Flow Test

**As a new user:**
1. [ ] Visit app → See mode selection
2. [ ] Choose parent → Sign up → Onboarding → Dashboard
3. [ ] Add a child with PIN
4. [ ] Log out
5. [ ] Choose kid → Enter family code, name, PIN → Dashboard
6. [ ] Log out
7. [ ] Choose parent → Log in → Dashboard

**Checklist:**
- [ ] Complete new user flow works end-to-end
- [ ] No errors in console
- [ ] No broken pages
- [ ] Both modes fully functional

### localStorage Final Check

**After all tests:**
```javascript
// Should only have these keys
localStorage.getItem('user_mode')        // 'parent' | 'kid' | null
localStorage.getItem('fgs_family_id')    // 'family:...'
// If parent mode:
// (Supabase session in separate storage)
// If kid mode:
localStorage.getItem('kid_access_token') // 'kid_...'
localStorage.getItem('kid_id')           // 'child:...'
localStorage.getItem('kid_name')         // string
localStorage.getItem('kid_avatar')       // emoji
localStorage.getItem('kid_family_code')  // string
```

**Checklist:**
- [ ] No orphaned keys from old system
- [ ] Storage keys match expected structure
- [ ] No duplicate/conflicting keys

---

## 🚀 DEPLOYMENT

### Pre-Deployment
- [ ] All tests pass
- [ ] No console errors
- [ ] No broken features
- [ ] Git commit with clear message

### Deploy Backend
```bash
cd supabase/functions
supabase functions deploy server
```

### Deploy Frontend
```bash
# Your deployment command (Netlify, Vercel, etc.)
npm run build
# Deploy build/ to hosting
```

### Post-Deployment Verification
- [ ] Test on production URL
- [ ] Parent login works
- [ ] Kid login works
- [ ] Cross-mode works
- [ ] API calls work

---

## 📝 ROLLBACK PLAN (if needed)

### If Issues Found

**Quick Rollback:**
```bash
# Restore old files
mv src/app/routes.tsx src/app/routes-new.tsx
mv src/utils/api.ts src/utils/api-new.ts
mv src/app/routes-old.tsx src/app/routes.tsx
mv src/utils/api-old.ts src/utils/api.ts
```

**Or use git:**
```bash
git checkout pre-auth-refactor
```

**Checklist:**
- [ ] Document what broke
- [ ] Test rollback works
- [ ] Plan fix
- [ ] Re-deploy when ready

---

## 🎉 SUCCESS CRITERIA

### Must Work
- [x] Parent email/password login
- [x] Kid family code + name + PIN login
- [x] Parent logout → Kid login (no collision) ← **MAIN FIX!**
- [x] Kid logout → Parent login (no collision)
- [x] API calls use correct token
- [x] Routes protect based on mode
- [x] Family ID persists across sessions

### Nice to Have
- [ ] Smooth animations
- [ ] Error messages friendly
- [ ] Mobile responsive
- [ ] Fast performance

---

## 📊 TIME ESTIMATE

- **Backend Testing:** 15 min
- **File Activation:** 10 min
- **Parent Flow Test:** 20 min
- **Kid Flow Test:** 20 min
- **Cross-Mode Test:** 20 min (CRITICAL!)
- **API Testing:** 15 min
- **Route Protection:** 15 min
- **Error Testing:** 10 min
- **Component Migration:** 30 min
- **UI Polish:** 20 min
- **Final Verification:** 10 min

**Total:** ~2.5 hours

---

## ✅ COMPLETION

Once all checkboxes are ticked:
- [ ] Create git tag: `git tag auth-refactor-complete`
- [ ] Update documentation
- [ ] Notify team
- [ ] Celebrate! 🎉

**Status:** Ready to begin implementation!

---

**Last Updated:** February 19, 2026  
**Version:** 1.0
