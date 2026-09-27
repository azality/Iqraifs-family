import { lazy, Suspense, type ReactNode, type ComponentType } from "react";
import { createBrowserRouter, Navigate, useLocation, useRouteError } from "react-router";
import { schoolPathOnFamilyHost, onFamilyHost, noFamilyDestination, familySetupOnSchoolHost } from "../utils/productHost";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireParentRole } from "./components/RequireParentRole";
/** Route-level code splitting (27 Sep 2026).
 *
 *  Every route used to be a static import, so one bundle carried the whole
 *  product: a parent opening the portal on a phone in Karachi downloaded
 *  the entire school administration - gradebooks, timetables, fees,
 *  recharts, jspdf - before their child's attendance could render. The
 *  school pages alone are ~2.7 MB of source against the portal's ~0.3 MB.
 *
 *  Each page now loads on demand. The pages export named components, not
 *  defaults, so the loader picks the name out itself; the Suspense sits
 *  here rather than at the router root, because the router has several
 *  top-level trees and a page can be the element of any of them. */
function page<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  name: keyof T & string,
) {
  const Lazy = lazy(async () => ({
    default: (await loader())[name] as ComponentType<Record<string, unknown>>,
  }));
  // Props are forwarded: most routes take none, but SchoolSlugEntry is
  // handed the slug the worker stashed at bootstrap.
  return function RoutePage(props: Record<string, unknown>) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

/** Deliberately quiet: a chunk arrives in well under a second on a warm
 *  cache, and a spinner that flashes reads worse than a blank moment. */
function RouteFallback() {
  return <div className="min-h-[40vh]" aria-busy="true" aria-live="polite" />;
}

const Welcome = page(() => import("./pages/Welcome"), "Welcome");
const ParentLogin = page(() => import("./pages/ParentLogin"), "ParentLogin");
const ParentSignup = page(() => import("./pages/ParentSignup"), "ParentSignup");
const KidLoginNew = page(() => import("./pages/KidLoginNew"), "KidLoginNew");
const DashboardRouter = page(() => import("./pages/DashboardRouter"), "DashboardRouter");
const LogBehavior = page(() => import("./pages/LogBehavior"), "LogBehavior");
const WeeklyReview = page(() => import("./pages/WeeklyReview"), "WeeklyReview");
const MonthlyReview = page(() => import("./pages/MonthlyReview"), "MonthlyReview");
const Adjustments = page(() => import("./pages/Adjustments"), "Adjustments");
const AttendanceNew = page(() => import("./pages/AttendanceNew"), "AttendanceNew");
const Rewards = page(() => import("./pages/Rewards"), "Rewards");
const AuditTrail = page(() => import("./pages/AuditTrail"), "AuditTrail");
const Settings = page(() => import("./pages/Settings"), "Settings");
const LinkToSchool = page(() => import("./pages/LinkToSchool"), "LinkToSchool");
const EditRequests = page(() => import("./pages/EditRequests"), "EditRequests");
const KnowledgeQuest = page(() => import("./pages/KnowledgeQuest"), "KnowledgeQuest");
const KnowledgeQuestPlay = page(() => import("./pages/KnowledgeQuestPlay"), "KnowledgeQuestPlay");
const KnowledgeQuestResults = page(() => import("./pages/KnowledgeQuestResults"), "KnowledgeQuestResults");
const QuestionBank = page(() => import("./pages/QuestionBank"), "QuestionBank");
const QuestionForm = page(() => import("./pages/QuestionForm"), "QuestionForm");
const ParentWishlistReview = page(() => import("./pages/ParentWishlistReview"), "ParentWishlistReview");
const PendingRedemptionRequests = page(() => import("./pages/PendingRedemptionRequests"), "PendingRedemptionRequests");
const Challenges = page(() => import("./pages/Challenges"), "Challenges");
const TitlesBadgesPage = page(() => import("./pages/TitlesBadgesPage"), "TitlesBadgesPage");
const SadqaPage = page(() => import("./pages/SadqaPage"), "SadqaPage");
const KidDashboard = page(() => import("./pages/KidDashboard"), "KidDashboard");
const KidWishlist = page(() => import("./pages/KidWishlist"), "KidWishlist");
const KidRewardsGallery = page(() => import("./pages/KidRewardsGallery"), "KidRewardsGallery");
const Onboarding = page(() => import("./pages/Onboarding"), "Onboarding");
const JoinPending = page(() => import("./pages/JoinPending"), "JoinPending");
const NetworkTest = page(() => import("./pages/NetworkTest"), "NetworkTest");
// School (Iqra Academy pilot) — principal + teacher surfaces.
// Visible only to users with a school role; auth/role checks live inside
// the components since the same routes serve principals and teachers.
const SchoolHome = page(() => import("./pages/school/SchoolHome"), "SchoolHome");
// New Performance Dashboard — replaces PrincipalDashboard as the org entry.
// The PrincipalDashboard file is kept in the tree for now (no route uses it)
// and will be removed in a follow-up.
const PerformanceDashboard = page(() => import("./pages/school/PerformanceDashboard"), "PerformanceDashboard");
const SchoolHomeRouter = page(() => import("./pages/school/SchoolHomeRouter"), "SchoolHomeRouter");
// Internal preview for the school-ui primitives. Not linked from any nav.
const _DesignSystemPreview = page(() => import("./pages/school/_DesignSystemPreview"), "_DesignSystemPreview");
const SchoolSetup = page(() => import("./pages/school/SchoolSetup"), "SchoolSetup");
const ClassDetail = page(() => import("./pages/school/ClassDetail"), "ClassDetail");
const BehaviorCatalog = page(() => import("./pages/school/BehaviorCatalog"), "BehaviorCatalog");
const HifzProgress = page(() => import("./pages/school/HifzProgress"), "HifzProgress");
// Phase A Admin surfaces (school-pilot/phase-a-admin-ui). Gated client-
// side via getSchoolMe() — pages render <Navigate to="/school" /> if
// the caller has no principal/admin role on the org.
const AdminDashboard = page(() => import("./pages/school/AdminDashboard"), "AdminDashboard");
const WeeklyDigest = page(() => import("./pages/school/WeeklyDigest"), "WeeklyDigest");
const ManageClasses = page(() => import("./pages/school/ManageClasses"), "ManageClasses");
const YearRollover = page(() => import("./pages/school/YearRollover"), "YearRollover");
const TeacherCalendar = page(() => import("./pages/school/TeacherCalendar"), "TeacherCalendar");
const AdminTeacherSchedule = page(() => import("./pages/school/AdminTeacherSchedule"), "AdminTeacherSchedule");
const AdminTimeOff = page(() => import("./pages/school/AdminTimeOff"), "AdminTimeOff");
const ManagePublicSite = page(() => import("./pages/school/ManagePublicSite"), "ManagePublicSite");
const SchoolGroupDashboard = page(() => import("./pages/school/SchoolGroupDashboard"), "SchoolGroupDashboard");
const ManageStudents = page(() => import("./pages/school/ManageStudents"), "ManageStudents");
const StudentDetail = page(() => import("./pages/school/StudentDetail"), "StudentDetail");
const ExamSyllabus = page(() => import("./pages/school/ExamSyllabus"), "ExamSyllabus");
const ExamMarks = page(() => import("./pages/school/ExamMarks"), "ExamMarks");
const MarkingProgress = page(() => import("./pages/school/MarkingProgress"), "MarkingProgress");
const ReportCardsBrowser = page(() => import("./pages/school/ReportCardsBrowser"), "ReportCardsBrowser");
const MyMarks = page(() => import("./pages/school/MyMarks"), "MyMarks");
const CarriedAttendance = page(() => import("./pages/school/CarriedAttendance"), "CarriedAttendance");
const StudentReportCard = page(() => import("./pages/school/StudentReportCard"), "StudentReportCard");
const ImportCenter = page(() => import("./pages/school/ImportCenter"), "ImportCenter");
const ManageHifzGroups = page(() => import("./pages/school/ManageHifzGroups"), "ManageHifzGroups");
const HifzProgramDashboard = page(() => import("./pages/school/HifzProgramDashboard"), "HifzProgramDashboard");
const AdminAcademicsDay = page(() => import("./pages/school/AdminAcademicsDay"), "AdminAcademicsDay");
const TeachingOverview = page(() => import("./pages/school/TeachingOverview"), "TeachingOverview");
const OrgNotFound = page(() => import("./pages/school/OrgNotFound"), "OrgNotFound");
const ManageTimetable = page(() => import("./pages/school/ManageTimetable"), "ManageTimetable");
const MasterTimetable = page(() => import("./pages/school/MasterTimetable"), "MasterTimetable");
const TimetableSchedulePage = page(() => import("./pages/school/TimetableSchedulePage"), "TimetableSchedulePage");
const TimetableSubstitutionsPage = page(() => import("./pages/school/TimetableSubstitutionsPage"), "TimetableSubstitutionsPage");
const TeacherWeekView = page(() => import("./pages/school/TeacherWeekView"), "TeacherWeekView");
const ManageFeePlans = page(() => import("./pages/school/ManageFeePlans"), "ManageFeePlans");
const ManageAssessment = page(() => import("./pages/school/ManageAssessment"), "ManageAssessment");
const MarksEntry = page(() => import("./pages/school/MarksEntry"), "MarksEntry");
const TabulationSheet = page(() => import("./pages/school/TabulationSheet"), "TabulationSheet");
const TermSchedulePage = page(() => import("./pages/school/TermSchedulePage"), "TermSchedulePage");
const PinSlips = page(() => import("./pages/school/PinSlips"), "PinSlips");
const ManageGradeScales = page(() => import("./pages/school/ManageGradeScales"), "ManageGradeScales");
const ParentInbox = page(() => import("./pages/school/ParentInbox"), "ParentInbox");
const ContactSchool = page(() => import("./pages/portal/ContactSchool"), "ContactSchool");
const StudentTeacherComments = page(() => import("./pages/portal/StudentTeacherComments"), "StudentTeacherComments");
const ManageParents = page(() => import("./pages/school/ManageParents"), "ManageParents");
const ManageTeachers = page(() => import("./pages/school/ManageTeachers"), "ManageTeachers");
const TeacherDetail = page(() => import("./pages/school/TeacherDetail"), "TeacherDetail");
const LinkCodes = page(() => import("./pages/school/LinkCodes"), "LinkCodes");
const PermissionsEditor = page(() => import("./pages/school/PermissionsEditor"), "PermissionsEditor");
const OrgSettings = page(() => import("./pages/school/OrgSettings"), "OrgSettings");
const AuditLog = page(() => import("./pages/school/AuditLog"), "AuditLog");
// Phase B teacher/admin surfaces (school-pilot/phase-b-ui).
const AttendanceRollCall = page(() => import("./pages/school/AttendanceRollCall"), "AttendanceRollCall");
const SectionOverview = page(() => import("./pages/school/SectionOverview"), "SectionOverview");
const SectionBehaviorFeed = page(() => import("./pages/school/SectionBehaviorFeed"), "SectionBehaviorFeed");
const RosterRequestForm = page(() => import("./pages/school/RosterRequestForm"), "RosterRequestForm");
const RosterReviewQueue = page(() => import("./pages/school/RosterReviewQueue"), "RosterReviewQueue");
// Phase C.1: daily sabaq + hifz progress
const SectionLessonsFeed = page(() => import("./pages/school/SectionLessonsFeed"), "SectionLessonsFeed");
const LessonForm = page(() => import("./pages/school/LessonForm"), "LessonForm");
const SectionHifzOverview = page(() => import("./pages/school/SectionHifzOverview"), "SectionHifzOverview");
// Phase C.2 — assignments + grades
const SectionAssignmentsList = page(() => import("./pages/school/SectionAssignmentsList"), "SectionAssignmentsList");
const AssignmentForm = page(() => import("./pages/school/AssignmentForm"), "AssignmentForm");
const AssignmentDetail = page(() => import("./pages/school/AssignmentDetail"), "AssignmentDetail");
const SectionGradebook = page(() => import("./pages/school/SectionGradebook"), "SectionGradebook");
// Phase C.3 + Phase D — curriculum, fees, forms
const SectionCurriculum = page(() => import("./pages/school/SectionCurriculum"), "SectionCurriculum");
const FeesOverview = page(() => import("./pages/school/FeesOverview"), "FeesOverview");
const StudentFees = page(() => import("./pages/school/StudentFees"), "StudentFees");
const FormsList = page(() => import("./pages/school/FormsList"), "FormsList");
const FormBuilder = page(() => import("./pages/school/FormBuilder"), "FormBuilder");
const FormResponses = page(() => import("./pages/school/FormResponses"), "FormResponses");
import { SchoolAdminShell } from "./layouts/SchoolAdminShell";
// Parent-facing redemption page for school invite codes — lands here from
// the SMS/WhatsApp links the school sends.
const ParentConnect = page(() => import("./pages/ParentConnect"), "ParentConnect");
// School Portal (student + parent PIN auth — separate from family JWT).
import { PinAuthProvider } from "./contexts/PinAuthContext";
import { PortalRouteGuard } from "./components/PortalRouteGuard";
import { PortalLayout } from "./layouts/PortalLayout";
const PortalLogin = page(() => import("./pages/portal/PortalLogin"), "PortalLogin");
const SchoolUnifiedLogin = page(() => import("./pages/school/SchoolUnifiedLogin"), "SchoolUnifiedLogin");
const SchoolSlugEntry = page(() => import("./pages/school/SchoolSlugEntry"), "SchoolSlugEntry");
const ResetPassword = page(() => import("./pages/ResetPassword"), "ResetPassword");
const SchoolAccount = page(() => import("./pages/school/SchoolAccount"), "SchoolAccount");
const PortalChangePin = page(() => import("./pages/portal/PortalChangePin"), "PortalChangePin");
const PortalHome = page(() => import("./pages/portal/PortalHome"), "PortalHome");
const StudentDashboard = page(() => import("./pages/portal/StudentDashboard"), "StudentDashboard");
const StudentLessons = page(() => import("./pages/portal/StudentLessons"), "StudentLessons");
const StudentHomework = page(() => import("./pages/portal/StudentHomework"), "StudentHomework");
const StudentGrades = page(() => import("./pages/portal/StudentGrades"), "StudentGrades");
const StudentHifz = page(() => import("./pages/portal/StudentHifz"), "StudentHifz");
const StudentTimetable = page(() => import("./pages/portal/StudentTimetable"), "StudentTimetable");
const StudentTermReportCard = page(() => import("./pages/portal/StudentTermReportCard"), "StudentTermReportCard");
const StudentAttendance = page(() => import("./pages/portal/StudentAttendance"), "StudentAttendance");
const StudentBehavior = page(() => import("./pages/portal/StudentBehavior"), "StudentBehavior");
const MyForms = page(() => import("./pages/portal/MyForms"), "MyForms");
const MyAnnouncements = page(() => import("./pages/portal/MyAnnouncements"), "MyAnnouncements");
const MyStudentFees = page(() => import("./pages/portal/MyStudentFees"), "MyStudentFees");
const AnnouncementsList = page(() => import("./pages/school/AnnouncementsList"), "AnnouncementsList");
const AnnouncementComposer = page(() => import("./pages/school/AnnouncementComposer"), "AnnouncementComposer");
const FormFill = page(() => import("./pages/portal/FormFill"), "FormFill");
import { RootLayout } from "./layouts/RootLayout";
import { KidLayout } from "./layouts/KidLayout";
import { ProvidersLayout } from "./layouts/ProvidersLayout";
const PrayerLogging = page(() => import("./pages/PrayerLogging"), "PrayerLogging");
// v27: kid-driven chore claims
const KidChores = page(() => import("./pages/KidChores"), "KidChores");
const PrayerApprovals = page(() => import("./pages/PrayerApprovals"), "PrayerApprovals");
const DiagnosticPage = page(() => import("./pages/DiagnosticPage"), "DiagnosticPage");
const WishlistDebug = page(() => import("./pages/WishlistDebug"), "WishlistDebug");
const AdventureWorld = page(() => import("./pages/AdventureWorld"), "AdventureWorld");
const JannahGarden = page(() => import("./pages/JannahGarden"), "JannahGarden");
const DuaSpellCasting = page(() => import("./pages/games/DuaSpellCasting"), "DuaSpellCasting");
const AyahPuzzle = page(() => import("./pages/games/AyahPuzzle"), "AyahPuzzle");
const GuessProphet = page(() => import("./pages/games/GuessProphet"), "GuessProphet");
const GamesReview = page(() => import("./pages/GamesReview"), "GamesReview");
const MakkahZone = page(() => import("./pages/adventure-zones/MakkahZone"), "MakkahZone");
const MadinahZone = page(() => import("./pages/adventure-zones/MadinahZone"), "MadinahZone");
const QuranValleyZone = page(() => import("./pages/adventure-zones/QuranValleyZone"), "QuranValleyZone");
const DesertTrialsZone = page(() => import("./pages/adventure-zones/DesertTrialsZone"), "DesertTrialsZone");
const ZonePlay = page(() => import("./pages/adventure-zones/ZonePlay"), "ZonePlay");
import { useContext, useState, useEffect } from "react";
import { WorkspaceContext } from "./contexts/WorkspaceContext";
import { getCurrentMode } from "./utils/auth";
import { getStorage, getStorageSync, STORAGE_KEYS } from "../utils/storage";

// Custom error element that's wrapped with providers
function RouterErrorBoundary() {
  // Surface the real error — a bare "something went wrong" turns every
  // production crash into a guessing game (pilot lesson, twice).
  const err = useRouteError() as unknown;
  const detail =
    err instanceof Error
      ? `${err.message}${err.stack ? "\n" + err.stack.split("\n").slice(1, 4).join("\n") : ""}`
      : typeof err === "string"
        ? err
        : err
          ? JSON.stringify(err).slice(0, 400)
          : null;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-foreground mb-4">Something went wrong</h2>
        <p className="text-muted-foreground mb-4">
          An unexpected error occurred — usually a refresh fixes it (the app
          may have just been updated).
        </p>
        {detail && (
          <pre className="mb-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-slate-100 p-3 text-[11px] leading-snug text-slate-600">
            {detail}
          </pre>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => {
              // School staff/parents came in via a per-school slug login —
              // send them back there, not to the family parent login.
              let slug: string | null = null;
              try { slug = localStorage.getItem("fgs_last_org_slug"); } catch { /* ignore */ }
              window.location.href = slug ? `/${slug}/login` : "/parent-login";
            }}
            className="px-4 py-2 border border-input bg-background rounded-md hover:bg-accent transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
}

// Kid auth protection - checks for kid session OR parent-previewing-as-kid.
//
// Two valid ways to reach a /kid/* route:
//   1. Real kid login (user_role === 'child' and a kid session token exists).
//   2. Parent previewing the kid experience (user_role === 'parent' AND
//      fgs_view_mode_preference === 'kid'). This is a READ-ONLY preview —
//      KidDashboard and friends gate mutations on `isPreviewingAsKid`, so
//      the parent's JWT cannot fire real kid actions here.
//
// Anyone else (no session, no preview intent) is sent to /kid/login.
function RequireKidAuth({ children }: { children: JSX.Element }) {
  const mode = getCurrentMode();
  const userRole = getStorageSync(STORAGE_KEYS.USER_ROLE);
  const viewPref = getStorageSync('fgs_view_mode_preference');
  const isParentPreviewing = userRole === 'parent' && viewPref === 'kid';

  console.log('🔒 RequireKidAuth check:', {
    mode,
    userRole,
    viewPref,
    isParentPreviewing,
    pathname: window.location.pathname,
  });

  if (mode !== 'kid' && !isParentPreviewing) {
    console.log('❌ RequireKidAuth: Not in kid mode or parent-preview, redirecting to /kid/login');
    return <Navigate to="/kid/login" replace />;
  }

  console.log('✅ RequireKidAuth: Allowed', { reason: isParentPreviewing ? 'parent-previewing-as-kid' : 'kid-session' });
  return children;
}

// Auth check component - redirects to onboarding if authenticated but no family
// NOTE: This component MUST be used INSIDE ProvidersLayout (which provides FamilyContext)
function RequireFamily({ children }: { children: JSX.Element }) {
  const [loading, setLoading] = useState(true);
  const [hasFamilyAccess, setHasFamilyAccess] = useState(false);
  // Read school workspace state. A user with no family but a principal /
  // teacher role should NOT be sent to /onboarding (family setup) — they
  // should land on /school instead.
  const workspaceCtx = useContext(WorkspaceContext);
  // Used to gate the workspace-preference redirect below to the index
  // route only. Without this, any /school/* navigation hits the same
  // redirect, short-circuits the Outlet, and renders nothing.
  const location = useLocation();

  useEffect(() => {
    const checkFamilyAccess = async () => {
      try {
        // Check storage for family ID (works on both web and native)
        const cachedFamilyId = await getStorage(STORAGE_KEYS.FAMILY_ID);

        if (cachedFamilyId) {
          console.log('✅ RequireFamily: Found cached family ID:', cachedFamilyId);
          setHasFamilyAccess(true);
          setLoading(false);
          return;
        }

        // No cached family ID - this is a new user or first-time login
        // Just redirect to onboarding - they'll create a family there
        console.log('⚠️ RequireFamily: No cached family ID - user needs to complete onboarding');
        setHasFamilyAccess(false);
        setLoading(false);
      } catch (error) {
        console.error('❌ RequireFamily: Error checking family access:', error);
        setHasFamilyAccess(false);
        setLoading(false);
      }
    };

    checkFamilyAccess();
  }, []);

  // Wait for BOTH the family-id check AND the workspace context's
  // /school/me fetch — if we redirect before /school/me resolves we'd
  // send a school-only user to /onboarding even though they have a
  // school role.
  if (loading || (workspaceCtx?.loading ?? false)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Index-route redirects for users who shouldn't land on the family
  // Dashboard. Two cases, both scoped to location.pathname === '/' so
  // we never short-circuit nested routes' Outlet rendering.
  // …but never on the family product's own host, where there is no
  // school to route to. Both redirects below would land on /school, the
  // host guard would send it back to "/", and we would be here again.
  const familyHost = onFamilyHost(window.location.hostname);

  if (!familyHost && location.pathname === '/') {
    // signupIntent='school' is the strongest signal: this person signed
    // up as a school principal and should never see the family side at
    // all. Redirect regardless of any stale workspace state.
    if (workspaceCtx?.signupIntent === 'school' && workspaceCtx.hasSchoolAccess) {
      const firstOrg = workspaceCtx.workspace?.orgId
        ? workspaceCtx.workspace.orgId
        : workspaceCtx.me?.organizations?.[0]?.id;
      return <Navigate to={firstOrg ? `/school/orgs/${firstOrg}` : '/school'} replace />;
    }
    // Soft case: user explicitly picked school workspace (or auto-default
    // did). Honors their last choice. They can still flip via the switcher.
    if (
      workspaceCtx?.workspace?.kind === 'school' &&
      workspaceCtx.workspace.orgId &&
      workspaceCtx.hasSchoolAccess
    ) {
      return <Navigate to={`/school/orgs/${workspaceCtx.workspace.orgId}`} replace />;
    }
  }

  if (!hasFamilyAccess) {
    // School-only user (no family, has principal/teacher role) →
    // /school routes them to the right surface (principal dashboard or
    // teacher class list), and rendering in place under /school is what
    // lets the Outlet through. On the family host there is no school to
    // send them to, so the answer is the family one: make a family.
    switch (noFamilyDestination({
      hostname: window.location.hostname,
      pathname: location.pathname,
      hasSchoolAccess: !!workspaceCtx?.hasSchoolAccess,
      schoolSlug: (window as unknown as { __SCHOOL_SLUG__?: string }).__SCHOOL_SLUG__ ?? null,
    })) {
      case "render": return children;
      case "school": return <Navigate to="/school" replace />;
      default: return <Navigate to="/onboarding" replace />;
    }
  }

  return children;
}

/** What "/" renders depends on WHOSE domain this is.
 *
 *  On a school's own domain (iqraifs.com) the root IS that school's
 *  front door, rendered in place so the address bar keeps saying
 *  iqraifs.com — the slug is resolved from the hostname during
 *  bootstrap (src/main.tsx) and stashed before the first render.
 *
 *  Only the ROOT changes: every deeper path still renders the normal
 *  protected app tree, so /school/orgs/... and the family routes are
 *  untouched. Without that narrowing this gate would swallow the whole
 *  "/" subtree, which is every staff page.
 */
/** The family product's host has no school pages.
 *
 *  The worker enforces this, but it only ever sees a full page load —
 *  a client-side navigation from /rewards into /school never leaves the
 *  browser, so without this the school app still renders there. Home,
 *  not the platform host: someone using the family product stays on
 *  family.theilmnetwork.com. */
function RefuseSchoolOnFamilyHost({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (schoolPathOnFamilyHost(window.location.hostname, pathname)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** A school's own domain has no family product. "Set Up Your Family"
 *  rendering on iqraifs.com — reached via a broken staff link — is the
 *  separation failing in the other direction (23 Sep). The slug is
 *  stashed at bootstrap for custom school domains, so its presence IS
 *  the school-host test. */
function RefuseFamilySetupOnSchoolHost({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const slug = (window as unknown as { __SCHOOL_SLUG__?: string }).__SCHOOL_SLUG__;
  if (familySetupOnSchoolHost(slug, pathname)) {
    return <Navigate to="/school" replace />;
  }
  return <>{children}</>;
}

function RootHostGate() {
  const { pathname } = useLocation();
  if (schoolPathOnFamilyHost(window.location.hostname, pathname)) {
    return <Navigate to="/" replace />;
  }
  const slug = (window as unknown as { __SCHOOL_SLUG__?: string }).__SCHOOL_SLUG__;
  if (slug && pathname === "/") {
    return (
      <PinAuthProvider>
        <SchoolSlugEntry slug={slug} />
      </PinAuthProvider>
    );
  }
  return (
    <ProtectedRoute><RequireFamily><RootLayout /></RequireFamily></ProtectedRoute>
  );
}

export const router = createBrowserRouter([
  // Password recovery landing (staff first-password + forgot-password).
  // Outside every provider: the emailed link must work with no session
  // and no family context. The supabase client consumes the recovery
  // token from the URL hash on load.
  {
    path: "reset-password",
    element: <ResetPassword />,
    errorElement: <RouterErrorBoundary />,
  },
  // School Portal (PIN auth — student + parent). Lives OUTSIDE the family
  // auth tree: no Supabase JWT, no FamilyContext, no WorkspaceContext.
  {
    path: "school-login",
    element: (
      <RefuseSchoolOnFamilyHost>
        <PinAuthProvider>
          <PortalLogin />
        </PinAuthProvider>
      </RefuseSchoolOnFamilyHost>
    ),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: "school-portal",
    element: (
      <RefuseSchoolOnFamilyHost>
        <PinAuthProvider>
          <PortalRouteGuard>
            <PortalLayout />
          </PortalRouteGuard>
        </PinAuthProvider>
      </RefuseSchoolOnFamilyHost>
    ),
    errorElement: <RouterErrorBoundary />,
    children: [
      { index: true, element: <PortalHome /> },
      { path: "change-pin", element: <PortalChangePin /> },
      { path: "students/:studentId", element: <StudentDashboard /> },
      { path: "students/:studentId/lessons", element: <StudentLessons /> },
      { path: "students/:studentId/homework", element: <StudentHomework /> },
      { path: "students/:studentId/grades", element: <StudentGrades /> },
      { path: "students/:studentId/report-card", element: <StudentTermReportCard /> },
      { path: "students/:studentId/teacher-comments", element: <StudentTeacherComments /> },
      { path: "students/:studentId/hifz", element: <StudentHifz /> },
      { path: "students/:studentId/timetable", element: <StudentTimetable /> },
      { path: "students/:studentId/attendance", element: <StudentAttendance /> },
      { path: "students/:studentId/behavior", element: <StudentBehavior /> },
      { path: "students/:studentId/fees", element: <MyStudentFees /> },
      { path: "forms", element: <MyForms /> },
      { path: "forms/:formId", element: <FormFill /> },
      { path: "announcements", element: <MyAnnouncements /> },
      { path: "contact-school", element: <ContactSchool /> },
    ],
  },
  // Per-school slug login: iqraifs.com/:orgSlug (e.g. /iqra-demo).
  // Single page with Staff / Parent / Student tabs, branded by org. Lives
  // OUTSIDE ProvidersLayout so it has no JWT / family-context dependency.
  // Static routes (/welcome, /login, /signup, etc.) take precedence over
  // this param route in react-router v6, so they continue to work. The
  // SchoolUnifiedLogin component itself rejects RESERVED_SLUGS as a
  // defense-in-depth check.
  {
    // SchoolSlugEntry decides: public marketing site (if school turned it
    // on) or the unified login (default). /:orgSlug/login always goes to
    // login regardless.
    path: ":orgSlug",
    element: (
      <PinAuthProvider>
        <SchoolSlugEntry />
      </PinAuthProvider>
    ),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: ":orgSlug/login",
    element: (
      <PinAuthProvider>
        <SchoolUnifiedLogin />
      </PinAuthProvider>
    ),
    errorElement: <RouterErrorBoundary />,
  },
  // Public routes - accessible without auth but wrapped with ProvidersLayout for auth context
  {
    element: <ProvidersLayout />,
    errorElement: <RouterErrorBoundary />,
    children: [
      {
        path: "/welcome",
        element: <Welcome />,
      },
      {
        path: "/login",
        element: <ParentLogin />,
      },
      {
        path: "/parent-login",
        element: <ParentLogin />,
      },
      {
        path: "/signup",
        element: <ParentSignup />,
      },
      // Legacy kid login - redirect to new implementation
      {
        path: "/kid-login",
        element: <Navigate to="/kid-login-new" replace />,
      },
      {
        path: "/kid-login-new",
        element: <KidLoginNew />,
      },
      // Alias for kid login (used in some links)
      {
        path: "/kid/login",
        element: <KidLoginNew />,
      },
      {
        path: "/onboarding",
        element: <RefuseFamilySetupOnSchoolHost><ProtectedRoute><Onboarding /></ProtectedRoute></RefuseFamilySetupOnSchoolHost>,
      },
      {
        path: "/join-pending",
        element: <RefuseFamilySetupOnSchoolHost><ProtectedRoute><JoinPending /></ProtectedRoute></RefuseFamilySetupOnSchoolHost>,
      },
      // Parent invite redemption — requires auth (we need to know who's
      // claiming) but NOT family (brand-new parents land here from the
      // school's SMS/WhatsApp and may not have a family yet).
      {
        path: "/parent/connect",
        element: <ProtectedRoute><ParentConnect /></ProtectedRoute>,
      },
      {
        path: "/diagnostic",
        element: <ProtectedRoute><DiagnosticPage /></ProtectedRoute>,
      },
      // Protected routes - require auth AND family
      {
        path: "/",
        element: <RootHostGate />,
        children: [
          { index: true, element: <DashboardRouter /> },
          { path: "log", element: <RequireParentRole><LogBehavior /></RequireParentRole> },
          { path: "review", element: <RequireParentRole><WeeklyReview /></RequireParentRole> },
          { path: "monthly-review", element: <RequireParentRole><MonthlyReview /></RequireParentRole> },
          { path: "adjustments", element: <RequireParentRole><Adjustments /></RequireParentRole> },
          { path: "attendance", element: <RequireParentRole><AttendanceNew /></RequireParentRole> },
          { path: "rewards", element: <RequireParentRole><Rewards /></RequireParentRole> },
          { path: "audit", element: <RequireParentRole><AuditTrail /></RequireParentRole> },
          { path: "settings", element: <RequireParentRole><Settings /></RequireParentRole> },
          // Family-side entry for the school link-code feature. Parent
          // types the 8-char code their school gave them, picks which
          // family child to bind, and we wire the KV↔Postgres mapping.
          { path: "link-to-school", element: <RequireParentRole><LinkToSchool /></RequireParentRole> },
          { path: "edit-requests", element: <RequireParentRole><EditRequests /></RequireParentRole> },
          { path: "knowledge-quest", element: <KnowledgeQuest /> },
          { path: "knowledge-quest/:sessionId/play", element: <KnowledgeQuestPlay /> },
          { path: "knowledge-quest/results", element: <KnowledgeQuestResults /> },
          { path: "question-bank", element: <QuestionBank /> },
          { path: "question-form", element: <QuestionForm /> },
          { path: "question-bank/new", element: <QuestionForm /> },
          { path: "question-bank/:id/edit", element: <QuestionForm /> },
          { path: "wishlist", element: <RequireParentRole><ParentWishlistReview /></RequireParentRole> },
          { path: "wishlist-debug", element: <WishlistDebug /> },
          { path: "redemption-requests", element: <RequireParentRole><PendingRedemptionRequests /></RequireParentRole> },
          { path: "challenges", element: <RequireParentRole><Challenges /></RequireParentRole> },
          { path: "titles-badges", element: <TitlesBadgesPage /> },
          { path: "sadqa", element: <SadqaPage /> },
          { path: "prayer-approvals", element: <RequireParentRole><PrayerApprovals /></RequireParentRole> },
          { path: "games-review", element: <RequireParentRole><GamesReview /></RequireParentRole> },
          // School (Iqra Academy pilot). RequireParentRole gates entry —
          // any school user signs in via the parent flow (school roles are
          // an additional layer on top). Components themselves render
          // "no school access" if the user has neither principal nor
          // teacher rows in user_roles.
          { path: "school", element: <RequireParentRole><SchoolHome /></RequireParentRole> },
          { path: "school/account", element: <RequireParentRole><SchoolAccount /></RequireParentRole> },
          // Multi-campus (school_group) dashboard — chain principal lands here.
          { path: "school/school-groups/:groupId", element: <RequireParentRole><SchoolGroupDashboard /></RequireParentRole> },
          { path: "school/_design", element: <RequireParentRole><_DesignSystemPreview /></RequireParentRole> },
          { path: "school/classes/:classId", element: <RequireParentRole><ClassDetail /></RequireParentRole> },
          { path: "school/children/:childId/hifz", element: <RequireParentRole><HifzProgress /></RequireParentRole> },
          // School admin shell — wraps every /school/orgs/:orgId/* route so
          // the ManageToolbar (Classes / Students / Parents / Teachers /
          // Link Codes / Roster Requests / Permissions / Settings) is
          // always present and users can hop between sections without
          // back-buttoning to the dashboard. RequireParentRole gates the
          // shell once; child routes inherit the gate via the Outlet.
          {
            path: "school/orgs/:orgId",
            element: <RequireParentRole><SchoolAdminShell /></RequireParentRole>,
            children: [
              { index: true, element: <SchoolHomeRouter /> },
              { path: "setup", element: <SchoolSetup /> },
              { path: "behavior-catalog", element: <BehaviorCatalog /> },
              // Phase A admin
              { path: "admin", element: <AdminDashboard /> },
              { path: "admin/weekly-digest", element: <WeeklyDigest /> },
              { path: "admin/year-rollover", element: <YearRollover /> },
              { path: "admin/public-site", element: <ManagePublicSite /> },
              { path: "my-schedule", element: <TeacherCalendar /> },
              { path: "admin/teachers/:teacherId/schedule", element: <AdminTeacherSchedule /> },
              { path: "admin/classes", element: <ManageClasses /> },
              { path: "admin/students", element: <ManageStudents /> },
              { path: "admin/students/:studentId", element: <StudentDetail /> },
              { path: "admin/students/:studentId/report-card", element: <StudentReportCard /> },
              { path: "admin/parents", element: <ManageParents /> },
              { path: "admin/teachers", element: <ManageTeachers /> },
              { path: "admin/teachers/:userId", element: <TeacherDetail /> },
              { path: "admin/link-codes", element: <LinkCodes /> },
              { path: "admin/permissions", element: <PermissionsEditor /> },
              { path: "admin/settings", element: <OrgSettings /> },
              { path: "admin/audit", element: <AuditLog /> },
              { path: "admin/import", element: <ImportCenter /> },
              { path: "admin/hifz-groups", element: <ManageHifzGroups /> },
              { path: "admin/hifz-program", element: <HifzProgramDashboard /> },
              { path: "admin/academics-day", element: <AdminAcademicsDay /> },
              { path: "admin/teaching-overview", element: <TeachingOverview /> },
              { path: "admin/timetable", element: <ManageTimetable /> },
              { path: "admin/timetable/master", element: <MasterTimetable /> },
              { path: "admin/timetable/substitutions", element: <TimetableSubstitutionsPage /> },
              // School schedule editor. It sits under Timetable because
              // that is the only place anyone reaches it from, and so the
              // nav highlights Academics rather than claiming Admin.
              { path: "admin/timetable/schedule", element: <TimetableSchedulePage /> },
              // Old address kept alive — it was linked from Settings and
              // may sit in a bookmark.
              { path: "admin/settings/school-schedule", element: <TimetableSchedulePage /> },
              { path: "admin/time-off", element: <AdminTimeOff /> },
              { path: "my-week", element: <TeacherWeekView /> },
              { path: "admin/roster-requests", element: <RosterReviewQueue /> },
              { path: "admin/announcements", element: <AnnouncementsList /> },
              { path: "admin/announcements/new", element: <AnnouncementComposer /> },
              { path: "admin/announcements/:announcementId", element: <AnnouncementComposer /> },
              // Phase B section-scoped daily ops
              // Section overview hub — landing page when clicking a leaderboard row.
              { path: "sections/:sectionId", element: <SectionOverview /> },
              { path: "sections/:sectionId/attendance", element: <AttendanceRollCall /> },
              { path: "sections/:sectionId/behavior", element: <SectionBehaviorFeed /> },
              { path: "sections/:sectionId/roster/new", element: <RosterRequestForm /> },
              // Phase C.1: daily sabaq + hifz progress
              { path: "sections/:sectionId/lessons", element: <SectionLessonsFeed /> },
              { path: "sections/:sectionId/lessons/new", element: <LessonForm /> },
              { path: "lessons/:lessonId/edit", element: <LessonForm /> },
              { path: "sections/:sectionId/hifz", element: <SectionHifzOverview /> },
              // Phase C.2 — assignments + grades
              { path: "sections/:sectionId/assignments", element: <SectionAssignmentsList /> },
              { path: "sections/:sectionId/assignments/new", element: <AssignmentForm /> },
              { path: "assignments/:assignmentId", element: <AssignmentDetail /> },
              { path: "assignments/:assignmentId/edit", element: <AssignmentForm /> },
              { path: "sections/:sectionId/gradebook", element: <SectionGradebook /> },
              // Phase C.3 + Phase D — curriculum, fees, forms
              { path: "sections/:sectionId/curriculum", element: <SectionCurriculum /> },
              { path: "admin/fees", element: <FeesOverview /> },
              { path: "admin/fees/plans", element: <ManageFeePlans /> },
              { path: "admin/assessment", element: <ManageAssessment /> },
              { path: "admin/assessment/exams/:examId/marks", element: <MarksEntry /> },
              { path: "admin/assessment/tabulation", element: <TabulationSheet /> },
              { path: "admin/assessment/schedule", element: <TermSchedulePage /> },
              { path: "admin/assessment/exam-syllabus", element: <ExamSyllabus /> },
              { path: "admin/assessment/exam-marks", element: <ExamMarks /> },
              { path: "admin/assessment/marking-progress", element: <MarkingProgress /> },
              { path: "admin/assessment/report-cards", element: <ReportCardsBrowser /> },
              { path: "admin/attendance-carried-forward", element: <CarriedAttendance /> },
              { path: "my-marks", element: <MyMarks /> },
              { path: "admin/pin-slips", element: <PinSlips /> },
              { path: "admin/assessment/grade-scales", element: <ManageGradeScales /> },
              { path: "admin/inbox", element: <ParentInbox /> },
              { path: "students/:studentId/fees", element: <StudentFees /> },
              { path: "admin/forms", element: <FormsList /> },
              { path: "admin/forms/new", element: <FormBuilder /> },
              { path: "admin/forms/:formId", element: <FormBuilder /> },
              { path: "admin/forms/:formId/responses", element: <FormResponses /> },
              // Unmatched org URL → say so, IN this org. Falling through
              // to the app-root catch-all bounced to "/" and could land
              // in a different school (see OrgNotFound).
              { path: "*", element: <OrgNotFound /> },
            ],
          },
          // Redirect old routes to homepage
          { path: "kid", element: <Navigate to="/" replace /> },
          { path: "parent", element: <Navigate to="/" replace /> },
          // Catch all 404s
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
      // Kid routes - require kid auth only (NO parent auth needed).
      //
      // All non-immersive kid pages share a single KidLayout so the header,
      // back-to-dashboard button, and parent-mode / exit-preview button are
      // identical everywhere. Fully-immersive routes (quest PLAY, zone PLAY,
      // mini-games) stay unwrapped — they're designed to be full-screen.
      {
        element: <RequireKidAuth><KidLayout /></RequireKidAuth>,
        children: [
          { path: "/kid/home",           element: <KidDashboard /> },
          { path: "/kid/wishlist",       element: <KidWishlist /> },
          { path: "/kid/rewards",        element: <KidRewardsGallery /> },
          { path: "/kid/challenges",     element: <Challenges /> },
          { path: "/kid/prayers",        element: <PrayerLogging /> },
          { path: "/kid/chores",         element: <KidChores /> },
          { path: "/kid/knowledge-quest",element: <KnowledgeQuest /> },
          { path: "/kid/titles-badges",  element: <TitlesBadgesPage /> },
          { path: "/kid/sadqa",          element: <SadqaPage /> },
          { path: "/kid/adventure-world",element: <AdventureWorld /> },
          { path: "/kid/jannah-garden",  element: <JannahGarden /> },
          { path: "/kid/adventure-zones/makkah",        element: <MakkahZone /> },
          { path: "/kid/adventure-zones/madinah",       element: <MadinahZone /> },
          { path: "/kid/adventure-zones/quran-valley",  element: <QuranValleyZone /> },
          { path: "/kid/adventure-zones/desert-trials", element: <DesertTrialsZone /> },
        ],
      },
      // Immersive kid routes — no shared chrome, full-screen experience.
      {
        path: "/kid/knowledge-quest/:sessionId/play",
        element: <RequireKidAuth><KnowledgeQuestPlay /></RequireKidAuth>,
      },
      {
        path: "/kid/knowledge-quest/results",
        element: <RequireKidAuth><KnowledgeQuestResults /></RequireKidAuth>,
      },
      {
        path: "/kid/games/dua-spell-casting",
        element: <RequireKidAuth><DuaSpellCasting /></RequireKidAuth>,
      },
      {
        path: "/kid/games/ayah-puzzle",
        element: <RequireKidAuth><AyahPuzzle /></RequireKidAuth>,
      },
      {
        path: "/kid/games/guess-prophet",
        element: <RequireKidAuth><GuessProphet /></RequireKidAuth>,
      },
      {
        path: "/kid/adventure-zones/makkah/play",
        element: <RequireKidAuth><ZonePlay /></RequireKidAuth>,
      },
      {
        path: "/kid/adventure-zones/madinah/play",
        element: <RequireKidAuth><ZonePlay /></RequireKidAuth>,
      },
      {
        path: "/kid/adventure-zones/quran-valley/play",
        element: <RequireKidAuth><ZonePlay /></RequireKidAuth>,
      },
      {
        path: "/kid/adventure-zones/desert-trials/play",
        element: <RequireKidAuth><ZonePlay /></RequireKidAuth>,
      },
      {
        path: "/network-test",
        element: <NetworkTest />,
      },
    ],
  },
]);
