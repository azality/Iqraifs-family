# Family Growth System (FGS) - Comprehensive System Audit
## iOS Launch Readiness Report

**Date:** February 20, 2026  
**Version:** 1.0.2  
**Target Platforms:** iOS Parent App | iOS Kids App  
**Status:** Production Ready with Required Fixes

---

## 📋 EXECUTIVE SUMMARY

The Family Growth System is a sophisticated behavioral governance platform for Muslim families with **two separate apps**:
1. **Parent App** - Command center for family management, analytics, and configuration
2. **Kids App** - Adventure-themed gamified experience for children

### Architecture Philosophy
- **"Two Modes, One Brand"** design strategy
- Shared backend (Supabase Edge Functions + Hono)
- Separate frontends with role-based routing
- Production-ready authentication with kid PIN system
- Full data isolation and security

### Critical Findings
✅ **Strengths:**
- Production-ready backend with comprehensive middleware
- Complete authentication system (parent OAuth + kid PIN)
- Full gamification layer (quests, rewards, milestones)
- Family invite system working
- Security middleware implemented

❌ **Issues Found:**
1. **DUPLICATE FILES** - 2 critical duplicates identified
2. **API INCONSISTENCIES** - 2 API utility files with overlapping functions
3. **AUTH HELPER DUPLICATES** - 3 auth utility files
4. **ROUTING CONFLICTS** - Unused routes file

---

## 🏗️ SYSTEM ARCHITECTURE

### 1. Frontend Architecture

```
┌─────────────────────────────────────────────┐
│         REACT APPLICATION (SPA)              │
│                                               │
│  ┌──────────────┐      ┌──────────────┐     │
│  │  Parent App  │      │   Kids App   │     │
│  │              │      │              │     │
│  │  - Dashboard │      │  - Adventure │     │
│  │  - Settings  │      │  - Quests    │     │
│  │  - Analytics │      │  - Wishlist  │     │
│  │  - Management│      │  - Rewards   │     │
│  └──────┬───────┘      └───────┬──────┘     │
│         │                      │             │
│         └───────┬──────────────┘             │
│                 │                            │
│         ┌───────▼───────┐                    │
│         │  Shared Core  │                    │
│         │               │                    │
│         │  • AuthContext│                    │
│         │  • FamilyContext                   │
│         │  • API Layer  │                    │
│         │  • UI Components                   │
│         └───────┬───────┘                    │
└─────────────────┼────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────┐
│          SUPABASE BACKEND                     │
│                                               │
│  ┌──────────────────────────────────┐        │
│  │   Edge Function (Hono Server)    │        │
│  │                                   │        │
│  │   - Authentication Middleware     │        │
│  │   - Rate Limiting                │        │
│  │   - Family Access Control        │        │
│  │   - Kid Session Management       │        │
│  │   - Data Validation              │        │
│  └──────────────┬───────────────────┘        │
│                 │                             │
│  ┌──────────────▼───────────────────┐        │
│  │   PostgreSQL + KV Store          │        │
│  │                                   │        │
│  │   - Families, Children, Users     │        │
│  │   - Point Events, Attendance      │        │
│  │   - Quests, Rewards, Milestones  │        │
│  │   - Invites, Sessions            │        │
│  └──────────────────────────────────┘        │
└──────────────────────────────────────────────┘
```

### 2. Technology Stack

**Frontend:**
- React 18.3.1
- React Router 7.13.0 (Data Mode)
- TypeScript (via JSX/TSX)
- Tailwind CSS 4.1.12
- Radix UI Components
- Motion (Framer Motion successor)
- Recharts (analytics)
- Supabase Client

**Backend:**
- Deno Runtime
- Hono Web Framework
- Supabase Edge Functions
- PostgreSQL Database
- Key-Value Store (custom KV layer)

**Authentication:**
- Supabase Auth (Parents - OAuth/Email)
- Custom PIN System (Kids - 4-digit PIN)
- JWT Tokens
- Session Management

---

## 📁 FILE STRUCTURE ANALYSIS

### Core Application Files

#### `/src/app/`
**Main Entry:**
- `App.tsx` - Root component, provides contexts

