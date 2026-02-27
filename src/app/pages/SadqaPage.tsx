import { motion } from "motion/react";
import { useFamilyContext } from "../contexts/FamilyContext";
import { SadqaGiving } from "../components/kid-mode/SadqaGiving";
import { ArrowLeft, Heart, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";

export function SadqaPage() {
  const navigate = useNavigate();
  const { getCurrentChild, logPointEvent } = useFamilyContext();
  const child = getCurrentChild();
  const [totalDonated, setTotalDonated] = useState(0);

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96 bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] rounded-[1.5rem] text-white">
        <p>Please select a child to give Sadqa! ❤️</p>
      </div>
    );
  }

  const handleDonate = async (optionId: string, points: number) => {
    // Create a negative event for spending points
    await logPointEvent({
      childId: child.id,
      trackableItemId: `sadqa:${optionId}`,
      points: -points,
      loggedBy: child.id,
      notes: `Donated ${points} points to ${optionId}`,
      isAdjustment: false,
      isSadqa: true,
    });

    setTotalDonated((prev) => prev + points);
  };

  return (
    <div className="min-h-screen bg-[var(--kid-soft-cream)] pb-12">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-600 to-green-800 pt-8 pb-12 px-4 md:px-6 rounded-b-[2rem] shadow-lg mb-8">
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
            <div className="flex items-center justify-center gap-3 mb-2">
              <Heart className="w-10 h-10 text-white fill-white" />
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                Give Sadqa
              </h1>
              <Heart className="w-10 h-10 text-white fill-white" />
            </div>
            <p className="text-white/90 text-center text-lg">
              Share your blessings with those in need
            </p>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 space-y-8">
        {/* Stats Card */}
        {totalDonated > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] rounded-[1.5rem] p-6 text-center shadow-lg"
          >
            <Sparkles className="w-12 h-12 text-white mx-auto mb-2" />
            <h2 className="text-2xl font-bold text-white mb-1">
              MashAllah! {child.name}
            </h2>
            <p className="text-white/90 mb-3">
              You've donated {totalDonated} points today!
            </p>
            <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
              <p className="text-sm text-white italic">
                "The believer's shade on the Day of Resurrection will be their
                charity" - Prophet Muhammad ﷺ
              </p>
            </div>
          </motion.div>
        )}

        {/* Sadqa Giving Component */}
        <SadqaGiving
          currentPoints={child.currentPoints}
          onDonate={handleDonate}
        />

        {/* Islamic Teaching Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-[1.5rem] p-6 shadow-md"
        >
          <h3 className="text-xl font-bold text-[var(--kid-midnight-blue)] mb-4 text-center">
            Why Give Sadqa? 🤲
          </h3>

          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-green-900 mb-2">
                <strong>🌟 Purifies Your Wealth</strong>
              </p>
              <p className="text-xs text-green-800">
                Sadqa cleanses our hearts and reminds us that everything we
                have is a blessing from Allah.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-900 mb-2">
                <strong>❤️ Helps Others</strong>
              </p>
              <p className="text-xs text-blue-800">
                Your charity can provide food, education, or shelter to someone
                who really needs it!
              </p>
            </div>

            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm text-purple-900 mb-2">
                <strong>✨ Increases Blessings</strong>
              </p>
              <p className="text-xs text-purple-800">
                Allah promises that when we give, He gives us back even more -
                not just in money, but in happiness and peace!
              </p>
            </div>

            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <p className="text-sm text-orange-900 mb-2">
                <strong>🏆 Earns Special Rewards</strong>
              </p>
              <p className="text-xs text-orange-800">
                Every time you give Sadqa, you earn special badges like
                "Generous Heart" and "Helper of Humanity"!
              </p>
            </div>
          </div>
        </motion.div>

        {/* Encouragement */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center py-6"
        >
          <p className="text-lg text-gray-600 italic">
            "The most beloved deeds to Allah are those done consistently, even
            if small" 🌙
          </p>
        </motion.div>
      </div>
    </div>
  );
}