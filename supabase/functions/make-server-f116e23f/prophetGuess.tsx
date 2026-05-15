// Guess-the-Prophet game — Hono sub-app.
//
// Mounted under /make-server-f116e23f/games/prophet-guess in index.ts.
//
// Storage: KV (same store as the rest of the family product) so the
// game lives alongside existing kid features without a Postgres detour.
// Keys:
//   prophet-round:<roundId>             — full round state
//   prophet-rounds-by-child:<childId>   — array of recent round ids (capped at 50)
//
// Rounds expire from the "recent" index naturally as the cap rolls over.

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, getAuthUserId, serviceRoleClient } from "./middleware.tsx";
import {
  PROPHETS, PROPHETS_BY_ID, QUESTIONS, QUESTIONS_BY_ID, QUESTION_CATEGORIES,
  answerQuestion,
} from "./prophetGuessData.ts";

const app = new Hono();
app.use("*", requireAuth);

// ─── Constants ──────────────────────────────────────────────────────────

const MAX_QUESTIONS_PER_ROUND = 20;
const MAX_GUESSES_PER_ROUND = 3;
// Default points awarded for guessing the Prophet correctly. Parents
// override this per-family from Settings → Games — see
// gamesettings:<familyId>.prophetGuessPointsPerWin. The constant is
// only used when the family hasn't customized.
const DEFAULT_POINTS_AWARD_WIN = 3;
// Don't repeat a Prophet for the same child within this window.
const NO_REPEAT_DAYS = 30;
// We trim the per-child rounds index to this many entries to keep KV reads cheap.
const ROUNDS_INDEX_CAP = 50;

// Resolve the family-configured "points per win" for the kid who's
// playing. The kid → family link goes through child.familyId on the
// KV record. If anything's missing, we fall back to the default.
async function pointsPerWinFor(childId: string): Promise<number> {
  try {
    const child = await kv.get(childId);
    const familyId = child?.familyId;
    if (!familyId) return DEFAULT_POINTS_AWARD_WIN;
    const settings = await kv.get(`gamesettings:${familyId}`);
    const n = settings?.prophetGuessPointsPerWin;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100) {
      return n;
    }
  } catch (_err) {
    // Fall through to default
  }
  return DEFAULT_POINTS_AWARD_WIN;
}

// ─── Types ──────────────────────────────────────────────────────────────

interface Round {
  id: string;
  childId: string;
  prophetId: string;          // not returned to the client until round ends
  startedAt: string;
  endedAt: string | null;
  status: "in-progress" | "won" | "lost";
  questionsAsked: Array<{ questionId: string; answer: "yes" | "no" | "unknown"; askedAt: string }>;
  guessAttempts: Array<{ prophetId: string; correct: boolean; attemptedAt: string }>;
  pointsAwarded: number;
}

function roundKey(roundId: string) { return `prophet-round:${roundId}`; }
function indexKey(childId: string) { return `prophet-rounds-by-child:${childId}`; }

// Return the redacted round shape sent to the client during play —
// the chosen prophet stays hidden until status flips to won/lost.
function redactRound(r: Round) {
  return {
    id: r.id,
    childId: r.childId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    status: r.status,
    questionsAsked: r.questionsAsked,
    guessAttempts: r.guessAttempts,
    pointsAwarded: r.pointsAwarded,
    // Only reveal the prophet when the round is over (kid won or lost).
    prophetId: r.status === "in-progress" ? null : r.prophetId,
    prophet:
      r.status === "in-progress"
        ? null
        : PROPHETS_BY_ID.get(r.prophetId) ?? null,
  };
}