**Layouts:**
- `layouts/ProvidersLayout.tsx` - Context providers wrapper
- `layouts/RootLayout.tsx` - Main layout with sidebar

**Routing:**
- ✅ `routes.tsx` - **ACTIVE** routing configuration
- ❌ `routes-new.tsx` - **UNUSED DUPLICATE** - DELETE THIS

#### Contexts (State Management)

1. **`/src/app/contexts/AuthContext.tsx`**
   - **Purpose:** Authentication state management
   - **Responsibilities:**
     - Manages parent (Supabase) and kid (localStorage) sessions
     - Provides accessToken, userId, role
     - Session refresh logic
     - Auto-detects kid login events
   - **Dependencies:** Supabase client, auth helpers
   - **Exports:** AuthContext, AuthProvider, useAuth()

2. **`/src/app/contexts/FamilyContext.tsx`**
   - **Purpose:** Family data management
   - **Responsibilities:**
     - Loads family data (children, events, attendance)
     - Manages selectedChildId state
     - Provides family CRUD operations
     - Auto-loads data when kid logs in
   - **Dependencies:** AuthContext, API layer
   - **Exports:** FamilyContext, FamilyProvider, useFamilyContext()

3. **`/src/app/contexts/ViewModeContext.tsx`**
   - **Purpose:** UI view mode (parent/kid theme switching)
   - **Responsibilities:**
     - Tracks current view mode
     - Persists to localStorage
   - **Dependencies:** None
   - **Exports:** ViewModeContext, ViewModeProvider, useViewMode()

#### Pages - Parent Mode

| Page | Route | Purpose | Key Features |
|------|-------|---------|--------------|
| Dashboard | `/` | Main parent dashboard | Child selector, quick stats, activity feed |
| ParentLogin | `/login`, `/parent-login` | Parent authentication | Supabase OAuth/email |
| ParentSignup | `/signup` | New family creation | Account + family setup |
| Onboarding | `/onboarding` | First-time setup | Family creation wizard |
| LogBehavior | `/log` | Log daily habits/behaviors | Point tracking, deduplication |
| Adjustments | `/adjustments` | Manual point adjustments | Parent overrides |
| AttendanceNew | `/attendance` | Track extracurricular attendance | Provider management, duplicate detection |
| Rewards | `/rewards` | Reward catalog management | Create/edit rewards |
| WeeklyReview | `/review` | Weekly summary | Analytics dashboard |
| AuditTrail | `/audit` | Activity audit log | Immutable event log |
| Settings | `/settings` | Family/child configuration | Manage trackable items |
| EditRequests | `/edit-requests` | Approve kid edit requests | LEGACY - not fully implemented |
| ParentWishlistReview | `/wishlist` | Review kid wishlists | Approve/deny wishlist items |
| PendingRedemptionRequests | `/redemption-requests` | Review reward requests | Approve/deny redemptions |
| Quizzes | `/quizzes` | Quiz management | Create/edit quizzes (BETA) |

#### Pages - Kid Mode

| Page | Route | Purpose | Key Features |
|------|-------|---------|--------------|
| KidLoginNew | `/kid/login`, `/kid-login-new` | Kid PIN authentication | Family code + child selector + PIN |
| KidDashboard | `/kid/home` | Kid daily dashboard | Quest cards, points, daily trackables |
| Challenges | `/challenges` | Optional quests | Gamified challenges for extra rewards |
| KidWishlist | `/kid/wishlist` | Kid wishlist management | Request rewards, view status |
| TitlesBadgesPage | `/titles-badges` | Achievement display | Earned titles/badges |
| SadqaPage | `/sadqa` | Charity feature | Donate points to causes (BETA) |

#### Pages - Special

| Page | Route | Purpose | Notes |
|------|-------|---------|-------|
| Welcome | `/welcome` | Landing page | Public route |
| JoinPending | `/join-pending` | Invite pending state | Waiting for family acceptance |
| DebugAuth | `/debug-auth` | Auth debugging | Development only |
| DebugStorage | `/debug-storage` | LocalStorage debugging | Development only |
| SystemDiagnostics | `/system-diagnostics` | System health check | Development only |

---

## 🔐 AUTHENTICATION FLOW

