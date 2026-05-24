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

// ─── Link codes (family → school bridge) ───────────────────────────────

export interface ConsumeLinkCodeResponse {
  studentId: string;
  orgId: string;
  studentName: string;
}

/**
 * Family app uses this when a parent types the 8-character code their
 * school gave them. Validates + atomically marks the code consumed.
 * On success, the caller should follow up with bindFamilyChildToStudent
 * to record the KV↔Postgres mapping.
 *
 * Backend errors surfaced verbatim: "code not found", "code expired",
 * "code already used".
 */
export const consumeLinkCode = (code: string): Promise<ConsumeLinkCodeResponse> =>
  apiCall("/school/link-codes/consume", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

/**
 * Records the family-side KV child id ↔ school-side student id mapping.
 * Idempotent on the backend — calling twice with the same kvChildId
 * returns ok with `existed: true` and does NOT overwrite the existing
 * mapping.
 */
export const bindFamilyChildToStudent = (params: {
  kvChildId: string;
  studentId: string;
  orgId: string;
}): Promise<{ ok: true; existed: boolean }> =>
  apiCall("/school/child-id-map", {
    method: "POST",
    body: JSON.stringify(params),
  });

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

// ─── Principal/Admin Performance Dashboard ─────────────────────────────
//
// Backend lives in a parallel PR (`school-pilot/dashboard-backend`).
// Three endpoints power the dashboard:
//   GET /school/orgs/:orgId/dashboard?period=...
//   GET /school/orgs/:orgId/sections/leaderboard?period=...
//   GET /school/orgs/:orgId/insights?period=...
//
// `period` is one of: T (today) | WTD | MTD | QTD | YTD.

export type DashboardPeriod = "T" | "WTD" | "MTD" | "QTD" | "YTD";

export interface DashboardTile {
  /** null = data not yet available (e.g. Phase C/D feature). */
  value: number | null;
  hint: string;
  /** Period-over-period change in percentage points. Optional. */
  deltaPp?: number | null;
}

export interface DashboardAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  kind: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionPath?: string;
}

export interface DashboardResponse {
  asOf: string;
  period: DashboardPeriod;
  tiles: {
    students: DashboardTile;
    attendanceToday: DashboardTile;
    attendancePeriod: DashboardTile;
    teachers: DashboardTile;
    behaviorScore: DashboardTile;
    pendingApprovals: DashboardTile;
    concernsOpen: DashboardTile;
    feesPaidPct: DashboardTile;
    hifzProgress: DashboardTile;
    formsAwaiting: DashboardTile;
  };
  health: { healthy: number; watch: number; flagged: number };
  alerts: DashboardAlert[];
}

export interface LeaderboardRow {
  sectionId: string;
  classId: string;
  className: string;
  sectionName: string;
  studentCount: number;
  classTeacherName: string | null;
  attendancePct: number;
  attendanceDelta: number;
  behaviorScore: number;
  positiveCount: number;
  concernCount: number;
  last10Days: number[];
  last10Dates: string[];
  status: "compliant" | "watch" | "flagged";
}

export interface InsightsResponse {
  attendanceDistribution: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
  topPositive: Array<{ category: string; count: number; points: number }>;
  topConcern: Array<{ category: string; count: number; points: number }>;
  recentActivity: Array<{
    id: string;
    occurredAt: string;
    kind: string;
    summary: string;
    actor: string | null;
  }>;
}

export const getDashboard = (
  orgId: string,
  period: DashboardPeriod,
): Promise<DashboardResponse> =>
  apiCall(`/school/orgs/${orgId}/dashboard?period=${period}`);

export const getSectionsLeaderboard = (
  orgId: string,
  period: DashboardPeriod,
): Promise<{ sections: LeaderboardRow[] }> =>
  apiCall(
    `/school/orgs/${orgId}/sections/leaderboard?period=${period}`,
  );

export const getInsights = (
  orgId: string,
  period: DashboardPeriod,
): Promise<InsightsResponse> =>
  apiCall(
    `/school/orgs/${orgId}/insights?period=${period}`,
  );

// ─── Org-scoped role helper ────────────────────────────────────────────

/** True if the user has a principal role on this specific org. */
export const isOrgPrincipal = (
  me: SchoolMeResponse | null,
  orgId: string,
): boolean => principalOrgIds(me).includes(orgId);

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

