// Principal dashboard for a single org.
//
// Routed as /school/orgs/:orgId. Shows:
//   - org name + plan
//   - counts (campuses / classes / active enrollments)
//   - list of classes (link → ClassDetail)
//   - "Set up the school" CTA if the principal has zero campuses or
//     zero classes yet (routes to SchoolSetup wizard).

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Plus, School, Users, BookOpen, Settings as SettingsIcon } from "lucide-react";
import {
  getOrganization,
  getClasses,
  type OrgWithCounts,
  type SchoolClass,
} from "../../../utils/schoolApi";

export function PrincipalDashboard() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<OrgWithCounts | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([getOrganization(orgId), getClasses(orgId)])
      .then(([d, c]) => {
        setData(d);
        setClasses(c);
      })
      .catch((e) => setError(e?.message || "Could not load school"))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (error) {
    return <div className="max-w-lg mx-auto mt-12 text-red-600">Error: {error}</div>;
  }
  if (!data) return null;

  const { organization, counts } = data;
  const needsSetup = counts.campuses === 0 || counts.classes === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <School className="h-6 w-6 text-blue-600" />
            {organization.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <Badge variant="secondary" className="mr-2">{organization.plan}</Badge>
            Principal dashboard
          </p>
        </div>
        {needsSetup ? (
          <Button onClick={() => navigate(`/school/orgs/${orgId}/setup`)}>
            <SettingsIcon className="h-4 w-4 mr-2" />
            Set up the school
          </Button>
        ) : (
          <Button onClick={() => navigate(`/school/orgs/${orgId}/setup`)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add a class
          </Button>
        )}
      </div>

      {/* Counts */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Campuses</CardDescription>
            <CardTitle className="text-3xl">{counts.campuses}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Classes</CardDescription>
            <CardTitle className="text-3xl">{counts.classes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active students</CardDescription>
            <CardTitle className="text-3xl">{counts.activeEnrollments}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Setup nudge */}
      {needsSetup && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900 text-lg">Finish setup</CardTitle>
            <CardDescription className="text-amber-700">
              Walk through the setup wizard to add your first campus, academic
              year, and class. Takes about 5 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate(`/school/orgs/${orgId}/setup`)}>
              Start setup →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Classes list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Classes
          </CardTitle>
          <CardDescription>
            Open a class to see its roster, log Salah, or record Hifz progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No classes yet. Use the setup wizard to create the first one.
            </p>
          ) : (
            <div className="grid gap-2">
              {classes.map((cls) => (
                <Link
                  key={cls.id}
                  to={`/school/classes/${cls.id}`}
                  className="flex items-center justify-between border rounded-lg p-3 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{cls.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="capitalize">{cls.track}</span>
                      {cls.grade_level !== null && <> · Grade {cls.grade_level}</>}
                      {cls.section && <> · Section {cls.section}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