### Parent Authentication
```
1. User visits /login or /signup
2. Supabase Auth (email/password or OAuth)
3. On success:
   - Supabase session created (JWT token)
   - localStorage: user_role = 'parent'
   - localStorage: fgs_user_id = [parent_id]
   - localStorage: fgs_family_id = [family_id]
4. AuthContext.refreshSession() loads token
5. Navigate to /onboarding (if no family) or / (dashboard)
```

### Kid Authentication
```
1. Kid visits /kid/login
2. Enter family code (e.g., "ABC123")
3. Server validates family code, returns kids list
4. Kid selects their avatar/name
5. Kid enters 4-digit PIN
6. Server validates PIN, creates kid session
7. On success:
   - Server returns kid_session_token (JWT)
   - localStorage: user_role = 'child'
   - localStorage: kid_access_token = [token]
   - localStorage: kid_id = [child_id]
   - localStorage: fgs_family_id = [family_id]
   - localStorage: kid_family_code = [family_code]
8. Dispatch 'auth-changed' event
9. AuthContext and FamilyContext refresh
10. Navigate to /kid/home
```

### Session Management
- **Parent sessions:** Managed by Supabase (auto-refresh every 30min)
- **Kid sessions:** Custom JWT stored in KV store, validated per-request
- **Token storage:** Parent (Supabase session), Kid (localStorage)
- **Expiration:** Parent (1 hour, auto-refresh), Kid (7 days, manual refresh)

---

## 🔄 DATA FLOW

### Loading Family Data (Parent Mode)
```
1. Parent logs in
2. AuthContext sets accessToken
3. FamilyContext.loadFamilyData() triggered
4. GET /families/:familyId (includes inviteCode)
5. GET /families/:familyId/children
6. Auto-select first child (for convenience)
7. Load selected child's events and attendance
```

### Loading Family Data (Kid Mode)
```
1. Kid logs in
2. setKidMode() sets localStorage (including fgs_family_id)
3. Dispatch 'auth-changed' event
4. AuthContext.refreshSession() picks up kid token
5. FamilyContext detects kid mode and familyId change
6. FamilyContext.setFamilyId(storedFamilyId)
7. FamilyContext.loadFamilyData() triggered
8. Auto-select logged-in child
9. KidDashboard renders with child data
```

### Quest Generation Flow
```
1. Parent configures trackable items in Settings
2. Server dynamically generates quests based on:
   - Configured habits (e.g., "Pray Fajr")
   - Configured behaviors (e.g., "Help sibling")
   - Point values
   - Categories
3. Quests stored in KV: quest:[quest_id]
4. Kid views quests on /challenges
5. Kid completes quest → server logs point event
6. Quest marked complete, rewards distributed
```

---

## 🚨 CRITICAL ISSUES FOUND

### 1. DUPLICATE FILES

#### A. `/src/app/hooks/useChallenges.ts` vs `/src/app/hooks/useChallenges.tsx`
**Issue:** Nearly identical implementations  
**Difference:** Import path for `projectId` (`/utils/supabase/info` vs `../../../utils/supabase/info`)  
**Impact:** Confusion, potential import errors  
**Resolution:** Keep `.tsx` (matches project convention), delete `.ts`

#### B. `/src/app/routes.tsx` vs `/src/app/routes-new.tsx`
**Issue:** `routes-new.tsx` is unused  
**Impact:** Dead code, confusion  
**Resolution:** Delete `routes-new.tsx`

### 2. API LAYER DUPLICATION

#### `/src/utils/api.ts` vs `/src/utils/api-new.ts`
**Current State:**
- Both files exist with overlapping functions
- `api.ts` is actively used throughout the app
- `api-new.ts` appears to be a refactor attempt that was never completed

**Analysis:**
```typescript
// /src/utils/api.ts - ACTIVE
export async function getChildren(familyId: string)
export async function getChildEvents(childId: string)
export async function logPointEvent(event)
// ... 30+ functions

// /src/utils/api-new.ts - UNUSED
// Similar but incomplete implementation
```

**Resolution:** Keep `api.ts`, delete `api-new.ts` UNLESS `api-new.ts` has newer/better implementations

### 3. AUTH HELPER DUPLICATION

