// Manage classes & sections for an org.
//
// Each class can be expanded to reveal its sections. Sections have an
// optional class-teacher dropdown sourced from the org's teacher list.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
  Building2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import {
  getSchoolMe,
  isOrgAdmin,
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
  const [editing, setEditing] = useState<AdminClass | null>(null);
  const [editName, setEditName] = useState("");
  const [sectionDialog, setSectionDialog] = useState<{ classId: string } | null>(null);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionTeacher, setNewSectionTeacher] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

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
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    try {
      await adminCreateClass(orgId, { name: newClassName.trim() });
      setNewClassName("");
      setAddOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRenameClass = async () => {
    if (!editing || !editName.trim()) return;
    await updateClass(orgId, editing.id, { name: editName.trim() });
    setEditing(null);
    refresh();
  };

  const handleDeleteClass = async (cls: AdminClass) => {
    if (!confirm(`Delete class "${cls.name}"? Its sections will be removed too.`)) return;
    await deleteClass(orgId, cls.id);
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
    await deleteSection(orgId, sectionId);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-indigo-600" />
          Classes & sections
        </h1>
        <div className="flex gap-2">
          <Link to={`/school/orgs/${orgId}/admin`}>
            <Button variant="outline" size="sm">← Admin</Button>
          </Link>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Class
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {classes.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            No classes yet. Click "Add Class" to create one.
          </CardContent></Card>
        )}
        {classes.map((cls) => {
          const open = !!expanded[cls.id];
          return (
            <Card key={cls.id}>
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
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(cls); setEditName(cls.name); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClass(cls)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {open && (
                <CardContent className="pt-0 space-y-2">
                  {(cls.sections || []).map((sec) => (
                    <div key={sec.id} className="flex items-center gap-2 p-2 border rounded">
                      <span className="text-sm flex-1">{sec.name}</span>
                      <Select
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
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteSection(sec.id, sec.name)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSectionDialog({ classId: cls.id })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add section
                  </Button>
                </CardContent>
              )}
            </Card>
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
