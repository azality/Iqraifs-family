// Standalone list of unused parent-link codes for an org. Link codes
// are also generated per-student from StudentDetail; this page is the
// "see them all in one place" view.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Copy, Mail } from "lucide-react";
import {
  HeroCard,
  DataTable,
  cardBase,
  type DataTableColumn,
} from "../../components/school-ui";
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

  const columns: DataTableColumn<LinkCode>[] = [
    {
      key: "code",
      header: "Code",
      cell: (c) => (
        <span className="font-mono text-base font-semibold tracking-wider text-indigo-700">{c.code}</span>
      ),
    },
    {
      key: "student",
      header: "Student",
      cell: (c) => <span>{c.student_name || c.student_id}</span>,
    },
    {
      key: "expires_at",
      header: "Expires",
      cell: (c) => (
        <span className="text-xs text-slate-500">
          {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      cell: (c) => (
        <div className="inline-flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => copy(c.code)} title="Copy">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <a href={`mailto:?subject=Your%20family%20app%20link%20code&body=Enter%20this%20code%20in%20the%20app%3A%20${c.code}`}>
            <Button variant="ghost" size="sm" title="Email"><Mail className="h-3.5 w-3.5" /></Button>
          </a>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Link Codes — unused"
        subtitle="Share via SMS, WhatsApp, or email"
        rightSlot={
          <Link to={`/school/orgs/${orgId}/admin`}>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
          </Link>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className={cardBase}>
        <DataTable<LinkCode>
          columns={columns}
          rows={codes}
          rowKey={(c) => c.code}
          emptyMessage="No unused codes."
        />
      </div>
    </div>
  );
}
