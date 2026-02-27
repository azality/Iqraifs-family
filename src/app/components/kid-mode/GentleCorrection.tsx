import { motion } from "motion/react";
import { Heart, RefreshCw } from "lucide-react";

interface GentleCorrectionProps {
  behavior: string;
  points: number;
  recoveryOptions?: {
    apology: boolean;
    reflection: boolean;
    correction: boolean;
  };
  onRecover?: (type: "apology" | "reflection" | "correction") => void;
}

export function GentleCorrection({
  behavior,
  points,
  recoveryOptions,
  onRecover,
}: GentleCorrectionProps) {
  const displayPoints = Math.abs(points);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gradient-to-br from-[#FFF5F5] to-[#FFE5E5] rounded-[1rem] p-4 border-l-4 border-[var(--kid-gentle-coral)]"
    >
      {/* Icon and Message */}
      <div className="flex items-start gap-3 mb-3">
        <div className="text-3xl">🌿</div>
        <div className="flex-1">
          <h4 className="text-base font-semibold text-gray-800 mb-1">
            Let's try again
          </h4>
          <p className="text-sm text-gray-700">{behavior}</p>
          <p className="text-xs text-[var(--kid-gentle-coral)] font-medium mt-1">
            {displayPoints} points to practice
          </p>
        </div>
      </div>

      {/* Recovery Options */}
      {recoveryOptions && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600 mb-2">
            Choose how to grow:
          </p>

          {recoveryOptions.apology && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onRecover?.("apology")}
              className="w-full bg-white rounded-lg p-3 flex items-center gap-3 border border-gray-200 hover:border-[var(--kid-soft-emerald)] transition-colors"
            >
              <Heart className="w-5 h-5 text-[var(--kid-soft-emerald)]" />
              <div className="text-left flex-1">
                <div className="text-sm font-medium text-gray-800">
                  Say Sorry
                </div>
                <div className="text-xs text-gray-600">
                  Apologize and make things right
                </div>
              </div>
              <div className="text-xs font-semibold text-[var(--kid-soft-emerald)]">
                +{Math.floor(displayPoints * 0.5)}
              </div>
            </motion.button>
          )}

          {recoveryOptions.reflection && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onRecover?.("reflection")}
              className="w-full bg-white rounded-lg p-3 flex items-center gap-3 border border-gray-200 hover:border-[var(--kid-soft-emerald)] transition-colors"
            >
              <div className="text-2xl">🤔</div>
              <div className="text-left flex-1">
                <div className="text-sm font-medium text-gray-800">
                  Think & Share
                </div>
                <div className="text-xs text-gray-600">
                  Reflect on what happened
                </div>
              </div>
              <div className="text-xs font-semibold text-[var(--kid-soft-emerald)]">
                +{Math.floor(displayPoints * 0.5)}
              </div>
            </motion.button>
          )}

          {recoveryOptions.correction && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onRecover?.("correction")}
              className="w-full bg-white rounded-lg p-3 flex items-center gap-3 border border-gray-200 hover:border-[var(--kid-soft-emerald)] transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-[var(--kid-soft-emerald)]" />
              <div className="text-left flex-1">
                <div className="text-sm font-medium text-gray-800">
                  Make it Better
                </div>
                <div className="text-xs text-gray-600">
                  Fix what went wrong
                </div>
              </div>
              <div className="text-xs font-semibold text-[var(--kid-soft-emerald)]">
                +{Math.floor(displayPoints * 0.5)}
              </div>
            </motion.button>
          )}
        </div>
      )}

      {/* Encouragement Message */}
      <div className="mt-3 text-center">
        <p className="text-xs text-gray-600 italic">
          Everyone makes mistakes. What matters is how we grow! 🌱
        </p>
      </div>
    </motion.div>
  );
}
