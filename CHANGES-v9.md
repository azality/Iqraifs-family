# FGS v9 — Multi-fix: kid family scoping, dedup, custom-quest behaviors, kid challenge clarity

After v8 the user reported four issues. Three are real bugs (one critical),
one is a UX gap.

## Bugs fixed

1. **CRITICAL — Kids see "No questions yet, ask a parent" even when the
   parent has authored questions.**
   `getUserFamilyId(c)` in `middleware.tsx` only resolved a familyId for
   parents (it scanned `family:` records and matched `parentIds`). For
   kid sessions it returned `null`, so the family-scoped filter
   `q.familyId === familyId || q.isPublic === true` collapsed to
   `q.familyId === null || q.isPublic === true`, silently filtering out
   every family question.
   Same bug silently affected categories, by-difficulty list,
   custom-quests list, and any other endpoint reading via
   `getUserFamilyId(c)` for a kid caller.

2. **Duplicate daily challenges with no safeguard at create time.**
   v8 added a delete endpoint and Remove button, but `POST
   /children/:childId/challenges/generate` had no dedup — pressing
   Generate Daily twice produced two copies of every quest.

3. **"No behaviors configured yet" inside CustomQuestCreator even when
   trackable items exist.**
   The dialog fetched `families/:familyId/behaviors`, which is **not a
   route the backend serves**. Every call 404'd, `behaviors` stayed at
   the `useState([])` default, and the empty-state message rendered
   regardless of how many trackable items the parent had configured.

4. **Kid view of challenges lacked clear "what to do / how to win /
   what you'll get" framing.**
   Title + description + a flat requirements list — not enough scaffold
   for a kid to understand the loop.

## Files changed

```
supabase/functions/make-server-f116e23f/middleware.tsx   (Issue 1)
supabase/functions/make-server-f116e23f/index.ts         (Issue 2 + version)
src/app/components/CustomQuestCreator.tsx                (Issue 3)
src/app/pages/Challenges.tsx                             (Issue 4)
```

## Backend — `middleware.tsx`

`getUserFamilyId` now resolves a familyId for kid sessions by reading
`familyId` directly off the user object that `verifyKidSession` already
attaches in context. Falls back to a child-record lookup for older
session shapes. Parent path is unchanged.

```ts
export async function getUserFamilyId(c: Context): Promise<string | null> {
  const user = c.get("user");
  if (user?.familyId) return user.familyId;       // kid path

  const userId = getAuthUserId(c);
  const kv = await import("./kv_store.tsx");
  const families = await kv.getByPrefix('family:');
  const userFamily = families.find((f: any) => f.parentIds?.includes(userId));
  if (userFamily) return userFamily.id;            // parent path

  const child = await kv.get(userId);              // legacy fallback
  if (child?.familyId) return child.familyId;
  return null;
}
```

## Backend — `index.ts`

- `SERVER_VERSION` bumped to `v1.0.9-multi-fix`.
- `POST /children/:childId/challenges/generate` now drops any template
  the kid already has an `available` or `accepted` challenge for in the
  current period (today for daily, this week for weekly). If everything
  is filtered out it returns:
  ```json
  {
    "challenges": [], "count": 0, "skipped": <n>,
    "code": "ALREADY_GENERATED",
    "message": "<name> already has these <type> quests for <period>.",
    "hint": "Remove an existing quest first, or wait for the period to roll over."
  }
  ```
  This makes Generate idempotent within a period — re-clicking creates
  zero new rows instead of N more dupes. QuestPreviewDialog's "Create
  N Quests" inherits the same safety automatically.

## Frontend — `CustomQuestCreator.tsx`

- Switched the broken `families/:familyId/behaviors` URL to
  `/trackable-items` (the real, family-scoped source). Same response
  shape: `{ id, name, points, category }`.
- Replaced the dead-end "create behaviors first in the Behaviors page"
  copy with an inline helper card:
  - **Add Starter Set** button — POSTs to
    `/trackable-items/seed-starter` (idempotent, parent-only, seeds 5
    prayers + 4 positive + 1 negative behavior in one tap), then
    re-loads the list inline.
  - **Open Settings → Trackable Items** button as the long-form path.
- Parents are no longer dead-ended in the dialog.

## Frontend — `Challenges.tsx` (kid view)

Active and Available challenge cards now render three explicit sections
in a kid-readable card:

- 🎯 **What to do** — `challenge.description`
- ✅ **How to win** — `challenge.requirements[].description`
- 🎁 **What you'll get** — `+N bonus points when you finish before
  tonight / the end of the week`

Same structure across both card types so kids learn the pattern once.

## Smoke test (after redeploying the edge function)

1. **Issue 1 — Kid Knowledge Quest.** Log in as parent → create 3
   questions in any category. Log in as kid → Knowledge Quest →
   confirm the categories appear with per-difficulty counts (no "ask
   a parent" empty state).
2. **Issue 2 — Dedup.** Parent → Challenges → Generate Daily → confirm
   3 quests created. Tap Generate Daily a second time → confirm toast
   "ALREADY_GENERATED" + zero new quests added. Tap Remove on one →
   tap Generate Daily again → exactly the removed one comes back.
3. **Issue 3 — CustomQuestCreator.** Parent with trackable items
   configured → Custom Quest dialog → confirm behaviors list now
   populates (was always empty before). Wipe trackable items → reopen
   dialog → confirm amber helper card with Add Starter Set + Open
   Settings buttons → tap Add Starter Set → list populates inline,
   no navigation required.
4. **Issue 4 — Kid challenge clarity.** Log in as kid → Challenges →
   confirm both Active and Available cards show 🎯 What to do, ✅ How
   to win, 🎁 What you'll get sections.
5. **No regression.** Parent flow for Preview Daily / Generate Daily /
   Remove (v8 features) still works end-to-end.
