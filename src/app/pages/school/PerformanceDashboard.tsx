// Principal/Admin Performance Dashboard.
//
// Routed as /school/orgs/:orgId — replaces the old tile-grid PrincipalDashboard
// as the top-level org entry point. Visual reference is a multi-location
// franchise dashboard: dense, scannable, dark hero card with KPI tiles,
// colored alert cards row, big class leaderboard, breakdown panels.
//
// Backend endpoints land in the parallel PR `school-pilot/dashboard-backend`.
// Until then the page will surface its error state — that's expected.

import { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Bell,
  BookOpen,
  Building2,
  CheckCircle,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  GraduationCap,
  Heart,
  KeyRound,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  UserSquare2,
  AlertTriangle,
  Info,
  AlertOctagon,
  ArrowUpRight,
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
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { WorkspaceContext } from "../../contexts/WorkspaceContext";
import {
  getDashboard,
  getInsights,
  getOrganization,
  getSectionsLeaderboard,
  isOrgAdmin,
  isOrgPrincipal,
  type DashboardAlert,
  type DashboardPeriod,
  type DashboardResponse,
  type DashboardTile,
  type InsightsResponse,
  type LeaderboardRow,
  type OrgWithCounts,
} from "../../../utils/schoolApi";

// ─── Period selector ─────────────────────────────────────────────────────

const PERIODS: ReadonlyArray<{ value: DashboardPeriod; label: string; full: string }> = [
  { value: "T", label: "T", full: "Today" },
  { value: "WTD", label: "WTD", full: "Week-to-date" },
  { value: "MTD", label: "MTD", full: "Month-to-date" },
  { value: "QTD", label: "QTD", full: "Quarter-to-date" },
  { value: "YTD", label: "YTD", full: "Year-to-date" },
];

function PeriodSelector({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (v: DashboardPeriod) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {PERIODS.map((p) => {
        const active = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            title={p.full}
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

// ─── Manage toolbar ──────────────────────────────────────────────────────

function ManageToolbar({
  orgId,
  showPermissions,
  showRosterRequests,
}: {
  orgId: string;
  showPermissions: boolean;
  showRosterRequests: boolean;
}) {
  // Phase B wired these to the real admin pages. Until Phase B shipped these
  // all pointed at /setup as a placeholder.
  const items: Array<{ label: string; to: string; Icon: typeof Users; key: string }> = [
    { key: "classes", label: "Classes", to: `/school/orgs/${orgId}/admin/classes`, Icon: BookOpen },
    { key: "students", label: "Students", to: `/school/orgs/${orgId}/admin/students`, Icon: Users },
    { key: "parents", label: "Parents", to: `/school/orgs/${orgId}/admin/parents`, Icon: Heart },
    { key: "teachers", label: "Teachers", to: `/school/orgs/${orgId}/admin/teachers`, Icon: UserSquare2 },
    { key: "linkcodes", label: "Link Codes", to: `/school/orgs/${orgId}/admin/link-codes`, Icon: KeyRound },
  ];
  if (showRosterRequests) {
    items.push({
      key: "roster-requests",
      label: "Roster Requests",
      to: `/school/orgs/${orgId}/admin/roster-requests`,
      Icon: FileText,
    });
  }
  if (showPermissions) {
    items.push({
      key: "permissions",
      label: "Permissions",
      to: `/school/orgs/${orgId}/admin/permissions`,
      Icon: ShieldCheck,
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map(({ key, label, to, Icon }) => (
        <Link
          key={key}
          to={to}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Link>
      ))}
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
}

function KpiTile({ label, tile, Icon, asPercent, signed }: KpiTileProps) {
  const muted = tile.value === null;
  const displayValue = muted
    ? "—"
    : asPercent
    ? `${tile.value}%`
    : signed && tile.value !== null && tile.value > 0
    ? `+${tile.value}`
    : String(tile.value);
  const delta = tile.deltaPp ?? null;
  return (
    <div
      className={
        "rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm transition-colors " +
        (muted ? "opacity-60" : "hover:bg-white/10")
      }
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-300">
        <Icon className="h-3.5 w-3.5" />
        {label}
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
    </div>
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

function AlertCard({ alert }: { alert: DashboardAlert }) {
  const s = SEVERITY_STYLES[alert.severity];
  return (
    <div className={"min-w-[260px] flex-1 rounded-xl border p-3 shadow-sm " + s.wrap}>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={"border-transparent bg-white/60 text-[10px] uppercase tracking-wide " + s.title}
        >
          {alert.severity}
        </Badge>
        <span className={"inline-flex items-center gap-1 text-xs font-medium " + s.title}>
          <s.Icon className="h-3.5 w-3.5" />
          {alert.kind}
        </span>
      </div>
      <div className={"mt-2 text-sm font-semibold " + s.title}>{alert.title}</div>
      <p className="mt-1 line-clamp-2 text-xs text-slate-700">{alert.body}</p>
      {alert.actionPath && (
        <Link
          to={alert.actionPath}
          className={"mt-2 inline-flex items-center gap-1 text-xs font-medium " + s.title}
        >
          {alert.actionLabel || "Open"}
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────

type LeaderboardFilter = "all" | "compliant" | "watch" | "flagged";

const STATUS_PILL: Record<LeaderboardRow["status"], string> = {
  compliant: "bg-emerald-100 text-emerald-700 border-emerald-200",
  watch: "bg-amber-100 text-amber-700 border-amber-200",
  flagged: "bg-rose-100 text-rose-700 border-rose-200",
};

function AttendanceBar({ pct, status }: { pct: number; status: LeaderboardRow["status"] }) {
  const color =
    status === "compliant" ? "bg-emerald-500" : status === "watch" ? "bg-amber-500" : "bg-rose-500";
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={"absolute inset-y-0 left-0 " + color} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-700">{pct.toFixed(1)}%</span>
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
  const totalCount = rows.length;

  const FILTERS: ReadonlyArray<{ key: LeaderboardFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "compliant", label: "Compliant" },
    { key: "watch", label: "Watch" },
    { key: "flagged", label: "Flagged" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Class · Section</th>
                <th className="px-4 py-2 text-right">Students</th>
                <th className="px-4 py-2 text-left">Attendance</th>
                <th className="px-4 py-2 text-right">Behavior</th>
                <th className="px-4 py-2 text-left">Pos / Conc</th>
                <th className="px-4 py-2 text-left">10-day</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    No sections match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => (
                  <tr
                    key={row.sectionId}
                    onClick={() =>
                      navigate(
                        `/school/orgs/${orgId}/admin/students?classSectionId=${encodeURIComponent(row.sectionId)}`,
                      )
                    }
                    className="group cursor-pointer border-b border-slate-50 transition-colors hover:bg-indigo-50/40"
                  >
                    <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {row.className} · {row.sectionName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.classTeacherName || "Unassigned"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {row.studentCount}
                    </td>
                    <td className="px-4 py-3">
                      <AttendanceBar pct={row.attendancePct} status={row.status} />
                    </td>
                    <td
                      className={
                        "px-4 py-3 text-right tabular-nums font-medium " +
                        (row.behaviorScore >= 0 ? "text-emerald-600" : "text-rose-600")
                      }
                    >
                      {row.behaviorScore >= 0 ? "+" : ""}
                      {row.behaviorScore}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          +{row.positiveCount}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                          −{row.concernCount}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Sparkline data={row.last10Days} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize " +
                          STATUS_PILL[row.status]
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

function RecentActivity({ rows }: { rows: InsightsResponse["recentActivity"] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Recent Activity</CardTitle>
        <CardDescription>Last {rows.length} events across the school</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">No recent activity.</p>
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
                {rows.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-xs text-slate-500">{relativeTime(r.occurredAt)}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {r.kind}
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

// ─── Page ────────────────────────────────────────────────────────────────

export function PerformanceDashboard() {
  const { orgId = "" } = useParams();
  const workspaceCtx = useContext(WorkspaceContext);
  const [period, setPeriod] = useState<DashboardPeriod>("MTD");
  const [org, setOrg] = useState<OrgWithCounts | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const me = workspaceCtx?.me ?? null;
  const showPermissions = isOrgPrincipal(me, orgId);
  const showRosterRequests = isOrgAdmin(me, orgId);

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
      {/* Sticky top toolbar */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {org?.organization.name || "School"}
              </div>
              <div className="text-[11px] text-slate-500">Network Overview</div>
            </div>
          </div>
          <div className="relative mx-auto hidden max-w-md flex-1 md:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Search students, teachers..."
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Manage actions toolbar */}
      <ManageToolbar orgId={orgId} showPermissions={showPermissions} showRosterRequests={showRosterRequests} />

      {/* Page title + period */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Performance Dashboard</h1>
          <p className="text-sm text-slate-500">
            School-wide performance, attendance, and behavior across {totalSections} classes
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
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

      {/* Hero — School at a Glance */}
      {dashboard && (
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-5 shadow-lg ring-1 ring-white/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">At a glance</div>
              <h2 className="mt-0.5 text-lg font-semibold text-white">School at a Glance</h2>
              <div className="mt-0.5 text-[11px] text-slate-400">As of {asOfLabel}</div>
            </div>
            {health && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                <span className="font-medium text-emerald-300">{health.healthy} healthy</span>
                <span className="text-slate-500">·</span>
                <span className="font-medium text-amber-300">{health.watch} watch</span>
                <span className="text-slate-500">·</span>
                <span className="font-medium text-rose-300">{health.flagged} flagged</span>
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            <KpiTile label="Students" tile={dashboard.tiles.students} Icon={Users} />
            <KpiTile label="Attendance Today" tile={dashboard.tiles.attendanceToday} Icon={CheckCircle} asPercent />
            <KpiTile label="Attendance Period" tile={dashboard.tiles.attendancePeriod} Icon={TrendingUp} asPercent />
            <KpiTile label="Teachers" tile={dashboard.tiles.teachers} Icon={GraduationCap} />
            <KpiTile label="Behavior Score" tile={dashboard.tiles.behaviorScore} Icon={Sparkles} signed />
            <KpiTile label="Pending Approvals" tile={dashboard.tiles.pendingApprovals} Icon={Clock} />
            <KpiTile label="Concerns Open" tile={dashboard.tiles.concernsOpen} Icon={AlertTriangle} />
            <KpiTile label="Fees Paid" tile={dashboard.tiles.feesPaidPct} Icon={DollarSign} asPercent />
            <KpiTile label="Hifz Progress" tile={dashboard.tiles.hifzProgress} Icon={BookOpen} asPercent />
            <KpiTile label="Forms Awaiting" tile={dashboard.tiles.formsAwaiting} Icon={FileText} />
          </div>
        </div>
      )}

      {/* Alerts row */}
      {dashboard && (
        dashboard.alerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="font-medium">All systems green</span> — no active alerts.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible">
            {dashboard.alerts.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        )
      )}

      {/* Leaderboard */}
      {leaderboard && <Leaderboard rows={leaderboard} orgId={orgId} />}

      {/* Breakdown panels */}
      {insights && (
        <div className="grid gap-4 lg:grid-cols-3">
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
      )}

      {/* Recent activity */}
      {insights && <RecentActivity rows={insights.recentActivity} />}

      {/* Footer link back to legacy view while we transition */}
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
