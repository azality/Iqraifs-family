// Master timetable — whole school, one day, one screen (admin/principal).
//
// Sections are grouped into timing bands (schedule_key): Main School,
// Primary I–III, Junior, Senior, Hifz — each band runs its own bell
// times, so each renders as its own grid. Teacher double-bookings are
// detected on actual clock-time overlap ACROSS bands and flagged red;
// intentional merges (Qaidah Junior A+B, Senior Deeniyat) can be marked
// once and turn into a neutral "merged" badge.
//
// Second tab: teacher free/busy matrix — "who can cover period 3?"

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AlertTriangle, ArrowLeft, Link2, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { sectionTitleClasses } from "../../components/school-ui";
import {
  getMasterTimetable,
  postTimetableMergeMark,
  postConflictDismissal,
  deleteConflictDismissal,
  deleteTimetableMergeMark,
  type MasterTimetableResponse,
  type MasterTimetableEntry,
  type TimetableSlot,
} from "../../../utils/schoolApi";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtTime = (t: string) => t.slice(0, 5);

function isoDayToday(): number {
  const d = new Date().getDay(); // 0=Sun
  return d === 0 ? 7 : d;
}

export function MasterTimetable() {
  const { orgId = "" } = useParams();
  const [day, setDay] = useState<number>(isoDayToday());
  const [data, setData] = useState<MasterTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"grid" | "teachers">("grid");
  const [markBusy, setMarkBusy] = useState<string | null>(null);
  // Filters: empty set = all classes; null = all teachers.
  const [classFilter, setClassFilter] = useState<Set<string>>(new Set());
  const [teacherFilter, setTeacherFilter] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await getMasterTimetable(orgId, d);
      setData(r);
      // First load may land on a day with no slots (e.g. Sunday) —
      // snap to the first configured day instead of an empty page.
      if (r.days.length > 0 && !r.days.includes(d)) {
        const fallback = r.days[0];
        setDay(fallback);
        setData(await getMasterTimetable(orgId, fallback));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(day); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickDay = (d: number) => { setDay(d); void load(d); };

  // ── Derived lookups ────────────────────────────────────────────────
  const slotById = useMemo(() => {
    const m = new Map<string, TimetableSlot>();
    for (const b of data?.bands ?? []) for (const s of b.slots) m.set(s.id, s);
    return m;
  }, [data]);
  const sectionLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of data?.bands ?? []) for (const s of b.sections) m.set(s.id, s.label);
    return m;
  }, [data]);
  const entryById = useMemo(() => {
    const m = new Map<string, MasterTimetableEntry>();
    for (const e of data?.entries ?? []) m.set(e.id, e);
    return m;
  }, [data]);
  const entriesByCell = useMemo(() => {
    const m = new Map<string, MasterTimetableEntry[]>();
    for (const e of data?.entries ?? []) {
      if (!e.sectionId) continue;
      const k = `${e.slotId}|${e.sectionId}`;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [data]);
  const conflictStatus = useMemo(() => {
    // entryId -> "real" | "merged" (real wins if an entry is in both).
    const m = new Map<string, "real" | "merged">();
    for (const c of data?.conflicts ?? []) {
      for (const id of [c.aId, c.bId]) {
        const cur = m.get(id);
        if (!c.merged) m.set(id, "real");
        else if (cur !== "real") m.set(id, "merged");
      }
    }
    return m;
  }, [data]);

  const cellLabel = (entryId: string): string => {
    const e = entryById.get(entryId);
    if (!e) return entryId;
    const slot = e.slotId ? slotById.get(e.slotId) : undefined;
    const sec = e.sectionId ? sectionLabelById.get(e.sectionId) ?? "?" : "?";
    return `${sec} · ${e.subjectName ?? "—"}${slot ? ` (${fmtTime(slot.startTime)}–${fmtTime(slot.endTime)})` : ""}`;
  };

  const toggleMerge = async (aId: string, bId: string, merged: boolean) => {
    const key = `${aId}|${bId}`;
    setMarkBusy(key);
    try {
      if (merged) await deleteTimetableMergeMark(orgId, aId, bId);
      else await postTimetableMergeMark(orgId, aId, bId);
      await load(day);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarkBusy(null);
    }
  };

  const toggleDismiss = async (aId: string, bId: string, dismissed: boolean) => {
    setMarkBusy(`${aId}|${bId}`);
    try {
      if (dismissed) await deleteConflictDismissal(orgId, aId, bId);
      else await postConflictDismissal(orgId, aId, bId);
      await load(day);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarkBusy(null);
    }
  };

  // ── Teacher matrix derivation ──────────────────────────────────────
  const teacherMatrix = useMemo(() => {
    if (!data) return { timeCols: [] as Array<{ key: string; label: string }>, rows: [] as Array<{ teacherUserId: string; teacherName: string; cells: Map<string, MasterTimetableEntry[]> }> };
    const timeKeys = new Map<string, { start: string; end: string }>();
    for (const b of data.bands) {
      for (const s of b.slots) {
        if (s.kind !== "academic" && s.kind !== "hifz") continue;
        const k = `${s.startTime}|${s.endTime}`;
        if (!timeKeys.has(k)) timeKeys.set(k, { start: s.startTime, end: s.endTime });
      }
    }
    const timeCols = Array.from(timeKeys.entries())
      .sort((a, b) => a[1].start.localeCompare(b[1].start) || a[1].end.localeCompare(b[1].end))
      .map(([key, t]) => ({ key, label: `${fmtTime(t.start)}–${fmtTime(t.end)}` }));
    const byTeacher = new Map<string, { teacherUserId: string; teacherName: string; cells: Map<string, MasterTimetableEntry[]> }>();
    for (const e of data.entries) {
      if (!e.teacherUserId) continue;
      const slot = slotById.get(e.slotId);
      if (!slot) continue;
      const k = `${slot.startTime}|${slot.endTime}`;
      const row = byTeacher.get(e.teacherUserId) ?? {
        teacherUserId: e.teacherUserId,
        teacherName: e.teacherName ?? "—",
        cells: new Map<string, MasterTimetableEntry[]>(),
      };
      row.cells.set(k, [...(row.cells.get(k) ?? []), e]);
      byTeacher.set(e.teacherUserId, row);
    }
    const rows = Array.from(byTeacher.values()).sort((a, b) =>
      a.teacherName.localeCompare(b.teacherName),
    );
    return { timeCols, rows };
  }, [data, slotById]);

  const realConflicts = (data?.conflicts ?? []).filter((c) => !c.merged && !c.dismissed);
  const mergedConflicts = (data?.conflicts ?? []).filter((c) => c.merged);
  const dismissedConflicts = (data?.conflicts ?? []).filter((c) => !c.merged && c.dismissed);

  // ── Filters ────────────────────────────────────────────────────────
  // Section labels are "<class name> <section name>"; stripping the last
  // token yields the class, which is the granularity people filter by.
  const classOfLabel = (label: string) => label.replace(/\s+\S+$/, "");
  const allClasses = useMemo(() => {
    const seen: string[] = [];
    for (const b of data?.bands ?? []) {
      for (const s of b.sections) {
        const c = classOfLabel(s.label);
        if (!seen.includes(c)) seen.push(c);
      }
    }
    return seen;
  }, [data]);
  const allTeachers = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.entries ?? []) {
      if (e.teacherUserId && !m.has(e.teacherUserId)) m.set(e.teacherUserId, e.teacherName ?? "—");
    }
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const teacherSectionIds = useMemo(() => {
    if (!teacherFilter) return null;
    const s = new Set<string>();
    for (const e of data?.entries ?? []) {
      if (e.teacherUserId === teacherFilter && e.sectionId) s.add(e.sectionId);
    }
    return s;
  }, [data, teacherFilter]);
  const toggleClass = (c: string) => {
    setClassFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };
  const sectionVisible = (sec: { id: string; label: string }): boolean => {
    if (classFilter.size > 0 && !classFilter.has(classOfLabel(sec.label))) return false;
    if (teacherSectionIds && !teacherSectionIds.has(sec.id)) return false;
    return true;
  };
  const filtersActive = classFilter.size > 0 || teacherFilter !== null;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className={sectionTitleClasses}>Master Timetable</h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            The whole school for one day. Red cells mean a teacher is booked in two
            places at overlapping times — across all bell schedules.
          </p>
        </div>
        <Link to={`/school/orgs/${orgId}/admin/timetable`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Timetable editor
          </Button>
        </Link>
      </div>

      {/* Day + tab pickers */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {(data?.days ?? [1, 2, 3, 4, 5]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => pickDay(d)}
              className={
                "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                (d === day ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-100")
              }
            >
              {DAY_NAMES[d - 1]}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {([["grid", "Day grid"], ["teachers", "Teachers"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={
                "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                (tab === k ? "bg-slate-800 text-white shadow" : "text-slate-600 hover:bg-slate-100")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters: class chips + teacher picker */}
      {!loading && data && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Filter</span>
          {allClasses.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleClass(c)}
              className={
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors " +
                (classFilter.has(c)
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {c}
            </button>
          ))}
          <select
            value={teacherFilter ?? ""}
            onChange={(e) => setTeacherFilter(e.target.value || null)}
            className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            <option value="">All teachers</option>
            {allTeachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={() => { setClassFilter(new Set()); setTeacherFilter(null); }}
              className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      {loading && (
        <div className="flex items-center gap-2 py-10 justify-center text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading {DAY_NAMES[day - 1]}…
        </div>
      )}

      {/* Conflict panel */}
      {!loading && data && (realConflicts.length > 0 || mergedConflicts.length > 0 || dismissedConflicts.length > 0) && (
        <Card className={realConflicts.length > 0 ? "border-rose-200" : "border-slate-200"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {realConflicts.length > 0 ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  {realConflicts.length} teacher conflict{realConflicts.length === 1 ? "" : "s"} on {DAY_NAMES[day - 1]}
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 text-indigo-500" />
                  No conflicts — {mergedConflicts.length} intentional merge{mergedConflicts.length === 1 ? "" : "s"}
                </>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Deliberate (sections sit together)? <span className="font-medium">Mark as merge</span> —
              it stops being flagged everywhere. Known but unresolved?{" "}
              <span className="font-medium">Dismiss for now</span> — it collapses below until you restore it.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-slate-100">
              {[...realConflicts, ...mergedConflicts].map((c) => {
                const busy = markBusy === `${c.aId}|${c.bId}` || markBusy === `${c.bId}|${c.aId}`;
                return (
                  <li key={`${c.aId}|${c.bId}`} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div className="min-w-0 text-sm">
                      <span className={"font-medium " + (c.merged ? "text-slate-700" : "text-rose-700")}>
                        {c.teacherName ?? "Teacher"}
                      </span>{" "}
                      <span className="text-slate-600">
                        {cellLabel(c.aId)} ↔ {cellLabel(c.bId)}
                      </span>
                      {c.merged && (
                        <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                          merged
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void toggleMerge(c.aId, c.bId, c.merged)}
                        title="The sections sit together — this overlap is deliberate"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : c.merged ? "Unmark" : "Mark as merge"}
                      </Button>
                      {!c.merged && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void toggleDismiss(c.aId, c.bId, false)}
                          title="We know — we'll manage it. Collapses this conflict until restored."
                        >
                          Dismiss for now
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {dismissedConflicts.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-600">
                  Dismissed ({dismissedConflicts.length}) — acknowledged, still unresolved:
                </p>
                <ul className="mt-1 space-y-1">
                  {dismissedConflicts.map((c) => {
                    const busy = markBusy === `${c.aId}|${c.bId}` || markBusy === `${c.bId}|${c.aId}`;
                    return (
                      <li key={`${c.aId}|${c.bId}`} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {c.teacherName ?? "Teacher"}: {cellLabel(c.aId)} ↔ {cellLabel(c.bId)}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleDismiss(c.aId, c.bId, true)}
                          className="text-indigo-600 hover:underline disabled:opacity-50"
                        >
                          Restore
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Day grid */}
      {!loading && data && tab === "grid" && (
        <div className="space-y-5">
          {data.bands
            .map((band) => ({ ...band, sections: band.sections.filter(sectionVisible) }))
            .filter((b) => b.sections.length > 0 && b.slots.length > 0)
            .map((band) => (
              <Card key={band.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{band.label}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-y border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-500">
                          <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left whitespace-nowrap z-10">Period</th>
                          {band.sections.map((s) => (
                            <th key={s.id} className="px-2 py-2 text-left whitespace-nowrap">{s.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {band.slots.map((slot) => {
                          const isBreakish = slot.kind !== "academic" && slot.kind !== "hifz";
                          if (isBreakish) {
                            return (
                              <tr key={slot.id} className="border-b border-slate-50 bg-slate-50/70">
                                <td className="sticky left-0 bg-slate-50 px-3 py-1.5 text-slate-500 whitespace-nowrap z-10">
                                  {fmtTime(slot.startTime)}–{fmtTime(slot.endTime)}
                                </td>
                                <td colSpan={band.sections.length} className="px-2 py-1.5 text-center text-slate-400 italic">
                                  {slot.name}
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={slot.id} className="border-b border-slate-50 align-top">
                              <td className="sticky left-0 bg-white px-3 py-1.5 whitespace-nowrap z-10">
                                <div className="font-medium text-slate-700">{fmtTime(slot.startTime)}–{fmtTime(slot.endTime)}</div>
                                <div className="text-[10px] text-slate-400">{slot.name}</div>
                              </td>
                              {band.sections.map((sec) => {
                                const cell = entriesByCell.get(`${slot.id}|${sec.id}`) ?? [];
                                return (
                                  <td key={sec.id} className="px-1 py-1">
                                    {cell.map((e) => {
                                      const st = conflictStatus.get(e.id);
                                      const dimmed =
                                        teacherFilter !== null && e.teacherUserId !== teacherFilter;
                                      return (
                                        <div
                                          key={e.id}
                                          className={
                                            "rounded px-1.5 py-1 mb-0.5 " +
                                            (dimmed ? "opacity-30 " : "") +
                                            (st === "real"
                                              ? "bg-rose-50 ring-1 ring-rose-300"
                                              : st === "merged"
                                                ? "bg-indigo-50/60 ring-1 ring-indigo-200"
                                                : "bg-slate-50")
                                          }
                                          title={st === "real" ? `${e.teacherName ?? "Teacher"} is double-booked at this time` : undefined}
                                        >
                                          <div className="font-medium text-slate-800 leading-tight">{e.subjectName ?? "—"}</div>
                                          <div className="text-[10px] text-slate-500 leading-tight">
                                            {e.teacherUserId ? (
                                              <button
                                                type="button"
                                                className="hover:text-indigo-600 hover:underline"
                                                title={`Show only ${e.teacherName ?? "this teacher"}'s periods`}
                                                onClick={() =>
                                                  setTeacherFilter((cur) =>
                                                    cur === e.teacherUserId ? null : e.teacherUserId,
                                                  )
                                                }
                                              >
                                                {e.teacherName ?? "—"}
                                              </button>
                                            ) : (
                                              "—"
                                            )}
                                            {e.room ? ` · ${e.room}` : ""}
                                            {st === "merged" ? " · merged" : ""}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Teacher free/busy matrix */}
      {!loading && data && tab === "teachers" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Teachers — {DAY_NAMES[day - 1]}</CardTitle>
            <CardDescription className="text-xs">
              Empty cell = free at that time. Use this to find cover for a period.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left whitespace-nowrap z-10">Teacher</th>
                    {teacherMatrix.timeCols.map((col) => (
                      <th key={col.key} className="px-2 py-2 text-left whitespace-nowrap">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teacherMatrix.rows
                    .filter((r) => !teacherFilter || r.teacherUserId === teacherFilter)
                    .map((row) => (
                    <tr key={row.teacherUserId} className="border-b border-slate-50 align-top">
                      <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap z-10">
                        {row.teacherName}
                      </td>
                      {teacherMatrix.timeCols.map((col) => {
                        const cell = row.cells.get(col.key) ?? [];
                        return (
                          <td key={col.key} className="px-1 py-1">
                            {cell.map((e) => {
                              const st = conflictStatus.get(e.id);
                              return (
                                <div
                                  key={e.id}
                                  className={
                                    "rounded px-1.5 py-0.5 mb-0.5 whitespace-nowrap " +
                                    (st === "real"
                                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-300"
                                      : "bg-slate-100 text-slate-700")
                                  }
                                >
                                  {e.sectionId ? sectionLabelById.get(e.sectionId) ?? "—" : "—"}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {teacherMatrix.rows.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-slate-500" colSpan={1 + teacherMatrix.timeCols.length}>
                        No teacher assignments on this day.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
