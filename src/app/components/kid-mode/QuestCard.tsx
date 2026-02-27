import { motion } from "motion/react";
import { Flame, Star, Lock } from "lucide-react";

interface QuestCardProps {
  title: string;
  description: string;
  progress: number;
  total: number;
  icon?: string;
  bonusPoints?: number;
  isCompleted?: boolean;
  isLocked?: boolean;
}

export function QuestCard({
  title,
  description,
  progress,
  total,
  icon = "🕌",
  bonusPoints = 0,
  isCompleted = false,
  isLocked = false,
}: QuestCardProps) {
  const progressPercent = (progress / total) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: isLocked ? 1 : 1.02, y: isLocked ? 0 : -2 }}
      transition={{ duration: 0.2 }}
      className={`
        relative overflow-hidden
        rounded-[1rem] p-4
        ${
          isLocked
            ? "bg-gray-100 border-2 border-dashed border-gray-300"
            : "bg-gradient-to-br from-[var(--kid-soft-cream)] to-[#FFEFD5]"
        }
        shadow-[0_4px_16px_rgba(28,37,65,0.15)]
        ${!isLocked && "hover:shadow-[0_0_20px_rgba(244,196,48,0.3)]"}
        transition-all duration-300
      `}
    >
      {/* Locked Overlay */}
      {isLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10">
          <div className="text-center">
            <Lock className="w-12 h-12 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 font-medium">Locked Quest</p>
          </div>
        </div>
      )}

      {/* Completed Badge */}
      {isCompleted && !isLocked && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          className="absolute top-2 right-2 bg-[var(--kid-warm-gold)] rounded-full p-2"
        >
          <Star className="w-5 h-5 text-white fill-white" />
        </motion.div>
      )}

      {/* Icon */}
      <div className="text-4xl mb-2">{icon}</div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-[var(--kid-midnight-blue)] mb-1">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-600 mb-3">{description}</p>

      {/* Progress Bar */}
      {!isLocked && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-700">
              {progress} / {total}
            </span>
            {bonusPoints > 0 && (
              <span className="text-xs font-semibold text-[var(--kid-warm-gold)]">
                +{bonusPoints} pts
              </span>
            )}
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)]"
            />
          </div>
        </div>
      )}

      {/* Lanterns/Icons for progress */}
      {!isLocked && total <= 5 && (
        <div className="flex gap-2 mt-3">
          {Array.from({ length: total }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.3 }}
              animate={{
                opacity: i < progress ? 1 : 0.3,
                scale: i < progress ? 1.1 : 1,
              }}
              transition={{ delay: i * 0.1 }}
              className={`
                text-2xl
                ${i < progress ? "grayscale-0" : "grayscale opacity-40"}
              `}
            >
              {i < progress ? "🏮" : "⬜"}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
