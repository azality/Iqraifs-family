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
import { Plus, Upload, Trash2, ShieldCheck, Mail, AlertTriangle } from "lucide-react";
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
  resendInvite,
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
  // PR F (Q5): validity dates appear when role=visiting_teacher (required)
  // and remain editable for any role (optional everywhere else).
  const [form, setForm] = useState<{
    email: string;
    fullName: string;
    roleTemplate: RoleTemplate;
    validFrom: string;
    validUntil: string;
  }>({
    email: "", fullName: "", roleTemplate: "class_teacher",
    validFrom: "", validUntil: "",
  });
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: "", fullName: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  // When invitedCount === 0 we don't actually know which case applied:
  //   (a) user already had an account → no email needed (normal)
  //   (b) Supabase's email validator rejected the address → email never sent
  // The backend logs distinguish them, but the frontend can't. We surface a
  // neutral notice for (a) and rely on the resend-invite button as the
  // recovery path for (b). The yellow warning below explains.
  const submitTeacher = async () => {
    if (!form.email.trim() || !form.fullName.trim()) {
      setError("Both email and full name are required.");
      return;
    }
    // Client-side guard for visiting_teacher dates so we don't make a
    // round trip to the backend just to get a 400. Backend re-validates.
    if (form.roleTemplate === "visiting_teacher" && (!form.validFrom || !form.validUntil)) {
      setError("Visiting teachers need both start and end dates.");
      return;
    }
    if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
      setError("Start date must be on or before end date.");
      return;
    }
    try {
      const res = await addTeacher(orgId, {
        email: form.email,
        fullName: form.fullName,
        roleTemplate: form.roleTemplate,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
      });
      const invited = res.invitedCount ?? 0;
      setNotice(
        invited > 0
          ? `Teacher added. We sent ${form.email} a password-reset email — they set their password from that link, then sign in at the regular login page. The school workspace will appear in their workspace switcher automatically.`
          : `Teacher added. No new invite email was sent — either ${form.email} already has an account (they can sign in with their existing password) OR the email address was rejected by our email provider. If they don't already have an account, use the "Resend invite" button next to their name below.`,
      );
      setError(null);
      setForm({ email: "", fullName: "", roleTemplate: "class_teacher", validFrom: "", validUntil: "" });
      setAddOpen(false);
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  /** Resend the password-reset (invite) email for an existing staff row.
   *  Shows the precise reason if Supabase refuses (e.g. "Email address
   *  'ddd@gmail.com' is invalid") so the principal can fix the address or
   *  share the reset link manually. */
  const handleResend = async (userId: string, label: string) => {
    try {
      const res = await resendInvite(orgId, userId);
      if (res.sent) {
        setNotice(`Invite email re-sent to ${res.email ?? label}.`);
        setError(null);
      } else {
        setError(
          `Could not send invite email to ${res.email ?? label}: ${res.reason ?? "unknown reason"}. ` +
          `You can share the password-reset link manually from the Supabase dashboard, or update the email address and try again.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitAdmin = async () => {
    if (!adminForm.email.trim() || !adminForm.fullName.trim()) {
      setError("Both email and full name are required.");
      return;
    }
    try {
      const res = await addAdmin(orgId, adminForm);
      const invited = res.invitedCount ?? 0;
      setNotice(
        invited > 0
          ? `Admin added. We sent ${adminForm.email} a password-reset email — they set their password from that link, then sign in at the regular login page. The school workspace will appear in their workspace switcher automatically.`
          : `Admin added. No new invite email was sent — either ${adminForm.email} already has an account (they can sign in with their existing password) OR the email address was rejected by our email provider. If they don't already have an account, use the "Resend invite" button next to their name below.`,
      );
      setError(null);
      setAdminForm({ email: "", fullName: "" });
      setAdminOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveAdmin = async (a: OrgAdmin) => {
    if (!confirm(`Remove ${a.full_name} as admin?`)) return;
    await removeAdmin(orgId, a.user_id);
    refresh();
  };

  const handleCsvSubmit = async (rows: Array<Record<string, string>>) => {
    const allowed: ReadonlyArray<RoleTemplate> = [
      "class_teacher",
      "visiting_teacher",
      "financial_staff",
      "office_staff",
    ];
    const typed = rows.map((r) => {
      const raw = (r.roleTemplate || "").trim();
      const roleTemplate: RoleTemplate = (allowed as readonly string[]).includes(raw)
        ? (raw as RoleTemplate)
        : "class_teacher";
      return {
        email: r.email,
        fullName: r.fullName,
        roleTemplate,
      };
    });
    const res = await bulkCreateTeachers(orgId, typed);
    const invited = res.invitedCount ?? 0;
    const inserted = res.inserted;
    setNotice(
      invited > 0
        ? `${inserted} teacher${inserted === 1 ? "" : "s"} added. Password-reset emails sent to ${invited} new user${invited === 1 ? "" : "s"} so they can set their password and log in.`
        : `${inserted} teacher${inserted === 1 ? "" : "s"} added (all already had accounts).`,
    );
    setError(null);
    refresh();
    return res;
  };

  const teacherColumns: DataTableColumn<AdminTeacher>[] = [
    { key: "full_name", header: "Name", cell: (t) => <span className="font-medium">{t.full_name}</span> },
    { key: "email", header: "Email", cell: (t) => <span className="text-xs">{t.email}</span> },
    {
      key: "role_template",
      header: "Role",
      cell: (t) => <span className="text-xs capitalize">{(t.role_template ?? (t as any).role_type ?? "").replace("_", " ")}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      cell: (t) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleResend(t.user_id, t.full_name || t.email)}
          title="Resend invite email"
        >
          <Mail className="h-3.5 w-3.5 text-slate-600" />
        </Button>
      ),
    },
  ];

  const adminColumns: DataTableColumn<OrgAdmin>[] = [
    { key: "full_name", header: "Name", cell: (a) => <span className="font-medium">{a.full_name}</span> },
    { key: "email", header: "Email", cell: (a) => <span className="text-xs">{a.email}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      cell: (a) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleResend(a.user_id, a.full_name || a.email)}
            title="Resend invite email"
          >
            <Mail className="h-3.5 w-3.5 text-slate-600" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleRemoveAdmin(a)} title="Remove admin">
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
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

      {/* Persistent help banner — invite emails sometimes silently fail
          (Supabase rejects some addresses like ddd@gmail.com, or the email
          lands in spam). The mail icon next to each row resends. */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          If a teacher or admin says they never got the invite email, click the
          {" "}<Mail className="inline h-3 w-3 -mt-0.5" /> icon next to their row
          to re-send. Check spam folders too.
        </span>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}

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
                  <SelectItem value="class_teacher">Class Teacher</SelectItem>
                  <SelectItem value="visiting_teacher">Visiting Teacher</SelectItem>
                  <SelectItem value="financial_staff">Financial Staff (fees only)</SelectItem>
                  <SelectItem value="office_staff">Office / Reception (no fees, no grades)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* PR F (Q5): Validity window. REQUIRED for visiting_teacher
                (their contract is time-bounded by definition); optional
                everywhere else (set if you want an auto-expiring grant,
                e.g. substitute teacher or intern). */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>
                  Start date{form.roleTemplate === "visiting_teacher" ? "*" : " (optional)"}
                </Label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  End date{form.roleTemplate === "visiting_teacher" ? "*" : " (optional)"}
                </Label>
                <Input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </div>
            </div>
            {form.roleTemplate === "visiting_teacher" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Visiting teacher access turns off automatically the day after the end date.
              </p>
            )}
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
          { key: "roleTemplate", label: "Role (class_teacher / visiting_teacher / financial_staff / office_staff)", required: true, aliases: ["role", "role_template"] },
        ]}
        onSubmit={handleCsvSubmit}
      />
    </div>
  );
}
