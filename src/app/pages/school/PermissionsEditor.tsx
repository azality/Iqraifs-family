// Permissions — principal-only. Two parts:
//
//  1. The configurable matrix: rows = permission keys, columns = role
//     templates. "Save" sends the full state back as overrides (the server
//     diffs against defaults). Incharge cells are WING-scoped: they only
//     apply inside the incharge's own wing, and only keys whose routes
//     honour the wing (WING_SCOPED_KEYS) can be toggled.
//
//  2. "Fixed by role": everything the app gates with hardcoded role checks
//     rather than a key. The page used to show only the matrix, which read
//     as the whole story while ~25 features sat outside it (permissions
//     audit, 16 Sep). Keep this list in step with the backend gates.

import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { ShieldCheck, Info, Lock } from "lucide-react";
import {
  HeroCard,
  cardBase,
  cardElev,
  accentBg,
  accentBorder,
  NoAccessRedirect,
} from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgPrincipal,
  getPermissions,
  updatePermissions,
  type PermissionRow,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { WING_SCOPED_KEYS } from "../../../lib/rolePermissions";

const PERMISSION_META: Record<string, { label: string; description: string }> = {
  manage_students: {
    label: "Manage students & families",
    description:
      "Add, edit and remove students and parents, link families, bulk upload, and issue PIN logins and PIN slips.",
  },
  mark_attendance: {
    label: "Bulk attendance & office roll call",
    description:
      "Import attendance in bulk, and lets office staff take roll call for any section. Teachers and incharges always take roll call for their own sections, whatever this says.",
  },
  edit_grades: {
    label: "Grade assignments",
    description:
      "Enter and edit grades on assignments, for sections the person teaches. Exam marks and sign-off are separate — see Fixed by role below.",
  },
  mark_fees_status: {
    label: "Record fees",
    description:
      "Record fee payments, fee plans and per-student overrides. Deleting a fee record stays principal/admin only.",
  },
  create_forms: {
    label: "Create forms",
    description:
      "Build and publish forms — permission slips, surveys. Teachers can only send forms to sections they teach.",
  },
  define_curriculum: {
    label: "Define curriculum",
    description:
      "Class subjects, marks split, syllabus topics and resources, and Upload syllabus. For Incharge: only their own wing's syllabus topics and uploads — not the subject list.",
  },
  manage_teachers: {
    label: "Add & remove staff",
    description: "Add staff, remove them, and resend invites.",
  },
  view_all_classes: {
    label: "View all classes",
    description: "See all classes in the school (not just the user's own section).",
  },
  manage_public_site: {
    label: "Manage public site",
    description: "Edit the school's public page — hero, faculty wall, gallery, contact.",
  },
};

