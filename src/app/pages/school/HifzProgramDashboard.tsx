// Hifz Program dashboard — the program-level lens over hifz work that
// class-by-class views can't give: all ~85 full-time hifz students
// (Hifz-schedule classes) plus completed-hifz kids doing manzil revision
// inside academic classes, each with "kahan tak suna diya" (last recited
// position), recency, and a stalled flag.
//
// Structure stays classes (attendance/portal/fees live there); this page
// is the PROGRAM view on top. Admin/principal only.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function positionLabel(
  s: { lastKind: string | null; lastSurah: number | null; lastAyah: number | null; lastJuz: number | null },
  t: TFn,
): string {
  if (!s.lastKind) return "—";
  const parts: string[] = [];
  if (s.lastSurah) parts.push(t("hifzProg.posSurah", { n: s.lastSurah }));
  if (s.lastAyah) parts.push(t("hifzProg.posAyah", { n: s.lastAyah }));
  if (s.lastJuz) parts.push(t("hifzProg.posJuz", { n: s.lastJuz }));
  const pos = parts.join(" · ") || "—";
  const kind = ["sabaq", "sabqi", "manzil"].includes(s.lastKind)
    ? t(`hifzTeach.${s.lastKind}`)
    : s.lastKind;
  return `${pos} (${kind})`;
}

function relDays(iso: string | null, t: TFn): string {
  if (!iso) return t("hifzProg.never");
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (d <= 0) return t("hifzProg.today");
  if (d === 1) return t("hifzProg.yesterday");
  return t("hifzProg.daysAgo", { d });
}

type Filter = "all" | "active" | "stalled" | "never" | "revision";

