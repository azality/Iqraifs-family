import { motion } from "motion/react";
import { Lock, Star, MapPin } from "lucide-react";

interface Land {
  id: string;
  name: string;
  emoji: string;
  pointsRequired: number;
  isUnlocked: boolean;
  isCurrent: boolean;
  description: string;
}

interface AdventureMapProps {
  lands: Land[];
  currentPoints: number;
}

export function AdventureMap({ lands, currentPoints }: AdventureMapProps) {
  return (
    <div className="relative">
      {/* Map Title */}
      <div className="mb-4 text-center">
        <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-1">
          Your Journey 🗺️
        </h2>
        <p className="text-sm text-gray-600">
          Unlock new lands by earning points and growing!
        </p>
      </div>

      {/* Horizontal Scrolling Container */}
      <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-[var(--kid-warm-gold)] scrollbar-track-gray-200">
        <div className="flex gap-6 min-w-max px-4">
          {lands.map((land, index) => (
            <LandCard
              key={land.id}
              land={land}
              index={index}
              currentPoints={currentPoints}
              isLast={index === lands.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-600">
          {lands.filter((l) => l.isUnlocked).length} / {lands.length} lands
          unlocked
        </p>
      </div>
    </div>
  );
}

function LandCard({
  land,
  index,
  currentPoints,
  isLast,
}: {
  land: Land;
  index: number;
  currentPoints: number;
  isLast: boolean;
}) {
  const pointsNeeded = Math.max(0, land.pointsRequired - currentPoints);

  return (
    <div className="flex items-center gap-4">
      {/* Land Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.1 }}
        whileHover={{ scale: land.isUnlocked ? 1.05 : 1 }}
        className={`
          relative w-48 h-64 rounded-[1.5rem] p-4
          flex flex-col items-center justify-center
          ${
            land.isUnlocked
              ? "bg-gradient-to-br from-[var(--kid-soft-cream)] to-[#FFEFD5] shadow-[0_4px_16px_rgba(28,37,65,0.15)]"
              : "bg-gray-200 border-2 border-dashed border-gray-400"
          }
          ${land.isCurrent && "ring-4 ring-[var(--kid-warm-gold)]"}
          transition-all duration-300
        `}
      >
        {/* Current Land Badge */}
        {land.isCurrent && land.isUnlocked && (
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-[var(--kid-warm-gold)] text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
            You are here!
          </div>
        )}

        {/* Locked Overlay */}
        {!land.isUnlocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/60 backdrop-blur-sm rounded-[1.5rem] z-10">
            <Lock className="w-12 h-12 text-white mb-3" />
            <h3 className="text-base font-bold text-white mb-1 px-4 text-center">
              {land.name}
            </h3>
            <p className="text-sm font-semibold text-[var(--kid-warm-gold)] bg-white/20 px-3 py-1 rounded-full">
              {pointsNeeded} more points
            </p>
            <p className="text-xs text-white/80 mt-2 text-center px-4">
              {land.description}
            </p>
          </div>
        )}

        {/* Land Emoji */}
        <div
          className={`text-6xl mb-3 ${!land.isUnlocked && "grayscale opacity-30"}`}
        >
          {land.emoji}
        </div>

        {/* Land Name */}
        <h3
          className={`text-lg font-bold text-center mb-2 ${
            land.isUnlocked
              ? "text-[var(--kid-midnight-blue)]"
              : "text-gray-500"
          }`}
        >
          {land.name}
        </h3>

        {/* Description */}
        <p
          className={`text-xs text-center ${
            land.isUnlocked ? "text-gray-600" : "text-gray-400"
          }`}
        >
          {land.description}
        </p>

        {/* Points Required Badge */}
        <div
          className={`absolute bottom-3 px-3 py-1 rounded-full text-xs font-semibold ${
            land.isUnlocked
              ? "bg-[var(--kid-soft-emerald)] text-white"
              : "bg-gray-300 text-gray-600"
          }`}
        >
          {land.pointsRequired} pts
        </div>

        {/* Unlocked Star */}
        {land.isUnlocked && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: index * 0.15 }}
            className="absolute top-3 right-3"
          >
            <Star className="w-6 h-6 text-[var(--kid-warm-gold)] fill-[var(--kid-warm-gold)]" />
          </motion.div>
        )}
      </motion.div>

      {/* Path Connector (not for last item) */}
      {!isLast && (
        <div className="flex flex-col items-center">
          <div className="w-16 h-1 bg-gradient-to-r from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] rounded-full" />
          <div className="text-xs text-gray-500 mt-1">→</div>
        </div>
      )}
    </div>
  );
}