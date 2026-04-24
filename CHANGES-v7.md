# FGS v7 — Prayer approval fix + kid points log + bonus celebration

## Bugs fixed (user report)

1. **"When I approve a kid's 'I Prayed' claim, the kid's points don't go up."**
   Prayer approval appeared to succeed — toast fired, claim moved out of
   pending — but the kid's `currentPoints` never increased and the approval
   event never showed up in the kid's activity log.

2. **"Kid has no way to see how they're earning points."** Even when the
   activity log rendered on the kid dashboard, prayer-approval events weren't
   reaching it, so it always looked empty after approvals.

3. **New capability — bonus points with celebration.** Parent wanted a way
   to award extra points at approval time ("prayed beautifully") and have
   the kid feel it — distinct visual + confetti animation.

## Root cause for #1

Inside `supabase/functions/make-server-f116e23f/prayerLogging.tsx`,
`approvePrayerClaim` was doing:

```ts
const child = await kv.get(`child:${claim.childId}`);
```

But `claim.childId` already contains the `child:` prefix (it's written that
way by POST `/prayer-claims`, which accepts a prefixed `childId` from the
client — see `index.ts:3463,3475`). The lookup became `child:child:abc...`,
which never resolves, so the `if (child)` block silently no-oped. Net effect:
- the `event:<id>` record was written (good — audit trail intact)
- `child.currentPoints` was NEVER updated (bug)
- `events-by-child:<childId>` index was NEVER updated (bug)

Same bug family as the v5.1 samples-endpoint double-prefix fix. Also present
at line 162 (notification lookup) of the same file.

## Root cause for #2

`KidDashboard.tsx` was fetching point events from
`${API_BASE}/families/${familyId}/children/${child.id}/events`, but the
server only exposes `/children/:childId/events` (no `/families/…` prefix).
Every request 404'd, so `pointEvents` stayed at `[]` and the activity log
never rendered. Pre-existing client bug, surfaced by the user now that prayer
approvals were finally crediting points.

## Files changed (4)

```
supabase/functions/make-server-f116e23f/prayerLogging.tsx
supabase/functions/make-server-f116e23f/index.ts
src/app/pages/PrayerApprovals.tsx
src/app/pages/KidDashboard.tsx
```

## Backend — `prayerLogging.tsx`

1. **Double-prefix fix (line 337, 340).** `kv.get(\`child:\${claim.childId}\`)`
   → `kv.get(claim.childId)`, same for the `kv.set`. Comment added explaining
   why, so future edits don't re-break this.
2. **Notification double-prefix fix (line 162).** Same pattern inside
   `createPrayerClaim`'s notification block.
3. **Optional bonus points on approval.** `approvePrayerClaim` now accepts
   `bonusPoints: number` and `bonusReason: string`. When `bonusPoints > 0`:
   - A second event is written with `isBonus: true`, `bonusReason`,
     `trackableItemId: 'prayer_bonus'`, `itemName: 'Bonus: <prayer>'`.
   - `child.currentPoints` is incremented by `base + bonus`.
   - `events-by-child` index picks up both events.
   - Return type now includes an optional `bonusEvent`.
   - Bonus clamped to `[0, 500]` to match the validation bounds used by
     challenges (`validation.tsx:771`).

## Backend — `index.ts`

`POST /prayer-claims/:claimId/approve` now reads `bonusPoints` and
`bonusReason` from the request body (both optional, default `0` / `''`) and
forwards them to `approvePrayerClaim`. Response shape gains an optional
`bonusEvent` field so the parent UI could surface "+N bonus" confirmation.

## Frontend — `PrayerApprovals.tsx` (parent side)

- `approveClaim(claimId, opts?)` — accepts optional `{ bonusPoints, bonusReason }`
  and POSTs them alongside `{ onTime: true }`. When bonus is present, shows a
  "+N bonus! ✨" toast in addition to the usual approval confirmation.
- **New "✨ Approve + Bonus" button** on each pending claim card (gold
  gradient), between "Approve" and "Deny".
- **New Bonus Modal** — quick-pick amount (1 / 2 / 3 / 5 / 10), free-text
  reason capped at 80 chars (e.g. "Prayed beautifully with full focus"),
  cancel + confirm. Confirm calls `approveClaim(id, { bonusPoints, bonusReason })`.

## Frontend — `KidDashboard.tsx` (kid side)

- **URL fix.** All three `.../events` fetches changed from
  `${API_BASE}/families/${familyId}/children/${child.id}/events` to
  `${API_BASE}/children/${child.id}/events` (matches the server route).
- **20-second event poll.** Added a `setInterval` on point events so parent
  approvals (including bonus awards) surface on the kid dashboard within ~20s
  without a manual refresh.
- **Bonus detection effect.** A `useRef<Set<string>>` of seen-bonus-event IDs
  (seeded from storage under `bonus-seen:<childId>`, capped at last 200) lets
  us detect *newly-arrived* bonus events. When any arrive, the most recent
  populates a `celebration` state (`{ points, reason, itemName }`).
- **Confetti + banner.** `celebration !== null` fires the existing
  `<Confetti />` component (30 particles, 2.5s) AND renders a gold-gradient
  banner pinned at the top center with the bonus reason and amount. Auto-
  dismisses after 4s; user can also tap ×.
- **Activity-log bonus styling.** The existing "How You Earned Points" tiles
  now render `event.isBonus` events with:
  - gold → yellow gradient background with a soft amber ring
  - Sparkles icon in a filled amber circle
  - "BONUS" badge beside the item name
  - bonus reason rendered in amber-700 italic
  - `+N` count in amber-600

## Smoke test

1. **Points credit on approval.** Kid logs Fajr, parent approves (plain).
   Kid's header total increases by 5 within ~20s (via poll); activity log
   shows the prayer tile.
2. **Bonus flow.** Kid logs Dhuhr. Parent taps "✨ Approve + Bonus",
   picks +3, types "Prayed with full focus", confirms. Within ~20s on kid
   dashboard: confetti fires, gold banner "Bonus Points! +3 ✨" appears with
   the reason, activity log shows a gold tile beside the regular prayer tile.
3. **No re-celebration.** Refresh kid dashboard — banner does NOT refire; the
   bonus event is still visible in the log but no confetti.
4. **Edge: bonus without reason.** Parent leaves reason blank. Backend writes
   `bonusReason: 'Extra effort'` as the default; kid sees that string in both
   banner and tile.
5. **Backwards compat.** Any client that POSTs `/prayer-claims/:id/approve`
   without bonus fields still works exactly as before.
