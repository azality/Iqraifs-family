// YearRollover — principal-only end-of-year action.
//
// Route: /school/orgs/:orgId/admin/year-rollover
//
// Walks every class top-to-bottom. Each row defaults to "Promote" (move to
// next class's first section). Top-class rows default to "Graduate". The
// principal can flip individual rows to Repeat / Graduate / Transferred /
// Withdrawn. Submit fires one POST that:
//   - moves student.class_section_id for promotions
//   - sets student.status + archived_at for graduate/transferred/withdrawn
//   - clones active fee_plans into the new year
//   - records an audit row in year_rollover

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft, GraduationCap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin,
  getYearRolloverPreview, executeYearRollover,
  type RolloverPreview, type RolloverAction, type RolloverDecision, type RolloverSummary,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

const ACTION_LABEL: Record<RolloverAction, string> = {
  promote: "Promote",
  repeat: "Repeat",
  graduate: "Graduate",
  transferred: "Transferred",
  withdrawn: "Withdrawn",
};

export function YearRollover() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromYear, setFromYear] = useState("2026-2027");
  const [toYear, setToYear] = useState("2027-2028");
  const [decisions, setDecisions] = useState<Map<string, RolloverDecision>>(new Map());
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RolloverSummary | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getYearRolloverPreview(orgId)
      .then((p) => {
        setPreview(p);
        // Seed defaults: promote everywhere; top class graduates.
        const next = new Map<string, RolloverDecision>();
        for (const cls of p.classes) {
          const isTop = cls.nextClass === null;
          for (const stu of cls.students) {
            next.set(stu.id, {
              studentId: stu.id,
              action: isTop ? "graduate" : "promote",
              toSectionId: null,
            });
          }
        }
        setDecisions(next);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId]);

  const setAction = (studentId: string, patch: Partial<RolloverDecision>) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const cur = next.get(studentId) ?? { studentId, action: "promote" as RolloverAction };
      next.set(studentId, { ...cur, ...patch });
      return next;
    });
  };

  const counts = useMemo(() => {
    const c: Record<RolloverAction, number> = {
      promote: 0, repeat: 0, graduate: 0, transferred: 0, withdrawn: 0,
    };
    for (const d of decisions.values()) c[d.action]++;
    return c;
  }, [decisions]);

  const handleRun = async () => {
    if (!preview) return;
    if (!confirm(
      `About to roll ${decisions.size} students from ${fromYear} to ${toYear}:\n\n` +
      `  Promote     ${counts.promote}\n` +
      `  Repeat      ${counts.repeat}\n` +
      `  Graduate    ${counts.graduate}\n` +
      `  Transferred ${counts.transferred}\n` +
      `  Withdrawn   ${counts.withdrawn}\n\n` +
      `This will also clone active fee plans into ${toYear}. Continue?`,
    )) return;
    setRunning(true);
    try {
      const r = await executeYearRollover(orgId, {
        fromYear, toYear,
        decisions: Array.from(decisions.values()),
      });
      setSummary(r.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Admin</Button>
        </Link>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Academic year rollover</h1>
        <p className="mt-1 text-sm text-slate-600">
          Move every active student to next year. Top class graduates by default;
          flip any row to Repeat / Transferred / Withdrawn as needed.
          Active fee plans are cloned into the new year.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">From year</Label>
          <Input value={fromYear} onChange={(e) => setFromYear(e.target.value)} className="h-9 text-sm w-32" />
        </div>
        <div>
          <Label className="text-xs">To year</Label>
          <Input value={toYear} onChange={(e) => setToYear(e.target.value)} className="h-9 text-sm w-32" />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-emerald-700">Promote {counts.promote}</span>
          <span className="text-amber-700">Repeat {counts.repeat}</span>
          <span className="text-indigo-700">Graduate {counts.graduate}</span>
          <span className="text-slate-500">Transferred {counts.transferred}</span>
          <span className="text-slate-500">Withdrawn {counts.withdrawn}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {summary && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Rollover complete.</div>
            <div className="text-xs mt-0.5">
              Promoted {summary.counts.promoted} · Repeated {summary.counts.repeated} ·
              Graduated {summary.counts.graduated} · Transferred {summary.counts.transferred} ·
              Withdrawn {summary.counts.withdrawn}
              {typeof summary.feePlansCloned === "number" && (
                <> · {summary.feePlansCloned} fee plan{summary.feePlansCloned === 1 ? "" : "s"} cloned</>
              )}
              {summary.counts.errored > 0 && (
                <span className="text-rose-700"> · {summary.counts.errored} errors</span>
              )}
            </div>
            {summary.errors.length > 0 && (
              <ul className="mt-1 text-xs text-rose-700 list-disc ml-4">
                {summary.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e.studentId}: {e.reason}</li>
                ))}
                {summary.errors.length > 5 && <li>…and {summary.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading preview…</div>
      ) : !preview || preview.classes.length === 0 ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic">No classes to roll.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {preview.classes.map((cls) => (
            <Card key={cls.class.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-indigo-500" />
                      {cls.class.name}
                      <span className="text-xs text-slate-500 font-normal">
                        → {cls.nextClass ? cls.nextClass.name : "graduates"}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">{cls.students.length} students</div>
                </div>
                {cls.students.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No active students.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="text-left px-2 py-1">Student</th>
                          <th className="text-left px-2 py-1">Current section</th>
                          <th className="text-left px-2 py-1">Action</th>
                          {cls.nextSections.length > 1 && <th className="text-left px-2 py-1">Target section</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {cls.students.map((stu) => {
                          const d = decisions.get(stu.id);
                          const action = d?.action ?? (cls.nextClass ? "promote" : "graduate");
                          return (
                            <tr key={stu.id} className="border-t border-slate-100">
                              <td className="px-2 py-1.5">
                                <div className="font-medium text-slate-900">{stu.fullName}</div>
                                <div className="text-[10px] text-slate-500">{stu.grNumber}</div>
                              </td>
                              <td className="px-2 py-1.5 text-slate-600">{stu.currentSection.name}</td>
                              <td className="px-2 py-1.5">
                                <Select
                                  value={action}
                                  onValueChange={(v) => setAction(stu.id, { action: v as RolloverAction })}
                                >
                                  <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {(["promote", "repeat", "graduate", "transferred", "withdrawn"] as RolloverAction[]).map((a) => (
                                      <SelectItem
                                        key={a}
                                        value={a}
                                        disabled={a === "promote" && !cls.nextClass}
                                      >
                                        {ACTION_LABEL[a]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              {cls.nextSections.length > 1 && (
                                <td className="px-2 py-1.5">
                                  {action === "promote" ? (
                                    <Select
                                      value={d?.toSectionId ?? "__auto__"}
                                      onValueChange={(v) => setAction(stu.id, { toSectionId: v === "__auto__" ? null : v })}
                                    >
                                      <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__auto__">Auto (first)</SelectItem>
                                        {cls.nextSections.map((s) => (
                                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              Rollover is irreversible. Make sure you have a backup of the
              current year's data before running. Fee plans for {fromYear}
              will be cloned into {toYear}; old plans stay in place for the
              historical record.
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleRun} disabled={running}>
              {running ? "Running rollover…" : `Execute rollover (${fromYear} → ${toYear})`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default YearRollover;
