// StudentGrades — grades by subject (design 10d).
//
// Per-subject five-column tables with repeated headers collapsed into
// ONE accordion row per subject: color bar (the fixed portal palette) ·
// subject · assessment count · average %. Expanding shows compact
// assignment rows — score + teacher feedback inline, no table headers
// for one-row tables. Subjects with the lowest average sort first;
// overall % stays in the hero.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { subjectColor } from "../../../utils/subjectColors";
import {
  getMyStudentGrades,
  type MyStudentGradesResponse,
  type Assignment,
  type GradeEntry,
} from "../../../utils/schoolPortalApi";

type Row = GradeEntry & { assignment: Assignment };

const maxOf = (r: Row): number | null =>
  ((r.assignment as any)?.maxScore ?? (r.assignment as any)?.max_score) ?? null;

function scoreTone(score: number | null, max: number | null): string {
  if (score == null || !max) return "text-slate-400";
  const pct = (score / max) * 100;
  if (pct >= 80) return "text-emerald-700";
  if (pct >= 50) return "text-amber-700";
  return "text-rose-700";
}

export function StudentGrades() {
  const { t } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentGradesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyStudentGrades(studentId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [studentId]);

  const groups = useMemo(() => {
    const byName = new Map<string, { name: string; rows: Row[]; ws: number; wt: number }>();
    for (const r of (data?.grades ?? []) as Row[]) {
      const name = r.assignment?.subjectName ?? t("portal.grades.general");
      const g = byName.get(name) ?? { name, rows: [], ws: 0, wt: 0 };
      g.rows.push(r);
      const max = maxOf(r);
      if (r.score !== null && max) {
        const w = Number(r.assignment.weight ?? 1);
        g.ws += (r.score / max) * w;
        g.wt += w;
      }
      byName.set(name, g);
    }
    return Array.from(byName.values()).sort((a, b) => {
      const aa = a.wt > 0 ? a.ws / a.wt : 99;
      const bb = b.wt > 0 ? b.ws / b.wt : 99;
      return aa - bb;
    });
  }, [data, t]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">{t("common.loading")}</div>;

  const avg = data.summary.average !== null ? `${Math.round(data.summary.average)}%` : "—";

  return (
    <div className="space-y-4">
      <HeroCard
        title={t("portal.nav.grades")}
        subtitle={t("portal.grades.subtitle", { count: data.summary.assignmentsGraded })}
        rightSlot={
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-emerald-300">{avg}</div>
            <div className="text-xs uppercase tracking-wide text-indigo-200">{t("portal.grades.overall")}</div>
          </div>
        }
      />

      {groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">
          {t("portal.grades.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const avgPct = g.wt > 0 ? Math.round((g.ws / g.wt) * 100) : null;
            const c = subjectColor(g.name);
            const isOpen = open === g.name;
            return (
              <section key={g.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : g.name)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="h-7 w-1 flex-none rounded-full" style={{ background: c.edge }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-extrabold text-slate-900">{g.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {t("portal.grades.assessments", { count: g.rows.length })}
                    </span>
                  </span>
                  <span className={"flex-none text-[15px] font-extrabold tabular-nums " + (avgPct == null ? "text-slate-400" : avgPct >= 80 ? "text-emerald-700" : avgPct >= 50 ? "text-amber-700" : "text-rose-700")}>
                    {avgPct == null ? "—" : `${avgPct}%`}
                  </span>
                  <ChevronDown className={"h-4 w-4 flex-none text-slate-400 transition-transform " + (isOpen ? "rotate-180" : "")} />
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100">
                    {g.rows.map((r, i) => {
                      const max = maxOf(r);
                      const statusNote =
                        r.status === "missing" ? t("portal.grades.missing")
                        : r.status === "excused" ? t("portal.grades.excused")
                        : r.status === "late" ? t("portal.grades.late")
                        : null;
                      return (
                        <div key={r.id} className={"flex items-center gap-3 px-4 py-2.5 " + (i > 0 ? "border-t border-slate-50" : "")}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-bold text-slate-900">
                              {r.assignment.title}
                              {statusNote && <span className="ml-1.5 text-[10.5px] font-semibold text-amber-700">· {statusNote}</span>}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">
                              {[
                                r.assignment.kind?.replace(/_/g, " "),
                                r.assignment.topicName,
                                r.feedback ? `“${r.feedback}”` : null,
                              ].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <span className={"flex-none text-sm font-extrabold tabular-nums " + scoreTone(r.score, max)}>
                            {r.score === null ? "—" : `${r.score}/${max ?? "—"}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          <p className="px-1 text-[11.5px] text-slate-400">{t("portal.grades.reportCardHint")}</p>
        </div>
      )}
    </div>
  );
}

export default StudentGrades;
