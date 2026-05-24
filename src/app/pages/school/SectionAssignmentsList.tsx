// SectionAssignmentsList — table of all assignments for a class section.
// Filter by kind. Quick actions: Open / Grade / Edit / Delete.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  ClipboardCheck,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  deleteAssignment,
  getAssignmentGrades,
  getSchoolMe,
  getSectionAssignments,
  isOrgAdmin,
  type Assignment,
  type AssignmentKind,
  type GradeEntry,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

const KIND_LABELS: Record<AssignmentKind, string> = {
  quiz: "Quiz",
  test: "Test",
  homework: "Homework",
  project: "Project",
  class_participation: "Class Part.",
  other: "Other",
};

const KIND_COLORS: Record<AssignmentKind, string> = {
  quiz: "bg-blue-100 text-blue-800 border-blue-200",
  test: "bg-purple-100 text-purple-800 border-purple-200",
  homework: "bg-amber-100 text-amber-800 border-amber-200",
  project: "bg-emerald-100 text-emerald-800 border-emerald-200",
  class_participation: "bg-pink-100 text-pink-800 border-pink-200",
  other: "bg-slate-100 text-slate-700 border-slate-200",
};

export function KindChip({ kind }: { kind: AssignmentKind }) {
  return (
    <Badge variant="outline" className={`text-[10px] uppercase ${KIND_COLORS[kind]}`}>
      {KIND_LABELS[kind]}
    </Badge>
  );
}

export function SectionAssignmentsList() {
  const { orgId = "", sectionId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AssignmentKind | "all">("all");
  // per-assignment grade summary cache: { graded, total, avgPct }
  const [summary, setSummary] = useState<Record<string, { graded: number; total: number; avgPct: number | null }>>({});

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const load = () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    getSectionAssignments(orgId, sectionId, { limit: 100 })
      .then((r) => setAssignments(r.assignments))
      .catch((e) => setError(e?.message || "Failed to load assignments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId]);

  // Fetch grade summaries lazily for visible assignments.
  useEffect(() => {
    let cancelled = false;
    const missing = assignments.filter((a) => !(a.id in summary));
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (a) => {
        try {
          const { grades } = await getAssignmentGrades(orgId, a.id);
          const graded = grades.filter((g: GradeEntry) => g.status === "graded" && g.score !== null);
          const total = grades.length;
          const avgPct =
            graded.length > 0
              ? (graded.reduce((s, g) => s + ((g.score ?? 0) / a.max_score) * 100, 0) / graded.length)
              : null;
          return [a.id, { graded: graded.length, total, avgPct }] as const;
        } catch {
          return [a.id, { graded: 0, total: 0, avgPct: null }] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setSummary((prev) => {
        const next = { ...prev };
        for (const [id, val] of entries) next[id] = val;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [assignments, orgId, summary]);

  const filtered = useMemo(
    () => (filter === "all" ? assignments : assignments.filter((a) => a.kind === filter)),
    [assignments, filter],
  );

  if (meLoading) return null;
  // Anyone with a role on this org can see the list; mutations are gated below.
  const admin = isOrgAdmin(me, orgId);

  const handleDelete = async (a: Assignment) => {
    if (!confirm(`Delete assignment "${a.title}"? All grades for it will be removed.`)) return;
    try {
      await deleteAssignment(orgId, a.id);
      toast.success("Assignment deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const canEditOrDelete = (a: Assignment): boolean => {
    if (admin) return true;
    return !!me?.userId && a.created_by === me.userId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-indigo-600" />
          Assignments
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/school/orgs/${orgId}/sections/${sectionId}/gradebook`}>
            <Button variant="outline" size="sm">Gradebook</Button>
          </Link>
          <Link to={`/school/orgs/${orgId}/admin/classes`}>
            <Button variant="outline" size="sm">← Classes</Button>
          </Link>
          <Link to={`/school/orgs/${orgId}/sections/${sectionId}/assignments/new`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Assignment
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Filter by kind:</span>
        <Select value={filter} onValueChange={(v) => setFilter(v as AssignmentKind | "all")}>
          <SelectTrigger className="h-8 text-xs w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {(Object.keys(KIND_LABELS) as AssignmentKind[]).map((k) => (
              <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="text-sm text-rose-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading assignments…</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          {assignments.length === 0
            ? 'No assignments yet. Click "New Assignment" to add one.'
            : "No assignments match this filter."}
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2 text-right">Max</th>
                  <th className="px-3 py-2">Graded</th>
                  <th className="px-3 py-2 text-right">Avg %</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const s = summary[a.id];
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        <Link to={`/school/orgs/${orgId}/assignments/${a.id}`} className="hover:underline">
                          {a.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2"><KindChip kind={a.kind} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{a.assigned_date}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{a.due_date || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.max_score}</td>
                      <td className="px-3 py-2">
                        {s ? (
                          <Badge variant="outline" className="text-[10px]">
                            {s.graded}/{s.total}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">…</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {s?.avgPct != null ? `${s.avgPct.toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Link to={`/school/orgs/${orgId}/assignments/${a.id}`}>
                            <Button variant="ghost" size="sm" title="Open">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <Link to={`/school/orgs/${orgId}/assignments/${a.id}`}>
                            <Button variant="ghost" size="sm" title="Grade">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            </Button>
                          </Link>
                          {canEditOrDelete(a) && (
                            <>
                              <Link to={`/school/orgs/${orgId}/assignments/${a.id}/edit`}>
                                <Button variant="ghost" size="sm" title="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                              <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDelete(a)}>
                                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