function prettify(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const ROLE_COLUMNS: Array<{ key: PermissionRow["roleTemplate"]; label: string; hint?: string }> = [
  { key: "admin", label: "Admin" },
  {
    key: "incharge",
    label: "Incharge",
    hint: "own wing",
  },
  { key: "class_teacher", label: "Class Teacher" },
  { key: "visiting_teacher", label: "Visiting Teacher" },
  { key: "financial_staff", label: "Financial Staff" },
  { key: "office_staff", label: "Office / Reception" },
];

// ─── Fixed by role ────────────────────────────────────────────────────
// y = yes · wing = incharge's own wing only · own = their own sections /
// subjects / records · n = no. "Teachers" covers class, subject, visiting
// and hifz teachers acting on sections they teach.
type Access = "y" | "wing" | "own" | "n";
const FIXED_COLUMNS = ["Principal", "Admin", "Incharge", "Teachers", "Office", "Finance"] as const;

const FIXED_FEATURES: Array<{ area: string; rows: Array<{ feature: string; note?: string; access: Access[] }> }> = [
  {
    area: "School structure",
    rows: [
      { feature: "Classes, sections & class teachers", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "Hifz groups", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "Timetable, bell schedules & substitutions", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "Terms, datesheets & exams", access: ["y", "y", "n", "n", "n", "n"] },
    ],
  },
  {
    area: "Staff",
    rows: [
      { feature: "Incharge wings, staff profiles & password resets", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "Add or remove admins", access: ["y", "n", "n", "n", "n", "n"] },
      { feature: "Approve or reject time off", access: ["y", "y", "n", "n", "n", "n"] },
    ],
  },
  {
    area: "Daily teaching",
    rows: [
      { feature: "Roll call for a section", note: "Office needs Bulk attendance & office roll call", access: ["y", "y", "wing", "own", "y", "n"] },
      { feature: "Lessons & assignments", access: ["y", "y", "wing", "own", "n", "n"] },
      { feature: "Behaviour notes", access: ["y", "y", "wing", "own", "y", "n"] },
      { feature: "Hifz log (sabaq, sabqi, manzil)", access: ["y", "y", "wing", "own", "n", "n"] },
      { feature: "Early release & resolving attendance flags", note: "Teachers: class & hifz teacher of the section", access: ["y", "y", "n", "own", "y", "n"] },
      { feature: "Request roster changes", access: ["y", "y", "wing", "own", "y", "n"] },
      { feature: "Approve roster changes", access: ["y", "y", "n", "n", "n", "n"] },
    ],
  },
  {
    area: "Exams & report cards",
    rows: [
      { feature: "Enter exam marks & sign off a column", note: "Teachers: class teacher all columns, subject teacher their own", access: ["y", "y", "n", "own", "n", "n"] },
      { feature: "Tabulation sheet", note: "Teachers: class & hifz teacher of the section", access: ["y", "y", "wing", "own", "n", "n"] },
      { feature: "Report card comments", note: "Teachers: class teacher; principal's comment is principal/admin", access: ["y", "y", "n", "own", "n", "n"] },
      { feature: "Finalize & publish report cards, grade scales", access: ["y", "y", "n", "n", "n", "n"] },
    ],
  },
  {
    area: "Communication",
    rows: [
      { feature: "Announcements", note: "Teachers: to their own sections or students", access: ["y", "y", "n", "own", "n", "n"] },
      { feature: "Parent inbox", access: ["y", "y", "n", "n", "y", "n"] },
    ],
  },
  {
    area: "Money & settings",
    rows: [
      { feature: "Delete a fee record", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "School settings — branding, hours, bank accounts, points league, photo-read limit", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "Behaviour categories", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "Year rollover, audit log, import rollback", access: ["y", "y", "n", "n", "n", "n"] },
      { feature: "This permissions page, school name, ownership", access: ["y", "n", "n", "n", "n", "n"] },
    ],
  },
];

function AccessCell({ a }: { a: Access }) {
  if (a === "y") return <span className="text-emerald-700 font-semibold">✓</span>;
  if (a === "wing")
    return <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-700">wing</span>;
  if (a === "own")
    return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">own</span>;
  return <span className="text-slate-300">—</span>;
}

export function PermissionsEditor() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    getPermissions(orgId).then(setRows).catch((e) => setError(e?.message || "Failed"));
  }, [orgId]);

  const keyed = useMemo(() => {
    const map = new Map<string, PermissionRow>();
    rows.forEach((r) => map.set(`${r.permissionKey}::${r.roleTemplate}`, r));
    return map;
  }, [rows]);

  // view_all_classes is hidden until an endpoint actually enforces it —
  // showing a toggle that does nothing erodes trust in the whole matrix.
  // Re-add to the editor when read-scoping lands.
  const HIDDEN_KEYS = new Set(["view_all_classes"]);
  const permissionKeys = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.permissionKey)))
        .filter((k) => !HIDDEN_KEYS.has(k))
        .sort((a, b) => (PERMISSION_META[a]?.label ?? a).localeCompare(PERMISSION_META[b]?.label ?? b)),
    [rows],
  );

  if (meLoading) return null;
  if (!isOrgPrincipal(me, orgId)) return <NoAccessRedirect to={`/school/orgs/${orgId}/admin`} message="Only the principal can edit role permissions." />;

  const cellEditable = (pk: string, role: string) =>
    role !== "incharge" || (WING_SCOPED_KEYS as string[]).includes(pk);

  const toggle = (permissionKey: string, roleTemplate: PermissionRow["roleTemplate"]) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.permissionKey === permissionKey && r.roleTemplate === roleTemplate);
      if (idx === -1) {
        return [...prev, { permissionKey, roleTemplate, allowed: true }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], allowed: !next[idx].allowed };
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePermissions(orgId, rows);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title="Role permissions"
        subtitle="Switch on what each role can do. Incharge switches apply only inside that person's own wing — set wings under People → Teachers → crown icon. Features that can't be switched yet are listed under Fixed by role."
        rightSlot={
          <div className="flex gap-2 items-center">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/20 px-2 py-0.5 text-xs text-white">
              <ShieldCheck className="h-3 w-3" /> Principal only
            </span>
            {savedAt && !dirty && <span className="text-xs text-emerald-300">Saved.</span>}
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
            </Link>
            <Button size="sm" disabled={!dirty || saving} onClick={handleSave} className="bg-white text-slate-900 hover:bg-slate-100">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className={`${cardBase} ${cardElev} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-sm border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Permission
              </th>
              {ROLE_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center"
                >
                  {c.label}
                  {c.hint && (
                    <span className="block text-[9.5px] font-semibold normal-case tracking-normal text-indigo-600">
                      {c.hint}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissionKeys.length === 0 && (
              <tr>
                <td colSpan={ROLE_COLUMNS.length + 1} className="px-3 py-8 text-center text-sm text-slate-500">
                  No permission keys returned.
                </td>
              </tr>
            )}
            {permissionKeys.map((pk) => (
              <tr key={pk} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1.5">
                    <span>{PERMISSION_META[pk]?.label || prettify(pk)}</span>
                    <span
                      title={PERMISSION_META[pk]?.description || pk}
                      className="inline-flex items-center text-slate-400 hover:text-slate-600 cursor-help"
                      aria-label={PERMISSION_META[pk]?.description || pk}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </td>
                {ROLE_COLUMNS.map((col) => {
                  if (!cellEditable(pk, col.key)) {
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-2 text-center"
                        title="Not available for wings yet — this permission works school-wide only."
                      >
                        <span className="text-slate-300">—</span>
                      </td>
                    );
                  }
                  const row = keyed.get(`${pk}::${col.key}`);
                  const checked = !!row?.allowed;
                  return (
                    <td
                      key={col.key}
                      className={
                        "px-3 py-2 text-center transition-colors " +
                        (checked ? `${accentBg} ${accentBorder} border-x` : "")
                      }
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(pk, col.key)}
                        aria-label={`${PERMISSION_META[pk]?.label || prettify(pk)} — ${col.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${cardBase} ${cardElev}`}>
        <div className="flex items-start gap-2 border-b border-slate-100 px-4 py-3">
          <Lock className="mt-0.5 h-4 w-4 flex-none text-slate-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Fixed by role</h2>
            <p className="text-xs text-slate-500">
              These follow the person's role and can't be switched on or off here yet.{" "}
              <b className="font-semibold text-indigo-700">wing</b> = only inside their own wing ·{" "}
              <b className="font-semibold text-amber-800">own</b> = only sections or subjects they teach.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Feature
                </th>
                {FIXED_COLUMNS.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIXED_FEATURES.map((group) => (
                <Fragment key={group.area}>
                  <tr className="border-t border-slate-100">
                    <td
                      colSpan={FIXED_COLUMNS.length + 1}
                      className="bg-slate-50/60 px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      {group.area}
                    </td>
                  </tr>
                  {group.rows.map((r) => (
                    <tr key={`${group.area}:${r.feature}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700">
                        {r.feature}
                        {r.note && <span className="block text-[11px] text-slate-400">{r.note}</span>}
                      </td>
                      {r.access.map((a, i) => (
                        <td key={i} className="px-3 py-2 text-center">
                          <AccessCell a={a} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
