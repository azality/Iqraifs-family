// Manage students for an org.
//
// Table with search + class/section filter. Supports single-student
// add/edit/delete and CSV bulk import.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
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
import { Users, Plus, Upload, Search, Trash2, Pencil, Eye } from "lucide-react";
import {
  getSchoolMe,
  isOrgAdmin,
  listClasses,
  listStudents,
  adminCreateStudent,
  updateStudent,
  deleteStudent,
  bulkCreateAdminStudents,
  type AdminClass,
  type AdminStudent,
  type CreateStudentBody,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { CsvUploadDialog } from "./components/CsvUploadDialog";

type SectionOption = { id: string; label: string; className: string; sectionName: string };

const emptyForm: CreateStudentBody = {
  grNumber: "",
  fullName: "",
  classSectionId: "",
  photoUrl: "",
  dateOfBirth: "",
  gender: "",
  guardianPhone: "",
  guardianEmail: "",
};

export function ManageStudents() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("__all__");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStudent | null>(null);
  const [form, setForm] = useState<CreateStudentBody>(emptyForm);
  const [csvOpen, setCsvOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listStudents(orgId, {
      classSectionId: sectionFilter !== "__all__" ? sectionFilter : undefined,
      search: search || undefined,
    }).then(setStudents).catch((e) => setError(e?.message || "Failed to load students"));
  };

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionFilter, search]);

  const sectionOptions: SectionOption[] = useMemo(() => {
    const out: SectionOption[] = [];
    for (const c of classes) for (const s of c.sections || []) {
      out.push({ id: s.id, label: `${c.name} - ${s.name}`, className: c.name, sectionName: s.name });
    }
    return out;
  }, [classes]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const startCreate = () => { setEditing(null); setForm(emptyForm); setFormOpen(true); };
  const startEdit = (s: AdminStudent) => {
    setEditing(s);
    setForm({
      grNumber: s.gr_number,
      fullName: s.full_name,
      classSectionId: s.class_section_id || "",
      photoUrl: s.photo_url || "",
      dateOfBirth: s.date_of_birth || "",
      gender: s.gender || "",
      guardianPhone: s.guardian_phone || "",
      guardianEmail: s.guardian_email || "",
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.grNumber || !form.fullName) return;
    try {
      if (editing) {
        await updateStudent(orgId, editing.id, form);
      } else {
        await adminCreateStudent(orgId, form);
      }
      setFormOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (s: AdminStudent) => {
    if (!confirm(`Delete student "${s.full_name}" (GR# ${s.gr_number})?`)) return;
    await deleteStudent(orgId, s.id);
    refresh();
  };

  const handleCsvSubmit = async (rows: Array<Record<string, string>>) => {
    // Resolve classSection string ("Class 3 - A") → classSectionId.
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const lookup = new Map<string, string>();
    sectionOptions.forEach((o) => lookup.set(norm(o.label), o.id));
    const enriched = rows.map((r) => {
      const cs = r.classSection ? lookup.get(norm(r.classSection)) : undefined;
      return { ...r, classSectionId: cs || r.classSectionId || null };
    });
    const res = await bulkCreateAdminStudents(orgId, enriched);
    refresh();
    return res;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-indigo-600" />
          Students
        </h1>
        <div className="flex gap-2">
          <Link to={`/school/orgs/${orgId}/admin`}><Button variant="outline" size="sm">← Admin</Button></Link>
          <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Bulk CSV
          </Button>
          <Button size="sm" onClick={startCreate}><Plus className="h-4 w-4 mr-1" /> Add Student</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name or GR#…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sections</SelectItem>
            {sectionOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left p-2">GR#</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Section</th>
                  <th className="text-left p-2">Guardian</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No students yet.</td></tr>
                )}
                {students.map((s) => {
                  const sec = sectionOptions.find((o) => o.id === s.class_section_id);
                  return (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{s.gr_number}</td>
                      <td className="p-2">{s.full_name}</td>
                      <td className="p-2 text-xs text-muted-foreground">{sec?.label || "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">{s.guardian_phone || s.guardian_email || "—"}</td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/school/orgs/${orgId}/admin/students/${s.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(s)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit student" : "Add student"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>GR#*</Label><Input value={form.grNumber} onChange={(e) => setForm({ ...form, grNumber: e.target.value })} /></div>
            <div><Label>Full name*</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <Label>Class &amp; section</Label>
              <Select value={form.classSectionId || "__none__"} onValueChange={(v) => setForm({ ...form, classSectionId: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="(unassigned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(unassigned)</SelectItem>
                  {sectionOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date of birth</Label><Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender || "__none__"} onValueChange={(v) => setForm({ ...form, gender: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Photo URL</Label><Input value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} /></div>
            <div><Label>Guardian phone</Label><Input value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} /></div>
            <div><Label>Guardian email</Label><Input type="email" value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvUploadDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="Bulk upload students"
        columns={[
          { key: "grNumber", label: "GR#", required: true, aliases: ["gr_no", "gr no", "grno"] },
          { key: "fullName", label: "Full name", required: true, aliases: ["name", "full_name"] },
          { key: "classSection", label: "Class & section (e.g. Class 3 - A)", aliases: ["class_section", "section"] },
          { key: "photoUrl", label: "Photo URL", aliases: ["photo", "photo_url"] },
          { key: "dateOfBirth", label: "Date of birth", aliases: ["dob", "date_of_birth"] },
          { key: "gender", label: "Gender" },
          { key: "guardianPhone", label: "Guardian phone", aliases: ["phone", "guardian_phone"] },
          { key: "guardianEmail", label: "Guardian email", aliases: ["email", "guardian_email"] },
        ]}
        onSubmit={handleCsvSubmit}
      />
    </div>
  );
}