// Pick a Prophet for a new round, excluding any played in the last
// NO_REPEAT_DAYS by this child. Falls back to least-recently-played
// if all 25 have been used in that window (unlikely).
async function pickProphetForChild(childId: string): Promise<string> {
  const ids: string[] = (await kv.get(indexKey(childId))) ?? [];
  const cutoff = Date.now() - NO_REPEAT_DAYS * 24 * 60 * 60 * 1000;

  // Load recent rounds in parallel; ignore any that errored or are missing.
  const recent = (
    await Promise.all(ids.slice(0, 25).map((rid) => kv.get(roundKey(rid)).catch(() => null)))
  ).filter((r): r is Round => !!r);

  // Voided rounds shouldn't count against no-repeat — if a parent voided
  // a round (kid pressed buttons by accident), it's fair to re-pick that
  // Prophet sooner. The (round as any).voided marker is set by the
  // parent-override 'void' action.
  const playedInWindow = new Set(
    recent
      .filter((r) => new Date(r.startedAt).getTime() >= cutoff)
      .filter((r) => !(r as any).voided)
      .map((r) => r.prophetId),
  );

  const candidates = PROPHETS.filter((p) => !playedInWindow.has(p.id));
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }

  // Fallback: least-recently-played overall (oldest startedAt wins).
  const lastPlayedAt = new Map<string, number>();
  for (const r of recent) {
    lastPlayedAt.set(r.prophetId, new Date(r.startedAt).getTime());
  }
  const sorted = [...PROPHETS].sort(
    (a, b) => (lastPlayedAt.get(a.id) ?? 0) - (lastPlayedAt.get(b.id) ?? 0),
  );
  return sorted[0].id;
}

// Resolve the caller's "current child":
//   - Kid session: child id is the user id (PROVIDED by middleware)
//   - Parent session: caller must include childId. We accept it in
//     EITHER the body OR a `childId` query param. GET endpoints can't
//     carry a body, so query-param support is required for /current,
//     /history, etc. when a parent is previewing as their kid.
async function resolveChildId(c: any): Promise<{ childId?: string; error?: string }> {
  const user = c.get("user");
  if (!user) return { error: "unauthenticated" };
  if (user.isKidSession) {
    return { childId: user.id };
  }

  // Parent path. Try query first (works for GET and POST), then body.
  let childId: string | undefined = c.req.query("childId");
  if (!childId) {
    try {
      const body = await c.req.json();
      childId = body?.childId;
    } catch { /* empty body fine */ }
  }
  if (!childId) return { error: "childId required (parent caller)" };

  // Light validation: confirm caller is a known parent of any family that
  // owns this child. Cheap because most callers are kids; parent-preview
  // mode is the rare path.
  const child = await kv.get(childId);
  if (!child || !child.familyId) return { error: "child not found" };
  const family = await kv.get(child.familyId);
  if (!family) return { error: "family not found" };
  const parentIds: string[] = family.parentIds ?? [];
  if (!parentIds.includes(user.id)) return { error: "forbidden" };
  return { childId };
}

