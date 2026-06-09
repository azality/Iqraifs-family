// ManageHifzGroups — admin CRUD for Hifz groups.
//
// Route: /school/orgs/:orgId/admin/hifz-groups
//
// Hifz groups are a peer of class_section: a student belongs to one
// conventional section (e.g. Grade 3-A) AND one Hifz group (e.g.
// Hifz Group B) at the same time. Each group has its own Hifz teacher,
// independent of the section's class teacher. The backend POST /
// hifz-progress gate accepts EITHER the section's hifz_teacher or the
// group's, so a Hifz-only teacher can log entries through whichever
// route the school configured.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft, BookMarked, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
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
import { Card, CardContent } from "../../components/ui/card";
import {
  getSchoolMe,
  isOrgAdmin,
  listHifzGroups,
  createHifzGroup,
  updateHifzGroup,
  deleteHifzGroup,
  listAdminTeachers,
  type HifzGroup,
  type AdminTeacher,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

interface FormState {
  name: string;
  description: string;
  hifzTeacherUserId: string;
  displayOrder: number | "";
}
const emptyForm: FormState = {
  name: "",
  description: "",
  hifzTeacherUserId: "",
  displayOrder: "",
};

export function ManageHifzGroups() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [groups, setGroups] = useState<HifzGroup[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HifzGroup | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listHifzGroups(orgId).then(setGroups).catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load groups"),
    );
    listAdminTeachers(orgId).then(setTeachers).catch(() => {});
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [orgId]);

  // Only Hifz-flavoured staff make sense as group teachers. Filter the
  // dropdown so admin doesn't see office_staff / finance_staff here.
  const teacherOptions = useMemo(
    () => teachers.filter(
      (t) =>
        t.role_template === "class_teacher" ||
        t.role_template === "visiting_teacher",
    ),
    [teachers],
  );

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const startEdit = (g: HifzGroup) => {
    setEditing(g);
    setForm({
      name: g.name,
      description: g.description ?? "",
      hifzTeacherUserId: g.hifzTeacherUserId ?? "",
      displayOrder: g.displayOrder,
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    try {
      if (editing) {
        await updateHifzGroup(orgId, editing.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          hifzTeacherUserId: form.hifzTeacherUserId || null,
          displayOrder: typeof form.displayOrder === "number" ? form.displayOrder : 0,
        });
      } else {
        await createHifzGroup(orgId, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          hifzTeacherUserId: form.hifzTeacherUserId || undefined,
          displayOrder: typeof form.displayOrder === "number" ? form.displayOrder : undefined,
        });
      }
      setFormOpen(false);
      setError(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (g: HifzGroup) => {
    if (!confirm(
      `Archive "${g.name}"?\n\n${g.studentCount} student(s) currently in this group will be unassigned (their Hifz history stays intact). You can recreate a group with the same name later.`,
    )) return;
    try {
      await deleteHifzGroup(orgId, g.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Admin
          </Button>
        </Link>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4 mr-1" /> New group
        </Button>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Hifz Groups</h1>
        <p className="mt-1 text-sm text-slate-600">
          Each student can belong to one Hifz group, in parallel with their
          class section. The group's Hifz teacher gets POST access to log
          memorization progress for the group's students.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-slate-500 italic text-center">
            <BookMarked className="h-6 w-6 mx-auto text-slate-300 mb-2" />
            No Hifz groups yet. Create one to start assigning students.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-indigo-50 text-indigo-700 p-2">
                    <BookMarked className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{g.name}</div>
                    {g.description && (
                      <p className="text-xs text-slate-600 mt-0.5">{g.description}</p>
                    )}
                    <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        <span className="font-medium">{g.studentCount}</span> student
                        {g.studentCount === 1 ? "" : "s"}
                      </span>
                      <span>
                        Teacher:{" "}
                        {g.hifzTeacherName ?? <span className="italic">unassigned</span>}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(g)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(g)}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Hifz group" : "New Hifz group"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Hifz Group B"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={`Optional — e.g. "Para 30, afternoon slot"`}
              />
            </div>
            <div>
              <Label>Hifz teacher</Label>
              <Select
                value={form.hifzTeacherUserId || "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, hifzTeacherUserId: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger><SelectValue placeholder="(unassigned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(unassigned)</SelectItem>
                  {teacherOptions.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-slate-500">
                The assigned teacher can log Hifz progress for every student in this group.
              </p>
            </div>
            <div>
              <Label>Display order</Label>
              <Input
                type="number"
                value={form.displayOrder === "" ? "" : form.displayOrder}
                onChange={(e) =>
                  setForm({
                    ...form,
                    displayOrder: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ManageHifzGroups;