export function HifzProgramDashboard() {
  const { t: tr } = useTranslation();
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
      .then((d) => {
        setData(d);
        // Exception-first (design 4c): the reason to open this page is
        // the never-logged backlog - start there when it exists.
        if ((d.totals?.neverLogged ?? 0) > 0) setFilter("never");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [orgId]);

  const visible = useMemo(() => {
    const rows = data?.students ?? [];
    if (filter === "stalled") return rows.filter((r) => r.lastEntryAt && (r.stalledDays ?? 0) > 7);
    if (filter === "never") return rows.filter((r) => !r.lastEntryAt);
    if (filter === "active") return rows.filter((r) => r.lastEntryAt && (r.stalledDays ?? 0) <= 7);
    if (filter === "revision") return rows.filter((r) => r.track === "revision");
    return rows;
  }, [data, filter]);

  // Design 4c: roster grouped under section headers, never-logged first
  // within each group. The old per-class cards become these headers.
  const sectionGroups = useMemo(() => {
    const bySection = new Map<string, typeof visible>();
    for (const r of visible) {
      const k = r.sectionLabel ?? "-";
      bySection.set(k, [...(bySection.get(k) ?? []), r]);
    }
    const rank = (r: (typeof visible)[number]) =>
      !r.lastEntryAt ? 0 : (r.stalledDays ?? 0) > 7 ? 1 : 2;
    return Array.from(bySection.entries())
      .map(([label, rows]) => ({
        label,
        rows: [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)),
        meta: (data?.classes ?? []).find((c) => c.label === label) ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visible, data]);

  if (meLoading) return null;
  // Wing incharges are admitted too — the backend scopes the program to
  // their wing's classes (empty for non-hifz wings). The toolbar already
  // offers them the entry; only this gate was still admin-only.
  const isIncharge = me?.roles.some((r) => r.role_type === "incharge") ?? false;
  if (!isOrgAdmin(me, orgId) && !isIncharge) return <NoAccessRedirect />;

  const t = data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-emerald-600" /> {tr("hifzProg.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            {tr("hifzProg.subtitle")}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      {!data && !error && (
        <div className="flex items-center gap-2 justify-center py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {tr("hifzProg.loading")}
        </div>
      )}

      {data && t && (
        <>
          {/* Program KPIs - the stat cards ARE the filters (design 4c). */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              { f: "all" as Filter, label: tr("hifzProg.kpiStudents"), value: t.students, sub: tr("hifzProg.kpiStudentsSub", { hifz: t.hifzTrack, revision: t.revisionTrack }), tone: "" },
              { f: "active" as Filter, label: tr("hifzProg.kpiActive"), value: t.activeThisWeek, sub: tr("hifzProg.kpiActiveSub", { n: t.entries7d }), tone: t.activeThisWeek > 0 ? "text-emerald-700" : "text-slate-400" },
              { f: "stalled" as Filter, label: tr("hifzProg.kpiStalled"), value: t.stalled, sub: tr("hifzProg.kpiStalledSub"), tone: t.stalled > 0 ? "text-amber-700" : "text-emerald-700" },
              { f: "never" as Filter, label: tr("hifzProg.kpiNever"), value: t.neverLogged, sub: tr("hifzProg.kpiNeverSub"), tone: t.neverLogged > 0 ? "text-amber-800" : "text-emerald-700" },
            ]).map((k) => (
              <button
                key={k.f}
                type="button"
                onClick={() => setFilter(k.f)}
                className={
                  "rounded-xl border bg-white p-4 text-left transition-colors " +
                  (filter === k.f ? "border-emerald-400 ring-1 ring-emerald-300" : "border-slate-200 hover:border-emerald-200")
                }
              >
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{k.label}</div>
                <div className={"text-2xl font-bold tabular-nums " + k.tone}>{k.value}</div>
                <div className="text-[11px] text-slate-500">{k.sub}</div>
              </button>
            ))}
          </div>

          {/* Student roster */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">{tr("hifzProg.rosterTitle")}</CardTitle>
                <div className="flex flex-wrap gap-1">
                  {([["all", tr("hifzProg.fAll", { n: data.students.length })], ["stalled", tr("hifzProg.fStalled", { n: t.stalled })], ["never", tr("hifzProg.fNever", { n: t.neverLogged })], ["revision", tr("hifzProg.fRevision", { n: t.revisionTrack })]] as Array<[Filter, string]>).map(([k, label]) => (
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
                    ? tr("hifzProg.emptyNone")
                    : tr("hifzProg.emptyFilter")}
                </p>
              ) : (
                sectionGroups.map((g) => (
                <div key={g.label}>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2.5 sm:grid-cols-[1fr_220px_90px]">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-[13px] font-extrabold text-slate-900">{g.label}</span>
                      <span className="hidden truncate text-[11.5px] text-slate-400 sm:inline">
                        {g.meta?.teacherName ?? ""}{g.meta ? ` · ${tr("hifzProg.studentsCount", { n: g.meta.studentCount })}` : ""}
                      </span>
                    </span>
                    {g.meta && (
                      <span className="hidden flex-col gap-1 sm:flex">
                        <span className="flex justify-between text-[11px] text-slate-500">
                          <span>{tr("hifzProg.loggedThisWeek")}</span>
                          <span className={"font-bold " + (g.meta.activeThisWeek > 0 ? "text-emerald-700" : "text-amber-700")}>
                            {g.meta.activeThisWeek}/{g.meta.studentCount}
                          </span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${g.meta.studentCount > 0 ? Math.round((g.meta.activeThisWeek / g.meta.studentCount) * 100) : 0}%`,
                              background: g.meta.activeThisWeek > 0 ? "#10b981" : "#f59e0b",
                            }}
                          />
                        </span>
                      </span>
                    )}
                    {g.meta && (
                      <Link
                        to={`/school/orgs/${orgId}/sections/${g.meta.sectionId}/hifz`}
                        className="text-right text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        {tr("hifzProg.openLog")}
                      </Link>
                    )}
                  </div>
                <ul className="divide-y divide-slate-100">
                  {g.rows.map((s) => {
                    const stalled = s.lastEntryAt && (s.stalledDays ?? 0) > 7;
                    return (
                      <li key={s.studentId} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-slate-900">{s.name}</span>
                            {s.grNumber && <span className="text-[10px] text-slate-400">GR {s.grNumber}</span>}
                            {s.track === "revision" && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">{tr("hifzProg.hafizRevision")}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {s.sectionLabel} · {positionLabel(s, tr)}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={"text-xs font-medium " + (stalled ? "text-amber-700" : s.lastEntryAt ? "text-slate-700" : "text-slate-400")}>
                            {relDays(s.lastEntryAt, tr)}
                          </div>
                          <div className="text-[10px] text-slate-400 tabular-nums">{tr("hifzProg.inLast30", { n: s.entries30d })}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default HifzProgramDashboard;
