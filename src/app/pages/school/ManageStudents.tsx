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
import { Plus, Upload, Search, Trash2, Pencil, Eye, MessageSquare, UserMinus, UserPlus, MoreHorizontal, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Checkbox } from "../../components/ui/checkbox";
import { BehaviorLogEntry } from "./BehaviorLogEntry";
import { DataTable, sectionTitleClasses, type DataTableColumn, NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  listClasses,
  listStudents,
  getNextGrNumber,
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

type SectionOption = { id: string; label: string; className: string; sectionName: string; classId: string; classKind?: string };

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
  // Rollup chips (design 1b) replace the old Active/Left/All select.
  const [chipFilter, setChipFilter] = useState<"all" | "pending" | "noparent" | "unassigned" | "left" | "hifz">("all");
  // Bulk-select bar state + kebab-menu dialog targets.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AdminStudent | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveSectionId, setMoveSectionId] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
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
    // Whole roster in one call (500-cap covers the pilot's 394): the 1a
    // class rail needs per-section counts whatever is selected, so the
    // section filter is applied client-side.
    listStudents(orgId, {
      search: search || undefined,
    }).then(setStudents).catch((e) => setError(e?.message || "Failed to load students"));
  };

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listHifzGroups(orgId).then(setHifzGroups).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, search]);

  // Design 3a: "+ Admit a sibling (parents pre-filled)" arrives here as
  // ?admitSibling=<studentId> — load that student's linked parents into
  // the father/mother/guardian slots and open the admission form.
  useEffect(() => {
    const sibOf = searchParams.get("admitSibling");
    if (!sibOf || !orgId) return;
    getStudent(orgId, sibOf)
      .then((st) => {
        setEditing(null);
        setForm({ ...emptyForm, classSectionId: st.class_section_id ?? "" });
        resetGuardianForms();
        const fill = (p: (typeof st.parents)[number], role: GuardianInput["parentRole"]): GuardianInput => ({
          ...emptyGuardian(role),
          fullName: p.full_name ?? "",
          cellPhone: p.phone ?? "",
          email: p.email ?? "",
        });
        const rest: Array<(typeof st.parents)[number]> = [];
        for (const par of st.parents) {
          const rel = (par.relationship ?? "").toLowerCase();
          if (rel.includes("father") && !rel.includes("step")) setFather(fill(par, "father"));
          else if (rel.includes("mother") && !rel.includes("step")) setMother(fill(par, "mother"));
          else rest.push(par);
        }
        if (rest.length > 0) {
          setOtherGuardian(fill(rest[0], "guardian"));
          setOtherGuardianOpen(true);
        }
        setFormOpen(true);
        toast.success(`Admission form pre-filled with ${st.full_name}'s parents.`);
      })
      .catch(() => toast.error("Could not load the sibling's family."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const sectionOptions: SectionOption[] = useMemo(() => {
    const out: SectionOption[] = [];
    for (const c of classes) for (const s of c.sections || []) {
      out.push({ id: s.id, label: `${c.name} - ${s.name}`, className: c.name, sectionName: s.name, classId: c.id, classKind: c.kind });
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
  const [grSuggestion, setGrSuggestion] = useState<string | null>(null);
  const [markLeftTarget, setMarkLeftTarget] = useState<AdminStudent | null>(null);
  const [leftReason, setLeftReason] = useState("");
  const [markLeftBusy, setMarkLeftBusy] = useState(false);
  const [readmitTarget, setReadmitTarget] = useState<AdminStudent | null>(null);

  // ── Roster derivations (design 1b) ────────────────────────────────
  const isPending = (st: AdminStudent) => {
    const c = (st as any).completeness_status as string | undefined;
    return !!c && c !== "complete";
  };
  const hifzSectionIds = useMemo(
    () => new Set(sectionOptions.filter((o) => o.classKind === "hifz").map((o) => o.id)),
    [sectionOptions],
  );
  const activeStudents = useMemo(() => students.filter((st) => st.status !== "withdrawn"), [students]);
  const chipCounts = useMemo(
    () => ({
      all: activeStudents.length,
      pending: activeStudents.filter(isPending).length,
      // "No guardian info" = no linked parent record AND no contact text
      // on the card — the office literally cannot reach anyone.
      noparent: activeStudents.filter(
        (st) =>
          (st.linked_parent_count ?? 0) === 0 &&
          !(st.guardian_phone || "").trim() &&
          !(st.guardian_email || "").trim(),
      ).length,
      unassigned: activeStudents.filter((st) => !st.class_section_id).length,
      left: students.length - activeStudents.length,
      hifz: activeStudents.filter((st) => st.class_section_id && hifzSectionIds.has(st.class_section_id)).length,
    }),
    [students, activeStudents, hifzSectionIds],
  );
  const visibleStudents = useMemo(() => {
    switch (chipFilter) {
      case "pending": return activeStudents.filter(isPending);
      case "noparent":
        return activeStudents.filter(
          (st) =>
            (st.linked_parent_count ?? 0) === 0 &&
            !(st.guardian_phone || "").trim() &&
            !(st.guardian_email || "").trim(),
        );
      case "unassigned": return activeStudents.filter((st) => !st.class_section_id);
      case "left": return students.filter((st) => st.status === "withdrawn");
      case "hifz": return activeStudents.filter((st) => st.class_section_id && hifzSectionIds.has(st.class_section_id));
      default: return activeStudents;
    }
  }, [chipFilter, students, activeStudents, hifzSectionIds]);
  // Groups follow the sort: by section normally, A–Z letter groups while
  // searching, one flat group for the Left chip.
  // Section filter applies client-side (1a rail keeps live counts).
  const sectionScoped = useMemo(
    () =>
      sectionFilter === "__all__"
        ? visibleStudents
        : visibleStudents.filter(
            (st) => (st.class_section_id ?? st.left_from_section_id) === sectionFilter,
          ),
    [visibleStudents, sectionFilter],
  );
  const rosterGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; meta: string; rows: AdminStudent[] }> = [];
    if (search.trim()) {
      const byLetter = new Map<string, AdminStudent[]>();
      for (const st of [...sectionScoped].sort((a, b) => a.full_name.localeCompare(b.full_name))) {
        const L = (st.full_name[0] || "#").toUpperCase();
        byLetter.set(L, [...(byLetter.get(L) ?? []), st]);
      }
      for (const [L, rows] of byLetter) groups.push({ key: L, label: L, meta: `${rows.length}`, rows });
      return groups;
    }
    if (chipFilter === "left") {
      if (sectionScoped.length > 0)
        groups.push({ key: "left", label: "Left", meta: `${sectionScoped.length} students`, rows: sectionScoped });
      return groups;
    }
    const bySection = new Map<string, AdminStudent[]>();
    for (const st of sectionScoped) {
      const k = st.class_section_id || "__none__";
      bySection.set(k, [...(bySection.get(k) ?? []), st]);
    }
    for (const o of sectionOptions) {
      const rows = bySection.get(o.id);
      if (rows) groups.push({ key: o.id, label: o.label, meta: `${rows.length} students`, rows });
    }
    const none = bySection.get("__none__");
    if (none) groups.push({ key: "__none__", label: "No section assigned", meta: `${none.length} students`, rows: none });
    return groups;
  }, [sectionScoped, sectionOptions, search, chipFilter]);

  // 1a rail: per-section counts that track the active chip filter, plus
  // an amber dot on sections holding pending admissions.
  const railRows = useMemo(
    () =>
      sectionOptions.map((o) => {
        const inSec = visibleStudents.filter(
          (st) => (st.class_section_id ?? st.left_from_section_id) === o.id,
        );
        return {
          ...o,
          count: inSec.length,
          hasPending: inSec.some(isPending),
        };
      }),
    [sectionOptions, visibleStudents],
  );

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
    // Pre-fill the next GR number in the org's sequence (editable).
    setGrSuggestion(null);
    getNextGrNumber(orgId)
      .then((r) => {
        if (!r.suggested) return;
        setGrSuggestion(r.suggested);
        setForm((f) => (f.grNumber ? f : { ...f, grNumber: r.suggested! }));
      })
      .catch(() => {});
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

  // Typed-confirmation delete (design 1b): the dialog requires typing
  // the student's name — a browser confirm() was one mis-click away
  // from destroying a record and its history.
  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteStudent(orgId, deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.full_name}`);
      setDeleteTarget(null);
      setDeleteText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the student.");
    } finally {
      setDeleteBusy(false);
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


  const AV_COLORS = ["#6366f1", "#0ea5e9", "#8b5cf6", "#14b8a6", "#f43f5e", "#f59e0b", "#64748b"];
  const avColor = (name: string) =>
    AV_COLORS[Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
  const initialsOf = (name: string) =>
    name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── Bulk actions (bar appears on select) ──────────────────────────
  const selectedRows = students.filter((st) => selected.has(st.id));
  const bulkMove = async () => {
    if (!moveSectionId) return;
    setMoveBusy(true);
    let ok = 0, failed = 0;
    for (const st of selectedRows) {
      try {
        await updateStudent(orgId, st.id, { classSectionId: moveSectionId } as any);
        ok++;
      } catch { failed++; }
    }
    setMoveBusy(false);
    setMoveOpen(false);
    setSelected(new Set());
    toast[failed > 0 ? "error" : "success"](
      `Moved ${ok} student${ok === 1 ? "" : "s"}${failed > 0 ? ` · ${failed} failed` : ""}.`,
    );
    refresh();
  };
  const bulkCopyGuardians = async () => {
    const lines = selectedRows
      .map((st) => `${st.full_name}: ${st.guardian_phone || "no phone on file"}`)
      .join(String.fromCharCode(10));
    try {
      await navigator.clipboard.writeText(lines);
      toast.success(`${selectedRows.length} guardian contact${selectedRows.length === 1 ? "" : "s"} copied — paste into WhatsApp.`);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  };
  const bulkExportCsv = () => {
    const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
    const rows = [
      ["Name", "GR#", "Section", "Guardian phone", "Status"].join(","),
      ...selectedRows.map((st) =>
        [
          esc(st.full_name), esc(st.gr_number),
          esc(sectionOptions.find((o) => o.id === st.class_section_id)?.label || ""),
          esc(st.guardian_phone || ""), esc(st.status || "active"),
        ].join(","),
      ),
    ].join(String.fromCharCode(10));
    const url = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "students.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <div className={sectionTitleClasses}>Students</div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-semibold tabular-nums text-slate-700">{chipCounts.all}</span> active
            {chipCounts.pending > 0 && <span className="font-medium text-amber-700"> · {chipCounts.pending} pending</span>}
            {chipCounts.left > 0 && <span className="text-slate-400"> · {chipCounts.left} left</span>}
          </p>
        </div>
        <div className="flex gap-2">
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
          <SelectTrigger className="h-9 w-56 lg:hidden"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sections</SelectItem>
            {sectionOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rollup chips (design 1b): the roster's exceptions are filters. */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "all", label: `All ${chipCounts.all}`, active: "bg-slate-900 text-white", idle: "border border-slate-200 bg-white text-slate-600" },
            { key: "pending", label: `Guardians pending ${chipCounts.pending}`, active: "bg-amber-500 text-white", idle: "border border-amber-200 bg-white text-amber-800" },
            { key: "noparent", label: `No guardian info ${chipCounts.noparent}`, active: "bg-rose-600 text-white", idle: "border border-rose-200 bg-white text-rose-700" },
            { key: "unassigned", label: `Unassigned ${chipCounts.unassigned}`, active: "bg-slate-900 text-white", idle: "border border-slate-200 bg-white text-slate-600" },
            { key: "left", label: `Left ${chipCounts.left}`, active: "bg-slate-900 text-white", idle: "border border-slate-200 bg-white text-slate-600" },
            { key: "hifz", label: `Hifz ${chipCounts.hifz}`, active: "bg-slate-900 text-white", idle: "border border-slate-200 bg-white text-slate-600" },
          ] as const
        ).map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChipFilter(c.key)}
            className={
              "min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold transition-colors " +
              (chipFilter === c.key ? c.active : c.idle + " hover:bg-slate-50")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Page-level errors only when no dialog is open — a submit error
          while the Add/Edit dialog is up renders INSIDE the dialog
          (pilot bug: the GR-conflict message appeared behind it). */}
      {error && !formOpen && <p className="text-sm text-rose-600">{error}</p>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2">
          <span className="text-xs font-bold text-indigo-900">{selected.size} selected</span>
          <Button variant="outline" size="sm" className="h-8 border-indigo-200 bg-white text-xs text-indigo-800" onClick={() => { setMoveSectionId(""); setMoveOpen(true); }}>
            Move to section
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-indigo-200 bg-white text-xs text-indigo-800" onClick={bulkCopyGuardians}>
            Message guardians
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-indigo-200 bg-white text-xs text-indigo-800" onClick={bulkExportCsv}>
            Export CSV
          </Button>
          <button type="button" className="ml-auto text-xs text-indigo-500 hover:text-indigo-800" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="grid items-start gap-0 overflow-hidden rounded-xl border bg-white lg:grid-cols-[240px_minmax(0,1fr)]" style={{ borderColor: "rgba(20,22,58,.08)" }}>
        {/* 1a class rail — pick a class, see one roster at a time. */}
        <div className="hidden max-h-[70vh] flex-col gap-0.5 overflow-y-auto border-r border-slate-100 p-2.5 lg:flex">
          <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Classes</div>
          <button
            type="button"
            onClick={() => setSectionFilter("__all__")}
            className={
              "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] " +
              (sectionFilter === "__all__" ? "bg-indigo-50 font-bold text-indigo-900" : "text-slate-700 hover:bg-slate-50")
            }
          >
            <span>All students</span>
            <span className="text-xs text-slate-400 tabular-nums">{visibleStudents.length}</span>
          </button>
          {railRows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSectionFilter(r.id)}
              className={
                "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] " +
                (sectionFilter === r.id ? "bg-indigo-50 font-bold text-indigo-900" : "text-slate-700 hover:bg-slate-50")
              }
            >
              <span className="truncate">{r.label}</span>
              <span className="flex flex-none items-center gap-1.5">
                {r.hasPending && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="pending admissions" />
                )}
                <span className="text-xs text-slate-400 tabular-nums">{r.count}</span>
              </span>
            </button>
          ))}
          <div className="mt-2 border-t border-slate-100 px-2.5 pt-2 text-[11px] leading-relaxed text-slate-400">
            Amber dot = pending admissions. Counts follow the active filter chip.
          </div>
        </div>
        <div className="min-w-0">
        {rosterGroups.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">No students here yet</p>
            <p className="mt-1 text-xs text-slate-500">Add your first student, or import the whole roster from a spreadsheet.</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={startCreate}>
                <Plus className="mr-1 h-4 w-4" /> Add Student
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
                <Upload className="mr-1 h-4 w-4" /> Bulk CSV
              </Button>
            </div>
          </div>
        ) : (
          rosterGroups.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600">{g.label}</span>
                <span className="text-[11px] text-slate-400">{g.meta}</span>
                {sectionOptions.some((o) => o.id === g.key) && (
                  <Link
                    to={`/school/orgs/${orgId}/sections/${g.key}`}
                    className="ml-auto text-[11px] font-semibold text-indigo-600 hover:underline"
                  >
                    Section dashboard →
                  </Link>
                )}
              </div>
              {g.rows.map((st) => {
                const pending = isPending(st);
                const pill =
                  st.status === "withdrawn"
                    ? { cls: "bg-slate-200 text-slate-600", label: "Left" }
                    : pending
                      ? { cls: "bg-amber-100 text-amber-800", label: ((st as any).completeness_status === "documents_pending" ? "Documents pending" : (st as any).completeness_status === "fees_pending" ? "Fees pending" : "Guardians pending") }
                      : { cls: "bg-emerald-50 text-emerald-700", label: "Complete" };
                return (
                  <div
                    key={st.id}
                    onClick={() => navigate(`/school/orgs/${orgId}/admin/students/${st.id}`)}
                    className="grid min-h-[48px] cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto_36px] items-center gap-3 border-b border-slate-50 px-4 py-1.5 transition-colors hover:bg-slate-50 sm:grid-cols-[24px_minmax(0,1fr)_80px_150px_130px_36px]"
                  >
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                      <Checkbox checked={selected.has(st.id)} onCheckedChange={() => toggleSelect(st.id)} aria-label={`Select ${st.full_name}`} />
                    </span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: avColor(st.full_name) }}
                      >
                        {initialsOf(st.full_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{st.full_name}</span>
                        <span className="block truncate text-[11.5px] text-slate-400">
                          {st.status === "withdrawn" && st.left_reason ? st.left_reason : st.guardian_phone || st.guardian_email || "no guardian contact"}
                        </span>
                      </span>
                    </span>
                    <span className="hidden font-mono text-xs text-slate-600 tabular-nums sm:block">{st.gr_number}</span>
                    <span className="hidden truncate text-xs text-slate-500 sm:block">
                      {search.trim() || chipFilter === "left"
                        ? sectionOptions.find((o) => o.id === (st.class_section_id || st.left_from_section_id))?.label || "—"
                        : st.guardian_phone || "—"}
                    </span>
                    <span className="justify-self-start">
                      <span className={"inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold " + pill.cls}>{pill.label}</span>
                    </span>
                    <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Actions">
                            <MoreHorizontal className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => navigate(`/school/orgs/${orgId}/admin/students/${st.id}`)}>
                            <Eye className="mr-2 h-3.5 w-3.5" /> Open
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => startEdit(st)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setBehaviorTarget(st)}>
                            <MessageSquare className="mr-2 h-3.5 w-3.5" /> Log behavior
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {st.status === "withdrawn" ? (
                            <DropdownMenuItem onClick={() => setReadmitTarget(st)}>
                              <UserPlus className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Re-admit
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="text-amber-700" onClick={() => { setLeftReason(""); setMarkLeftTarget(st); }}>
                              <UserMinus className="mr-2 h-3.5 w-3.5" /> Mark as left…
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-rose-600" onClick={() => { setDeleteText(""); setDeleteTarget(st); }}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete permanently…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
        </div>
      </div>

      {/* Typed-confirmation delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete permanently</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 pt-1">
              <p className="text-sm text-slate-600">
                This permanently deletes <strong>{deleteTarget.full_name}</strong> (GR# {deleteTarget.gr_number}) and cannot be undone.
                If the student left the school, use <em>Mark as left</em> instead — that keeps their history.
              </p>
              <div>
                <Label className="text-xs text-slate-500">Type the student&apos;s name to confirm</Label>
                <Input
                  className="mt-1 h-9"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder={deleteTarget.full_name}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteText(""); }} disabled={deleteBusy}>
                  Cancel
                </Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-700"
                  disabled={deleteBusy || deleteText.trim().toLowerCase() !== deleteTarget.full_name.trim().toLowerCase()}
                  onClick={performDelete}
                >
                  {deleteBusy ? "Deleting…" : "Delete permanently"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk move-to-section */}
      <Dialog open={moveOpen} onOpenChange={(o) => { if (!o) setMoveOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move {selected.size} student{selected.size === 1 ? "" : "s"} to a section</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Select value={moveSectionId} onValueChange={setMoveSectionId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choose a section…" /></SelectTrigger>
              <SelectContent>
                {sectionOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={moveBusy}>Cancel</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={bulkMove} disabled={moveBusy || !moveSectionId}>
                {moveBusy ? "Moving…" : "Move"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

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
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setError(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit student" : "Add student"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>GR#*</Label>
              <Input value={form.grNumber} onChange={(e) => setForm({ ...form, grNumber: e.target.value })} />
              {!editing && grSuggestion && form.grNumber === grSuggestion && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Next in sequence (last used: {Number(grSuggestion) - 1}). Change it if this student has a different GR#.
                </p>
              )}
            </div>
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

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
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
