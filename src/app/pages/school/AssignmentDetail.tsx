// AssignmentDetail — view an assignment and grade every student in its
// section in one editable table. "Save grades" batches dirty rows.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  ClipboardCheck,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  deleteAssignment,
  getAssignment,
  getAssignmentGrades,
  getSchoolMe,
  isOrgAdmin,
  listStudents,
  postGradesBatch,
  type AdminStudent,
  type Assignment,
  type GradeBatchEntry,
  type GradeEntry,
  type GradeStatus,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { KindChip } from "./SectionAssignmentsList";

interface Row {
  studentId: string;
  studentName: string;
  grNumber: string;
  score: string; // text for input
  status: GradeStatus;
  feedback: string;
  existingId: string | null;
  dirty: boolean;
}

const STATUS_OPTIONS: GradeStatus[] = ["graded", "missing", "excused", "late"];

export function AssignmentDetail() {
  const { orgId = "", assignmentId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const load = async () => {
    if (!orgId || !assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const a = await getAssignment(orgId, assignmentId);
      setAssignment(a);
      const [students, gradesResp] = await Promise.all([
        listStudents(orgId, { classSectionId: a.class_section_id }),
        getAssignmentGrades(orgId, assignmentId),
      ]);
      const byStudent: Record<string, GradeEntry> = {};
      for (const g of gradesResp.grades) byStudent[g.student_id] = g;
      setRows(
        students.map((s: AdminStudent) => {
          const g = byStudent[s.id];
          return {
            studentId: s.id,
            studentName: s.full_name,
            grNumber: s.gr_number,
            score: g?.score != null ? String(g.score) : "",
            status: (g?.status as GradeStatus) ?? "graded",
            feedback: g?.feedback ?? "",
            existingId: g?.id ?? null,
            dirty: false,
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, assignmentId]);

  const stats = useMemo(() => {
    if (!assignment) return { avg: null as number | null, median: null as number | null, graded: 0, missing: 0 };
    const scored = rows
      .filter((r) => r.status === "graded" && r.score !== "")
      .map((r) => Number(r.score))
      .filter((n) => !Number.isNaN(n));
    const missing = rows.filter((r) => r.status === "missing").length;
    if (scored.length === 0) return { avg: null, median: null, graded: 0, missing };
    const avg = scored.reduce((s, n) => s + n, 0) / scored.length;
    const sorted = [...scored].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return { avg, median, graded: scored.length, missing };
  }, [rows, assignment]);

  if (meLoading) return null;
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !assignment) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-rose-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {error || "Assignment not found"}
        </div>
        <Link to="/school"><Button variant="outline" size="sm">← Back</Button></Link>
      </div>
    );
  }

  const admin = isOrgAdmin(me, orgId);
  const canEdit = admin || (!!me?.userId && assignment.created_by === me.userId);

  const markDirty = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, dirty: true } : r)));
  };

  const handleSaveAll = async () => {
    const dirty = rows.filter((r) => r.dirty);
    if (dirty.length === 0) {
      toast.message("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const entries: GradeBatchEntry[] = dirty.map((r) => ({
        studentId: r.studentId,
        score: r.status === "graded" && r.score !== "" ? Number(r.score) : null,
        status: r.status,
        feedback: r.feedback || undefined,
      }));
      const res = await postGradesBatch(orgId, assignmentId, entries);
      if (res.failed > 0) {
        toast.error(`Saved with ${res.failed} failure${res.failed === 1 ? "" : "s"}`);
      } else {
        toast.success(`Saved ${res.inserted + res.updated} grade${res.inserted + res.updated === 1 ? "" : "s"}`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete assignment "${assignment.title}"? All grades will be removed.`)) return;
    try {
      await deleteAssignment(orgId, assignmentId);
      toast.success("Assignment deleted");
      window.history.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const backLink = `/school/orgs/${orgId}/sections/${assignment.class_section_id}/assignments`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-indigo-600" />
          {assignment.title}
        </h1>
        <div className="flex gap-2">
          <Link to={backLink}>
            <Button variant="outline" size="sm">← Assignments</Button>
          </Link>
          {canEdit && (
            <>
              <Link to={`/school/orgs/${orgId}/assignments/${assignmentId}/edit`}>
                <Button variant="outline" size="sm"><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-600" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center text-sm">
          <KindChip kind={assignment.kind} />
          <span><span className="text-muted-foreground">Max:</span> <b>{assignment.max_score}</b></span>
          <span><span className="text-muted-foreground">Weight:</span> {assignment.weight}</span>
          <span><span className="text-muted-foreground">Assigned:</span> {assignment.assigned_date}</span>
          <span><span className="text-muted-foreground">Due:</span> {assignment.due_date || "—"}</span>
          {assignment.related_topic && (
            <span><span className="text-muted-foreground">Topic:</span> {assignment.related_topic}</span>
          )}
        </CardContent>
      </Card>

      {assignment.description && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Description</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-slate-700">{assignment.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Average</p>
            <p className="text-lg font-semibold tabular-nums">
              {stats.avg != null ? stats.avg.toFixed(1) : "—"}
              {stats.avg != null && <span className="text-xs text-muted-foreground"> / {assignment.max_score}</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Median</p>
            <p className="text-lg font-semibold tabular-nums">
              {stats.median != null ? stats.median.toFixed(1) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Graded</p>
            <p className="text-lg font-semibold tabular-nums">{stats.graded}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Missing</p>
            <p className="text-lg font-semibold tabular-nums text-rose-600">{stats.missing}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Grades</CardTitle>
          <Button size="sm" onClick={handleSaveAll} disabled={saving || !rows.some((r) => r.dirty)}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save grades"}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No students in this section.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">GR#</th>
                  <th className="px-3 py-2 w-32">Score</th>
                  <th className="px-3 py-2 w-36">Status</th>
                  <th className="px-3 py-2">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.studentId} className={"border-t " + (r.dirty ? "bg-amber-50/40" : "")}>
                    <td className="px-3 py-2 font-medium">{r.studentName}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{r.grNumber}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={assignment.max_score}
                        value={r.score}
                        disabled={r.status !== "graded"}
                        onChange={(e) => markDirty(idx, { score: e.target.value })}
                        className="h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={r.status}
                        onValueChange={(v) => markDirty(idx, { status: v as GradeStatus })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Textarea
                        rows={1}
                        value={r.feedback}
                        onChange={(e) => markDirty(idx, { feedback: e.target.value })}
                        className="min-h-[32px] text-xs"
                        placeholder="optional"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