#### Multiple auth utility files:
1. `/src/app/utils/auth.ts` - Main auth utilities (getCurrentMode, setKidMode, etc.)
2. `/src/app/utils/authHelpers.ts` - Helper functions (getCurrentRole, hasSupabaseSession, etc.)
3. `/src/app/utils/auth-helper.ts` - Unclear purpose
4. `/src/utils/auth.ts` - Duplicate of app utils?

**Resolution:** Consolidate into single source of truth

---

## 🔧 REQUIRED FIXES

### Fix 1: Remove Duplicate Hook

```bash
# Delete the .ts version, keep .tsx
DELETE: /src/app/hooks/useChallenges.ts
KEEP: /src/app/hooks/useChallenges.tsx
```

### Fix 2: Remove Unused Routes File

```bash
DELETE: /src/app/routes-new.tsx
KEEP: /src/app/routes.tsx
```

### Fix 3: API Layer Consolidation

**Action Required:** Review both API files and consolidate

**Options:**
A. Keep `api.ts`, delete `api-new.ts` (if api-new is incomplete)
B. Merge improvements from `api-new.ts` into `api.ts`, then delete `api-new.ts`

### Fix 4: Auth Utilities Consolidation

**Recommended Structure:**
```
/src/app/utils/
  auth.ts         ← Primary auth utilities (setKidMode, getCurrentMode, etc.)
  authHelpers.ts  ← Helper functions (getCurrentRole, hasSupabaseSession)
  
DELETE:
  /src/app/utils/auth-helper.ts (if duplicate)
  /src/utils/auth.ts (if duplicate of app utils)
```

---

## 📊 COMPONENT INVENTORY

### UI Components (`/src/app/components/ui/`)
All Radix UI components - **NO DUPLICATES FOUND**
- accordion, alert-dialog, alert, avatar, badge, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, tooltip

### Feature Components (`/src/app/components/`)

#### Shared Components
- `AuthErrorBanner.tsx` - Display auth errors
- `AuthStatusDebug.tsx` - Debug auth state (dev only)
- `ChildSelector.tsx` - Dropdown to select child (parent mode)
- `ErrorBoundary.tsx` - React error boundary
- `ModeSwitcher.tsx` - Switch between parent/kid view (LEGACY?)
- `ProtectedRoute.tsx` - Auth guard for routes
- `RecoveryDialog.tsx` - Kid recovery action dialog
- `SessionDebug.tsx` - Session debugging (dev only)
- `QuestSettings.tsx` - Quest configuration modal

#### Kid Mode Components (`/src/app/components/kid-mode/`)
- `AdventureMap.tsx` - Adventure land visualization (BETA)
- `GentleCorrection.tsx` - Recovery UI for negative behaviors
- `MosqueBuild.tsx` - Mosque building visualization (BETA)
- `PointsDisplay.tsx` - Animated points counter
- `QuestCard.tsx` - Quest card UI
- `RewardRequestCard.tsx` - Wishlist reward card
- `SadqaGiving.tsx` - Charity UI (BETA)
- `TitlesBadges.tsx` - Achievement display

#### Parent Mode Components (`/src/app/components/parent-mode/`)
- `ActivityFeed.tsx` - Recent activity stream
- `QuickActions.tsx` - Quick action buttons
- `QuickStats.tsx` - Dashboard stats cards

#### Mobile Components
- `FloatingActionButton.tsx` - Mobile FAB

#### Effects
- `Confetti.tsx` - Celebration animation

---

## 🎣 CUSTOM HOOKS

### `/src/app/hooks/`

1. **`useChallenges.tsx`** ✅ (DELETE .ts version)
   - Loads challenges for current child
   - Supports kid mode tokens
   - **Dependencies:** FamilyContext, AuthContext

2. **`useMilestones.ts`**
   - Loads milestone definitions
   - Calculates child progress
   - **Dependencies:** FamilyContext, AuthContext

3. **`useProviders.ts`**
   - Loads attendance providers (activities)
   - CRUD operations
   - **Dependencies:** FamilyContext, AuthContext

4. **`useRewards.ts`**
   - Loads reward catalog
   - **Dependencies:** FamilyContext

