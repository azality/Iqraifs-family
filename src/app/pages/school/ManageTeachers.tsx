// Manage teachers (and, for principals, org admins) for an org.

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
import { UserCog, Plus, Upload, Trash2, ShieldCheck } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="h-6 w-6 text-indigo-600" /> Teachers
        </h1>
        <div className="flex gap-2">
          <Link to={`/school/orgs/${orgId}/admin`}><Button variant="outline" size="sm">← Admin</Button></Link>
          <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}><Upload className="h-4 w-4 mr-1" /> Bulk CSV</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Teacher</Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {teachers.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No teachers yet.</td></tr>}
            {teachers.map((t) => (
              <tr key={t.user_id} className="border-t">
                <td className="p-2">{t.full_name}</td>
                <td className="p-2 text-xs">{t.email}</td>
                <td className="p-2 text-xs capitalize">{t.role_template.replace("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {principal && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Admins
            </CardTitle>
            <Button size="sm" onClick={() => setAdminOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add admin</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {admins.length === 0 && <p className="text-sm text-muted-foreground">No additional admins.</p>}
            {admins.map((a) => (
              <div key={a.user_id} className="flex items-center gap-2 p-2 border rounded">
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemoveAdmin(a)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
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
