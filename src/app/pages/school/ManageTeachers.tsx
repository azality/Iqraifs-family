// Manage teachers (and, for principals, org admins) for an org.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
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
import { Plus, Upload, Trash2, ShieldCheck } from "lucide-react";
import {
  HeroCard,
  DataTable,
  cardBase,
  sectionTitleClasses,
  type DataTableColumn,
} from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  isOrgPrincipal,
  listAdminTeachers,
  addTeacher,
  bulkCreateTeachers,
  listAdmins,
  addAdmin,
  removeAdmin,
  type AdminTeacher,
  type OrgAdmin,
  type RoleTemplate,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { CsvUploadDialog } from "./components/CsvUploadDialog";

export function ManageTeachers() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [admins, setAdmins] = useState<OrgAdmin[]>([]);
  const [csvOpen, setCsvOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; fullName: string; roleTemplate: RoleTemplate }>({
    email: "", fullName: "", roleTemplate: "class_teacher",
  });
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: "", fullName: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listAdminTeachers(orgId).then(setTeachers).catch((e) => setError(e?.message || "Failed"));
    if (isOrgPrincipal(me, orgId)) listAdmins(orgId).then(setAdmins).catch(() => {});
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [orgId, me]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const principal = isOrgPrincipal(me, orgId);

  const submitTeacher = async () => {
    if (!form.email || !form.fullName) return;
    try {
      await addTeacher(orgId, form);
      setForm({ email: "", fullName: "", roleTemplate: "class_teacher" });
      setAddOpen(false);
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const submitAdmin = async () => {
    if (!adminForm.email || !adminForm.fullName) return;
    await addAdmin(orgId, adminForm);
    setAdminForm({ email: "", fullName: "" });
    setAdminOpen(false);
    refresh();
  };

  const handleRemoveAdmin = async (a: OrgAdmin) => {
    if (!confirm(`Remove ${a.full_name} as admin?`)) return;
    await removeAdmin(orgId, a.user_id);
    refresh();
  };

  const handleCsvSubmit = async (rows: Array<Record<string, string>>) => {
    const typed = rows.map((r) => ({
      email: r.email,
      fullName: r.fullName,
      roleTemplate: (r.roleTemplate === "visiting_teacher" ? "visiting_teacher" : "class_teacher") as RoleTemplate,
    }));
    const res = await bulkCreateTeachers(orgId, typed);
    refresh();
    return res;
  };

  const teacherColumns: DataTableColumn<AdminTeacher>[] = [
    { key: "full_name", header: "Name", cell: (t) => <span className="font-medium">{t.full_name}</span> },
    { key: "email", header: "Email", cell: (t) => <span className="text-xs">{t.email}</span> },
    {
      key: "role_template",
      header: "Role",
      cell: (t) => <span className="text-xs capitalize">{t.role_template.replace("_", " ")}</span>,
    },
  ];

  const adminColumns: DataTableColumn<OrgAdmin>[] = [
    { key: "full_name", header: "Name", cell: (a) => <span className="font-medium">{a.full_name}</span> },
    { key: "email", header: "Email", cell: (a) => <span className="text-xs">{a.email}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-16",
      cell: (a) => (
        <Button variant="ghost" size="sm" onClick={() => handleRemoveAdmin(a)} title="Remove admin">
          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Teachers"
        subtitle={`${teachers.length} teacher${teachers.length === 1 ? "" : "s"}`}
        rightSlot={
          <div className="flex gap-2">
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
            </Link>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setCsvOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Bulk CSV
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} className="bg-white text-slate-900 hover:bg-slate-100">
              <Plus className="h-4 w-4 mr-1" /> Add Teacher
            </Button>
          </div>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className={cardBase}>
        <DataTable<AdminTeacher>
          columns={teacherColumns}
          rows={teachers}
          rowKey={(t) => t.user_id}
          emptyMessage="No teachers yet."
        />
      </div>

      {principal && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className={sectionTitleClasses}>
              <ShieldCheck className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
              Admins
            </h2>
            <Button size="sm" onClick={() => setAdminOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add admin
            </Button>
          </div>
          <div className={cardBase}>
            <DataTable<OrgAdmin>
              columns={adminColumns}
              rows={admins}
              rowKey={(a) => a.user_id}
              emptyMessage="No additional admins."
            />
          </div>
        </div>
      )}

      {/* Add teacher dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add teacher</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Email*</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Full name*</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.roleTemplate} onValueChange={(v) => setForm({ ...form, roleTemplate: v as RoleTemplate })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="class_teacher">Class teacher</SelectItem>
                  <SelectItem value="visiting_teacher">Visiting teacher</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitTeacher}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add admin dialog */}
      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add admin</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Email*</Label><Input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} /></div>
            <div><Label>Full name*</Label><Input value={adminForm.fullName} onChange={(e) => setAdminForm({ ...adminForm, fullName: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminOpen(false)}>Cancel</Button>
            <Button onClick={submitAdmin}>Grant admin</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvUploadDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="Bulk upload teachers"
        columns={[
          { key: "email", label: "Email", required: true },
          { key: "fullName", label: "Full name", required: true, aliases: ["name", "full_name"] },
          { key: "roleTemplate", label: "Role (class_teacher / visiting_teacher)", required: true, aliases: ["role", "role_template"] },
        ]}
        onSubmit={handleCsvSubmit}
      />
    </div>
  );
}
