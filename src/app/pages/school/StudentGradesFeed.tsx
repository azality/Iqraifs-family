// StudentGradesFeed — embeddable timeline of graded assignments for a
// student. Pass orgId + studentId. Shows summary header + per-grade rows.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Trophy, AlertCircle } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import {
  getStudentGrades,
  getStudentGradesSummary,
  type Assignment,
  type GradeEntry,
  type StudentGradesSummary,
} from "../../../utils/schoolApi";
import { KindChip } from "./SectionAssignmentsList";

interface Props {
  orgId: string;
  studentId: string;
  refreshKey?: number;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function colorForPct(pct: number): string {
  if (pct >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (pct >= 60) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

export function StudentGradesFeed({ orgId, studentId, refreshKey }: Props) {
  const [grades, setGrades] = useState<Array<GradeEntry & { assignment: Assignment }>>([]);
  const [summary, setSummary] = useState<StudentGradesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !studentId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getStudentGrades(orgId, studentId, { limit: 100 }),
      getStudentGradesSummary(orgId, studentId).catch(() => null),
    ])
      .then(([g, s]) => {
        setGrades(g.grades);
        setSummary(s);
      })
      .catch((e) => setError(e?.message || "Failed to load grades"))
      .finally(() => setLoading(false));
  }, [orgId, studentId, refreshKey]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading grades…</p>;
  if (error) {
    return (
      <p className="text-sm text-rose-600 flex items-center gap-1">
        <AlertCircle className="h-4 w-4" /> {error}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <Trophy className="h-4 w-4 text-amber-600" />
        <span className="font-medium">
          {summary?.assignmentsGraded ?? grades.filter((g) => g.status === "graded").length} assignment
          {(summary?.assignmentsGraded ?? 0) === 1 ? "" : "s"} graded
        </span>
        {summary?.average != null && (
          <span className="text-muted-foreground">
            · Avg <b className="text-slate-900">{summary.average.toFixed(0)}%</b>
          </span>
        )}
        {summary?.lastGradedAt && (
          <span className="text-muted-foreground">· last {relTime(summary.lastGradedAt)}</span>
        )}
      </div>

      {grades.length === 0 ? (
        <p className="text-sm text-muted-foreground">No grades yet.</p>
      ) : (
        <ul className="space-y-2">
          {grades.map((g) => {
            const a = g.assignment;
            const pct = g.score != null && a.max_score > 0 ? (g.score / a.max_score) * 100 : null;
            const scoreText =
              g.status !== "graded"
                ? g.status
                : g.score != null
                  ? `${g.score} / ${a.max_score}`
                  : "—";
            return (
              <li key={g.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/school/orgs/${orgId}/assignments/${a.id}`}
                        className="font-medium text-sm hover:underline truncate"
                      >
                        {a.title}
                      </Link>
                      <KindChip kind={a.kind} />
                    </div>
                    {g.feedback && (
                      <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{g.feedback}</p>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {relTime(g.graded_at)}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      "text-sm font-semibold px-2 py-1 " +
                      (pct != null ? colorForPct(pct) : "text-slate-600 bg-slate-50 border-slate-200")
                    }
                  >
                    {scoreText}
                    {pct != null && <span className="ml-2 text-xs font-normal">({pct.toFixed(0)}%)</span>}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
