// CarriedAttendance — the attendance a school kept before (and beside)
// roll call in the system.
//
// IFS opened on 4 May 2026 on paper; roll call here starts 19 Aug, and
// the office went on counting by hand until mid-September. Each class
// handed in one total per child — "present 58 of 62 working days"
// (21 Sep). Without those totals a report card printed today would
// claim the year began in late August.
//
// One screen per section: the working days and the last day the count
// covers are set once for the whole section, then a number per child.
// Days on or before that date are taken from this total and the
// system's own roll call for them is not counted again.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { CalendarCheck, Loader2, Save } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  getSchoolMe, isOrgAdmin, listClasses, getAttendanceOpening, saveAttendanceOpening,
  type SchoolMeResponse, type AttendanceOpeningRow,
} from "../../../utils/schoolApi";
import { NoAccessRedirect, sectionTitleClasses } from "../../components/school-ui";

interface ClassWithSections {
  id: string; name: string; kind?: string;
  sections?: Array<{ id: string; name: string }>;
}

export function CarriedAttendance() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [rows, setRows] = useState<AttendanceOpeningRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [workingDays, setWorkingDays] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => {}).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then((c) => setClasses(c as ClassWithSections[])).catch(() => {});
  }, [orgId]);

  const sectionOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const c of classes) {
      for (const s of c.sections ?? []) {
        out.push({ id: s.id, label: (c.sections ?? []).length > 1 ? `${c.name} — ${s.name}` : c.name });
      }
    }
    return out;
  }, [classes]);

  useEffect(() => {
    if (!orgId || !sectionId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    setSaved(null);
    getAttendanceOpening(orgId, sectionId)
      .then((r) => {
        setRows(r.students);
        setCanEdit(r.canEdit);
        setDraft(Object.fromEntries(
          r.students.map((s) => [s.studentId, s.daysPresent === null ? "" : String(s.daysPresent)]),
        ));
        // The section's own saved settings lead; a fresh section starts
        // blank rather than inheriting the last one looked at.
        const withValue = r.students.find((s) => s.workingDays !== null);
        setWorkingDays(withValue?.workingDays != null ? String(withValue.workingDays) : "");
        setAsOfDate(withValue?.asOfDate ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  }, [orgId, sectionId]);

  const days = Number(workingDays);
  const overMax = rows.filter((r) => {
    const v = draft[r.studentId];
    return v !== "" && days > 0 && Number(v) > days;
  });
  const filled = rows.filter((r) => (draft[r.studentId] ?? "") !== "").length;
  const ready = days > 0 && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) && overMax.length === 0;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveAttendanceOpening(orgId, sectionId, {
        asOfDate,
        workingDays: days,
        entries: rows.map((r) => ({
          studentId: r.studentId,
          daysPresent: (draft[r.studentId] ?? "") === "" ? null : Number(draft[r.studentId]),
        })),
      });
      setSaved(`Saved ${res.saved} ${res.saved === 1 ? "child" : "children"}${res.cleared ? `, cleared ${res.cleared}` : ""}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (meLoading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!me || !isOrgAdmin(me, orgId)) return <NoAccessRedirect />;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className={sectionTitleClasses}>Attendance carried forward</h1>
        <p className="mt-1 text-sm text-slate-600">
          The days your own register counted before roll call moved into the system.
          A report card adds these to the days marked here, and never counts a day twice.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Class
        </label>
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Choose a class…</option>
          {sectionOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>

        {sectionId && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Working days counted
              </label>
              <input
                type="number" min={1} inputMode="numeric"
                value={workingDays}
                disabled={!canEdit}
                onChange={(e) => setWorkingDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                placeholder="62"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Counted up to and including
              </label>
              <input
                type="date"
                value={asOfDate}
                disabled={!canEdit}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saved}</div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the class…
        </div>
      )}

      {!loading && sectionId && rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarCheck className="h-4 w-4 text-slate-400" />
              {filled} of {rows.length} filled in
            </div>
            {canEdit && (
              <Button onClick={save} disabled={!ready || saving} size="sm">
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save
              </Button>
            )}
          </div>

          {overMax.length > 0 && (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">
              More days present than working days for{" "}
              {overMax.map((r) => r.fullName).join(", ")} — check the register.
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.studentId} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{r.fullName}</div>
                  <div className="text-[11px] text-slate-400">GR {r.grNumber ?? "—"}</div>
                </div>
                <input
                  type="number" min={0} inputMode="numeric"
                  value={draft[r.studentId] ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.studentId]: e.target.value }))}
                  aria-label={`Days present for ${r.fullName}`}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums"
                  placeholder="—"
                />
                <div className="w-16 text-[12px] text-slate-400">
                  {days > 0 ? `of ${days}` : ""}
                </div>
              </div>
            ))}
          </div>

          {canEdit && (
            <div className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-500">
              Leave a child blank to carry nothing forward for them.
            </div>
          )}
        </div>
      )}

      {!loading && sectionId && rows.length === 0 && (
        <p className="text-sm text-slate-500">No active children in this class.</p>
      )}
    </div>
  );
}

export default CarriedAttendance;
