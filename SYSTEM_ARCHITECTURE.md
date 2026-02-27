# Family Growth System - Architecture Overview
**Production-Ready Islamic Family Behavioral Governance Platform**  
**Version:** 1.0 (Pre-Launch)  
**Date:** February 20, 2026

---

## 🏗️ System Architecture

### **High-Level Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌──────────────────┐          ┌──────────────────┐         │
│  │   Parent Mode    │          │    Kid Mode      │         │
│  │  (Command Center)│          │  (Adventure UI)  │         │
│  │   React + Vite   │          │  React + Motion  │         │
│  └──────────────────┘          └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Contexts  │  │    Hooks    │  │  Components │        │
│  │  Auth/Family│  │ Custom Logic│  │   UI/UX     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER                              │
│               /src/utils/api.ts                             │
│    ┌──────────────────────────────────────────┐            │
│    │  Centralized API Client                  │            │
│    │  - JWT Token Management                  │            │
│    │  - Auto-Refresh                          │            │
│    │  - Error Handling                        │            │
│    └──────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND SERVER                            │
│         Supabase Edge Function (Deno/Hono)                  │
│    /supabase/functions/server/index.tsx                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │Middleware│ │ Endpoints│ │ Business │ │  Utils   │      │
│  │  Auth    │ │  REST    │ │  Logic   │ │ Helpers  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                               │
│                 Supabase Postgres                           │
│  ┌──────────────────────────────────────────┐              │
│  │        KV Store (kv_store_f116e23f)      │              │
│  │  - Families, Children, Events            │              │
│  │  - Challenges, Rewards, Quests           │              │
│  │  - Kid Sessions, Rate Limits             │              │
│  └──────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

### **Frontend (`/src/app/`)**

```
/src/app/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui primitives
│   ├── ProtectedRoute.tsx
│   ├── ErrorBoundary.tsx
│   └── ...
├── contexts/           # React Context providers
│   ├── AuthContext.tsx        # Parent authentication
│   ├── FamilyContext.tsx      # Family data management
│   ├── ViewModeContext.tsx    # Parent/Kid view toggle
│   └── ...
├── hooks/              # Custom React hooks
│   ├── useChallenges.tsx
│   ├── useRewards.ts
│   ├── useMilestones.ts
│   └── ...
├── layouts/            # Page layouts
│   ├── ProvidersLayout.tsx    # Wraps all contexts
│   ├── RootLayout.tsx         # Main app layout
│   └── ...
├── pages/              # Route components
│   ├── ParentLogin.tsx
│   ├── KidLoginNew.tsx
│   ├── DashboardRouter.tsx
│   ├── LogBehavior.tsx
│   ├── Challenges.tsx
│   └── ...
├── utils/              # Frontend utilities
│   ├── auth.ts         # Mode management (kid/parent)
│   ├── authHelpers.ts  # Session helpers
│   └── ...
├── App.tsx             # Root component
└── routes.tsx          # Route configuration
```

### **Backend (`/supabase/functions/server/`)**

```
/supabase/functions/server/
├── index.tsx           # Main server (Hono app)
├── middleware.tsx      # Auth & access control
├── validation.tsx      # Request validation (Zod)
├── rateLimit.tsx       # Rate limiting logic
├── kidSessions.tsx     # Kid session management
├── invites.tsx         # Family invite system
├── kv_store.tsx        # KV database wrapper (PROTECTED)
└── questGenerator.tsx  # Dynamic quest generation
```

### **Utilities (`/src/utils/`, `/utils/`)**

```
/src/utils/
├── api.ts              # Centralized API client
└── sessionCleanup.ts   # Session cleanup utilities

/utils/supabase/
├── client.ts           # Supabase browser client
└── info.tsx            # Project ID & keys (PROTECTED)
```

---

## 🔐 Authentication Architecture

### **Dual-Mode Authentication**

#### **Parent Mode (Supabase Auth)**
```typescript
// Authentication Flow
1. User signs up/logs in → Supabase JWT issued
2. JWT stored in localStorage (auto-managed by Supabase)
3. Frontend sends JWT in Authorization header
4. Backend verifies JWT via Supabase client
5. Session auto-refreshes on expiry (1 hour)
```

**Key Files:**
- `/src/app/pages/ParentLogin.tsx` - Login UI
- `/src/app/contexts/AuthContext.tsx` - Session management
- `/supabase/functions/server/middleware.tsx:42` - JWT verification

#### **Kid Mode (Custom Session Tokens)**
```typescript
// Authentication Flow
1. Kid enters family code → Verify via /public/verify-family-code
2. Kid selects name and enters PIN → Verify via /kid/login
3. Backend generates kid_[random] session token
4. Token stored in localStorage (kid_access_token)
5. Frontend sends token in Authorization header
6. Backend verifies via kidSessions.tsx
```

