// Permissions matrix. Principal-only. Rows = permission keys, columns =
// role templates. Each cell is a checkbox; "Save" sends the full state
// back to the server as overrides (the server diffs against defaults).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { ShieldCheck, Info } from "lucide-react";
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

const PERMISSION_META: Record<string, { label: string; description: string }> = {
  manage_students: {
    label: "Manage students",
    description: "Add, edit, and delete student records. Includes bulk CSV upload.",
  },
  mark_attendance: {
    label: "Mark attendance",
    description: "Take daily attendance for a section (present / late / absent / excused).",
  },
  edit_grades: {
    label: "Edit grades",
    description: "Create assignments and enter / edit grades for students.",
  },
  mark_fees_status: {
    label: "Mark fees status",
    description: "Update fee status (paid / unpaid / partial / waived) and attach receipts.",
  },
  create_forms: {
    label: "Create forms",
    description: "Build and publish custom forms — permission slips, surveys, info collection.",
  },
  define_curriculum: {
    label: "Define curriculum",
    description: "Set up the per-section yearly curriculum and topics.",
  },
  manage_teachers: {
    label: "Manage teachers",
    description: "Add, edit, and assign teachers to class sections.",
  },
  view_all_classes: {
    label: "View all classes",
    description: "See all classes in the school (not just the user's own section).",
  },
  manage_public_site: {
    label: "Manage public site",
    description: "Edit the school's public marketing page — hero, faculty wall, gallery, contact.",
  },
};

function prettify(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const ROLE_COLUMNS: Array<{ key: PermissionRow["roleTemplate"]; label: string }> = [
  { key: "admin", label: "Admin" },
  { key: "class_teacher", label: "Class Teacher" },
  { key: "visiting_teacher", label: "Visiting Teacher" },
  { key: "financial_staff", label: "Financial Staff" },
  { key: "office_staff", label: "Office / Reception" },
];

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
        .sort(),
    [rows],
  );

  if (meLoading) return null;
  if (!isOrgPrincipal(me, orgId)) return <NoAccessRedirect to={`/school/orgs/${orgId}/admin`} message="Only the principal can edit role permissions." />;

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
        subtitle="Toggle what each role can do — saved as overrides to the system defaults. Incharge isn't listed: an incharge's access comes from their wing (People → Teachers → crown icon), not org-wide toggles."
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
        <table className="w-full min-w-[640px] text-sm border-collapse">
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
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
