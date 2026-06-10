// AdminTeacherSchedule — admin views any teacher's weekly schedule.
//
// Route: /school/orgs/:orgId/admin/teachers/:teacherId/schedule
//
// Same calendar grid as the teacher's own /my-schedule view, but the
// admin can scan anyone's week to balance load or investigate complaints
// (e.g. "Sheikh's Mondays look overloaded").

import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import {
  listTeacherEntries, listAdminTeachers, getSchoolMe, isOrgAdmin,
  type TeacherEntrySummary, type AdminTeacher, type SchoolMeResponse,
  type MyTimetableCell,
} from "../../../utils/schoolApi";
import { TeacherCalendar } from "./TeacherCalendar";

export function AdminTeacherSchedule() {
  const { orgId = "", teacherId = "" } = useParams<{ orgId: string; teacherId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [cells, setCells] = useState<MyTimetableCell[] | null>(null);
  const [teacher, setTeacher] = useState<AdminTeacher | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId || !teacherId) return;
    Promise.all([
      listTeacherEntries(orgId, teacherId),
      listAdminTeachers(orgId).catch(() => []),
    ])
      .then(([r, teachers]) => {
        // Adapt TeacherEntrySummary[] → MyTimetableCell[].
        const adapted: MyTimetableCell[] = r.entries.map((e: TeacherEntrySummary) => ({
          slot: e.slot,
          entry: {
            id: e.id,
            orgId,
            slotId: e.slot.id,
            scopeSectionId: null,
            scopeHifzGroupId: null,
            sectionSubjectId: null,
            teacherUserId: teacherId,
            room: null,
            notes: null,
            subjectName: e.subjectName,
            teacherName: null,
          } as any,
          scopeLabel: e.scopeLabel,
          substitution: null,
        }));
        setCells(adapted);
        const t = (teachers as AdminTeacher[]).find((x) => x.user_id === teacherId);
        setTeacher(t ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [orgId, teacherId]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
    );
  }

  const teacherName = teacher?.full_name || teacher?.email || "Teacher";
  return (
    <TeacherCalendar
      cellsOverride={cells ?? []}
      title={`${teacherName}'s schedule`}
      subtitle={`Admin view — ${teacherName}'s weekly grid. Overlapping entries are outlined in red.`}
      backTo={`/school/orgs/${orgId}/admin/teachers/${teacherId}`}
      ownership="other"
    />
  );
}

export default AdminTeacherSchedule;
