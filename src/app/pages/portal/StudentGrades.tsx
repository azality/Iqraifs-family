// StudentGrades — list of graded assignments for a student.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { DataTable, HeroCard, StatusPill } from "../../components/school-ui";
import type { Status } from "../../components/school-ui";
import {
  getMyStudentGrades,
  type MyStudentGradesResponse,
  type Assignment,
  type GradeEntry,
} from "../../../utils/schoolPortalApi";

type Row = GradeEntry & { assignment: Assignment };

function statusFor(status: GradeEntry["status"]): { st: Status; label: string } {
  switch (status) {
    case "graded":
      return { st: "compliant", label: "Graded" };
    case "missing":
      return { st: "flagged", label: "Missing" };
    case "excused":
      return { st: "neutral", label: "Excused" };
    case "late":
      return { st: "watch", label: "Late" };
  }
}

function scoreColor(score: number, max: number): string {
  if (max <= 0) return "text-slate-700";
  const pct = (score / max) * 100;
  if (pct >= 80) return "text-emerald-700 font-semibold";
  if (pct >= 60) return "text-amber-700 font-semibold";
  return "text-rose-700 font-semibold";
}

export function StudentGrades() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentGradesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyStudentGrades(studentId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const avg = data.summary.average !== null ? `${Math.round(data.summary.average)}%` : "—";

  return (
    <div className="space-y-5">
      <HeroCard
        title="Grades"
        subtitle="Assignments and assessments"
        rightSlot={
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{avg}</div>
            <div className="text-xs text-indigo-200">
              {data.summary.assignmentsGraded} graded
            </div>
          </div>
        }
      />
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <DataTable<Row>
          rows={data.grades}
          rowKey={(r) => r.id}
          emptyMessage="No grades yet."
          columns={[
            { key: "title", header: "Assignment", cell: (r) => r.assignment.title },
            {
              key: "kind",
              header: "Kind",
              width: "w-32",
              cell: (r) => (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 capitalize">
                  {r.assignment.kind.replace(/_/g, " ")}
                </span>
              ),
            },
            {
              key: "score",
              header: "Score",
              width: "w-28",
              align: "right",
              cell: (r) =>
                r.score === null ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <span className={scoreColor(r.score, r.assignment.max_score)}>
                    {r.score} / {r.assignment.max_score}
                  </span>
                ),
            },
            {
              key: "status",
              header: "Status",
              width: "w-28",
              cell: (r) => {
                const s = statusFor(r.status);
                return <StatusPill status={s.st} label={s.label} />;
              },
            },
            {
              key: "feedback",
              header: "Feedback",
              cell: (r) =>
                r.feedback ? (
                  <span className="text-slate-600 line-clamp-2">{r.feedback}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                ),
            },
          ]}
        />
      </div>
    </div>
  );
}
