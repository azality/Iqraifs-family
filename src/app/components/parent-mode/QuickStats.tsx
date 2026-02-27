import { motion } from "motion/react";
import { TrendingUp, TrendingDown, Award, Calendar, Target, AlertCircle } from "lucide-react";

interface QuickStatsProps {
  stats: {
    totalPoints: number;
    highestMilestone: number;
    todayPositive: number;
    todayNegative: number;
    currentRatio: number;
    targetRatio?: number;
  };
}

export function QuickStats({ stats }: QuickStatsProps) {
  const isRatioHealthy = stats.currentRatio >= (stats.targetRatio || 3);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {/* Total Points */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
        className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Total Points</span>
          <Award className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-2xl font-bold text-gray-900">{stats.totalPoints}</div>
        <div className="text-xs text-gray-500 mt-1">
          Peak: {stats.highestMilestone}
        </div>
      </motion.div>

      {/* Today's Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Today</span>
          <Calendar className="w-4 h-4 text-purple-600" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-green-600">
            +{stats.todayPositive}
          </span>
          {stats.todayNegative < 0 && (
            <span className="text-sm font-semibold text-red-600">
              {stats.todayNegative}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {stats.todayNegative === 0 ? "Perfect day!" : "Activity logged"}
        </div>
      </motion.div>

      {/* Ratio */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`bg-white rounded-lg p-4 shadow-sm border ${
          isRatioHealthy ? "border-green-200" : "border-orange-200"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Ratio (3:1)</span>
          {isRatioHealthy ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-orange-600" />
          )}
        </div>
        <div
          className={`text-2xl font-bold ${
            isRatioHealthy ? "text-green-600" : "text-orange-600"
          }`}
        >
          {stats.currentRatio.toFixed(1)}:1
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {isRatioHealthy ? "Healthy" : "Needs attention"}
        </div>
      </motion.div>

      {/* Status Alert */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-lg p-4 shadow-sm border border-gray-100"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Status</span>
          <Target className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="text-sm font-semibold text-gray-900">
          {isRatioHealthy ? "On Track" : "Monitor"}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {isRatioHealthy
            ? "All metrics healthy"
            : "Review ratio balance"}
        </div>
      </motion.div>
    </div>
  );
}
