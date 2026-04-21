import { createBrowserRouter, Navigate } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireParentRole } from "./components/RequireParentRole";
import { Welcome } from "./pages/Welcome";
import { ParentLogin } from "./pages/ParentLogin";
import { ParentSignup } from "./pages/ParentSignup";
import { KidLoginNew } from "./pages/KidLoginNew";
import { DashboardRouter } from "./pages/DashboardRouter";
import { LogBehavior } from "./pages/LogBehavior";
import { WeeklyReview } from "./pages/WeeklyReview";
import { Adjustments } from "./pages/Adjustments";
import { AttendanceNew } from "./pages/AttendanceNew";
import { Rewards } from "./pages/Rewards";
import { AuditTrail } from "./pages/AuditTrail";
import { Settings } from "./pages/Settings";
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
import { RootLayout } from "./layouts/RootLayout";
import { KidLayout } from "./layouts/KidLayout";
import { ProvidersLayout } from "./layouts/ProvidersLayout";
import { PrayerLogging } from "./pages/PrayerLogging";
import { PrayerApprovals } from "./pages/PrayerApprovals";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { WishlistDebug } from "./pages/WishlistDebug";
import { AdventureWorld } from "./pages/AdventureWorld";
import { JannahGarden } from "./pages/JannahGarden";
import { DuaSpellCasting } from "./pages/games/DuaSpellCasting";
import { AyahPuzzle } from "./pages/games/AyahPuzzle";
import { MakkahZone } from "./pages/adventure-zones/MakkahZone";
import { MadinahZone } from "./pages/adventure-zones/MadinahZone";
import { QuranValleyZone } from "./pages/adventure-zones/QuranValleyZone";
import { DesertTrialsZone } from "./pages/adventure-zones/DesertTrialsZone";
import { ZonePlay } from "./pages/adventure-zones/ZonePlay";
import { useState, useEffect } from "react";
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

  // Show loading state while checking
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to onboarding if no family access
  if (!hasFamilyAccess) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

export const router = createBrowserRouter([
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
          { path: "adjustments", element: <RequireParentRole><Adjustments /></RequireParentRole> },
          { path: "attendance", element: <RequireParentRole><AttendanceNew /></RequireParentRole> },
          { path: "rewards", element: <RequireParentRole><Rewards /></RequireParentRole> },
          { path: "audit", element: <RequireParentRole><AuditTrail /></RequireParentRole> },
          { path: "settings", element: <RequireParentRole><Settings /></RequireParentRole> },
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