// Award points via the existing logPointEvent path. We don't import the
// route handler — we write the event directly to KV the same way the
// /events handler does. Keeps the game module self-contained and avoids
// going through HTTP for an internal write.
async function awardPoints(args: {
  childId: string;
  points: number;
  loggedBy: string;
  loggedByName: string;
  itemName: string;
  notes: string;
}): Promise<{ eventId: string }> {
  const eventId = `event:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
  const event = {
    id: eventId,
    childId: args.childId,
    trackableItemId: "prophet-guess-game",
    type: "game",
    points: args.points,
    loggedBy: args.loggedBy,
    notes: args.notes,
    itemName: args.itemName,
    timestamp: new Date().toISOString(),
    status: "active",
    isAdjustment: false,
  };
  await kv.set(eventId, event);

  // Bump the child's currentPoints aggregate (same as other write paths).
  const child = await kv.get(args.childId);
  if (child) {
    const newPoints = Math.max(0, (child.currentPoints ?? 0) + args.points);
    await kv.set(args.childId, { ...child, currentPoints: newPoints });
  }
  return { eventId };
}

// ─── Routes ─────────────────────────────────────────────────────────────

// GET /games/prophet-guess/catalog
// Public game data — categories + questions + prophet display names
// (without attributes). Lets the kid UI render without holding the
// answer key in JS bundles.
app.get("/catalog", async (c) => {
  return c.json({
    categories: QUESTION_CATEGORIES,
    questions: QUESTIONS.map((q) => ({ id: q.id, text: q.text, category: q.category })),
    prophets: PROPHETS.map((p) => ({
      id: p.id, name: p.name, nameArabic: p.nameArabic, englishName: p.englishName,
    })),
    rules: {
      maxQuestions: MAX_QUESTIONS_PER_ROUND,
      maxGuesses: MAX_GUESSES_PER_ROUND,
      // pointsPerWin in the catalog is the family-product default. The
      // actual award is recomputed at win-time from gamesettings so
      // even mid-round changes by the parent are honored.
      pointsPerWin: DEFAULT_POINTS_AWARD_WIN,
      noRepeatDays: NO_REPEAT_DAYS,
    },
  });
});

// GET /games/prophet-guess/current
// Returns the kid's most recent in-progress round, or null.
app.get("/current", async (c) => {
  const r = await resolveChildId(c);
  if (r.error) return c.json({ error: r.error }, 401);

  const ids: string[] = (await kv.get(indexKey(r.childId!))) ?? [];
  for (const id of ids.slice(0, 5)) {
    const round = await kv.get(roundKey(id));
    if (round && round.status === "in-progress") {
      return c.json({ round: redactRound(round) });
    }
  }
  return c.json({ round: null });
});

// POST /games/prophet-guess/start
// Body (parent): { childId }
// Body (kid):    none
// Starts a new round. If one is already in progress, returns it instead
// of starting a duplicate.
app.post("/start", async (c) => {
  const r = await resolveChildId(c);
  if (r.error) return c.json({ error: r.error }, 401);
  const childId = r.childId!;

  // Resume any in-progress round rather than starting a new one
  const ids: string[] = (await kv.get(indexKey(childId))) ?? [];
  for (const id of ids.slice(0, 5)) {
    const existing = await kv.get(roundKey(id));
    if (existing && existing.status === "in-progress") {
      return c.json({ round: redactRound(existing), resumed: true });
    }
  }

  const prophetId = await pickProphetForChild(childId);
  const roundId = `round:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
  const round: Round = {
    id: roundId,
    childId,
    prophetId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: "in-progress",
    questionsAsked: [],
    guessAttempts: [],
    pointsAwarded: 0,
  };
  await kv.set(roundKey(roundId), round);

  // Prepend to the per-child index, capped.
  const nextIndex = [roundId, ...ids].slice(0, ROUNDS_INDEX_CAP);
  await kv.set(indexKey(childId), nextIndex);

  return c.json({ round: redactRound(round), resumed: false });
});

// POST /games/prophet-guess/:roundId/ask
// Body: { questionId, childId? (parent) }
app.post("/:roundId/ask", async (c) => {
  const r = await resolveChildId(c);
  if (r.error) return c.json({ error: r.error }, 401);
  const roundId = c.req.param("roundId");

  // Re-read body for questionId (resolveChildId consumed it for parent path).
  // For kid path the body wasn't read yet; for parent path we already parsed.
  // Easiest: re-clone the request — but Deno's Request can't be re-read.
  // Workaround: parent path puts childId in body; kid path is the kid's
  // own session, so we'll ask the client to ALSO send questionId in a
  // separate header to avoid the body-already-consumed issue. Simpler:
  // require questionId as a query param.
  const questionId = c.req.query("questionId");
  if (!questionId) return c.json({ error: "questionId query param required" }, 400);

  const round: Round | null = await kv.get(roundKey(roundId));
  if (!round) return c.json({ error: "round not found" }, 404);
  if (round.childId !== r.childId) return c.json({ error: "forbidden" }, 403);
  if (round.status !== "in-progress") return c.json({ error: "round is already over" }, 409);

  if (!QUESTIONS_BY_ID.has(questionId)) {
    return c.json({ error: "unknown questionId" }, 400);
  }
  if (round.questionsAsked.some((q) => q.questionId === questionId)) {
    return c.json({ error: "already asked this question this round" }, 409);
  }
  if (round.questionsAsked.length >= MAX_QUESTIONS_PER_ROUND) {
    return c.json({ error: "max questions reached — make a guess" }, 409);
  }

  const answer = answerQuestion(round.prophetId, questionId);
  round.questionsAsked.push({
    questionId, answer, askedAt: new Date().toISOString(),
  });
  await kv.set(roundKey(roundId), round);

  return c.json({ answer, round: redactRound(round) });
});

