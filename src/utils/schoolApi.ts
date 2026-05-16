// School API client.
//
// Calls the /make-server-f116e23f/school/* endpoints. Auth tokens come from
// the existing parent JWT flow — same `apiCall` helper that the family API
// uses, just hitting a different path prefix.

import { apiCall } from "./api";

// ─── /me ─────────────────────────────────────────────────────────────────

export type RoleType = "principal" | "teacher" | "parent" | "student";
export type ScopeType = "organization" | "campus" | "class" | "family" | "child";

export interface UserRoleRow {
  role_type: RoleType;
  scope_type: ScopeType;
  scope_id: string;
}

export interface SchoolOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface SchoolClassSummary {
  id: string;
  name: string;
  grade_level: number | null;
  section: string | null;
  track: "mainstream" | "hifz" | "hybrid";
  organization_id: string;
  campus_id: string;
}

export interface SchoolMeResponse {
  userId: string;
  // 'school' for principals who signed up via /signup → "I run a school"
  // (or who were manually flagged via SQL). Drives whether the workspace
  // switcher shows the "My Family" option at all. Defaults to 'family'
  // for any account that pre-dates the signupIntent feature.
  signupIntent: 'family' | 'school';
  roles: UserRoleRow[];
  organizations: SchoolOrganization[];
  classes: SchoolClassSummary[];
}

export const getSchoolMe = (): Promise<SchoolMeResponse> =>
  apiCall("/school/me");

// ─── Helpers derived from /me ────────────────────────────────────────────

export function principalOrgIds(me: SchoolMeResponse | null): string[] {
  if (!me) return [];
  return me.roles
    .filter((r) => r.role_type === "principal" && r.scope_type === "organization")
    .map((r) => r.scope_id);
}

export function teacherClassIds(me: SchoolMeResponse | null): string[] {
  if (!me) return [];
  return me.roles
    .filter((r) => r.role_type === "teacher" && r.scope_type === "class")
    .map((r) => r.scope_id);
}

export const isPrincipal = (me: SchoolMeResponse | null): boolean =>
  principalOrgIds(me).length > 0;

export const isTeacher = (me: SchoolMeResponse | null): boolean =>
  teacherClassIds(me).length > 0;

// ─── Organization, campuses, academic years ─────────────────────────────

