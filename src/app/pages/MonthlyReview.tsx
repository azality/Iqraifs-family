// Monthly Review — per-child analytics for a single calendar month.
//
// Four panels, matching the WeeklyReview aesthetic (shadcn Cards + recharts):
//   1. Prayer heatmap — calendar grid, 5 pips per day for Fajr/Dhuhr/Asr/Maghrib/Isha
//   2. Activities per day — bar chart of positive-event counts
//   3. Concerns per day  — bar chart of negative-event counts
//   4. Points trend      — net points/day plus running cumulative total
//
// Data flow: calls getChildEvents(childId, { startDate, endDate }) which hits
// the v31 server-side date-range filter so we don't pull the entire history.
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useAuth } from "../contexts/AuthContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { getChildEvents as apiGetChildEvents } from "../../utils/api";
import { PointEvent } from "../data/mockData";
import { ChevronLeft, ChevronRight, Calendar, Award, Activity, AlertTriangle, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
type PrayerName = (typeof PRAYERS)[number];

// Each prayer gets its own accent so the heatmap reads at a glance.
const PRAYER_COLORS: Record<PrayerName, string> = {
  Fajr: "#6366f1",    // indigo
  Dhuhr: "#0ea5e9",   // sky
  Asr: "#10b981",     // emerald
  Maghrib: "#f59e0b", // amber
  Isha: "#8b5cf6",    // violet
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Detect whether an event represents a logged prayer. We accept three
// signals so this works across the prayer-claim flow and any legacy events:
//   1. event.prayerName (set by prayerLogging.tsx on approval)
//   2. itemName starting with "Prayer:" (e.g. "Prayer: Asr - On Time")
//   3. trackableItem.name matching one of the 5 prayers
function detectPrayerName(event: any, trackableItems: any[]): PrayerName | null {
  const direct = event.prayerName;
  if (typeof direct === "string" && (PRAYERS as readonly string[]).includes(direct)) {
    return direct as PrayerName;
  }
  if (typeof event.itemName === "string") {
    const m = event.itemName.match(/Prayer:\s*(Fajr|Dhuhr|Asr|Maghrib|Isha)/i);
    if (m) {
      const cap = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      if ((PRAYERS as readonly string[]).includes(cap)) return cap as PrayerName;
    }
  }
  const item = trackableItems.find(i => i.id === event.trackableItemId);
  if (item?.name && (PRAYERS as readonly string[]).includes(item.name)) {
    return item.name as PrayerName;
  }
  return null;
}

export function MonthlyReview() {
  const { isParentMode } = useAuth();
  const { getCurrentChild, children, setSelectedChildId } = useFamilyContext();
  const { items: trackableItems } = useTrackableItems();
  const child = getCurrentChild();

  const [monthDate, setMonthDate] = useState<Date>(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<PointEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const monthStart = useMemo(() => startOfMonth(monthDate), [monthDate]);
  const monthEnd = useMemo(() => endOfMonth(monthDate), [monthDate]);

  // Load events for the selected child + month from the server. The
  // backend filters server-side so this returns at most one month of
  // events for one child.
  useEffect(() => {
    if (!child) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiGetChildEvents(child.id, {
      startDate: ymd(monthStart),
      endDate: ymd(monthEnd),
    })
      .then(rows => { if (!cancelled) setEvents(rows || []); })
      .catch(err => {
        console.error("MonthlyReview: failed to load events", err);
        if (!cancelled) setEvents([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [child?.id, monthStart, monthEnd]);

  if (!isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <Award className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Parent Access Required</h3>
              <p className="text-muted-foreground">
                Monthly reviews are for parents only. Switch to parent mode to access this feature.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child to view their monthly review.</p>
      </div>
    );
  }

  // ----- Per-day aggregations -----
  // Build a map keyed by YYYY-MM-DD covering every day in the month so
  // empty days still render zero cells / bars.
  const daysInMonth = monthEnd.getDate();
  type DayBucket = {
    date: Date;
    key: string;
    prayers: Record<PrayerName, boolean>;
    activities: number;       // positive non-prayer events count
    concerns: number;         // negative events count
    netPoints: number;        // sum of points
  };
  const dayBuckets: DayBucket[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i);
    dayBuckets.push({
      date: d,
      key: ymd(d),
      prayers: { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false },
      activities: 0,
      concerns: 0,
      netPoints: 0,
    });
  }
  const byKey: Record<string, DayBucket> = Object.fromEntries(dayBuckets.map(b => [b.key, b]));

  events.forEach(ev => {
    const d = new Date(ev.timestamp);
    if (Number.isNaN(d.getTime())) return;
    const key = ymd(d);
    const bucket = byKey[key];
    if (!bucket) return;
    bucket.netPoints += ev.points || 0;
    const prayer = detectPrayerName(ev, trackableItems);
    if (prayer) {
      bucket.prayers[prayer] = true;
      // A logged prayer is not also counted as a generic activity — it
      // already has its own panel.
      return;
    }
    if ((ev.points || 0) > 0) bucket.activities += 1;
    else if ((ev.points || 0) < 0) bucket.concerns += 1;
  });

  // Chart-ready arrays. shortLabel = day-of-month number so the x-axis
  // stays legible across 28–31 ticks.
  const dayLabel = (b: DayBucket) => `${b.date.getDate()}`;
  const activityData = dayBuckets.map(b => ({ day: dayLabel(b), count: b.activities }));
  const concernsData = dayBuckets.map(b => ({ day: dayLabel(b), count: b.concerns }));

  let running = 0;
  const pointsData = dayBuckets.map(b => {
    running += b.netPoints;
    return { day: dayLabel(b), net: b.netPoints, total: running };
  });

  // ----- Heatmap grid (rows = weeks, cols = Sun..Sat) -----
  const firstDayOfWeek = monthStart.getDay(); // 0 = Sun
  // Pre-pad with nulls so the first day lands in the right column.
  type Cell = DayBucket | null;
  const cells: Cell[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  cells.push(...dayBuckets);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // ----- Summary totals -----
  const totalPrayersLogged = dayBuckets.reduce(
    (s, b) => s + PRAYERS.reduce((c, p) => c + (b.prayers[p] ? 1 : 0), 0),
    0
  );
  const totalActivities = dayBuckets.reduce((s, b) => s + b.activities, 0);
  const totalConcerns = dayBuckets.reduce((s, b) => s + b.concerns, 0);
  const netPointsMonth = dayBuckets.reduce((s, b) => s + b.netPoints, 0);

  // ----- Controls -----
  const goPrevMonth = () => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNextMonth = () => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goThisMonth = () => setMonthDate(startOfMonth(new Date()));

  return (
    <div className="space-y-6">
      {/* Header / controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Monthly Review
              </CardTitle>
              <CardDescription>
                Prayer heatmap, daily activities, concerns, and points trend for {child.name}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {children.length > 1 && (
                <select
                  value={child.id}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  aria-label="Select child"
                >
                  {children.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <Button variant="outline" size="sm" onClick={goPrevMonth} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[140px] text-center font-medium">{monthLabel(monthDate)}</div>
              <Button variant="outline" size="sm" onClick={goNextMonth} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goThisMonth}>This month</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Prayers Logged</CardTitle>
            <Award className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPrayersLogged}</div>
            <p className="text-xs text-muted-foreground">of {daysInMonth * 5} possible</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Activities</CardTitle>
            <Activity className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalActivities}</div>
            <p className="text-xs text-muted-foreground">positive events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Concerns</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalConcerns}</div>
            <p className="text-xs text-muted-foreground">negative events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Net Points</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netPointsMonth >= 0 ? "text-green-600" : "text-red-600"}`}>
              {netPointsMonth > 0 ? `+${netPointsMonth}` : netPointsMonth}
            </div>
            <p className="text-xs text-muted-foreground">across the month</p>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Prayer heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Prayer Heatmap</CardTitle>
          <CardDescription>
            Each day shows five pips — Fajr, Dhuhr, Asr, Maghrib, Isha — coloured when logged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {PRAYERS.map(p => (
              <div key={p} className="flex items-center gap-1.5 text-xs text-gray-700">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: PRAYER_COLORS[p] }}
                />
                {p}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="inline-block h-3 w-3 rounded-full border border-gray-300 bg-white" />
              not logged
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 gap-2">
            {weeks.flatMap((week, wi) =>
              week.map((cell, di) => {
                if (!cell) {
                  return <div key={`${wi}-${di}`} className="aspect-square rounded-md bg-gray-50/50" />;
                }
                const loggedCount = PRAYERS.reduce((c, p) => c + (cell.prayers[p] ? 1 : 0), 0);
                return (
                  <div
                    key={cell.key}
                    className="aspect-square rounded-md border border-gray-200 bg-white p-1.5 flex flex-col"
                    title={`${cell.date.toDateString()} — ${loggedCount}/5 prayers logged`}
                  >
                    <div className="text-[10px] font-semibold text-gray-500 leading-none mb-1">
                      {cell.date.getDate()}
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="grid grid-cols-5 gap-0.5 w-full">
                        {PRAYERS.map(p => (
                          <span
                            key={p}
                            className="aspect-square rounded-full border"
                            style={{
                              backgroundColor: cell.prayers[p] ? PRAYER_COLORS[p] : "transparent",
                              borderColor: cell.prayers[p] ? PRAYER_COLORS[p] : "#e5e7eb",
                            }}
                            aria-label={`${p} ${cell.prayers[p] ? "logged" : "not logged"}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activities + Concerns side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activities per Day</CardTitle>
            <CardDescription>Count of positive (non-prayer) events</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" interval={daysInMonth > 16 ? 2 : 0} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" name="Activities" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Concerns per Day</CardTitle>
            <CardDescription>Count of negative events</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={concernsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" interval={daysInMonth > 16 ? 2 : 0} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" name="Concerns" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Points trend */}
      <Card>
        <CardHeader>
          <CardTitle>Points Trend</CardTitle>
          <CardDescription>Net points each day, plus running total across the month</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={pointsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" interval={daysInMonth > 16 ? 2 : 0} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="net" stroke="#3b82f6" name="Net / day" dot={false} />
              <Line type="monotone" dataKey="total" stroke="#6366f1" name="Running total" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
