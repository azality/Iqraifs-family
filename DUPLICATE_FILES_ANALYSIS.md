# Duplicate Files Analysis & Resolution Plan

**Date:** February 20, 2026  
**Status:** Analysis Complete - Action Required

---

## 🔍 DUPLICATES IDENTIFIED

### 1. Hooks: useChallenges.ts vs useChallenges.tsx ✅ FIXED

**Status:** ✅ **RESOLVED**

**Files:**
- `/src/app/hooks/useChallenges.ts` - ❌ DELETED
- `/src/app/hooks/useChallenges.tsx` - ✅ KEPT

**Difference:** Only import path for `projectId`
- `.ts`: `import { projectId } from '/utils/supabase/info'`
- `.tsx`: `import { projectId } from '../../../utils/supabase/info'`

**Resolution:** Deleted `.ts` version, keeping `.tsx` (matches project convention)

---

### 2. Routes: routes.tsx vs routes-new.tsx ✅ FIXED

**Status:** ✅ **RESOLVED**

**Files:**
- `/src/app/routes.tsx` - ✅ KEPT (active, imported by App.tsx)
- `/src/app/routes-new.tsx` - ❌ DELETED (unused, never imported)

**Resolution:** Deleted `routes-new.tsx` - dead code removal

---

### 3. API Layer: api.ts vs api-new.ts ⚠️ BOTH NEEDED

**Status:** ⚠️ **NOT DUPLICATES - BOTH ACTIVELY USED**

**Files:**
- `/src/utils/api.ts` - **Primary API layer** (used by most of app)
- `/src/utils/api-new.ts` - **Public API wrapper** (used by new login pages)

**Analysis:**

#### `/src/utils/api.ts` (Primary)
**Purpose:** Main API wrapper with authentication  
**Used by:**
- `FamilyContext.tsx` (getChildren, getFamily, etc.)
- `EditRequests.tsx`
- `LogBehavior.tsx`
- `Onboarding.tsx` (createFamily, createChild)
- `Settings.tsx`
- Most parent-mode pages

**Key Functions:**
```typescript
export function setTemporaryToken(token: string | null)
export async function getChildren(familyId: string)
export async function getChildEvents(childId: string)
export async function logPointEvent(event)
export async function createFamily(name: string)
export async function createChild(familyId: string, childData)
export async function generateInviteCode(familyId: string)
// ... 25+ more functions
```

**Features:**
- Automatic token refresh
- Temporary token cache (for immediate post-login)
- Redirect to login on 401
- Parent-focused (uses Supabase session)

#### `/src/utils/api-new.ts` (Public)
**Purpose:** Public API calls (no authentication required)  
**Used by:**
- `KidLoginNew.tsx` (publicApiCall for family code verification)
- `ParentLoginNew.tsx` (publicApiCall for signup)

**Key Functions:**
```typescript
export async function publicApiCall(endpoint, options)
```

**Features:**
- No authentication required
- Dual auth support (can use parent OR kid tokens if provided)
- Redirects based on mode (kid vs parent)
- Used for public endpoints like `/public/verify-family-code`

**Recommendation:** ✅ **KEEP BOTH**

**Reasoning:**
1. Different purposes (authenticated vs public)
2. Both actively used
3. No functional overlap
4. Could be renamed for clarity:
   - `api.ts` → `apiAuthenticated.ts` or `apiPrivate.ts`
   - `api-new.ts` → `apiPublic.ts` or `apiNoAuth.ts`

**Optional Refactor:**
```typescript
// Rename files for clarity
/src/utils/api.ts → /src/utils/apiAuthenticated.ts
/src/utils/api-new.ts → /src/utils/apiPublic.ts

// Update imports:
// OLD: import { getChildren } from '../../utils/api'
// NEW: import { getChildren } from '../../utils/apiAuthenticated'

// OLD: import { publicApiCall } from '/src/utils/api-new'
// NEW: import { publicApiCall } from '/src/utils/apiPublic'
```

---

### 4. Auth Utilities: MULTIPLE FILES ⚠️ CONSOLIDATION NEEDED

**Status:** ⚠️ **REQUIRES CLEANUP**

**Files:**
1. `/src/app/utils/auth.ts` - **Primary auth utilities** ✅
2. `/src/app/utils/authHelpers.ts` - **Helper functions** ✅
3. `/src/app/utils/auth-helper.ts` - **Debug utilities** ⚠️
4. `/src/utils/auth.ts` - **Parent signup/login** ✅

#### Analysis:

##### `/src/app/utils/auth.ts` (Primary - 258 lines)
**Purpose:** Main authentication utilities for mode management  
**Used by:** 22 files across the app

**Key Functions:**
```typescript
export function getCurrentMode(): 'parent' | 'kid' | null
export function setKidMode(kidAccessToken, kid, familyCode)
export function setParentMode(userId, familyId)
export function getAuthToken(): string | null
export function logout()
export const STORAGE_KEYS = { ... }
```

**Critical:** This is the MAIN auth utility. ✅ KEEP

---

##### `/src/app/utils/authHelpers.ts` (Helpers - 84 lines)
**Purpose:** Lower-level helper functions  
**Used by:** 5 files

**Key Functions:**
```typescript
export function getCurrentRole(): 'parent' | 'child' | null
export function hasSupabaseSession(): Promise<boolean>
export function clearAllSessions()
export function clearKidSession()
```

**Status:** ✅ KEEP - Complementary to auth.ts

---

##### `/src/app/utils/auth-helper.ts` (Debug - 61 lines)
**Purpose:** Development debugging utilities  
**Used by:** 1 file (`AuthStatusDebug.tsx`)

**Key Functions:**
```typescript
export async function clearAuthAndReload()
export async function validateSession()
```

