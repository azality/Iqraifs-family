// Manage teachers (and, for principals, org admins) for an org.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "../../components/ui/badge";
import { toast } from "sonner";
import { Crown } from "lucide-react";
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
import { Plus, Upload, Trash2, ShieldCheck, Mail, AlertTriangle, Star, MoreHorizontal, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useNavigate } from "react-router";
import {
  HeroCard,
  DataTable,
  cardBase,
  sectionTitleClasses,
  type DataTableColumn,
  NoAccessRedirect,
} from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  isOrgPrincipal,
  listAdminTeachers,
  addTeacher,
  bulkCreateTeachers,
  listAdmins,
  addAdmin,
  removeAdmin,
  resendInvite,
  deleteTeacher,
  getOrganization,
  updateOrganization,
  type AdminTeacher,
  type OrgAdmin,
  type RoleTemplate,
  type SchoolMeResponse,
  setInchargeWing,
  listClasses,
  type AdminClass,
} from "../../../utils/schoolApi";
import { useOrgPermissionState } from "./useOrgPermission";
import { CsvUploadDialog } from "./components/CsvUploadDialog";

export function ManageTeachers() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
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
  const [substitutePool, setSubstitutePool] = useState<Set<string>>(new Set());
  // Incharge wing dialog (feat incharge-admin-ui): pick the classes a
  // staff member oversees; empty selection removes the role. Declared
  // here with the rest of the state — hooks must precede the early
  // permission returns below.
  const [wingFor, setWingFor] = useState<AdminTeacher | null>(null);
  const [wingClasses, setWingClasses] = useState<AdminClass[]>([]);
  const [wingSel, setWingSel] = useState<Set<string>>(new Set());
  const [wingBusy, setWingBusy] = useState(false);
  // Search + role filter (pilot Sep 3): find staff by name/email, or
  // narrow to one role — dual-role people appear under EVERY role they
  // hold (filter by Class Teacher also shows Rabia, who is incharge too).
  const [staffQuery, setStaffQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listAdminTeachers(orgId).then(setTeachers).catch((e) => setError(e?.message || "Failed"));
    if (isOrgPrincipal(me, orgId)) listAdmins(orgId).then(setAdmins).catch(() => {});
    getOrganization(orgId)
      .then((r) => {
        const ids = (r.organization as any).settings?.substitute_teacher_ids;
        setSubstitutePool(new Set(Array.isArray(ids) ? ids : []));
      })
      .catch(() => {});
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [orgId, me]);

  async function toggleSubstitutePool(userId: string) {
    const next = new Set(substitutePool);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setSubstitutePool(next);
    try {
      await updateOrganization(orgId, { substitute_teacher_ids: Array.from(next) });
    } catch (e) {
      // Roll back on error.
      setSubstitutePool(substitutePool);
      setError(e instanceof Error ? e.message : "Failed to update substitute pool");
    }
  }

  // Permission-aware gate. isOrgAdmin still short-circuits for
  // principal/admin; other roles resolve through the effective matrix
  // (manage_teachers) so the Permissions editor's toggles govern this page.
  // While the matrix fetch is in flight we render nothing rather than
  // bouncing a legitimately-permitted user.
  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  const perm = useOrgPermissionState(orgId, viewerRole, "manage_teachers");

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !perm.allowed) {
    if (perm.loading) return null;
    return <NoAccessRedirect />;
  }

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

  // Revoke ALL staff-role rows for this user in this org. The auth.users
  // row is intentionally untouched — the person may still need the login
  // for family use or for staff roles at other schools.
  const handleDeleteTeacher = async (t: AdminTeacher) => {
    const label = t.full_name || t.email;
    if (!confirm(`Remove ${label} from this school's staff?\n\nTheir login still works (they just lose access to this school's admin/teacher pages). You can re-add them later.`)) return;
    try {
      await deleteTeacher(orgId, t.user_id);
      setNotice(`${label} removed from staff.`);
      setError(null);
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

  const openWing = async (t: AdminTeacher) => {
    setWingFor(t);
    setWingSel(new Set((t.inchargeClasses ?? []).map((c) => c.id)));
    if (wingClasses.length === 0) {
      try { setWingClasses(await listClasses(orgId)); } catch { /* toast below on save */ }
    }
  };

  const saveWing = async () => {
    if (!wingFor) return;
    setWingBusy(true);
    try {
      await setInchargeWing(orgId, wingFor.user_id, Array.from(wingSel));
      toast.success(
        wingSel.size === 0
          ? `${wingFor.full_name} is no longer an incharge`
          : `${wingFor.full_name} is now incharge of ${wingSel.size} class${wingSel.size === 1 ? "" : "es"}`,
      );
      setWingFor(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update incharge wing");
    } finally {
      setWingBusy(false);
    }
  };

  // Role-badge styling by template — keeps the four staff types visually
  // distinct in the list so the admin can scan "who's office vs teacher
  // vs finance" without reading the role column.
  const roleBadge = (raw: string) => {
    const key = raw || "";
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    const cls =
      key === "class_teacher" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
      : key === "visiting_teacher" ? "bg-amber-50 text-amber-700 border-amber-200"
      : key === "financial_staff" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : key === "office_staff" ? "bg-sky-50 text-sky-700 border-sky-200"
      : key === "incharge" ? "bg-violet-50 text-violet-700 border-violet-200"
      : "bg-slate-50 text-slate-700 border-slate-200";
    return <Badge variant="outline" className={cls + " text-[10px] font-medium"}>{label}</Badge>;
  };

  // Design 4a: admins join the SAME list (deduped by user; someone can
  // be admin + teacher) — the separate Admins table becomes a chip.
  const allStaff: AdminTeacher[] = (() => {
    const byId = new Map<string, AdminTeacher>();
    for (const t of teachers) byId.set(t.user_id, { ...t, roles: [...(t.roles ?? [t.role_template])] });
    for (const a of admins) {
      const existing = byId.get(a.user_id);
      if (existing) {
        if (!(existing.roles ?? []).includes("admin")) existing.roles = [...(existing.roles ?? []), "admin"];
      } else {
        byId.set(a.user_id, {
          user_id: a.user_id,
          email: a.email,
          full_name: a.full_name,
          role_template: "admin" as any,
          roles: ["admin"],
          last_sign_in_at: (a as any).last_sign_in_at ?? undefined,
        } as AdminTeacher);
      }
    }
    return Array.from(byId.values());
  })();

  const neverSignedIn = (t: AdminTeacher) =>
    t.last_sign_in_at === null; // undefined = old backend, unknown → hide state
  const staffState = (t: AdminTeacher): { label: string; cls: string } | null => {
    if (t.last_sign_in_at === undefined) return null;
    if (t.last_sign_in_at === null) return { label: "Never signed in", cls: "text-amber-700" };
    const d = new Date(t.last_sign_in_at);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return { label: "Active today", cls: "text-slate-500" };
    const days = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (days <= 7)
      return { label: `Last active ${d.toLocaleDateString(undefined, { weekday: "short" })}`, cls: "text-slate-500" };
    return { label: `Last active ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, cls: "text-slate-400" };
  };

  const countFor = (value: string) =>
    value === "all"
      ? allStaff.length
      : value === "invite"
        ? allStaff.filter(neverSignedIn).length
        : allStaff.filter((t) => (t.roles ?? [t.role_template]).includes(value)).length;
  const ROLE_FILTERS: Array<{ value: string; label: string }> = [
    { value: "all", label: `All ${countFor("all")}` },
    { value: "incharge", label: `Incharge ${countFor("incharge")}` },
    { value: "class_teacher", label: `Class Teacher ${countFor("class_teacher")}` },
    { value: "visiting_teacher", label: `Visiting ${countFor("visiting_teacher")}` },
    { value: "office_staff", label: `Office ${countFor("office_staff")}` },
    { value: "financial_staff", label: `Finance ${countFor("financial_staff")}` },
    ...(principal ? [{ value: "admin", label: `Admins ${countFor("admin")}` }] : []),
    ...(countFor("invite") > 0 ? [{ value: "invite", label: `Invite pending ${countFor("invite")}` }] : []),
  ];

  const teacherColumns: DataTableColumn<AdminTeacher>[] = [
    {
      key: "full_name",
      header: "Name",
      cell: (t) => (
        // Clickable name → detail page. Underline-on-hover signals the
        // affordance without making the whole row a button (admins still
        // need to right-click → open in new tab a lot).
        <div className="min-w-0">
          <Link
            to={`/school/orgs/${orgId}/admin/teachers/${t.user_id}`}
            className="font-medium text-indigo-700 hover:underline"
          >
            {t.full_name || "(no name)"}
          </Link>
          <div className="truncate text-[11.5px] text-slate-400">{t.email}</div>
        </div>
      ),
    },
    {
      key: "role_template",
      header: "Role",
      // One row per person now — show every role they hold. Incharge
      // carries the wing size; hover lists the classes.
      cell: (t) => {
        const roles = (t.roles && t.roles.length > 0)
          ? t.roles
          : [t.role_template ?? (t as any).role_type ?? ""];
        const ordered = [...roles].sort((a, b) => (a === "incharge" ? -1 : b === "incharge" ? 1 : 0));
        return (
          <div className="flex flex-wrap gap-1">
            {ordered.map((r) =>
              r === "incharge" ? (
                <span key={r} title={(t.inchargeClasses ?? []).map((c) => c.name).join(", ")}>
                  <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-[10px] font-medium">
                    Incharge · {(t.inchargeClasses ?? []).length}
                  </Badge>
                </span>
              ) : (
                <span key={r}>{roleBadge(r)}</span>
              ),
            )}
          </div>
        );
      },
    },
    {
      key: "state",
      header: "State",
      cell: (t) => {
        const st = staffState(t);
        return st ? <span className={"text-xs " + st.cls}>{st.label}</span> : null;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-56",
      cell: (t) => {
        const inPool = substitutePool.has(t.user_id);
        const isAdminOnly = (t.roles ?? []).length === 1 && (t.roles ?? [])[0] === "admin";
        return (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {neverSignedIn(t) && (
              <button
                type="button"
                onClick={() => handleResend(t.user_id, t.full_name || t.email)}
                className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
              >
                Resend invite
              </button>
            )}
            {!isAdminOnly && (
              <Link
                to={`/school/orgs/${orgId}/admin/teachers/${t.user_id}/schedule`}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Schedule
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => navigate(`/school/orgs/${orgId}/admin/teachers/${t.user_id}`)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> Open profile
                </DropdownMenuItem>
                {!isAdminOnly && (
                  <DropdownMenuItem onClick={() => openWing(t)}>
                    <Crown className={"mr-2 h-3.5 w-3.5 " + ((t.inchargeClasses ?? []).length > 0 ? "text-violet-600" : "")} />
                    Incharge wing…
                  </DropdownMenuItem>
                )}
                {!isAdminOnly && (
                  <DropdownMenuItem onClick={() => toggleSubstitutePool(t.user_id)}>
                    <Star className={"mr-2 h-3.5 w-3.5 " + (inPool ? "fill-amber-400 text-amber-500" : "")} />
                    {inPool ? "Remove from substitute pool" : "Add to substitute pool"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => handleResend(t.user_id, t.full_name || t.email)}>
                  <Mail className="mr-2 h-3.5 w-3.5" /> Resend invite email
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isAdminOnly ? (
                  <DropdownMenuItem
                    className="text-rose-600"
                    onClick={() => {
                      const a = admins.find((x) => x.user_id === t.user_id);
                      if (a) handleRemoveAdmin(a);
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove admin
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="text-rose-600" onClick={() => handleDeleteTeacher(t)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove from staff…
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
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
        title="Teachers & Staff"
        subtitle={`${teachers.length} staff member${teachers.length === 1 ? "" : "s"} — class teachers, visiting teachers, office, and finance`}
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            value={staffQuery}
            onChange={(e) => setStaffQuery(e.target.value)}
            placeholder="Search staff by name or email…"
            className="h-8 w-64 text-sm"
          />
          {principal && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdminOpen(true)}>
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Add admin
            </Button>
          )}
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setRoleFilter(f.value)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium ring-1 " +
                (roleFilter === f.value
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <DataTable<AdminTeacher>
          columns={teacherColumns}
          rows={allStaff.filter((t) => {
            const q = staffQuery.trim().toLowerCase();
            if (q && !(`${t.full_name} ${t.email}`.toLowerCase().includes(q))) return false;
            if (roleFilter === "all") return true;
            if (roleFilter === "invite") return neverSignedIn(t);
            const roles = (t.roles && t.roles.length > 0)
              ? t.roles
              : [t.role_template ?? (t as any).role_type ?? ""];
            return roles.includes(roleFilter);
          })}
          rowKey={(t) => t.user_id}
          emptyMessage="No staff yet — Add Teacher above, or import via Bulk CSV."
        />
      </div>

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

      {/* Incharge wing dialog — the classes this person oversees.
          School structure (Sep 2026): Montessori / Primary+Secondary /
          Hifz; empty selection removes the incharge role. */}
      <Dialog open={!!wingFor} onOpenChange={(o) => { if (!o) setWingFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Incharge wing — {wingFor?.full_name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Tick the classes this person oversees. An incharge sees a
            dashboard scoped to these classes, their Daily academics, and
            can open every section in them like a teacher — with no
            school-wide admin powers. Untick everything to remove the
            incharge role.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {wingClasses.length === 0 ? (
              <p className="p-2 text-xs text-slate-400">Loading classes…</p>
            ) : (
              wingClasses.map((cl) => (
                <label
                  key={cl.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={wingSel.has(cl.id)}
                    onChange={(e) => {
                      const next = new Set(wingSel);
                      if (e.target.checked) next.add(cl.id);
                      else next.delete(cl.id);
                      setWingSel(next);
                    }}
                  />
                  {cl.name}
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {wingSel.size === 0 ? "No classes — removes the role" : `${wingSel.size} selected`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setWingFor(null)}>Cancel</Button>
              <Button onClick={saveWing} disabled={wingBusy}>
                {wingBusy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
