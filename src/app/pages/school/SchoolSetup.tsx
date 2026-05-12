// Principal setup wizard.
//
// Routed as /school/orgs/:orgId/setup. Three steps:
//   1. Academic year (e.g. "2026-27", Aug 2026 – Jun 2027)
//   2. Campus (e.g. "Main Campus, Lahore")
//   3. First class (Hifz section or Grade X)
//
// Each step is skippable if the principal already created one. The wizard
// auto-detects existing rows on mount and starts at the first incomplete
// step. After step 3 succeeds, redirect to the class detail page so they
// can immediately add students.

import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import {
  createAcademicYear,
  createCampus,
  createClass,
  getAcademicYears,
  getCampuses,
  getClasses,
  type AcademicYear,
  type Campus,
} from "../../../utils/schoolApi";

type Step = "year" | "campus" | "class" | "done";

export function SchoolSetup() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("year");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state for each step
  const [yearName, setYearName] = useState("2026-27");
  const [yearStart, setYearStart] = useState("2026-08-01");
  const [yearEnd, setYearEnd] = useState("2027-06-30");

  const [campusName, setCampusName] = useState("Main Campus");
  const [campusAddress, setCampusAddress] = useState("");

  const [className, setClassName] = useState("Hifz Section A");
  const [classTrack, setClassTrack] = useState<"hifz" | "mainstream" | "hybrid">("hifz");
  const [classGrade, setClassGrade] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  // Load existing state on mount and resume the wizard at the right step
  useEffect(() => {
    if (!orgId) return;
    Promise.all([getAcademicYears(orgId), getCampuses(orgId), getClasses(orgId)])
      .then(([y, c, cls]) => {
        setYears(y);
        setCampuses(c);
        if (cls.length > 0) setStep("done");
        else if (c.length > 0) setStep("class");
        else if (y.length > 0) setStep("campus");
        else setStep("year");
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  const currentYear = years.find((y) => y.is_current) ?? years[0];

  const submitYear = async () => {
    if (!yearName || !yearStart || !yearEnd) {
      toast.error("All fields required");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createAcademicYear(orgId, {
        name: yearName,
        startDate: yearStart,
        endDate: yearEnd,
        isCurrent: true,
      });
      setYears((prev) => [...prev, created]);
      toast.success(`Academic year ${created.name} created`);
      setStep("campus");
    } catch (e: any) {
      toast.error(e?.message || "Could not create academic year");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCampus = async () => {
    if (!campusName) { toast.error("Campus name required"); return; }
    setSubmitting(true);
    try {
      const created = await createCampus(orgId, {
        name: campusName,
        address: campusAddress || undefined,
      });
      setCampuses((prev) => [...prev, created]);
      toast.success(`Campus "${created.name}" created`);
      setStep("class");
    } catch (e: any) {
      toast.error(e?.message || "Could not create campus");
    } finally {
      setSubmitting(false);
    }
  };

  const submitClass = async () => {
    if (!className || !currentYear || campuses.length === 0) {
      toast.error("Missing required fields");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createClass({
        organizationId: orgId,
        campusId: campuses[0].id,
        academicYearId: currentYear.id,
        name: className,
        track: classTrack,
        gradeLevel: classGrade ? parseInt(classGrade, 10) : undefined,
      });
      toast.success(`Class "${created.name}" created`);
      // Drop them onto the class so they can add students right away
      navigate(`/school/classes/${created.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not create class");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const stepNumber = step === "year" ? 1 : step === "campus" ? 2 : step === "class" ? 3 : 3;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          to={`/school/orgs/${orgId}`}
          className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-3 w-3" />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Set up your school</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Three quick steps — academic year, first campus, first class.
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <StepDot active={stepNumber === 1} done={years.length > 0} label="1. Year" />
        <span>·</span>
        <StepDot active={stepNumber === 2} done={campuses.length > 0} label="2. Campus" />
        <span>·</span>
        <StepDot active={stepNumber === 3} done={false} label="3. Class" />
      </div>

      {step === "year" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 · Academic year</CardTitle>
            <CardDescription>
              The year boundary used for class rosters and leaderboards. You can
              add more years later (one is always the "current" one).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="year-name">Name</Label>
              <Input id="year-name" value={yearName} onChange={(e) => setYearName(e.target.value)} placeholder="2026-27" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="year-start">Starts</Label>
                <Input id="year-start" type="date" value={yearStart} onChange={(e) => setYearStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="year-end">Ends</Label>
                <Input id="year-end" type="date" value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} />
              </div>
            </div>
            <Button onClick={submitYear} disabled={submitting} className="w-full">
              {submitting ? "Creating…" : <>Create academic year <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "campus" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 · First campus</CardTitle>
            <CardDescription>
              For the pilot, start with one campus. You can add more later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="campus-name">Campus name</Label>
              <Input id="campus-name" value={campusName} onChange={(e) => setCampusName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="campus-address">Address (optional)</Label>
              <Input id="campus-address" value={campusAddress} onChange={(e) => setCampusAddress(e.target.value)} placeholder="Lahore" />
            </div>
            <Button onClick={submitCampus} disabled={submitting} className="w-full">
              {submitting ? "Creating…" : <>Create campus <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "class" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3 · First class</CardTitle>
            <CardDescription>
              Recommend starting with the Hifz section for the pilot.
              You'll be dropped right into the roster page after this so you
              can add students.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="class-name">Class name</Label>
              <Input id="class-name" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Hifz Section A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Track</Label>
                <Select value={classTrack} onValueChange={(v: any) => setClassTrack(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hifz">Hifz</SelectItem>
                    <SelectItem value="mainstream">Mainstream</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="class-grade">Grade level (optional)</Label>
                <Input
                  id="class-grade"
                  type="number"
                  min="1"
                  max="12"
                  value={classGrade}
                  onChange={(e) => setClassGrade(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Year: <Badge variant="secondary">{currentYear?.name ?? "—"}</Badge> ·
              Campus: <Badge variant="secondary">{campuses[0]?.name ?? "—"}</Badge>
            </p>
            <Button onClick={submitClass} disabled={submitting} className="w-full">
              {submitting ? "Creating…" : <>Create class & add students <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <Check className="h-5 w-5" />
              Setup already complete
            </CardTitle>
            <CardDescription>
              You've already created at least one class. Open the dashboard to
              jump in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate(`/school/orgs/${orgId}`)}>
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const className = done
    ? "text-green-700 font-medium"
    : active
    ? "text-blue-700 font-medium"
    : "text-muted-foreground";
  return <span className={className}>{label}{done ? " ✓" : ""}</span>;
}
