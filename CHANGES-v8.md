# FGS v8 — Quest preview/edit/delete + kid transparency widget + Knowledge Quest fixes

## Bugs fixed (user report — all four issues raised after v7)

1. **"On the quest, it only allows me to generate quest daily and generate
   weekly quest. I don't see what those daily quest or the weekly quests
   are. I should be able to see what kind of quest is being generated and
   also I should be able to modify before the challenge is accepted, and I
   should be able to create my own quests."**
   The Generate buttons fired blind — the parent never saw the templates,
   and there was no way to remove an unwanted one once it was created.

2. **"When I do generate weekly quest it says 'Please configure salah and
   behaviors first to generate quests' — I don't know where I should
   configure this."**
   The error was real (the quest-template generator was reading items from
   the wrong KV prefix and finding nothing) AND the error message gave the
   parent no path forward.

3. **"When I am logged in as a kid and do questions (Adventure Quest) it
   says no questions in the category but in fact I see there are 35
   questions."**
   Caused by selecting a category that had questions in some difficulties
   but not the one the kid clicked. The 404 came back as a generic "no
   questions found" with no per-difficulty count or hint.

4. **"On the kid login when you're on the Knowledge Quest, why is it
   showing 'Add sample questions (free)'? It's a kid login. (It would
   make sense if it shows on the parent login when we don't have any
   questions.)"**
   The seeder button rendered for kids too — but kids can't (and
   shouldn't be able to) write the question bank.

5. **New capability — kid transparency widget.** "I want the kid to know
   what sort of log behavior is available… for transparency what behavior
   and points the kid can get."

## Root cause for #2

`generateQuestTemplates` in
`supabase/functions/make-server-f116e23f/index.ts` was reading
trackable items via:

```ts
const allItems = await kv.getByPrefix(`item:${familyId}:`);
```

But `POST /trackable-items` stores items with the key
`item:${Date.now()}` — no `familyId` segment. So the prefix scan never
matched anything for any family, `templates` came back empty, and the
parent saw "Please configure salah and behaviors first to generate
quests" forever — even though items were configured. Compounding the
problem, items written before this fix were never stamped with a
`familyId` field at all, so even after fixing the scan we'd need a
"trust legacy items" fallback.

## Files changed (5 + 1 new)

```
supabase/functions/make-server-f116e23f/index.ts   (backend)
src/app/pages/Challenges.tsx                       (parent UI)
src/app/pages/KnowledgeQuest.tsx                   (kid+parent UI)
src/app/pages/KnowledgeQuestPlay.tsx               (kid+parent UI)
src/app/pages/KidDashboard.tsx                     (kid UI — new widget)
src/app/components/QuestPreviewDialog.tsx          (NEW)
```

## Backend — `index.ts`

1. **`SERVER_VERSION`** bumped to `v1.0.8-quest-fixes`.
2. **`generateQuestTemplates` prefix fix.** Scan `'item:'` (no familyId
   segment) and filter by `it.familyId === familyId || !it.familyId`.
   The `!it.familyId` clause keeps legacy items (written before we
   started stamping) usable.
3. **`POST /trackable-items` stamps `familyId`.** Reads from the request
   body when provided, falls back to `getUserFamilyId(c)`.
4. **`POST /trackable-items/seed-starter` (NEW).** Parent-only.
   Idempotent: existing item names are skipped. Seeds 5 salah + 4
   positive behaviors + 1 negative — enough to get quest generation
   working with one tap. Used by the helper card on Challenges.
5. **`POST /children/:childId/challenges/generate` accepts
   `templateIds`.** When supplied (from QuestPreviewDialog), it builds
   challenges from exactly those template IDs instead of randomly
   picking 2–3.
6. **`GET /children/:childId/challenges/preview?type=daily|weekly`
   (NEW).** Parent-only. Returns the full template pool without
   creating any challenges. Returns the same `NO_TRACKABLE_ITEMS`
   shape so the dialog can fall back to the helper card.
7. **`POST /children/:childId/challenges/delete` (NEW).** Parent-only.
   Refuses to delete `status === 'completed'` challenges
   (`COMPLETED_LOCKED` code) since those already awarded points and
   their event log is part of the audit trail.
