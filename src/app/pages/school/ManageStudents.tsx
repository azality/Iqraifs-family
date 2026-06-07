// Manage students for an org.
//
// Table with search + class/section filter. Supports single-student
// add/edit/delete and CSV bulk import.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
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
import { Plus, Upload, Search, Trash2, Pencil, Eye, MessageSquare } from "lucide-react";
import { BehaviorLogEntry } from "./BehaviorLogEntry";
import { DataTable, sectionTitleClasses, type DataTableColumn } from "../../components/school-ui";
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
  // Inline parent block — separate state so we can include or omit it
  // based on whether the admin chose to add a parent. Only shown when
  // creating (not editing) — editing parents is done from the existing
  // ManageParents / StudentDetail flow.
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [parentForm, setParentForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    relationship: "",
  });
  const resetParentForm = () => {
    setAddParentOpen(false);
    setParentForm({ fullName: "", phone: "", email: "", relationship: "" });
  };
  const [csvOpen, setCsvOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Per-row "Log behavior" target. null = closed.
  const [behaviorTarget, setBehaviorTarget] = useState<AdminStudent | null>(null);

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

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    // Reset parent fields but show the section by default — adding a
    // student without their parent is the exception, not the norm.
    setParentForm({ fullName: "", phone: "", email: "", relationship: "" });
    setAddParentOpen(true);
    setNotice(null);
    setError(null);
    setFormOpen(true);
  };
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
    // If the parent section is open and has data, include it. Backend
    // will dedupe by email then phone before inserting, so re-typing an
    // existing parent for a sibling won't create a duplicate row.
    const parentPayload =
      !editing && addParentOpen && parentForm.fullName.trim()
        ? {
            fullName: parentForm.fullName.trim(),
            phone: parentForm.phone.trim() || undefined,
            email: parentForm.email.trim() || undefined,
            relationship: parentForm.relationship.trim() || undefined,
          }
        : undefined;
    try {
      if (editing) {
        await updateStudent(orgId, editing.id, form);
      } else {
        const res = await adminCreateStudent(orgId, { ...form, parent: parentPayload });
        // Surface backend warning (e.g. "parent_create_failed:…") so the
        // admin knows the student saved but the parent step didn't —
        // they can retry on the parents page without losing the student.
        if ((res as any)?.warning) {
          setNotice(`Student saved but ${(res as any).warning}.`);
        } else if (parentPayload) {
          setNotice(`Student saved and linked to ${parentPayload.fullName}.`);
        }
      }
      setFormOpen(false);
      resetParentForm();
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
    const linked = (res as any)?.parentsLinked ?? 0;
    if (linked > 0) {
      setNotice(`${res.inserted} student${res.inserted === 1 ? "" : "s"} added · ${linked} parent${linked === 1 ? "" : "s"} auto-linked.`);
    }
    return res;
  };

  const columns: DataTableColumn<AdminStudent>[] = [
    {
      key: "name",
      header: "Name",
      cell: (s) => (
        <div>
          <div className="font-medium text-slate-900">{s.full_name}</div>
          <div className="text-xs text-slate-500">
            {s.guardian_phone || s.guardian_email || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "gr",
      header: "GR#",
      className: "font-mono text-xs text-slate-600 tabular-nums",
      cell: (s) => s.gr_number,
    },
    {
      key: "section",
      header: "Section",
      className: "text-xs text-slate-600",
      cell: (s) => sectionOptions.find((o) => o.id === s.class_section_id)?.label || "—",
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      headerClassName: "text-right",
      cell: (s) => (
        <div className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(`/school/orgs/${orgId}/admin/students/${s.id}`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title="Log behavior"
            onClick={() => setBehaviorTarget(s)}
          >
            <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(s)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(s)}>
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <div className={sectionTitleClasses}>Students</div>
          <p className="mt-1 text-sm text-slate-500">
            Manage roster · <span className="tabular-nums text-slate-700">{students.length}</span> on file
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/school/orgs/${orgId}/admin`}><Button variant="outline" size="sm">← Admin</Button></Link>
          <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Bulk CSV
          </Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Student
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="h-9 pl-8 border-slate-200 focus-visible:ring-indigo-500"
            placeholder="Search by name or GR#…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sections</SelectItem>
            {sectionOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <DataTable
        columns={columns}
        rows={students}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(`/school/orgs/${orgId}/admin/students/${s.id}`)}
        emptyMessage="No students yet."
      />

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

          {/* Inline parent block — shown expanded on create so the admin
              sees it as part of the same form. The student↔parent link
              is the core of how parents reach this kid in the portal, so
              hiding it behind a toggle was the wrong default.
              Admins who genuinely have no parent info (rare) can collapse
              via the "Skip for now" link; on submit we omit the parent
              payload entirely. */}
          {!editing && (
            <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/30 p-4">
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Primary parent
                  </div>
                  <div className="text-xs text-slate-600">
                    The parent we link to this student — they'll see the kid in their portal.
                  </div>
                </div>
                {addParentOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAddParentOpen(false);
                      setParentForm({ fullName: "", phone: "", email: "", relationship: "" });
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Skip for now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddParentOpen(true)}
                    className="text-xs text-indigo-700 hover:underline font-medium"
                  >
                    + Add parent
                  </button>
                )}
              </div>
              {addParentOpen ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Parent full name</Label>
                    <Input
                      value={parentForm.fullName}
                      onChange={(e) => setParentForm({ ...parentForm, fullName: e.target.value })}
                      placeholder="e.g. Imran Khan"
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={parentForm.phone}
                      onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })}
                      placeholder="+92 300 1234567"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={parentForm.email}
                      onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })}
                      placeholder="parent@example.com"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Relationship</Label>
                    <Select
                      value={parentForm.relationship || "__none__"}
                      onValueChange={(v) =>
                        setParentForm({ ...parentForm, relationship: v === "__none__" ? "" : v })
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="father">Father</SelectItem>
                        <SelectItem value="mother">Mother</SelectItem>
                        <SelectItem value="guardian">Guardian</SelectItem>
                        <SelectItem value="grandparent">Grandparent</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="sm:col-span-2 text-xs text-slate-600">
                    Already exists in this school? We'll match on email or phone and link to that record — siblings won't create duplicates.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No parent will be linked. You can add one later from the parents page.
                </p>
              )}
            </div>
          )}

          {notice && (
            <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {notice}
            </div>
          )}

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
          // Inline parent columns — all optional. If parentFullName is
          // set, the row creates+links a primary parent in one shot.
          // Same dedup rule as the single-create flow (email then phone).
          // Perfect for "old students" bulk import — one row per
          // student, parents come along automatically.
          { key: "parentFullName", label: "Parent full name (optional)", aliases: ["parent_name", "parent name"] },
          { key: "parentPhone", label: "Parent phone (optional)", aliases: ["parent_phone"] },
          { key: "parentEmail", label: "Parent email (optional)", aliases: ["parent_email"] },
          { key: "parentRelationship", label: "Parent relationship (optional)", aliases: ["parent_relationship", "relationship"] },
        ]}
        onSubmit={handleCsvSubmit}
      />

      {behaviorTarget && (
        <BehaviorLogEntry
          orgId={orgId}
          studentId={behaviorTarget.id}
          studentName={behaviorTarget.full_name}
          defaultSectionId={behaviorTarget.class_section_id || undefined}
          open={true}
          onOpenChange={(v) => {
            if (!v) setBehaviorTarget(null);
          }}
        />
      )}
    </div>
  );
}
