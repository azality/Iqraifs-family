import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Plus, Minus, Edit, AlertCircle } from "lucide-react";
import { PointEvent } from "../../data/mockData";
import { Badge } from "../ui/badge";

interface ActivityFeedProps {
  events: PointEvent[];
  trackableItems: any[];
  maxItems?: number;
}

export function ActivityFeed({ events, trackableItems, maxItems = 10 }: ActivityFeedProps) {
  const recentEvents = events.slice(0, maxItems);

  const getItemName = (itemId: string) => {
    const item = trackableItems.find((i) => i.id === itemId);
    return item?.name || "Unknown";
  };

  const getEventIcon = (event: PointEvent) => {
    if (event.points > 0) return <Plus className="w-4 h-4 text-green-600" />;
    if (event.points < 0) return <Minus className="w-4 h-4 text-red-600" />;
    return <Edit className="w-4 h-4 text-gray-600" />;
  };

  const getEventColor = (event: PointEvent) => {
    if (event.points > 0) return "border-green-200 bg-green-50";
    if (event.points < 0) return "border-red-200 bg-red-50";
    return "border-gray-200 bg-gray-50";
  };

  if (recentEvents.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600">No recent activity</p>
        <p className="text-sm text-gray-500 mt-1">Events will appear here as they're logged</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Recent Activity</h3>
      </div>

      <div className="divide-y divide-gray-100">
        {recentEvents.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`px-4 py-3 hover:bg-gray-50 transition-colors border-l-4 ${getEventColor(event)}`}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {getEventIcon(event)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {getItemName(event.trackableItemId)}
                  </p>
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${
                      event.points > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {event.points > 0 ? "+" : ""}
                    {event.points}
                  </span>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(event.timestamp), {
                      addSuffix: true,
                    })}
                  </span>

                  {event.loggedBy && (
                    <Badge variant="outline" className="text-xs">
                      {event.loggedBy}
                    </Badge>
                  )}

                  {event.isManualAdjustment && (
                    <Badge variant="secondary" className="text-xs">
                      Manual
                    </Badge>
                  )}

                  {event.recoveryOffered && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                      Recovery
                    </Badge>
                  )}
                </div>

                {/* Reason */}
                {event.reason && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {event.reason}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