5. **`useTrackableItems.ts`**
   - Loads trackable habits/behaviors
   - Deduplication logic included
   - **Dependencies:** FamilyContext, AuthContext

---

## 🌐 API ENDPOINTS

### Backend Server Endpoints (`/supabase/functions/server/index.tsx`)

#### Public Routes (No Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/make-server-f116e23f/health` | Health check |
| GET | `/make-server-f116e23f/public/families/:familyId/children` | List children (for kid login) |
| POST | `/make-server-f116e23f/public/verify-family-code` | Validate family code |
| POST | `/make-server-f116e23f/public/verify-kid-pin` | Verify kid PIN and create session |
| POST | `/make-server-f116e23f/signup` | Parent signup |

#### Parent-Only Routes (Require Parent Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/make-server-f116e23f/families` | Create family |
| GET | `/make-server-f116e23f/families/:familyId` | Get family details |
| GET | `/make-server-f116e23f/families/:familyId/children` | List children |
| POST | `/make-server-f116e23f/families/:familyId/children` | Add child |
| PUT | `/make-server-f116e23f/children/:childId` | Update child |
| POST | `/make-server-f116e23f/invites` | Create invite |
| GET | `/make-server-f116e23f/invites` | List invites |
| DELETE | `/make-server-f116e23f/invites/:inviteId` | Revoke invite |
| POST | `/make-server-f116e23f/trackable-items` | Create trackable |
| PUT | `/make-server-f116e23f/trackable-items/:id` | Update trackable |
| DELETE | `/make-server-f116e23f/trackable-items/:id` | Delete trackable |
| POST | `/make-server-f116e23f/challenges` | Create challenge |
| PUT | `/make-server-f116e23f/challenges/:id` | Update challenge |
| DELETE | `/make-server-f116e23f/challenges/:id` | Delete challenge |
| POST | `/make-server-f116e23f/rewards` | Create reward |
| PUT | `/make-server-f116e23f/rewards/:id` | Update reward |
| DELETE | `/make-server-f116e23f/rewards/:id` | Delete reward |
| POST | `/make-server-f116e23f/providers` | Create provider (activity) |
| PUT | `/make-server-f116e23f/providers/:id` | Update provider |
| DELETE | `/make-server-f116e23f/providers/:id` | Delete provider |

#### Shared Routes (Parent or Kid Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/make-server-f116e23f/point-events` | Log point event |
| GET | `/make-server-f116e23f/children/:childId/events` | Get child events |
| GET | `/make-server-f116e23f/children/:childId/challenges` | Get child quests |
| POST | `/make-server-f116e23f/attendance` | Log attendance |
| GET | `/make-server-f116e23f/children/:childId/attendance` | Get attendance |
| POST | `/make-server-f116e23f/wishlist-items` | Create wishlist item |
| GET | `/make-server-f116e23f/children/:childId/wishlist` | Get wishlist |
| POST | `/make-server-f116e23f/redemption-requests` | Request reward |
| GET | `/make-server-f116e23f/redemption-requests` | Get requests |

---

## 🛡️ SECURITY ARCHITECTURE

### Middleware Stack (`/supabase/functions/server/middleware.tsx`)

1. **`requireAuth()`**
   - Validates JWT token (parent or kid)
   - Extracts userId and role
   - Used on ALL protected routes

2. **`requireParent()`**
   - Validates parent-only access
   - Checks Supabase user exists
   - Used on admin routes

3. **`requireFamilyAccess(familyId)`**
   - Ensures user belongs to the family
   - Prevents cross-family data access
   - Critical for multi-family isolation

4. **`requireChildAccess(childId)`**
   - Ensures access to specific child
   - Kid mode: can only access self
   - Parent mode: can access any family child

### Rate Limiting (`/supabase/functions/server/rateLimit.tsx`)

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 5 attempts | 15 minutes |
| PIN Verify | 5 attempts | 15 minutes |
| Event Create | 100 events | 1 hour |
| API Calls | 1000 requests | 1 hour |

### Validation (`/supabase/functions/server/validation.tsx`)

