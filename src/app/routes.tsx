import { createBrowserRouter, Navigate, useLocation } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireParentRole } from "./components/RequireParentRole";
import { Welcome } from "./pages/Welcome";
import { ParentLogin } from "./pages/ParentLogin";
import { ParentSignup } from "./pages/ParentSignup";
import { KidLoginNew } from "./pages/KidLoginNew";
import { DashboardRouter } from "./pages/DashboardRouter";
import { LogBehavior } from "./pages/LogBehavior";
import { WeeklyReview } from "./pages/WeeklyReview";
import { MonthlyReview } from "./pages/MonthlyReview";
import { Adjustments } from "./pages/Adjustments";
import { AttendanceNew } from "./pages/AttendanceNew";
import { Rewards } from "./pages/Rewards";
import { AuditTrail } from "./pages/AuditTrail";
import { Settings } from "./pages/Settings";
import { LinkToSchool } from "./pages/LinkToSchool";
import { EditRequests } from "./pages/EditRequests";
import { KnowledgeQuest } from "./pages/KnowledgeQuest";
import { KnowledgeQuestPlay } from "./pages/KnowledgeQuestPlay";
import { KnowledgeQuestResults } from "./pages/KnowledgeQuestResults";
import { QuestionBank } from "./pages/QuestionBank";
import { QuestionForm } from "./pages/QuestionForm";
import { ParentWishlistReview } from "./pages/ParentWishlistReview";
import { PendingRedemptionRequests } from "./pages/PendingRedemptionRequests";
import { Challenges } from "./pages/Challenges";
import { TitlesBadgesPage } from "./pages/TitlesBadgesPage";
import { SadqaPage } from "./pages/SadqaPage";
import { KidDashboard } from "./pages/KidDashboard";
import { KidWishlist } from "./pages/KidWishlist";
import { KidRewardsGallery } from "./pages/KidRewardsGallery";
import { Onboarding } from "./pages/Onboarding";
import { JoinPending } from "./pages/JoinPending";
import { NetworkTest } from "./pages/NetworkTest";
// School (Iqra Academy pilot) — principal + teacher surfaces.
// Visible only to users with a school role; auth/role checks live inside
// the components since the same routes serve principals and teachers.
import { SchoolHome } from "./pages/school/SchoolHome";
// New Performance Dashboard — replaces PrincipalDashboard as the org entry.
// The PrincipalDashboard file is kept in the tree for now (no route uses it)
// and will be removed in a follow-up.
import { PerformanceDashboard } from "./pages/school/PerformanceDashboard";
import { SchoolHomeRouter } from "./pages/school/SchoolHomeRouter";
// Internal preview for the school-ui primitives. Not linked from any nav.
import { _DesignSystemPreview } from "./pages/school/_DesignSystemPreview";
import { SchoolSetup } from "./pages/school/SchoolSetup";
import { ClassDetail } from "./pages/school/ClassDetail";
import { BehaviorCatalog } from "./pages/school/BehaviorCatalog";
import { HifzProgress } from "./pages/school/HifzProgress";
// Phase A Admin surfaces (school-pilot/phase-a-admin-ui). Gated client-
// side via getSchoolMe() — pages render <Navigate to="/school" /> if
// the caller has no principal/admin role on the org.
import { AdminDashboard } from "./pages/school/AdminDashboard";
import { ManageClasses } from "./pages/school/ManageClasses";
import { ManageStudents } from "./pages/school/ManageStudents";
import { StudentDetail } from "./pages/school/StudentDetail";
import { StudentReportCard } from "./pages/school/StudentReportCard";
import { ImportCenter } from "./pages/school/ImportCenter";
import { ManageHifzGroups } from "./pages/school/ManageHifzGroups";
import { ManageTimetable } from "./pages/school/ManageTimetable";
import { TeacherWeekView } from "./pages/school/TeacherWeekView";
import { ManageParents } from "./pages/school/ManageParents";
import { ManageTeachers } from "./pages/school/ManageTeachers";
import { TeacherDetail } from "./pages/school/TeacherDetail";
import { LinkCodes } from "./pages/school/LinkCodes";
import { PermissionsEditor } from "./pages/school/PermissionsEditor";
import { OrgSettings } from "./pages/school/OrgSettings";
import { AuditLog } from "./pages/school/AuditLog";
// Phase B teacher/admin surfaces (school-pilot/phase-b-ui).
import { AttendanceRollCall } from "./pages/school/AttendanceRollCall";
import { SectionOverview } from "./pages/school/SectionOverview";
import { SectionBehaviorFeed } from "./pages/school/SectionBehaviorFeed";
import { RosterRequestForm } from "./pages/school/RosterRequestForm";
import { RosterReviewQueue } from "./pages/school/RosterReviewQueue";
// Phase C.1: daily sabaq + hifz progress
import { SectionLessonsFeed } from "./pages/school/SectionLessonsFeed";
import { LessonForm } from "./pages/school/LessonForm";
import { SectionHifzOverview } from "./pages/school/SectionHifzOverview";
// Phase C.2 — assignments + grades
import { SectionAssignmentsList } from "./pages/school/SectionAssignmentsList";
import { AssignmentForm } from "./pages/school/AssignmentForm";
import { AssignmentDetail } from "./pages/school/AssignmentDetail";
import { SectionGradebook } from "./pages/school/SectionGradebook";
// Phase C.3 + Phase D — curriculum, fees, forms
import { SectionCurriculum } from "./pages/school/SectionCurriculum";
import { FeesOverview } from "./pages/school/FeesOverview";
import { StudentFees } from "./pages/school/StudentFees";
import { FormsList } from "./pages/school/FormsList";
import { FormBuilder } from "./pages/school/FormBuilder";
import { FormResponses } from "./pages/school/FormResponses";
import { SchoolAdminShell } from "./layouts/SchoolAdminShell";
// Parent-facing redemption page for school invite codes — lands here from
// the SMS/WhatsApp links the school sends.
import { ParentConnect } from "./pages/ParentConnect";
// School Portal (student + parent PIN auth — separate from family JWT).
import { PinAuthProvider } from "./contexts/PinAuthContext";
import { PortalRouteGuard } from "./components/PortalRouteGuard";
import { PortalLayout } from "./layouts/PortalLayout";
import { PortalLogin } from "./pages/portal/PortalLogin";
import { SchoolUnifiedLogin } from "./pages/school/SchoolUnifiedLogin";
import { PortalChangePin } from "./pages/portal/PortalChangePin";
import { PortalHome } from "./pages/portal/PortalHome";
import { StudentDashboard } from "./pages/portal/StudentDashboard";
import { StudentLessons } from "./pages/portal/StudentLessons";
import { StudentGrades } from "./pages/portal/StudentGrades";
import { StudentHifz } from "./pages/portal/StudentHifz";
import { StudentTimetable } from "./pages/portal/StudentTimetable";
import { StudentAttendance } from "./pages/portal/StudentAttendance";
import { StudentBehavior } from "./pages/portal/StudentBehavior";
import { MyForms } from "./pages/portal/MyForms";
import { MyAnnouncements } from "./pages/portal/MyAnnouncements";
import { MyStudentFees } from "./pages/portal/MyStudentFees";
import { AnnouncementsList } from "./pages/school/AnnouncementsList";
import { AnnouncementComposer } from "./pages/school/AnnouncementComposer";
import { FormFill } from "./pages/portal/FormFill";
import { RootLayout } from "./layouts/RootLayout";
import { KidLayout } from "./layouts/KidLayout";
import { ProvidersLayout } from "./layouts/ProvidersLayout";
import { PrayerLogging } from "./pages/PrayerLogging";
// v27: kid-driven chore claims
import { KidChores } from "./pages/KidChores";
import { PrayerApprovals } from "./pages/PrayerApprovals";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { WishlistDebug } from "./pages/WishlistDebug";
import { AdventureWorld } from "./pages/AdventureWorld";
import { JannahGarden } from "./pages/JannahGarden";
import { DuaSpellCasting } from "./pages/games/DuaSpellCasting";
import { AyahPuzzle } from "./pages/games/AyahPuzzle";
import { GuessProphet } from "./pages/games/GuessProphet";
import { GamesReview } from "./pages/GamesReview";
import { MakkahZone } from "./pages/adventure-zones/MakkahZone";
import { MadinahZone } from "./pages/adventure-zones/MadinahZone";
import { QuranValleyZone } from "./pages/adventure-zones/QuranValleyZone";
import { DesertTrialsZone } from "./pages/adventure-zones/DesertTrialsZone";
import { ZonePlay } from "./pages/adventure-zones/ZonePlay";
import { useContext, useState, useEffect } from "react";
import { WorkspaceContext } from "./contexts/WorkspaceContext";
import { getCurrentMode } from "./utils/auth";
import { getStorage, getStorageSync, STORAGE_KEYS } from "../utils/storage";

