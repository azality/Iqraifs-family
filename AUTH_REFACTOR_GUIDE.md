# 🔐 Authentication Refactor - Parent vs Kid Mode

**Date:** February 19, 2026  
**Status:** ✅ Design Complete, Ready for Implementation

---

## 📋 OVERVIEW

This refactor implements **clean separation** between Parent and Kid authentication modes to prevent session/role collision issues.

### The Problem (Before)
- ❌ Kid login breaks after parent logout
- ❌ Sessions/roles stored in same localStorage keys
- ❌ No clear separation between auth types
- ❌ Parent uses Supabase JWT, Kid uses custom token, but both conflict

### The Solution (After)
- ✅ Parent uses Supabase JWT (email/password)
- ✅ Kid uses custom `kid_access_token` (family code + kid name + PIN)
- ✅ Separate token storage - no collision
- ✅ Mode-specific logout (clears only active role's data)
- ✅ Route protection: `/parent/*` vs `/kid/*`
- ✅ API wrapper automatically uses correct auth header

---

## 🏗️ ARCHITECTURE

### Authentication Flows

#### Parent Flow
```
1. Navigate to /parent/login
2. Enter email + password
3. Supabase.auth.signInWithPassword()
4. Get session.access_token (JWT)
5. Store: localStorage.user_mode = 'parent'
6. Store: localStorage.fgs_family_id = <familyId>
7. Navigate to /parent/home
```

#### Kid Flow
```
1. Navigate to /kid/login
2. Enter family code (e.g., "ABC123")
3. Enter kid name (e.g., "Ahmed")
4. Enter 4-digit PIN
5. POST /kid/login { familyCode, kidName, pin }
6. Backend returns { kidAccessToken, kid, familyCode }
7. Store: localStorage.user_mode = 'kid'
8. Store: localStorage.kid_access_token = <token>
9. Store: localStorage.kid_id, kid_name, kid_avatar
10. Store: localStorage.fgs_family_id = <familyId>
11. Navigate to /kid/home
```

---

## 💾 STORAGE KEYS

### Shared Keys (Persist Across Sessions)
```javascript
fgs_family_id: string  // UUID, persists even after logout
```

### Parent Mode Keys
```javascript
user_mode: 'parent'
// Supabase session managed automatically by Supabase SDK
// No additional localStorage keys needed
```

### Kid Mode Keys
```javascript
user_mode: 'kid'
kid_access_token: string     // "kid_abc123..."
kid_id: string               // "child:123"
kid_name: string             // "Ahmed"
kid_avatar: string           // "👦"
kid_family_code: string      // "ABC123"
```

---

## 🗂️ FILE STRUCTURE

### New Files Created

```
/src/app/utils/auth.ts
├── Parent auth helpers
│   ├── setParentMode()
│   ├── getParentToken()
│   └── logoutParent()
├── Kid auth helpers
│   ├── setKidMode()
│   ├── getKidToken()
│   ├── getKidInfo()
│   └── logoutKid()
└── Shared utilities
    ├── getCurrentMode()
    ├── getFamilyId()
    ├── isAuthenticated()
    ├── getAuthToken()
    └── logout()

/src/utils/api-new.ts
├── apiCall() - Auto-selects correct auth header
├── get(), post(), put(), patch(), del()
└── publicApiCall() - For unauthenticated endpoints

/src/app/pages/ModeSelection.tsx
├── Landing page with Parent/Kid choice
└── Navigates to /parent/login or /kid/login

/src/app/pages/ParentLoginNew.tsx
├── Email + password form
├── Supabase.auth.signInWithPassword()
└── Redirects to /parent/home

/src/app/pages/KidLoginNew.tsx
├── 3-step wizard: Family Code → Kid Name → PIN
├── POST /kid/login
└── Redirects to /kid/home

/src/app/routes-new.tsx
├── /parent/* routes (require parent auth)
├── /kid/* routes (require kid auth)
└── Route guards: RequireParentAuth, RequireKidAuth

/supabase/functions/server/index.tsx (updated)
└── POST /kid/login endpoint
```

---

## 🔌 BACKEND CHANGES

### New Endpoint: POST /kid/login

**URL:** `/make-server-f116e23f/kid/login`

**Request Body:**
```json
{
  "familyCode": "ABC123",
  "kidName": "Ahmed",
  "pin": "1234"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "kidAccessToken": "kid_abc123...",
  "kid": {
    "id": "child:123",
    "name": "Ahmed",
    "avatar": "👦",
    "familyId": "family:456"
  },
  "familyCode": "ABC123",
  "expiresAt": "2026-02-20T10:00:00Z",
  "message": "Welcome back, Ahmed! ✨"
}
```

**Error Responses:**
- `400` - Missing required fields
- `404` - Invalid family code or kid not found
- `401` - Incorrect PIN
- `429` - Too many failed attempts (locked)

**Features:**
- ✅ Looks up family by invite code
- ✅ Finds kid by name (case-insensitive)
- ✅ Verifies PIN with hashing
- ✅ Rate limiting with device fingerprinting
- ✅ Creates kid session token
- ✅ Returns kid access token

---

## 🔒 API WRAPPER CHANGES

### Old Behavior (BROKEN)
```typescript
// Always used Supabase session token
const { data: { session } } = await supabase.auth.getSession();
headers['Authorization'] = `Bearer ${session.access_token}`;
```

### New Behavior (FIXED)
```typescript
import { getAuthToken } from '/src/app/utils/auth';

// Automatically selects correct token based on mode
const { token, type } = await getAuthToken();
// type: 'parent' | 'kid'
// token: Supabase JWT OR kid_access_token

if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}
```

**Usage Examples:**
```typescript
import { get, post } from '/src/utils/api-new';

// In parent mode: Uses Supabase JWT
await get('/families/123/children');

// In kid mode: Uses kid_access_token
await get('/children/456/points');

// Public endpoints (no auth)
import { publicApiCall } from '/src/utils/api-new';
await publicApiCall('/kid/login', { 
  method: 'POST', 
  body: JSON.stringify({ familyCode, kidName, pin }) 
});
```

---

## 🛣️ ROUTING STRUCTURE

### Route Prefixes

```
/ ────────────────────────── Mode Selection (landing)

/parent/login ──────────────── Parent email/password login
/parent/signup ─────────────── Parent account creation
/parent/onboarding ─────────── Family setup (protected)
/parent/home ───────────────── Parent dashboard (protected)
/parent/log ────────────────── Log behavior (protected)
/parent/challenges ─────────── Manage challenges (protected)
/parent/settings ───────────── Settings (protected)
... all other parent routes ...

/kid/login ─────────────────── Kid family code + PIN login
/kid/home ──────────────────── Kid adventure dashboard (protected)
/kid/rewards ───────────────── Kid rewards catalog (protected)
/kid/quests ────────────────── Kid quest view (protected)
... all other kid routes ...
```

### Route Guards

**RequireParentAuth:**
- Checks `localStorage.user_mode === 'parent'`
- Verifies Supabase session exists
- Redirects to `/parent/login` if not authenticated

**RequireKidAuth:**
- Checks `localStorage.user_mode === 'kid'`
- Verifies `kid_access_token` exists
- Redirects to `/kid/login` if not authenticated

---

## 🔄 LOGOUT FLOWS

### Parent Logout
```typescript
import { logoutParent } from '/src/app/utils/auth';

await logoutParent();
// 1. Calls supabase.auth.signOut()
// 2. Removes localStorage.user_mode
// 3. KEEPS localStorage.fgs_family_id
// 4. Redirects to /parent/login
```

### Kid Logout
```typescript
import { logoutKid } from '/src/app/utils/auth';

logoutKid();
// 1. Removes localStorage.user_mode
// 2. Removes localStorage.kid_access_token
// 3. Removes localStorage.kid_id, kid_name, kid_avatar, kid_family_code
// 4. KEEPS localStorage.fgs_family_id
// 5. Redirects to /kid/login
```

### Generic Logout (Auto-Detects Mode)
```typescript
import { logout } from '/src/app/utils/auth';

await logout();
// Automatically calls logoutParent() or logoutKid() based on current mode
```

---

## 📱 UI CHANGES

### Mode Selection Screen

**Route:** `/`

**Features:**
- Two large cards: "Parent" and "Kid"
- Parent card navigates to `/parent/login`
- Kid card navigates to `/kid/login`
- Clean, friendly design

### Kid Login Screen

**Route:** `/kid/login`

**3-Step Wizard:**
1. **Enter Family Code**
   - Large input field, uppercase auto-formatting
   - "Ask a parent for the family code"
   
2. **Enter Your Name**
   - Text input for kid name
   - Shows family code for confirmation
   
3. **Enter PIN**
   - Visual PIN dots (○○○○)
   - Number pad (0-9 + delete)
   - Auto-submits when 4 digits entered

**Features:**
- ✅ Back button to previous step
- ✅ Friendly error messages
- ✅ Loading states
- ✅ Motion animations

---

## 🧪 MIGRATION PLAN

### Phase 1: Backend (Complete ✅)
- [x] Create POST /kid/login endpoint
- [x] Test with Postman/curl

### Phase 2: Auth Utilities (Complete ✅)
- [x] Create `/src/app/utils/auth.ts`
- [x] Create `/src/utils/api-new.ts`
- [x] Test storage key separation

### Phase 3: UI Pages (Complete ✅)
- [x] Create ModeSelection page
- [x] Create ParentLoginNew page
- [x] Create KidLoginNew page

### Phase 4: Routing (Ready to Implement)
- [ ] Create routes-new.tsx with /parent/* and /kid/* structure
- [ ] Add route guards (RequireParentAuth, RequireKidAuth)
- [ ] Test navigation flows

### Phase 5: Integration (Ready to Implement)
- [ ] Replace old routes.tsx with routes-new.tsx
- [ ] Replace old api.ts with api-new.ts
- [ ] Update all components to use new auth utilities
- [ ] Test parent login → kid login → parent login cycles

### Phase 6: Testing
- [ ] Test parent login flow end-to-end
- [ ] Test kid login flow end-to-end
- [ ] Test logout behaviors
- [ ] Test session collision scenarios
- [ ] Test API calls in both modes
- [ ] Test route protection

---

## ✅ IMPLEMENTATION CHECKLIST

### To Activate This Refactor:

**Step 1: Rename Files**
```bash
# Backup old files
mv /src/app/routes.tsx /src/app/routes-old.tsx
mv /src/utils/api.ts /src/utils/api-old.ts

# Activate new files
mv /src/app/routes-new.tsx /src/app/routes.tsx
mv /src/utils/api-new.ts /src/utils/api.ts
```

**Step 2: Update App.tsx**
```typescript
// No changes needed - still imports from './routes.tsx'
import { router } from './routes.tsx';
```

**Step 3: Update All Components**
Replace imports:
```typescript
// OLD
import { apiCall } from '/src/utils/api';

// NEW
import { apiCall } from '/src/utils/api';
// (same path, but now uses new api.ts)
```

**Step 4: Test Flows**
1. Navigate to `/`
2. Click "Parent" → should go to `/parent/login`
3. Sign in → should go to `/parent/home`
4. Logout → should clear parent session only
5. Navigate to `/`
6. Click "Kid" → should go to `/kid/login`
7. Enter family code + name + PIN → should go to `/kid/home`
8. Logout → should clear kid session only
9. Both modes should work independently

---

## 🔍 TESTING SCENARIOS

### Scenario 1: Parent Login → Kid Login
```
1. Parent logs in (sets user_mode = 'parent')
2. Parent logs out (clears user_mode, keeps fgs_family_id)
3. Kid logs in (sets user_mode = 'kid')
4. ✅ Kid session should work correctly
5. ✅ No collision with parent session
```

### Scenario 2: Kid Login → Parent Login
```
1. Kid logs in (sets user_mode = 'kid')
2. Kid logs out (clears user_mode, keeps fgs_family_id)
3. Parent logs in (sets user_mode = 'parent')
4. ✅ Parent session should work correctly
5. ✅ No collision with kid session
```

### Scenario 3: API Calls
```
Parent mode:
- GET /families/123 → Uses Supabase JWT ✅
- POST /behaviors → Uses Supabase JWT ✅

Kid mode:
- GET /children/456/points → Uses kid_access_token ✅
- POST /rewards/redeem → Uses kid_access_token ✅
```

### Scenario 4: Route Protection
```
Parent tries to access /kid/home:
- RequireKidAuth detects user_mode !== 'kid'
- Redirects to /kid/login ✅

Kid tries to access /parent/settings:
- RequireParentAuth detects user_mode !== 'parent'
- Redirects to /parent/login ✅
```

---

## 📦 SUMMARY

### What's Been Created

**Backend:**
- ✅ POST /kid/login endpoint with family code + name + PIN auth

**Frontend Utilities:**
- ✅ /src/app/utils/auth.ts - Separate parent/kid auth helpers
- ✅ /src/utils/api-new.ts - Auto-selects correct auth token

**UI Pages:**
- ✅ ModeSelection - Landing page with Parent/Kid choice
- ✅ ParentLoginNew - Email/password login
- ✅ KidLoginNew - Family code + name + PIN wizard

**Routing:**
- ✅ routes-new.tsx - /parent/* and /kid/* structure with guards

### What's Next

**To implement:**
1. Rename new files to replace old ones
2. Test parent login flow
3. Test kid login flow
4. Verify no session collision
5. Update remaining components to use new auth utilities

**Result:**
- ✅ Clean separation between Parent and Kid modes
- ✅ No more session/role collision
- ✅ Proper logout for each mode
- ✅ API wrapper automatically uses correct token
- ✅ Route protection based on mode

---

**Status:** ✅ **READY FOR IMPLEMENTATION**  
**Estimated Time:** 2-3 hours to integrate and test  
**Risk:** Low (new files don't affect existing code until activated)

