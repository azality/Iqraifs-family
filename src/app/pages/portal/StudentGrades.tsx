// StudentGrades — list of graded assignments for a student.
//
// Phase 4b: groups grades by subject (Math / Science / English / Quran / …)
// with a per-subject average so parents see "where my child stands in
// each subject" at a glance instead of one flat list.

import { useEffect, useMemo, useState } from "react";
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
        subtitle="Assignments and assessments by subject"
        rightSlot={
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{avg}</div>
            <div className="text-xs text-indigo-200">
              {data.summary.assignmentsGraded} graded
            </div>
          </div>
        }
      />

      {/* Phase 4b: group by subject. Assignments without a subject tag
          (older data, or where the teacher didn't pick one) bucket under
          "General". Each bucket gets a header row with its own average. */}
      <SubjectGroupedGrades grades={data.grades} />
    </div>
  );
}

interface GroupAgg {
  subjectName: string;
  rows: Row[];
  weightedScore: number;
  weightTotal: number;
}

function SubjectGroupedGrades({ grades }: { grades: Row[] }) {
  const groups = useMemo<GroupAgg[]>(() => {
    const byName = new Map<string, GroupAgg>();
    for (const r of grades) {
      const name = r.assignment?.subjectName ?? "General";
      const g =
        byName.get(name) ?? {
          subjectName: name,
          rows: [],
          weightedScore: 0,
          weightTotal: 0,
        };
      g.rows.push(r);
      if (r.score !== null && r.assignment?.max_score) {
        const w = Number(r.assignment.weight ?? 1);
        const pct = r.score / Number(r.assignment.max_score);
        g.weightedScore += pct * w;
        g.weightTotal += w;
      }
      byName.set(name, g);
    }
    // Sort: subjects with the lowest average first (so "needs attention"
    // surfaces). Ungraded subjects float to the end.
    return Array.from(byName.values()).sort((a, b) => {
      const aa = a.weightTotal > 0 ? a.weightedScore / a.weightTotal : 99;
      const bb = b.weightTotal > 0 ? b.weightedScore / b.weightTotal : 99;
      return aa - bb;
    });
  }, [grades]);

  if (grades.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">
        No grades yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const avgPct = g.weightTotal > 0 ? (g.weightedScore / g.weightTotal) * 100 : null;
        const tone =
          avgPct == null
            ? "text-slate-500"
            : avgPct >= 80
            ? "text-emerald-700"
            : avgPct >= 60
            ? "text-amber-700"
            : "text-rose-700";
        return (
          <section key={g.subjectName} className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{g.subjectName}</h3>
                <p className="text-[10px] text-slate-500">
                  {g.rows.length} assessment{g.rows.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <div className={"text-lg font-semibold tabular-nums " + tone}>
                  {avgPct == null ? "—" : `${Math.round(avgPct)}%`}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Average
                </div>
              </div>
            </header>
            <DataTable<Row>
              rows={g.rows}
              rowKey={(r) => r.id}
              emptyMessage="No grades."
              columns={[
                {
                  key: "title",
                  header: "Assignment",
                  cell: (r) => (
                    <div>
                      <div>{r.assignment.title}</div>
                      {r.assignment.topicName && (
                        <div className="text-[10px] text-violet-600 mt-0.5">
                          · {r.assignment.topicName}
                        </div>
                      )}
                    </div>
                  ),
                },
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
          </section>
        );
      })}
    </div>
  );
}
