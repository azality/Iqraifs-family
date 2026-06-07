// Admin detail view for a single staff member (teacher / visiting teacher
// / office staff / financial staff). Routed at
// /school/orgs/:orgId/admin/teachers/:userId.
//
// Why this exists: until this PR the staff list rendered names as static
// text — there was no way to see what someone actually does at the
// school, when they were granted access, or who granted them. Admins had
// to fall back to running raw SQL. This page surfaces every active
// user_roles row for the user in this org, grouped by scope, with
// granted-by hydration so it reads like a record card.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import {
  ArrowLeft,
  GraduationCap,
  Mail,
  ShieldCheck,
  Trash2,
  Calendar,
  UserCheck,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  HeroCard,
  cardBase,
  cardElev,
  sectionTitleClasses,
} from "../../components/school-ui";
import {
  getTeacherDetail,
  deleteTeacher,
  resendInvite,
  getSchoolMe,
  isOrgAdmin,
  type TeacherDetail as TeacherDetailType,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

const ROLE_LABEL: Record<string, string> = {
  class_teacher: "Class Teacher",
  visiting_teacher: "Visiting Teacher",
  teacher: "Teacher",
  financial_staff: "Financial Staff",
  office_staff: "Office Staff",
};

const ROLE_BADGE_CLS: Record<string, string> = {
  class_teacher: "bg-indigo-50 text-indigo-700 border-indigo-200",
  visiting_teacher: "bg-amber-50 text-amber-700 border-amber-200",
  financial_staff: "bg-emerald-50 text-emerald-700 border-emerald-200",
  office_staff: "bg-sky-50 text-sky-700 border-sky-200",
  teacher: "bg-slate-50 text-slate-700 border-slate-200",
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

export function TeacherDetail() {
  const { orgId = "", userId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [detail, setDetail] = useState<TeacherDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId || !userId) return;
    setLoading(true);
    setError(null);
    getTeacherDetail(orgId, userId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [orgId, userId]);

  if (meLoading) return null;
  // Detail view is for admins/principals only; class teachers shouldn't
  // see other staff members' records.
  if (!isOrgAdmin(me, orgId)) {
    return <Navigate to={`/school/orgs/${orgId}`} replace />;
  }

  const handleResend = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await resendInvite(orgId, detail.userId);
      if (res.sent) {
        setNotice(`Invite email re-sent to ${res.email ?? detail.email}.`);
        setError(null);
      } else {
        setError(`Could not send invite: ${res.reason ?? "unknown reason"}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const label = detail.fullName || detail.email;
    if (!confirm(`Remove ${label} from this school's staff?\n\nTheir login still works (they just lose access to this school's admin/teacher pages). You can re-add them later.`)) return;
    setBusy(true);
    try {
      await deleteTeacher(orgId, detail.userId);
      // Redirect back to the list — the detail row will 404 once the
      // last assignment is revoked.
      window.location.href = `/school/orgs/${orgId}/admin/teachers`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <HeroCard title="Staff member" subtitle="Loading…" ignoreBranding />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="space-y-5">
        <HeroCard title="Staff member" subtitle={error ?? "Not found"} ignoreBranding />
        <Link
          to={`/school/orgs/${orgId}/admin/teachers`}
          className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to staff list
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <HeroCard
        title={detail.fullName || "(no name)"}
        subtitle={detail.email || "—"}
        ignoreBranding
      />

      <Link
        to={`/school/orgs/${orgId}/admin/teachers`}
        className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to staff list
      </Link>

      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && !loading && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Quick actions row — resend invite + revoke access. Adding a new
          assignment (e.g. to another section) is done from the section
          page itself, not from here. */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>Actions</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleResend} disabled={busy || !detail.email}>
            <Mail className="mr-2 h-4 w-4" /> Resend invite email
          </Button>
          <Button variant="outline" onClick={handleDelete} disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4 text-rose-600" />
            <span className="text-rose-700">Remove from staff</span>
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Removing only revokes their access to this school. Their login
          still works for parent / other-school use.
        </p>
      </section>

      {/* Assignments — every active user_roles row for this user in this
          org. Org-scoped roles (admin / office / finance) appear first;
          per-section class_teacher rows follow with class + section names. */}
      <section className={`${cardBase} ${cardElev} p-5`}>
        <h3 className={sectionTitleClasses}>
          Active assignments
          <span className="ml-2 text-xs font-normal text-slate-500">
            ({detail.assignments.length})
          </span>
        </h3>
        <div className="mt-4 divide-y divide-slate-100 border-t border-b border-slate-100">
          {detail.assignments.map((a) => (
            <div key={a.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Badge
                  variant="outline"
                  className={
                    (ROLE_BADGE_CLS[a.roleType] ?? "bg-slate-50 text-slate-700 border-slate-200") +
                    " text-[10px] font-medium shrink-0"
                  }
                >
                  {ROLE_LABEL[a.roleType] ?? a.roleType}
                </Badge>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {a.scopeType === "organization"
                      ? "Organization-wide"
                      : a.className && a.sectionName
                      ? `${a.className} · ${a.sectionName}`
                      : "Section"}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Granted {fmtDate(a.grantedAt)}
                    </span>
                    {a.grantedByName && (
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="h-3 w-3" />
                        by {a.grantedByName}
                      </span>
                    )}
                    {a.validFrom && a.validUntil && (
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        Valid {fmtDate(a.validFrom)} → {fmtDate(a.validUntil)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {a.scopeType === "class" && (
                <Link
                  to={`/school/orgs/${orgId}/sections/${a.scopeId}`}
                  className="text-xs text-indigo-700 hover:underline shrink-0"
                >
                  Open section →
                </Link>
              )}
            </div>
          ))}
        </div>
        {detail.assignments.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">
            <GraduationCap className="inline h-4 w-4 mr-1" />
            No active assignments — this staff member has been fully removed.
          </p>
        )}
      </section>
    </div>
  );
}

export default TeacherDetail;
