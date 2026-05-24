// Permissions matrix. Principal-only. Rows = permission keys, columns =
// role templates. Each cell is a checkbox; "Save" sends the full state
// back to the server as overrides (the server diffs against defaults).

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { ShieldCheck } from "lucide-react";
import {
  HeroCard,
  cardBase,
  cardElev,
  accentBg,
  accentBorder,
} from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgPrincipal,
  getPermissions,
  updatePermissions,
  type PermissionRow,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

const ROLE_COLUMNS: Array<{ key: PermissionRow["roleTemplate"]; label: string }> = [
  { key: "admin", label: "Admin" },
  { key: "class_teacher", label: "Class Teacher" },
  { key: "visiting_teacher", label: "Visiting Teacher" },
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

  const permissionKeys = useMemo(
    () => Array.from(new Set(rows.map((r) => r.permissionKey))).sort(),
    [rows],
  );

  if (meLoading) return null;
  if (!isOrgPrincipal(me, orgId)) return <Navigate to={`/school/orgs/${orgId}/admin`} replace />;

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
        subtitle="Toggle what each role can do — saved as overrides to the system defaults"
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
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
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
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{pk}</td>
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