**Key Files:**
- `/src/app/pages/KidLoginNew.tsx` - Kid login UI
- `/src/app/utils/auth.ts:setKidMode()` - Kid session storage
- `/supabase/functions/server/kidSessions.tsx` - Session management
- `/supabase/functions/server/middleware.tsx:62` - Kid token verification

### **Session Refresh Strategy**

```typescript
// FamilyContext.tsx - Before every API call
const { data: { session }, error } = await supabase.auth.getSession();

if (error?.message?.includes('refresh_token_not_found')) {
  // Session expired - redirect to login
  window.location.href = '/login';
  return;
}

// Use refreshed token for API call
const accessToken = session.access_token;
```

---

## 🛡️ Security Middleware

### **Middleware Chain**

```typescript
// Example protected endpoint
app.post(
  "/make-server-f116e23f/point-events",
  requireAuth,          // 1. Verify JWT/kid token
  requireChildAccess,   // 2. Verify access to child
  async (c) => { ... }
);
```

### **Middleware Functions**

| Middleware | Purpose | Returns |
|------------|---------|---------|
| `requireAuth` | Validates JWT or kid session token | 401 if invalid |
| `requireParent` | Ensures user is parent (not kid) | 403 if kid session |
| `requireFamilyAccess` | Validates family membership | 403 if not member |
| `requireChildAccess` | Validates child ownership | 403 if unauthorized |

### **Access Control Logic**

```typescript
// requireFamilyAccess (line 215)
if (user.isKidSession) {
  // Kid can only access their own family
  if (user.familyId !== familyId) {
    return c.json({ error: "Access denied" }, 403);
  }
} else {
  // Parent must be in family.parentIds
  const family = await kv.get(`family:${familyId}`);
  if (!family.parentIds.includes(user.id)) {
    return c.json({ error: "Access denied" }, 403);
  }
}
```

---

## 🎯 Route Protection

### **Frontend Route Guards**

#### **Public Routes** (No auth required)
- `/welcome`
- `/parent-login`, `/login`
- `/signup`
- `/kid-login-new`, `/kid/login`

#### **Protected Routes** (Require Supabase session)
```tsx
<ProtectedRoute>
  <RequireFamily>
    <ProvidersLayout>
      {/* Dashboard, Settings, Log, etc. */}
    </ProvidersLayout>
  </RequireFamily>
</ProtectedRoute>
```

- `/` (Dashboard)
- `/log`, `/review`, `/adjustments`
- `/attendance`, `/rewards`, `/audit`
- `/settings`, `/challenges`, `/quizzes`

#### **Kid Routes** (Require kid session)
```tsx
<RequireKidAuth>
  <ProvidersLayout>
    <KidDashboard />
  </ProvidersLayout>
</RequireKidAuth>
```

- `/kid/home`
- `/kid/wishlist`

### **Backend Route Protection**

All endpoints prefixed with `/make-server-f116e23f/` require authentication except:
- `/public/*` - Public endpoints (family code verification)
- `/kid/login` - Kid login endpoint

**Total Endpoints:** 80+  
**Protected Endpoints:** 75+  
**Public Endpoints:** 5

---

## 📊 Data Model (KV Store)

### **Entity Prefixes**

```typescript
// All keys use prefixes for organization
family:[uuid]              // Family data
child:[uuid]               // Child profiles
parent:[uuid]              // Parent metadata (if needed)
provider:[uuid]            // Service providers
trackable:[uuid]           // Behaviors/habits
milestone:[uuid]           // Achievement milestones
reward:[uuid]              // Redeemable rewards
event:[uuid]               // Point events (ledger)
attendance:[uuid]          // Attendance records
editRequest:[uuid]         // Edit requests from kids
wishlist:[uuid]            // Wishlist items
redemption:[uuid]          // Redemption requests
challenge:[uuid]           // Adventure challenges
quest:[uuid]               // Dynamic quests
quiz:[uuid]                // Islamic quizzes
quizAttempt:[uuid]         // Quiz attempts
kidSession:[token]         // Kid session tokens
rateLimit:[key]            // Rate limiting data
inviteCode:[code]          // Family invite codes
```

### **Core Entities**

#### **Family**
```typescript
{
  id: "family:uuid",
  name: "Al-Rahman Family",
  parentIds: ["user_id1", "user_id2"],
  inviteCode: "ABC123",
  createdAt: "2026-02-20T..."
}
```

