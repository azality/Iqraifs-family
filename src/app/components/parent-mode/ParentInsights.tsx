/**
 * v26: ParentInsights — turns data into guidance.
 *
 * The parent already sees points, ratios, and feeds. What they don't
 * see is the *pattern* over the last 7 days vs the previous 7 days,
 * and what to do about it. This card surfaces 1–3 plain-language
 * insights derived locally from `pointEvents`. No new endpoint.
 *
 * Examples it produces:
 *   "Yusuf's Salah is improving — 28 prayers this week vs 22 last week."
 *   "Asr was missed 4 days in a row. Consider a small nudge."
 *   "3 negative behaviors logged this week, all on weekends."
 *
 * Insights are heuristics — when the data is too thin or trends are
 * flat, the card hides itself rather than fabricating commentary.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, AlertCircle, Sparkles } from 'lucide-react';

interface ParentInsightsProps {
  childName: string;
  pointEvents: any[];   // already filtered to this child
  salahItemIds?: string[]; // ids of salah trackable items, used for
                            // the salah-specific insight when known
}

interface Insight {
  tone: 'positive' | 'concern' | 'neutral';
  text: string;
}

const DAY_MS = 86400000;

export function ParentInsights({ childName, pointEvents, salahItemIds }: ParentInsightsProps) {
  const insights = useMemo<Insight[]>(() => {
    if (!pointEvents || pointEvents.length < 5) return [];

    const now = Date.now();
    const last7Start = now - 7 * DAY_MS;
    const prev7Start = now - 14 * DAY_MS;

    const inWindow = (e: any, start: number, end: number) => {
      const t = new Date(e.timestamp).getTime();
      return t >= start && t < end;
    };

    const last7 = pointEvents.filter(e => inWindow(e, last7Start, now));
    const prev7 = pointEvents.filter(e => inWindow(e, prev7Start, last7Start));

    const out: Insight[] = [];

    // Salah-specific trend
    if (salahItemIds && salahItemIds.length > 0) {
      const salahLast = last7.filter(e => salahItemIds.includes(e.trackableItemId) && e.points > 0).length;
      const salahPrev = prev7.filter(e => salahItemIds.includes(e.trackableItemId) && e.points > 0).length;
      if (salahLast > salahPrev && salahLast >= 5) {
        out.push({
          tone: 'positive',
          text: `${childName}'s Salah is improving — ${salahLast} this week vs ${salahPrev} last week.`,
        });
      } else if (salahPrev > 0 && salahLast < salahPrev * 0.6) {
        out.push({
          tone: 'concern',
          text: `${childName}'s Salah is down this week — ${salahLast} prayed (was ${salahPrev}). A gentle check-in might help.`,
        });
      }
    }

    // Overall positive trend
    const posLast = last7.filter(e => e.points > 0 && !e.isBonus).length;
    const posPrev = prev7.filter(e => e.points > 0 && !e.isBonus).length;
    if (posLast >= 7 && posLast > posPrev * 1.2) {
      out.push({
        tone: 'positive',
        text: `Strong week — ${posLast} good things logged for ${childName} (up from ${posPrev}).`,
      });
    }

    // Negative behavior cluster (only mention when there's a real cluster)
    const negLast = last7.filter(e => e.points < 0 && !e.isAdjustment);
    if (negLast.length >= 3) {
      // Group by day-of-week to spot weekend clusters etc
      const dows = new Set(negLast.map(e => new Date(e.timestamp).getDay()));
      const onlyWeekend = [...dows].every(d => d === 0 || d === 6);
      out.push({
        tone: 'concern',
        text: onlyWeekend
          ? `${negLast.length} concerns logged this week, all on the weekend. Worth a calm conversation about routine.`
          : `${negLast.length} concerns logged this week. Pattern to watch.`,
      });
    }

    // Gentle nudge: if a kid has a streak of 5+ days with NO logged
    // events at all, suggest re-engagement
    const days = new Set(
      pointEvents
        .filter(e => new Date(e.timestamp).getTime() >= last7Start)
        .map(e => new Date(e.timestamp).toDateString())
    );
    if (days.size <= 2 && pointEvents.length > 5) {
      out.push({
        tone: 'concern',
        text: `Quiet week — only ${days.size} day${days.size === 1 ? '' : 's'} of activity. Time to re-engage?`,
      });
    }

    // Positive: bonuses (parents giving recognition)
    const bonusLast = last7.filter(e => e.isBonus).length;
    if (bonusLast >= 2) {
      out.push({
        tone: 'positive',
        text: `You gave ${bonusLast} bonuses this week — ${childName} sees that recognition.`,
      });
    }

    // Cap at 3
    return out.slice(0, 3);
  }, [pointEvents, salahItemIds, childName]);

  if (insights.length === 0) return null;

  return (
    <Card className="border-blue-100 bg-gradient-to-br from-blue-50/40 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-blue-600" />
          This week's insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {insights.map((it, i) => (
            <li
              key={i}
              className={`flex items-start gap-3 rounded-lg p-3 ${
                it.tone === 'positive'
                  ? 'bg-emerald-50 border border-emerald-100'
                  : it.tone === 'concern'
                  ? 'bg-amber-50 border border-amber-100'
                  : 'bg-gray-50 border border-gray-100'
              }`}
            >
              {it.tone === 'positive' && <TrendingUp className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />}
              {it.tone === 'concern' && <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />}
              {it.tone === 'neutral' && <TrendingDown className="h-4 w-4 text-gray-700 mt-0.5 shrink-0" />}
              <span className="text-sm leading-relaxed text-gray-900">{it.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
