// Manage classes & sections for an org.
//
// Each class can be expanded to reveal its sections. Sections have an
// optional class-teacher dropdown sourced from the org's teacher list.

import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ClassSubjectsManager } from "./components/ClassSubjectsManager";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  HeroCard,
  cardBase,
  cardElev,
  sectionTitleClasses,
  NoAccessRedirect,
} from "../../components/school-ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Pencil,
  CalendarCheck,
  MessageSquare,
  UserCog,
  BookOpen,
  BookMarked,
  ClipboardCheck,
  Table2,
  ListChecks,
} from "lucide-react";
import { useOrgPermissionState } from "./useOrgPermission";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  listClasses,
  adminCreateClass,
  updateClass,
  deleteClass,
  createSection,
  updateSection,
  deleteSection,
  listAdminTeachers,
  type AdminClass,
  type AdminTeacher,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

export function ManageClasses() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassKind, setNewClassKind] = useState<"academic" | "hifz">("academic");
  const [editing, setEditing] = useState<AdminClass | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<"academic" | "hifz">("academic");
  const [sectionDialog, setSectionDialog] = useState<{ classId: string } | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionTeacher, setNewSectionTeacher] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Smoke-test fix: office_staff hold view_all_classes by default and the
  // toolbar links them here, but the page used to gate on isOrgAdmin only
  // and bounce them. Permission holders get a read-only view; mutating
  // controls stay admin/principal-only (canManage).
  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  const perm = useOrgPermissionState(orgId, viewerRole, "view_all_classes");
  const canManage = isOrgAdmin(me, orgId);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch((e) => setError(e?.message || "Failed to load classes"));
  };

  useEffect(() => {
    if (!orgId) return;
    refresh();
    listAdminTeachers(orgId).then(setTeachers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (meLoading) return null;
  if (!canManage && !perm.allowed) {
    if (perm.loading) return null;
    return <NoAccessRedirect />;
  }

  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    try {
      await adminCreateClass(orgId, { name: newClassName.trim(), kind: newClassKind });
      setNewClassName("");
      setAddOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRenameClass = async () => {
    if (!editing || !editName.trim()) return;
    await updateClass(orgId, editing.id, { name: editName.trim(), kind: editKind });
    setEditing(null);
    refresh();
  };

  const handleDeleteClass = async (cls: AdminClass) => {
    if (!confirm(`Delete class "${cls.name}"? Its sections will be removed too.`)) return;
    try {
      await deleteClass(orgId, cls.id);
      toast.success(`Deleted class ${cls.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the class.");
    }
    refresh();
  };

  const handleAddSection = async () => {
    if (!sectionDialog || !newSectionName.trim()) return;
    await createSection(orgId, sectionDialog.classId, {
      name: newSectionName.trim(),
      classTeacherUserId: newSectionTeacher || undefined,
    });
    setSectionDialog(null);
    setNewSectionName("");
    setNewSectionTeacher("");
    refresh();
  };

  const handleSectionTeacherChange = async (sectionId: string, userId: string) => {
    await updateSection(orgId, sectionId, { classTeacherUserId: userId || null });
    refresh();
  };

  const handleDeleteSection = async (sectionId: string, name: string) => {
    if (!confirm(`Delete section "${name}"?`)) return;
    try {
      await deleteSection(orgId, sectionId);
      toast.success(`Deleted section ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the section.");
    }
    refresh();
  };

  const totalSections = classes.reduce((n, c) => n + (c.sections?.length || 0), 0);

  // Presentation split: Hifz-program classes (any section on the 'hifz'
  // bell schedule) render after the academic classes under their own
  // group header. Structurally they STAY classes — attendance, portal,
  // and fees all hang off class sections — this is purely how the
  // hierarchy reads.
  const isHifzClass = (c: (typeof classes)[number]) =>
    c.kind === "hifz" || (c.sections ?? []).some((sec) => sec.schedule_key === "hifz");
  const orderedClasses = [
    ...classes.filter((c) => !isHifzClass(c)),
    ...classes.filter(isHifzClass),
  ];
  const firstHifzClassId = classes.find(isHifzClass)?.id;

  return (
    <div className="space-y-4">
      <HeroCard
        title="Classes"
        subtitle={`${classes.length} class${classes.length === 1 ? "" : "es"} · ${totalSections} section${totalSections === 1 ? "" : "s"}`}
        rightSlot={
          <div className="flex gap-2">
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
            </Link>
            {canManage && (
              <Button onClick={() => setAddOpen(true)} size="sm" className="bg-white text-slate-900 hover:bg-slate-100">
                <Plus className="h-4 w-4 mr-1" /> Add Class
              </Button>
            )}
          </div>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="space-y-3">
        {classes.length === 0 && (
          <div className={`${cardBase} ${cardElev} py-8 text-center text-sm text-slate-500`}>
            No classes yet. Click "Add Class" to create one.
          </div>
        )}
        {orderedClasses.map((cls) => {
          const open = !!expanded[cls.id];
          return (
            <div key={cls.id} className="space-y-3">
            {cls.id === firstHifzClassId && (
              <div className="flex flex-wrap items-baseline gap-2 pt-4">
                <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-700">Hifz Program</h2>
                <span className="text-xs text-slate-500">
                  full-time hifz classes — program overview under Academics → Hifz program
                </span>
              </div>
            )}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setExpanded((m) => ({ ...m, [cls.id]: !open }))}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-base">{cls.name}</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {cls.sections?.length || 0} section{cls.sections?.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(cls); setEditName(cls.name); setEditKind(cls.kind === "hifz" ? "hifz" : "academic"); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteClass(cls)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              {open && (
                <CardContent className="pt-0 space-y-3">
                  {/* Phase 1C: subjects live at the class level. Defined once
                      per Grade; each section picks its own teacher per subject. */}
                  <ClassSubjectsManager
                    classId={cls.id}
                    teachers={teachers.filter(
                      (t) =>
                        t.role_template === "class_teacher" ||
                        t.role_template === "visiting_teacher",
                    )}
                  />
                  <h3 className={sectionTitleClasses}>Sections</h3>
                  {(cls.sections || []).map((sec) => (
                    <div key={sec.id} className="flex flex-wrap items-center gap-2 p-2 border border-slate-200 rounded-lg bg-slate-50/50">
                      <Link
                        to={`/school/orgs/${orgId}/sections/${sec.id}`}
                        className="text-sm font-medium flex-1 min-w-[80px] text-indigo-700 hover:underline"
                        title="Open section overview"
                      >
                        {sec.name} →
                      </Link>
                      <Select
                        disabled={!canManage}
                        value={sec.class_teacher_user_id || "__none__"}
                        onValueChange={(v) => handleSectionTeacherChange(sec.id, v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-8 text-xs w-48">
                          <SelectValue placeholder="No teacher" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No class teacher</SelectItem>
                          {teachers.map((t) => (
                            <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* PR feat/hifz-trends-missed-teacher — separate Hifz
                          teacher dropdown. A Hifz school commonly runs two
                          teachers per section; this sets the one who owns
                          the memorization log. Whoever's picked here can
                          POST to /hifz-progress for the section's students
                          even without a class_teacher role. */}
                      <Select
                        disabled={!canManage}
                        value={(sec.hifz_teacher_user_id as string) || "__none__"}
                        onValueChange={(v) =>
                          updateSection(orgId, sec.id, {
                            hifzTeacherUserId: v === "__none__" ? null : v,
                          }).then(refresh)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-48">
                          <SelectValue placeholder="No Hifz teacher" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No Hifz teacher</SelectItem>
                          {teachers.map((t) => (
                            <SelectItem key={`hifz-${t.user_id}`} value={t.user_id}>
                              {t.full_name} (Hifz)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Phase B/C per-section quick-links — compact icon buttons. */}
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}/attendance`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Attendance">
                            <CalendarCheck className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}/behavior`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Behavior">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}/lessons`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Sabaq">
                            <BookOpen className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}/hifz`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Hifz">
                            <BookMarked className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}/assignments`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Assignments">
                            <ClipboardCheck className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}/gradebook`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Gradebook">
                            <Table2 className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        {/* Points at the section overview's Subjects panel —
                            the per-subject editor with paste/template/copy.
                            The old target (/sections/:id/curriculum) is the
                            legacy per-section model that doesn't feed the
                            progress bars. */}
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Curriculum">
                            <ListChecks className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Link to={`/school/orgs/${orgId}/sections/${sec.id}/roster/new`}>
                          <Button variant="outline" size="icon" className="h-8 w-8" title="Roster request">
                            <UserCog className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteSection(sec.id, sec.name)} title="Delete section">
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSectionDialog({ classId: cls.id })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add section
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
            </div>
          );
        })}
      </div>

      {/* Add class dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add class</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cls-name">Class name</Label>
            <Input id="cls-name" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g. Class 3" />
          </div>
          <div className="space-y-2">
            <Label>Class type</Label>
            <div className="grid grid-cols-2 gap-2">
              {([["academic", "Academic", "Subjects, curriculum, coverage"], ["hifz", "Hifz", "Per-child Quran log + Hifz program"]] as const).map(([val, label, hint]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setNewClassKind(val)}
                  className={
                    "rounded-lg border p-2.5 text-left transition-colors " +
                    (newClassKind === val
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200 hover:border-slate-300")
                  }
                >
                  <div className="text-sm font-medium text-slate-900">{label}</div>
                  <div className="text-[11px] text-slate-500">{hint}</div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddClass}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename class dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename class</DialogTitle></DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          <div className="space-y-2">
            <Label>Class type</Label>
            <div className="grid grid-cols-2 gap-2">
              {([["academic", "Academic", "Subjects, curriculum, coverage"], ["hifz", "Hifz", "Per-child Quran log + Hifz program"]] as const).map(([val, label, hint]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEditKind(val)}
                  className={
                    "rounded-lg border p-2.5 text-left transition-colors " +
                    (editKind === val
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200 hover:border-slate-300")
                  }
                >
                  <div className="text-sm font-medium text-slate-900">{label}</div>
                  <div className="text-[11px] text-slate-500">{hint}</div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleRenameClass}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add section dialog */}
      <Dialog open={!!sectionDialog} onOpenChange={(v) => { if (!v) setSectionDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Section name</Label>
              <Input value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="e.g. A" />
            </div>
            <div className="space-y-1">
              <Label>Class teacher (optional)</Label>
              <Select value={newSectionTeacher || "__none__"} onValueChange={(v) => setNewSectionTeacher(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No teacher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No class teacher</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDialog(null)}>Cancel</Button>
            <Button onClick={handleAddSection}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
