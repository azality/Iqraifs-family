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
    slug: string;
    contact_email: string;
    contact_phone: string;
    address: string;
    academic_year: string;
    timezone: string;
    logo_url: string;
    theme_color: string;
    school_motto: string;
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

// ─── Subjects (Phase 1C class-level templates) ──────────────────────────
// A subject is defined ONCE per class (Math in Grade 3), then fanned out
// to every section of that class. Each fanned-out row holds the per-
// section teacher assignment (Zara teaches Math in 3-A, someone else in
// 3-B). See migrations 0018 + 0019.

/** A subject template at the class level, plus its per-section assignments. */
export interface ClassSubject {
  id: string;
  orgId: string;
  classId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  sections: Array<{
    sectionSubjectId: string;
    sectionId: string;
    sectionName: string | null;
    teacherUserId: string | null;
    teacherName: string | null;
  }>;
}

/** A subject as seen from a single section (denormalised name + teacher). */
export interface SectionSubject {
  id: string;
  classSectionId: string;
  classSubjectId: string;
  name: string;
  sortOrder: number;
  teacherUserId: string | null;
  teacherName: string | null;
}

// --- Class-level (admin/principal writes) -----------------------------------
export const listClassSubjects = (
  classId: string,
): Promise<{ classId: string; subjects: ClassSubject[] }> =>
  apiCall(`/school/classes/${classId}/subjects`);

