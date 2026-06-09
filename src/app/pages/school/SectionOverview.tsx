// Section overview — clicking a leaderboard row lands here.
//
// Shows a focused, scannable view of ONE class section:
//   - Hero with class name + class teacher
//   - KPI tiles: students, attendance %, behavior score, last-10-day spark
//   - Quick action buttons: Take Attendance / Log Behavior
//   - Recent behavior notes with category chips
//   - Big navigation cards to drill into the per-feature pages
//
// Routed at /school/orgs/:orgId/sections/:sectionId.
//
// Data sources reused:
//   - getSectionsLeaderboard(period) → header KPIs (filter by sectionId)
//   - getSectionBehaviorNotes()      → recent behavior list
//
// Both are existing endpoints; no new backend work required.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import {
  Activity,
  BookOpen,
  Calendar,
  ClipboardCheck,
  GraduationCap,
  Heart,
  ListChecks,
  MessageSquare,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { HeroCard } from "../../components/school-ui";
import {
  getSchoolMe,
  getSectionsLeaderboard,
  getSectionBehaviorNotes,
  viewerRoleForOrg,
  type BehaviorNote,
  type DashboardPeriod,
  type LeaderboardRow,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { SectionSubjectsManager } from "./components/SectionSubjectsManager";

const PERIODS: ReadonlyArray<{ value: DashboardPeriod; label: string }> = [
  { value: "T", label: "T" },
  { value: "WTD", label: "WTD" },
  { value: "MTD", label: "MTD" },
  { value: "QTD", label: "QTD" },
  { value: "YTD", label: "YTD" },
];

function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  const d = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

// Tiny inline sparkline using SVG paths. No recharts dep needed.
function Sparkline({ values, color = "#0f766e" }: { values: number[]; color?: string }) {
  if (values.length === 0) return <div className="h-8 w-full" />;
  const max = Math.max(100, ...values);
  const min = 0;
  const w = 120;
  const h = 28;
  const step = w / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      {values.map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / (max - min || 1)) * h;
        return <circle key={i} cx={x} cy={y} r="1.5" fill={color} />;
      })}
    </svg>
  );
}