// Custom error element that's wrapped with providers
function RouterErrorBoundary() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-foreground mb-4">Something went wrong</h2>
        <p className="text-muted-foreground mb-4">
          An unexpected error occurred. Please try refreshing the page.
        </p>
        <button
          onClick={() => {
            window.location.href = '/parent-login';
          }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Go to Login
        </button>
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
  if (location.pathname === '/') {
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
    // /school routes them to the right surface (principal dashboard
    // or teacher class list). If already under /school don't redirect
    // (would short-circuit the Outlet and blank the page).
    if (workspaceCtx?.hasSchoolAccess) {
      if (location.pathname.startsWith('/school')) {
        return children;
      }
      return <Navigate to="/school" replace />;
    }
    if (location.pathname === '/onboarding') {
      return children;
    }
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

export const router = createBrowserRouter([
  // School Portal (PIN auth — student + parent). Lives OUTSIDE the family
  // auth tree: no Supabase JWT, no FamilyContext, no WorkspaceContext.
  {
    path: "school-login",
    element: (
      <PinAuthProvider>
        <PortalLogin />
      </PinAuthProvider>
    ),
    errorElement: <RouterErrorBoundary />,
  },
  {
    path: "school-portal",
    element: (
      <PinAuthProvider>
        <PortalRouteGuard>
          <PortalLayout />
        </PortalRouteGuard>
      </PinAuthProvider>
    ),
    errorElement: <RouterErrorBoundary />,
    children: [
      { index: true, element: <PortalHome /> },
      { path: "change-pin", element: <PortalChangePin /> },
      { path: "students/:studentId", element: <StudentDashboard /> },
      { path: "students/:studentId/lessons", element: <StudentLessons /> },
      { path: "students/:studentId/grades", element: <StudentGrades /> },
      { path: "students/:studentId/hifz", element: <StudentHifz /> },
      { path: "students/:studentId/timetable", element: <StudentTimetable /> },
      { path: "students/:studentId/attendance", element: <StudentAttendance /> },
      { path: "students/:studentId/behavior", element: <StudentBehavior /> },
      { path: "students/:studentId/fees", element: <MyStudentFees /> },
      { path: "forms", element: <MyForms /> },
      { path: "forms/:formId", element: <FormFill /> },
      { path: "announcements", element: <MyAnnouncements /> },
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
    path: ":orgSlug",
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
        element: <ProtectedRoute><Onboarding /></ProtectedRoute>,
      },
      {
        path: "/join-pending",
        element: <ProtectedRoute><JoinPending /></ProtectedRoute>,
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
        element: <ProtectedRoute><RequireFamily><RootLayout /></RequireFamily></ProtectedRoute>,
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
              { path: "admin/timetable", element: <ManageTimetable /> },
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
              { path: "students/:studentId/fees", element: <StudentFees /> },
              { path: "admin/forms", element: <FormsList /> },
              { path: "admin/forms/new", element: <FormBuilder /> },
              { path: "admin/forms/:formId", element: <FormBuilder /> },
              { path: "admin/forms/:formId/responses", element: <FormResponses /> },
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