export const createClassSubject = (
  classId: string,
  body: { name: string; sortOrder?: number },
): Promise<{ subject: ClassSubject }> =>
  apiCall(`/school/classes/${classId}/subjects`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateClassSubject = (
  classSubjectId: string,
  body: { name?: string; sortOrder?: number },
): Promise<{ subject: ClassSubject }> =>
  apiCall(`/school/class-subjects/${classSubjectId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteClassSubject = (
  classSubjectId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/class-subjects/${classSubjectId}`, { method: "DELETE" });

// --- Curriculum per (class_subject, academic_year) — Phase 1D ---------------

export interface ClassCurriculumTopic {
  id: string;
  curriculumId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  targetDate: string | null;
  completed: boolean;
  createdAt: string;
}

export interface ClassCurriculum {
  id: string;
  orgId: string;
  classSubjectId: string;
  academicYear: string;
  title: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight descriptor for every academic year that has a curriculum
 *  row for this subject. Returned alongside the requested year so the
 *  frontend can offer "copy from {prior year}" without a second call. */
export interface CurriculumYearSummary {
  academicYear: string;
  title: string;
  topicCount: number;
}

export const getClassSubjectCurriculum = (
  classSubjectId: string,
  opts: { academicYear?: string } = {},
): Promise<{
  curriculum: ClassCurriculum | null;
  topics: ClassCurriculumTopic[];
  /** All years that have a curriculum row for this subject, newest first.
   *  Pre-rollout backends may omit this — treat as empty array if missing. */
  availableYears?: CurriculumYearSummary[];
}> => {
  const q = new URLSearchParams();
  if (opts.academicYear) q.append("academicYear", opts.academicYear);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/class-subjects/${classSubjectId}/curriculum${qs}`);
};

/** Copy all topics from one academic year's curriculum to another year's.
 *  Creates the target year's curriculum row if it doesn't already exist.
 *  Existing topic names on the target (case-insensitive) are skipped, so
 *  re-running the copy is safe. Copies start with completed=false. */
export const copyCurriculumFromYear = (
  classSubjectId: string,
  body: { fromAcademicYear: string; toAcademicYear: string; title?: string },
): Promise<{ added: number; skipped: number; curriculumId: string }> =>
  apiCall(`/school/class-subjects/${classSubjectId}/curriculum/copy-from-year`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const createClassCurriculum = (
  classSubjectId: string,
  body: { academicYear: string; title?: string; description?: string },
): Promise<{ curriculum: ClassCurriculum }> =>
  apiCall(`/school/class-subjects/${classSubjectId}/curriculum`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateClassCurriculum = (
  curriculumId: string,
  body: Partial<{ title: string; description: string | null }>,
): Promise<{ curriculum: ClassCurriculum }> =>
  apiCall(`/school/class-curriculum/${curriculumId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteClassCurriculum = (
  curriculumId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/class-curriculum/${curriculumId}`, { method: "DELETE" });

export const addClassCurriculumTopic = (
  curriculumId: string,
  body: {
    name: string;
    description?: string;
    targetDate?: string | null;
    displayOrder?: number;
  },
): Promise<{ topic: ClassCurriculumTopic }> =>
  apiCall(`/school/class-curriculum/${curriculumId}/topics`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/**
 * Bulk-create topics from a list of names. Names that already exist
 * (case-insensitive vs current topics on this curriculum) are silently
 * skipped — re-applying a template is idempotent.
 */
export const bulkAddClassCurriculumTopics = (
  curriculumId: string,
  names: string[],
): Promise<{ added: number; topics: ClassCurriculumTopic[] }> =>
  apiCall(`/school/class-curriculum/${curriculumId}/topics/bulk`, {
    method: "POST",
    body: JSON.stringify({ names }),
  });

export const updateClassCurriculumTopic = (
  topicId: string,
  body: Partial<{
    name: string;
    description: string | null;
    targetDate: string | null;
    displayOrder: number;
    completed: boolean;
  }>,
): Promise<{ topic: ClassCurriculumTopic }> =>
  apiCall(`/school/curriculum-topics/${topicId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteClassCurriculumTopic = (
  topicId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/curriculum-topics/${topicId}`, { method: "DELETE" });

export const reorderClassCurriculumTopics = (
  curriculumId: string,
  orderedIds: string[],
): Promise<{ ok: true }> =>
  apiCall(`/school/class-curriculum/${curriculumId}/topics/reorder`, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });

// --- Teacher self: section subjects I teach (Phase 4a) ----------------------

export interface MySectionSubject {
  /** section_subject row id. */
  id: string;
  orgId: string;
  classSectionId: string;
  classSubjectId: string;
  subjectName: string;
  className: string | null;
  sectionName: string | null;
  /** Curriculum progress for the LATEST academic year on this subject.
   *  Null when the admin hasn't set up a curriculum yet. */
  curriculum: {
    academicYear: string;
    topicTotal: number;
    topicCompleted: number;
    progressPct: number;
  } | null;
}

export const getMySectionSubjects = (): Promise<{
  sectionSubjects: MySectionSubject[];
}> => apiCall(`/school/me/section-subjects`);

// --- Teacher snapshot (Phase 6b) ----------------------------------------

export interface TeacherSnapshot {
  topicsDueSoon: Array<{
    topicId: string;
    topicName: string;
    classSubjectId: string;
    subjectName: string;
    className: string | null;
    sectionId: string;
    targetDate: string;
  }>;
  untaggedLessons: Array<{
    lessonId: string;
    title: string;
    lessonDate: string;
    classSectionId: string;
    sectionName: string | null;
    className: string | null;
  }>;
  untaggedLessonsCount: number;
  assignmentsToGrade: Array<{
    assignmentId: string;
    title: string;
    subjectName: string | null;
    classSectionId: string;
    dueDate: string;
    maxScore: number;
    missingCount: number;
    rosterSize: number;
  }>;
  recentGradesGiven: Array<{
    gradeId: string;
    studentName: string;
    assignmentTitle: string;
    subjectName: string | null;
    score: number | null;
    maxScore: number | null;
    status: string;
    gradedAt: string;
  }>;
}

export const getMyTeacherSnapshot = (): Promise<TeacherSnapshot> =>
  apiCall(`/school/me/teacher-snapshot`);

// --- Section curriculum progress (Phase 4b, SectionOverview) -----------------

export interface SectionSubjectProgress {
  sectionSubjectId: string;
  classSubjectId: string;
  name: string;
  teacherUserId: string | null;
  teacherName: string | null;
  curriculum: {
    academicYear: string;
    topicTotal: number;
    topicCompleted: number;
    progressPct: number;
  } | null;
}

export const getSectionCurriculumProgress = (
  sectionId: string,
): Promise<{ sectionId: string; subjects: SectionSubjectProgress[] }> =>
  apiCall(`/school/sections/${sectionId}/curriculum-progress`);

// ─── Topic resources (Phase 1E) ────────────────────────────────────────
//
// Durable PDFs / videos / worksheets / external quizzes attached to a
// curriculum topic. Distinct from lesson.attachments[] (which are
// per-day). Admin/principal only for writes; any org role can read.
//
// Note: TopicResourceKind is also referenced inline in the Lesson interface
// (Phase 4a) which inlined the union when this PR hadn't yet merged. Both
// declarations now coexist — the inline union there could be replaced with
// this type in a follow-up cleanup.

export type TopicResourceKind = "pdf" | "video" | "worksheet" | "link" | "quiz";

export interface TopicResource {
  id: string;
  orgId: string;
  curriculumTopicId: string;
  kind: TopicResourceKind;
  label: string;
  url: string;
  description: string | null;
  sortOrder: number;
  addedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // File-upload metadata. Null when the resource is an external link.
  // UI uses storagePath != null as the "this is a file, fetch a signed
  // URL before opening" signal.
  storagePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
}

export const listTopicResources = (
  topicId: string,
): Promise<{ topicId: string; resources: TopicResource[] }> =>
  apiCall(`/school/curriculum-topics/${topicId}/resources`);

export const addTopicResource = (
  topicId: string,
  body: {
    kind: TopicResourceKind;
    label: string;
    /** External URL (link/video resources) OR — for files — the storage
     *  path the upload-url endpoint returned. When `storagePath` is set,
     *  `url` is ignored by the server. */
    url?: string;
    storagePath?: string;
    mimeType?: string;
    description?: string;
    sortOrder?: number;
  },
): Promise<{ resource: TopicResource }> =>
  apiCall(`/school/curriculum-topics/${topicId}/resources`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Step 1 of the 2-step file upload flow — ask the server to mint a
 *  signed Supabase Storage upload URL. Client PUTs the file bytes
 *  directly to that URL (NOT through the edge function), then POSTs the
 *  metadata via addTopicResource with the returned storagePath. */
export const getTopicResourceUploadUrl = (
  topicId: string,
  body: { fileName: string; mimeType: string },
): Promise<{
  uploadUrl: string;
  token: string;
  storagePath: string;
  maxBytes: number;
}> =>
  apiCall(`/school/curriculum-topics/${topicId}/resources/upload-url`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Mint a short-lived (5 min) signed URL to view/download a file
 *  resource. Re-checks org membership on the server, so revoking a
 *  user's role takes effect on the next click. */
export const getTopicResourceSignedUrl = (
  resourceId: string,
): Promise<{ url: string; expiresInSeconds: number; mimeType: string | null }> =>
  apiCall(`/school/topic-resources/${resourceId}/signed-url`);

export const updateTopicResource = (
  resourceId: string,
  body: Partial<{
    kind: TopicResourceKind;
    label: string;
    url: string;
    description: string | null;
    sortOrder: number;
  }>,
): Promise<{ resource: TopicResource }> =>
  apiCall(`/school/topic-resources/${resourceId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteTopicResource = (
  resourceId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/topic-resources/${resourceId}`, { method: "DELETE" });

// --- Section-level (read for all; teacher PATCH for admins) ------------------
export const listSectionSubjects = (
  sectionId: string,
): Promise<{ sectionId: string; subjects: SectionSubject[] }> =>
  apiCall(`/school/sections/${sectionId}/subjects`);

export const setSectionSubjectTeacher = (
  sectionSubjectId: string,
  teacherUserId: string | null,
): Promise<{ sectionSubject: unknown }> =>
  apiCall(`/school/section-subjects/${sectionSubjectId}`, {
    method: "PATCH",
    body: JSON.stringify({ teacherUserId }),
  });

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

// ─── Phase 6a: academic aggregates (curriculum + resources + hygiene) ───

export interface AcademicsResponse {
  curriculum: {
    totalTopics: number;
    completedTopics: number;
    progressPct: number;
    subjectCount: number;
  };
  resources: {
    totalResources: number;
    byKind: Record<"pdf" | "video" | "worksheet" | "link" | "quiz", number>;
  };
  hygiene: {
    untaggedLessonsLast30: number;
    untaggedAssignmentsLast30: number;
  };
  subjectsAtRisk: Array<{
    sectionSubjectId: string | null;
    classSectionId: string;
    className: string;
    sectionName: string;
    subjectName: string;
    gradedCount: number;
    avgPct: number;
  }>;
  topSubjects: Array<{
    sectionSubjectId: string | null;
    classSectionId: string;
    className: string;
    sectionName: string;
    subjectName: string;
    gradedCount: number;
    avgPct: number;
  }>;
}

export const getOrgAcademics = (orgId: string): Promise<AcademicsResponse> =>
  apiCall(`/school/orgs/${orgId}/academics`);

// ─── Phase 6c: office staff snapshot ───────────────────────────────────

export interface OfficeSnapshot {
  rosterRequests: {
    pendingCount: number;
    recent: Array<{
      id: string;
      kind: string;
      reason: string | null;
      createdAt: string;
      className: string | null;
      sectionName: string | null;
    }>;
  };
  missingParents: {
    count: number;
    recent: Array<{
      studentId: string;
      fullName: string;
      grNumber: string | null;
      className: string | null;
      sectionName: string | null;
    }>;
  };
  attendanceGaps: {
    count: number;
    recent: Array<{
      sectionId: string;
      className: string | null;
      sectionName: string;
    }>;
  };
  pendingInvitesCount: number;
  studentCount: number;
}

export const getOfficeSnapshot = (orgId: string): Promise<OfficeSnapshot> =>
  apiCall(`/school/orgs/${orgId}/office-snapshot`);

// ─── Phase 6d: finance staff snapshot ──────────────────────────────────

export interface FinanceSnapshot {
  period: string;
  collection: {
    dueTotal: number;
    paidTotal: number;
    collectionPct: number;
    paidCount: number;
    unpaidCount: number;
    partialCount: number;
    waivedCount: number;
    studentCount: number;
  };
  overdue: {
    countAnyPeriod: number;
    thisPeriodCount: number;
    recent: Array<{
      feeStatusId: string;
      studentId: string;
      studentName: string;
      grNumber: string | null;
      className: string | null;
      sectionName: string | null;
      amountDue: number;
      amountPaid: number;
      remaining: number;
      dueDate: string | null;
    }>;
  };
  recentPayments: Array<{
    feeStatusId: string;
    studentId: string;
    studentName: string;
    grNumber: string | null;
    period: string;
    amountPaid: number;
    paidDate: string;
  }>;
}

export const getFinanceSnapshot = (
  orgId: string,
  opts: { period?: string } = {},
): Promise<FinanceSnapshot> => {
  const q = new URLSearchParams();
  if (opts.period) q.append("period", opts.period);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/finance-snapshot${qs}`);
};

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
  /** PR feat/hifz-trends-missed-teacher — dedicated Hifz teacher,
   *  distinct from the academic class teacher. Hifz schools commonly
   *  run two teachers per section; this column lets us model that
   *  cleanly. Null = no separate Hifz teacher assigned. */
  hifz_teacher_user_id?: string | null;
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
  body: {
    name: string;
    classTeacherUserId?: string;
    hifzTeacherUserId?: string;
  },
): Promise<AdminSection> =>
  apiCall(`/school/orgs/${orgId}/classes/${classId}/sections`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateSection = (
  orgId: string,
  sectionId: string,
  partial: Partial<{
    name: string;
    classTeacherUserId: string | null;
    hifzTeacherUserId: string | null;
  }>,
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
  /** Children linked to this parent (from student_parent). Empty array if
   *  none. Each entry includes the section id so the UI can show class. */
  children?: Array<{
    id: string;
    full_name: string;
    gr_number: string | null;
    class_section_id: string | null;
    isPrimary: boolean;
  }>;
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

export const getStudent = async (
  orgId: string,
  studentId: string,
): Promise<StudentWithParents> => {
  // Backend returns { student: AdminStudent, parents: [...] } — flatten so
  // consumers get the StudentWithParents flat shape they're typed for.
  // Without this, student.full_name was undefined → charAt crash in
  // StudentDetail.
  const r = await apiCall<{
    student: AdminStudent;
    parents: Array<AdminParent & { is_primary: boolean }>;
  }>(`/school/orgs/${orgId}/students/${studentId}`);
  return { ...r.student, parents: r.parents ?? [] };
};

/** Optional inline parent block — when present, backend creates (or
 *  reuses by email/phone) a parent in this org and links them to the
 *  new student with is_primary=true. fullName is required when ANY
 *  field is set. */
export interface InlineParentInput {
  fullName: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

/** Per-guardian payload for the redesigned Add Student flow. Mirrors
 *  the IFS admission form's Family Information table (father / mother /
 *  guardian as columns). Each guardian becomes a (parent row,
 *  student_parent link) pair. Per-link role flags live on the link so
 *  the same person can have different roles across siblings. */
export interface GuardianInput {
  parentRole?:
    | "father" | "mother" | "guardian"
    | "step_father" | "step_mother"
    | "grandparent" | "sibling" | "sponsor" | "other";
  fullName: string;
  title?: "Mr." | "Mrs." | "Ms." | "Dr." | "";
  nic?: string;
  homeAddress?: string;
  homePhone?: string;
  cellPhone?: string;
  email?: string;
  occupation?: string;
  employer?: string;
  employerAddress?: string;
  businessPhone?: string;
  isPrimaryContact?: boolean;
  isEmergencyContact?: boolean;
  isFeePayer?: boolean;
  isPickupAuthorized?: boolean;
  portalAccessPhone?: string;
}

export interface SiblingInput {
  name: string;
  age?: number;
  gender?: "male" | "female" | "";
  currentSchool?: string;
  grade?: string;
}

export interface AdmissionChecklistInput {
  reportCardReceived?: boolean;
  photosReceived?: boolean;
  fatherIdReceived?: boolean;
  birthCertReceived?: boolean;
  declarationSignedByName?: string;
}

export type StudentCompletenessStatus =
  | "complete"
  | "guardians_pending"
  | "documents_pending"
  | "fees_pending";

export interface CreateStudentBody {
  grNumber: string;
  fullName: string;
  classSectionId?: string;
  photoUrl?: string;
  dateOfBirth?: string;
  gender?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  /** 'hifz' | 'conventional' — gates program-targeted announcements and
   *  surfaces in the section dashboards. */
  program?: "hifz" | "conventional" | "";
  // IFS admission-form fields (PR feat/student-parent-onboarding-redesign).
  registrationNo?: string;
  applyingForGrade?: string;
  academicTerm?: string;
  religion?: string;
  nationality?: string;
  homeLanguage?: string;
  lastSchool?: string;
  lastClassStudying?: string;
  lastClassCompleted?: string;
  wasSuspended?: boolean;
  suspensionDetails?: string;
  medicalConditions?: string;
  psychologicalConditions?: string;
  bloodGroup?: string;
  referralSource?: string;
  reasonsForApplying?: string;
  availTransport?: boolean;
  studentGmail?: string;
  feeSubmittedTotal?: number;
  receiptNo?: string;
  admissionDate?: string;
  completenessStatus?: StudentCompletenessStatus;
  /** PR feat/hifz-groups — student belongs to one Hifz group at a time
   *  (peer of the class section, not a child of it). Optional. */
  hifzGroupId?: string | null;
  /** Legacy single-parent shape — still accepted by the backend. New
   *  flows should use `guardians[]` instead. */
  parent?: InlineParentInput;
  /** Preferred new shape: zero, one, or many guardians attached to the
   *  student. Each becomes a parent row + a student_parent link with
   *  per-kid role flags. Same person across siblings = single parent
   *  row reused. */
  guardians?: GuardianInput[];
  siblings?: SiblingInput[];
  checklist?: AdmissionChecklistInput;
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

/** PR F (Q5): visiting_teacher REQUIRES validFrom + validUntil (the contract
 *  window). Other roles can pass them optionally to set an automatic expiry,
 *  e.g. for substitute teachers or interns. Format YYYY-MM-DD. */
export const addTeacher = (
  orgId: string,
  body: {
    email: string;
    fullName: string;
    roleTemplate: RoleTemplate;
    validFrom?: string | null;
    validUntil?: string | null;
  },
): Promise<AddTeacherResponse> =>
  apiCall(`/school/orgs/${orgId}/teachers`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Response from POST /admins — same idea as AddTeacherResponse. */
export type AddAdminResponse = OrgAdmin & { invitedCount?: number };

// Detail shape for a single staff member — returned by GET /teachers/:userId
// and rendered on TeacherDetail.tsx. Each row in `assignments` is one
// active user_roles row for this user scoped to this org. UI groups them
// by role / section to give the admin a clear view of "what does this
// staff member actually do here."
export interface TeacherAssignment {
  id: string;
  roleType: RoleTemplate | "teacher";
  scopeType: "organization" | "class";
  scopeId: string;
  sectionName: string | null;
  className: string | null;
  grantedBy: string | null;
  grantedByName: string | null;
  grantedAt: string;
  validFrom: string | null;
  validUntil: string | null;
}
export interface TeacherDetail {
  userId: string;
  email: string;
  fullName: string;
  primaryRole: RoleTemplate | "teacher";
  assignments: TeacherAssignment[];
}
export const getTeacherDetail = (
  orgId: string,
  userId: string,
): Promise<TeacherDetail> =>
  apiCall(`/school/orgs/${orgId}/teachers/${userId}`);

/** Revoke ALL staff-role rows for this user in this org. Does not touch
 *  auth.users (the person can still sign in for family / other-school
 *  use). Principal/admin only. */
export const deleteTeacher = (orgId: string, userId: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/teachers/${userId}`, { method: "DELETE" });

export const bulkCreateTeachers = (
  orgId: string,
  rows: Array<{ email: string; fullName: string; roleTemplate: RoleTemplate }>,
): Promise<BulkResult> =>
  apiCall(`/school/orgs/${orgId}/teachers/bulk`, {
    method: "POST",
    body: JSON.stringify({ rows }),
  });

// ─── Bulk importers (PR feat/import-center-hub) ─────────────────────────
// 4 importers for the Import Center. All share the same partial-success
// contract: response.errors flags any rows that failed; valid rows still
// get inserted. Backend returns rowIndex; we normalize to `row` so the
// CsvUploadDialog (which expects { row }) renders consistently.

/** Normalize the backend's {rowIndex,message} shape to the dialog's
 *  expected {row,message}. Keeps the dialog code unchanged. */
function normalizeBulkResult(r: any): BulkResult {
  const errs = Array.isArray(r?.errors)
    ? r.errors.map((e: any) => ({
        row: typeof e?.row === "number" ? e.row : (e?.rowIndex ?? 0),
        message: String(e?.message ?? "unknown error"),
      }))
    : [];
  return { inserted: Number(r?.inserted ?? 0), errors: errs };
}

export const bulkCreateClasses = async (
  orgId: string,
  rows: Array<{ name: string; displayOrder?: number }>,
): Promise<BulkResult> =>
  normalizeBulkResult(
    await apiCall(`/school/orgs/${orgId}/classes/bulk`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  );

export const bulkCreateSections = async (
  orgId: string,
  rows: Array<{ className: string; sectionName: string }>,
): Promise<BulkResult> =>
  normalizeBulkResult(
    await apiCall(`/school/orgs/${orgId}/sections/bulk`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  );

export const bulkCreateClassSubjects = async (
  orgId: string,
  rows: Array<{ className: string; subjectName: string; sortOrder?: number }>,
): Promise<BulkResult> =>
  normalizeBulkResult(
    await apiCall(`/school/orgs/${orgId}/class-subjects/bulk`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  );

export interface BulkHifzRow {
  grNumber: string;
  recordedAt?: string;
  kind: HifzKind;
  surahNumber: number;
  ayahFrom: number;
  ayahTo: number;
  quality?: HifzQuality;
  notes?: string;
  mistakesCount?: number;
  juzNumber?: number;
  pageNumber?: number;
  missed?: boolean;
}

export const bulkCreateHifzProgress = async (
  orgId: string,
  rows: BulkHifzRow[],
): Promise<BulkResult> =>
  normalizeBulkResult(
    await apiCall(`/school/orgs/${orgId}/hifz-progress/bulk`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  );

export interface BulkFeeRow {
  grNumber: string;
  period: string;
  amountDue?: number | string;
  amountPaid?: number | string;
  status?: "unpaid" | "paid" | "partial" | "waived";
  dueDate?: string;
  paidDate?: string;
  notes?: string;
}

export const bulkCreateFees = async (
  orgId: string,
  rows: BulkFeeRow[],
): Promise<BulkResult> =>
  normalizeBulkResult(
    await apiCall(`/school/orgs/${orgId}/fees/bulk`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  );

export interface BulkAttendanceRow {
  grNumber: string;
  date: string;
  status: "present" | "absent" | "late" | "excused";
  notes?: string;
}

export const bulkCreateAttendance = async (
  orgId: string,
  rows: BulkAttendanceRow[],
): Promise<BulkResult> =>
  normalizeBulkResult(
    await apiCall(`/school/orgs/${orgId}/attendance/bulk`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  );

// ─── Import batches (rollback) — PR feat/import-rollback ────────────────
export interface ImportBatch {
  id: string;
  entityType:
    | "classes" | "sections" | "subjects" | "students"
    | "parents" | "teachers" | "hifz" | "fees" | "attendance";
  rowCount: number;
  createdAt: string;
  createdByName: string | null;
  rolledBackAt: string | null;
  rolledBackByName: string | null;
  notes: string | null;
}

export const listImportBatches = async (
  orgId: string,
): Promise<ImportBatch[]> => {
  const r = await apiCall<{ batches: ImportBatch[] }>(
    `/school/orgs/${orgId}/import-batches`,
  );
  return r?.batches ?? [];
};

export const rollbackImportBatch = (
  orgId: string,
  batchId: string,
): Promise<{ ok: true; removed: Record<string, number> }> =>
  apiCall(`/school/orgs/${orgId}/import-batches/${batchId}/rollback`, {
    method: "POST",
  });

// ─── Hifz Groups (PR feat/hifz-groups) ──────────────────────────────────
export interface HifzGroup {
  id: string;
  name: string;
  description: string | null;
  hifzTeacherUserId: string | null;
  hifzTeacherName: string | null;
  displayOrder: number;
  studentCount: number;
}

export const listHifzGroups = async (orgId: string): Promise<HifzGroup[]> => {
  const r = await apiCall<{ groups: HifzGroup[] }>(
    `/school/orgs/${orgId}/hifz-groups`,
  );
  return r?.groups ?? [];
};

export const createHifzGroup = (
  orgId: string,
  body: {
    name: string;
    description?: string;
    hifzTeacherUserId?: string;
    displayOrder?: number;
  },
): Promise<{ id: string; name: string }> =>
  apiCall(`/school/orgs/${orgId}/hifz-groups`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateHifzGroup = (
  orgId: string,
  groupId: string,
  partial: Partial<{
    name: string;
    description: string | null;
    hifzTeacherUserId: string | null;
    displayOrder: number;
  }>,
): Promise<HifzGroup> =>
  apiCall(`/school/orgs/${orgId}/hifz-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteHifzGroup = (
  orgId: string,
  groupId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/hifz-groups/${groupId}`, { method: "DELETE" });

// ─── Timetable (PR feat/timetable-foundation) ──────────────────────────
export type TimetableSlotKind =
  | "academic" | "break" | "prayer" | "hifz" | "assembly" | "other";

export interface TimetableSlot {
  id: string;
  orgId: string;
  name: string;
  /** ISO day of week: 1 = Monday … 7 = Sunday. */
  dayOfWeek: number;
  startTime: string;  // HH:MM
  endTime: string;
  kind: TimetableSlotKind;
  displayOrder: number;
}

export interface TimetableEntry {
  id: string;
  orgId: string;
  slotId: string;
  scopeSectionId: string | null;
  scopeHifzGroupId: string | null;
  sectionSubjectId: string | null;
  teacherUserId: string | null;
  room: string | null;
  notes: string | null;
}

export interface TimetableWeekCell {
  slot: TimetableSlot;
  entry: (TimetableEntry & { subjectName: string | null; teacherName: string | null }) | null;
}

export const listTimetableSlots = async (orgId: string): Promise<TimetableSlot[]> => {
  const r = await apiCall<{ slots: TimetableSlot[] }>(`/school/orgs/${orgId}/timetable-slots`);
  return r?.slots ?? [];
};

export const createTimetableSlot = (
  orgId: string,
  body: {
    name: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    kind?: TimetableSlotKind;
    displayOrder?: number;
  },
): Promise<TimetableSlot> =>
  apiCall(`/school/orgs/${orgId}/timetable-slots`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateTimetableSlot = (
  orgId: string,
  slotId: string,
  partial: Partial<{
    name: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    kind: TimetableSlotKind;
    displayOrder: number;
  }>,
): Promise<TimetableSlot> =>
  apiCall(`/school/orgs/${orgId}/timetable-slots/${slotId}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const deleteTimetableSlot = (orgId: string, slotId: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/timetable-slots/${slotId}`, { method: "DELETE" });

/** Returned in the 409 body when a room double-book is detected. The
 *  editor surfaces these inline and offers a "Save anyway" override. */
export interface RoomConflictEntry {
  entryId: string;
  room: string | null;
  slotName: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  subjectName: string | null;
  scopeLabel: string;
}
export interface RoomConflictError {
  error: "room conflict";
  conflicts: RoomConflictEntry[];
}
/** Pulls the conflict payload off an Error thrown by apiCall (the 409
 *  body is attached as `.body`). Returns null for any other error. */
export function getRoomConflictPayload(e: unknown): RoomConflictError | null {
  if (!e || typeof e !== "object") return null;
  const body = (e as any).body;
  if (body && body.error === "room conflict" && Array.isArray(body.conflicts)) {
    return body as RoomConflictError;
  }
  return null;
}

export const createTimetableEntry = (
  orgId: string,
  body: {
    slotId: string;
    scopeSectionId?: string;
    scopeHifzGroupId?: string;
    sectionSubjectId?: string;
    teacherUserId?: string;
    room?: string;
    notes?: string;
  },
  opts: { force?: boolean } = {},
): Promise<TimetableEntry> =>
  apiCall(`/school/orgs/${orgId}/timetable-entries${opts.force ? "?force=true" : ""}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateTimetableEntry = (
  orgId: string,
  entryId: string,
  partial: Partial<{
    sectionSubjectId: string | null;
    teacherUserId: string | null;
    room: string | null;
    notes: string | null;
  }>,
  opts: { force?: boolean } = {},
): Promise<TimetableEntry> =>
  apiCall(`/school/orgs/${orgId}/timetable-entries/${entryId}${opts.force ? "?force=true" : ""}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export interface RoomConflictPair {
  room: string;
  dayOfWeek: number;
  a: RoomConflictEntry;
  b: RoomConflictEntry;
}
export const listRoomConflicts = (
  orgId: string,
): Promise<{ conflicts: RoomConflictPair[] }> =>
  apiCall(`/school/orgs/${orgId}/timetable/room-conflicts`);

/** 409 body when the same teacher is double-booked across overlapping slots. */
export interface TeacherConflictError {
  error: "teacher conflict";
  teacherName: string | null;
  conflicts: RoomConflictEntry[]; // same entry shape as room conflicts
}
export function getTeacherConflictPayload(e: unknown): TeacherConflictError | null {
  if (!e || typeof e !== "object") return null;
  const body = (e as any).body;
  if (body && body.error === "teacher conflict" && Array.isArray(body.conflicts)) {
    return body as TeacherConflictError;
  }
  return null;
}
export interface TeacherConflictPair {
  teacherUserId: string;
  teacherName: string | null;
  dayOfWeek: number;
  a: RoomConflictEntry;
  b: RoomConflictEntry;
}
export const listTeacherConflicts = (
  orgId: string,
): Promise<{ conflicts: TeacherConflictPair[] }> =>
  apiCall(`/school/orgs/${orgId}/timetable/teacher-conflicts`);

export const deleteTimetableEntry = (orgId: string, entryId: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/timetable-entries/${entryId}`, { method: "DELETE" });

export const getSectionTimetable = (
  orgId: string,
  sectionId: string,
): Promise<{ scope: { kind: "section"; id: string }; cells: TimetableWeekCell[] }> =>
  apiCall(`/school/orgs/${orgId}/sections/${sectionId}/timetable`);

export const getHifzGroupTimetable = (
  orgId: string,
  groupId: string,
): Promise<{ scope: { kind: "hifz_group"; id: string }; cells: TimetableWeekCell[] }> =>
  apiCall(`/school/orgs/${orgId}/hifz-groups/${groupId}/timetable`);

/** Teacher's own entries. Used on TeacherHome to render "My today's
 *  schedule". scopeLabel is pre-built ("Grade 3 — A" / Hifz group
 *  name) so the card doesn't need a separate lookup. */
export interface TimetableSubBadge {
  /** "covering" — caller is the substitute for someone else's slot.
   *  "covered" — caller is the original teacher, someone else covers today. */
  role: "covering" | "covered";
  originalTeacherName?: string | null;
  substituteTeacherName?: string | null;
  reason?: string | null;
}

export interface MyTimetableCell {
  slot: TimetableSlot;
  entry: TimetableEntry & { subjectName: string | null; teacherName: string | null };
  scopeLabel: string;
  /** Populated only when the slot's entry has a substitution for today. */
  substitution?: TimetableSubBadge | null;
}

export const getMyTeacherTimetable = (
  orgId: string,
  opts: { day?: number; date?: string } = {},
): Promise<{ cells: MyTimetableCell[] }> => {
  const params: string[] = [];
  if (opts.day) params.push(`day=${opts.day}`);
  if (opts.date) params.push(`date=${opts.date}`);
  const q = params.length ? `?${params.join("&")}` : "";
  return apiCall(`/school/orgs/${orgId}/me/timetable${q}`);
};

export interface TeacherEntrySummary {
  id: string;
  slot: TimetableSlot;
  subjectName: string | null;
  scopeLabel: string;
}
export const listTeacherEntries = (
  orgId: string,
  teacherUserId: string,
): Promise<{ entries: TeacherEntrySummary[] }> =>
  apiCall(`/school/orgs/${orgId}/teachers/${teacherUserId}/entries`);

// ───── Substitutions (admin/principal) ────────────────────────────────
export interface TimetableSubstitution {
  id: string;
  orgId: string;
  entryId: string;
  date: string;
  substituteTeacherUserId: string;
  substituteTeacherName: string | null;
  reason: string | null;
  createdAt: string;
  entry: {
    id: string;
    slot: TimetableSlot | null;
    subjectName: string | null;
    originalTeacherUserId: string | null;
    originalTeacherName: string | null;
    scopeLabel: string;
  } | null;
}

export const listTimetableSubstitutions = (
  orgId: string,
  opts: { date?: string; from?: string; to?: string } = {},
): Promise<{ substitutions: TimetableSubstitution[] }> => {
  const params: string[] = [];
  if (opts.date) params.push(`date=${opts.date}`);
  if (opts.from) params.push(`from=${opts.from}`);
  if (opts.to) params.push(`to=${opts.to}`);
  const q = params.length ? `?${params.join("&")}` : "";
  return apiCall(`/school/orgs/${orgId}/timetable/substitutions${q}`);
};

export const createTimetableSubstitution = (
  orgId: string,
  input: { entryId: string; date: string; substituteTeacherUserId: string; reason?: string },
): Promise<{ substitution: TimetableSubstitution }> =>
  apiCall(`/school/orgs/${orgId}/timetable/substitutions`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const deleteTimetableSubstitution = (
  orgId: string,
  subId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/timetable/substitutions/${subId}`, { method: "DELETE" });

// ───── Fee plan templates (PR feat/fee-plans) ─────────────────────────
export interface ClassFeePlan {
  id: string;
  orgId: string;
  classId: string;
  name: string;
  amount: number;
  frequency: "monthly" | "one_off";
  defaultDueDay: number | null;
  oneOffDueDate: string | null;
  archivedAt: string | null;
}
export interface StudentFeeOverride {
  id: string;
  planId: string;
  studentId: string;
  overrideAmount: number | null;
  waived: boolean;
  notes: string | null;
  createdAt: string;
}
export interface EffectiveStudentPlan {
  plan: ClassFeePlan;
  override: StudentFeeOverride | null;
  effectiveAmount: number;
}

export const listClassFeePlans = (
  orgId: string,
  classId: string,
): Promise<{ plans: ClassFeePlan[] }> =>
  apiCall(`/school/orgs/${orgId}/classes/${classId}/fee-plans`);

export const createClassFeePlan = (
  orgId: string,
  classId: string,
  body: {
    name: string;
    amount: number;
    frequency: "monthly" | "one_off";
    defaultDueDay?: number | null;
    oneOffDueDate?: string | null;
  },
): Promise<{ plan: ClassFeePlan }> =>
  apiCall(`/school/orgs/${orgId}/classes/${classId}/fee-plans`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateClassFeePlan = (
  orgId: string,
  planId: string,
  patch: Partial<{
    name: string;
    amount: number;
    defaultDueDay: number | null;
    oneOffDueDate: string | null;
  }>,
): Promise<{ plan: ClassFeePlan }> =>
  apiCall(`/school/orgs/${orgId}/fee-plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const archiveClassFeePlan = (
  orgId: string,
  planId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/fee-plans/${planId}`, { method: "DELETE" });

export interface BulkFeeGenerateResult {
  created: number;
  updated: number;
  skipped: number;
  waived: number;
  total: number;
  dryRun?: boolean;
  message?: string;
  sample?: Array<Record<string, unknown>>;
}
export const bulkGenerateFees = (
  orgId: string,
  body: { period: string; classIds?: string[]; dryRun?: boolean },
): Promise<BulkFeeGenerateResult> =>
  apiCall(`/school/orgs/${orgId}/fees/bulk-generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const listStudentFeeOverrides = (
  orgId: string,
  studentId: string,
): Promise<{ plans: EffectiveStudentPlan[] }> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/fee-overrides`);

export const upsertStudentFeeOverride = (
  orgId: string,
  studentId: string,
  planId: string,
  body: { overrideAmount?: number | null; waived?: boolean; notes?: string | null },
): Promise<{ override: StudentFeeOverride }> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/fee-overrides/${planId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deleteStudentFeeOverride = (
  orgId: string,
  studentId: string,
  planId: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/fee-overrides/${planId}`, {
    method: "DELETE",
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

/** Resend the password-reset (invite) email to a staff member of this org.
 *
 * Returns { ok, sent, reason?, email? }. `sent: false` is NOT an HTTP error —
 * Supabase's email validator may reject some addresses (e.g. test addresses
 * like ddd@gmail.com) while still confirming the user/role exist. UI should
 * surface the `reason` and offer the principal a way to share the reset link
 * manually. */
export interface ResendInviteResponse {
  ok: true;
  sent: boolean;
  reason?: string;
  email?: string;
}

export const resendInvite = (orgId: string, userId: string): Promise<ResendInviteResponse> =>
  apiCall(`/school/orgs/${orgId}/staff/${userId}/resend-invite`, { method: "POST" });

/** Soft-delete the school (principal only).
 *
 * `confirmName` must match `organizations.name` exactly. On success the org is
 * scheduled for hard-delete 30 days later; the workspace disappears from
 * everyone's switcher immediately. Contact support during the grace window to
 * restore. */
export interface DeleteSchoolResponse {
  ok: true;
  deletedAt: string;
  purgeAfter: string;
  message: string;
}

export const deleteSchool = (orgId: string, confirmName: string): Promise<DeleteSchoolResponse> =>
  apiCall(`/school/orgs/${orgId}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmName }),
  });

/** Self-remove from this school. Available to any staff role EXCEPT principal
 *  (principal must transfer ownership or delete the school instead).
 *  Revokes role rows only; the user's account is untouched. */
export interface LeaveSchoolResponse {
  ok: true;
  revokedRoles: string[];
  message: string;
}

export const leaveSchool = (orgId: string): Promise<LeaveSchoolResponse> =>
  apiCall(`/school/orgs/${orgId}/staff/me`, { method: "DELETE" });

/** Transfer principal role to another user (PR I). Caller must be the
 *  current principal. confirmName must match the org name exactly. After
 *  success, the caller is demoted to admin so they don't lose access. */
export interface TransferOwnershipResponse {
  ok: true;
  newPrincipalUserId: string;
  yourNewRole: "admin";
  message: string;
}

export const transferOwnership = (
  orgId: string,
  body: { targetUserId: string; confirmName: string },
): Promise<TransferOwnershipResponse> =>
  apiCall(`/school/orgs/${orgId}/transfer-ownership`, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Invite & staff-change audit entries. Append-only, principal/admin only. */
export interface AuditEntry {
  id: string;
  org_id: string;
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  target_role: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const listAuditLog = async (
  orgId: string,
  limit = 200,
): Promise<AuditEntry[]> => {
  const r = await apiCall<{ entries: AuditEntry[] }>(
    `/school/orgs/${orgId}/audit?limit=${limit}`,
  );
  return r?.entries ?? [];
};

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

/** Student/parent self-service: change their OWN PIN.
 *  Requires the existing PIN (anti-takeover guard). Returns 401 on mismatch.
 *  PR D #8. */
export const changeOwnPin = (
  orgId: string,
  body: { subjectType: PinSubjectType; subjectId: string; oldPin: string; newPin: string },
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/pin/change`, {
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

export type SchoolViewerRole =
  | "principal"
  | "admin"
  | "class_teacher"
  | "visiting_teacher"
  | "hifz_teacher"
  | "office_staff"
  | "financial_staff"
  | "other";

/**
 * Pick the single role used to drive role-aware UI (nav items, dashboard
 * variant). Principal beats admin beats teacher beats staff. If the
 * user has no recognised role in this org, returns "other".
 */
export function viewerRoleForOrg(
  me: SchoolMeResponse | null,
  orgId: string,
): SchoolViewerRole {
  if (!me) return "other";
  if (isOrgPrincipal(me, orgId)) return "principal";
  const orgRoles = me.roles
    .filter((r) => r.scope_type === "organization" && r.scope_id === orgId)
    .map((r) => r.role_type as string);
  if (orgRoles.includes("admin")) return "admin";
  if (orgRoles.includes("office_staff")) return "office_staff";
  if (orgRoles.includes("financial_staff")) return "financial_staff";
  // class_teacher / visiting_teacher may be granted with scope_type
  // "organization" (the seed does this — they're org-scoped roles whose
  // actual section assignments live in class_section.class_teacher_user_id
  // and are resolved server-side by determineScope) OR scope_type "class"
  // (older seeds / hand-granted visiting teachers). Check both.
  if (orgRoles.includes("class_teacher")) return "class_teacher";
  if (orgRoles.includes("visiting_teacher")) return "visiting_teacher";
  const classRoles = me.roles
    .filter((r) => r.scope_type === "class")
    .map((r) => r.role_type as string);
  if (classRoles.includes("class_teacher")) return "class_teacher";
  if (classRoles.includes("visiting_teacher")) return "visiting_teacher";
  // Synthesized at /school/me from class_section.hifz_teacher_user_id
  // (PR feat/hifz-teacher-section-listing). A teacher attached ONLY via
  // the Hifz column resolves to this role; the per-role landing routes
  // them to TeacherHome with their Hifz sections.
  if (orgRoles.includes("hifz_teacher") || classRoles.includes("hifz_teacher")) {
    return "hifz_teacher";
  }
  // Org-scoped teacher (rare; treat as principal-lite)
  if (orgRoles.includes("teacher")) return "admin";
  return "other";
}

/**
 * True when the user has class-teacher or visiting-teacher access in this
 * org but is NOT a principal, admin, or org-scoped teacher. Used by the
 * /school/orgs/:orgId index route to swap the principal-flavoured
 * PerformanceDashboard for a teacher-scoped TeacherHome.
 */
export function isSectionTeacherOnly(
  me: SchoolMeResponse | null,
  orgId: string,
): boolean {
  if (!me) return false;
  if (isOrgPrincipal(me, orgId)) return false;
  if (isOrgAdmin(me, orgId)) return false;
  // Org-scoped teacher = full-org view (treated like staff lead, not a
  // single-section teacher). Keep them on the principal dashboard.
  const hasOrgTeacher = me.roles.some(
    (r) =>
      r.role_type === "teacher" &&
      r.scope_type === "organization" &&
      r.scope_id === orgId,
  );
  if (hasOrgTeacher) return false;
  // class_teacher / visiting_teacher rows can be scope_type "organization"
  // (seed default) or "class" (legacy). Either qualifies — the backend's
  // determineScope() resolves the actual section assignments.
  return me.roles.some(
    (r) =>
      r.role_type === "class_teacher" || r.role_type === "visiting_teacher",
  );
}

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

// ─── Report card ────────────────────────────────────────────────────────
// Single round-trip aggregator the printable Student Report Card page
// renders. Optional date window scopes attendance / behavior / grades /
// Hifz to a term. Missing dates → all-time.

export interface ReportCardSubject {
  name: string;
  /** 0..100, or null if the subject has no graded items in the window. */
  averagePct: number | null;
}

export interface ReportCardResponse {
  school: {
    name: string;
    slug: string | null;
    logoUrl: string | null;
    motto: string | null;
    themeColor: string | null;
    address: string | null;
  };
  student: {
    id: string;
    fullName: string;
    grNumber: string;
    dateOfBirth: string | null;
    gender: string | null;
    photoUrl: string | null;
    program: string | null;
    religion: string | null;
    nationality: string | null;
  };
  placement: {
    className: string | null;
    sectionName: string | null;
    classTeacherName: string | null;
    hifzTeacherName: string | null;
  };
  period: { startDate: string | null; endDate: string | null };
  academic: {
    subjects: ReportCardSubject[];
    overallAveragePct: number | null;
  };
  attendance: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    total: number;
    attendancePct: number | null;
  };
  behavior: {
    positive: number;
    concern: number;
    netPoints: number;
  };
  hifz: {
    ayahsMemorized: number;
    surahsCompleted: number;
    totalEntries: number;
    missedCount: number;
    qualityCounts: {
      excellent: number;
      good: number;
      needs_practice: number;
      weak: number;
    };
  };
}

export const getReportCard = (
  orgId: string,
  studentId: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<ReportCardResponse> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  const qs = q.toString() ? `?${q}` : "";
  return apiCall(`/school/orgs/${orgId}/students/${studentId}/report-card${qs}`);
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
  /** Phase 2: which subject in the section this lesson belongs to. */
  sectionSubjectId: string | null;
  /** Phase 2: which curriculum topic the teacher attributed the lesson to. */
  curriculumTopicId: string | null;
  /** Denormalised — populated by list endpoints, may be undefined on single-fetch. */
  subjectName?: string | null;
  /** Denormalised — populated by list endpoints, may be undefined on single-fetch. */
  topicName?: string | null;
  /** Phase 4a: durable resources for this lesson's topic — worksheets,
   *  videos, quizzes the admin attached once on the topic. Hydrated by
   *  the list endpoint alongside the topic name; absent on single-fetch.
   *  Type is kept loose to avoid a forward reference; the values match
   *  TopicResource minus the org/topic/sort metadata. */
  topicResources?: Array<{
    id: string;
    kind: "pdf" | "video" | "worksheet" | "link" | "quiz";
    label: string;
    url: string;
  }>;
  lesson_date: string; // YYYY-MM-DD
  title: string;
  body: string | null;
  video_url: string | null;
  audio_url: string | null;
  attachments: Array<{ label: string; url: string }>;
  taught_by: string | null;
  taught_by_name?: string | null;
  /** Phase 7: explicit publish timestamp. null = auto-publish on lesson_date. */
  publishedAt?: string | null;
  /** Phase 7: convenience flag from staff endpoint — true when a student
   *  would currently see this lesson. */
  isVisibleToStudents?: boolean;
  created_at: string;
  updated_at: string;
}

/** Phase 7: how a lesson appears to students.
 *  - 'now'     publish immediately
 *  - 'on_date' (default for future-dated) auto-publish on lesson_date
 *  - 'hidden'  draft / planning — invisible until edited */
export type LessonVisibility = "now" | "on_date" | "hidden";

export interface LessonInput {
  lessonDate: string; // YYYY-MM-DD
  title: string;
  body?: string;
  videoUrl?: string;
  audioUrl?: string;
  attachments?: Array<{ label: string; url: string }>;
  /** Phase 2: required for new lessons; null clears on PATCH. */
  sectionSubjectId?: string | null;
  /** Phase 2: optional curriculum topic. */
  curriculumTopicId?: string | null;
  /** Phase 2: if true on POST, marks the topic completed alongside the new lesson. */
  markTopicCompleted?: boolean;
  /** Phase 7: visibility mode. Backend computes default if omitted. */
  visibility?: LessonVisibility;
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
  opts: { startDate?: string; endDate?: string; limit?: number; subjectId?: string } = {},
): Promise<{ lessons: Lesson[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.limit) q.append("limit", String(opts.limit));
  if (opts.subjectId) q.append("subjectId", opts.subjectId);
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
  // PR feat/hifz-trends-missed-teacher — explicit "missed sabaq" marker.
  // Trend grid renders these days as red and the summary aggregator
  // excludes them so a missed day doesn't count toward ayahs memorized.
  missed?: boolean;
  // Full-module fields (PR feat/hifz-full-module). Backend returns
  // camelCase keys via hifzToJson; legacy rows arrive with null.
  juzNumber?: number | null;
  pageNumber?: number | null;
  mistakesCount?: number | null;
  tajweedNotes?: string | null;
  fluencyNotes?: string | null;
  teacherRemarks?: string | null;
  parentComments?: string | null;
  dailyTarget?: string | null;
  nextTarget?: string | null;
  missedTargetReason?: string | null;
  parentAction?: string | null;
}

export interface HifzEntryInput {
  studentId: string;
  surahNumber: number;
  ayahFrom: number;
  ayahTo: number;
  kind: HifzKind;
  quality?: HifzQuality;
  notes?: string;
  /** When true, the entry is a placeholder for "missed sabaq today" and
   *  isn't counted toward ayahs memorized. Pass any ayahFrom/ayahTo
   *  (the form sends 1/1 by convention). */
  missed?: boolean;
  // Full-module optional fields. Numeric ones server-validates; text
  // ones get trimmed and stored as-is.
  juzNumber?: number;
  pageNumber?: number;
  mistakesCount?: number;
  tajweedNotes?: string;
  fluencyNotes?: string;
  teacherRemarks?: string;
  parentComments?: string;
  dailyTarget?: string;
  nextTarget?: string;
  missedTargetReason?: string;
  parentAction?: string;
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
  /** Phase 3: which subject in the section this assignment belongs to. */
  sectionSubjectId?: string | null;
  /** Phase 3: which curriculum topic the assignment maps to. */
  curriculumTopicId?: string | null;
  /** Denormalised display fields populated by list / detail endpoints. */
  subjectName?: string | null;
  topicName?: string | null;
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
  /** Phase 3: required to make subject/topic visible on the feed; null clears on PATCH. */
  sectionSubjectId?: string | null;
  /** Phase 3: optional curriculum topic. */
  curriculumTopicId?: string | null;
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
  opts: {
    startDate?: string;
    endDate?: string;
    kind?: AssignmentKind;
    limit?: number;
    /** Phase 3: filter to a single subject in this section. */
    subjectId?: string;
  } = {},
): Promise<{ assignments: Assignment[] }> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.kind) q.append("kind", opts.kind);
  if (opts.limit) q.append("limit", String(opts.limit));
  if (opts.subjectId) q.append("subjectId", opts.subjectId);
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
  opts: { startDate?: string; endDate?: string; subjectId?: string } = {},
): Promise<GradebookResponse> => {
  const q = new URLSearchParams();
  if (opts.startDate) q.append("startDate", opts.startDate);
  if (opts.endDate) q.append("endDate", opts.endDate);
  if (opts.subjectId) q.append("subjectId", opts.subjectId);
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
  /** Combined 'Grade X · X-A' label for compact table cells. */
  section_label?: string | null;
  /** Separate class + section names so the table can render two columns. */
  class_name?: string | null;
  section_name?: string | null;
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

// PR feat/announcement-audience-expanded added the second block of
// audience kinds. Backend types are the source of truth:
//   * whole_school   — every role
//   * class_section  — one section's students + parents + teachers
//   * parents_only   — every parent in the org
//   * students_only  — every student in the org
//   * specific_students — explicit student IDs (+ their parents)
//   * staff          — all org staff (teachers + office + finance + admin)
//   * teachers       — class_teacher + visiting_teacher only
//   * class          — every section of one class
//   * program        — students filtered by program ('hifz' / 'conventional')
//   * subject        — students enrolled in a class_subject
export type AnnouncementAudienceKind =
  | "whole_school"
  | "class_section"
  | "parents_only"
  | "students_only"
  | "specific_students"
  | "staff"
  | "teachers"
  | "class"
  | "program"
  | "subject";

export type AnnouncementProgram = "hifz" | "conventional";

export interface Announcement {
  id: string;
  org_id: string;
  author_user_id: string | null;
  author_name?: string | null;
  audience_kind: AnnouncementAudienceKind;
  audience_section_id: string | null;
  audience_student_ids: string[] | null;
  // Expanded audience discriminators (backend returns camelCase keys
  // already — see announcementToJson on the server).
  audienceClassId?: string | null;
  audienceSubjectId?: string | null;
  audienceProgram?: AnnouncementProgram | null;
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
  audienceClassId?: string;
  audienceSubjectId?: string;
  audienceProgram?: AnnouncementProgram;
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

// ───── Assessment (PR feat/assessment-foundation) ─────────────────────
export type ExamType = "midterm" | "final" | "test" | "quiz" | "other";

export interface AcademicTerm {
  id: string;
  orgId: string;
  academicYearId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  archivedAt: string | null;
}
export interface Exam {
  id: string;
  orgId: string;
  termId: string;
  name: string;
  examType: ExamType;
  weight: number;
  examDate: string | null;
  archivedAt: string | null;
}
export interface ExamSubjectScore {
  id: string | null;
  examId: string;
  studentId: string;
  classSubjectId: string;
  maxMarks: number | null;
  obtainedMarks: number | null;
  absent: boolean;
  notes: string | null;
}
export interface MarksSheetStudent {
  id: string;
  fullName: string;
  grNumber: string | null;
  rollNumber: number | null;
  scores: ExamSubjectScore[];
}
export interface MarksSheetResponse {
  section: { id: string; name: string; className: string };
  subjects: { id: string; name: string }[];
  students: MarksSheetStudent[];
}

export const listTerms = (orgId: string): Promise<{ terms: AcademicTerm[] }> =>
  apiCall(`/school/orgs/${orgId}/terms`);
export const createTerm = (
  orgId: string,
  body: { name: string; startDate: string; endDate: string; academicYearId?: string | null; isCurrent?: boolean },
): Promise<{ term: AcademicTerm }> =>
  apiCall(`/school/orgs/${orgId}/terms`, { method: "POST", body: JSON.stringify(body) });
export const updateTerm = (
  orgId: string,
  termId: string,
  patch: Partial<{ name: string; startDate: string; endDate: string; academicYearId: string | null; isCurrent: boolean }>,
): Promise<{ term: AcademicTerm }> =>
  apiCall(`/school/orgs/${orgId}/terms/${termId}`, { method: "PATCH", body: JSON.stringify(patch) });
export const archiveTerm = (orgId: string, termId: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/terms/${termId}`, { method: "DELETE" });

export const listExams = (orgId: string, termId: string): Promise<{ exams: Exam[] }> =>
  apiCall(`/school/orgs/${orgId}/terms/${termId}/exams`);
export const createExam = (
  orgId: string,
  termId: string,
  body: { name: string; examType?: ExamType; weight?: number; examDate?: string | null },
): Promise<{ exam: Exam }> =>
  apiCall(`/school/orgs/${orgId}/terms/${termId}/exams`, {
    method: "POST", body: JSON.stringify(body),
  });
export const updateExam = (
  orgId: string,
  examId: string,
  patch: Partial<{ name: string; examType: ExamType; weight: number; examDate: string | null }>,
): Promise<{ exam: Exam }> =>
  apiCall(`/school/orgs/${orgId}/exams/${examId}`, { method: "PATCH", body: JSON.stringify(patch) });
export const archiveExam = (orgId: string, examId: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/exams/${examId}`, { method: "DELETE" });

export const getMarksSheet = (
  orgId: string,
  examId: string,
  sectionId: string,
): Promise<MarksSheetResponse> =>
  apiCall(`/school/orgs/${orgId}/exams/${examId}/marks-sheet?sectionId=${sectionId}`);

export const saveMarksSheet = (
  orgId: string,
  examId: string,
  body: {
    sectionId: string;
    defaults?: { maxMarks: number };
    rows: Array<{
      studentId: string;
      classSubjectId: string;
      maxMarks?: number | null;
      obtainedMarks?: number | null;
      absent?: boolean;
      notes?: string | null;
    }>;
  },
): Promise<{ ok: true; written: number; deleted: number }> =>
  apiCall(`/school/orgs/${orgId}/exams/${examId}/marks-sheet`, {
    method: "POST", body: JSON.stringify(body),
  });

// ───── Term Report Card v2 (PR feat/report-card-v2) ───────────────────
export interface TermReportCardSubject {
  classSubjectId: string;
  name: string;
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  letter: string;
  remark: string;
  teacherComment: string | null;
  perExam: Array<{ examId: string; examName: string; obtained: number | null; max: number; absent: boolean }>;
}
export interface TermReportCardResponse {
  school: { name: string; slug: string | null; logoUrl: string | null; motto: string | null; themeColor: string | null; address: string | null };
  student: { id: string; fullName: string; grNumber: string; dateOfBirth: string | null; gender: string | null; photoUrl: string | null; program: string | null; religion: string | null; nationality: string | null };
  placement: { className: string | null; sectionName: string | null; classTeacherName: string | null; hifzTeacherName: string | null };
  term: { id: string; name: string; startDate: string; endDate: string };
  exams: Array<{ id: string; name: string; examType: string; weight: number; examDate: string | null }>;
  academic: {
    subjects: TermReportCardSubject[];
    overall: { obtained: number; max: number; percentage: number | null; letter: string; remark: string };
  };
  attendance: { present: number; late: number; absent: number; excused: number; total: number; attendancePct: number | null };
  behavior: { positive: number; concern: number; netPoints: number };
  hifz: { ayahsMemorized: number; surahsCompleted: number; totalEntries: number; missedCount: number; qualityCounts: { excellent: number; good: number; needs_practice: number; weak: number } };
  comments: { classTeacher: string | null; principal: string | null; subjects: Record<string, string> };
  workflow: { recordId: string | null; finalizedAt: string | null; publishedAt: string | null };
}

export const getTermReportCard = (
  orgId: string,
  studentId: string,
  termId: string,
): Promise<TermReportCardResponse> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/terms/${termId}/report-card`);

export const saveReportCardComments = (
  orgId: string,
  studentId: string,
  termId: string,
  body: { classTeacherComment?: string | null; principalComment?: string | null; subjectComments?: Record<string, string> },
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/terms/${termId}/report-card/comments`, {
    method: "PUT", body: JSON.stringify(body),
  });

export const setReportCardWorkflow = (
  orgId: string,
  studentId: string,
  termId: string,
  action: "finalize" | "unfinalize" | "publish" | "unpublish",
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/students/${studentId}/terms/${termId}/report-card/${action}`, {
    method: "POST",
  });

// ───── Grade scales (PR feat/grade-scales) ────────────────────────────
export interface GradeBand {
  id?: string;
  letter: string;
  minPct: number;
  maxPct: number;
  remark: string | null;
  displayOrder?: number;
}
export interface GradeScale {
  id: string;
  name: string;
  isDefault: boolean;
  bands: GradeBand[];
}

export const listGradeScales = (orgId: string): Promise<{ scales: GradeScale[] }> =>
  apiCall(`/school/orgs/${orgId}/grade-scales`);
export const createGradeScale = (
  orgId: string,
  body: { name: string; isDefault?: boolean },
): Promise<{ scale: GradeScale }> =>
  apiCall(`/school/orgs/${orgId}/grade-scales`, { method: "POST", body: JSON.stringify(body) });
export const updateGradeScale = (
  orgId: string,
  scaleId: string,
  patch: Partial<{ name: string; isDefault: boolean }>,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/grade-scales/${scaleId}`, { method: "PATCH", body: JSON.stringify(patch) });
export const archiveGradeScale = (orgId: string, scaleId: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/grade-scales/${scaleId}`, { method: "DELETE" });
export const replaceGradeScaleBands = (
  orgId: string,
  scaleId: string,
  bands: GradeBand[],
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/grade-scales/${scaleId}/bands`, {
    method: "PUT", body: JSON.stringify({ bands }),
  });

// ───── Parent inbox (PR feat/parent-contact-school) ───────────────────
export interface InboxThread {
  threadId: string;
  subject: string;
  studentId: string | null;
  studentName: string | null;
  parentUserId: string;
  parentName: string | null;
  latestBody: string;
  latestSentByRole: "parent" | "school";
  latestAt: string;
  unreadCount: number;
  messageCount: number;
}
export interface InboxMessage {
  id: string;
  threadId: string;
  body: string;
  sentByRole: "parent" | "school";
  sentByName: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface InboxThreadDetail {
  thread: {
    threadId: string;
    subject: string;
    parentUserId: string;
    parentName: string | null;
    studentId: string | null;
    studentName: string | null;
  };
  messages: InboxMessage[];
}

export const listInbox = (orgId: string): Promise<{ threads: InboxThread[] }> =>
  apiCall(`/school/orgs/${orgId}/inbox`);
export const getInboxThread = (orgId: string, threadId: string): Promise<InboxThreadDetail> =>
  apiCall(`/school/orgs/${orgId}/inbox/${threadId}`);
export const replyToInboxThread = (
  orgId: string, threadId: string, body: string,
): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/inbox/${threadId}/reply`, {
    method: "POST", body: JSON.stringify({ body }),
  });
export const getInboxUnreadCount = (orgId: string): Promise<{ unreadCount: number }> =>
  apiCall(`/school/orgs/${orgId}/inbox-unread-count`);

// =============================================================================
// Behavior categories (org-configurable; Islamic-context defaults)
// =============================================================================
export interface BehaviorCategory {
  id: string;
  orgId: string;
  key: string;
  label: string;
  kind: "positive" | "concern" | "both";
  sortOrder: number;
  archivedAt: string | null;
}
export const listBehaviorCategories = (
  orgId: string,
): Promise<{ categories: BehaviorCategory[] }> =>
  apiCall(`/school/orgs/${orgId}/behavior-categories`);

export const createBehaviorCategory = (
  orgId: string,
  body: { label: string; kind: "positive" | "concern" | "both"; key?: string; sortOrder?: number },
): Promise<BehaviorCategory> =>
  apiCall(`/school/orgs/${orgId}/behavior-categories`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateBehaviorCategory = (
  orgId: string,
  id: string,
  patch: Partial<{ label: string; kind: "positive" | "concern" | "both"; sortOrder: number }>,
): Promise<BehaviorCategory> =>
  apiCall(`/school/orgs/${orgId}/behavior-categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const archiveBehaviorCategory = (orgId: string, id: string): Promise<{ ok: true }> =>
  apiCall(`/school/orgs/${orgId}/behavior-categories/${id}`, { method: "DELETE" });

// =============================================================================
// Cmd-K global search
// =============================================================================
export interface SearchStudent {
  id: string; fullName: string; grNumber: string;
  className: string | null; sectionName: string | null;
  path: string;
}
export interface SearchParent {
  id: string; fullName: string; phone: string | null; email: string | null;
  children: Array<{ id: string; fullName: string }>;
  path: string;
}
export interface SearchThread {
  id: string; subject: string;
  studentName: string | null; studentId: string | null;
  lastMessageAt: string | null;
  path: string;
}
export interface SchoolSearchResponse {
  query: string;
  students: SearchStudent[];
  parents: SearchParent[];
  threads: SearchThread[];
}
export const schoolSearch = (
  orgId: string,
  q: string,
  limit: number = 20,
): Promise<SchoolSearchResponse> =>
  apiCall(`/school/orgs/${orgId}/search?q=${encodeURIComponent(q)}&limit=${limit}`);

// =============================================================================
// Year rollover (#9)
// =============================================================================
export type RolloverAction = "promote" | "repeat" | "graduate" | "transferred" | "withdrawn";

export interface RolloverPreviewStudent {
  id: string; fullName: string; grNumber: string;
  currentSection: { id: string; name: string };
}
export interface RolloverPreviewClass {
  class: { id: string; name: string; displayOrder: number };
  nextClass: { id: string; name: string } | null;
  nextSections: Array<{ id: string; name: string }>;
  students: RolloverPreviewStudent[];
}
export interface RolloverPreview { classes: RolloverPreviewClass[] }

export const getYearRolloverPreview = (orgId: string): Promise<RolloverPreview> =>
  apiCall(`/school/orgs/${orgId}/year-rollover/preview`);

export interface RolloverDecision {
  studentId: string;
  action: RolloverAction;
  toSectionId?: string | null;
}
export interface RolloverSummary {
  counts: Record<"promoted"|"repeated"|"graduated"|"transferred"|"withdrawn"|"skipped"|"errored", number>;
  errors: Array<{ studentId: string; reason: string }>;
  feePlansCloned?: number;
  feePlanError?: string;
}
export const executeYearRollover = (
  orgId: string,
  body: { fromYear: string; toYear: string; decisions: RolloverDecision[] },
): Promise<{ ok: true; summary: RolloverSummary }> =>
  apiCall(`/school/orgs/${orgId}/year-rollover/execute`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// =============================================================================
// Multi-campus (school_group) — Phase 1
// =============================================================================
export interface SchoolGroupSummary { id: string; name: string; slug: string }
export interface SchoolGroupCampus {
  orgId: string; name: string; slug: string;
  themeColor: string | null;
}
export interface SchoolGroupResponse {
  group: SchoolGroupSummary & { settings: Record<string, unknown>; createdAt: string };
  campuses: SchoolGroupCampus[];
}
export interface SchoolGroupSnapshot {
  totals: {
    activeStudents: number;
    campuses: number;
    /** Today's present rate across the chain, null if no attendance taken. */
    attendancePct: number | null;
    feesCollected: number;
    feesInvoiced: number;
    behavior: { positive: number; concern: number };
  };
  period: string;
  attendanceDate: string;
  perCampus: Array<{
    orgId: string; name: string;
    activeStudents: number;
    attendancePct: number | null;
    feesCollected: number;
    feesInvoiced: number;
    behavior: { positive: number; concern: number };
  }>;
}

export const listMySchoolGroups = (): Promise<{ groups: SchoolGroupSummary[] }> =>
  apiCall(`/school/me/school-groups`);

export const getSchoolGroup = (groupId: string): Promise<SchoolGroupResponse> =>
  apiCall(`/school/school-groups/${groupId}`);

export const getSchoolGroupSnapshot = (groupId: string): Promise<SchoolGroupSnapshot> =>
  apiCall(`/school/school-groups/${groupId}/snapshot`);

// Re-export apiCall so callers can hit ad-hoc endpoints without a second import.
export { apiCall };