**Status:** ⚠️ **EVALUATE FOR REMOVAL**

**Recommendation:**
- If `AuthStatusDebug.tsx` is only for development:
  - Move functions into `AuthStatusDebug.tsx` directly
  - Delete `auth-helper.ts`
- If these are production utilities:
  - Merge into `authHelpers.ts`
  - Delete `auth-helper.ts`

---

##### `/src/utils/auth.ts` (Parent Auth - 125 lines)
**Purpose:** Parent signup/login (Supabase)  
**Used by:** 2 files (`Onboarding.tsx`, `ParentLoginNew.tsx`)

**Key Functions:**
```typescript
export async function signup(data: SignupData)
export async function login(email: string, password: string)
export async function logout()
```

**Status:** ✅ KEEP - Different from `/src/app/utils/auth.ts`

**NOTE:** These are separate layers:
- `/src/app/utils/auth.ts` - Frontend auth state management
- `/src/utils/auth.ts` - API calls for signup/login

---

## 🛠️ RECOMMENDED ACTIONS

### Immediate (Required for Production)

1. ✅ **COMPLETED:** Delete `/src/app/hooks/useChallenges.ts`
2. ✅ **COMPLETED:** Delete `/src/app/routes-new.tsx`

### Short-term (Recommended)

3. **Consolidate auth-helper.ts**

   **Option A:** Remove if debug-only
   ```bash
   # If AuthStatusDebug is dev-only:
   # 1. Move functions into AuthStatusDebug.tsx
   # 2. Delete /src/app/utils/auth-helper.ts
   ```

   **Option B:** Merge into authHelpers.ts
   ```bash
   # If functions are production-needed:
   # 1. Move clearAuthAndReload and validateSession to authHelpers.ts
   # 2. Update import in AuthStatusDebug.tsx
   # 3. Delete /src/app/utils/auth-helper.ts
   ```

4. **Rename API files for clarity (OPTIONAL)**

   ```bash
   # More descriptive names:
   mv /src/utils/api.ts /src/utils/apiAuthenticated.ts
   mv /src/utils/api-new.ts /src/utils/apiPublic.ts
   
   # Update all imports (22 files)
   # This is a breaking change - requires thorough testing
   ```

### Long-term (Nice to Have)

5. **Create unified API client**

   ```typescript
   // /src/utils/apiClient.ts
   import { apiAuthenticated } from './apiAuthenticated';
   import { publicApiCall } from './apiPublic';
   
   export const api = {
     // Authenticated calls
     getChildren: apiAuthenticated.getChildren,
     createFamily: apiAuthenticated.createFamily,
     // ... all authenticated methods
     
     // Public calls
     public: {
       verifyFamilyCode: (code) => publicApiCall('/public/verify-family-code', ...),
       // ... all public methods
     }
   };
   
   // Usage:
   // import { api } from '/src/utils/apiClient';
   // api.getChildren(familyId)
   // api.public.verifyFamilyCode(code)
   ```

---

## 📊 FILE STRUCTURE AFTER CLEANUP

### Current State
```
/src/
  /app/
    /utils/
      auth.ts          ✅ [258 lines] - Mode management
      authHelpers.ts   ✅ [84 lines]  - Helper functions
      auth-helper.ts   ⚠️ [61 lines]  - Debug utilities (review needed)
  /utils/
    auth.ts           ✅ [125 lines] - Signup/login API calls
    api.ts            ✅ [900+ lines] - Authenticated API wrapper
    api-new.ts        ✅ [350+ lines] - Public API wrapper
```

### Recommended State
```
/src/
  /app/
    /utils/
      auth.ts          ✅ [258 lines] - Mode management
      authHelpers.ts   ✅ [145 lines] - Helpers + merged auth-helper functions
      [DELETE] auth-helper.ts
  /utils/
    auth.ts           ✅ [125 lines] - Signup/login API calls
    apiAuthenticated.ts ✅ [900+ lines] - Authenticated API (renamed from api.ts)
    apiPublic.ts       ✅ [350+ lines] - Public API (renamed from api-new.ts)
    apiClient.ts       🆕 [50 lines]   - Unified exports (OPTIONAL)
```

---

## 🧪 TESTING AFTER CHANGES

If you proceed with renaming/consolidation:

### Test Checklist
- [ ] All imports resolved (no missing modules)
- [ ] Parent login still works
- [ ] Kid login still works
- [ ] API calls from parent mode work
- [ ] API calls from kid mode work
- [ ] Public endpoints accessible (family code verification)
- [ ] TypeScript compilation succeeds
- [ ] No console errors on any page

### Regression Tests
Run the following test cases from `TESTING_COMPREHENSIVE_CHECKLIST.md`:
- AT-001: Parent Signup
- AT-002: Parent Login
- AT-004: Kid Login - Family Code
- AT-006: Kid Login - PIN
- DF-001: Parent Dashboard Load
- DF-002: Kid Dashboard Load
- BT-001: Log Behavior
- GT-001: Quest Display

---

## 💡 SUMMARY

### What Was Fixed ✅
1. Deleted duplicate `useChallenges.ts` hook
2. Deleted unused `routes-new.tsx`

### What Needs Review ⚠️
1. `/src/app/utils/auth-helper.ts` - Evaluate if needed in production
2. Consider renaming API files for clarity (optional)

### What's Intentional ✅
1. `/src/utils/api.ts` and `/src/utils/api-new.ts` serve different purposes
2. `/src/app/utils/auth.ts` and `/src/utils/auth.ts` are different layers
3. `authHelpers.ts` complements `auth.ts` (not duplicate)

---

**Conclusion:** System is clean with only minor improvements needed. Safe to proceed with iOS launch after completing auth-helper.ts review.

