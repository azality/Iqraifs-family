import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface MosqueBuildProps {
  currentContribution: number;
  targetAmount: number;
  rewardName: string;
}

export function MosqueBuild({
  currentContribution,
  targetAmount,
  rewardName,
}: MosqueBuildProps) {
  const progressPercent = Math.min(
    (currentContribution / targetAmount) * 100,
    100
  );
  const [showSparkle, setShowSparkle] = useState(false);

  // Show sparkle animation when contribution increases
  useEffect(() => {
    if (currentContribution > 0) {
      setShowSparkle(true);
      const timer = setTimeout(() => setShowSparkle(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [currentContribution]);

  // Calculate visual layers based on progress
  const layers = [
    { name: "Foundation", threshold: 0, emoji: "🟫" },
    { name: "Walls", threshold: 20, emoji: "🧱" },
    { name: "Pillars", threshold: 40, emoji: "⬜" },
    { name: "Dome", threshold: 60, emoji: "🕌" },
    { name: "Minaret", threshold: 80, emoji: "🗼" },
    { name: "Crescent", threshold: 95, emoji: "🌙" },
  ];

  const activeLayer = layers
    .slice()
    .reverse()
    .find((layer) => progressPercent >= layer.threshold);

  const isComplete = progressPercent >= 100;

  return (
    <div className="relative bg-gradient-to-br from-[var(--kid-soft-cream)] to-[#FFEFD5] rounded-[1.5rem] p-6 shadow-[0_4px_16px_rgba(28,37,65,0.15)]">
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-xl font-bold text-[var(--kid-midnight-blue)] mb-1">
          Building: {rewardName}
        </h3>
        <p className="text-sm text-gray-600">
          {currentContribution} / {targetAmount} points contributed
        </p>
      </div>

      {/* Visual Mosque Build */}
      <div className="relative h-64 flex flex-col items-center justify-end mb-4 overflow-hidden">
        {/* Sparkle effect */}
        {showSparkle && (
          <motion.div
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          >
            <div className="text-6xl">✨</div>
          </motion.div>
        )}

        {/* Build layers stacking from bottom */}
        <div className="relative flex flex-col-reverse items-center gap-1">
          {layers.map((layer, index) => {
            const isActive = progressPercent >= layer.threshold;
            const opacity = isActive ? 1 : 0.2;

            return (
              <motion.div
                key={layer.name}
                initial={{ y: 50, opacity: 0 }}
                animate={{
                  y: isActive ? 0 : 50,
                  opacity: isActive ? opacity : 0.2,
                  scale: isActive ? 1 : 0.8,
                }}
                transition={{
                  duration: 0.5,
                  delay: isActive ? index * 0.15 : 0,
                  ease: "easeOut",
                }}
                className="text-center"
              >
                <div className={`text-5xl ${isActive ? "" : "grayscale"}`}>
                  {layer.emoji}
                </div>
                <div className="text-xs font-medium text-gray-700 mt-1">
                  {layer.name}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Completion Animation */}
        {isComplete && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="absolute top-0 right-0 bg-[var(--kid-warm-gold)] text-white rounded-full p-3 shadow-lg"
          >
            <span className="text-2xl">🎉</span>
          </motion.div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
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

      {/* Current Layer Indicator */}
      {activeLayer && !isComplete && (
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--kid-midnight-blue)]">
            Currently building: <span className="font-bold">{activeLayer.name}</span>
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {Math.ceil(targetAmount - currentContribution)} points until next layer
          </p>
        </div>
      )}

      {/* Completion Message */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center bg-[var(--kid-warm-gold)]/20 rounded-lg p-3"
        >
          <p className="text-lg font-bold text-[var(--kid-midnight-blue)] mb-1">
            Mosque Complete! 🕌
          </p>
          <p className="text-sm text-gray-700">
            Your {rewardName} is ready to redeem! ✨
          </p>
        </motion.div>
      )}
    </div>
  );
}
