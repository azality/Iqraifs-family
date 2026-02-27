import { motion } from "motion/react";
import { useViewMode } from "../contexts/ViewModeContext";
import { Sparkles, BarChart3, Lock, User } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../contexts/AuthContext";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";

interface ModeSwitcherProps {
  mobile?: boolean;
}

export function ModeSwitcher({ mobile = false }: ModeSwitcherProps) {
  const { viewMode, switchToKidMode, switchToParentMode } = useViewMode();
  const { isParentMode, switchToParentMode: authSwitchParent } = useAuth();
  const [showPasswordSheet, setShowPasswordSheet] = useState(false);
  const [password, setPassword] = useState("");

  // Check if user is actually logged in as parent (has Supabase session)
  const userRole = localStorage.getItem("user_role");
  const isActualParent = userRole === "parent";

  const handleKidModeSwitch = () => {
    switchToKidMode();
    toast.success("Switched to Kid View! 🌙");
  };

  const handleParentModeSwitch = () => {
    // If user is actually a parent, they can freely switch views
    if (isActualParent) {
      switchToParentMode();
      toast.success("Switched to Parent View! 📊");
    } else {
      // If user is a kid trying to access parent mode, require password
      setShowPasswordSheet(true);
    }
  };

  const handlePasswordSubmit = () => {
    if (!password) {
      toast.error("Please enter the parent password");
      return;
    }

    const success = authSwitchParent(password);
    if (success) {
      switchToParentMode();
      setShowPasswordSheet(false);
      setPassword("");
      toast.success("Parent mode unlocked! 📊");
    } else {
      toast.error("Incorrect password");
    }
  };

  if (mobile) {
    // Mobile: Bottom Sheet Style Switcher
    return (
      <>
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
            {!isActualParent && <Lock className="w-4 h-4" />}
          </motion.button>
        </div>

        {/* Mobile Password Sheet */}
        <Sheet open={showPasswordSheet} onOpenChange={setShowPasswordSheet}>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-xl">
                <Lock className="w-6 h-6 text-blue-600" />
                Parent Access
              </SheetTitle>
              <SheetDescription>
                Enter your password to access parent features
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              <div className="space-y-3">
                <Label htmlFor="mobile-password" className="text-base">
                  Password
                </Label>
                <Input
                  id="mobile-password"
                  type="password"
                  placeholder="Enter parent password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handlePasswordSubmit()}
                  className="h-12 text-lg"
                  autoFocus
                />
                <p className="text-sm text-muted-foreground">
                  Default password: 1234
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handlePasswordSubmit}
                  className="w-full h-12 text-base"
                  size="lg"
                >
                  Unlock Parent Mode
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordSheet(false);
                    setPassword("");
                  }}
                  className="w-full h-12 text-base"
                  size="lg"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: Toggle Style Switcher
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
        {!isActualParent && <Lock className="w-3 h-3 ml-1" />}
      </motion.button>
    </div>
  );
}