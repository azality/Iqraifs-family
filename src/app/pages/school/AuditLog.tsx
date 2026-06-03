// Invite & staff-change audit log.
//
// Routed at /school/orgs/:orgId/admin/audit. Visible to principals AND admins.
// Read-only — just renders the latest 200 entries from the backend in reverse
// chronological order. Used to answer "who invited/removed whom and when".

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { HeroCard, cardBase } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  listAuditLog,
  type AuditEntry,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

const ACTION_LABELS: Record<string, string> = {
  invite_admin: "Invited admin",
  invite_teacher: "Invited teacher",
  invite_teacher_bulk: "Bulk-invited teachers",
  remove_admin: "Removed admin",
  remove_teacher: "Removed teacher",
  resend_invite: "Resent invite",
  staff_self_leave: "Left school",
  delete_school: "Deleted school",
  transfer_ownership: "Transferred ownership",
};

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AuditLog() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    listAuditLog(orgId)
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  return (
    <div className="space-y-4">
      <HeroCard
        title="Audit log"
        subtitle="Invites, removals, and other staff changes"
        rightSlot={
          <Link to={`/school/orgs/${orgId}/admin`}>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              ← Admin
            </Button>
          </Link>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className={`${cardBase} overflow-hidden`}>
        {loading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
        {!loading && entries.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No audit entries yet.</p>
        )}
        {!loading && entries.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => {
              const action = ACTION_LABELS[e.action] ?? e.action;
              const details = e.details ?? {};
              const sent = (details as any).sent;
              const reason = (details as any).reason;
              return (
                <li key={e.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-slate-800">{action}</span>
                    <span className="text-xs text-slate-500" title={new Date(e.created_at).toLocaleString()}>
                      {relativeTime(e.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    <span className="font-medium">{e.actor_email ?? e.actor_user_id.slice(0, 8)}</span>
                    {e.target_email && (
                      <>
                        {" → "}
                        <span className="font-medium">{e.target_email}</span>
                      </>
                    )}
                    {e.target_role && (
                      <span className="ml-1 text-slate-500">({e.target_role.replace(/_/g, " ")})</span>
                    )}
                  </div>
                  {(sent === false || reason) && (
                    <div className="mt-1 text-xs text-amber-700">
                      Email not sent: {String(reason ?? "unknown reason")}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Entries are append-only. The log keeps a snapshot of email addresses so
        rows remain readable even if a user is deleted later.
      </p>
    </div>
  );
}