export function SectionOverview() {
  const { orgId = "", sectionId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [period, setPeriod] = useState<DashboardPeriod>("MTD");
  const [row, setRow] = useState<LeaderboardRow | null>(null);
  const [notes, setNotes] = useState<BehaviorNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    Promise.all([
      getSectionsLeaderboard(orgId, period),
      getSectionBehaviorNotes(orgId, sectionId),
    ])
      .then(([lb, bh]) => {
        const found = lb.sections.find((s) => s.sectionId === sectionId) ?? null;
        setRow(found);
        // Already sorted newest-first by the backend; cap to the 10 most
        // recent for the card view (drill-in page has full pagination).
        setNotes(bh.notes.slice(0, 10));
      })
      .finally(() => setLoading(false));
  }, [orgId, sectionId, period]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, { positive: number; concern: number; pts: number }>();
    for (const n of notes) {
      const cat = n.category ?? "uncategorized";
      const cur = counts.get(cat) ?? { positive: 0, concern: 0, pts: 0 };
      if (n.kind === "positive") cur.positive += 1;
      else cur.concern += 1;
      cur.pts += Math.abs(n.points ?? 0);
      counts.set(cat, cur);
    }
    return Array.from(counts.entries())
      .map(([cat, v]) => ({ category: cat, ...v, total: v.positive + v.concern }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [notes]);

  if (meLoading) return null;
  // Any non-other school role in this org can read the section overview.
  // Backend already enforces per-section scoping for class teachers and
  // visiting teachers (determineScope), so the page either renders their
  // own sections or returns empty data. Previously gated to admin/principal
  // only, which kicked class teachers back to /school → "no role" page.
  const viewerRole = viewerRoleForOrg(me, orgId);
  if (viewerRole === "other") {
    return <Navigate to="/school" replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
          <p className="text-sm text-slate-500">Loading section…</p>
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-3">
        <HeroCard title="Section not found" subtitle="No leaderboard row matches this section." />
        <Link to={`/school/orgs/${orgId}`}>
          <Button variant="outline" size="sm">← Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  const status = row.status; // compliant | watch | flagged
  const statusColor =
    status === "compliant" ? "text-emerald-600"
    : status === "watch"   ? "text-amber-600"
    : "text-rose-600";

  const tileBase = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
  const navCardBase = "group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow transition-all cursor-pointer";

  return (
    <div className="space-y-4">
      <HeroCard
        eyebrow="Section"
        title={`${row.className} · ${row.sectionName}`}
        subtitle={row.classTeacherName ? `Class teacher: ${row.classTeacherName}` : "No class teacher assigned"}
        rightSlot={
          <div className="flex items-center gap-2">
            <Link to={`/school/orgs/${orgId}`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                ← Dashboard
              </Button>
            </Link>
            <div className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 p-1">
              {PERIODS.map((p) => {
                const active = p.value === period;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPeriod(p.value)}
                    className={
                      "rounded-md px-2 py-0.5 text-xs font-medium transition-colors " +
                      (active ? "bg-white text-slate-900" : "text-white/80 hover:bg-white/10")
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
      >
        {/* KPI tiles inline within the hero */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-300">
              <Users className="h-3 w-3" /> Students
            </div>
            <div className="mt-1 text-2xl font-semibold text-white">{row.studentCount}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-300">
              <ClipboardCheck className="h-3 w-3" /> Attendance
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">{row.attendancePct.toFixed(1)}%</span>
              {row.attendanceDelta !== 0 && (
                <span className={"inline-flex items-center gap-0.5 text-[10px] font-medium " + (row.attendanceDelta > 0 ? "text-emerald-300" : "text-rose-300")}>
                  {row.attendanceDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {row.attendanceDelta > 0 ? "+" : ""}{row.attendanceDelta.toFixed(1)}pp
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-300">
              <Heart className="h-3 w-3" /> Behavior
            </div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {row.behaviorScore > 0 ? "+" : ""}{row.behaviorScore}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">
              {row.positiveCount} positive · {row.concernCount} concerns
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-300">
              <Activity className="h-3 w-3" /> Last 10 schooldays
            </div>
            <Sparkline values={row.last10Days} color={status === "flagged" ? "#fb7185" : status === "watch" ? "#fbbf24" : "#34d399"} />
            <div className={"mt-1 text-[10px] font-medium uppercase tracking-wide " + statusColor}>
              {status}
            </div>
          </div>
        </div>
      </HeroCard>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
          onClick={() => navigate(`/school/orgs/${orgId}/sections/${sectionId}/attendance`)}
        >
          <ClipboardCheck className="mr-1 h-4 w-4" /> Take attendance
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/school/orgs/${orgId}/sections/${sectionId}/behavior`)}
        >
          <MessageSquare className="mr-1 h-4 w-4" /> Log behavior
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/school/orgs/${orgId}/sections/${sectionId}/hifz`)}
        >
          <BookOpen className="mr-1 h-4 w-4" /> Log Hifz
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigate(`/school/orgs/${orgId}/sections/${sectionId}/lessons/new`)
          }
        >
          <ListChecks className="mr-1 h-4 w-4" /> Log lesson
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            navigate(`/school/orgs/${orgId}/sections/${sectionId}/lessons`)
          }
        >
          <BookOpen className="mr-1 h-4 w-4" /> View lessons
        </Button>
      </div>

      {/* Two-column body: recent behavior on the left, drill-in cards on right */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent behavior + top categories */}
        <div className={tileBase + " lg:col-span-2"}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recent behavior</h3>
              <p className="text-xs text-slate-500">Last 10 entries · click 'Behavior' below for the full feed</p>
            </div>
            <Link
              to={`/school/orgs/${orgId}/sections/${sectionId}/behavior`}
              className="text-xs text-indigo-600 hover:underline"
            >
              View all →
            </Link>
          </div>

          {topCategories.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {topCategories.map((c) => {
                const dominant = c.concern > c.positive ? "concern" : "positive";
                const cls = dominant === "concern"
                  ? "bg-rose-50 text-rose-700 ring-rose-200"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-200";
                return (
                  <span key={c.category} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cls}`}>
                    {c.category} · {c.total}
                  </span>
                );
              })}
            </div>
          )}

          {notes.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No behavior notes yet for this section.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start gap-2 py-2">
                  <span
                    className={
                      "mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full " +
                      (n.kind === "positive" ? "bg-emerald-500" : "bg-rose-500")
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-slate-700 capitalize truncate">
                        {n.category ?? "—"}
                      </span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{relativeDate(n.observedAt)}</span>
                    </div>
                    <p className="text-xs text-slate-600 truncate">{n.notes}</p>
                  </div>
                  <span
                    className={
                      "flex-shrink-0 text-xs font-medium tabular-nums " +
                      (n.kind === "positive" ? "text-emerald-700" : "text-rose-700")
                    }
                  >
                    {n.kind === "positive" ? "+" : ""}{n.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Drill-in nav cards */}
        <div className="flex flex-col gap-3">
          <Link to={`/school/orgs/${orgId}/sections/${sectionId}/attendance`} className={navCardBase}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2"><Calendar className="h-5 w-5 text-indigo-600" /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">Attendance</div>
                <div className="text-xs text-slate-500">Roll call + history</div>
              </div>
            </div>
          </Link>
          <Link to={`/school/orgs/${orgId}/sections/${sectionId}/behavior`} className={navCardBase}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-50 p-2"><Sparkles className="h-5 w-5 text-rose-600" /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">Behavior feed</div>
                <div className="text-xs text-slate-500">All positive + concern notes</div>
              </div>
            </div>
          </Link>
          <Link to={`/school/orgs/${orgId}/sections/${sectionId}/hifz`} className={navCardBase}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2"><BookOpen className="h-5 w-5 text-emerald-600" /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">Hifz progress</div>
                <div className="text-xs text-slate-500">Sabaq · Sabqi · Manzil</div>
              </div>
            </div>
          </Link>
          <Link to={`/school/orgs/${orgId}/admin/students?classSectionId=${encodeURIComponent(sectionId)}`} className={navCardBase}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-slate-100 p-2"><GraduationCap className="h-5 w-5 text-slate-700" /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">Students ({row.studentCount})</div>
                <div className="text-xs text-slate-500">Roster, profiles, edits</div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Subjects — Phase 1B of per-subject rewiring. Principals + admins
          can add / edit / delete; teachers see a read-only list. Future
          PRs thread subject_id into lessons / assignments / gradebook. */}
      <SectionSubjectsManager
        orgId={orgId}
        sectionId={sectionId}
        canManage={
          viewerRole === "principal" || viewerRole === "admin"
        }
      />
    </div>
  );
}
