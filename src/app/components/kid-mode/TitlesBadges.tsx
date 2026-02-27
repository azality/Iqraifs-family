import { motion } from "motion/react";
import { Award, Star, Flame, Shield, Sparkles, Crown } from "lucide-react";

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  earned: boolean;
  earnedDate?: string;
  category: "streak" | "integrity" | "consistency" | "achievement";
  rarity: "common" | "rare" | "epic" | "legendary";
}

interface TitlesBadgesProps {
  earnedBadges: Badge[];
  availableBadges: Badge[];
  currentTitle?: string;
}

export function TitlesBadges({
  earnedBadges,
  availableBadges,
  currentTitle = "Explorer",
}: TitlesBadgesProps) {
  return (
    <div className="space-y-6">
      {/* Current Title Display */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] rounded-[1.5rem] p-6 text-center shadow-lg"
      >
        <Crown className="w-12 h-12 text-[var(--kid-warm-gold)] mx-auto mb-2" />
        <p className="text-sm text-white/70 mb-1">Your Current Title</p>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] bg-clip-text text-transparent">
          {currentTitle}
        </h2>
      </motion.div>

      {/* Earned Badges */}
      {earnedBadges.length > 0 && (
        <div>
          <h3 className="text-xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
            <Award className="w-6 h-6 text-[var(--kid-warm-gold)]" />
            Your Badges ({earnedBadges.length})
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {earnedBadges.map((badge, index) => (
              <BadgeCard key={badge.id} badge={badge} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Available Badges to Earn */}
      {availableBadges.length > 0 && (
        <div>
          <h3 className="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-gray-400" />
            Badges to Earn ({availableBadges.length})
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableBadges.map((badge, index) => (
              <BadgeCard
                key={badge.id}
                badge={badge}
                index={index}
                locked
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BadgeCard({
  badge,
  index,
  locked = false,
}: {
  badge: Badge;
  index: number;
  locked?: boolean;
}) {
  const rarityColors = {
    common: "from-gray-100 to-gray-200 border-gray-300",
    rare: "from-blue-100 to-blue-200 border-blue-300",
    epic: "from-purple-100 to-purple-200 border-purple-300",
    legendary:
      "from-[var(--kid-warm-gold)]/20 to-[var(--kid-lantern-glow)]/20 border-[var(--kid-warm-gold)]",
  };

  const rarityGlow = {
    common: "",
    rare: "shadow-[0_0_15px_rgba(59,130,246,0.3)]",
    epic: "shadow-[0_0_15px_rgba(147,51,234,0.3)]",
    legendary: "shadow-[0_0_20px_rgba(244,196,48,0.5)]",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ scale: locked ? 1 : 1.05, y: locked ? 0 : -4 }}
      className={`
        relative rounded-[1rem] p-4
        bg-gradient-to-br ${locked ? "from-gray-100 to-gray-200" : rarityColors[badge.rarity]}
        border-2 ${locked ? "border-dashed border-gray-300" : `border-solid ${rarityColors[badge.rarity].split("border-")[1]}`}
        ${!locked && rarityGlow[badge.rarity]}
        transition-all duration-300
      `}
    >
      {/* Locked Overlay */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm rounded-[1rem] z-10">
          <div className="text-center">
            <div className="text-4xl mb-2 opacity-30">🔒</div>
            <p className="text-xs text-gray-600 font-medium">Not Earned Yet</p>
          </div>
        </div>
      )}

      {/* Rarity Badge */}
      {!locked && (
        <div className="absolute top-2 right-2">
          <div
            className={`
            text-xs font-bold px-2 py-1 rounded-full
            ${
              badge.rarity === "legendary"
                ? "bg-[var(--kid-warm-gold)] text-white"
                : badge.rarity === "epic"
                  ? "bg-purple-500 text-white"
                  : badge.rarity === "rare"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-500 text-white"
            }
          `}
          >
            {badge.rarity}
          </div>
        </div>
      )}

      {/* Badge Icon */}
      <div className="flex justify-center mb-3">
        <motion.div
          animate={
            !locked && badge.rarity === "legendary"
              ? {
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.1, 1],
                }
              : {}
          }
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatType: "reverse",
          }}
          className={`
            text-5xl
            ${locked ? "grayscale opacity-30" : ""}
          `}
        >
          {badge.icon}
        </motion.div>
      </div>

      {/* Badge Name */}
      <h4
        className={`
        text-center font-bold mb-1
        ${locked ? "text-gray-500" : "text-[var(--kid-midnight-blue)]"}
      `}
      >
        {badge.name}
      </h4>

      {/* Description */}
      <p
        className={`
        text-xs text-center mb-2
        ${locked ? "text-gray-400" : "text-gray-600"}
      `}
      >
        {badge.description}
      </p>

      {/* Category Tag */}
      <div className="flex justify-center">
        <span
          className={`
          text-xs px-2 py-1 rounded-full
          ${locked ? "bg-gray-200 text-gray-500" : "bg-white/50 text-gray-700"}
        `}
        >
          {getCategoryIcon(badge.category)} {badge.category}
        </span>
      </div>

      {/* Earned Date */}
      {!locked && badge.earnedDate && (
        <p className="text-xs text-center text-gray-500 mt-2">
          Earned: {new Date(badge.earnedDate).toLocaleDateString()}
        </p>
      )}
    </motion.div>
  );
}

function getCategoryIcon(category: Badge["category"]): string {
  switch (category) {
    case "streak":
      return "🔥";
    case "integrity":
      return "🛡️";
    case "consistency":
      return "📅";
    case "achievement":
      return "🏆";
    default:
      return "⭐";
  }
}

// Helper function to calculate earned badges based on child data
export function calculateEarnedBadges(child: any): Badge[] {
  const badges: Badge[] = [];

  // Streak Badges
  const maxStreak = Math.max(
    ...Object.values(child.streaks || {}).map((s: any) => s.current || 0),
    0
  );

  if (maxStreak >= 3) {
    badges.push({
      id: "streak-3",
      name: "Fire Starter",
      description: "Maintained a 3-day streak",
      icon: <Flame className="w-12 h-12 text-orange-500" />,
      earned: true,
      earnedDate: new Date().toISOString(),
      category: "streak",
      rarity: "common",
    });
  }

  if (maxStreak >= 7) {
    badges.push({
      id: "streak-7",
      name: "Week Warrior",
      description: "Maintained a 7-day streak",
      icon: <Flame className="w-12 h-12 text-orange-600" />,
      earned: true,
      earnedDate: new Date().toISOString(),
      category: "streak",
      rarity: "rare",
    });
  }

  if (maxStreak >= 30) {
    badges.push({
      id: "streak-30",
      name: "Unstoppable",
      description: "Maintained a 30-day streak!",
      icon: <Flame className="w-12 h-12 text-red-600" />,
      earned: true,
      earnedDate: new Date().toISOString(),
      category: "streak",
      rarity: "legendary",
    });
  }

  // Achievement Badges
  if (child.currentPoints >= 100) {
    badges.push({
      id: "points-100",
      name: "Century Club",
      description: "Earned 100 total points",
      icon: <Star className="w-12 h-12 text-yellow-500 fill-yellow-500" />,
      earned: true,
      earnedDate: new Date().toISOString(),
      category: "achievement",
      rarity: "common",
    });
  }

  if (child.currentPoints >= 500) {
    badges.push({
      id: "points-500",
      name: "Rising Star",
      description: "Earned 500 total points",
      icon: <Star className="w-12 h-12 text-blue-500 fill-blue-500" />,
      earned: true,
      earnedDate: new Date().toISOString(),
      category: "achievement",
      rarity: "epic",
    });
  }

  if (child.currentPoints >= 1000) {
    badges.push({
      id: "points-1000",
      name: "Legend",
      description: "Earned 1000+ points!",
      icon: <Crown className="w-12 h-12 text-[var(--kid-warm-gold)]" />,
      earned: true,
      earnedDate: new Date().toISOString(),
      category: "achievement",
      rarity: "legendary",
    });
  }

  // Integrity Badge (no negative events in last 7 days)
  // This would require event data - placeholder for now

  return badges;
}

// Helper function to get available badges
export function getAvailableBadges(earnedBadges: Badge[]): Badge[] {
  const allPossibleBadges: Badge[] = [
    {
      id: "streak-3",
      name: "Fire Starter",
      description: "Maintain a 3-day streak",
      icon: <Flame className="w-12 h-12 text-orange-500" />,
      earned: false,
      category: "streak",
      rarity: "common",
    },
    {
      id: "streak-7",
      name: "Week Warrior",
      description: "Maintain a 7-day streak",
      icon: <Flame className="w-12 h-12 text-orange-600" />,
      earned: false,
      category: "streak",
      rarity: "rare",
    },
    {
      id: "streak-30",
      name: "Unstoppable",
      description: "Maintain a 30-day streak",
      icon: <Flame className="w-12 h-12 text-red-600" />,
      earned: false,
      category: "streak",
      rarity: "legendary",
    },
    {
      id: "points-100",
      name: "Century Club",
      description: "Earn 100 total points",
      icon: <Star className="w-12 h-12 text-yellow-500 fill-yellow-500" />,
      earned: false,
      category: "achievement",
      rarity: "common",
    },
    {
      id: "points-500",
      name: "Rising Star",
      description: "Earn 500 total points",
      icon: <Star className="w-12 h-12 text-blue-500 fill-blue-500" />,
      earned: false,
      category: "achievement",
      rarity: "epic",
    },
    {
      id: "points-1000",
      name: "Legend",
      description: "Earn 1000+ points",
      icon: <Crown className="w-12 h-12 text-[var(--kid-warm-gold)]" />,
      earned: false,
      category: "achievement",
      rarity: "legendary",
    },
    {
      id: "integrity-week",
      name: "Guardian of Good",
      description: "7 days with no negative behaviors",
      icon: <Shield className="w-12 h-12 text-green-600" />,
      earned: false,
      category: "integrity",
      rarity: "rare",
    },
    {
      id: "consistency-salah",
      name: "Prayer Champion",
      description: "All 5 prayers for 7 days straight",
      icon: <div className="text-5xl">🕌</div>,
      earned: false,
      category: "consistency",
      rarity: "epic",
    },
  ];

  const earnedIds = new Set(earnedBadges.map((b) => b.id));
  return allPossibleBadges.filter((badge) => !earnedIds.has(badge.id));
}
