// Manage students for an org.
//
// Table with search + class/section filter. Supports single-student
// add/edit/delete and CSV bulk import.

import { toast } from "sonner";
import { ReadmitDialog } from "./components/ReadmitDialog";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
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
import { Plus, Upload, Search, Trash2, Pencil, Eye, MessageSquare, UserMinus, UserPlus } from "lucide-react";
import { BehaviorLogEntry } from "./BehaviorLogEntry";
import { DataTable, sectionTitleClasses, type DataTableColumn, NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  listClasses,
  listStudents,
  adminCreateStudent,
  updateStudent,
  deleteStudent,
  bulkCreateAdminStudents,
  listHifzGroups,
  getStudent,
  listParents,
  linkStudentParent,
  unlinkStudentParent,
  uploadSchoolPhoto,
  listClassFeePlans,
  createClassFeePlan,
  listStudentFeeOverrides,
  markStudentLeft,
  upsertStudentFeeOverride,
  deleteStudentFeeOverride,
  type ClassFeePlan,
  type AdminParent,
  type AdminClass,
  type AdminStudent,
  type CreateStudentBody,
  type GuardianInput,
  type HifzGroup,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { useOrgPermissionState } from "./useOrgPermission";
import { CsvUploadDialog } from "./components/CsvUploadDialog";

type SectionOption = { id: string; label: string; className: string; sectionName: string; classId: string };

const emptyForm: CreateStudentBody = {
  grNumber: "",
  fullName: "",
  classSectionId: "",
  photoUrl: "",
  dateOfBirth: "",
  gender: "",
  guardianPhone: "",
  guardianEmail: "",
  program: "",
};

// Blank guardian slot. We pre-fill the parentRole on the well-known
// slots (father / mother) so dedup behavior is consistent and the
// stored relationship column gets the right value without the admin
// having to retype it.
function emptyGuardian(role: GuardianInput["parentRole"] = "guardian"): GuardianInput {
  return {
    parentRole: role,
    fullName: "",
    title: role === "father" ? "Mr." : role === "mother" ? "Mrs." : "",
    nic: "",
    homeAddress: "",
    homePhone: "",
    cellPhone: "",
    email: "",
    occupation: "",
    employer: "",
    employerAddress: "",
    businessPhone: "",
    // Default flags follow common reality: father is primary contact +
    // fee payer; mother is emergency contact. Admin can override.
    isPrimaryContact: role === "father",
    isEmergencyContact: role === "mother",
    isFeePayer: role === "father",
    isPickupAuthorized: role === "father" || role === "mother",
    portalAccessPhone: "",
  };
}

export function ManageStudents() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [hifzGroups, setHifzGroups] = useState<HifzGroup[]>([]);
  const [search, setSearch] = useState("");
  // Honor ?classSectionId=… so links from a section dashboard ("Students
  // (39)") land pre-filtered to that section instead of the whole org.
  const [searchParams] = useSearchParams();
  const [sectionFilter, setSectionFilter] = useState<string>(
    () => searchParams.get("classSectionId") || "__all__",
  );
  const [statusFilter, setStatusFilter] = useState<"active" | "left" | "all">("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStudent | null>(null);
  const [form, setForm] = useState<CreateStudentBody>(emptyForm);
  // Linked parents shown inside the edit dialog (null = loading).
  const [editParents, setEditParents] = useState<Array<AdminParent & { isPrimary?: boolean }> | null>(null);
  // Link-a-parent mini-search inside the edit dialog.
  const [parentQuery, setParentQuery] = useState("");
  const [parentResults, setParentResults] = useState<AdminParent[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Guardian state (PR feat/student-parent-onboarding-redesign) — mirrors
  // the Father / Mother / Guardian columns of the IFS admission form.
  // Father + Mother slots are always rendered; the Other Guardian slot
  // is opt-in for step-parents, grandparents, or sponsors.
  const [father, setFather] = useState<GuardianInput>(emptyGuardian("father"));
  const [mother, setMother] = useState<GuardianInput>(emptyGuardian("mother"));
  const [otherGuardianOpen, setOtherGuardianOpen] = useState(false);
  const [otherGuardian, setOtherGuardian] = useState<GuardianInput>(
    emptyGuardian("guardian"),
  );
  // Admission-form detail toggle: religion / nationality / medical /
  // last school / etc. Hidden by default to keep the dialog short for
  // mid-year transfers where the office only has the basics. The IFS
  // paper form covers these — toggling shows the full set 1:1.
  const [admissionDetailsOpen, setAdmissionDetailsOpen] = useState(false);
  const resetGuardianForms = () => {
    setFather(emptyGuardian("father"));
    setMother(emptyGuardian("mother"));
    setOtherGuardian(emptyGuardian("guardian"));
    setOtherGuardianOpen(false);
    setAdmissionDetailsOpen(false);
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
    listHifzGroups(orgId).then(setHifzGroups).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionFilter, search]);

  const sectionOptions: SectionOption[] = useMemo(() => {
    const out: SectionOption[] = [];
    for (const c of classes) for (const s of c.sections || []) {
      out.push({ id: s.id, label: `${c.name} - ${s.name}`, className: c.name, sectionName: s.name, classId: c.id });
    }
    return out;
  }, [classes]);

  // ─── Monthly fee (pilot request: capture fee right on the admission
  // form). The fee model is class plan + per-student override — this
  // field reads/writes that: matching the class standard clears the
  // override, differing sets one, and the very first fee entered for a
  // class with no plan CREATES the plan at that amount.
  const [monthlyFee, setMonthlyFee] = useState("");
  const [feeReason, setFeeReason] = useState("");
  const [feePlan, setFeePlan] = useState<ClassFeePlan | null>(null);
  useEffect(() => {
    if (!formOpen || !form.classSectionId) { setFeePlan(null); return; }
    const classId = sectionOptions.find((o) => o.id === form.classSectionId)?.classId;
    if (!classId) { setFeePlan(null); return; }
    let cancelled = false;
    listClassFeePlans(orgId, classId)
      .then((r) => {
        if (cancelled) return;
        const monthly = r.plans.filter((p) => p.frequency === "monthly" && !p.archivedAt);
        setFeePlan(monthly.find((p) => p.name === "Monthly Tuition") ?? monthly[0] ?? null);
      })
      .catch(() => { if (!cancelled) setFeePlan(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, form.classSectionId, sectionOptions, orgId]);

  /** After the student row is saved, reconcile the fee field with the
   *  plan/override model. Empty input = leave fees untouched. */
  const applyMonthlyFee = async (studentId: string, classSectionId: string) => {
    const raw = monthlyFee.trim();
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) { toast.error("Monthly fee must be a number."); return; }
    try {
      let plan = feePlan;
      if (!plan) {
        const classId = sectionOptions.find((o) => o.id === classSectionId)?.classId;
        if (!classId) return;
        const created = await createClassFeePlan(orgId, classId, {
          name: "Monthly Tuition", amount, frequency: "monthly", defaultDueDay: 10,
        });
        toast.success(`Monthly Tuition plan created for this class at Rs. ${amount}.`);
        plan = created.plan;
        return; // first student defines the class standard — no override needed
      }
      if (amount === plan.amount && !feeReason.trim()) {
        await deleteStudentFeeOverride(orgId, studentId, plan.id).catch(() => {});
        toast.success(`Fee: Rs. ${amount} (class standard).`);
      } else {
        await upsertStudentFeeOverride(orgId, studentId, plan.id, {
          overrideAmount: amount, notes: feeReason.trim() || "Set from student form",
        });
        toast.success(`Fee set: Rs. ${amount} (class standard is Rs. ${plan.amount}).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Student saved, but the fee could not be saved.");
    }
  };

  // Permission-aware gate. isOrgAdmin still short-circuits for
  // principal/admin; other roles resolve through the effective matrix
  // (manage_students) so the Permissions editor's toggles govern this page.
  // While the matrix fetch is in flight we render nothing rather than
  // bouncing a legitimately-permitted user.
  // Mark-as-left dialog state. MUST live above the early permission
  // returns below — hooks after a conditional return crash React with
  // "Rendered more hooks than during the previous render" (pilot bug:
  // the whole Students page died with "Something went wrong").
  const [markLeftTarget, setMarkLeftTarget] = useState<AdminStudent | null>(null);
  const [leftReason, setLeftReason] = useState("");
  const [markLeftBusy, setMarkLeftBusy] = useState(false);
  const [readmitTarget, setReadmitTarget] = useState<AdminStudent | null>(null);

  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  const perm = useOrgPermissionState(orgId, viewerRole, "manage_students");

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !perm.allowed) {
    if (perm.loading) return null;
    return <NoAccessRedirect />;
  }

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    resetGuardianForms();
    setMonthlyFee("");
    setFeeReason("");
    setNotice(null);
    setError(null);
    setFormOpen(true);
  };
  const startEdit = (s: AdminStudent) => {
    setEditing(s);
    // Prefill the fee field with this student's effective monthly amount.
    setMonthlyFee("");
    setFeeReason("");
    listStudentFeeOverrides(orgId, s.id)
      .then((r) => {
        const monthly = r.plans.find((p) => p.plan.frequency === "monthly");
        if (monthly) {
          setMonthlyFee(String(monthly.effectiveAmount));
          const notes = (monthly.override as any)?.notes;
          if (monthly.override && notes && notes !== "Set from student form") setFeeReason(notes);
        }
      })
      .catch(() => { /* field stays blank — saving blank leaves fees untouched */ });
    // Pull the linked parents so the edit dialog mirrors the parent side
    // (pilot feedback: linking was invisible from the student's edit view).
    setEditParents(null);
    getStudent(orgId, s.id)
      .then((full) => setEditParents(full.parents ?? []))
      .catch(() => setEditParents([]));
    setForm({
      grNumber: s.gr_number,
      fullName: s.full_name,
      classSectionId: s.class_section_id || "",
      photoUrl: s.photo_url || "",
      dateOfBirth: s.date_of_birth || "",
      gender: s.gender || "",
      guardianPhone: s.guardian_phone || "",
      guardianEmail: s.guardian_email || "",
      program: ((s as any).program as "hifz" | "conventional" | undefined) || "",
      hifzGroupId: (s as any).hifz_group_id ?? "",
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.grNumber || !form.fullName) {
      // Silent no-op here made Save look broken during onboarding — say why.
      toast.error("GR number and full name are required.");
      return;
    }
    // Build the structured guardians[] array — only include slots with
    // a fullName. Backend dedupes by NIC → email → phone so a sibling
    // submission with the same father reuses the existing parent row.
    const guardians: GuardianInput[] = [];
    if (!editing) {
      if ((father.fullName || "").trim()) guardians.push(father);
      if ((mother.fullName || "").trim()) guardians.push(mother);
      if (otherGuardianOpen && (otherGuardian.fullName || "").trim()) {
        guardians.push(otherGuardian);
      }
    }
    try {
      if (editing) {
        // Empty strings in optional typed fields (date of birth) crash
        // the Postgres date column — send null instead. (Pilot bug:
        // adding a guardian phone failed because the untouched DOB rode
        // along as "".)
        await updateStudent(orgId, editing.id, {
          ...form,
          dateOfBirth: form.dateOfBirth || null,
        } as any);
        if (form.classSectionId) await applyMonthlyFee(editing.id, form.classSectionId);
      } else {
        const res = await adminCreateStudent(orgId, {
          ...form,
          guardians: guardians.length > 0 ? guardians : undefined,
        });
        if ((res as any)?.id && form.classSectionId) {
          await applyMonthlyFee((res as any).id, form.classSectionId);
        }
        // Surface backend warning(s) — guardian step can fail
        // independently of the student insert, e.g. NIC clash. We
        // intentionally don't block the success path on that.
        const warns = (res as any)?.warnings as string[] | undefined;
        const linked = (res as any)?.guardiansLinked as number | undefined;
        if (warns && warns.length > 0) {
          setNotice(`Student saved. Note: ${warns.join("; ")}`);
        } else if (linked && linked > 0) {
          setNotice(`Student saved + ${linked} guardian${linked === 1 ? "" : "s"} linked.`);
        } else if (guardians.length === 0) {
          setNotice("Student saved as 'Guardians pending' — add parents from the detail page.");
        }
      }
      setFormOpen(false);
      resetGuardianForms();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmMarkLeft = async () => {
    if (!markLeftTarget) return;
    setMarkLeftBusy(true);
    try {
      const res = await markStudentLeft(orgId, markLeftTarget.id, leftReason.trim() || undefined);
      const cancelled = (res as any)?.cancelledVouchers ?? 0;
      toast.success(
        cancelled > 0
          ? `${markLeftTarget.full_name} marked as left. ${cancelled} unpaid voucher${cancelled === 1 ? "" : "s"} cancelled.`
          : `${markLeftTarget.full_name} marked as left.`,
      );
      setMarkLeftTarget(null);
      setLeftReason("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark the student as left.");
    } finally {
      setMarkLeftBusy(false);
    }
  };

  // Re-admission goes through the placement dialog (class, program, fee,
  // note) — a returnee from a past year must not silently land back in
  // their old class. State lives with the other dialog state above.

  const handleDelete = async (s: AdminStudent) => {
    if (!confirm(`Delete student "${s.full_name}" (GR# ${s.gr_number})?`)) return;
    try {
      await deleteStudent(orgId, s.id);
      toast.success(`Deleted ${s.full_name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the student.");
    }
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
      cell: (s) => {
        // Surface the admission-completeness flag right on the list so
        // the office can spot pending records without drilling into
        // each one. Anything other than 'complete' renders a pill in
        // amber. Records created the legacy way come back from the
        // backend with the column missing → treat as complete.
        const status = (s as any).completeness_status as string | undefined;
        const pending = status && status !== "complete";
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{s.full_name}</span>
              {s.status === "withdrawn" && (
                <span
                  className="inline-flex items-center rounded-full bg-slate-200 text-slate-600 text-[10px] font-medium px-1.5 py-0.5"
                  title={s.left_reason || undefined}
                >
                  Left{s.left_at ? ` ${new Date(s.left_at).toLocaleDateString()}` : ""}
                  {(() => {
                    // Tenure: admission date (fall back to record creation) → left date.
                    const from = s.admission_date || s.created_at;
                    if (!from || !s.left_at) return null;
                    const months = Math.max(
                      0,
                      Math.round((new Date(s.left_at).getTime() - new Date(from).getTime()) / (30.44 * 86400000)),
                    );
                    return ` · ${months >= 12 ? `${Math.floor(months / 12)}y ${months % 12}m` : `${months}m`}`;
                  })()}
                </span>
              )}
              {pending && (
                <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium px-1.5 py-0.5">
                  {status === "guardians_pending"
                    ? "Guardians pending"
                    : status === "documents_pending"
                    ? "Documents pending"
                    : status === "fees_pending"
                    ? "Fees pending"
                    : "Pending"}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {s.guardian_phone || s.guardian_email || "—"}
            </div>
          </div>
        );
      },
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
      cell: (s) =>
        s.status === "withdrawn" ? (
          <span className="text-slate-400">
            was {sectionOptions.find((o) => o.id === s.left_from_section_id)?.label || "—"}
          </span>
        ) : (
          sectionOptions.find((o) => o.id === s.class_section_id)?.label || "—"
        ),
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
          {s.status === "withdrawn" ? (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Re-admit" onClick={() => setReadmitTarget(s)}>
              <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Mark as left" onClick={() => { setLeftReason(""); setMarkLeftTarget(s); }}>
              <UserMinus className="h-3.5 w-3.5 text-amber-600" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Delete permanently" onClick={() => handleDelete(s)}>
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
            Manage roster · <span className="tabular-nums text-slate-700">{students.filter((s) => s.status !== "withdrawn").length}</span> active
            {students.some((s) => s.status === "withdrawn") && (
              <span className="text-slate-400"> · {students.filter((s) => s.status === "withdrawn").length} left</span>
            )}
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <DataTable
        columns={columns}
        rows={students.filter((s) =>
          statusFilter === "all" ? true : statusFilter === "left" ? s.status === "withdrawn" : s.status !== "withdrawn",
        )}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(`/school/orgs/${orgId}/admin/students/${s.id}`)}
        emptyMessage="No students yet."
      />

      {readmitTarget && (
        <ReadmitDialog
          orgId={orgId}
          student={readmitTarget}
          open={!!readmitTarget}
          onClose={() => setReadmitTarget(null)}
          onDone={refresh}
        />
      )}

      {/* Mark-as-left dialog */}
      <Dialog open={!!markLeftTarget} onOpenChange={(o) => { if (!o) setMarkLeftTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark student as left</DialogTitle>
          </DialogHeader>
          {markLeftTarget && (
            <div className="space-y-4 pt-1">
              <p className="text-sm leading-relaxed text-slate-700">
                <strong>{markLeftTarget.full_name}</strong> (GR# {markLeftTarget.gr_number}) will be
                removed from the class roster, attendance and fee billing.
                Their record and full history stay — you can re-admit them
                anytime from the "Left" filter.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="left-reason">Reason (optional)</Label>
                <Input
                  id="left-reason"
                  value={leftReason}
                  onChange={(e) => setLeftReason(e.target.value)}
                  placeholder="e.g. family moved, transferred to another school"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setMarkLeftTarget(null)} disabled={markLeftBusy}>
                  Cancel
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={() => void confirmMarkLeft()}
                  disabled={markLeftBusy}
                >
                  {markLeftBusy ? "Saving…" : "Mark as left"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
            <div>
              <Label>Monthly fee (Rs.)</Label>
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder={feePlan ? String(feePlan.amount) : "e.g. 3500"}
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value)}
                disabled={!form.classSectionId}
              />
            </div>
            <div>
              <Label>Fee reason (optional)</Label>
              <Input
                placeholder="e.g. sibling discount, scholarship"
                value={feeReason}
                onChange={(e) => setFeeReason(e.target.value)}
                disabled={!form.classSectionId}
              />
            </div>
            <p className="sm:col-span-2 -mt-2 text-xs text-slate-500">
              {!form.classSectionId
                ? "Pick a class first — fee is set per class."
                : feePlan
                  ? `Class standard: Rs. ${feePlan.amount}. A different amount saves as this student's individual fee (add a reason so future you knows why). Leave blank to keep unchanged.`
                  : "No fee plan for this class yet — the first amount entered becomes the class standard."}
            </p>
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
            <div className="sm:col-span-2">
              <Label>Photo</Label>
              <div className="mt-1 flex items-center gap-3">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-slate-100 ring-1 ring-slate-200" />
                )}
                <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  {uploadingPhoto ? "Uploading…" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingPhoto}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploadingPhoto(true);
                      try {
                        const { url } = await uploadSchoolPhoto(orgId, file);
                        setForm((f) => ({ ...f, photoUrl: url }));
                        toast.success("Photo uploaded — Save to keep it.");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Upload failed.");
                      } finally {
                        setUploadingPhoto(false);
                      }
                    }}
                  />
                </label>
                {form.photoUrl && (
                  <button
                    type="button"
                    className="text-xs text-rose-600 hover:underline"
                    onClick={() => setForm((f) => ({ ...f, photoUrl: "" }))}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">JPG / PNG / WebP, up to 2 MB.</p>
            </div>
            {/* Guardian contact: the PARENT record is the source of truth
                (it drives the parent portal login + office dashboards).
                When parents are linked, show their contact read-only here;
                the quick-capture fields only appear while no parent is
                linked, with a nudge toward linking. Linking backfills
                these columns server-side. */}
            {editing && (editParents?.length ?? 0) > 0 ? (
              <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-medium text-slate-500">Guardian contact — from linked parent</div>
                <div className="mt-0.5 text-sm text-slate-800">
                  {(editParents ?? []).map((p) =>
                    [p.full_name, p.phone, p.email].filter(Boolean).join(" · "),
                  ).join("  |  ")}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Edit the phone/email on the parent record (Linked parents below, or the Parents page).
                </div>
              </div>
            ) : (
              <>
                <div><Label>Guardian phone</Label><Input value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} placeholder="Quick note — link a parent for portal access" /></div>
                <div><Label>Guardian email</Label><Input type="email" value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} /></div>
              </>
            )}
            <div className="sm:col-span-2">
              <Label>Program</Label>
              <Select
                value={form.program || "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, program: v === "__none__" ? "" : (v as "hifz" | "conventional") })
                }
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="conventional">Conventional</SelectItem>
                  <SelectItem value="hifz">Hifz</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-slate-500">
                Drives Hifz dashboards and "Program" announcements.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>Hifz group</Label>
              <Select
                value={form.hifzGroupId || "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, hifzGroupId: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger><SelectValue placeholder="(unassigned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(unassigned)</SelectItem>
                  {hifzGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-slate-500">
                Hifz groups are a peer of the class section.{" "}
                <Link to={`/school/orgs/${orgId}/admin/hifz-groups`} className="text-indigo-600 hover:underline">
                  Manage groups →
                </Link>
              </p>
            </div>
          </div>

          {/* EDIT MODE: linked parents — mirror of the Parents page so
              link/unlink works from BOTH sides (pilot feedback). */}
          {editing && (
            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Linked parents
              </div>
              {editParents === null ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : editParents.length === 0 ? (
                <p className="text-xs text-slate-500">No parents linked yet — search below to link one.</p>
              ) : (
                <ul className="space-y-1.5">
                  {editParents.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-800 truncate">{p.full_name}</span>
                      <span className="text-xs text-slate-500 capitalize">{p.relationship || "Parent"}</span>
                      {p.phone && <span className="text-xs text-slate-500">{p.phone}</span>}
                      <button
                        type="button"
                        className="ml-auto text-xs text-rose-600 hover:underline"
                        onClick={async () => {
                          if (!editing) return;
                          if (!confirm(`Unlink ${p.full_name} from ${editing.full_name}? The parent record stays; only the connection is removed.`)) return;
                          try {
                            await unlinkStudentParent(orgId, editing.id, p.id);
                            setEditParents((cur) => (cur ?? []).filter((x) => x.id !== p.id));
                            toast.success(`Unlinked ${p.full_name}`);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Could not unlink.");
                          }
                        }}
                      >
                        Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2">
                <Input
                  placeholder="Search existing parents to link (name / phone)…"
                  value={parentQuery}
                  onChange={async (e) => {
                    const q = e.target.value;
                    setParentQuery(q);
                    if (q.trim().length < 2) { setParentResults([]); return; }
                    try {
                      const all = await listParents(orgId, {});
                      const lower = q.trim().toLowerCase();
                      const linkedIds = new Set((editParents ?? []).map((x) => x.id));
                      setParentResults(
                        all
                          .filter((p) => !linkedIds.has(p.id))
                          .filter((p) =>
                            p.full_name.toLowerCase().includes(lower) ||
                            (p.phone ?? "").includes(q.trim()),
                          )
                          .slice(0, 6),
                      );
                    } catch { /* ignore */ }
                  }}
                />
                {parentResults.length > 0 && (
                  <ul className="mt-1 divide-y divide-slate-100 rounded-md border border-slate-200">
                    {parentResults.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                        <span className="truncate">{p.full_name}</span>
                        {p.phone && <span className="text-xs text-slate-500">{p.phone}</span>}
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto h-6 text-xs"
                          onClick={async () => {
                            if (!editing) return;
                            try {
                              await linkStudentParent(orgId, {
                                studentId: editing.id,
                                parentId: p.id,
                                isPrimary: (editParents ?? []).length === 0,
                              });
                              setEditParents((cur) => [...(cur ?? []), p]);
                              setParentResults((r) => r.filter((x) => x.id !== p.id));
                              toast.success(`Linked ${p.full_name}`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Could not link.");
                            }
                          }}
                        >
                          Link
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Need a brand-new parent? Add them on the Parents page — it
                  links to the child in the same step.
                </p>
              </div>
            </div>
          )}

          {/* Family Information — modeled directly on the IFS admission
              form's two-column Family Information table. Father + Mother
              shown by default; Other Guardian opt-in for step-parents,
              grandparents, or sponsored students. Each block holds the
              full per-parent attribute set (NIC, occupation, etc.) plus
              per-link role flag checkboxes. */}
          {!editing && (
            <div className="mt-4 space-y-3">
              <GuardianBlock
                value={father}
                onChange={setFather}
                title="Father"
                tone="indigo"
              />
              <GuardianBlock
                value={mother}
                onChange={setMother}
                title="Mother"
                tone="rose"
              />
              {otherGuardianOpen ? (
                <GuardianBlock
                  value={otherGuardian}
                  onChange={setOtherGuardian}
                  title="Other guardian"
                  tone="slate"
                  allowRoleChange
                  onRemove={() => {
                    setOtherGuardianOpen(false);
                    setOtherGuardian(emptyGuardian("guardian"));
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setOtherGuardianOpen(true)}
                  className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800"
                >
                  + Add another guardian (step-parent, grandparent, sponsor…)
                </button>
              )}

              <p className="text-[11px] text-slate-500 italic">
                Leave a block empty if not applicable. We dedupe by NIC,
                email, then phone — siblings sharing parents won't create
                duplicate records. If no guardian is filled in, the
                student is saved with status <strong>Guardians pending</strong>.
              </p>

              {/* Full IFS admission form fields — religion, nationality,
                  language, last school, medical, etc. Hidden behind a
                  toggle so a mid-year transfer entry doesn't need them. */}
              <button
                type="button"
                onClick={() => setAdmissionDetailsOpen((v) => !v)}
                className="w-full text-left text-xs font-medium text-indigo-700 hover:underline"
              >
                {admissionDetailsOpen ? "− Hide" : "+ Show"} full admission form details
              </button>
              {admissionDetailsOpen && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Registration No.</Label>
                    <Input
                      value={form.registrationNo ?? ""}
                      onChange={(e) => setForm({ ...form, registrationNo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Applying for grade/class</Label>
                    <Input
                      value={form.applyingForGrade ?? ""}
                      onChange={(e) => setForm({ ...form, applyingForGrade: e.target.value })}
                      placeholder="e.g. Grade 3"
                    />
                  </div>
                  <div>
                    <Label>Academic term</Label>
                    <Input
                      value={form.academicTerm ?? ""}
                      onChange={(e) => setForm({ ...form, academicTerm: e.target.value })}
                      placeholder="2026-2027"
                    />
                  </div>
                  <div>
                    <Label>Religion</Label>
                    <Input
                      value={form.religion ?? ""}
                      onChange={(e) => setForm({ ...form, religion: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Nationality</Label>
                    <Input
                      value={form.nationality ?? ""}
                      onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                      placeholder="Pakistani"
                    />
                  </div>
                  <div>
                    <Label>Language at home</Label>
                    <Input
                      value={form.homeLanguage ?? ""}
                      onChange={(e) => setForm({ ...form, homeLanguage: e.target.value })}
                      placeholder="Urdu / Punjabi / Sindhi…"
                    />
                  </div>
                  <div>
                    <Label>Last school attended</Label>
                    <Input
                      value={form.lastSchool ?? ""}
                      onChange={(e) => setForm({ ...form, lastSchool: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Class presently studying</Label>
                    <Input
                      value={form.lastClassStudying ?? ""}
                      onChange={(e) => setForm({ ...form, lastClassStudying: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Class completed</Label>
                    <Input
                      value={form.lastClassCompleted ?? ""}
                      onChange={(e) => setForm({ ...form, lastClassCompleted: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Blood group</Label>
                    <Input
                      value={form.bloodGroup ?? ""}
                      onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                      placeholder="A+ / O- / …"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Medical conditions</Label>
                    <Input
                      value={form.medicalConditions ?? ""}
                      onChange={(e) => setForm({ ...form, medicalConditions: e.target.value })}
                      placeholder="Allergies, ongoing treatment, etc."
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Psychological / behavioral notes</Label>
                    <Input
                      value={form.psychologicalConditions ?? ""}
                      onChange={(e) => setForm({ ...form, psychologicalConditions: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Ever suspended / expelled? Details</Label>
                    <Input
                      value={form.suspensionDetails ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          wasSuspended: !!e.target.value,
                          suspensionDetails: e.target.value,
                        })
                      }
                      placeholder="Leave empty if no"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Reasons for applying</Label>
                    <Input
                      value={form.reasonsForApplying ?? ""}
                      onChange={(e) => setForm({ ...form, reasonsForApplying: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>How did you hear about us?</Label>
                    <Select
                      value={form.referralSource || "__none__"}
                      onValueChange={(v) =>
                        setForm({ ...form, referralSource: v === "__none__" ? "" : v })
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="ifs_parent">IFS Parent</SelectItem>
                        <SelectItem value="handbill">Handbill</SelectItem>
                        <SelectItem value="banner">Banner</SelectItem>
                        <SelectItem value="website">Website</SelectItem>
                        <SelectItem value="news_paper">News Paper</SelectItem>
                        <SelectItem value="school_board">School Board</SelectItem>
                        <SelectItem value="poster">Poster</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Avail transport?</Label>
                    <Select
                      value={form.availTransport ? "yes" : "no"}
                      onValueChange={(v) => setForm({ ...form, availTransport: v === "yes" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Student Gmail account</Label>
                    <Input
                      type="email"
                      value={form.studentGmail ?? ""}
                      onChange={(e) => setForm({ ...form, studentGmail: e.target.value })}
                      placeholder="Office-use; for the kid's school login if you provision one"
                    />
                  </div>
                </div>
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
          { key: "program", label: "Program (hifz / conventional, optional)", aliases: ["program_type"] },
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

// =============================================================================
// GuardianBlock — one Family Information column from the IFS form.
//
// Renders ALL the per-person attributes (title, NIC, addresses, phones,
// occupation, employer) plus per-link role-flag checkboxes (primary
// contact, fee payer, pickup auth, etc.). Kept inline rather than
// extracted to a separate file because it's only used by the Add
// Student dialog — moving it out would pull more state plumbing than
// it saves in lines.
// =============================================================================
interface GuardianBlockProps {
  value: GuardianInput;
  onChange: (g: GuardianInput) => void;
  title: string;
  tone: "indigo" | "rose" | "slate";
  /** Only the "Other guardian" slot lets the admin change the role.
   *  Father / Mother stay fixed so the role-aware defaults (mother =
   *  emergency contact, father = primary, etc.) hold. */
  allowRoleChange?: boolean;
  onRemove?: () => void;
}

function GuardianBlock({
  value,
  onChange,
  title,
  tone,
  allowRoleChange,
  onRemove,
}: GuardianBlockProps) {
  const palette = {
    indigo: "border-indigo-200 bg-indigo-50/40",
    rose: "border-rose-200 bg-rose-50/40",
    slate: "border-slate-200 bg-slate-50/40",
  }[tone];
  const headerColor = {
    indigo: "text-indigo-900",
    rose: "text-rose-900",
    slate: "text-slate-900",
  }[tone];
  // Centralized setter — saves the .value mutation boilerplate in every
  // input handler below.
  const set = (patch: Partial<GuardianInput>) => onChange({ ...value, ...patch });

  return (
    <div className={`rounded-lg border ${palette} p-3 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-sm font-semibold ${headerColor}`}>{title}</div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] text-slate-500 hover:underline"
          >
            Remove
          </button>
        )}
      </div>

      {/* Name + title + role on one row to keep the block compact */}
      <div className="grid gap-2 sm:grid-cols-12">
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Title</Label>
          <Select
            value={value.title || "__none__"}
            onValueChange={(v) => set({ title: v === "__none__" ? "" : (v as any) })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              <SelectItem value="Mr.">Mr.</SelectItem>
              <SelectItem value="Mrs.">Mrs.</SelectItem>
              <SelectItem value="Ms.">Ms.</SelectItem>
              <SelectItem value="Dr.">Dr.</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={allowRoleChange ? "sm:col-span-7" : "sm:col-span-10"}>
          <Label className="text-[11px]">Full name</Label>
          <Input
            value={value.fullName ?? ""}
            onChange={(e) => set({ fullName: e.target.value })}
            className="h-8 text-xs"
            placeholder="Full name as on NIC"
          />
        </div>
        {allowRoleChange && (
          <div className="sm:col-span-3">
            <Label className="text-[11px]">Relationship</Label>
            <Select
              value={value.parentRole || "guardian"}
              onValueChange={(v) => set({ parentRole: v as any })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="guardian">Guardian</SelectItem>
                <SelectItem value="step_father">Step-father</SelectItem>
                <SelectItem value="step_mother">Step-mother</SelectItem>
                <SelectItem value="grandparent">Grandparent</SelectItem>
                <SelectItem value="sibling">Sibling</SelectItem>
                <SelectItem value="sponsor">Sponsor</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[11px]">CNIC number</Label>
          <Input
            value={value.nic ?? ""}
            onChange={(e) => set({ nic: e.target.value })}
            className="h-8 text-xs"
            placeholder="42101-1234567-1"
          />
        </div>
        <div>
          <Label className="text-[11px]">Cell phone</Label>
          <Input
            value={value.cellPhone ?? ""}
            onChange={(e) => set({ cellPhone: e.target.value })}
            className="h-8 text-xs"
            placeholder="+92 300 1234567"
          />
        </div>
        <div>
          <Label className="text-[11px]">Home phone</Label>
          <Input
            value={value.homePhone ?? ""}
            onChange={(e) => set({ homePhone: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px]">Email</Label>
          <Input
            type="email"
            value={value.email ?? ""}
            onChange={(e) => set({ email: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[11px]">Home address</Label>
          <Input
            value={value.homeAddress ?? ""}
            onChange={(e) => set({ homeAddress: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px]">Occupation</Label>
          <Input
            value={value.occupation ?? ""}
            onChange={(e) => set({ occupation: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px]">Employer</Label>
          <Input
            value={value.employer ?? ""}
            onChange={(e) => set({ employer: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px]">Employer address</Label>
          <Input
            value={value.employerAddress ?? ""}
            onChange={(e) => set({ employerAddress: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[11px]">Business phone</Label>
          <Input
            value={value.businessPhone ?? ""}
            onChange={(e) => set({ businessPhone: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Per-link role flags — what THIS guardian does for THIS student.
          Different from the parent's identity (a father can be the fee
          payer for kid A and not for kid B). */}
      <div className="rounded-md bg-white/60 p-2 border border-slate-200">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
          Role for this student
        </div>
        <div className="grid grid-cols-2 gap-1 text-xs">
          {(
            [
              ["isPrimaryContact", "Primary contact"],
              ["isEmergencyContact", "Emergency contact"],
              ["isFeePayer", "Fee responsible"],
              ["isPickupAuthorized", "Pickup authorized"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!value[key]}
                onChange={(e) => set({ [key]: e.target.checked } as Partial<GuardianInput>)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-2">
          <Label className="text-[11px]">Parent portal sign-in phone (optional)</Label>
          <Input
            value={value.portalAccessPhone ?? ""}
            onChange={(e) => set({ portalAccessPhone: e.target.value })}
            className="h-8 text-xs"
            placeholder="Defaults to cell phone above"
          />
        </div>
      </div>
    </div>
  );
}
