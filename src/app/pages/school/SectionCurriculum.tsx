// SectionCurriculum — define + manage curriculum topics for a section per academic year.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { HeroCard, DataTable, cardBase, cardElev, type DataTableColumn } from "../../components/school-ui";
import {
  createCurriculum,
  getSectionCurriculum,
  updateCurriculum,
  deleteCurriculum,
  addTopic,
  updateTopic,
  deleteTopic,
  reorderTopics,
  type Curriculum,
  type CurriculumTopic,
} from "../../../utils/schoolApi";

function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  // Assume academic year starts in August.
  if (now.getMonth() >= 7) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

function yearOptions(): string[] {
  const cy = currentAcademicYear();
  const startYear = parseInt(cy.split("-")[0], 10);
  return [-1, 0, 1, 2].map((d) => `${startYear + d}-${startYear + d + 1}`);
}

export function SectionCurriculum() {
  const { orgId = "", sectionId = "" } = useParams();
  const [academicYear, setAcademicYear] = useState(currentAcademicYear());
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsDesc, setDetailsDesc] = useState("");
  const [topicOpen, setTopicOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<CurriculumTopic | null>(null);
  const [topicForm, setTopicForm] = useState({ name: "", description: "", targetDate: "" });

  const refresh = () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    getSectionCurriculum(orgId, sectionId, { academicYear })
      .then((r) => {
        const c = r.curricula?.[0] ?? null;
        setCurriculum(c);
        if (c) {
          setDetailsTitle(c.title);
          setDetailsDesc(c.description ?? "");
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [orgId, sectionId, academicYear]);

  const topics = useMemo<CurriculumTopic[]>(
    () => (curriculum?.topics ?? []).slice().sort((a, b) => a.display_order - b.display_order),
    [curriculum],
  );

  const handleCreate = async () => {
    if (!createTitle.trim()) return;
    try {
      await createCurriculum(orgId, sectionId, {
        academicYear,
        title: createTitle.trim(),
        description: createDesc.trim() || undefined,
      });
      setCreateOpen(false);
      setCreateTitle("");
      setCreateDesc("");
      refresh();
      toast.success("Curriculum created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const saveDetails = async () => {
    if (!curriculum) return;
    try {
      await updateCurriculum(orgId, curriculum.id, {
        title: detailsTitle,
        description: detailsDesc,
      });
      setEditingDetails(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const removeCurriculum = async () => {
    if (!curriculum) return;
    if (!confirm(`Delete curriculum "${curriculum.title}"?`)) return;
    await deleteCurriculum(orgId, curriculum.id);
    refresh();
  };

  const openTopicCreate = () => {
    setEditingTopic(null);
    setTopicForm({ name: "", description: "", targetDate: "" });
    setTopicOpen(true);
  };

  const openTopicEdit = (t: CurriculumTopic) => {
    setEditingTopic(t);
    setTopicForm({
      name: t.name,
      description: t.description ?? "",
      targetDate: t.target_date ?? "",
    });
    setTopicOpen(true);
  };

  const submitTopic = async () => {
    if (!curriculum || !topicForm.name.trim()) return;
    try {
      if (editingTopic) {
        await updateTopic(orgId, editingTopic.id, {
          name: topicForm.name.trim(),
          description: topicForm.description.trim(),
          targetDate: topicForm.targetDate || null,
        });
      } else {
        await addTopic(orgId, curriculum.id, {
          name: topicForm.name.trim(),
          description: topicForm.description.trim() || undefined,
          targetDate: topicForm.targetDate || undefined,
        });
      }
      setTopicOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleCompleted = async (t: CurriculumTopic) => {
    await updateTopic(orgId, t.id, { completed: !t.completed });
    refresh();
  };

  const remove = async (t: CurriculumTopic) => {
    if (!confirm(`Delete topic "${t.name}"?`)) return;
    await deleteTopic(orgId, t.id);
    refresh();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    if (!curriculum) return;
    const next = topics.slice();
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    await reorderTopics(orgId, curriculum.id, next.map((t) => t.id));
    refresh();
  };

  const columns: Array<DataTableColumn<CurriculumTopic>> = [
    {
      key: "done",
      header: "Done",
      width: "w-12",
      cell: (t) => (
        <Checkbox
          checked={t.completed}
          onCheckedChange={() => toggleCompleted(t)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: "name",
      header: "Topic",
      cell: (t) => (
        <div>
          <div className={"font-medium " + (t.completed ? "line-through text-slate-400" : "text-slate-900")}>
            {t.name}
          </div>
          {t.description && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.description}</div>
          )}
        </div>
      ),
    },
    {
      key: "target",
      header: "Target",
      width: "w-32",
      cell: (t) => <span className="text-xs text-slate-600 tabular-nums">{t.target_date ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-40",
      cell: (t) => {
        const idx = topics.findIndex((x) => x.id === t.id);
        return (
          <div className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(idx, -1)} disabled={idx === 0}>
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(idx, 1)} disabled={idx === topics.length - 1}>
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openTopicEdit(t)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => remove(t)}>
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Curriculum"
        subtitle="Plan topics and track coverage for the academic year"
        rightSlot={
          <div className="flex items-center gap-2">
            <Select value={academicYear} onValueChange={setAcademicYear}>
              <SelectTrigger className="h-9 w-40 bg-white/10 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions().map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link to={`/school/orgs/${orgId}/admin/classes`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Classes</Button>
            </Link>
          </div>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !curriculum ? (
        <div className={`${cardBase} ${cardElev} p-6 text-center`}>
          <p className="text-sm text-slate-500 mb-4">No curriculum defined for {academicYear} yet.</p>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Define curriculum for {academicYear}
          </Button>
        </div>
      ) : (
        <>
          <div className={`${cardBase} ${cardElev} p-4`}>
            {editingDetails ? (
              <div className="space-y-2">
                <Input value={detailsTitle} onChange={(e) => setDetailsTitle(e.target.value)} placeholder="Title" />
                <Textarea value={detailsDesc} onChange={(e) => setDetailsDesc(e.target.value)} placeholder="Description" rows={3} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingDetails(false)}>Cancel</Button>
                  <Button size="sm" onClick={saveDetails}>Save</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{curriculum.title}</div>
                  {curriculum.description && (
                    <p className="text-sm text-slate-600 mt-1">{curriculum.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setEditingDetails(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={removeCurriculum}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className={`${cardBase} ${cardElev}`}>
            <DataTable
              columns={columns}
              rows={topics}
              rowKey={(t) => t.id}
              emptyMessage="No topics yet."
            />
            <div className="p-3 border-t border-slate-100">
              <Button size="sm" variant="outline" onClick={openTopicCreate}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add topic
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Define curriculum for {academicYear}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Title *</Label><Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="e.g. Class 3 - Mathematics" /></div>
            <div><Label>Description</Label><Textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={topicOpen} onOpenChange={setTopicOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTopic ? "Edit topic" : "Add topic"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Name *</Label><Input value={topicForm.name} onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={topicForm.description} onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })} rows={3} /></div>
            <div><Label>Target date</Label><Input type="date" value={topicForm.targetDate} onChange={(e) => setTopicForm({ ...topicForm, targetDate: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopicOpen(false)}>Cancel</Button>
            <Button onClick={submitTopic}>{editingTopic ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
