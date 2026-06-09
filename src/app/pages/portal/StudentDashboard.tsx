// StudentDashboard — single-child landing page in the portal.
//
// PR feat/parent-portal-home: leads with plain-language status cards
// from the today-snapshot endpoint. Recent activity from the existing
// dashboard endpoint still appears below as the timeline.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { DataTable, HeroCard } from "../../components/school-ui";
import {
  getStudentDashboard,
  getTodaySnapshot,
  type StudentDashboardResponse,
  type DashboardActivityItem,
  type TodaySnapshot,
} from "../../../utils/schoolPortalApi";
import { TodayStatusPills } from "./TodayStatusPills";

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

// Plain-English mapping for the activity "kind" chip — parents shouldn't
// see snake_case labels.
const KIND_LABEL: Record<string, string> = {
  lesson: "Lesson",
  grade: "Grade",
  hifz: "Hifz",
  attendance: "Attendance",
  behavior: "Teacher note",
};

export function StudentDashboard() {
  const { t } = useTranslation();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodaySnapshot(studentId)
      .then((r) => { if (!cancelled) setSnapshot(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    getStudentDashboard(studentId)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { /* recent activity is non-fatal */ });
    return () => { cancelled = true; };
  }, [studentId]);

  if (error && !snapshot) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!snapshot) {
    return <div className="text-slate-500 text-sm">{t("common.loading")}</div>;
  }

  const sectionSubtitle = [snapshot.student.sectionName, snapshot.student.className]
    .filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <HeroCard
        title={snapshot.student.fullName}
        subtitle={sectionSubtitle || `GR # ${snapshot.student.grNumber}`}
        asOf={`As of ${new Date().toLocaleDateString()}`}
      />

      {/* Today's plain-language status cards. */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
          Today
        </h2>
        <TodayStatusPills
          studentId={studentId}
          snapshot={snapshot}
          variant="expanded"
        />
      </section>

      {/* Recent activity timeline — still useful for "what happened last week". */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
              Recent activity
            </h3>
          </div>
          <DataTable<DashboardActivityItem>
            rows={data.recentActivity}
            rowKey={(r) => r.id}
            emptyMessage="No recent activity."
            columns={[
              {
                key: "at",
                header: "When",
                width: "w-32",
                cell: (r) => <span className="text-slate-500">{relativeTime(r.at)}</span>,
              },
              {
                key: "kind",
                header: "Kind",
                width: "w-32",
                cell: (r) => (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700">
                    {KIND_LABEL[r.kind] ?? r.kind.replace(/_/g, " ")}
                  </span>
                ),
              },
              { key: "summary", header: "What happened", cell: (r) => r.summary },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default StudentDashboard;
