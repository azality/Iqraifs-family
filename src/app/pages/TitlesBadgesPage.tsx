import { motion } from "motion/react";
import { useFamilyContext } from "../contexts/FamilyContext";
import { TitlesBadges, calculateEarnedBadges, getAvailableBadges } from "../components/kid-mode/TitlesBadges";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export function TitlesBadgesPage() {
  const navigate = useNavigate();
  const { getCurrentChild } = useFamilyContext();
  const child = getCurrentChild();

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96 bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] rounded-[1.5rem] text-white">
        <p>Please select a child to view their badges! 🏆</p>
      </div>
    );
  }

  const earnedBadges = calculateEarnedBadges(child);
  const availableBadges = getAvailableBadges(earnedBadges);

  // Get current title based on highest milestone
  const getCurrentTitle = () => {
    if (child.currentPoints >= 1000) return "Legend";
    if (child.currentPoints >= 500) return "Rising Star";
    if (child.currentPoints >= 200) return "Achiever";
    if (child.currentPoints >= 100) return "Adventurer";
    if (child.currentPoints >= 50) return "Traveler";
    return "Explorer";
  };

  return (
    <div className="min-h-screen bg-[var(--kid-soft-cream)] pb-12">
      {/* Header */}
      <div className="bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] pt-8 pb-12 px-4 md:px-6 rounded-b-[2rem] shadow-lg mb-8">
        <div className="max-w-6xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => navigate("/kid/home")}
            className="flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl md:text-4xl font-bold text-white text-center mb-2">
              {child.name}'s Badges & Titles 🏆
            </h1>
            <p className="text-white/80 text-center">
              Your journey of growth and achievements
            </p>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <TitlesBadges
          earnedBadges={earnedBadges}
          availableBadges={availableBadges}
          currentTitle={getCurrentTitle()}
        />
      </div>
    </div>
  );
}