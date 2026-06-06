// SectionAssignmentsList — table of all assignments for a class section.
// Filter by kind. Quick actions: Open / Grade / Edit / Delete.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
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
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  HeroCard,
  DataTable,
  StatusPill,
  cardBase,
  type DataTableColumn,
} from "../../components/school-ui";
import {
  deleteAssignment,
  getAssignmentGrades,
  getSchoolMe,
  getSectionAssignments,
  isOrgAdmin,
  listSectionSubjects,
  type Assignment,
  type AssignmentKind,
  type GradeEntry,
  type SchoolMeResponse,
  type SectionSubject,
} from "../../../utils/schoolApi";
import { BookOpen, ListChecks } from "lucide-react";

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
  // Phase 3: subject filter chip row. Empty string = all subjects.
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  // per-assignment grade summary cache: { graded, total, avgPct }
  const [summary, setSummary] = useState<Record<string, { graded: number; total: number; avgPct: number | null }>>({});

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const load = () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    getSectionAssignments(orgId, sectionId, {
      limit: 100,
      subjectId: subjectFilter || undefined,
    })
      .then((r) => setAssignments(r.assignments))
      .catch((e) => setError(e?.message || "Failed to load assignments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId, subjectFilter]);

  // Phase 3: subjects for the filter chip row.
  useEffect(() => {
    if (!sectionId) return;
    listSectionSubjects(sectionId)
      .then((r) => setSubjects(r.subjects))
      .catch(() => setSubjects([]));
  }, [sectionId]);

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

  const columns: DataTableColumn<Assignment>[] = [
    {
      key: "title",
      header: "Title",
      cell: (a) => (
        <div className="min-w-0">
          <Link to={`/school/orgs/${orgId}/assignments/${a.id}`} className="font-medium hover:underline">
            {a.title}
          </Link>
          {/* Phase 3: subject + topic badges. Hidden when nothing tagged. */}
          {(a.subjectName || a.topicName) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {a.subjectName && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                  <BookOpen className="h-2.5 w-2.5" />
                  {a.subjectName}
                </span>
              )}
              {a.topicName && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
                  <ListChecks className="h-2.5 w-2.5" />
                  {a.topicName}
                </span>
              )}
            </div>
          )}
        </div>
      ),
    },
    { key: "kind", header: "Kind", cell: (a) => <KindChip kind={a.kind} /> },
    { key: "assigned_date", header: "Assigned", cell: (a) => <span className="text-xs text-slate-500">{a.assigned_date}</span> },
    { key: "due_date", header: "Due", cell: (a) => <span className="text-xs text-slate-500">{a.due_date || "—"}</span> },
    { key: "max_score", header: "Max", align: "right", cell: (a) => <span className="tabular-nums">{a.max_score}</span> },
    {
      key: "graded",
      header: "Graded",
      cell: (a) => {
        const s = summary[a.id];
        return s ? (
          <Badge variant="outline" className="text-[10px]">{s.graded}/{s.total}</Badge>
        ) : (
          <span className="text-xs text-slate-400">…</span>
        );
      },
    },
    {
      key: "avg",
      header: "Avg",
      align: "right",
      cell: (a) => {
        const s = summary[a.id];
        if (s?.avgPct == null) return <span className="text-xs text-slate-400">—</span>;
        const status: "compliant" | "watch" | "flagged" =
          s.avgPct >= 75 ? "compliant" : s.avgPct >= 50 ? "watch" : "flagged";
        return <StatusPill status={status} label={`${s.avgPct.toFixed(0)}%`} />;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-40",
      cell: (a) => (
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
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Assignments"
        subtitle={`${assignments.length} assignment${assignments.length === 1 ? "" : "s"} for this section`}
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/school/orgs/${orgId}/sections/${sectionId}/gradebook`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">Gradebook</Button>
            </Link>
            <Link to={`/school/orgs/${orgId}/admin/classes`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Classes</Button>
            </Link>
            <Link to={`/school/orgs/${orgId}/sections/${sectionId}/assignments/new`}>
              <Button size="sm" className="bg-white text-slate-900 hover:bg-slate-100">
                <Plus className="h-4 w-4 mr-1" /> New Assignment
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">Filter by kind:</span>
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

      {/* Phase 3: subject filter chips. Hidden until subjects exist on
          this section so legacy sections don't show an empty row. */}
      {subjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1">Subject:</span>
          <button
            type="button"
            onClick={() => setSubjectFilter("")}
            className={
              "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
              (subjectFilter === ""
                ? "bg-indigo-600 text-white ring-indigo-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
            }
          >
            All
          </button>
          {subjects.map((s) => {
            const active = subjectFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSubjectFilter(s.id)}
                className={
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
                  (active
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
                }
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="text-sm text-rose-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className={`${cardBase} py-8 text-center text-sm text-slate-500`}>Loading assignments…</div>
      ) : (
        <div className={cardBase}>
          <DataTable<Assignment>
            columns={columns}
            rows={filtered}
            rowKey={(a) => a.id}
            emptyMessage={
              assignments.length === 0
                ? 'No assignments yet. Click "New Assignment" to add one.'
                : "No assignments match this filter."
            }
          />
        </div>
      )}
    </div>
  );
}