#### **Child**
```typescript
{
  id: "child:uuid",
  name: "Aisha",
  familyId: "family:uuid",
  avatar: "🧕",
  pin: "hashed_pin",
  currentPoints: 150,
  highestMilestone: 200,
  targetRewardId: "reward:uuid",
  streaks: { "trackable:prayer": { current: 5, longest: 10 } },
  createdAt: "2026-02-20T..."
}
```

#### **Point Event** (Ledger)
```typescript
{
  id: "event:uuid",
  childId: "child:uuid",
  trackableItemId: "trackable:prayer",
  providerId: "provider:mosque",
  points: 10,
  timestamp: "2026-02-20T10:30:00Z",
  description: "Fajr prayer",
  isAdjustment: false,
  status: "active" | "voided",
  voidedAt?: "2026-02-21T...",
  voidReason?: "Entered by mistake"
}
```

---

## 🔄 Data Flow Examples

### **Example 1: Logging a Behavior**

```
1. Parent clicks "Log Behavior" → LogBehavior.tsx
2. Selects child, behavior, points → Form state
3. Clicks "Submit" → api.logPointEvent()
4. POST /point-events with JWT header
5. Backend: requireAuth → requireChildAccess
6. Validation: Zod schema validates request
7. Dedupe check: Prevent duplicate entries (5-min window)
8. Create event record in KV store
9. Update child.currentPoints atomically
10. Update streaks if applicable
11. Return success → Frontend updates UI
12. Toast notification: "✅ 10 points logged!"
```

### **Example 2: Kid Login**

```
1. Kid enters family code → KidLoginNew.tsx
2. POST /public/verify-family-code (no auth)
3. Backend returns family name & kid list
4. Kid selects name, enters PIN
5. POST /kid/login with familyCode, childId, pin
6. Backend:
   a. Verify family code exists
   b. Verify child exists in family
   c. Check rate limit (3 attempts / 5 min)
   d. Hash PIN and compare with stored hash
   e. If match, create kid session token
   f. Store session in KV: kidSession:[token]
7. Return { kidAccessToken, kid, familyCode }
8. Frontend: setKidMode() stores in localStorage
9. Navigate to /kid/home
10. RequireKidAuth validates token → Allow access
```

### **Example 3: Challenge Completion**

```
1. Kid views challenges → KidDashboard.tsx
2. Backend checks progress every 6 hours (cron)
3. POST /challenges/check-progress
4. Backend:
   a. Get all active challenges
   b. For each challenge, check conditions:
      - "Pray 5 times" → Count prayer events this week
      - "Attend 3 classes" → Count attendance records
   c. If conditions met:
      - Mark challenge as completed
      - Create +20 point event
      - Update child.currentPoints
      - Update child.highestMilestone
5. Return completed challenges
6. Frontend shows celebration animation 🎉
7. Toast: "🏆 Challenge completed! +20 points"
```

---

## 🚀 Performance & Optimization

### **Frontend Optimizations**

1. **React Contexts:** Minimize re-renders with proper memoization
2. **Lazy Loading:** Code-split routes (React Router v7)
3. **Image Optimization:** Unsplash images with WebP format
4. **Bundle Size:** Tree-shaking unused code

### **Backend Optimizations**

1. **KV Store:** In-memory key-value store (fast reads)
2. **Rate Limiting:** Prevent abuse without database queries
3. **Dedupe Windows:** 5-minute window prevents duplicate events
4. **Atomic Operations:** Update child points in single KV write

### **API Request Patterns**

```typescript
// GOOD: Batch requests
const [family, children, events] = await Promise.all([
  getFamily(familyId),
  getChildren(familyId),
  getChildEvents(childId)
]);

// BAD: Sequential requests
const family = await getFamily(familyId);
const children = await getChildren(familyId);
const events = await getChildEvents(childId);
```

---

## 🛠️ Development Workflow

### **Local Development**

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Start Supabase functions locally
supabase functions serve

# Run tests (if applicable)
npm test
```

### **Environment Variables**

**Frontend (Vite):**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Public anon key

**Backend (Supabase Functions):**
- `SUPABASE_URL` - Project URL
- `SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin key (sensitive!)
- `SUPABASE_DB_URL` - Database connection string
- `JWT_SECRET` - JWT signing secret

---

## 🔍 Debugging Guide

### **Common Issues**

#### **Issue 1: "Invalid JWT" Error**
**Cause:** Token expired or corrupted  
**Solution:** Session refresh implemented in FamilyContext.tsx:190

#### **Issue 2: "Access denied to this family"**
**Cause:** User not in family.parentIds  
**Solution:** Check family membership via Supabase dashboard

