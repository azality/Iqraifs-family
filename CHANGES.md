# FGS Change Log — Medium-Severity Fixes + localStorage Migration

## Summary

Four scoped fixes plus a codebase-wide raw-localStorage migration. Drop the
`src/`, `supabase/`, and `package.json` files into your repo preserving paths.

## 1. Remove unused MUI / Emotion dependencies

**File:** `package.json`

Removed `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`.
Verified zero `@mui` or `@emotion` imports remain under `src/`. Shadcn/Radix is
the only UI system in use.

## 2. AuthContext session cache TTL: 2s → 30s

**File:** `src/app/contexts/AuthContext.tsx` (line 51)

```ts
const SESSION_CACHE_TTL = 30_000; // Cache session for 30 seconds
```

Was `2000`. A 2-second TTL effectively disabled caching on any cold render
path; 30s matches the user's choice and still stays well under Supabase
access-token lifetime.

## 3. Dashboard `submitRecovery` — real implementation

**Files:**
- `src/app/pages/Dashboard.tsx` — new `submitRecovery` + callsite now passes
  `recoveryAction` (previously dropped).
- `src/utils/api.ts` — already had `logPointEvent`; no change needed for this
  path beyond the broader migration.

`submitRecovery(eventId, recoveryAction, recoveryNotes)` now:

1. Looks up the original negative event from local state to carry over the
   `trackableItemId`.
2. Calls `logPointEvent` with `isRecovery: true`, `recoveryFromEventId`,
   `recoveryAction`, `recoveryNotes`, and fixed point awards:
   `apology: 2`, `reflection: 3`, `correction: 5`.
3. Re-fetches `getChildEvents(child.id)` and refreshes local state so the
   timeline reflects the recovery without a full reload.

Pre-existing bug fixed in the same pass: `RecoveryDialog` passed
`recoveryAction` to its onSubmit prop, but the Dashboard callsite discarded
it. It is now forwarded through.

## 4. Settings guardrail-mode update — real implementation

**Files:**
- `src/app/pages/Settings.tsx` (~line 2030) — TODO stub replaced with an
  `updateTrackableItem(item.id, { religiousGuardrailMode })` call, with
  toast-based success/failure.
- `src/app/hooks/useTrackableItems.ts` — added `updateItem(id, updates)` with
  optimistic UI update and rollback on failure.
- `src/utils/api.ts` — added `updateTrackableItem(itemId, updates)` hitting
  `PATCH /trackable-items/:id`, and wired into the exported `api` object.
- `supabase/functions/server/index.tsx` — added a `PATCH
  /make-server-f116e23f/trackable-items/:id` endpoint guarded by
  `requireAuth + requireParent`. Strips `id`/`createdAt` from the payload,
  merges the remaining fields, stamps `updatedAt`, writes back via `kv.set`.

## 5. Raw `localStorage` → async storage abstraction

Migrated all raw `localStorage.*` sites in production code
(`src/app/**`, `src/utils/**`, excluding `src/tests/**`,
`src/app/tests/**`, and the test harness `src/app/data/test-auth-comprehensive.ts`)
to the async `getStorage/setStorage/removeStorage/removeMultiple/setMultiple`
helpers in `src/utils/storage.ts`. Native iOS now gets Capacitor Preferences
parity for all of these sites instead of the Capacitor-webview localStorage
shim.

The following **documented** `window.localStorage` escape hatches remain (each
has an `eslint-disable no-restricted-globals` and a rationale comment):

- `src/app/App.tsx` — `clearExpiredKidSession()` runs at module-import time,
  before React mounts, to wipe a known-expired token synchronously. On native,
  we fire-and-forget `removeMultiple(KID_SESSION_KEYS)` to mirror the wipe
  into Capacitor Preferences.
- `src/app/utils/authHelpers.ts` — `getCurrentRoleSync()` is used by
  render-time route guards that cannot await.
- `src/utils/sessionCleanup.ts` — detects + wipes corrupted Supabase session
  blobs. Supabase persists its own session directly in `window.localStorage`,
  so we must read/write it directly here. FGS keys still go through
  `removeMultiple` for native parity.
- `src/app/utils/sessionCleanup.ts` — same Supabase-key cleanup reason for the
  user-not-found recovery path.

### Known follow-up: `src/app/utils/auth.ts`

`src/app/utils/auth.ts` is **not** body-converted in this pass and instead
carries a prominent top-of-file FIXME comment. Its exports
(`getCurrentMode`, `getKidToken`, `getKidInfo`, `getFamilyId`,
`setParentMode`, `setKidMode`, `logoutKid`, `clearAllAuth`) are synchronous by
design — they are consumed from render bodies (e.g. `RequireParentRole`,
`ProtectedRoute`) that cannot await. Rewriting them to async cascades through
the whole app and is a separate refactor; doing it imperfectly in this pass
would risk breaking kid-mode auth. The FIXME block documents exactly why and
what the conversion would entail.

## Files touched (36)

Production code + backend:

```
package.json
supabase/functions/server/index.tsx
src/utils/api.ts
src/utils/sessionCleanup.ts
src/app/App.tsx
src/app/components/AuthErrorBanner.tsx
src/app/components/ModeSwitcher.tsx
src/app/components/ProtectedRoute.tsx
src/app/components/RequireParentRole.tsx
src/app/components/TestControlPanel.tsx
src/app/components/mobile/FloatingActionButton.tsx
src/app/contexts/AuthContext.tsx
src/app/contexts/FamilyContext.tsx
src/app/contexts/ViewModeContext.tsx
src/app/hooks/useChallenges.tsx
src/app/hooks/useMilestones.ts
src/app/hooks/useRewards.ts
src/app/hooks/useTrackableItems.ts
src/app/layouts/RootLayout.tsx
src/app/pages/Dashboard.tsx
src/app/pages/DashboardRouter.tsx
src/app/pages/JoinPending.tsx
src/app/pages/KidDashboard.tsx
src/app/pages/KidLoginNew.tsx
src/app/pages/KidWishlist.tsx
src/app/pages/LogBehavior.tsx
src/app/pages/Onboarding.tsx
src/app/pages/ParentLogin.tsx
src/app/pages/ParentSignup.tsx
src/app/pages/PrayerApprovals.tsx
src/app/pages/PrayerLogging.tsx
src/app/pages/Settings.tsx
src/app/utils/auth.ts              (FIXME doc only — intentional follow-up)
src/app/utils/authHelpers.ts
src/app/utils/kidSessionGuard.ts
src/app/utils/sessionCleanup.ts
```

## Verification performed

- `@mui|@emotion` grep across `src/` → 0 hits
- `TODO` grep in `Dashboard.tsx`, `Settings.tsx` → 0 hits
- `SESSION_CACHE_TTL` → `30_000` confirmed at line 51 of `AuthContext.tsx`
- `localStorage\.` grep in `src/app/**` + `src/utils/**` (excl. tests) →
  only the `storage.ts` abstraction + documented escape hatches + the
  intentionally-unmigrated `src/app/utils/auth.ts` remain.

## Recommended next steps

1. Run `npm install` (or `pnpm install`) after dropping in the new
   `package.json` to prune the MUI/Emotion packages.
2. Smoke test: parent login → kid login → recovery logging on Dashboard →
   guardrail mode toggle on a trackable item in Settings.
3. Schedule the `src/app/utils/auth.ts` async refactor as its own ticket
   (the FIXME at the top of the file is the starting point).
