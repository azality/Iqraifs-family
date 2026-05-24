// Permissions matrix. Principal-only. Rows = permission keys, columns =
// role templates. Each cell is a checkbox; "Save" sends the full state
// back to the server as overrides (the server diffs against defaults).

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { ShieldCheck } from "lucide-react";
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-indigo-600" /> Permissions
        </h1>
        <div className="flex gap-2 items-center">
          {savedAt && !dirty && <span className="text-xs text-green-600">Saved.</span>}
          <Link to={`/school/orgs/${orgId}/admin`}><Button variant="outline" size="sm">← Admin</Button></Link>
          <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Toggle what each role can do. Changes are saved as overrides to the system defaults.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-xs">Permission</th>
                {ROLE_COLUMNS.map((c) => (
                  <th key={c.key} className="p-3 text-xs text-center">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionKeys.length === 0 && (
                <tr><td colSpan={ROLE_COLUMNS.length + 1} className="p-6 text-center text-muted-foreground">
                  No permission keys returned.
                </td></tr>
              )}
              {permissionKeys.map((pk) => (
                <tr key={pk} className="border-t">
                  <td className="p-2 font-mono text-xs">{pk}</td>
                  {ROLE_COLUMNS.map((col) => {
                    const row = keyed.get(`${pk}::${col.key}`);
                    return (
                      <td key={col.key} className="p-2 text-center">
                        <Checkbox
                          checked={!!row?.allowed}
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
      </CardContent></Card>
    </div>
  );
}
