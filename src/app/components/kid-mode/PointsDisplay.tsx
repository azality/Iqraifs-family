import { motion, useSpring, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { Sparkles, TrendingUp } from "lucide-react";

interface PointsDisplayProps {
  currentPoints: number;
  nextMilestone?: {
    name: string;
    points: number;
  };
  currentTitle?: string;
}

export function PointsDisplay({
  currentPoints,
  nextMilestone,
  currentTitle = "Explorer",
}: PointsDisplayProps) {
  const [displayPoints, setDisplayPoints] = useState(currentPoints);
  
  // Animate number counting
  const springValue = useSpring(currentPoints, {
    damping: 50,
    stiffness: 100,
  });

  useEffect(() => {
    springValue.set(currentPoints);
  }, [currentPoints, springValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      setDisplayPoints(Math.round(latest));
    });
    return unsubscribe;
  }, [springValue]);

  const pointsToNext = nextMilestone
    ? nextMilestone.points - currentPoints
    : 0;
  const progressPercent = nextMilestone
    ? (currentPoints / nextMilestone.points) * 100
    : 100;

  return (
    <div className="relative bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] rounded-[1.5rem] p-6 text-white shadow-[0_4px_16px_rgba(28,37,65,0.15)] overflow-hidden">
      {/* Background Stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
            className="absolute text-[var(--kid-star-shimmer)]"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              fontSize: `${8 + Math.random() * 8}px`,
            }}
          >
            ✨
          </motion.div>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Current Title */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-[var(--kid-warm-gold)]" />
          <span className="text-sm font-semibold text-[var(--kid-warm-gold)]">
            {currentTitle}
          </span>
          <Sparkles className="w-5 h-5 text-[var(--kid-warm-gold)]" />
        </div>

        {/* Points Display */}
        <motion.div
          className="text-center mb-4"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div className="text-6xl font-bold bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] bg-clip-text text-transparent">
            {displayPoints}
          </div>
          <div className="text-sm text-white/80 mt-1">Total Points</div>
        </motion.div>

        {/* Progress to Next Milestone */}
        {nextMilestone && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-white/70">
                Next: {nextMilestone.name}
              </span>
              <span className="text-xs font-semibold text-[var(--kid-warm-gold)]">
                {pointsToNext} more
              </span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progressPercent, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] relative"
              >
                {/* Shimmer effect */}
                <motion.div
                  animate={{
                    x: ["-100%", "100%"],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                />
              </motion.div>
            </div>
          </div>
        )}

        {/* Level Up Indicator */}
        {progressPercent >= 100 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center justify-center gap-2 bg-[var(--kid-warm-gold)]/20 rounded-lg p-2"
          >
            <TrendingUp className="w-4 h-4 text-[var(--kid-warm-gold)]" />
            <span className="text-xs font-semibold text-white">
              Ready to level up!
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