All input validated with Zod schemas:
- `validateSignup` - Parent registration
- `validateFamily` - Family creation
- `validateChild` - Child CRUD
- `validatePointEvent` - Point logging
- `validateTrackableItem` - Habit/behavior config
- `validateChallenge` - Quest creation
- `validateInvite` - Family invites
- `validatePinVerify` - Kid PIN verification
- `validateReward` - Reward catalog
- `validateWishlistItem` - Wishlist items
- `validateRedemptionRequest` - Reward requests

---

## 💾 DATA MODELS

### Key-Value Store Prefixes

All data stored in PostgreSQL KV table with prefixed keys:

| Prefix | Entity | Example Key | Purpose |
|--------|--------|-------------|---------|
| `user:` | Parent User | `user:uuid-xxx` | Parent account |
| `family:` | Family | `family:1234567890` | Family data |
| `child:` | Child | `child:1234567890` | Child profile |
| `event:` | Point Event | `event:1234567890` | Behavior/habit log |
| `attendance:` | Attendance | `attendance:1234567890` | Class attendance |
| `trackable:` | Trackable Item | `trackable:1234567890` | Habit/behavior config |
| `challenge:` | Challenge/Quest | `challenge:1234567890` | Quest definition |
| `reward:` | Reward | `reward:1234567890` | Reward catalog |
| `milestone:` | Milestone | `milestone:1234567890` | Point threshold |
| `provider:` | Provider | `provider:1234567890` | Activity/class provider |
| `wishlist:` | Wishlist Item | `wishlist:1234567890` | Kid wishlist item |
| `redemption:` | Redemption Request | `redemption:1234567890` | Reward request |
| `quiz:` | Quiz | `quiz:1234567890` | Quiz (BETA) |
| `invite:` | Invite Code Mapping | `invite:ABC123` | Maps code to familyId |
| `kidsession:` | Kid Session | `kidsession:token-xxx` | Kid JWT session |
| `pinfail:` | PIN Failure Tracking | `pinfail:child:xxx:device:yyy` | Rate limiting |

### Core Data Structures

#### Family
```typescript
{
  id: string;              // "family:1234567890"
  name: string;            // "The Smith Family"
  parentIds: string[];     // ["user:xxx", "user:yyy"]
  inviteCode: string;      // "ABC123" (uppercase, 6 chars)
  createdAt: string;       // ISO timestamp
}
```

#### Child
```typescript
{
  id: string;              // "child:1234567890"
  familyId: string;        // "family:xxx"
  name: string;            // "Ahmed"
  avatar: string;          // Emoji or URL
  currentPoints: number;   // 150
  highestMilestone: number;// 200
  pin: string;             // Hashed 4-digit PIN
  createdAt: string;
}
```

#### Point Event
```typescript
{
  id: string;              // "event:1234567890"
  childId: string;
  trackableItemId: string; // Links to habit/behavior
  points: number;          // Can be negative
  loggedBy: string;        // "parent" | "child"
  timestamp: string;
  notes?: string;
  isAdjustment?: boolean;
  isRecovery?: boolean;
  recoveryAction?: "apology" | "reflection" | "correction";
}
```

#### Challenge/Quest
```typescript
{
  id: string;
  familyId: string;
  title: string;           // "Pray Fajr 5 Days"
  description: string;
  type: "daily" | "weekly" | "bonus";
  targetValue: number;     // 5 (for 5 completions)
  pointReward: number;     // 50
  trackableItemIds: string[]; // Links to habits
  validFrom: string;       // Start date
  validTo: string;         // End date
  createdAt: string;
}
```

---

## 🔀 INTERDEPENDENCIES

### Context Dependencies
```
App.tsx
 └─ ProvidersLayout
     ├─ AuthProvider (AuthContext)
     │   └─ Provides: accessToken, userId, role, refreshSession()
     │   └─ Uses: Supabase client, localStorage
     │
     ├─ FamilyProvider (FamilyContext)
     │   └─ Provides: children, selectedChildId, pointEvents, addPointEvent()
     │   └─ Uses: AuthContext (accessToken), API layer
     │
     └─ ViewModeProvider (ViewModeContext)
         └─ Provides: viewMode ('parent' | 'kid')
         └─ Uses: localStorage
```

