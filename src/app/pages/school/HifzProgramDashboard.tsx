// Hifz Program dashboard — the program-level lens over hifz work that
// class-by-class views can't give: all ~85 full-time hifz students
// (Hifz-schedule classes) plus completed-hifz kids doing manzil revision
// inside academic classes, each with "kahan tak suna diya" (last recited
// position), recency, and a stalled flag.
//
// Structure stays classes (attendance/portal/fees live there); this page
// is the PROGRAM view on top. Admin/principal only.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { BookOpen, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  getHifzProgram,
  getSchoolMe,
  isOrgAdmin,
  type HifzProgramResponse,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { NoAccessRedirect } from "../../components/school-ui";

function positionLabel(s: { lastKind: string | null; lastSurah: number | null; lastAyah: number | null; lastJuz: number | null }): string {
  if (!s.lastKind) return "—";
  const parts: string[] = [];
  if (s.lastSurah) parts.push(`سورہ ${s.lastSurah}`);
  if (s.lastAyah) parts.push(`آیت ${s.lastAyah}`);
  if (s.lastJuz) parts.push(`پارہ ${s.lastJuz}`);
  const pos = parts.join(" · ") || "—";
  return `${pos} (${s.lastKind})`;
}

function relDays(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

type Filter = "all" | "stalled" | "never" | "revision";

export function HifzProgramDashboard() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [data, setData] = useState<HifzProgramResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => {
    if (!orgId) return;
    getHifzProgram(orgId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [orgId]);

  const visible = useMemo(() => {
    const rows = data?.students ?? [];
    if (filter === "stalled") return rows.filter((r) => r.lastEntryAt && (r.stalledDays ?? 0) > 7);
    if (filter === "never") return rows.filter((r) => !r.lastEntryAt);
    if (filter === "revision") return rows.filter((r) => r.track === "revision");
    return rows;
  }, [data, filter]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <NoAccessRedirect />;

  const t = data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-emerald-600" /> Hifz Program
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Every hifz student across the school — last recited position,
            recency, and who needs attention. Teachers log from their class
            → Quran/Hifz progress.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      {!data && !error && (
        <div className="flex items-center gap-2 justify-center py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading program…
        </div>
      )}

      {data && t && (
        <>
          {/* Program KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Students</div>
              <div className="text-2xl font-bold tabular-nums">{t.students}</div>
              <div className="text-[11px] text-slate-500">{t.hifzTrack} hifz · {t.revisionTrack} revision</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Active this week</div>
              <div className={"text-2xl font-bold tabular-nums " + (t.activeThisWeek > 0 ? "text-emerald-700" : "text-slate-400")}>{t.activeThisWeek}</div>
              <div className="text-[11px] text-slate-500">{t.entries7d} entries in 7 days</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Stalled (7d+)</div>
              <div className={"text-2xl font-bold tabular-nums " + (t.stalled > 0 ? "text-amber-700" : "text-emerald-700")}>{t.stalled}</div>
              <div className="text-[11px] text-slate-500">had entries, then went quiet</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Never logged</div>
              <div className={"text-2xl font-bold tabular-nums " + (t.neverLogged > 0 ? "text-slate-700" : "text-emerald-700")}>{t.neverLogged}</div>
              <div className="text-[11px] text-slate-500">no recitation recorded yet</div>
            </CardContent></Card>
          </div>

          {/* Per-class rollup */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.classes.map((c) => (
              <Link key={c.sectionId} to={`/school/orgs/${orgId}/sections/${c.sectionId}/hifz`}>
                <Card className="h-full transition-colors hover:border-emerald-300">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm">{c.label}</CardTitle>
                    <CardDescription className="text-xs">{c.teacherName ?? "No hifz teacher"}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-slate-600">
                    {c.studentCount} students · {c.activeThisWeek} active this week
                    <div className="text-[11px] text-slate-400">last activity: {relDays(c.lastActivity)}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Student roster */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">Students — kahan tak suna diya</CardTitle>
                <div className="flex flex-wrap gap-1">
                  {([["all", `All (${data.students.length})`], ["stalled", `Stalled (${t.stalled})`], ["never", `Never logged (${t.neverLogged})`], ["revision", `Revision (${t.revisionTrack})`]] as Array<[Filter, string]>).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFilter(k)}
                      className={
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors " +
                        (filter === k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {visible.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  {data.students.length === 0
                    ? "No hifz students found. Students in Hifz classes appear here automatically once enrolled."
                    : "Nothing in this filter."}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visible.map((s) => {
                    const stalled = s.lastEntryAt && (s.stalledDays ?? 0) > 7;
                    return (
                      <li key={s.studentId} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-slate-900">{s.name}</span>
                            {s.grNumber && <span className="text-[10px] text-slate-400">GR {s.grNumber}</span>}
                            {s.track === "revision" && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">Hafiz · revision</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {s.sectionLabel} · {positionLabel(s)}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={"text-xs font-medium " + (stalled ? "text-amber-700" : s.lastEntryAt ? "text-slate-700" : "text-slate-400")}>
                            {relDays(s.lastEntryAt)}
                          </div>
                          <div className="text-[10px] text-slate-400 tabular-nums">{s.entries30d} in 30d</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default HifzProgramDashboard;