export interface OrganizationDetail extends SchoolOrganization {
  org_type: string;
  settings: Record<string, unknown>;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgWithCounts {
  organization: OrganizationDetail;
  counts: {
    campuses: number;
    classes: number;
    activeEnrollments: number;
  };
}

export const getOrganization = (orgId: string): Promise<OrgWithCounts> =>
  apiCall(`/school/organizations/${orgId}`);

export interface Campus {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  timezone: string;
  created_at: string;
}

// Self-service create: caller becomes principal of the new org.
// Used by the school-signup path on /signup so a school owner can
// onboard without an admin in the loop.
export const createOrganization = (
  body: { name: string; slug?: string },
): Promise<{ organization: OrganizationDetail }> =>
  apiCall("/school/organizations", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getCampuses = (orgId: string): Promise<Campus[]> =>
  apiCall(`/school/organizations/${orgId}/campuses`);

export const createCampus = (
  orgId: string,
  body: { name: string; address?: string; timezone?: string },
): Promise<Campus> =>
  apiCall(`/school/organizations/${orgId}/campuses`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export interface AcademicYear {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export const getAcademicYears = (orgId: string): Promise<AcademicYear[]> =>
  apiCall(`/school/organizations/${orgId}/academic-years`);

export const createAcademicYear = (
  orgId: string,
  body: { name: string; startDate: string; endDate: string; isCurrent?: boolean },
): Promise<AcademicYear> =>
  apiCall(`/school/organizations/${orgId}/academic-years`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Classes ─────────────────────────────────────────────────────────────

export interface SchoolClass extends SchoolClassSummary {
  academic_year_id: string;
  class_teacher_id: string | null;
  created_at: string;
}

export const getClasses = (
  orgId: string,
  opts?: { campusId?: string; academicYearId?: string },
): Promise<SchoolClass[]> => {
  const q = new URLSearchParams();
  if (opts?.campusId) q.append("campusId", opts.campusId);
  if (opts?.academicYearId) q.append("academicYearId", opts.academicYearId);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/organizations/${orgId}/classes${qs}`);
};

export const createClass = (body: {
  organizationId: string;
  campusId: string;
  academicYearId: string;
  name: string;
  gradeLevel?: number;
  section?: string;
  track: "mainstream" | "hifz" | "hybrid";
  classTeacherUserId?: string;
}): Promise<SchoolClass> =>
  apiCall("/school/classes", {
    method: "POST",
    body: JSON.stringify(body),
  });

export interface ClassRosterEntry {
  enrollmentId: string;
  enrolledAt: string;
  parentConnected: boolean;
  activeInvite: {
    invite_code: string;
    child_id: string;
    expires_at: string | null;
  } | null;
  child: {
    id: string;
    name: string;
    avatar: string | null;
    current_points: number;
    family_id: string;
  };
}

export const getClassRoster = (classId: string): Promise<{
  classId: string;
  students: ClassRosterEntry[];
}> => apiCall(`/school/classes/${classId}/roster`);

export interface ClassDetail {
  class: SchoolClass;
  subjects: Array<{ id: string; name: string; teacher_id: string | null; sort_order: number }>;
  roster: Array<{
    enrollmentId: string;
    enrolledAt: string;
    child: { id: string; name: string; avatar: string | null; current_points: number };
  }>;
}

export const getClassDetail = (classId: string): Promise<ClassDetail> =>
  apiCall(`/school/classes/${classId}`);

// ─── Students / enrollment ─────────────────────────────────────────────

export interface CreateStudentResponse {
  child: { id: string; name: string; avatar: string | null; family_id: string };
  enrollment: { id: string; class_id: string; child_id: string };
  invite: { invite_code: string; expires_at: string | null } | null;
  inviteUrl: string | null;
}

export const createStudent = (
  classId: string,
  body: { name: string; dateOfBirth?: string; avatar?: string; generateParentInvite?: boolean },
): Promise<CreateStudentResponse> =>
  apiCall(`/school/classes/${classId}/students`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const bulkCreateStudents = (
  classId: string,
  students: Array<{ name: string; dateOfBirth?: string; avatar?: string }>,
): Promise<{
  succeeded: number;
  failed: number;
  results: Array<{ ok: boolean; name: string; childId?: string; inviteCode?: string; error?: string }>;
}> =>
  apiCall(`/school/classes/${classId}/students/bulk`, {
    method: "POST",
    body: JSON.stringify({ students }),
  });

export const withdrawEnrollment = (enrollmentId: string, reason?: string): Promise<unknown> =>
  apiCall(`/school/enrollments/${enrollmentId}/withdraw`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

// ─── Parent invites ─────────────────────────────────────────────────────

export const previewParentInvite = (code: string) =>
  apiCall(`/school/parent-invites/${code}`);

export const acceptParentInvite = (
  code: string,
  body: { mergeIntoFamilyId?: string; linkToKvChildId?: string } = {},
) =>
  apiCall(`/school/parent-invites/${code}/accept`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Hifz logging ─────────────────────────────────────────────────────

export const logSabaq = (
  childId: string,
  body: {
    surahNumber?: number;
    ayahStart?: number;
    ayahEnd?: number;
    juzNumber?: number;
    pageNumber?: number;
    tajweedRating?: number;
    notes?: string;
    points?: number;
  },
) => apiCall(`/school/children/${childId}/sabaq`, { method: "POST", body: JSON.stringify(body) });

export const logSabaqPara = (
  childId: string,
  body: {
    coversFromSabaqId?: string;
    coversToSabaqId?: string;
    qualityRating?: number;
    notes?: string;
    points?: number;
  },
) => apiCall(`/school/children/${childId}/sabaq-para`, { method: "POST", body: JSON.stringify(body) });

export const logManzil = (
  childId: string,
  body: { manzilNumber: number; qualityRating?: number; notes?: string; points?: number },
) => apiCall(`/school/children/${childId}/manzil`, { method: "POST", body: JSON.stringify(body) });

export const getChildHifz = (childId: string) =>
  apiCall(`/school/children/${childId}/hifz`);

// ─── School-source events (for parent timeline merging) ────────────────

export interface SchoolEvent {
  id: string;
  points: number;
  itemName: string | null;
  loggedByName: string | null;
  source: "school";
  orgId: string | null;
  orgName: string | null;
  classId: string | null;
  className: string | null;
  salahState: "ontime" | "qadha" | "missed" | null;
  notes: string | null;
  status: "active" | "voided";
  voidedAt: string | null;
  voidReason: string | null;
  occurredAt: string;
}

export const getChildSchoolEvents = (
  childId: string,
  opts?: { limit?: number; sinceIso?: string; includeVoided?: boolean },
): Promise<{ childId: string; events: SchoolEvent[] }> => {
  const q = new URLSearchParams();
  if (opts?.limit) q.append("limit", String(opts.limit));
  if (opts?.sinceIso) q.append("sinceIso", opts.sinceIso);
  if (opts?.includeVoided) q.append("includeVoided", "true");
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/children/${childId}/events${qs}`);
};

/**
 * KV-side ingress for the family Dashboard. Pass a legacy KV child id
 * (e.g. "child:1234567890") and the backend returns school events for
 * the linked Postgres child. Returns an empty events list if no link —
 * the family Dashboard just skips the school merge in that case.
 */
export const getKvChildSchoolEvents = (
  kvChildId: string,
  opts?: { limit?: number; sinceIso?: string },
): Promise<{ kvChildId: string; postgresChildId: string | null; events: SchoolEvent[] }> => {
  const q = new URLSearchParams();
  if (opts?.limit) q.append("limit", String(opts.limit));
  if (opts?.sinceIso) q.append("sinceIso", opts.sinceIso);
  const qs = q.toString() ? `?${q}` : "";
  // KV child ids contain a colon ("child:..."); encode for safety.
  return apiCall(`/school/kv-children/${encodeURIComponent(kvChildId)}/events${qs}`);
};

// ─── Behavior catalog + logging ─────────────────────────────────────────

export interface BehaviorCatalogItem {
  id: string;
  name: string;
  kind: "positive" | "negative";
  points: number;
  category: string | null;
  tier: string | null;
  dedupe_window_min: number | null;
  active: boolean;
}

export const getBehaviorCatalog = (orgId: string): Promise<BehaviorCatalogItem[]> =>
  apiCall(`/school/organizations/${orgId}/behavior-catalog`);

export const createBehaviorCatalogItem = (
  orgId: string,
  body: {
    name: string;
    kind: "positive" | "negative";
    points: number;
    category?: string;
    tier?: "minor" | "moderate" | "major";
    dedupeWindowMin?: number;
  },
): Promise<BehaviorCatalogItem> =>
  apiCall(`/school/organizations/${orgId}/behavior-catalog`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const logBehavior = (
  childId: string,
  body: { trackableItemId: string; notes?: string },
) => apiCall(`/school/children/${childId}/behavior`, { method: "POST", body: JSON.stringify(body) });

// ─── Salah + attendance ────────────────────────────────────────────────

export type PrayerName = "Fajr" | "Zuhr" | "Asr" | "Maghrib" | "Isha";
export type SalahState = "ontime" | "qadha" | "missed";

export const logSalah = (
  childId: string,
  body: { prayer: PrayerName; state: SalahState; notes?: string },
) => apiCall(`/school/children/${childId}/salah`, { method: "POST", body: JSON.stringify(body) });

export const bulkLogSalah = (
  classId: string,
  body: {
    prayer: PrayerName;
    defaultState: SalahState;
    overrides?: Record<string, SalahState>;
    notes?: string;
  },
) =>
  apiCall(`/school/classes/${classId}/salah/bulk`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export type AttendanceStatus = "present" | "late" | "absent" | "present_remote";

export const recordAttendance = (
  classId: string,
  body: {
    date: string; // YYYY-MM-DD
    records: Array<{
      childId: string;
      status: AttendanceStatus;
      lateMinutes?: number;
      reason?: string;
    }>;
  },
) =>
  apiCall(`/school/classes/${classId}/attendance`, {
    method: "POST",
    body: JSON.stringify(body),
  });