// POST /games/prophet-guess/:roundId/guess
// Body: { prophetId, childId? (parent) }
app.post("/:roundId/guess", async (c) => {
  const r = await resolveChildId(c);
  if (r.error) return c.json({ error: r.error }, 401);
  const roundId = c.req.param("roundId");
  const prophetId = c.req.query("prophetId");
  if (!prophetId) return c.json({ error: "prophetId query param required" }, 400);

  const round: Round | null = await kv.get(roundKey(roundId));
  if (!round) return c.json({ error: "round not found" }, 404);
  if (round.childId !== r.childId) return c.json({ error: "forbidden" }, 403);
  if (round.status !== "in-progress") return c.json({ error: "round is already over" }, 409);
  if (!PROPHETS_BY_ID.has(prophetId)) return c.json({ error: "unknown prophetId" }, 400);

  const correct = prophetId === round.prophetId;
  round.guessAttempts.push({
    prophetId, correct, attemptedAt: new Date().toISOString(),
  });

  if (correct) {
    round.status = "won";
    round.endedAt = new Date().toISOString();
    // Resolve points-per-win from family game settings at win time, so
    // a parent who tunes the value while a round is in progress sees
    // the new amount honored.
    const pointsAward = await pointsPerWinFor(r.childId!);
    round.pointsAwarded = pointsAward;
    const userId = getAuthUserId(c);
    await awardPoints({
      childId: r.childId!,
      points: pointsAward,
      loggedBy: userId,
      loggedByName: "Prophet Guess Game",
      itemName: "Guess the Prophet — round won",
      notes: `Guessed ${PROPHETS_BY_ID.get(round.prophetId)?.name} after ${round.questionsAsked.length} question${round.questionsAsked.length === 1 ? "" : "s"}`,
    });
  } else if (round.guessAttempts.length >= MAX_GUESSES_PER_ROUND) {
    round.status = "lost";
    round.endedAt = new Date().toISOString();
  }

  await kv.set(roundKey(roundId), round);
  return c.json({ correct, round: redactRound(round) });
});

// POST /games/prophet-guess/:roundId/forfeit
// Optional escape hatch — kid wants to give up and see the answer.
app.post("/:roundId/forfeit", async (c) => {
  const r = await resolveChildId(c);
  if (r.error) return c.json({ error: r.error }, 401);
  const roundId = c.req.param("roundId");

  const round: Round | null = await kv.get(roundKey(roundId));
  if (!round) return c.json({ error: "round not found" }, 404);
  if (round.childId !== r.childId) return c.json({ error: "forbidden" }, 403);
  if (round.status !== "in-progress") return c.json({ error: "round is already over" }, 409);

  round.status = "lost";
  round.endedAt = new Date().toISOString();
  await kv.set(roundKey(roundId), round);
  return c.json({ round: redactRound(round) });
});

// GET /games/prophet-guess/child-rounds?childId=X
// Returns recent rounds (including in-progress) for a specific child.
// Used by the parent review page so they can override mistakes.
// Authorization:
//   - Kid session: must match :childId
//   - Parent session: must be in the child's family parentIds
// Parent view ALWAYS includes the prophet identity (even for in-progress)
// because the parent needs to know what's being played to make
// override decisions; the kid is the one who shouldn't see it.
app.get("/child-rounds", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  const childId = c.req.query("childId");
  if (!childId) return c.json({ error: "childId query param required" }, 400);

  if (user.isKidSession) {
    if (user.id !== childId) return c.json({ error: "forbidden" }, 403);
  } else {
    const child = await kv.get(childId);
    if (!child || !child.familyId) return c.json({ error: "child not found" }, 404);
    const family = await kv.get(child.familyId);
    if (!family) return c.json({ error: "family not found" }, 404);
    const parentIds: string[] = family.parentIds ?? [];
    if (!parentIds.includes(user.id)) return c.json({ error: "forbidden" }, 403);
  }

  const ids: string[] = (await kv.get(indexKey(childId))) ?? [];
  const recent = (
    await Promise.all(ids.slice(0, 20).map((rid) => kv.get(roundKey(rid)).catch(() => null)))
  )
    .filter((round): round is Round => !!round)
    .map((round) => {
      const base = redactRound(round);
      // For the parent caller, force-include the prophet identity even
      // for in-progress rounds. Without this they can't review or override.
      if (!user.isKidSession) {
        return {
          ...base,
          prophetId: round.prophetId,
          prophet: PROPHETS_BY_ID.get(round.prophetId) ?? null,
        };
      }
      return base;
    });

  return c.json({ rounds: recent });
});

