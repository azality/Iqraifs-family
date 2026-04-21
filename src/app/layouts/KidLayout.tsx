import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, Compass, LogOut, Eye } from "lucide-react";
import { getStorageSync, removeStorageSync } from "../../utils/storage";
import { useViewMode } from "../contexts/ViewModeContext";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { cn } from "../components/ui/utils";

/**
 * KidLayout — shared chrome for every /kid/* route.
 *
 * Before this existed, each kid page rendered standalone:
 *   • KidDashboard had its own big "Assalamu Alaikum" hero + an inline
 *     "Parent Mode" button.
 *   • KidWishlist shipped its own "Back to Dashboard" button.
 *   • Challenges, PrayerLogging, TitlesBadgesPage, SadqaPage (reused parent
 *     pages) had NO back button at all — kids would get stranded.
 *
 * Now every kid route renders under a single persistent header:
 *   • Left: Back button (→ /kid/home). Hidden when already on /kid/home.
 *   • Center: kid avatar + name chip (identity at a glance).
 *   • Right: "Parent Mode" (real kid → log out to /login) or
 *     "Exit Preview" (parent-previewing-as-kid → switchToParentMode).
 *   • An amber "Previewing as kid" banner sits above the header when a
 *     parent has flipped into kid-view (isPreviewingAsKid === true).
 *
 * Individual pages drop their own back buttons / Parent Mode buttons — this
 * layout is the single source of both.
 */
export function KidLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isPreviewingAsKid, switchToParentMode } = useViewMode();

  const isDashboard = location.pathname === "/kid/home";
  const kidName = getStorageSync("kid_name") || "Adventurer";
  const kidAvatar = getStorageSync("kid_avatar") || "🌟";

  // Parent previewing → flip back to parent view (stays logged in).
  // Real kid → clear kid session and bounce to parent login.
  const handleExitToParent = () => {
    if (isPreviewingAsKid) {
      switchToParentMode();
      toast.success("Switched back to Parent View");
      return;
    }
    removeStorageSync("child_id");
    removeStorageSync("kid_id");
    removeStorageSync("kid_access_token");
    removeStorageSync("kid_session_token");
    removeStorageSync("kid_pin_session");
    removeStorageSync("user_role");
    removeStorageSync("fgs_user_mode");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[var(--kid-soft-cream)]">
      {/* Preview banner — only visible when parent is previewing as kid */}
      {isPreviewingAsKid && (
        <div className="bg-amber-400 text-amber-950 border-b border-amber-500 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-semibold truncate">
                Previewing as kid — actions are disabled
              </span>
            </div>
            <button
              onClick={() => {
                switchToParentMode();
                toast.success("Switched back to Parent View");
              }}
              className="text-xs font-semibold underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
            >
              Exit preview
            </button>
          </div>
        </div>
      )}

      {/* Shared kid header — identical on every /kid/* page */}
      <header
        className={cn(
          "bg-gradient-to-r from-[#1C2541] to-[#2C3E50] border-b border-[#F4C430]/20 shadow-md sticky z-30",
          isPreviewingAsKid ? "top-10" : "top-0"
        )}
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          {/* Left: Back to Dashboard (hidden on dashboard itself) */}
          {!isDashboard ? (
            <Button
              onClick={() => navigate("/kid/home")}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 hover:text-white px-2 sm:px-3"
              data-testid="kid-back-button"
            >
              <ArrowLeft className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
            </Button>
          ) : (
            <Link to="/kid/home" className="flex items-center gap-2 min-w-0">
              <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#F4C430] to-[#FFB347] flex items-center justify-center shadow-md shadow-amber-500/30 flex-shrink-0">
                <Compass className="h-5 w-5 text-[#1C2541]" />
              </span>
              <div className="min-w-0 hidden sm:block">
                <h1 className="text-sm font-bold leading-tight bg-gradient-to-r from-[#F4C430] to-[#FFE066] bg-clip-text text-transparent truncate">
                  Adventure Quest
                </h1>
                <p className="text-[10px] text-[#F4C430]/70 leading-tight truncate">
                  Your journey
                </p>
              </div>
            </Link>
          )}

          {/* Center: kid identity chip */}
          <div className="flex-1 flex justify-center">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15"
              title={kidName}
            >
              <span className="text-lg leading-none">{kidAvatar}</span>
              <span className="text-sm font-semibold text-white max-w-[140px] truncate">
                {kidName}
              </span>
            </div>
          </div>

          {/* Right: Parent Mode / Exit Preview */}
          <Button
            onClick={handleExitToParent}
            variant="outline"
            size="sm"
            className="bg-white/10 hover:bg-white/20 text-white border-white/30 hover:border-white/50 gap-1 px-2 sm:px-3"
            data-testid="kid-exit-button"
          >
            {isPreviewingAsKid ? (
              <>
                <Eye className="h-4 w-4 sm:mr-0.5" />
                <span className="hidden sm:inline text-xs font-medium">Exit</span>
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4 sm:mr-0.5" />
                <span className="hidden sm:inline text-xs font-medium">Parent</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Page content. Dashboard renders its own full-bleed hero, so it gets
          no layout padding. Every other page sits in a comfortable container. */}
      <main
        className={cn(
          isDashboard
            ? "pb-20 sm:pb-12"
            : "max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-20 sm:pb-12"
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