#### **Issue 3: Kid login fails with "Locked"**
**Cause:** Rate limiting after 3 failed PIN attempts  
**Solution:** Wait 15 minutes or reset via backend

#### **Issue 4: Points not updating**
**Cause:** Dedupe window preventing duplicate entries  
**Solution:** Wait 5 minutes or use different timestamp

### **Logging Strategy**

**Frontend:**
```typescript
console.log('🔍 Debug:', data);     // General debug
console.log('✅ Success:', result);  // Success states
console.error('❌ Error:', error);   // Errors
console.log('🔒 Auth:', session);    // Auth-related
console.log('🏗️ Context:', state);  // Context updates
```

**Backend:**
```typescript
console.log('🔐 requireAuth:', { userId, path });
console.log('✅ Success:', { childId, points });
console.error('❌ Error:', { error, endpoint });
```

---

## 📦 Deployment Architecture

### **Hosting**

- **Frontend:** Vercel / Netlify (recommended)
- **Backend:** Supabase Edge Functions (auto-deployed)
- **Database:** Supabase Postgres (managed)

### **CI/CD Pipeline**

```
1. Push to GitHub
2. GitHub Actions triggers build
3. Run tests (if configured)
4. Build frontend (Vite)
5. Deploy to Vercel
6. Supabase functions auto-deploy on push to main
```

### **Production Environment**

```
┌─────────────────────────────────────────────┐
│  Vercel (Frontend)                          │
│  - React app served as static files         │
│  - CDN distribution                         │
│  - Auto-scaling                             │
└─────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  Supabase Edge Functions (Backend)          │
│  - Deno runtime (V8 isolates)               │
│  - Auto-scaling                             │
│  - 0ms cold start                           │
└─────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│  Supabase Postgres (Database)               │
│  - Managed database                         │
│  - Auto-backups                             │
│  - Point-in-time recovery                   │
└─────────────────────────────────────────────┘
```

---

## 🎨 Design System

### **Parent Mode (Command Center)**

- **Colors:** Professional blues, grays
- **Typography:** Clean sans-serif (Inter, system fonts)
- **Layout:** Dashboard, tables, charts
- **Components:** shadcn/ui (Radix UI primitives)

### **Kid Mode (Adventure World)**

- **Colors:** Warm Islamic palette (gold, cream, teal)
- **Typography:** Friendly, readable
- **Layout:** Card-based, gamified
- **Animations:** Motion (formerly Framer Motion)
- **Icons:** Lucide React

### **Tailwind CSS v4**

- Custom theme tokens in `/src/styles/theme.css`
- Font imports in `/src/styles/fonts.css`
- Global styles in `/src/styles/global.css`

---

## 🔮 Future Enhancements

### **Phase 5: Mobile Apps** (Next Priority)
- [ ] Separate iOS apps (Parent + Kid)
- [ ] React Native or Capacitor
- [ ] Push notifications
- [ ] Offline mode

### **Phase 6: Advanced Features**
- [ ] Social features (family leaderboards)
- [ ] Advanced analytics (ML-powered insights)
- [ ] Multi-language support (Arabic, Urdu)
- [ ] Advanced gamification (badges, achievements)

### **Phase 7: Enterprise Features**
- [ ] Islamic school integration
- [ ] Mosque class management
- [ ] Multi-family communities
- [ ] Teacher/admin roles

---

## 📚 Key Dependencies

### **Frontend**
- `react@18` - UI framework
- `react-router@7` - Routing (data mode)
- `motion@11` - Animations
- `tailwindcss@4` - Styling
- `@supabase/supabase-js@2` - Auth & database client
- `lucide-react` - Icons
- `recharts` - Charts
- `sonner` - Toast notifications

### **Backend**
- `npm:hono@4` - Web framework
- `npm:@supabase/supabase-js@2` - Database client
- `npm:zod@3` - Validation
- `npm:bcryptjs` - Password hashing

---

## 👥 Team & Roles

**Current Status:** Solo developer (AI-assisted)  
**Target Roles for Launch:**
- Product Owner / Founder
- Backend Developer (Supabase/Deno)
- Frontend Developer (React)
- UX Designer (Islamic aesthetics)
- QA Engineer (Testing)
- Beta Testers (Muslim families)

---

## 📞 Support & Documentation

- **Technical Docs:** This file + `/RELEASE_GATE_AUDIT.md`
- **Test Plan:** `/P0_TEST_EXECUTION.md`
- **API Docs:** Backend comments in `/supabase/functions/server/index.tsx`
- **Issue Tracking:** GitHub Issues (recommended)

---

**Last Updated:** February 20, 2026  
**Version:** 1.0 Pre-Launch  
**Status:** ✅ Production-Ready (pending P0 tests)