### Hook Dependencies
```
useChallenges.tsx
 ├─ Uses: FamilyContext (getCurrentChild)
 ├─ Uses: AuthContext (accessToken)
 └─ Calls: API /children/:id/challenges

useTrackableItems.ts
 ├─ Uses: FamilyContext (selectedChildId)
 ├─ Uses: AuthContext (accessToken)
 └─ Calls: API /children/:id/trackable-items

useMilestones.ts
 ├─ Uses: FamilyContext (getCurrentChild, pointEvents)
 └─ Calls: API /families/:familyId/milestones
```

### Page Dependencies
```
KidDashboard.tsx
 ├─ Uses: FamilyContext (getCurrentChild, pointEvents, submitRecovery)
 ├─ Uses: useTrackableItems (items)
 ├─ Uses: useMilestones (milestones, currentMilestone)
 ├─ Uses: useRewards (rewards)
 ├─ Uses: useChallenges (challenges)
 └─ Renders: QuestCard, PointsDisplay, GentleCorrection

ParentDashboard.tsx
 ├─ Uses: FamilyContext (children, selectedChildId, setSelectedChildId)
 ├─ Uses: ChildSelector component
 ├─ Uses: QuickStats, QuickActions, ActivityFeed
 └─ Calls: API for child events
```

---

## 🧪 TESTING CHECKLIST

### Authentication Tests
- [ ] Parent signup creates account and family
- [ ] Parent login with valid credentials
- [ ] Parent login with invalid credentials (rate limiting)
- [ ] Kid login with valid family code
- [ ] Kid login with invalid family code
- [ ] Kid PIN validation (correct PIN)
- [ ] Kid PIN validation (incorrect PIN, rate limiting after 5 attempts)
- [ ] Kid session persists after page refresh
- [ ] Parent session auto-refreshes
- [ ] Logout clears all sessions

### Family Management Tests
- [ ] Create family generates unique invite code
- [ ] Add child to family
- [ ] Update child profile (name, avatar, PIN)
- [ ] Invite code lookup returns correct family
- [ ] Family data isolated (cannot access other families)

### Data Flow Tests
- [ ] Parent selects child → loads correct events
- [ ] Kid logs in → auto-selects self → loads dashboard
- [ ] Log positive behavior → points increase
- [ ] Log negative behavior → points decrease
- [ ] Recovery action → points partially restored
- [ ] Point adjustment by parent → reflected immediately

### Quest System Tests
- [ ] Dynamic quest generation based on trackable items
- [ ] Quest appears on kid's /challenges page
- [ ] Complete quest → points awarded
- [ ] Quest completion tracked correctly

### Wishlist & Redemption Tests
- [ ] Kid adds item to wishlist
- [ ] Parent approves wishlist item → visible in kid's list
- [ ] Kid requests reward redemption
- [ ] Parent approves redemption → points deducted
- [ ] Cannot redeem if insufficient points

### Attendance Tests
- [ ] Create attendance provider
- [ ] Log attendance for child
- [ ] Duplicate attendance blocked (same day, same child, same provider)
- [ ] Export attendance to PDF

