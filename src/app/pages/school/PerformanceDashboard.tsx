// Principal/Admin Performance Dashboard.
//
// Routed as /school/orgs/:orgId — replaces the old tile-grid PrincipalDashboard
// as the top-level org entry point. Visual reference is a multi-location
// franchise dashboard: dense, scannable, dark hero card with KPI tiles,
// colored alert cards row, big class leaderboard, breakdown panels.
//
// Backend endpoints land in the parallel PR `school-pilot/dashboard-backend`.
// Until then the page will surface its error state — that's expected.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  Clock,
  DollarSign,
  FileText,
  GraduationCap,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  AlertTriangle,
  Info,
  AlertOctagon,
  ArrowUpRight,
  ListChecks,
  Library,
  Building2,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  getDashboard,
  getInsights,
  getOrgAcademics,
  getAtRiskAttendance,
  getTodayOps,
  getOrganization,
  getSchoolMe,
  getSectionsLeaderboard,
  listClasses,
  listStudents,
  listAdminTeachers,
  listAdmins,
  listLinkCodes,
  listAnnouncements,
  listMySchoolGroups,
  isOrgPrincipal,
  type DashboardAlert,
  type DashboardPeriod,
  type DashboardResponse,
  type DashboardTile,
  type InsightsResponse,
  type LeaderboardRow,
  type OrgWithCounts,
  type AcademicsResponse,
  type AtRiskAttendanceResponse,
  type TodayOpsResponse,
  type SchoolMeResponse,
  type SchoolGroupSummary,
} from "../../../utils/schoolApi";
import { SetupChecklist, setupChecklistDismissed, PendingTimeOffWidget, TermSwitchNudge } from "../../components/school-ui";
import { AttendanceDayNotes } from "./AttendanceDayNotes";
import { RightNowPanel } from "./RightNowPanel";
import { useOrgPermission } from "./useOrgPermission";
import { viewerRoleForOrg as resolveViewerRole } from "../../../utils/schoolApi";
import { RoleTour } from "../../components/RoleTour";
import { pickTourForUser } from "../../../utils/tours";

// ─── Period selector ─────────────────────────────────────────────────────

const PERIODS: ReadonlyArray<{ value: DashboardPeriod; label: string }> = [
  { value: "T", label: "Today" },
  { value: "WTD", label: "Week" },
  { value: "MTD", label: "Month" },
  { value: "QTD", label: "Quarter" },
  { value: "YTD", label: "Year" },
];

