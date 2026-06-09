// School Portal API client — for Student/Parent PIN-authenticated portal.
//
// Uses a SEPARATE token from family JWT. Auth bootstraps via /school/auth/pin-login,
// which returns a token stored in localStorage under `fgs_pin_token`. All subsequent
// requests carry it via `X-Pin-Token` header.

import { projectId, publicAnonKey } from "/utils/supabase/info.tsx";
import type {
  Lesson,
  HifzEntry,
  BehaviorNote,
  GradeEntry,
  Assignment,
  StudentGradesSummary,
  Form,
  FormResponse,
  MyFormSummary,
  Announcement,
  AnnouncementAudienceKind,
  FeeStatus,
} from "./schoolApi";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// ─── Storage helpers ────────────────────────────────────────────────────

const PIN_TOKEN_KEY = "fgs_pin_token";
const PIN_SUBJECT_KEY = "fgs_pin_subject";

export type PinSubjectType = "student" | "parent";

export interface PinSubjectInfo {
  subjectType: PinSubjectType;
  subjectId: string;
  orgId: string;
}

export function getPinToken(): string | null {
  try {
    return localStorage.getItem(PIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPinToken(token: string, subject?: PinSubjectInfo): void {
  try {
    localStorage.setItem(PIN_TOKEN_KEY, token);
    if (subject) {
      localStorage.setItem(PIN_SUBJECT_KEY, JSON.stringify(subject));
    }
  } catch {
    // ignore
  }
}

export function clearPinSession(): void {
  try {
    localStorage.removeItem(PIN_TOKEN_KEY);
    localStorage.removeItem(PIN_SUBJECT_KEY);
  } catch {
    // ignore
  }
}

// ─── Core fetcher ───────────────────────────────────────────────────────

export async function pinApiCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: publicAnonKey,
    Authorization: `Bearer ${publicAnonKey}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  const token = getPinToken();
  if (token) headers["X-Pin-Token"] = token;

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth endpoints (no X-Pin-Token for login) ──────────────────────────

export interface PinLoginBody {
  orgIdentifier: string;
  loginIdentifier: string;
  pin: string;
}

export interface PinLoginResponse {
  subjectType: PinSubjectType;
  subjectId: string;
  orgId: string;
  mustChange: boolean;
  token: string;
}

// Public org-branding lookup so PortalLogin can swap the generic
// "Iqra Academy" header for the actual school's name + logo + motto
// before sign-in. Returns null when slug is empty or no match.
export interface PortalOrgBranding {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
  motto: string | null;
}

export async function getOrgBySlug(
  slug: string,
): Promise<PortalOrgBranding | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const res = await fetch(
    `${API_BASE}/school/auth/org-by-slug?slug=${encodeURIComponent(trimmed)}`,
    {
      headers: {
        apikey: publicAnonKey,
        Authorization: `Bearer ${publicAnonKey}`,
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function pinLogin(body: PinLoginBody): Promise<PinLoginResponse> {
  const res = await fetch(`${API_BASE}/school/auth/pin-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publicAnonKey,
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errBody.error || `Login failed: ${res.status}`);
  }
  return res.json();
}

export interface PinChangeBody {
  currentPin?: string;
  newPin: string;
}