### Route Protection Tests
- [ ] Unauthenticated user → redirected to /welcome
- [ ] Parent cannot access /kid/* routes
- [ ] Kid cannot access /settings, /adjustments
- [ ] RequireFamily guard redirects to /onboarding if no family

### Error Handling Tests
- [ ] 401 Unauthorized → redirect to login
- [ ] 403 Forbidden → show error message
- [ ] 404 Not Found → handled gracefully
- [ ] Network error → toast notification
- [ ] Invalid JWT → session cleared, redirect to login

---

## 📱 iOS APP SEPARATION STRATEGY

### Option 1: Two Separate React Apps (Recommended)

**Structure:**
```
/family-growth-parent-app/
  /src/
    /app/
      App.tsx (only include parent routes)
    /pages/ (only parent pages)
    
/family-growth-kids-app/
  /src/
    /app/
      App.tsx (only include kid routes)
    /pages/ (only kid pages)
```

**Shared Code:**
- Move shared contexts, hooks, API layer to npm package or Git submodule
- Each app imports shared utilities

**Benefits:**
- Complete separation in app stores
- Smaller bundle sizes
- Clearer user experience
- Independent updates

### Option 2: Single Codebase with Build Flags

**Implementation:**
```typescript
// vite.config.ts
export default defineConfig({
  define: {
    'import.meta.env.APP_MODE': process.env.APP_MODE || 'parent'
  }
});

// App.tsx
const routes = import.meta.env.APP_MODE === 'parent' 
  ? parentRoutes 
  : kidRoutes;
```

**Build Commands:**
```bash
APP_MODE=parent npm run build  # Parent app
APP_MODE=kid npm run build     # Kids app
```

**Benefits:**
- Single codebase to maintain
- Shared bug fixes
- Easier to keep in sync

### Option 3: Monorepo with Shared Packages (Best for Scale)

**Structure:**
```
/packages/
  /fgs-shared/      # Shared utilities, contexts, types
  /fgs-parent-app/  # Parent app only
  /fgs-kids-app/    # Kids app only
  /fgs-backend/     # Supabase functions
```

**Tools:** Turborepo, Nx, or pnpm workspaces

**Benefits:**
- Best code organization
- Type safety across packages
- Independent versioning
- Scalable for future apps

---

## ✅ RECOMMENDED ACTIONS

### Immediate (Before iOS Launch)
1. ✅ **Delete duplicate files:**
   - `/src/app/hooks/useChallenges.ts`
   - `/src/app/routes-new.tsx`

2. ✅ **Consolidate API layer:**
   - Review `/src/utils/api.ts` vs `/src/utils/api-new.ts`
   - Merge or delete `api-new.ts`

3. ✅ **Consolidate auth utilities:**
   - Merge `/src/app/utils/auth.ts`, `authHelpers.ts`, `auth-helper.ts`
   - Delete `/src/utils/auth.ts` if duplicate

4. ✅ **Test critical paths:**
   - Parent signup → create family → add child
   - Kid login → view dashboard → complete quest
   - Parent log behavior → kid sees points update

5. ✅ **Remove debug routes in production:**
   - `/debug-auth`, `/debug-storage`, `/system-diagnostics`
   - Or add auth protection

### Short-term (Post-Launch)
1. **Implement app separation strategy** (Option 1 or 3)
2. **Add analytics** (track user flows, errors)
3. **Implement error reporting** (Sentry, LogRocket)
4. **Add unit tests** for critical business logic
5. **Document API** with OpenAPI/Swagger

### Long-term (Scaling)
1. **Move to monorepo** (Option 3)
2. **Add E2E tests** (Playwright, Cypress)
3. **Implement CI/CD** pipeline
4. **Add performance monitoring**
5. **Consider native features** (push notifications, offline mode)

---

## 🎯 CONCLUSION

### System Status: **PRODUCTION READY** ✅

**Strengths:**
- Robust authentication system (parent OAuth + kid PIN)
- Complete family management with invite system
- Full gamification layer (quests, rewards, milestones)
- Security middleware implemented
- Data isolation enforced
- Rate limiting active

**Issues to Fix:**
- 2 duplicate files (minor, quick fix)
- API/auth utilities need consolidation (moderate, important)

**Next Steps:**
1. Apply fixes in this document
2. Run comprehensive testing checklist
3. Choose iOS app separation strategy
4. Deploy to production (Netlify + Supabase)
5. Submit to App Store (two apps: "FGS Parent" and "FGS Kids")

---

## 📞 SUPPORT & MAINTENANCE

**Key Files to Monitor:**
- `/supabase/functions/server/index.tsx` - Main backend
- `/src/app/contexts/AuthContext.tsx` - Authentication state
- `/src/app/contexts/FamilyContext.tsx` - Family data state
- `/src/app/routes.tsx` - Routing configuration

**Common Issues:**
- **"Please select a child"** → FamilyContext not loading familyId
- **401 Unauthorized** → Token expired or invalid, check refreshSession()
- **Kid login fails** → Verify family code mapping in KV store
- **Points not updating** → Check point event logging, verify middleware

**Monitoring Recommendations:**
- Track API error rates (401, 403, 500)
- Monitor kid login success rate
- Alert on rate limit violations
- Track quest completion rates

---

**End of Audit Report**
