// StudentDashboard — overview of a single student for the portal.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CalendarCheck, Award, BookOpen, Sparkles } from "lucide-react";
import { DataTable, HeroCard, KpiTile } from "../../components/school-ui";
import {
  getStudentDashboard,
  type StudentDashboardResponse,
  type DashboardActivityItem,
} from "../../../utils/schoolPortalApi";

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function StudentDashboard() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getStudentDashboard(studentId);
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
  if (!data) {
    return <div className="text-slate-500 text-sm">Loading…</div>;
  }

  const { student, tiles, recentActivity } = data;
  const sectionSubtitle = [student.sectionName, student.className].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <HeroCard
        title={student.fullName}
        subtitle={sectionSubtitle || `GR # ${student.grNumber}`}
        asOf={`As of ${new Date().toLocaleDateString()}`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-tour="portal-dashboard-tiles">
          <KpiTile
            icon={CalendarCheck}
            label="Attendance"
            value={tiles.attendancePct !== null ? `${tiles.attendancePct}%` : null}
            variant="light"
          />
          <KpiTile
            icon={Award}
            label="Avg Grade"
            value={tiles.averageGrade !== null ? `${tiles.averageGrade}%` : null}
            variant="light"
          />
          <KpiTile
            icon={BookOpen}
            label="Ayahs Memorized"
            value={tiles.ayahsMemorized ?? null}
            variant="light"
          />
          <KpiTile
            icon={Sparkles}
            label="Behavior Score"
            value={tiles.behaviorScore ?? null}
            variant="light"
          />
        </div>
      </HeroCard>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            Recent Activity
          </h3>
        </div>
        <DataTable<DashboardActivityItem>
          rows={recentActivity}
          rowKey={(r) => r.id}
          emptyMessage="No recent activity."
          columns={[
            {
              key: "occurredAt",
              header: "When",
              width: "w-32",
              cell: (r) => <span className="text-slate-500">{relativeTime(r.occurredAt)}</span>,
            },
            {
              key: "kind",
              header: "Kind",
              width: "w-32",
              cell: (r) => (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 capitalize">
                  {r.kind.replace(/_/g, " ")}
                </span>
              ),
            },
            { key: "summary", header: "Summary", cell: (r) => r.summary },
          ]}
        />
      </div>
    </div>
  );
}