8. **Machine-readable error codes.** When the generate endpoint can't
   find any templates it now responds with:
   ```json
   {
     "error": "No behaviors configured yet",
     "message": "Please configure salah and behaviors first to generate quests",
     "code": "NO_TRACKABLE_ITEMS",
     "hint": "Go to Settings → Trackable Items to add Salah, Habits, and Positive/Negative behaviors. You can also tap \"Add Starter Set\" to seed a sensible default."
   }
   ```

## Frontend — `QuestPreviewDialog.tsx` (NEW)

- Calls the new preview endpoint, renders one row per template (icon,
  title, description, difficulty, bonus, type).
- Each row has a checkbox; "Select all / Deselect all" toggle at the
  top.
- "Create N Quests" calls the existing generate endpoint with
  `templateIds`.
- If the preview comes back with `NO_TRACKABLE_ITEMS`, the dialog
  closes itself and surfaces a toast pointing the parent at the helper
  card on the Challenges page.

## Frontend — `Challenges.tsx`

- **New "Preview Daily" / "Preview Weekly" buttons** in both the
  single-child and multi-child views, alongside the existing
  Generate buttons. Preview opens the new dialog.
- **NO_TRACKABLE_ITEMS helper card** — when the generate endpoint
  responds with that code, an amber card appears with two actions:
  "Open Settings → Trackable Items" (deep-links to the right tab) and
  "Add Starter Set" (calls the new seed-starter endpoint and
  auto-clears the helper).
- **"Remove" button on every available challenge.** Confirms via
  `window.confirm`, calls the new delete endpoint, and refreshes the
  list. Completed challenges are locked by the backend.
- **CustomQuestsManager surfaced in the single-child view too** (it
  was previously only visible in multi-child mode).

## Frontend — `KnowledgeQuest.tsx`

- **Seeder button is parent-only.** The "Add Sample Questions (Free!)"
  card now requires `isParentMode`. Kids see a parallel
  `purple → pink` "No questions yet — ask a parent" card in the same
  slot, with no button.
- When the parent navigates to /play, we now pass the full
  `categoryCatalog` (categories + per-difficulty counts) via
  `location.state`, so the play screen can show counts and pre-empt
  empty pools.

## Frontend — `KnowledgeQuestPlay.tsx`

- **Per-difficulty counts on Easy / Medium / Hard buttons.** Each
  button now reads "12 questions available" instead of "Quick Win!"
  (when a catalog was supplied — falls back to flavor text when not).
- **Buttons disable when `count === 0`.** Plus an inline amber banner
  ("No questions here yet — ask a parent…") when all three are zero.
- **Better 404 toast.** Now says "No medium Islamic / Math available.
  Try a different difficulty or topic." instead of the generic message.

## Frontend — `KidDashboard.tsx`

- **NEW widget: "How You Can Earn Points 🎯"** rendered between Quests
  and the Recent Activity log. Pulls from the same
  `/trackable-items` endpoint the parent writes to and groups items
  by category:
  - 🕌 Salah (blue)
  - 🌱 Habits (green)
  - ✨ Positive (purple, points >= 0)
  - ⚠️ Needs Work (red, points < 0)
  Each row is a chip showing the item name + a colored points badge
  (e.g. `Fajr +5`, `Talked back -2`). Empty groups are hidden.

## Smoke test

1. **Quest preview.** Parent → Challenges → "Preview Daily" → dialog
   shows ~6 templates → uncheck two → "Create N Quests" → exactly
   those four show up under Available; new behavior is consistent
   across single-child and multi-child views.
2. **NO_TRACKABLE_ITEMS unblock.** Wipe trackable items → Generate Daily
   → toast + amber helper card appears → "Add Starter Set" → toast
   "Added 10 starter items" → Generate Daily again → succeeds.
3. **Delete challenge.** Available challenge → "Remove" → confirm →
   challenge disappears. Completed challenge → no Remove button (or
   if you wire one up by hand, backend returns `COMPLETED_LOCKED`).
4. **Kid Knowledge Quest.** Log in as kid with no questions → see
   purple "ask a parent" card, no seed button. Parent adds questions
   → kid refreshes → sees categories with per-difficulty chips. Tap
   Hard for a category that has only Easy → button is disabled.
5. **Kid transparency widget.** KidDashboard renders the four-group
   grid with chip + colored points badge. Add a new trackable item as
   parent → kid sees it within one dashboard refresh.
6. **Backwards compat.** Old generate POST (no `templateIds`) still
   randomizes 2–3 templates as before.
