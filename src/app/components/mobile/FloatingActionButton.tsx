import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { Plus, X, Zap, Award, Heart, BookOpen, Sparkles, Gift } from "lucide-react";
import { Link } from "react-router";

export function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isKidMode, setIsKidMode] = useState(false);

  // Detect if we're in kid mode
  useEffect(() => {
    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');
    setIsKidMode(userRole === 'child' || userMode === 'kid');
  }, []);

  // Parent mode actions
  const parentActions = [
    { label: "Log Behavior", icon: Zap, href: "/log", color: "bg-blue-500" },
    { label: "Rewards", icon: Award, href: "/rewards", color: "bg-purple-500" },
    { label: "Challenges", icon: Heart, href: "/challenges", color: "bg-pink-500" },
    { label: "Quizzes", icon: BookOpen, href: "/quizzes", color: "bg-green-500" },
  ];

  // Kid mode actions
  const kidActions = [
    { label: "My Wishlist", icon: Gift, href: "/kid/wishlist", color: "bg-blue-500" },
    { label: "My Quests", icon: Heart, href: "/kid/home", color: "bg-purple-500" },
    { label: "My Journey", icon: Sparkles, href: "/kid/home", color: "bg-pink-500" },
  ];

  const actions = isKidMode ? kidActions : parentActions;

  return (
    <div className="sm:hidden fixed bottom-20 right-4 z-40">
      {/* Action Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 space-y-3"
          >
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Link key={action.label} to={action.href} onClick={() => setIsOpen(false)}>
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3"
                  >
                    <span className="bg-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium text-gray-900 whitespace-nowrap">
                      {action.label}
                    </span>
                    <motion.div
                      whileTap={{ scale: 0.9 }}
                      className={`${action.color} w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg`}
                    >
                      <Icon className="w-6 h-6" />
                    </motion.div>
                  </motion.div>
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB Button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-colors ${
          isOpen ? "bg-red-500" : "bg-gradient-to-r from-blue-500 to-purple-500"
        }`}
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isOpen ? <X className="w-7 h-7" /> : <Plus className="w-7 h-7" />}
        </motion.div>
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/20 -z-10"
          />
        )}
      </AnimatePresence>
    </div>
  );
}