// POST /games/prophet-guess/:roundId/parent-override
// Body: { childId, action: 'award' | 'void', points?: number, reason: string }
//
// Two parent-only override actions for fixing mistakes:
//   - 'award': add `points` to the kid even if the round was lost,
//     in-progress, or already won. Common case: kid genuinely guessed
//     correctly but tapped the wrong name in the picker, or parent
//     wants to encourage effort. Round status is NOT changed by award.
//   - 'void': mark the round as voided and reverse any points awarded
//     during the round. Common case: kid pressed buttons by accident.
//     Voided rounds DON'T count against no-repeat tracking either —
//     the prophet can be re-picked sooner.
//
// Both actions append a point_event to the audit trail so the override
// is visible in Recent Activity. Reason (5+ chars) is required.
app.post("/:roundId/parent-override", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (user.isKidSession) return c.json({ error: "parents only" }, 403);

  const roundId = c.req.param("roundId");
  let body: any = {};
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid JSON" }, 400); }

  const { childId, action, points, reason } = body;
  if (!childId) return c.json({ error: "childId required" }, 400);
  if (!["award", "void"].includes(action)) {
    return c.json({ error: "action must be 'award' or 'void'" }, 400);
  }
  if (typeof reason !== "string" || reason.trim().length < 5) {
    return c.json({ error: "reason required (5+ chars)" }, 400);
  }

  // Parent must be in the child's family
  const child = await kv.get(childId);
  if (!child || !child.familyId) return c.json({ error: "child not found" }, 404);
  const family = await kv.get(child.familyId);
  if (!family) return c.json({ error: "family not found" }, 404);
  const parentIds: string[] = family.parentIds ?? [];
  if (!parentIds.includes(user.id)) return c.json({ error: "forbidden" }, 403);

  // Round must exist and belong to this child
  const round: Round | null = await kv.get(roundKey(roundId));
  if (!round) return c.json({ error: "round not found" }, 404);
  if (round.childId !== childId) {
    return c.json({ error: "round does not belong to this child" }, 400);
  }
  // Refuse to override an already-voided round
  if ((round as any).voided) {
    return c.json({ error: "round already voided" }, 409);
  }

  const parentName = user.user_metadata?.name || user.email || "Parent";

  if (action === "award") {
    const n = Number(points);
    if (!Number.isInteger(n) || n <= 0 || n > 100) {
      return c.json({ error: "points must be an integer 1..100" }, 400);
    }
    await awardPoints({
      childId,
      points: n,
      loggedBy: user.id,
      loggedByName: parentName,
      itemName: "Guess the Prophet — parent bonus",
      notes: `Parent bonus (+${n}): ${reason.trim()}`,
    });
    round.pointsAwarded += n;
    await kv.set(roundKey(roundId), round);
    return c.json({ ok: true, action: "award", pointsAwarded: n });
  }

  if (action === "void") {
    const reverse = round.pointsAwarded;
    if (reverse > 0) {
      await awardPoints({
        childId,
        points: -reverse,
        loggedBy: user.id,
        loggedByName: parentName,
        itemName: "Guess the Prophet — round voided",
        notes: `Parent voided (−${reverse}): ${reason.trim()}`,
      });
    }
    (round as any).voided = true;
    (round as any).voidReason = reason.trim();
    (round as any).voidedBy = user.id;
    (round as any).voidedAt = new Date().toISOString();
    round.status = "lost";
    round.endedAt = round.endedAt ?? new Date().toISOString();
    round.pointsAwarded = 0;
    await kv.set(roundKey(roundId), round);
    return c.json({ ok: true, action: "void", pointsReversed: reverse });
  }

  return c.json({ error: "unreachable" }, 500);
});

// GET /games/prophet-guess/history
// Returns the last N completed rounds for the child.
app.get("/history", async (c) => {
  const r = await resolveChildId(c);
  if (r.error) return c.json({ error: r.error }, 401);

  const ids: string[] = (await kv.get(indexKey(r.childId!))) ?? [];
  const recent = (
    await Promise.all(ids.slice(0, 20).map((rid) => kv.get(roundKey(rid)).catch(() => null)))
  )
    .filter((round): round is Round => !!round)
    .filter((round) => round.status !== "in-progress")
    .map(redactRound);

  return c.json({ rounds: recent });
});

export default app;
