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
import { Link, Navigate, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
import {
  Building2,
  GraduationCap,
  Users,
  Heart,
  UserCog,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import {
  getSchoolMe,
  isOrgAdmin,
  isOrgPrincipal,
  listClasses,
  listStudents,
  listParents,
  listAdminTeachers,
  listLinkCodes,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

interface Tile {
  to: string;
  label: string;
  count: number | null;
  icon: typeof Building2;
  principalOnly?: boolean;
}

export function AdminDashboard() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [counts, setCounts] = useState<{
    classes: number | null;
    students: number | null;
    parents: number | null;
    teachers: number | null;
    linkCodes: number | null;
  }>({ classes: null, students: null, parents: null, teachers: null, linkCodes: null });

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
    { to: `/school/orgs/${orgId}/admin/permissions`, label: "Permissions", count: null, icon: ShieldCheck, principalOnly: true },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7" />
          <div>
            <h1 className="text-2xl font-bold">Admin Console</h1>
            <p className="text-sm text-indigo-100 mt-0.5">
              Manage classes, students, parents, and teachers.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles
          .filter((t) => !t.principalOnly || principal)
          .map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to}>
                <Card className="hover:border-indigo-400 hover:shadow-sm transition-all cursor-pointer h-full">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-indigo-50 text-indigo-600">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.count === null ? "—" : `${t.count} total`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