// ─── Phase A Admin: Classes & Sections ─────────────────────────────────
//
// These call the Phase A backend endpoints (school-pilot/phase-a-backend).
// The route shape uses /school/orgs/:orgId/* for org-scoped resources.

export interface AdminSection {
  id: string;
  class_id: string;
  name: string;
  class_teacher_user_id: string | null;
}

export interface AdminClass {
  id: string;
  organization_id: string;
  name: string;
  display_order: number | null;
  sections: AdminSection[];
}

export const listClasses = (orgId: string): Promise<AdminClass[]> =>
  apiCall(`/school/orgs/${orgId}/classes`);

export const adminCreateClass = (
  orgId: string,
  body: { name: string; displayOrder?: number },
): Promise<AdminClass> =>
  apiCall(`/school/orgs/${orgId}/classes`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateClass = (
  orgId: string,
  classId: string,
  partial: Partial<{ name: string; displayOrder: number }>,
): Promise<AdminClass> =>
  apiCall(`/school/orgs/${orgId}/classes/${classId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteClass = (orgId: string, classId: string): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/classes/${classId}`, { method: "DELETE" });

export const createSection = (
  orgId: string,
  classId: string,
  body: { name: string; classTeacherUserId?: string },
): Promise<AdminSection> =>
  apiCall(`/school/orgs/${orgId}/classes/${classId}/sections`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateSection = (
  orgId: string,
  sectionId: string,
  partial: Partial<{ name: string; classTeacherUserId: string | null }>,
): Promise<AdminSection> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteSection = (orgId: string, sectionId: string): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}`, { method: "DELETE" });

// ─── Admin: Students ───────────────────────────────────────────────────

export interface AdminStudent {
  id: string;
  organization_id: string;
  gr_number: string;
  full_name: string;
  class_section_id: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  gender: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
}

export interface AdminParent {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
}

export interface StudentWithParents extends AdminStudent {
  parents: Array<AdminParent & { is_primary: boolean }>;
}

export const listStudents = (
  orgId: string,
  opts: { classSectionId?: string; search?: string } = {},
): Promise<AdminStudent[]> => {
  const q = new URLSearchParams();
  if (opts.classSectionId) q.append("classSectionId", opts.classSectionId);
  if (opts.search) q.append("search", opts.search);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/students${qs}`);
};

export const getStudent = (orgId: string, studentId: string): Promise<StudentWithParents> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}`);

export interface CreateStudentBody {
  grNumber: string;
  fullName: string;
  classSectionId?: string;
  photoUrl?: string;
  dateOfBirth?: string;
  gender?: string;
  guardianPhone?: string;
  guardianEmail?: string;
}

export const adminCreateStudent = (
  orgId: string,
  body: CreateStudentBody,
): Promise<AdminStudent> =>
  apiCall(`/school/orgs/${orgId}/students`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateStudent = (
  orgId: string,
  studentId: string,
  partial: Partial<CreateStudentBody>,
): Promise<AdminStudent> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteStudent = (orgId: string, studentId: string): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}`, { method: "DELETE" });

export interface BulkResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

export const bulkCreateAdminStudents = (
  orgId: string,
  rows: Array<Record<string, unknown>>,
): Promise<BulkResult> =>
  apiCall(`/school/orgs/${orgId}/students/bulk`, {
    method: "POST",
    body: JSON.stringify({ rows }),
  });

// ─── Admin: Parents ────────────────────────────────────────────────────

