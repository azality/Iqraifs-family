import { motion } from "motion/react";
import { useViewMode } from "../contexts/ViewModeContext";
import { Sparkles, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface ModeSwitcherProps {
  mobile?: boolean;
}

/**
 * ModeSwitcher - Lets a parent toggle between Parent view and Kid view.
 *
 * This control is ONLY shown to users who are actually logged in as a parent
 * (RootLayout already hides it for `isChildLoggedIn`). A kid should never
 * see this — and there is no longer a password backdoor for a kid to
 * escalate to parent view. If the kid needs parent access, the parent
 * must log in on the parent-login screen.
 *
 * Kid view for a parent is a READ-ONLY preview: mutations in kid pages
 * are gated on `isPreviewingAsKid` (see ViewModeContext) so the parent's
 * JWT cannot accidentally fire real kid actions.
 */
export function ModeSwitcher({ mobile = false }: ModeSwitcherProps) {
  const { viewMode, switchToKidMode, switchToParentMode } = useViewMode();

  const handleKidModeSwitch = () => {
    switchToKidMode();
    toast.success("Previewing as kid — actions are disabled 👀");
  };

  const handleParentModeSwitch = () => {
    switchToParentMode();
    toast.success("Switched to Parent View 📊");
  };

  if (mobile) {
    // Mobile: simple segmented toggle, full-width.
    return (
      <div className="flex items-center gap-2 w-full">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleKidModeSwitch}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
            viewMode === "kid"
              ? "bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] text-white shadow-lg"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-sm">Kid View</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleParentModeSwitch}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
            viewMode === "parent"
              ? "bg-gradient-to-r from-[var(--parent-deep-navy)] to-[var(--parent-calm-teal)] text-white shadow-lg"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-sm">Parent</span>
        </motion.button>
      </div>
    );
  }

  // Desktop: toggle-style switcher
  return (
    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleKidModeSwitch}
        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
          viewMode === "kid"
            ? "bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] text-white shadow-md"
            : "text-gray-700 hover:bg-gray-200"
        }`}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-sm">Kid View</span>
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleParentModeSwitch}
        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
          viewMode === "parent"
            ? "bg-gradient-to-r from-[var(--parent-deep-navy)] to-[var(--parent-calm-teal)] text-white shadow-md"
            : "text-gray-700 hover:bg-gray-200"
        }`}
      >
        <BarChart3 className="w-4 h-4" />
        <span className="text-sm">Parent</span>
      </motion.button>
    </div>
  );
}