export async function pinChange(body: PinChangeBody): Promise<{ ok: true }> {
  return pinApiCall("/school/auth/pin-change", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Portal /me ─────────────────────────────────────────────────────────

export interface PortalStudent {
  id: string;
  fullName: string;
  grNumber: string;
  photoUrl: string | null;
  classSectionId: string | null;
  className?: string | null;
  sectionName?: string | null;
}

export interface PortalParent {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

export interface PortalMe {
  subjectType: PinSubjectType;
  subjectId: string;
  orgId: string;
  orgName: string;
  /** Branding fields surfaced from /pin-me so the portal header can
   *  match what the principal configured under Settings. Optional —
   *  older backends may omit them; layout falls back gracefully. */
  orgSlug?: string | null;
  orgLogoUrl?: string | null;
  orgMotto?: string | null;
  orgThemeColor?: string | null;
  mustChange: boolean;
  student?: PortalStudent;
  parent?: PortalParent;
  students?: PortalStudent[];
}

export const getPortalMe = (): Promise<PortalMe> => pinApiCall("/school/pin-me");

// ─── Student data ───────────────────────────────────────────────────────

export interface DashboardActivityItem {
  id: string;
  /** Backend returns `at` (YYYY-MM-DD or ISO). */
  at: string;
  kind: string;
  summary: string;
}

/** Backend wraps each tile in { value, hint } — captured here so the
 *  component can render the number plus the caption underneath. */
export interface PortalDashboardTile {
  value: number | null;
  hint: string | null;
}

export interface StudentDashboardResponse {
  student: PortalStudent;
  tiles: {
    attendancePct: PortalDashboardTile;
    averageGrade: PortalDashboardTile;
    hifzAyahsMemorized: PortalDashboardTile;
    behaviorScore: PortalDashboardTile;
  };
  recentActivity: DashboardActivityItem[];
}

export const getStudentDashboard = (studentId: string): Promise<StudentDashboardResponse> =>
  pinApiCall(`/school/pin-me/students/${studentId}/dashboard`);

export interface MyStudentLessonsResponse {
  lessons: Lesson[];
}

export const getMyStudentLessons = (
  studentId: string,
  opts: { startDate?: string; endDate?: string; limit?: number } = {},
): Promise<MyStudentLessonsResponse> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.limit) q.append("limit", String(opts.limit));
  const qs = q.toString() ? `?${q}` : "";
  return pinApiCall(`/school/pin-me/students/${studentId}/lessons${qs}`);
};

export interface MyStudentGradesResponse {
  grades: Array<GradeEntry & { assignment: Assignment }>;
  summary: StudentGradesSummary;
}

export const getMyStudentGrades = (studentId: string): Promise<MyStudentGradesResponse> =>
  pinApiCall(`/school/pin-me/students/${studentId}/grades`);

export interface MyStudentHifzSummary {
  ayahsMemorized: number;
  surahsCompleted: number;
  lastEntry: string | null;
}

/** Compact "today" snapshot the portal Hifz card renders at the top —
 *  pulls the most recent sabaq, the latest revision (sabqi/manzil), and
 *  the teacher's parent-facing note + action. The portal endpoint
 *  computes it server-side so the card stays cheap to render. */
export interface MyStudentHifzToday {
  recordedAt: string;
  sabaq: {
    surahNumber: number;
    ayahFrom: number;
    ayahTo: number;
    quality: string | null;
  } | null;
  revision: {
    kind: string;
    surahNumber: number;
    ayahFrom: number;
    ayahTo: number;
    quality: string | null;
  } | null;
  teacherNote: string | null;
  parentAction: string | null;
  nextTarget: string | null;
  mistakesCount: number | null;
}

/** One day in the 14-day trend strip the portal Hifz card renders.
 *  date = ISO YYYY-MM-DD (UTC midnight); the grid renders the slot in
 *  display TZ. logged + missed are mutually exclusive (backend already
 *  enforces). */
export interface MyStudentHifzDayCell {
  date: string;
  logged: boolean;
  missed: boolean;
  quality: string | null;
  mistakesCount: number | null;
}

export interface MyStudentHifzResponse {
  entries: HifzEntry[];
  summary: MyStudentHifzSummary;
  today: MyStudentHifzToday | null;
  /** Most-recent-day-last; always 14 entries. */
  last14Days: MyStudentHifzDayCell[];
  /** Most-recent-day-last; always 30 entries. Drives the monthly
   *  calendar view below the weekly strip. */
  last30Days: MyStudentHifzDayCell[];
}

export const getMyStudentHifz = (studentId: string): Promise<MyStudentHifzResponse> =>
  pinApiCall(`/school/pin-me/students/${studentId}/hifz`);

export interface MyStudentAttendanceSummary {
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendancePct: number;
}

export interface MyStudentAttendanceResponse {
  entries: Array<{
    id: string;
    date: string;
    status: "present" | "late" | "absent" | "excused";
    notes: string | null;
  }>;
  summary: MyStudentAttendanceSummary;
}

export const getMyStudentAttendance = (studentId: string): Promise<MyStudentAttendanceResponse> =>
  pinApiCall(`/school/pin-me/students/${studentId}/attendance`);

export interface MyStudentBehaviorSummary {
  positiveCount: number;
  concernCount: number;
  netPoints: number;
}

export interface MyStudentBehaviorEntry extends BehaviorNote {
  recordedByName?: string | null;
}

export interface MyStudentBehaviorResponse {
  entries: MyStudentBehaviorEntry[];
  summary: MyStudentBehaviorSummary;
}

export const getMyStudentBehavior = (studentId: string): Promise<MyStudentBehaviorResponse> =>
  pinApiCall(`/school/pin-me/students/${studentId}/behavior`);

// ─── Forms (parent-facing, PIN-authed) ──────────────────────────────────
//
// Mirrors listMyForms / getForm / submitFormResponse from schoolApi.ts but
// uses pinApiCall so requests carry the X-Pin-Token header instead of the
// family JWT.

export const listMyForms = (orgId: string): Promise<{ forms: MyFormSummary[] }> =>
  pinApiCall(`/school/orgs/${orgId}/my-forms`);

export const getMyForm = (orgId: string, formId: string): Promise<Form> =>
  pinApiCall(`/school/orgs/${orgId}/forms/${formId}`);

export const submitFormResponse = (
  orgId: string,
  formId: string,
  body: {
    onBehalfOfStudentId?: string;
    values: Array<{
      fieldId: string;
      valueText?: string | null;
      valueNumber?: number | null;
      valueMulti?: string[] | null;
    }>;
  },
): Promise<FormResponse> =>
  pinApiCall(`/school/orgs/${orgId}/forms/${formId}/responses`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Announcements / Lesson completion / Fees (PIN-auth) ───────────────

export const listMyAnnouncements = (): Promise<{ announcements: Announcement[] }> =>
  pinApiCall(`/school/pin-me/announcements`);

export const markLessonComplete = (
  studentId: string,
  lessonId: string,
): Promise<{ ok: true; completedAt: string }> =>
  pinApiCall(
    `/school/pin-me/students/${studentId}/lessons/${lessonId}/complete`,
    { method: "POST" },
  );

export const unmarkLessonComplete = (
  studentId: string,
  lessonId: string,
): Promise<{ ok: true }> =>
  pinApiCall(
    `/school/pin-me/students/${studentId}/lessons/${lessonId}/complete`,
    { method: "DELETE" },
  );

export const getLessonCompletion = (
  studentId: string,
  lessonId: string,
): Promise<{ completed: boolean; completedAt: string | null }> =>
  pinApiCall(
    `/school/pin-me/students/${studentId}/lessons/${lessonId}/completion`,
  );

export const getMyStudentFees = (
  studentId: string,
): Promise<{ fees: FeeStatus[] }> =>
  pinApiCall(`/school/pin-me/students/${studentId}/fees`);

// ─── Re-exported types from schoolApi ───────────────────────────────────

export type {
  Lesson,
  HifzEntry,
  BehaviorNote,
  GradeEntry,
  Assignment,
  StudentGradesSummary,
  Form,
  FormField,
  FormFieldKind,
  FormResponse,
  FormResponseValue,
  MyFormSummary,
  Announcement,
  AnnouncementAudienceKind,
  FeeStatus,
} from "./schoolApi";
