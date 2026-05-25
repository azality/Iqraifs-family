// StudentAttendance — attendance summary + log for a student.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CheckCircle, Clock, XCircle, FileText } from "lucide-react";
import { DataTable, HeroCard, KpiTile, StatusPill } from "../../components/school-ui";
import type { Status } from "../../components/school-ui";
import {
  getMyStudentAttendance,
  type MyStudentAttendanceResponse,
} from "../../../utils/schoolPortalApi";

type Row = MyStudentAttendanceResponse["entries"][number];

function statusFor(s: Row["status"]): { st: Status; label: string } {
  switch (s) {
    case "present":
      return { st: "compliant", label: "Present" };
    case "late":
      return { st: "watch", label: "Late" };
    case "absent":
      return { st: "flagged", label: "Absent" };
    case "excused":
      return { st: "neutral", label: "Excused" };
  }
}

export function StudentAttendance() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentAttendanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyStudentAttendance(studentId);
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

  const s = data.summary;

  return (
    <div className="space-y-5">
      <HeroCard
        title="Attendance"
        subtitle="School attendance record"
        rightSlot={
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{s.attendancePct}%</div>
            <div className="text-xs text-indigo-200">attendance</div>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={CheckCircle} label="Present" value={s.present} variant="light" />
        <KpiTile icon={Clock} label="Late" value={s.late} variant="light" />
        <KpiTile icon={XCircle} label="Absent" value={s.absent} variant="light" />
        <KpiTile icon={FileText} label="Excused" value={s.excused} variant="light" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <DataTable<Row>
          rows={data.entries}
          rowKey={(r) => r.id}
          emptyMessage="No attendance records yet."
          columns={[
            {
              key: "date",
              header: "Date",
              width: "w-40",
              cell: (r) => new Date(r.date).toLocaleDateString(),
            },
            {
              key: "status",
              header: "Status",
              width: "w-32",
              cell: (r) => {
                const sf = statusFor(r.status);
                return <StatusPill status={sf.st} label={sf.label} />;
              },
            },
            {
              key: "notes",
              header: "Notes",
              cell: (r) =>
                r.notes ? (
                  <span className="text-slate-600">{r.notes}</span>
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
