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
  schoolDayStart?: string | null;
  schoolDayEnd?: string | null;
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

// ─── Daily Diary (PR feat/daily-diary) ──────────────────────────────────
// Single-round-trip aggregate of "what happened today + what to do
// tonight" for a student. Rendered on the parent portal home and
// designed to mirror the spec: English: Worksheet completed / Math:
// Homework page 15 / Hifz: Revise Surah / Reminder: bring notebook.
export interface DiaryLessonRow {
  id: string;
  subject: string | null;
  title: string;
  body: string | null;
}
export interface DiaryAssignmentRow {
  id: string;
  subject: string | null;
  title: string;
  kind: string;
  dueDate: string;
}
export interface DiaryHifz {
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
}
export interface MyStudentDiaryResponse {
  date: string;
  studentName: string;
  lessons: DiaryLessonRow[];
  assignments: DiaryAssignmentRow[];
  hifz: DiaryHifz | null;
  reminders: string[];
}

export const getMyStudentDiary = (
  studentId: string,
  date?: string,
): Promise<MyStudentDiaryResponse> => {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return pinApiCall(`/school/pin-me/students/${studentId}/diary${q}`);
};

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

// ─── Timetable (PR feat/timetable-consumers) ───────────────────────────
// Parent + student portal weekly view of the student's section
// timetable. Slots come from the org skeleton; entries fall back to
// the section + Hifz group attachments.
export interface MyStudentTimetableCell {
  slot: {
    id: string;
    name: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    kind: string;
  };
  entry: {
    subjectName: string | null;
    /** When a substitution exists for today, this is the SUB's name. */
    teacherName: string | null;
    room: string | null;
    notes: string | null;
    scope: "section" | "hifz_group";
    /** Present only for today's row when a substitution is in effect. */
    substitution?: {
      originalTeacherName: string | null;
      reason: string | null;
    } | null;
  } | null;
}
export interface MyStudentTimetableResponse {
  cells: MyStudentTimetableCell[];
}

export const getMyStudentTimetable = (
  studentId: string,
  opts: { date?: string } = {},
): Promise<MyStudentTimetableResponse> => {
  const q = opts.date ? `?date=${opts.date}` : "";
  return pinApiCall(`/school/pin-me/students/${studentId}/timetable${q}`);
};

// ─── Today snapshot (PR feat/parent-portal-home) ─────────────────────
// Lightweight summary used by the multi-child landing card AND the
// per-child dashboard pills. Plain-language: "Present today", "Fee due",
// "Homework pending", "Hifz revision needed", "Teacher note added".
export interface TodaySnapshot {
  student: {
    id: string;
    fullName: string;
    grNumber: string;
    photoUrl: string | null;
    className: string | null;
    sectionName: string | null;
  };
  today: string;
  attendanceToday: { status: "present" | "late" | "absent" | "excused"; takenAt: string | null } | null;
  homeworkPending: { count: number; soonestDueDate: string | null };
  feesDueNow: { amount: number; periodLabel: string; dueDate: string | null } | null;
  hifzRevisionNeeded: { lastEntryDate: string; daysSince: number } | null;
  latestTeacherNote: { kind: "positive" | "concern"; summary: string; observedAt: string } | null;
  publishedReportCardTermName: string | null;
}

export const getTodaySnapshot = (studentId: string): Promise<TodaySnapshot> =>
  pinApiCall(`/school/pin-me/students/${studentId}/today-snapshot`);

// ─── Term report cards (parent / student portal, PR v2) ─────────────
export interface MyTermReportCardListItem {
  termId: string;
  termName: string;
  startDate: string;
  endDate: string;
  publishedAt: string;
}
export const listMyTermReportCards = (
  studentId: string,
): Promise<{ cards: MyTermReportCardListItem[] }> =>
  pinApiCall(`/school/pin-me/students/${studentId}/term-report-cards`);

// Reuses the same shape as admin's TermReportCardResponse.
export const getMyTermReportCard = (
  studentId: string,
  termId: string,
): Promise<import("./schoolApi").TermReportCardResponse> =>
  pinApiCall(`/school/pin-me/students/${studentId}/terms/${termId}/report-card`);

// ─── Teacher comments feed (PR feat/teacher-comments-feed) ───────────
export type TeacherCommentKind =
  | "behavior" | "hifz" | "exam_note"
  | "report_card_subject" | "report_card_class_teacher" | "report_card_principal"
  | "lesson";

export type CommentAckAction = "read" | "thank_you" | "follow_up";

export interface TeacherCommentItem {
  id: string;
  kind: TeacherCommentKind;
  at: string;
  authorName: string | null;
  title: string;
  body: string;
  link: string | null;
  tone?: "positive" | "concern" | "neutral";
  /** This subject's prior one-tap acks on this comment. Always present
   *  (may be []) so callers don't need a null check. */
  acks: CommentAckAction[];
}

export const getTeacherComments = (
  studentId: string,
): Promise<{ items: TeacherCommentItem[] }> =>
  pinApiCall(`/school/pin-me/students/${studentId}/teacher-comments`);

/** One-tap acknowledge a teacher comment. Idempotent — re-sending the same
 *  (commentId, action) is a no-op. Returns the full ack list afterwards. */
export const ackTeacherComment = (
  studentId: string,
  commentId: string,
  action: CommentAckAction,
): Promise<{ acks: CommentAckAction[] }> =>
  pinApiCall(`/school/pin-me/students/${studentId}/teacher-comments/ack`, {
    method: "POST",
    body: JSON.stringify({ commentId, action }),
  });

// ─── Contact school (PR feat/parent-contact-school) ─────────────────
export interface MyThread {
  threadId: string;
  subject: string;
  studentId: string | null;
  latestBody: string;
  latestSentByRole: "parent" | "school";
  latestAt: string;
  unreadCount: number;
  messageCount: number;
}
export interface MyThreadMessage {
  id: string;
  threadId: string;
  body: string;
  sentByRole: "parent" | "school";
  sentByName: string | null;
  readAt: string | null;
  createdAt: string;
}
export const listMyThreads = (): Promise<{ threads: MyThread[] }> =>
  pinApiCall(`/school/pin-me/messages`);
export const getMyThread = (threadId: string): Promise<{ messages: MyThreadMessage[] }> =>
  pinApiCall(`/school/pin-me/messages/${threadId}`);
export const startThread = (
  body: { subject: string; body: string; studentId?: string },
): Promise<{ threadId: string }> =>
  pinApiCall(`/school/pin-me/messages`, {
    method: "POST", body: JSON.stringify(body),
  });
export const replyInThread = (threadId: string, body: string): Promise<{ ok: true }> =>
  pinApiCall(`/school/pin-me/messages/${threadId}/reply`, {
    method: "POST", body: JSON.stringify({ body }),
  });

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
  LessonPrepItem,
  LessonPrepState,
} from "./schoolApi";

export const getStudentUpcoming = (
  studentId: string,
  limit: number = 3,
): Promise<{ upcoming: import("./schoolApi").LessonPrepItem[] }> =>
  pinApiCall(`/school/pin-me/students/${studentId}/upcoming?limit=${limit}`);

export const createStudentTimeOff = (
  studentId: string, body: import("./schoolApi").TimeOffCreate,
): Promise<import("./schoolApi").TimeOffRequest> =>
  pinApiCall(`/school/pin-me/students/${studentId}/time-off`, {
    method: "POST", body: JSON.stringify(body),
  });
export const listStudentTimeOff = (
  studentId: string,
): Promise<{ requests: import("./schoolApi").TimeOffRequest[] }> =>
  pinApiCall(`/school/pin-me/students/${studentId}/time-off`);
