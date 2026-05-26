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

// Principal-only PATCH of organization-level fields (name, contact info,
// address, academic year). Backend silently drops unknown columns, so
// passing `academic_year` is safe even if the column hasn't been added
// to the organizations table yet.
export const updateOrganization = (
  orgId: string,
  body: Partial<{
    name: string;
    contact_email: string;
    contact_phone: string;
    address: string;
    academic_year: string;
  }>,
): Promise<OrganizationDetail> =>
  apiCall(`/school/orgs/${orgId}`, {
    method: "PATCH",
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
  /** Scope of the data returned. Org view = full school; sections view = only
   *  the sections the caller teaches. Added with role-aware alerts. */
  viewScope?: {
    kind: "org" | "sections";
    sectionIds: string[];
    sectionLabels?: Array<{ id: string; label: string }>;
  };
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

export const listClasses = async (orgId: string): Promise<AdminClass[]> => {
  // Backend wraps the array in { classes: [...] }.
  const r = await apiCall<{ classes: AdminClass[] }>(`/school/orgs/${orgId}/classes`);
  return r?.classes ?? [];
};

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

export const listStudents = async (
  orgId: string,
  opts: { classSectionId?: string; search?: string } = {},
): Promise<AdminStudent[]> => {
  const q = new URLSearchParams();
  if (opts.classSectionId) q.append("classSectionId", opts.classSectionId);
  if (opts.search) q.append("search", opts.search);
  const qs = q.toString() ? `?${q}` : "";
  // Backend wraps the array in { students: [...] }.
  const r = await apiCall<{ students: AdminStudent[] }>(`/school/orgs/${orgId}/students${qs}`);
  return r?.students ?? [];
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
  /** Number of newly-created auth users for whom a password-reset / set-password
   *  email was sent. Optional — older endpoints don't populate it. */
  invitedCount?: number;
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

export const listParents = async (
  orgId: string,
  opts: { studentId?: string; search?: string } = {},
): Promise<AdminParent[]> => {
  const q = new URLSearchParams();
  if (opts.studentId) q.append("studentId", opts.studentId);
  if (opts.search) q.append("search", opts.search);
  const qs = q.toString() ? `?${q}` : "";
  // Backend wraps the array in { parents: [...] }.
  const r = await apiCall<{ parents: AdminParent[] }>(`/school/orgs/${orgId}/parents${qs}`);
  return r?.parents ?? [];
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

export type RoleTemplate =
  | "class_teacher"
  | "visiting_teacher"
  | "financial_staff"
  | "office_staff";

export interface AdminTeacher {
  user_id: string;
  email: string;
  full_name: string;
  role_template: RoleTemplate;
}

export const listAdminTeachers = async (orgId: string): Promise<AdminTeacher[]> => {
  // Backend wraps the array in { teachers: [...] }.
  const r = await apiCall<{ teachers: AdminTeacher[] }>(`/school/orgs/${orgId}/teachers`);
  return r?.teachers ?? [];
};

/** Response from POST /teachers — the created teacher, plus an optional
 *  `invitedCount` (0 or 1) indicating whether a password-reset email was
 *  sent to a new auth user. Older backends may return just the AdminTeacher
 *  fields without `invitedCount`. */
export type AddTeacherResponse = AdminTeacher & { invitedCount?: number };

export const addTeacher = (
  orgId: string,
  body: { email: string; fullName: string; roleTemplate: RoleTemplate },
): Promise<AddTeacherResponse> =>
  apiCall(`/school/orgs/${orgId}/teachers`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Response from POST /admins — same idea as AddTeacherResponse. */
export type AddAdminResponse = OrgAdmin & { invitedCount?: number };

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

export const listAdmins = async (orgId: string): Promise<OrgAdmin[]> => {
  // Backend wraps the array in { admins: [...] }.
  const r = await apiCall<{ admins: OrgAdmin[] }>(`/school/orgs/${orgId}/admins`);
  return r?.admins ?? [];
};

export const addAdmin = (
  orgId: string,
  body: { email: string; fullName: string },
): Promise<AddAdminResponse> =>
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

export const listLinkCodes = async (
  orgId: string,
  opts: { studentId?: string; unusedOnly?: boolean } = {},
): Promise<LinkCode[]> => {
  const q = new URLSearchParams();
  if (opts.studentId) q.append("studentId", opts.studentId);
  if (opts.unusedOnly) q.append("unusedOnly", "true");
  const qs = q.toString() ? `?${q}` : "";
  // Backend wraps the array in { linkCodes: [...] }.
  const r = await apiCall<{ linkCodes: LinkCode[] }>(`/school/orgs/${orgId}/link-codes${qs}`);
  return r?.linkCodes ?? [];
};

// ─── Admin: Permissions ────────────────────────────────────────────────

export interface PermissionRow {
  roleTemplate: RoleTemplate | "admin";
  permissionKey: string;
  allowed: boolean;
}

export const getPermissions = async (orgId: string): Promise<PermissionRow[]> => {
  // Backend wraps the array in { permissions: [...] }; unwrap here so the
  // helper's return type matches what PermissionsEditor expects (a bare array).
  const r = await apiCall<{ permissions: PermissionRow[] }>(`/school/orgs/${orgId}/permissions`);
  return r?.permissions ?? [];
};

export const updatePermissions = (
  orgId: string,
  overrides: PermissionRow[],
): Promise<void> =>
  apiCall(`/school/orgs/${orgId}/permissions`, {
    method: "PATCH",
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

// ─── Phase C.2: Assignments & Grades ───────────────────────────────────

export type AssignmentKind =
  | "quiz"
  | "test"
  | "homework"
  | "project"
  | "class_participation"
  | "other";

export interface Assignment {
  id: string;
  org_id: string;
  class_section_id: string;
  title: string;
  kind: AssignmentKind;
  description: string | null;
  max_score: number;
  weight: number;
  due_date: string | null;
  assigned_date: string;
  related_topic: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentInput {
  title: string;
  kind: AssignmentKind;
  description?: string;
  maxScore: number;
  weight?: number;
  dueDate?: string;
  relatedTopic?: string;
}

export type GradeStatus = "graded" | "missing" | "excused" | "late";

export interface GradeEntry {
  id: string;
  assignment_id: string;
  student_id: string;
  score: number | null;
  status: GradeStatus;
  feedback: string | null;
  graded_by: string | null;
  graded_by_name?: string | null;
  graded_at: string | null;
}

export interface GradebookResponse {
  assignments: Assignment[];
  students: Array<{ id: string; full_name: string; gr_number: string }>;
  grades: Record<string, Record<string, GradeEntry>>;
}

export interface StudentGradesSummary {
  assignmentsGraded: number;
  average: number | null;
  lastGradedAt: string | null;
  perKindAverage: Partial<Record<AssignmentKind, number>>;
}

export interface GradeBatchEntry {
  studentId: string;
  score?: number | null;
  status?: GradeStatus;
  feedback?: string;
}

export interface GradeBatchResponse {
  inserted: number;
  updated: number;
  failed: number;
  results: Array<{ studentId: string; ok: boolean; error?: string }>;
}

export const postAssignment = (
  orgId: string,
  sectionId: string,
  body: AssignmentInput,
): Promise<Assignment> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/assignments`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getSectionAssignments = (
  orgId: string,
  sectionId: string,
  opts: { startDate?: string; endDate?: string; kind?: AssignmentKind; limit?: number } = {},
): Promise<{ assignments: Assignment[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.kind) q.append("kind", opts.kind);
  if (opts.limit) q.append("limit", String(opts.limit));
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/sections/${sectionId}/assignments${qs}`);
};

export const getAssignment = (
  orgId: string,
  assignmentId: string,
): Promise<Assignment> =>
  apiCall(`/school/orgs/${orgId}/assignments/${assignmentId}`);

export const patchAssignment = (
  orgId: string,
  assignmentId: string,
  partial: Partial<AssignmentInput>,
): Promise<Assignment> =>
  apiCall(`/school/orgs/${orgId}/assignments/${assignmentId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteAssignment = (
  orgId: string,
  assignmentId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/assignments/${assignmentId}`, {
    method: "DELETE",
  });

export const postGradesBatch = (
  orgId: string,
  assignmentId: string,
  entries: GradeBatchEntry[],
): Promise<GradeBatchResponse> =>
  apiCall(`/school/orgs/${orgId}/assignments/${assignmentId}/grades/batch`, {
    method: "POST",
    body: JSON.stringify({ entries }),
  });

export const postSingleGrade = (
  orgId: string,
  assignmentId: string,
  entry: GradeBatchEntry,
): Promise<GradeEntry> =>
  apiCall(`/school/orgs/${orgId}/assignments/${assignmentId}/grades`, {
    method: "POST",
    body: JSON.stringify(entry),
  });

export const getAssignmentGrades = (
  orgId: string,
  assignmentId: string,
): Promise<{ grades: GradeEntry[] }> =>
  apiCall(`/school/orgs/${orgId}/assignments/${assignmentId}/grades`);

export const getStudentGrades = (
  orgId: string,
  studentId: string,
  opts: { startDate?: string; endDate?: string; kind?: AssignmentKind; limit?: number } = {},
): Promise<{ grades: Array<GradeEntry & { assignment: Assignment }> }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.kind) q.append("kind", opts.kind);
  if (opts.limit) q.append("limit", String(opts.limit));
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/students/${studentId}/grades${qs}`);
};

export const getStudentGradesSummary = (
  orgId: string,
  studentId: string,
): Promise<StudentGradesSummary> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/grades/summary`);

export const getSectionGradebook = (
  orgId: string,
  sectionId: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<GradebookResponse> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/sections/${sectionId}/gradebook${qs}`);
};

export const deleteGrade = (
  orgId: string,
  gradeId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/grades/${gradeId}`, { method: "DELETE" });

// ─── Phase C.3: Curriculum ─────────────────────────────────────────────

export interface CurriculumTopic {
  id: string;
  curriculum_id: string;
  name: string;
  description: string | null;
  display_order: number;
  target_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Curriculum {
  id: string;
  org_id: string;
  class_section_id: string;
  academic_year: string;
  title: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  topics?: CurriculumTopic[];
}

export const createCurriculum = (
  orgId: string,
  sectionId: string,
  body: { academicYear: string; title: string; description?: string },
): Promise<Curriculum> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/curriculum`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getSectionCurriculum = (
  orgId: string,
  sectionId: string,
  opts: { academicYear?: string } = {},
): Promise<{ curricula: Curriculum[] }> => {
  const q = new URLSearchParams();
  if (opts.academicYear) q.append("academicYear", opts.academicYear);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(
    `/school/orgs/${orgId}/sections/${sectionId}/curriculum${qs}`,
  );
};

export const updateCurriculum = (
  orgId: string,
  curriculumId: string,
  partial: Partial<{ title: string; description: string; academicYear: string }>,
): Promise<Curriculum> =>
  apiCall(`/school/orgs/${orgId}/curriculum/${curriculumId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteCurriculum = (
  orgId: string,
  curriculumId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/curriculum/${curriculumId}`, {
    method: "DELETE",
  });

export const addTopic = (
  orgId: string,
  curriculumId: string,
  body: { name: string; description?: string; displayOrder?: number; targetDate?: string },
): Promise<CurriculumTopic> =>
  apiCall(`/school/orgs/${orgId}/curriculum/${curriculumId}/topics`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateTopic = (
  orgId: string,
  topicId: string,
  partial: Partial<{
    name: string;
    description: string;
    displayOrder: number;
    targetDate: string | null;
    completed: boolean;
  }>,
): Promise<CurriculumTopic> =>
  apiCall(`/school/orgs/${orgId}/topics/${topicId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteTopic = (
  orgId: string,
  topicId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/topics/${topicId}`, { method: "DELETE" });

export const reorderTopics = (
  orgId: string,
  curriculumId: string,
  orderedIds: string[],
): Promise<{ ok: true }> =>
  apiCall(
    `/school/orgs/${orgId}/curriculum/${curriculumId}/topics/reorder`,
    { method: "POST", body: JSON.stringify({ orderedIds }) },
  );

// ─── Phase C.3: Fees ───────────────────────────────────────────────────

export type FeeStatusValue = "pending" | "paid" | "partial" | "overdue" | "waived";

export interface FeeStatus {
  id: string;
  org_id: string;
  student_id: string;
  student_name?: string | null;
  gr_number?: string | null;
  section_id?: string | null;
  section_label?: string | null;
  period: string;
  amount_due: number | null;
  amount_paid: number | null;
  status: FeeStatusValue;
  due_date: string | null;
  paid_date: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeeStatusInput {
  period: string;
  amountDue?: number;
  dueDate?: string;
  notes?: string;
}

export const createFee = (
  orgId: string,
  studentId: string,
  body: FeeStatusInput,
): Promise<FeeStatus> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/fees`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listStudentFees = (
  orgId: string,
  studentId: string,
  opts: { startPeriod?: string; endPeriod?: string } = {},
): Promise<{ fees: FeeStatus[] }> => {
  const q = new URLSearchParams();
  if (opts.startPeriod) q.append("startPeriod", opts.startPeriod);
  if (opts.endPeriod) q.append("endPeriod", opts.endPeriod);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/students/${studentId}/fees${qs}`);
};

export const listOrgFees = (
  orgId: string,
  opts: { period?: string; status?: FeeStatusValue; sectionId?: string } = {},
): Promise<{ fees: FeeStatus[] }> => {
  const q = new URLSearchParams();
  if (opts.period) q.append("period", opts.period);
  if (opts.status) q.append("status", opts.status);
  if (opts.sectionId) q.append("sectionId", opts.sectionId);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/fees${qs}`);
};

export const updateFee = (
  orgId: string,
  feeId: string,
  partial: Partial<{
    status: FeeStatusValue;
    amountPaid: number;
    paidDate: string;
    receiptUrl: string;
    notes: string;
    amountDue: number;
    dueDate: string;
  }>,
): Promise<FeeStatus> =>
  apiCall(`/school/orgs/${orgId}/fees/${feeId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteFee = (
  orgId: string,
  feeId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/fees/${feeId}`, { method: "DELETE" });

// ─── Phase D: Forms ────────────────────────────────────────────────────

export type FormStatus = "draft" | "published" | "closed";
export type FormAudienceKind = "whole_school" | "class_section" | "specific_students";
export type FormFieldKind =
  | "short_text"
  | "long_text"
  | "single_select"
  | "multi_select"
  | "number";

export interface FormField {
  id: string;
  form_id: string;
  kind: FormFieldKind;
  label: string;
  required: boolean;
  options: string[] | null;
  help_text: string | null;
  display_order: number;
}

export interface Form {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  status: FormStatus;
  audience_kind: FormAudienceKind;
  audience_section_id: string | null;
  audience_student_ids: string[] | null;
  allow_multiple: boolean;
  deadline: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  fields?: FormField[];
  responseCount?: number;
}

export interface FormResponseValue {
  fieldId: string;
  value: string | string[] | number | null;
}

export interface FormResponse {
  id: string;
  form_id: string;
  submitted_by: string | null;
  submitted_by_name?: string | null;
  on_behalf_of_student_id: string | null;
  on_behalf_of_student_name?: string | null;
  values: FormResponseValue[];
  submitted_at: string;
}

export interface MyFormSummary {
  form: Form;
  hasResponded: boolean;
  responseCount: number;
}

export const createForm = (
  orgId: string,
  body: {
    title: string;
    description?: string;
    audienceKind: FormAudienceKind;
    audienceSectionId?: string;
    audienceStudentIds?: string[];
    allowMultiple?: boolean;
    deadline?: string;
  },
): Promise<Form> =>
  apiCall(`/school/orgs/${orgId}/forms`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listForms = (
  orgId: string,
  opts: { status?: FormStatus; creatorOnly?: boolean } = {},
): Promise<{ forms: Form[] }> => {
  const q = new URLSearchParams();
  if (opts.status) q.append("status", opts.status);
  if (opts.creatorOnly) q.append("creatorOnly", "true");
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/forms${qs}`);
};

export const getForm = (orgId: string, formId: string): Promise<Form> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}`);

export const updateForm = (
  orgId: string,
  formId: string,
  partial: Partial<{
    title: string;
    description: string;
    audienceKind: FormAudienceKind;
    audienceSectionId: string | null;
    audienceStudentIds: string[];
    allowMultiple: boolean;
    deadline: string | null;
  }>,
): Promise<Form> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const publishForm = (orgId: string, formId: string): Promise<Form> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}/publish`, { method: "POST" });

export const closeForm = (orgId: string, formId: string): Promise<Form> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}/close`, { method: "POST" });

export const deleteForm = (
  orgId: string,
  formId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}`, { method: "DELETE" });

export const addFormField = (
  orgId: string,
  formId: string,
  body: {
    kind: FormFieldKind;
    label: string;
    required?: boolean;
    options?: string[];
    helpText?: string;
    displayOrder?: number;
  },
): Promise<FormField> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}/fields`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateFormField = (
  orgId: string,
  fieldId: string,
  partial: Partial<{
    kind: FormFieldKind;
    label: string;
    required: boolean;
    options: string[];
    helpText: string;
    displayOrder: number;
  }>,
): Promise<FormField> =>
  apiCall(`/school/orgs/${orgId}/fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteFormField = (
  orgId: string,
  fieldId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/fields/${fieldId}`, { method: "DELETE" });

export const reorderFormFields = (
  orgId: string,
  formId: string,
  orderedIds: string[],
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}/fields/reorder`, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });

export const listFormResponses = (
  orgId: string,
  formId: string,
): Promise<{ responses: FormResponse[] }> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}/responses`);

// ─── Parent-facing forms (would normally live in schoolPortalApi.ts) ──

export const listMyForms = (orgId: string): Promise<{ forms: MyFormSummary[] }> =>
  apiCall(`/school/orgs/${orgId}/my-forms`);

export const submitFormResponse = (
  orgId: string,
  formId: string,
  body: {
    onBehalfOfStudentId?: string;
    values: FormResponseValue[];
  },
): Promise<FormResponse> =>
  apiCall(`/school/orgs/${orgId}/forms/${formId}/responses`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Announcements ─────────────────────────────────────────────────────

export type AnnouncementAudienceKind =
  | "whole_school"
  | "class_section"
  | "parents_only"
  | "students_only"
  | "specific_students";

export interface Announcement {
  id: string;
  org_id: string;
  author_user_id: string | null;
  author_name?: string | null;
  audience_kind: AnnouncementAudienceKind;
  audience_section_id: string | null;
  audience_student_ids: string[] | null;
  title: string;
  body: string;
  attachments: Array<{ label: string; url: string }>;
  published_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audienceKind: AnnouncementAudienceKind;
  audienceSectionId?: string;
  audienceStudentIds?: string[];
  attachments?: Array<{ label: string; url: string }>;
  expiresAt?: string;
}

export const postAnnouncement = (
  orgId: string,
  body: AnnouncementInput,
): Promise<Announcement> =>
  apiCall(`/school/orgs/${orgId}/announcements`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listAnnouncements = (
  orgId: string,
  opts: { creatorOnly?: boolean } = {},
): Promise<{ announcements: Announcement[] }> => {
  const q = new URLSearchParams();
  if (opts.creatorOnly) q.append("creatorOnly", "true");
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/announcements${qs}`);
};

export const getAnnouncement = (
  orgId: string,
  announcementId: string,
): Promise<Announcement> =>
  apiCall(`/school/orgs/${orgId}/announcements/${announcementId}`);

export const deleteAnnouncement = (
  orgId: string,
  announcementId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/announcements/${announcementId}`, {
    method: "DELETE",
  });

export const getLessonCompletions = (
  orgId: string,
  sectionId: string,
  lessonId: string,
): Promise<{
  completions: Array<{ studentId: string; completedAt: string }>;
  totalStudents: number;
  completedCount: number;
}> =>
  apiCall(
    `/school/orgs/${orgId}/sections/${sectionId}/lessons/${lessonId}/completions`,
  );

// Re-export apiCall so callers can hit ad-hoc endpoints without a second import.
export { apiCall };
