// Standalone list of unused parent-link codes for an org. Link codes
// are also generated per-student from StudentDetail; this page is the
// "see them all in one place" view.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { KeyRound, Copy, Mail } from "lucide-react";
import {
  getSchoolMe,
  isOrgAdmin,
  listLinkCodes,
  type LinkCode,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

export function LinkCodes() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [codes, setCodes] = useState<LinkCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    listLinkCodes(orgId, { unusedOnly: true }).then(setCodes).catch((e) => setError(e?.message || "Failed"));
  }, [orgId]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const copy = (s: string) => { void navigator.clipboard.writeText(s); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-indigo-600" /> Parent link codes
        </h1>
        <Link to={`/school/orgs/${orgId}/admin`}><Button variant="outline" size="sm">← Admin</Button></Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Unused codes you've generated for parents. Share via SMS, WhatsApp, or email.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left p-2">Code</th>
              <th className="text-left p-2">Student</th>
              <th className="text-left p-2">Expires</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No unused codes.</td></tr>}
            {codes.map((c) => (
              <tr key={c.code} className="border-t">
                <td className="p-2 font-mono text-base font-semibold tracking-wider text-indigo-700">{c.code}</td>
                <td className="p-2">{c.student_name || c.student_id}</td>
                <td className="p-2 text-xs text-muted-foreground">
                  {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}
                </td>
                <td className="p-2 text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copy(c.code)}><Copy className="h-3.5 w-3.5" /></Button>
                    <a href={`mailto:?subject=Your%20family%20app%20link%20code&body=Enter%20this%20code%20in%20the%20app%3A%20${c.code}`}>
                      <Button variant="ghost" size="sm"><Mail className="h-3.5 w-3.5" /></Button>
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