function PeriodSelector({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (v: DashboardPeriod) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {PERIODS.map((p) => {
        const active = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            title={t(`dashboard.period.${p.value}`)}
            className={
              "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
              (active
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-600 hover:bg-slate-100")
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI tile ────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  tile: DashboardTile;
  Icon: typeof Users;
  /** If true, show the value as a percentage. */
  asPercent?: boolean;
  /** If true, show the value with a + prefix when positive. */
  signed?: boolean;
  /** Route to open on click — tile renders as a Link when set. */
  to?: string;
  /** "period" responds to the WTD/MTD/QTD/YTD pills; "current" is a
   *  snapshot of right-now and intentionally ignores the period. The
   *  badge tells the user which to expect so they stop wondering why
   *  the student count doesn't change when they toggle the pills. */
  bound?: "period" | "current";
}

function KpiTile({ label, tile, Icon, asPercent, signed, bound, to }: KpiTileProps) {
  const muted = tile.value === null;
  const displayValue = muted
    ? "—"
    : asPercent
    ? `${tile.value}%`
    : signed && tile.value !== null && tile.value > 0
    ? `+${tile.value}`
    : String(tile.value);
  const delta = tile.deltaPp ?? null;
  // Tiles with a management surface behind them are links; the rest are
  // read-only stats (attendance/behavior have no single landing page).
  const Wrapper: any = to ? Link : "div";
  return (
    <Wrapper
      {...(to ? { to } : {})}
      className={
        "block rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm transition-colors " +
        (muted ? "opacity-60 " : "hover:bg-white/10 ") +
        (to ? "cursor-pointer hover:border-white/25" : "")
      }
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-300">
        <Icon className="h-3.5 w-3.5" />
        <span className="flex-1 min-w-0 leading-tight">{label}</span>
        {bound && (
          <span
            className={
              "rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wider " +
              (bound === "period"
                ? "bg-indigo-500/20 text-indigo-300"
                : "bg-slate-500/20 text-slate-300")
            }
            title={
              bound === "period"
                ? "Updates when you change the Today / Week / Month / Quarter / Year window"
                : "Current-state snapshot; not affected by the period toggle"
            }
          >
            {bound === "period" ? "PERIOD" : "NOW"}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold text-white tabular-nums">{displayValue}</div>
        {delta !== null && delta !== undefined && (
          <div
            className={
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium " +
              (delta >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300")
            }
          >
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta >= 0 ? "+" : ""}
            {delta}pp
          </div>
        )}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">{tile.hint}</div>
    </Wrapper>
  );
}

// ─── Alert card ──────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<DashboardAlert["severity"], { wrap: string; title: string; Icon: typeof Info }> = {
  critical: {
    wrap: "border-rose-200 bg-rose-50",
    title: "text-rose-800",
    Icon: AlertOctagon,
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50",
    title: "text-amber-800",
    Icon: AlertTriangle,
  },
  info: {
    wrap: "border-blue-200 bg-blue-50",
    title: "text-blue-800",
    Icon: Info,
  },
};

// Friendly labels for the machine `kind` enum the backend emits. Unknown
// kinds fall back to title-cased version so we never expose a raw snake_case.
const KIND_LABELS: Record<string, string> = {
  attendance_gap: "Attendance gap",
  roster_stale: "Roster needs review",
  behavior_spike: "Behavior spike",
  pending_approvals: "Pending approval",
  fees_overdue: "Fees overdue",
  hifz_stalled: "Hifz progress stalled",
};
function friendlyKind(k: string | undefined | null): string {
  if (!k) return "";
  return KIND_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function AlertCard({ alert }: { alert: DashboardAlert }) {
  const s = SEVERITY_STYLES[alert.severity];

  // Some alert actions point back to the current page (e.g. "View
  // leaderboard" → `/school/orgs/${orgId}?filter=flagged` which IS this
  // page, just with a query string). Plain <Link> looks like it does
  // nothing. Strip both query and trailing slash when comparing.
  const handleActionClick = (e: React.MouseEvent) => {
    if (!alert.actionPath) return;
    const stripQuery = (s: string) => s.split("?")[0].replace(/\/$/, "");
    const target = stripQuery(alert.actionPath);
    const current = stripQuery(window.location.pathname);
    if (target === current) {
      e.preventDefault();
      const el = document.getElementById("sections-leaderboard");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Equal-height cards: flex column with the action pinned to the bottom
  // via mt-auto, so a short body doesn't leave the link floating mid-card
  // next to taller siblings (pilot polish request).
  return (
    <div className={"flex h-full min-w-0 flex-col rounded-xl border p-5 shadow-sm " + s.wrap}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={"border-transparent bg-white/60 text-[10px] uppercase tracking-wide " + s.title}
        >
          {alert.severity}
        </Badge>
        <span className={"inline-flex items-center gap-1.5 text-xs font-medium " + s.title}>
          <s.Icon className="h-3.5 w-3.5 shrink-0" />
          {friendlyKind(alert.kind)}
        </span>
      </div>
      <div className={"mt-2.5 text-sm font-semibold leading-snug " + s.title}>{alert.title}</div>
      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-700">{alert.body}</p>
      {alert.actionPath && (
        <Link
          to={alert.actionPath}
          onClick={handleActionClick}
          className={"mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium hover:underline " + s.title}
        >
          {alert.actionLabel || "Open"}
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────

type LeaderboardFilter = "all" | "compliant" | "watch" | "flagged" | "no_data";

const STATUS_PILL: Record<LeaderboardRow["status"], string> = {
  compliant: "bg-emerald-100 text-emerald-700 border-emerald-200",
  watch: "bg-amber-100 text-amber-700 border-amber-200",
  flagged: "bg-rose-100 text-rose-700 border-rose-200",
  no_data: "bg-slate-100 text-slate-500 border-slate-200",
};

const STATUS_LABEL: Record<LeaderboardRow["status"], string> = {
  compliant: "Compliant",
  watch: "Watch",
  flagged: "Flagged",
  no_data: "No data",
};

function AttendanceBar({ pct, status }: { pct: number; status: LeaderboardRow["status"] }) {
  if (status === "no_data") {
    return <span className="text-xs text-slate-400">not taken yet</span>;
  }
  const color =
    status === "compliant" ? "bg-emerald-500" : status === "watch" ? "bg-amber-500" : "bg-rose-500";
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex w-full items-center gap-2">
      <div className="relative h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={"absolute inset-y-0 left-0 rounded-full " + color} style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-11 text-right text-xs font-semibold tabular-nums text-slate-700">{pct.toFixed(1)}%</span>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Leaderboard({
  rows,
  orgId,
}: {
  rows: LeaderboardRow[];
  orgId: string;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<LeaderboardFilter>("all");
  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );
  const totalCount = rows.length;  // Compact by default (design 2a): first rows + an expand control.
  const [expandedLb, setExpandedLb] = useState(false);
  const visible = expandedLb ? filtered : filtered.slice(0, 8);


  const FILTERS: ReadonlyArray<{ key: LeaderboardFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "compliant", label: "Compliant" },
    { key: "watch", label: "Watch" },
    { key: "flagged", label: "Flagged" },
    { key: "no_data", label: "No data" },
  ];

  return (
    <Card id="sections-leaderboard">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Class Sections Leaderboard</CardTitle>
          <CardDescription>
            {filtered.length} of {totalCount}
          </CardDescription>
        </div>
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                  (active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Phone layout: compact tappable cards — the 9-column table can't
            survive a 390px viewport (pilot screenshot: columns crushed to
            one character per line). */}
        <ul className="sm:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              No sections match this filter.
            </li>
          ) : (
            visible.map((row, idx) => (
              <li
                key={row.sectionId}
                onClick={() =>
                  navigate(`/school/orgs/${orgId}/sections/${encodeURIComponent(row.sectionId)}`)
                }
                className="flex items-center gap-3 px-4 py-3 active:bg-indigo-50/40 cursor-pointer"
              >
                <span className="w-5 text-xs text-slate-400 tabular-nums flex-shrink-0">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {row.className} · {row.sectionName}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">
                      {row.studentCount} students
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <AttendanceBar pct={row.attendancePct} status={row.status} />
                    </div>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 " +
                        (row.status === "compliant"
                          ? "bg-emerald-50 text-emerald-700"
                          : row.status === "watch"
                            ? "bg-amber-50 text-amber-700"
                            : row.status === "flagged"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-slate-100 text-slate-500")
                      }
                    >
                      {row.status === "no_data" ? "no data" : row.status}
                    </span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
        {/* Desktop: compact rows (design 2a) — the old 9-column table
            can't fit the dashboard's 600px left column (wrapped names +
            an inner horizontal scrollbar). Rank, section, teacher, bar,
            %, status; the extra columns live on SectionOverview. */}
        <ul className="hidden sm:block">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              No sections match this filter.
            </li>
          ) : (
            visible.map((row, idx) => (
              <li
                key={row.sectionId}
                onClick={() =>
                  navigate(
                    `/school/orgs/${orgId}/sections/${encodeURIComponent(row.sectionId)}`,
                  )
                }
                title={`${row.studentCount} students · behavior ${row.behaviorScore >= 0 ? "+" : ""}${row.behaviorScore} · +${row.positiveCount}/−${row.concernCount} notes`}
                className="group flex cursor-pointer items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-xs transition-colors hover:bg-indigo-50/40"
              >
                <span className="w-5 flex-none text-slate-400 tabular-nums">{idx + 1}</span>
                <span className="w-28 flex-none truncate whitespace-nowrap text-sm font-semibold text-slate-900">
                  {row.className} · {row.sectionName}
                </span>
                <span className="w-28 flex-none truncate text-slate-400">
                  {row.classTeacherName || "Unassigned"}
                </span>
                <div className="min-w-0 flex-1">
                  <AttendanceBar pct={row.attendancePct} status={row.status} />
                </div>
                <span
                  className={
                    "inline-flex flex-none items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold " +
                    STATUS_PILL[row.status]
                  }
                >
                  {STATUS_LABEL[row.status]}
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
              </li>
            ))
          )}
        </ul>
        {filtered.length > 8 && (
          <button
            type="button"
            onClick={() => setExpandedLb((v) => !v)}
            className="w-full border-t border-slate-100 py-2 text-center text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            {expandedLb ? "Show fewer" : `All ${filtered.length} sections →`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Insight panels ──────────────────────────────────────────────────────

const ATTENDANCE_COLORS = {
  present: "#10b981",
  absent: "#ef4444",
  late: "#f59e0b",
  excused: "#6366f1",
};

function AttendanceDonut({ data }: { data: InsightsResponse["attendanceDistribution"] }) {
  const entries = [
    { key: "present", label: "Present", value: data.present, color: ATTENDANCE_COLORS.present },
    { key: "absent", label: "Absent", value: data.absent, color: ATTENDANCE_COLORS.absent },
    { key: "late", label: "Late", value: data.late, color: ATTENDANCE_COLORS.late },
    { key: "excused", label: "Excused", value: data.excused, color: ATTENDANCE_COLORS.excused },
  ];
  const total = entries.reduce((acc, e) => acc + e.value, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Attendance Distribution</CardTitle>
        <CardDescription>For selected period</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No attendance recorded yet.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-32 w-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={entries}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={56}
                    paddingAngle={2}
                  >
                    {entries.map((e) => (
                      <Cell key={e.key} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-1.5 text-xs">
              {entries.map((e) => (
                <li key={e.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.color }} />
                    <span className="text-slate-700">{e.label}</span>
                  </span>
                  <span className="tabular-nums text-slate-900">
                    {e.value} ({total ? Math.round((e.value / total) * 100) : 0}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BehaviorBars({
  title,
  description,
  rows,
  variant,
}: {
  title: string;
  description: string;
  rows: InsightsResponse["topPositive"];
  variant: "positive" | "concern";
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const barColor = variant === "positive" ? "bg-emerald-500" : "bg-rose-500";
  const headerColor = variant === "positive" ? "text-emerald-700" : "text-rose-700";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={"text-sm " + headerColor}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">Nothing logged yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.slice(0, 6).map((r) => (
              <li key={r.category}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800">{r.category}</span>
                  <span className="tabular-nums text-slate-500">
                    {r.count} · {r.points} pts
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={barColor}
                    style={{ width: `${Math.round((r.count / max) * 100)}%`, height: "100%" }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent activity ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const ACTIVITY_FILTERS: Array<{ key: string; label: string; kinds: string[] | null }> = [
  { key: "all", label: "All", kinds: null },
  { key: "exceptions", label: "Exceptions", kinds: ["flag", "early_release"] },
  { key: "behavior", label: "Behavior", kinds: ["behavior"] },
  { key: "attendance", label: "Attendance", kinds: ["attendance"] },
  { key: "admin", label: "Admin", kinds: ["roster_request", "roster_decision"] },
];

const ACTIVITY_BADGE_TONE: Record<string, string> = {
  flag: "border-amber-300 bg-amber-50 text-amber-800",
  early_release: "border-sky-300 bg-sky-50 text-sky-800",
};

function activityKindLabel(kind: string): string {
  if (kind === "early_release") return "early release";
  if (kind === "roster_request" || kind === "roster_decision") return "roster";
  return kind;
}

function RecentActivity({ rows }: { rows: InsightsResponse["recentActivity"] }) {
  const [filter, setFilter] = useState("all");
  const active = ACTIVITY_FILTERS.find((f) => f.key === filter) ?? ACTIVITY_FILTERS[0];
  const visible = active.kinds ? rows.filter((r) => active.kinds!.includes(r.kind)) : rows;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Recent Activity</CardTitle>
            <CardDescription>
              Routine roll-call is collapsed into a daily digest — exceptions stay individual.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {ACTIVITY_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors " +
                  (filter === f.key
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">
            {filter === "all" ? "No recent activity." : "Nothing in this category recently."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Kind</th>
                  <th className="px-4 py-2 text-left">Summary</th>
                  <th className="px-4 py-2 text-left">Actor</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-xs text-slate-500">{relativeTime(r.occurredAt)}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={
                          "text-[10px] uppercase tracking-wide " +
                          (ACTIVITY_BADGE_TONE[r.kind] ?? "")
                        }
                      >
                        {activityKindLabel(r.kind)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-800">{r.summary}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.actor || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Glance bar (2a) ─────────────────────────────────────────────────────
// One dark strip replaces the 12-tile hero: five primary stats inline,
// health pills right, and every zero/empty metric collapsed behind a
// "More metrics" disclosure. Rule from the design review: zero-value
// tiles never render as tiles. Nonzero secondary metrics get promoted
// into the primary row so nothing actionable hides.

interface GlanceStatDef {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
  to?: string;
  nonzero?: boolean;
}

function GlanceStat({ stat }: { stat: GlanceStatDef }) {
  const body = (
    <div className="whitespace-nowrap">
      <div className="text-[9.5px] font-bold tracking-[.7px]" style={{ color: "rgba(255,255,255,.45)" }}>
        {stat.label}
      </div>
      <div className="text-xl font-extrabold leading-tight text-white tabular-nums">
        {stat.value}{" "}
        {stat.delta && (
          <span className="text-[10px] font-bold" style={{ color: stat.deltaColor ?? "#4ade80" }}>
            {stat.delta}
          </span>
        )}
      </div>
    </div>
  );
  return stat.to ? (
    <Link to={stat.to} className="transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

function GlanceBar({
  dashboard,
  academics,
  orgId,
  canTeachers,
  canApprovals,
  canFees,
  canForms,
}: {
  dashboard: DashboardResponse;
  academics: AcademicsResponse | null;
  orgId: string;
  canTeachers: boolean;
  canApprovals: boolean;
  canFees: boolean;
  canForms: boolean;
}) {
  const tiles = dashboard.tiles;
  const health = dashboard.health;
  const pctStr = (v: number | null) => (v === null ? "—" : `${v}%`);
  const numStr = (v: number | null) => (v === null ? "—" : String(v));
  const pp = (v: number) => `${v >= 0 ? "+" : ""}${v}pp`;

  const attToday = tiles.attendanceToday.value;
  const perDelta = tiles.attendancePeriod.deltaPp ?? null;
  const curr = academics?.curriculum?.progressPct ?? null;
  const currDelta =
    curr !== null && academics?.pace?.expectedPct != null ? curr - academics.pace.expectedPct : null;

  const primary: GlanceStatDef[] = [
    { label: "STUDENTS", value: numStr(tiles.students.value), to: `/school/orgs/${orgId}/admin/students` },
    {
      label: "ATTENDANCE TODAY",
      value: pctStr(attToday),
      delta: attToday !== null && attToday < 75 ? "low" : undefined,
      deltaColor: "#f87171",
    },
    {
      label: "ATTENDANCE PERIOD",
      value: pctStr(tiles.attendancePeriod.value),
      delta: perDelta !== null ? pp(perDelta) : undefined,
      deltaColor: perDelta !== null && perDelta < 0 ? "#f87171" : "#4ade80",
    },
    ...(canTeachers
      ? [{ label: "TEACHERS", value: numStr(tiles.teachers.value), to: `/school/orgs/${orgId}/admin/teachers` }]
      : []),
    ...(curr !== null
      ? [{
          label: "CURRICULUM",
          value: `${curr}%`,
          delta: currDelta !== null && currDelta !== 0 ? pp(currDelta) : undefined,
          deltaColor: currDelta !== null && currDelta < 0 ? "#fbbf24" : "#4ade80",
        }]
      : []),
  ];

  const secondary: GlanceStatDef[] = [
    {
      label: "BEHAVIOR",
      value: tiles.behaviorScore.value !== null && tiles.behaviorScore.value > 0
        ? `+${tiles.behaviorScore.value}`
        : numStr(tiles.behaviorScore.value),
      nonzero: (tiles.behaviorScore.value ?? 0) !== 0,
    },
    ...(canApprovals
      ? [{
          label: "APPROVALS",
          value: numStr(tiles.pendingApprovals.value),
          to: `/school/orgs/${orgId}/admin/roster-requests`,
          nonzero: (tiles.pendingApprovals.value ?? 0) > 0,
        }]
      : []),
    { label: "CONCERNS", value: numStr(tiles.concernsOpen.value), nonzero: (tiles.concernsOpen.value ?? 0) > 0 },
    ...(canFees
      ? [{
          label: "FEES PAID",
          value: pctStr(tiles.feesPaidPct.value),
          to: `/school/orgs/${orgId}/admin/fees`,
          nonzero: (tiles.feesPaidPct.value ?? 0) > 0,
        }]
      : []),
    {
      label: "HIFZ",
      value: pctStr(tiles.hifzProgress.value),
      to: `/school/orgs/${orgId}/admin/hifz-program`,
      nonzero: (tiles.hifzProgress.value ?? 0) > 0,
    },
    ...(canForms
      ? [{
          label: "FORMS",
          value: numStr(tiles.formsAwaiting.value),
          to: `/school/orgs/${orgId}/admin/forms`,
          nonzero: (tiles.formsAwaiting.value ?? 0) > 0,
        }]
      : []),
    ...(academics
      ? [{ label: "RESOURCES", value: String(academics.resources.totalResources), nonzero: academics.resources.totalResources > 0 }]
      : []),
  ];
  const promoted = secondary.filter((x) => x.nonzero);
  const collapsed = secondary.filter((x) => !x.nonzero);

  const pills = health
    ? [
        { n: health.healthy, label: "healthy", bg: "rgba(74,222,128,.15)", fg: "#4ade80" },
        { n: health.watch, label: "watch", bg: "rgba(251,191,36,.15)", fg: "#fbbf24" },
        { n: health.flagged, label: "flagged", bg: "rgba(248,113,113,.15)", fg: "#f87171" },
        { n: health.noData ?? 0, label: "no data", bg: "rgba(255,255,255,.1)", fg: "rgba(255,255,255,.6)" },
      ].filter((x) => x.n > 0)
    : [];

  return (
    <div className="rounded-[14px] px-5 py-3.5" style={{ background: "var(--school-surface-dark, #14163a)" }}>
      <div className="flex items-center gap-5">
        <div className="no-scrollbar flex flex-1 items-center gap-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[...primary, ...promoted].map((st) => (
            <GlanceStat key={st.label} stat={st} />
          ))}
        </div>
        {pills.length > 0 && (
          <div className="hidden gap-1.5 lg:flex">
            {pills.map((x) => (
              <span
                key={x.label}
                className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ background: x.bg, color: x.fg }}
              >
                {x.n} {x.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {pills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 lg:hidden">
          {pills.map((x) => (
            <span
              key={x.label}
              className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: x.bg, color: x.fg }}
            >
              {x.n} {x.label}
            </span>
          ))}
        </div>
      )}
      {collapsed.length > 0 && (
        <details className="mt-2.5 border-t pt-2" style={{ borderColor: "rgba(255,255,255,.1)" }}>
          <summary
            className="cursor-pointer list-none text-[11px] font-semibold"
            style={{ color: "rgba(255,255,255,.55)" }}
          >
            More metrics — {collapsed.map((x) => x.label.toLowerCase()).join(", ")} ▾
          </summary>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11.5px]" style={{ color: "rgba(255,255,255,.75)" }}>
            {collapsed.map((st) =>
              st.to ? (
                <Link key={st.label} to={st.to} className="hover:underline">
                  {st.label.toLowerCase()} <b className="text-white">{st.value}</b>
                </Link>
              ) : (
                <span key={st.label}>
                  {st.label.toLowerCase()} <b className="text-white">{st.value}</b>
                </span>
              ),
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Needs attention (2a) ────────────────────────────────────────────────
// The 4 separate alert cards merge into one ranked panel: severity dot,
// one-line summary, per-row CTA. Alerts arrive pre-sorted by severity
// from the backend.

const ALERT_DOT: Record<DashboardAlert["severity"], string> = {
  critical: "#dc2626",
  warning: "#f59e0b",
  info: "#94a3b8",
};

function NeedsAttention({ alerts, orgId }: { alerts: DashboardAlert[]; orgId: string }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <span className="font-medium">All systems green</span> — no active alerts.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "rgba(20,22,58,.08)" }}>
      <div className="hidden items-center gap-2.5 border-b px-4 py-3 lg:flex" style={{ borderColor: "rgba(20,22,58,.07)" }}>
        <span className="text-[12.5px] font-bold" style={{ color: "#14163a" }}>
          Needs attention
        </span>
        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10.5px] font-bold text-white">
          {alerts.length}
        </span>
      </div>
      <div className="flex flex-col px-4 pb-2 pt-1">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2.5 border-b py-2.5 text-xs last:border-b-0"
            style={{ borderColor: "rgba(20,22,58,.05)" }}
          >
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: ALERT_DOT[a.severity] ?? "#94a3b8" }}
            />
            <div className="min-w-0 flex-1">
              <b style={{ color: "#14163a" }}>{a.title}</b>{" "}
              <span className="text-slate-500">— {a.body}</span>
            </div>
            {a.actionPath && (
              <Link
                to={a.actionPath}
                className="whitespace-nowrap text-[11px] font-semibold text-indigo-600 hover:underline"
              >
                {a.actionLabel ?? "Open"} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mobile accordion wrapper (1d) ───────────────────────────────────────
// On phones every dashboard module sits behind a 44px collapsible header
// so the page is one screen deep; on lg+ the wrapper vanishes
// (display:contents) and children render as normal cards.

function DashSection({
  title,
  right,
  tone = "default",
  defaultOpen = false,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  tone?: "default" | "alert";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const alertTone = tone === "alert";
  return (
    <div className="lg:contents">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          "flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-4 py-3 text-left lg:hidden " +
          (alertTone ? "border-rose-200 bg-rose-50" : "bg-white")
        }
        style={alertTone ? undefined : { borderColor: "rgba(20,22,58,.08)" }}
      >
        <span className={"text-[12.5px] font-bold " + (alertTone ? "text-rose-800" : "")} style={alertTone ? undefined : { color: "#14163a" }}>
          {title}
        </span>
        {right}
        <ChevronDown
          className={
            "ml-auto h-4 w-4 transition-transform " +
            (alertTone ? "text-rose-400 " : "text-slate-400 ") +
            (open ? "rotate-180" : "")
          }
        />
      </button>
      {/* max-lg:hidden (not `hidden`) so the closed state can never fight
          lg:contents in the cascade — both are display utilities. */}
      <div className={(open ? "space-y-4 " : "max-lg:hidden ") + "lg:contents"}>{children}</div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export function PerformanceDashboard() {
  const { t } = useTranslation();
  const { orgId = "" } = useParams();
  const [period, setPeriod] = useState<DashboardPeriod>("MTD");
  const [org, setOrg] = useState<OrgWithCounts | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  // Phase 6a: academic aggregates (curriculum coverage, resources, hygiene,
  // subjects at risk). Loaded in parallel with the existing dashboard fetch.
  const [academics, setAcademics] = useState<AcademicsResponse | null>(null);

  const [atRisk, setAtRisk] = useState<AtRiskAttendanceResponse | null>(null);
  const [todayOps, setTodayOps] = useState<TodayOpsResponse | null>(null);
  const [atRiskPeriod, setAtRiskPeriod] = useState<string>("TERM");
  // Snapshot-first: the card shows the worst few; "Show all" expands.
  const [atRiskExpanded, setAtRiskExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  // Permission-aware tiles (pilot Sep 3, from the incharge review): a
  // tile a role has no business with (fees for an incharge) hides
  // unless the principal grants that permission in Admin -> Role
  // permissions. Admin/principal short-circuit to true inside the hook.
  const fullViewerRole = me ? resolveViewerRole(me, orgId) : null;
  const canFees = useOrgPermission(orgId, fullViewerRole, "mark_fees_status");
  const canApprovals = useOrgPermission(orgId, fullViewerRole, "manage_students");
  const canForms = useOrgPermission(orgId, fullViewerRole, "create_forms");
  const canTeachers = useOrgPermission(orgId, fullViewerRole, "manage_teachers");

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null));
  }, []);

  // Admin-who-also-teaches (e.g. Amna: admin + Catch Up class teacher).
  // Admins land here, not on TeacherHome, so their own class's attendance
  // and subjects had no entry point. Surface a compact "My classes" strip
  // for any section this viewer personally owns.
  const [myOwnSections, setMyOwnSections] = useState<
    Array<{ id: string; label: string }>
  >([]);
  // className → first section id, so pace-card laggard rows can deep-link
  // to that subject's curriculum panel (same ?openSubject mechanism the
  // global search uses). Laggards are class-level; either section of the
  // class shows the same subject panel, so the first one is fine.
  const [sectionByClassName, setSectionByClassName] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    if (!orgId || !me?.userId) return;
    listClasses(orgId)
      .then((classes) => {
        const mine: Array<{ id: string; label: string }> = [];
        const byClass: Record<string, string> = {};
        for (const c of classes) {
          for (const s of c.sections ?? []) {
            if (byClass[c.name] === undefined) byClass[c.name] = s.id;
            if (
              (s as any).class_teacher_user_id === me.userId ||
              (s as any).hifz_teacher_user_id === me.userId
            ) {
              mine.push({ id: s.id, label: `${c.name} – ${s.name}` });
            }
          }
        }
        setMyOwnSections(mine);
        setSectionByClassName(byClass);
      })
      .catch(() => {
        setMyOwnSections([]);
        setSectionByClassName({});
      });
  }, [orgId, me?.userId]);

  // Multi-campus: if this user belongs to any school group (head-office
  // principal/admin), surface the "All campuses" entry — the group
  // dashboard route previously had no inbound link anywhere in the app.
  const [myGroups, setMyGroups] = useState<SchoolGroupSummary[]>([]);
  useEffect(() => {
    listMySchoolGroups()
      .then((r) => setMyGroups(r.groups))
      .catch(() => setMyGroups([]));
  }, []);

  // Phase 6a: academics fetch. Non-blocking — if it errors, the rest of
  // the dashboard renders fine and we just hide the new tiles/panel.
  useEffect(() => {
    if (!orgId) return;
    getOrgAcademics(orgId)
      .then(setAcademics)
      .catch(() => setAcademics(null));
  }, [orgId]);

  // Today strip — morning ops checklist. Admin/principal only (the
  // endpoint 403s for teachers and the strip simply doesn't render).
  useEffect(() => {
    if (!orgId) return;
    getTodayOps(orgId)
      .then(setTodayOps)
      .catch(() => setTodayOps(null));
  }, [orgId]);

  // Chronic absentees — per-student attendance below threshold. Also
  // non-blocking; its own window selector (term is the report-card window).
  useEffect(() => {
    if (!orgId) return;
    getAtRiskAttendance(orgId, atRiskPeriod)
      .then(setAtRisk)
      .catch(() => setAtRisk(null));
  }, [orgId, atRiskPeriod]);

  const tourRole = me ? pickTourForUser(me, isOrgPrincipal(me, orgId)) : null;

  // Setup-checklist state. We fetch the 5 counts in parallel on mount and
  // render the card above the hero unless the user has dismissed it for
  // this org or all actionable steps are already complete.
  const [setupCounts, setSetupCounts] = useState<{
    classCount: number;
    studentCount: number;
    teacherCount: number;
    linkCodeCount: number;
    announcementCount: number;
    adminCount: number;
  } | null>(null);
  const [setupDismissed, setSetupDismissed] = useState<boolean>(false);

  useEffect(() => {
    if (!orgId) return;
    setSetupDismissed(setupChecklistDismissed(orgId));
    Promise.all([
      listClasses(orgId).catch(() => []),
      listStudents(orgId).catch(() => []),
      listAdminTeachers(orgId).catch(() => []),
      listLinkCodes(orgId, { unusedOnly: true }).catch(() => []),
      listAnnouncements(orgId)
        .then((r) => r.announcements.length)
        .catch(() => 0),
      listAdmins(orgId)
        .then((arr) => arr.length)
        .catch(() => 0),
    ]).then(([classes, students, teachers, linkCodes, announcementCount, adminCount]) => {
      setSetupCounts({
        classCount: classes.length,
        studentCount: students.length,
        teacherCount: teachers.length,
        linkCodeCount: linkCodes.length,
        announcementCount,
        adminCount,
      });
    });
  }, [orgId]);

  // Show the checklist if (a) the user hasn't dismissed it, AND
  // (b) at least one actionable (non-review-only) step is incomplete.
  // The "set permissions" step is review-only and intentionally excluded
  // from the completion gate so we don't keep nagging once the other 5
  // steps are done.
  const viewerRole: "principal" | "admin" | "other" = (() => {
    if (!me) return "other";
    if (isOrgPrincipal(me, orgId)) return "principal";
    const hasAdmin = me.roles?.some(
      (r) => (r.role_type as string) === "admin" && r.scope_id === orgId,
    );
    return hasAdmin ? "admin" : "other";
  })();

  const showSetupChecklist =
    !!setupCounts &&
    !setupDismissed &&
    viewerRole !== "other" &&
    (viewerRole === "principal"
      ? setupCounts.adminCount === 0
      : setupCounts.classCount === 0 ||
        setupCounts.studentCount === 0 ||
        setupCounts.teacherCount === 0 ||
        setupCounts.linkCodeCount === 0 ||
        setupCounts.announcementCount === 0);

  // Fetch the org meta once.
  useEffect(() => {
    if (!orgId) return;
    getOrganization(orgId)
      .then(setOrg)
      .catch((e) => setError(e?.message || "Could not load school"));
  }, [orgId]);

  // Fetch dashboard + leaderboard + insights on mount and whenever period changes.
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getDashboard(orgId, period),
      getSectionsLeaderboard(orgId, period),
      getInsights(orgId, period),
    ])
      .then(([d, s, i]) => {
        setDashboard(d);
        setLeaderboard(s.sections);
        setInsights(i);
      })
      .catch((e) => setError(e?.message || "Could not load dashboard"))
      .finally(() => setLoading(false));
  }, [orgId, period]);

  const health = dashboard?.health;
  const totalSections = leaderboard?.length ?? 0;
  const asOfLabel = dashboard?.asOf
    ? new Date(dashboard.asOf).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="space-y-5">
      {/* ManageToolbar is now rendered by SchoolAdminShell, which wraps
          every /school/orgs/:orgId/* route. */}
      {tourRole && me?.userId && <RoleTour role={tourRole} userId={me.userId} />}

      {/* Pending time-off requests — surfaces at the top so the
          principal sees what needs review without scrolling. The
          widget hides itself when the queue is empty. */}
      <PendingTimeOffWidget orgId={orgId} />

      {/* Setup checklist — only for fresh schools with at least one
          incomplete actionable step and no prior dismissal. */}
      {/* Fresh-campus CTA — the checklist can be dismissed (or completes
          once an admin is added), after which an empty org rendered a
          wall of "—" KPI tiles with no next step. Keep a slim pointer
          until the campus actually has students. */}
      {!showSetupChecklist && setupCounts && setupCounts.studentCount === 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-indigo-900">
                This campus has no students yet
              </div>
              <p className="text-xs text-indigo-700">
                The tiles below fill in as classes, students, and attendance
                are added.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/school/orgs/${orgId}/admin/classes`}
                className="inline-flex items-center rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Add classes
              </Link>
              <Link
                to={`/school/orgs/${orgId}/admin/import`}
                className="inline-flex items-center rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Import from Excel
              </Link>
            </div>
          </div>
        </div>
      )}

      {showSetupChecklist && setupCounts && (
        <div data-tour="setup-checklist">
          <SetupChecklist
            orgId={orgId}
            viewerRole={viewerRole}
            classCount={setupCounts.classCount}
            studentCount={setupCounts.studentCount}
            teacherCount={setupCounts.teacherCount}
            linkCodeCount={setupCounts.linkCodeCount}
            announcementCount={setupCounts.announcementCount}
            adminCount={setupCounts.adminCount}
            onDismiss={() => setSetupDismissed(true)}
          />
        </div>
      )}

      {/* Page title + period */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("dashboard.title")}</h1>
          {dashboard?.viewScope?.kind === "sections" ? (
            <p className="text-sm text-slate-500">
              Your sections:{" "}
              {dashboard.viewScope.sectionLabels &&
              dashboard.viewScope.sectionLabels.length > 0 ? (
                <span className="font-medium text-slate-700">
                  {dashboard.viewScope.sectionLabels.map((s) => s.label).join(", ")}
                </span>
              ) : (
                <span className="italic text-slate-400">
                  none assigned yet
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              {dashboard?.viewScope?.kind === "org" ? "All classes — " : ""}
              School-wide performance, attendance, and behavior across {totalSections} classes
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {myGroups.map((g) => (
            <Link
              key={g.id}
              to={`/school/school-groups/${g.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Building2 className="h-3.5 w-3.5" />
              {myGroups.length > 1 ? g.name : "All campuses"}
            </Link>
          ))}
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Loading + error states (compact, page still renders shell) */}
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Loading dashboard…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Could not load dashboard: {error}
        </div>
      )}

      {/* Admin-who-also-teaches: quick actions for sections they own. */}
      {myOwnSections.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            My classes
          </div>
          <div className="mt-2 space-y-2">
            {myOwnSections.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{s.label}</span>
                <Link to={`/school/orgs/${orgId}/sections/${s.id}/attendance`}>
                  <Button size="sm" className="h-7 bg-indigo-600 hover:bg-indigo-700 text-xs">
                    Take attendance
                  </Button>
                </Link>
                <Link to={`/school/orgs/${orgId}/sections/${s.id}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    Overview & subjects
                  </Button>
                </Link>
                <Link to={`/school/orgs/${orgId}/sections/${s.id}/lessons`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    Lessons
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Glance bar — one dark strip: primary stats inline, health pills,
          zero metrics behind "More metrics" (design 2a). Horizontally
          scrollable on phones (design 1d stat strip). */}
      {dashboard && (
        <div data-tour="kpi-grid">
          <GlanceBar
            dashboard={dashboard}
            academics={academics}
            orgId={orgId}
            canTeachers={canTeachers}
            canApprovals={canApprovals}
            canFees={canFees}
            canForms={canForms}
          />
        </div>
      )}

      {/* Term-switch nudge — appears only after the current term's end
          date passes, so the manual is_current flag can't silently lag
          the calendar (coverage/pace measure against the current term). */}
      <TermSwitchNudge orgId={orgId} />

      {/* Today strip — "is school running normally right now?" */}
      {todayOps && (() => {
        const attDone = todayOps.sectionsTaken >= todayOps.sectionsExpected;
        const allClear =
          attDone && todayOps.openFlags === 0 && todayOps.teachersOnLeave.length === 0;
        const missPreview = todayOps.missingSections.slice(0, 3).join(", ");
        const missMore = todayOps.missingSections.length - 3;
        return (
          <div
            className={
              "flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm " +
              (allClear
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white")
            }
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Today
            </span>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
                (attDone
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-amber-50 text-amber-800 ring-1 ring-amber-200")
              }
              title={
                todayOps.missingSections.length > 0
                  ? `Missing: ${todayOps.missingSections.join(", ")}`
                  : undefined
              }
            >
              Attendance {todayOps.sectionsTaken}/{todayOps.sectionsExpected}
              {!attDone && missPreview && (
                <span className="font-normal">
                  {" — missing "}{missPreview}
                  {missMore > 0 ? ` +${missMore} more` : ""}
                </span>
              )}
            </span>
            {todayOps.teachersOnLeave.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                On leave: {todayOps.teachersOnLeave.join(", ")}
              </span>
            )}
            {todayOps.substitutionsToday > 0 && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                {todayOps.substitutionsToday} substitution{todayOps.substitutionsToday === 1 ? "" : "s"}
              </span>
            )}
            {todayOps.openFlags > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                {todayOps.openFlags} open flag{todayOps.openFlags === 1 ? "" : "s"}
              </span>
            )}
            {todayOps.earlyReleasesToday > 0 && (
              <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                {todayOps.earlyReleasesToday} early release{todayOps.earlyReleasesToday === 1 ? "" : "s"}
              </span>
            )}
            {allClear && <span className="text-xs">All sections marked, no open flags — normal day.</span>}
          </div>
        );
      })()}

      {/* ── Two-column body (2a): live/actionable left, analysis right.
          On phones (1d) each module collapses behind an accordion. ── */}
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-[600px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <DashSection title="Right now" defaultOpen>
      {/* Right now — which period is running per in-scope section, who
          is teaching, and who needs cover (wing-scoped for incharges). */}
      <RightNowPanel orgId={orgId} />          </DashSection>
          {dashboard && (
            <DashSection
              title="Needs attention"
              tone="alert"
              defaultOpen={dashboard.alerts.some((a) => a.severity === "critical")}
              right={
                dashboard.alerts.length > 0 ? (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10.5px] font-bold text-white">
                    {dashboard.alerts.length}
                  </span>
                ) : undefined
              }
            >
      {/* Attendance day note — org-wide "why was today unusual" strip. */}
      <AttendanceDayNotes
        orgId={orgId}
        todayPct={dashboard?.tiles.attendanceToday.value ?? null}
        periodPct={dashboard?.tiles.attendancePeriod.value ?? null}
      />              <div data-tour="alerts-row">
                <NeedsAttention alerts={dashboard.alerts} orgId={orgId} />
              </div>
            </DashSection>
          )}
          {leaderboard && (
            <DashSection
              title="Sections leaderboard"
              right={<span className="text-xs font-medium text-slate-400">{leaderboard.length}</span>}
            >
      {/* Leaderboard */}
      {leaderboard && (
        <div data-tour="leaderboard">
          <Leaderboard rows={leaderboard} orgId={orgId} />
        </div>
      )}            </DashSection>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {academics?.pace && (
            <DashSection title="Curriculum pace">
      {/* Curriculum pace vs the assessment calendar — turns the raw
          "N% complete" into "who is furthest behind and how far", which
          is the actionable version for a principal. */}
      {academics?.pace && (academics.pace.laggards.length > 0 || (academics.pace.notStartedCount ?? 0) > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Curriculum pace — furthest behind</CardTitle>
                <CardDescription className="text-xs">
                  {academics.pace.expectedPct != null ? (
                    <>
                      School-wide {academics.curriculum.progressPct}% complete ·
                      expected ~{academics.pace.expectedPct}% by this point of{" "}
                      {academics.pace.termName}
                      {academics.pace.termEnd ? ` (ends ${academics.pace.termEnd})` : ""}
                    </>
                  ) : (
                    <>
                      School-wide {academics.curriculum.progressPct}% complete — set the
                      current term&apos;s dates in Assessments to see expected pace.
                    </>
                  )}
                  {(academics.pace.notStartedCount ?? 0) > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-amber-700">
                        {academics.pace.notStartedCount} subject
                        {academics.pace.notStartedCount === 1 ? " has" : "s have"} no topics
                        ticked yet
                      </span>
                    </>
                  )}
                </CardDescription>
              </div>
              <Link
                to={`/school/orgs/${orgId}/admin/classes`}
                className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
              >
                All classes →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {academics.pace.laggards.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">
                No started subject is lagging — the amber count above is subjects
                where teachers haven&apos;t begun ticking topics.
              </p>
            ) : (
            <ul className="divide-y divide-slate-100">
              {academics.pace.laggards.map((l) => {
                const behind =
                  academics.pace!.expectedPct != null
                    ? academics.pace!.expectedPct - l.pct
                    : null;
                const tone =
                  behind != null && behind > 30
                    ? "text-rose-700"
                    : behind != null && behind > 15
                      ? "text-amber-700"
                      : "text-slate-700";
                // Deep-link to the subject's curriculum panel so the
                // principal can see WHICH topics are unticked, not just
                // the percentage. Falls back to a plain row if the class
                // has no section yet.
                const secId = sectionByClassName[l.className];
                const body = (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {l.className} · {l.subjectName}
                      </span>
                      <span className={"text-sm font-semibold tabular-nums " + tone}>
                        {l.pct}%
                        {behind != null && behind > 0 && (
                          <span className="ml-1 text-[10px] font-normal text-slate-400">
                            ({behind} pts behind)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-indigo-500"
                          style={{ width: `${l.pct}%` }}
                        />
                        {academics.pace!.expectedPct != null && (
                          <div
                            className="absolute inset-y-0 w-0.5 bg-slate-400"
                            style={{ left: `${academics.pace!.expectedPct}%` }}
                            title={`Expected ~${academics.pace!.expectedPct}%`}
                          />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
                        {l.topicsDone}/{l.topicsTotal}
                      </span>
                    </div>
                  </div>
                );
                return (
                  <li key={l.classSubjectId}>
                    {secId ? (
                      <Link
                        to={`/school/orgs/${orgId}/sections/${secId}?openSubject=${encodeURIComponent(l.classSubjectId)}`}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
                        title={`Open ${l.className} ${l.subjectName} curriculum`}
                      >
                        {body}
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </CardContent>
        </Card>
      )}            </DashSection>
          )}
          {atRisk && (
            <DashSection title="Chronic absentees">
      {/* Chronic absentees — the actionable version of the attendance
          aggregate: which students are driving the number down. */}
      {atRisk && (
        <Card className={atRisk.rows.length > 0 ? "border-rose-200" : undefined}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Chronic absentees</CardTitle>
                <CardDescription className="text-xs">
                  Below {atRisk.threshold}% attendance{" "}
                  {atRisk.period === "TERM" && atRisk.termName
                    ? `this term (${atRisk.termName}, since ${atRisk.windowStart})`
                    : atRisk.period === "YTD"
                      ? "this year"
                      : "this month"}
                  {" · "}students with at least {atRisk.minDays} marked days
                </CardDescription>
              </div>
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                {[["TERM", "Term"], ["MTD", "Month"], ["YTD", "Year"]].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAtRiskPeriod(val)}
                    className={
                      "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors " +
                      (atRiskPeriod === val
                        ? "bg-slate-800 text-white"
                        : "text-slate-600 hover:bg-slate-100")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {atRisk.rows.length === 0 ? (
              <p className="py-3 text-center text-xs text-emerald-700">
                No students below {atRisk.threshold}% in this window — attendance healthy.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(atRiskExpanded ? atRisk.rows : atRisk.rows.slice(0, 6)).map((r) => (
                  <li key={r.studentId}>
                    <Link
                      to={`/school/orgs/${orgId}/admin/students/${r.studentId}`}
                      className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {r.name}
                          {r.grNumber && (
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                              GR {r.grNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.sectionLabel} · present {r.presentDays}/{r.totalDays} days
                          {r.excusedDays > 0 ? ` · ${r.excusedDays} excused` : ""}
                        </div>
                      </div>
                      <span
                        className={
                          "text-base font-semibold tabular-nums " +
                          (r.pct < 60 ? "text-rose-700" : "text-amber-700")
                        }
                      >
                        {r.pct}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {atRisk.rows.length > 6 && (
              <button
                type="button"
                onClick={() => setAtRiskExpanded((v) => !v)}
                className="mt-1 w-full rounded-md py-1.5 text-center text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                {atRiskExpanded ? "Show fewer" : `Show all ${atRisk.rows.length} students`}
              </button>
            )}
          </CardContent>
        </Card>
      )}            </DashSection>
          )}
          {academics && (
            <DashSection title="Subjects at risk & top subjects">
      {/* Phase 6a: subjects-at-risk + top-subjects panel. Surfaces the
          per-subject grading data only made possible by Phase 3. Hidden
          when there's nothing yet to rank (fresh org / no graded
          assignments yet). */}
      {academics &&
        (academics.subjectsAtRisk.length > 0 ||
          academics.topSubjects.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* At risk */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Subjects at risk</CardTitle>
                    <CardDescription className="text-xs">
                      Lowest weighted averages (last 60 days, min 3 grades)
                    </CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200">
                    <AlertTriangle className="h-3 w-3" />
                    {academics.subjectsAtRisk.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {academics.subjectsAtRisk.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500">
                    No subjects at risk — averages all healthy.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {academics.subjectsAtRisk.map((s, i) => {
                      const tone =
                        s.avgPct >= 60
                          ? "text-amber-700"
                          : "text-rose-700";
                      return (
                        <li key={i}>
                          <Link
                            to={`/school/orgs/${orgId}/sections/${s.classSectionId}/gradebook`}
                            className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate">
                                {s.subjectName}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {s.className} · {s.sectionName} · {s.gradedCount} grades
                              </div>
                            </div>
                            <span className={"text-base font-semibold tabular-nums " + tone}>
                              {s.avgPct}%
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Top performing */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Top subjects</CardTitle>
                    <CardDescription className="text-xs">
                      Strongest weighted averages this period
                    </CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <Sparkles className="h-3 w-3" />
                    {academics.topSubjects.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {academics.topSubjects.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500">
                    Not enough graded data yet to rank top subjects.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {academics.topSubjects.map((s, i) => (
                      <li key={i}>
                        <Link
                          to={`/school/orgs/${orgId}/sections/${s.classSectionId}/gradebook`}
                          className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {s.subjectName}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {s.className} · {s.sectionName} · {s.gradedCount} grades
                            </div>
                          </div>
                          <span className="text-base font-semibold tabular-nums text-emerald-700">
                            {s.avgPct}%
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}            </DashSection>
          )}
          {insights && (
            <DashSection title="Attendance & behavior">
      {/* Breakdown panels */}
      {/* Stacked, not 3-across: these live in the dashboard's right
          column now, where three side-by-side cards clipped the donut
          legend to "Pres…/Abs…". */}
      {insights && (
        <div className="grid gap-4">
          <AttendanceDonut data={insights.attendanceDistribution} />
          <BehaviorBars
            title="Top Positive Behaviors"
            description="Most logged this period"
            rows={insights.topPositive}
            variant="positive"
          />
          <BehaviorBars
            title="Top Concerns"
            description="Most logged this period"
            rows={insights.topConcern}
            variant="concern"
          />
        </div>
      )}            </DashSection>
          )}
          {insights && (
            <DashSection title="Recent activity">
              <RecentActivity rows={insights.recentActivity} />
            </DashSection>
          )}
        </div>
      </div>

      {/* Phase 6a: data-hygiene nudge. Shown only if there's something
          to nudge about — keeps the dashboard tidy for healthy orgs. */}
      {academics &&
        (academics.hygiene.untaggedLessonsLast30 > 0 ||
          academics.hygiene.untaggedAssignmentsLast30 > 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium">Untagged content this month — </span>
                {academics.hygiene.untaggedLessonsLast30 > 0 && (
                  <>
                    {academics.hygiene.untaggedLessonsLast30} lesson
                    {academics.hygiene.untaggedLessonsLast30 === 1 ? "" : "s"}
                  </>
                )}
                {academics.hygiene.untaggedLessonsLast30 > 0 &&
                  academics.hygiene.untaggedAssignmentsLast30 > 0 &&
                  " · "}
                {academics.hygiene.untaggedAssignmentsLast30 > 0 && (
                  <>
                    {academics.hygiene.untaggedAssignmentsLast30} assignment
                    {academics.hygiene.untaggedAssignmentsLast30 === 1 ? "" : "s"}
                  </>
                )}
                {" "}
                (last 30 days) saved without a subject selected — so they are not
                counted under any subject&apos;s coverage or gradebook. The teacher
                (or an admin) can fix it by editing the entry and picking its
                subject from the dropdown.
              </div>
            </div>
          </div>
        )}      {/* Footer link back to legacy view while we transition */}
      {org && (
        <div className="text-right">
          <Link
            to={`/school/orgs/${orgId}/setup`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600"
          >
            School setup
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