export const listParents = (
  orgId: string,
  opts: { studentId?: string; search?: string } = {},
): Promise<AdminParent[]> => {
  const q = new URLSearchParams();
  if (opts.studentId) q.append("studentId", opts.studentId);
  if (opts.search) q.append("search", opts.search);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/parents${qs}`);
};

export interface CreateParentBody {
  fullName: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

export const createParent = (orgId: string, body: CreateParentBody): Promise<AdminParent> =>
  apiCall(`/school/orgs/${orgId}/parents`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateParent = (
  orgId: string,
  parentId: string,
  partial: Partial<CreateParentBody>,
): Promise<AdminParent> =>
  apiCall(`/school/orgs/${orgId}/parents/${parentId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteParent = (orgId: string, parentId: string): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/parents/${parentId}`, { method: "DELETE" });

export const bulkCreateParents = (
  orgId: string,
  rows: Array<Record<string, unknown>>,
): Promise<BulkResult> =>
  apiCall(`/school/orgs/${orgId}/parents/bulk`, {
    method: "POST",
    body: JSON.stringify({ rows }),
  });

export const linkStudentParent = (
  orgId: string,
  body: { studentId: string; parentId: string; isPrimary?: boolean },
): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/student-parent-links`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const unlinkStudentParent = (
  orgId: string,
  studentId: string,
  parentId: string,
): Promise<void> =>
  apiCall(
    `/school/orgs/${orgId}/student-parent-links/${studentId}/${parentId}`,
    { method: "DELETE" },
  );

// ─── Admin: Teachers & Admins ──────────────────────────────────────────

export type RoleTemplate = "class_teacher" | "visiting_teacher";

export interface AdminTeacher {
  user_id: string;
  email: string;
  full_name: string;
  role_template: RoleTemplate;
}

export const listAdminTeachers = (orgId: string): Promise<AdminTeacher[]> =>
  apiCall(`/school/orgs/${orgId}/teachers`);

export const addTeacher = (
  orgId: string,
  body: { email: string; fullName: string; roleTemplate: RoleTemplate },
): Promise<AdminTeacher> =>
  apiCall(`/school/orgs/${orgId}/teachers`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const bulkCreateTeachers = (
  orgId: string,
  rows: Array<{ email: string; fullName: string; roleTemplate: RoleTemplate }>,
): Promise<BulkResult> =>
  apiCall(`/school/orgs/${orgId}/teachers/bulk`, {
    method: "POST",
    body: JSON.stringify({ rows }),
  });

export interface OrgAdmin {
  user_id: string;
  email: string;
  full_name: string;
}

export const listAdmins = (orgId: string): Promise<OrgAdmin[]> =>
  apiCall(`/school/orgs/${orgId}/admins`);

export const addAdmin = (
  orgId: string,
  body: { email: string; fullName: string },
): Promise<OrgAdmin> =>
  apiCall(`/school/orgs/${orgId}/admins`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const removeAdmin = (orgId: string, userId: string): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/admins/${userId}`, { method: "DELETE" });

// ─── Admin: PIN ────────────────────────────────────────────────────────

export type PinSubjectType = "student" | "parent" | "teacher";

export const setPin = (
  orgId: string,
  body: { subjectType: PinSubjectType; subjectId: string; pin: string },
): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/pin`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const resetPin = (
  orgId: string,
  body: { subjectType: PinSubjectType; subjectId: string },
): Promise<{ pin: string }> =>
  apiCall(`/school/orgs/${orgId}/pin/reset`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Admin: Link codes ─────────────────────────────────────────────────

export interface LinkCode {
  code: string;
  student_id: string;
  student_name?: string;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
}

export const createLinkCode = (
  orgId: string,
  body: { studentId: string; expiresInDays?: number },
): Promise<{ code: string; expiresAt: string | null }> =>
  apiCall(`/school/orgs/${orgId}/link-codes`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listLinkCodes = (
  orgId: string,
  opts: { studentId?: string; unusedOnly?: boolean } = {},
): Promise<LinkCode[]> => {
  const q = new URLSearchParams();
  if (opts.studentId) q.append("studentId", opts.studentId);
  if (opts.unusedOnly) q.append("unusedOnly", "true");
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/link-codes${qs}`);
};

// ─── Admin: Permissions ────────────────────────────────────────────────

export interface PermissionRow {
  roleTemplate: RoleTemplate | "admin";
  permissionKey: string;
  allowed: boolean;
}

export const getPermissions = (orgId: string): Promise<PermissionRow[]> =>
  apiCall(`/school/orgs/${orgId}/permissions`);

export const updatePermissions = (
  orgId: string,
  overrides: PermissionRow[],
): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ overrides }),
  });

// ─── Role helpers ──────────────────────────────────────────────────────

export function isOrgAdmin(me: SchoolMeResponse | null, orgId: string): boolean {
  if (!me) return false;
  return me.roles.some(
    (r) =>
      (r.role_type === "principal" || (r.role_type as string) === "admin") &&
      r.scope_type === "organization" &&
      r.scope_id === orgId,
  );
}

// isOrgPrincipal is declared above (line ~566) — do not redeclare.

// ─── Phase B: Attendance ───────────────────────────────────────────────

export type RollCallStatus = "present" | "absent" | "late" | "excused";

export interface SectionAttendanceEntry {
  id: string;
  studentId: string;
  studentName: string | null;
  grNumber: string | null;
  status: RollCallStatus;
  notes: string | null;
  recordedBy: string | null;
}

export interface SectionAttendanceResponse {
  date: string;
  sectionId: string;
  entries: SectionAttendanceEntry[];
}

export const postSectionAttendance = (
  orgId: string,
  sectionId: string,
  body: {
    date: string;
    entries: Array<{ studentId: string; status: RollCallStatus; notes?: string }>;
  },
): Promise<{
  inserted: number;
  updated: number;
  failed: number;
  results: Array<{ studentId: string; ok: boolean; error?: string }>;
}> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/attendance`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getSectionAttendance = (
  orgId: string,
  sectionId: string,
  opts: { date: string },
): Promise<SectionAttendanceResponse> =>
  apiCall(
    `/school/orgs/${orgId}/sections/${sectionId}/attendance?date=${encodeURIComponent(opts.date)}`,
  );

export interface StudentAttendanceEntry {
  id: string;
  date: string;
  status: RollCallStatus;
  notes: string | null;
  sectionId: string | null;
  recordedBy: string | null;
}

export const getStudentAttendance = (
  orgId: string,
  studentId: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<{ studentId: string; entries: StudentAttendanceEntry[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/students/${studentId}/attendance${qs}`);
};

export interface AttendanceSummaryRow {
  studentId: string;
  studentName: string | null;
  grNumber: string | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export const getSectionAttendanceSummary = (
  orgId: string,
  sectionId: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<{
  sectionId: string;
  startDate: string | null;
  endDate: string | null;
  summary: AttendanceSummaryRow[];
}> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(
    `/school/orgs/${orgId}/sections/${sectionId}/attendance/summary${qs}`,
  );
};

// ─── Phase B: Behavior notes ───────────────────────────────────────────

export type BehaviorNoteKind = "positive" | "concern";

export interface BehaviorNote {
  id: string;
  studentId: string;
  studentName?: string | null;
  grNumber?: string | null;
  sectionId: string | null;
  kind: BehaviorNoteKind;
  category: string | null;
  points: number;
  notes: string;
  observedAt: string;
  recordedBy: string | null;
}

export const postBehaviorNote = (
  orgId: string,
  body: {
    studentId: string;
    kind: BehaviorNoteKind;
    category?: string;
    points?: number;
    notes: string;
    observedAt?: string;
  },
): Promise<{ note: BehaviorNote }> =>
  apiCall(`/school/orgs/${orgId}/behavior-notes`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getStudentBehaviorNotes = (
  orgId: string,
  studentId: string,
  opts: { startDate?: string; endDate?: string; kind?: BehaviorNoteKind } = {},
): Promise<{ studentId: string; notes: BehaviorNote[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.kind) q.append("kind", opts.kind);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/students/${studentId}/behavior-notes${qs}`);
};

export const getSectionBehaviorNotes = (
  orgId: string,
  sectionId: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<{ sectionId: string; notes: BehaviorNote[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/sections/${sectionId}/behavior-notes${qs}`);
};

export const deleteBehaviorNote = (orgId: string, noteId: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/behavior-notes/${noteId}`, { method: "DELETE" });

// ─── Phase B: Roster change requests ───────────────────────────────────

export type RosterRequestKind = "add" | "remove";
export type RosterRequestStatus = "pending" | "approved" | "rejected";

export interface RosterRequest {
  id: string;
  orgId: string;
  sectionId: string;
  kind: RosterRequestKind;
  studentId: string | null;
  newStudentPayload: {
    grNumber: string;
    fullName: string;
    photoUrl?: string;
    dateOfBirth?: string;
    gender?: string;
    guardianPhone?: string;
    guardianEmail?: string;
  } | null;
  reason: string | null;
  status: RosterRequestStatus;
  requestedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNotes: string | null;
  createdAt: string;
}

export const postRosterRequest = (
  orgId: string,
  sectionId: string,
  body: {
    kind: RosterRequestKind;
    studentId?: string;
    newStudentPayload?: RosterRequest["newStudentPayload"];
    reason?: string;
  },
): Promise<{ request: RosterRequest }> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/roster-requests`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Phase C.1: Lessons (daily sabaq) ──────────────────────────────────

export interface Lesson {
  id: string;
  org_id: string;
  class_section_id: string;
  lesson_date: string; // YYYY-MM-DD
  title: string;
  body: string | null;
  video_url: string | null;
  audio_url: string | null;
  attachments: Array<{ label: string; url: string }>;
  taught_by: string | null;
  taught_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonInput {
  lessonDate: string; // YYYY-MM-DD
  title: string;
  body?: string;
  videoUrl?: string;
  audioUrl?: string;
  attachments?: Array<{ label: string; url: string }>;
}

export const postLesson = (
  orgId: string,
  sectionId: string,
  body: LessonInput,
): Promise<Lesson> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/lessons`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getRosterRequests = (
  orgId: string,
  opts: { status?: RosterRequestStatus } = {},
): Promise<{ requests: RosterRequest[] }> => {
  const q = new URLSearchParams();
  if (opts.status) q.append("status", opts.status);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/roster-requests${qs}`);
};

export const getSectionRosterRequests = (
  orgId: string,
  sectionId: string,
): Promise<{ requests: RosterRequest[] }> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/roster-requests`);

export const patchRosterRequest = (
  orgId: string,
  requestId: string,
  body: { status: "approved" | "rejected"; reviewerNotes?: string },
): Promise<{ request: RosterRequest; createdStudentId: string | null }> =>
  apiCall(`/school/orgs/${orgId}/roster-requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const getSectionLessons = (
  orgId: string,
  sectionId: string,
  opts: { startDate?: string; endDate?: string; limit?: number } = {},
): Promise<{ lessons: Lesson[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.limit) q.append("limit", String(opts.limit));
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/sections/${sectionId}/lessons${qs}`);
};

export const getLesson = (orgId: string, lessonId: string): Promise<Lesson> =>
  apiCall(`/school/orgs/${orgId}/lessons/${lessonId}`);

export const patchLesson = (
  orgId: string,
  lessonId: string,
  partial: Partial<LessonInput>,
): Promise<Lesson> =>
  apiCall(`/school/orgs/${orgId}/lessons/${lessonId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteLesson = (
  orgId: string,
  lessonId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/lessons/${lessonId}`, { method: "DELETE" });

// ─── Phase C.1: Hifz progress ──────────────────────────────────────────

export type HifzKind =
  | "memorized"
  | "revised"
  | "tested"
  | "sabaq"
  | "sabqi"
  | "manzil";

export type HifzQuality = "excellent" | "good" | "needs_practice" | "weak";

export interface HifzEntry {
  id: string;
  student_id: string;
  surah_number: number;
  ayah_from: number;
  ayah_to: number;
  kind: HifzKind;
  quality: HifzQuality | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_by_name?: string | null;
  recorded_at: string;
}

export interface HifzEntryInput {
  studentId: string;
  surahNumber: number;
  ayahFrom: number;
  ayahTo: number;
  kind: HifzKind;
  quality?: HifzQuality;
  notes?: string;
}

export const postHifzEntry = (
  orgId: string,
  body: HifzEntryInput,
): Promise<HifzEntry> =>
  apiCall(`/school/orgs/${orgId}/hifz-progress`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getStudentHifz = (
  orgId: string,
  studentId: string,
  opts: {
    startDate?: string;
    endDate?: string;
    kind?: HifzKind;
    limit?: number;
  } = {},
): Promise<{ entries: HifzEntry[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.kind) q.append("kind", opts.kind);
  if (opts.limit) q.append("limit", String(opts.limit));
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(
    `/school/orgs/${orgId}/students/${studentId}/hifz-progress${qs}`,
  );
};

export interface StudentHifzSummary {
  ayahsMemorized: number;
  surahsCompleted: number;
  lastEntry: string | null;
}

export const getStudentHifzSummary = (
  orgId: string,
  studentId: string,
): Promise<StudentHifzSummary> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/hifz-progress/summary`);

export interface SectionHifzSummaryRow {
  studentId: string;
  studentName: string;
  ayahsMemorized: number;
  lastEntry: string | null;
}

export const getSectionHifzSummary = (
  orgId: string,
  sectionId: string,
): Promise<{ students: SectionHifzSummaryRow[] }> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/hifz-progress/summary`);

export const deleteHifzEntry = (
  orgId: string,
  entryId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/hifz-progress/${entryId}`, {
    method: "DELETE",
  });

// Re-export apiCall so callers can hit ad-hoc endpoints without a second import.
export { apiCall };
