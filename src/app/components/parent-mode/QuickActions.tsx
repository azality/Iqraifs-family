import { motion } from "motion/react";
import { Link } from "react-router";
import { Plus, TrendingUp, Gift, Calendar, FileText, Edit } from "lucide-react";

export function QuickActions() {
  const actions = [
    {
      label: "Log Behavior",
      icon: Plus,
      href: "/log",
      color: "bg-blue-500 hover:bg-blue-600",
      description: "Quick log",
    },
    {
      label: "Challenges",
      icon: TrendingUp,
      href: "/challenges",
      color: "bg-purple-500 hover:bg-purple-600",
      description: "View quests",
    },
    {
      label: "Rewards",
      icon: Gift,
      href: "/rewards",
      color: "bg-pink-500 hover:bg-pink-600",
      description: "Manage",
    },
    {
      label: "Attendance",
      icon: Calendar,
      href: "/attendance",
      color: "bg-green-500 hover:bg-green-600",
      description: "Track",
    },
    {
      label: "Review",
      icon: FileText,
      href: "/review",
      color: "bg-orange-500 hover:bg-orange-600",
      description: "Weekly",
    },
    {
      label: "Adjust",
      icon: Edit,
      href: "/adjustments",
      color: "bg-indigo-500 hover:bg-indigo-600",
      description: "Manual",
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Quick Actions</h3>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} to={action.href}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  <div
                    className={`w-12 h-12 rounded-full ${action.color} flex items-center justify-center text-white shadow-md group-hover:shadow-lg transition-shadow`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-gray-900">
                      {action.label}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {action.description}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
