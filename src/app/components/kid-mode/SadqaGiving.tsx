import { motion } from "motion/react";
import { useState } from "react";
import { Heart, Coins, Users, Book, Home, HandHeart } from "lucide-react";

interface SadqaOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  pointCost: number;
  impact: string;
  category: "food" | "education" | "shelter" | "general";
}

interface SadqaGivingProps {
  currentPoints: number;
  onDonate: (optionId: string, points: number) => Promise<void>;
}

const sadqaOptions: SadqaOption[] = [
  {
    id: "food-family",
    name: "Feed a Family",
    description: "Provide a meal for a family in need",
    icon: <Users className="w-8 h-8" />,
    pointCost: 50,
    impact: "1 family meal",
    category: "food",
  },
  {
    id: "education-book",
    name: "Gift a Book",
    description: "Donate a book to a student",
    icon: <Book className="w-8 h-8" />,
    pointCost: 30,
    impact: "1 book for learning",
    category: "education",
  },
  {
    id: "shelter-blanket",
    name: "Warm Blanket",
    description: "Provide warmth for someone in need",
    icon: <Home className="w-8 h-8" />,
    pointCost: 40,
    impact: "1 blanket",
    category: "shelter",
  },
  {
    id: "general-help",
    name: "General Sadqa",
    description: "Contribute to general charity fund",
    icon: <HandHeart className="w-8 h-8" />,
    pointCost: 20,
    impact: "General support",
    category: "general",
  },
];

export function SadqaGiving({ currentPoints, onDonate }: SadqaGivingProps) {
  const [selectedOption, setSelectedOption] = useState<SadqaOption | null>(
    null
  );
  const [isDonating, setIsDonating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleDonate = async (option: SadqaOption) => {
    if (currentPoints < option.pointCost) {
      alert(
        `You need ${option.pointCost - currentPoints} more points to donate this!`
      );
      return;
    }

    setIsDonating(true);
    try {
      await onDonate(option.id, option.pointCost);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedOption(null);
      }, 3000);
    } catch (error) {
      console.error("Donation error:", error);
      alert("Failed to donate. Please try again.");
    } finally {
      setIsDonating(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-[var(--kid-soft-cream)] to-[#FFEFD5] rounded-[1.5rem] p-6 shadow-lg">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Heart className="w-8 h-8 text-red-500 fill-red-500" />
          <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)]">
            Give Sadqa
          </h2>
          <Heart className="w-8 h-8 text-red-500 fill-red-500" />
        </div>
        <p className="text-sm text-gray-600">
          "The best charity is that given in Ramadan" - Prophet Muhammad ﷺ
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Use your points to help others and earn special rewards!
        </p>
      </div>

      {/* Current Points */}
      <div className="bg-white rounded-lg p-4 mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Coins className="w-5 h-5 text-[var(--kid-warm-gold)]" />
          <span className="text-sm text-gray-600">Your Points:</span>
        </div>
        <div className="text-3xl font-bold text-[var(--kid-midnight-blue)]">
          {currentPoints}
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-100 border-2 border-green-400 rounded-lg p-4 mb-6 text-center"
        >
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-green-800 font-semibold">
            May Allah accept your charity!
          </p>
          <p className="text-sm text-green-700 mt-1">
            Your kindness will help someone in need ❤️
          </p>
        </motion.div>
      )}

      {/* Sadqa Options */}
      <div className="grid gap-4 sm:grid-cols-2">
        {sadqaOptions.map((option, index) => {
          const canAfford = currentPoints >= option.pointCost;

          return (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: canAfford ? 1.03 : 1 }}
              className={`
                relative rounded-[1rem] p-4 border-2
                ${
                  canAfford
                    ? "bg-white border-[var(--kid-warm-gold)] cursor-pointer hover:shadow-[0_0_20px_rgba(244,196,48,0.3)]"
                    : "bg-gray-100 border-gray-300 opacity-60"
                }
                transition-all duration-300
              `}
              onClick={() => canAfford && setSelectedOption(option)}
            >
              {/* Icon */}
              <div
                className={`
                flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-3
                ${getCategoryColor(option.category)}
              `}
              >
                <div className="text-white">{option.icon}</div>
              </div>

              {/* Name */}
              <h3 className="text-center font-bold text-[var(--kid-midnight-blue)] mb-1">
                {option.name}
              </h3>

              {/* Description */}
              <p className="text-xs text-center text-gray-600 mb-3">
                {option.description}
              </p>

              {/* Impact */}
              <div className="bg-[var(--kid-warm-gold)]/10 rounded-lg p-2 mb-3">
                <p className="text-xs text-center text-gray-700">
                  <strong>Impact:</strong> {option.impact}
                </p>
              </div>

              {/* Cost */}
              <div className="flex items-center justify-center gap-2">
                <Coins className="w-4 h-4 text-[var(--kid-warm-gold)]" />
                <span className="font-bold text-[var(--kid-midnight-blue)]">
                  {option.pointCost} points
                </span>
              </div>

              {/* Cannot Afford Badge */}
              {!canAfford && (
                <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  Need {option.pointCost - currentPoints} more
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      {selectedOption && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !isDonating && setSelectedOption(null)}
        >
          <motion.div
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-[1.5rem] p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div
                className={`
                inline-flex items-center justify-center w-20 h-20 rounded-full mb-3
                ${getCategoryColor(selectedOption.category)}
              `}
              >
                <div className="text-white scale-125">
                  {selectedOption.icon}
                </div>
              </div>
              <h3 className="text-xl font-bold text-[var(--kid-midnight-blue)] mb-2">
                Confirm Your Sadqa
              </h3>
              <p className="text-gray-600 mb-4">
                {selectedOption.description}
              </p>

              <div className="bg-[var(--kid-warm-gold)]/10 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>You will donate:</strong>
                </p>
                <div className="text-3xl font-bold text-[var(--kid-midnight-blue)] mb-2">
                  {selectedOption.pointCost} points
                </div>
                <p className="text-xs text-gray-600">
                  Remaining: {currentPoints - selectedOption.pointCost} points
                </p>
              </div>

              <p className="text-xs text-green-700 italic mb-4">
                "Allah loves those who are kind" 💚
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedOption(null)}
                disabled={isDonating}
                className="flex-1 px-4 py-3 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDonate(selectedOption)}
                disabled={isDonating}
                className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isDonating ? "Donating..." : "Donate Now ❤️"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Info Footer */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
        <p className="text-xs text-blue-800 text-center">
          <strong>Did you know?</strong> When you give Sadqa with your points,
          you earn special "Generous Heart" badges and help real people! 🌟
        </p>
      </div>
    </div>
  );
}

function getCategoryColor(category: SadqaOption["category"]): string {
  switch (category) {
    case "food":
      return "bg-green-500";
    case "education":
      return "bg-blue-500";
    case "shelter":
      return "bg-orange-500";
    case "general":
      return "bg-purple-500";
    default:
      return "bg-gray-500";
  }
}
