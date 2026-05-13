// Frontend API client for the Guess-the-Prophet game.
// Wraps endpoints at /make-server-f116e23f/games/prophet-guess/*.

import { apiCall } from "./api";

export type Answer = "yes" | "no" | "unknown";
export type RoundStatus = "in-progress" | "won" | "lost";

export interface ProphetSummary {
  id: string;
  name: string;
  nameArabic: string;
  englishName: string | null;
}

export interface QuestionRecord {
  id: string;
  text: string;
  category: "era" | "family" | "mission" | "location" | "miracles" | "other";
}

export interface CategoryRecord {
  id: QuestionRecord["category"];
  label: string;
  emoji: string;
}

export interface CatalogResponse {
  categories: CategoryRecord[];
  questions: QuestionRecord[];
  prophets: ProphetSummary[];
  rules: { maxQuestions: number; maxGuesses: number; pointsPerWin: number; noRepeatDays: number };
}

export interface RoundShape {
  id: string;
  childId: string;
  startedAt: string;
  endedAt: string | null;
  status: RoundStatus;
  questionsAsked: Array<{ questionId: string; answer: Answer; askedAt: string }>;
  guessAttempts: Array<{ prophetId: string; correct: boolean; attemptedAt: string }>;
  pointsAwarded: number;
  prophetId: string | null;          // null during play
  prophet: ProphetSummary | null;    // null during play
}

const BASE = "/games/prophet-guess";

export const getProphetGuessCatalog = (): Promise<CatalogResponse> =>
  apiCall(`${BASE}/catalog`);

export const getCurrentRound = (childId?: string): Promise<{ round: RoundShape | null }> => {
  const qs = childId ? `?childId=${encodeURIComponent(childId)}` : "";
  return apiCall(`${BASE}/current${qs}`);
};

export const startRound = (childId?: string): Promise<{ round: RoundShape; resumed: boolean }> =>
  apiCall(`${BASE}/start`, {
    method: "POST",
    body: JSON.stringify(childId ? { childId } : {}),
  });

// questionId is passed as query param because the backend's
// resolveChildId may consume the body for the parent path.
export const askQuestion = (
  roundId: string,
  questionId: string,
  childId?: string,
): Promise<{ answer: Answer; round: RoundShape }> =>
  apiCall(`${BASE}/${roundId}/ask?questionId=${encodeURIComponent(questionId)}`, {
    method: "POST",
    body: JSON.stringify(childId ? { childId } : {}),
  });

export const guessProphet = (
  roundId: string,
  prophetId: string,
  childId?: string,
): Promise<{ correct: boolean; round: RoundShape }> =>
  apiCall(`${BASE}/${roundId}/guess?prophetId=${encodeURIComponent(prophetId)}`, {
    method: "POST",
    body: JSON.stringify(childId ? { childId } : {}),
  });

export const forfeitRound = (
  roundId: string,
  childId?: string,
): Promise<{ round: RoundShape }> =>
  apiCall(`${BASE}/${roundId}/forfeit`, {
    method: "POST",
    body: JSON.stringify(childId ? { childId } : {}),
  });

export const getRoundHistory = (childId?: string): Promise<{ rounds: RoundShape[] }> => {
  const qs = childId ? `?childId=${encodeURIComponent(childId)}` : "";
  return apiCall(`${BASE}/history${qs}`);
};

// Parent-side: rounds for a specific child including in-progress. The
// parent view always sees the prophet (unlike redactRound for kid view)
// because they need to know what's being played to override.
export type RoundWithVoidMarker = RoundShape & {
  voided?: boolean;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
};

export const getChildRounds = (
  childId: string,
): Promise<{ rounds: RoundWithVoidMarker[] }> =>
  apiCall(`${BASE}/child-rounds?childId=${encodeURIComponent(childId)}`);

export type ParentOverrideAction = "award" | "void";

export const parentOverrideRound = (
  roundId: string,
  body: { childId: string; action: ParentOverrideAction; points?: number; reason: string },
): Promise<
  | { ok: true; action: "award"; pointsAwarded: number }
  | { ok: true; action: "void"; pointsReversed: number }
> =>
  apiCall(`${BASE}/${roundId}/parent-override`, {
    method: "POST",
    body: JSON.stringify(body),
  });
