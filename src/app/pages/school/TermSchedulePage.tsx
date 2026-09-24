// TermSchedulePage — "Deadlines & results day", the one place the
// office sets the term's clock (24 Sep: setting it from a section's
// tabulation sheet "feels like going to each individual class" — the
// schedule is school-wide, so it gets a school-wide page).
//
// Pick a term, set the whole school's marks deadline and results day,
// exempt classes or give a wing its own times, grant per-teacher
// exceptions. The tabulation sheet keeps a one-line summary + a link.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin, listClasses, listTerms, getTermSchedule,
  type AdminClass, type AcademicTerm, type SchoolMeResponse, type TermSchedule,
} from "../../../utils/schoolApi";
import { NoAccessRedirect } from "../../components/school-ui";
import { TermSchedulePanel } from "./components/TermSchedulePanel";

export function TermSchedulePage() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [termId, setTermId] = useState("");
  const [schedule, setSchedule] = useState<TermSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listTerms(orgId)
      .then((r) => {
        setTerms(r.terms);
        const cur = r.terms.find((t) => t.isCurrent);
        if (cur) setTermId((v) => v || cur.id);
      })
      .catch(() => {});
  }, [orgId]);

  const refresh = () => {
    if (!orgId || !termId) { setSchedule(null); return; }
    getTermSchedule(orgId, termId)
      .then((r) => { setSchedule(r.schedule); setError(null); })
      .catch((e) => { setSchedule(null); setError(e instanceof Error ? e.message : "Failed to load"); });
  };
  useEffect(refresh, [orgId, termId]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) {
    return <NoAccessRedirect to={`/school/orgs/${orgId}`} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/assessment`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Assessment
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-wide text-slate-900 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-indigo-600" /> DEADLINES &amp; RESULTS DAY
        </h1>
        <p className="text-sm text-slate-500">
          The term's clock, set once for the whole school: when teachers' marks entry
          locks, and when finalized report cards reach parents. A class can be exempted
          or given its own times below — everything here applies everywhere, not per
          section.
        </p>
      </div>

      <div>
        <Label className="text-xs text-slate-500">Term</Label>
        <Select value={termId} onValueChange={setTermId}>
          <SelectTrigger className="h-9 w-64 text-sm"><SelectValue placeholder="Pick a term" /></SelectTrigger>
          <SelectContent>
            {terms.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}{t.isCurrent ? " (current)" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {termId && schedule && (
        <TermSchedulePanel
          orgId={orgId}
          termId={termId}
          schedule={schedule}
          classes={classes}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
