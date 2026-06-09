// Phase A Admin Console for a single org.
//
// Routed at /school/orgs/:orgId/admin. Lists tiles for the admin
// surfaces (classes, students, parents, teachers, link codes, and —
// principal-only — permissions). Each tile shows a live count.
//
// Gated client-side via getSchoolMe(): callers without principal/admin
// role on this org get redirected to /school. The Permissions tile is
// hidden for non-principals.

import { useEffect, useState } from "react";
import { useNavigate, Navigate, useParams } from "react-router";
import {
  Building2,
  GraduationCap,
  Users,
  Heart,
  UserCog,
  KeyRound,
  ShieldCheck,
  ClipboardList,
  Wallet,
  FileText,
  Megaphone,
  Inbox,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { HeroCard, KpiTile } from "../../components/school-ui";
import {
  getRosterRequests,
  getSchoolMe,
  isOrgAdmin,
  isOrgPrincipal,
  leaveSchool,
  listClasses,
  listStudents,
  listParents,
  listAdminTeachers,
  listLinkCodes,
  listOrgFees,
  listForms,
  getInboxUnreadCount,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

interface Tile {
  to: string;
  label: string;
  count: number | null;
  icon: typeof Building2;
  principalOnly?: boolean;
  /** If true, render the count as a red "pending" badge instead of "N total". */
  badge?: boolean;
}

export function AdminDashboard() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [counts, setCounts] = useState<{
    classes: number | null;
    students: number | null;
    parents: number | null;
    teachers: number | null;
    linkCodes: number | null;
    rosterPending: number | null;
    feesUnpaid: number | null;
    formsDraft: number | null;
    inboxUnread: number | null;
  }>({ classes: null, students: null, parents: null, teachers: null, linkCodes: null, rosterPending: null, feesUnpaid: null, formsDraft: null, inboxUnread: null });

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    // Best-effort counts; ignore individual failures so the tiles still render.
    listClasses(orgId).then((c) => setCounts((s) => ({ ...s, classes: c.length }))).catch(() => {});
    listStudents(orgId).then((s) => setCounts((cc) => ({ ...cc, students: s.length }))).catch(() => {});
    listParents(orgId).then((p) => setCounts((cc) => ({ ...cc, parents: p.length }))).catch(() => {});
    listAdminTeachers(orgId).then((t) => setCounts((cc) => ({ ...cc, teachers: t.length }))).catch(() => {});
    listLinkCodes(orgId, { unusedOnly: true })
      .then((l) => setCounts((cc) => ({ ...cc, linkCodes: l.length })))
      .catch(() => {});
    // Pending roster-change requests — drives the badge on the Roster
    // Requests tile so admins/principals see at a glance if anything is
    // waiting on them.
    getRosterRequests(orgId, { status: "pending" })
      .then((r) => setCounts((cc) => ({ ...cc, rosterPending: r.requests.length })))
      .catch(() => {});
    listOrgFees(orgId, { status: "pending" })
      .then((r) => setCounts((cc) => ({ ...cc, feesUnpaid: r.fees.length })))
      .catch(() => {});
    listForms(orgId, { status: "draft" })
      .then((r) => setCounts((cc) => ({ ...cc, formsDraft: r.forms.length })))
      .catch(() => {});
    getInboxUnreadCount(orgId)
      .then((r) => setCounts((cc) => ({ ...cc, inboxUnread: r.unreadCount })))
      .catch(() => {});
  }, [orgId]);

  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!isOrgAdmin(me, orgId)) {
    return <Navigate to="/school" replace />;
  }

  const principal = isOrgPrincipal(me, orgId);

  const tiles: Tile[] = [
    { to: `/school/orgs/${orgId}/admin/classes`, label: "Classes", count: counts.classes, icon: GraduationCap },
    { to: `/school/orgs/${orgId}/admin/students`, label: "Students", count: counts.students, icon: Users },
    { to: `/school/orgs/${orgId}/admin/parents`, label: "Parents", count: counts.parents, icon: Heart },
    { to: `/school/orgs/${orgId}/admin/teachers`, label: "Teachers", count: counts.teachers, icon: UserCog },
    { to: `/school/orgs/${orgId}/admin/link-codes`, label: "Link codes", count: counts.linkCodes, icon: KeyRound },
    { to: `/school/orgs/${orgId}/admin/roster-requests`, label: "Roster requests", count: counts.rosterPending, icon: ClipboardList, badge: true },
    { to: `/school/orgs/${orgId}/admin/fees`, label: "Fees", count: counts.feesUnpaid, icon: Wallet, badge: true },
    { to: `/school/orgs/${orgId}/admin/assessment`, label: "Assessment", count: null, icon: ClipboardList },
    { to: `/school/orgs/${orgId}/admin/inbox`, label: "Parent inbox", count: counts.inboxUnread, icon: Inbox, badge: true },
    { to: `/school/orgs/${orgId}/admin/forms`, label: "Forms", count: counts.formsDraft, icon: FileText, badge: true },
    { to: `/school/orgs/${orgId}/admin/announcements`, label: "Announcements", count: null, icon: Megaphone },
    { to: `/school/orgs/${orgId}/admin/permissions`, label: "Permissions", count: null, icon: ShieldCheck, principalOnly: true },
    { to: `/school/orgs/${orgId}/admin/settings`, label: "Settings", count: null, icon: SettingsIcon, principalOnly: true },
  ];

  const visibleTiles = tiles.filter((t) => !t.principalOnly || principal);

  return (
    <div className="space-y-5">
      <HeroCard
        eyebrow="Admin"
        title="Admin Console"
        subtitle="Manage classes, students, parents, and teachers."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleTiles.map((t) => {
          const Icon = t.icon;
          const pendingCount = t.badge && t.count !== null && t.count > 0 ? t.count : 0;
          const hint =
            t.count === null
              ? "—"
              : t.badge
              ? t.count === 0
                ? "no pending"
                : `${t.count} pending`
              : `${t.count} total`;
          return (
            <KpiTile
              key={t.to}
              variant="light"
              label={t.label}
              icon={Icon}
              value={t.count === null ? null : t.count}
              hint={hint}
              onClick={() => navigate(t.to)}
              badge={
                pendingCount > 0 ? (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white shadow">
                    {pendingCount}
                  </span>
                ) : null
              }
            />
          );
        })}
      </div>

      {/* Leave-school control. Hidden for principals — they need to either
          transfer ownership (TODO) or delete the school via Settings.
          Available to admins/teachers/staff: revokes their role, leaves their
          Supabase Auth user intact (they keep family-app access). */}
      {!principal && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Leave this school</h3>
          <p className="text-xs text-slate-600 mb-3">
            Remove yourself from this school's staff list. Your account is
            unaffected — you'll keep family-app access and any other school
            workspaces. The principal can re-invite you later if needed.
          </p>
          <Button
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={async () => {
              if (!confirm("Leave this school? This will remove your access to all of its classes, students, and admin tools. Your account itself is unaffected.")) return;
              try {
                const res = await leaveSchool(orgId);
                alert(res.message);
                navigate("/");
              } catch (e) {
                alert(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Leave school
          </Button>
        </section>
      )}
    </div>
  );
}
