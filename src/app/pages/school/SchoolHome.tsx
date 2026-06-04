// Landing page for the school surfaces.
//
// Routes the user to the right surface based on /school/me:
//   - principal of any org → PrincipalDashboard
//   - teacher of any class but no principal role → TeacherDashboard (placeholder for now)
//   - neither → "You don't have school access" with a polite explanation
//
// Lives at /school. Other school pages assume a role check has happened
// somewhere above them and don't repeat it.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { School, Lock, GraduationCap, Users } from "lucide-react";
import {
  getSchoolMe,
  isPrincipal,
  isTeacher,
  principalOrgIds,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

export function SchoolHome() {
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe()
      .then(setMe)
      .catch((e) => setError(e?.message || "Could not load school role"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!me) return;
    // Auto-route principals straight to their dashboard. We match against
    // me.organizations (which the backend filters to undeleted orgs only)
    // rather than principalOrgIds(me) (raw role-table count). Otherwise a
    // principal whose original org was soft-deleted keeps a stale role row
    // → orgs.length === 2 → no auto-redirect → landing renders blank.
    if (isPrincipal(me)) {
      const principalIdSet = new Set(principalOrgIds(me));
      const activePrincipalOrgs = me.organizations.filter((o) => principalIdSet.has(o.id));
      if (activePrincipalOrgs.length === 1) {
        navigate(`/school/orgs/${activePrincipalOrgs[0].id}`, { replace: true });
      }
    }
  }, [me, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading school…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-600" />
            School unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const principalOrgs = me ? me.organizations.filter((o) =>
    principalOrgIds(me).includes(o.id),
  ) : [];

  const hasSchoolRole = me && (isPrincipal(me) || isTeacher(me));

  if (!hasSchoolRole) {
    return (
      <div className="max-w-2xl mx-auto mt-12 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="h-6 w-6 text-blue-600" />
              School surfaces
            </CardTitle>
            <CardDescription>
              You don't currently have a principal or teacher role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The school side of the app is for principals and teachers at schools
              that have onboarded. Your family experience is unchanged.
            </p>
            <p>
              If you're expecting access, ask your school's principal to invite you,
              or contact <a href="mailto:muneeb@azality.com" className="text-blue-600 underline">muneeb@azality.com</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Principal of multiple orgs (rare for v1 but supported): show picker.
  if (principalOrgs.length > 1) {
    return (
      <div className="max-w-2xl mx-auto mt-12 space-y-4">
        <h1 className="text-2xl font-semibold">Choose a school</h1>
        <div className="grid gap-3">
          {principalOrgs.map((org) => (
            <Card
              key={org.id}
              className="cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => navigate(`/school/orgs/${org.id}`)}
            >
              <CardContent className="py-4 flex items-center gap-3">
                <GraduationCap className="h-6 w-6 text-blue-600" />
                <div className="flex-1">
                  <p className="font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">{org.slug} · {org.plan}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Teacher-only: show their classes.
  if (!isPrincipal(me) && isTeacher(me) && me) {
    return (
      <div className="max-w-3xl mx-auto mt-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            My classes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Open a class to log Salah, behavior, attendance, or Hifz progress.
          </p>
        </div>
        <div className="grid gap-3">
          {me.classes.map((cls) => (
            <Card
              key={cls.id}
              className="cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => navigate(`/school/classes/${cls.id}`)}
            >
              <CardContent className="py-4">
                <p className="font-medium">{cls.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Track: <span className="capitalize">{cls.track}</span>
                  {cls.grade_level !== null && <> · Grade {cls.grade_level}</>}
                </p>
              </CardContent>
            </Card>
          ))}
          {me.classes.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                You haven't been assigned to any classes yet. Ask your principal.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Fallback. Single-principal-org users hit the auto-redirect above
  // before reaching here. Anyone else who lands here is either a
  // principal whose redirect raced the render (in which case the
  // useEffect will fire on the next tick) or in a state we don't have
  // an explicit branch for. Render a non-blank "loading" so it's never
  // a silently blank page.
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center space-y-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
        <Button variant="link" size="sm" onClick={() => {
          // Last-ditch: send to the first principal org we can find. Beats
          // a stuck spinner if something downstream gets confused.
          const firstActive = me?.organizations.find((o) =>
            principalOrgIds(me).includes(o.id),
          );
          if (firstActive) navigate(`/school/orgs/${firstActive.id}`, { replace: true });
        }}>
          Click here if this doesn't auto-load
        </Button>
      </div>
    </div>
  );
}
