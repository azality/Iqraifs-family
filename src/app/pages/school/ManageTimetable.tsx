// ManageTimetable — admin editor for the org-wide weekly timetable.
//
// Route: /school/orgs/:orgId/admin/timetable
//
// Two panels:
//
//   1. Slots — Mon..Sun × N time slots. Define once for the org;
//      every section + Hifz group inherits the same skeleton. Kind
//      (academic / break / prayer / hifz / assembly / other) tints
//      the row so the school day reads at a glance.
//
//   2. Weekly grid — pick a section OR a Hifz group, then per
//      slot fill in: subject + teacher + room + notes. Inline editing
//      directly in each cell so we don't pop a dialog for every
//      cell.
//
// Read-only views for parents / teachers will hit the same /sections/
// :sid/timetable and /hifz-groups/:gid/timetable endpoints; this PR
// only ships the editor.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, Plus, Trash2, Calendar, Save, BookMarked, Users, AlertTriangle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import {
  getSchoolMe,
  isOrgAdmin,
  listClasses,
  listHifzGroups,
  listClassSubjects,
  listAdminTeachers,
  listTimetableSlots,
  createTimetableSlot,
  deleteTimetableSlot,
  getSectionTimetable,
  getHifzGroupTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  listRoomConflicts,
  listTeacherConflicts,
  getRoomConflictPayload,
  getTeacherConflictPayload,
  type RoomConflictError,
  type RoomConflictPair,
  type TeacherConflictError,
  type TeacherConflictPair,
  type AdminClass,
  type AdminTeacher,
  type ClassSubject,
  type HifzGroup,
  type SchoolMeResponse,
  type TimetableSlot,
  type TimetableSlotKind,
  type TimetableWeekCell,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";
import { TimetableSectionsChecklist } from "./TimetableSectionsChecklist";
import { TimetableWeekTemplate } from "./TimetableWeekTemplate";
import { SubstitutionsPanel } from "./SubstitutionsPanel";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_TONE: Record<TimetableSlotKind, string> = {
  academic: "bg-indigo-50 text-indigo-800 border-indigo-200",
  break:    "bg-slate-100 text-slate-700 border-slate-200",
  prayer:   "bg-emerald-50 text-emerald-800 border-emerald-200",
  hifz:     "bg-amber-50 text-amber-800 border-amber-200",
  assembly: "bg-sky-50 text-sky-800 border-sky-200",
  other:    "bg-white text-slate-700 border-slate-200",
};
const KIND_LABEL: Record<TimetableSlotKind, string> = {
  academic: "Academic",
  break: "Break",
  prayer: "Prayer",
  hifz: "Hifz block",
  assembly: "Assembly",
  other: "Other",
};

// ─── Slot dialog state ────────────────────────────────────────────────
interface SlotFormState {
  name: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  kind: TimetableSlotKind;
}
const emptySlotForm: SlotFormState = {
  name: "P1",
  dayOfWeek: 1,
  startTime: "08:00",
  endTime: "08:45",
  kind: "academic",
};

export function ManageTimetable() {
  const { orgId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [groups, setGroups] = useState<HifzGroup[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [cells, setCells] = useState<TimetableWeekCell[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Scope = which section / group's grid we're editing. URL-bound so
  // a deep link survives reload. `kind` is "section" | "group".
  const scopeKind = (search.get("scope") as "section" | "group") || "section";
  const scopeId = search.get("id") || "";

  const setScope = (kind: "section" | "group", id: string) => {
    const next = new URLSearchParams(search);
    next.set("scope", kind);
    next.set("id", id);
    setSearch(next);
  };

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotForm, setSlotForm] = useState<SlotFormState>(emptySlotForm);
  const [conflicts, setConflicts] = useState<RoomConflictPair[]>([]);
  const [teacherConflicts, setTeacherConflicts] = useState<TeacherConflictPair[]>([]);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  const refreshConflicts = () => {
    if (!orgId) return;
    listRoomConflicts(orgId)
      .then((r) => setConflicts(r.conflicts))
      .catch(() => setConflicts([]));
    listTeacherConflicts(orgId)
      .then((r) => setTeacherConflicts(r.conflicts))
      .catch(() => setTeacherConflicts([]));
  };
  useEffect(() => { refreshConflicts(); /* eslint-disable-next-line */ }, [orgId]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refreshSlots = () => {
    if (!orgId) return;
    listTimetableSlots(orgId).then(setSlots).catch(() => {});
  };

  useEffect(() => {
    if (!orgId) return;
    refreshSlots();
    listClasses(orgId).then(setClasses).catch(() => {});
    listHifzGroups(orgId).then(setGroups).catch(() => {});
    listAdminTeachers(orgId).then(setTeachers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // When the scope changes to a section, also pull that class's
  // class_subjects so the per-cell subject dropdown has options. For
  // Hifz groups there are no subjects; the cell just sets teacher + notes.
  useEffect(() => {
    if (!scopeId) { setCells([]); return; }
    setError(null);
    if (scopeKind === "section") {
      const cls = classes.find((c) => (c.sections ?? []).some((s) => s.id === scopeId));
      if (cls) {
        listClassSubjects(cls.id)
          .then((r) => setClassSubjects(r.subjects ?? []))
          .catch(() => setClassSubjects([]));
      }
      getSectionTimetable(orgId, scopeId).then((r) => setCells(r.cells)).catch((e) => setError(e.message));
    } else {
      setClassSubjects([]);
      getHifzGroupTimetable(orgId, scopeId).then((r) => setCells(r.cells)).catch((e) => setError(e.message));
    }
  }, [orgId, scopeKind, scopeId, classes]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  // Build the section dropdown options once.
  const sectionOptions = classes.flatMap((c) =>
    (c.sections ?? []).map((s) => ({
      id: s.id,
      label: `${c.name} — ${s.name}`,
    })),
  );

  const handleAddSlot = async () => {
    try {
      await createTimetableSlot(orgId, slotForm);
      setSlotDialogOpen(false);
      refreshSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteSlot = async (slot: TimetableSlot) => {
    if (!confirm(`Remove "${slot.name}" (${DAYS[slot.dayOfWeek - 1]} ${slot.startTime})?\n\nAll section + group entries on this slot will be removed too.`)) return;
    try {
      await deleteTimetableSlot(orgId, slot.id);
      refreshSlots();
      // Reload the cells too if the deleted slot was on screen.
      if (scopeId) {
        if (scopeKind === "section") {
          getSectionTimetable(orgId, scopeId).then((r) => setCells(r.cells));
        } else {
          getHifzGroupTimetable(orgId, scopeId).then((r) => setCells(r.cells));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Save or update a single cell. Creates the entry if none exists,
  // otherwise PATCHes the existing one. Removes when both subject and
  // teacher come back empty (the admin clicked "Clear").
  //
  // Returns a result object so the cell row can render an inline
  // room-conflict warning with a "Save anyway" override button without
  // each cell re-implementing the try/catch dance.
  const saveCell = async (
    cell: TimetableWeekCell,
    patch: { sectionSubjectId?: string | null; teacherUserId?: string | null; room?: string | null; notes?: string | null },
    opts: { force?: boolean } = {},
  ): Promise<SaveResult> => {
    try {
      if (cell.entry) {
        await updateTimetableEntry(orgId, cell.entry.id, patch, opts);
      } else {
        await createTimetableEntry(orgId, {
          slotId: cell.slot.id,
          scopeSectionId: scopeKind === "section" ? scopeId : undefined,
          scopeHifzGroupId: scopeKind === "group" ? scopeId : undefined,
          sectionSubjectId: patch.sectionSubjectId ?? undefined,
          teacherUserId: patch.teacherUserId ?? undefined,
          room: patch.room ?? undefined,
          notes: patch.notes ?? undefined,
        }, opts);
      }
      // Refresh cells.
      if (scopeKind === "section") {
        const r = await getSectionTimetable(orgId, scopeId);
        setCells(r.cells);
      } else {
        const r = await getHifzGroupTimetable(orgId, scopeId);
        setCells(r.cells);
      }
      refreshConflicts();
      return { ok: true };
    } catch (e) {
      const conflict = getRoomConflictPayload(e) ?? undefined;
      const teacherConflict = getTeacherConflictPayload(e) ?? undefined;
      const message = e instanceof Error ? e.message : String(e);
      if (!conflict && !teacherConflict) setError(message);
      return { ok: false, conflict, teacherConflict, message };
    }
  };

  const clearCell = async (cell: TimetableWeekCell) => {
    if (!cell.entry) return;
    if (!confirm("Clear this slot's assignment?")) return;
    try {
      await deleteTimetableEntry(orgId, cell.entry.id);
      if (scopeKind === "section") {
        const r = await getSectionTimetable(orgId, scopeId);
        setCells(r.cells);
      } else {
        const r = await getHifzGroupTimetable(orgId, scopeId);
        setCells(r.cells);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className={sectionTitleClasses}>Timetable</h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            {scopeId
              ? "Fill the weekly grid for this class — pick a subject and teacher for each period. Times are set on the School schedule page."
              : "Each class needs a weekly schedule. Pick one below to start, and the page tracks how many periods you've filled in for each."}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {scopeId && (
            <Link to={`/school/orgs/${orgId}/admin/timetable`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All classes
              </Button>
            </Link>
          )}
          <Link to={`/school/orgs/${orgId}/admin/timetable/substitutions`}>
            <Button variant="outline" size="sm">Substitutions</Button>
          </Link>
          <Link to={`/school/orgs/${orgId}/admin/settings/school-schedule`}>
            <Button variant="outline" size="sm">School schedule</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* No scope picked → show the sections checklist (the page's
          new home view). Once the admin clicks a section, the URL
          gets ?scope=…&id=… and we fall through to the existing
          per-section fill-in flow. */}
      {!scopeId && <TimetableSectionsChecklist />}
      {!scopeId && null /* hide everything below until a section is picked */}
      {scopeId && (
        <>
      {/* Org-wide conflict banner — surfaces room and teacher double-books.
          Clicking opens a modal listing each (room|teacher, day, overlap)
          collision so the admin can jump straight to fixing them. */}
      {/* Conflict banner only appears once a section/group is picked.
          Showing the org-wide count on the bare empty page was
          confusing — the user lands on this page, sees "132 teacher
          conflicts" with no assignments visible, and can't act on it. */}
      {scopeId && (conflicts.length > 0 || teacherConflicts.length > 0) && (
        <button
          type="button"
          onClick={() => setConflictModalOpen(true)}
          className="w-full text-left rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="font-medium">
            {conflicts.length > 0 && (
              <>{conflicts.length} room conflict{conflicts.length === 1 ? "" : "s"}</>
            )}
            {conflicts.length > 0 && teacherConflicts.length > 0 && " · "}
            {teacherConflicts.length > 0 && (
              <>{teacherConflicts.length} teacher conflict{teacherConflicts.length === 1 ? "" : "s"}</>
            )}
          </span>
          <span className="text-xs text-amber-700">— click to review</span>
        </button>
      )}

      <Dialog open={conflictModalOpen} onOpenChange={setConflictModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Timetable conflicts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {conflicts.length === 0 && teacherConflicts.length === 0 && (
              <div className="text-sm text-slate-500 italic">No conflicts.</div>
            )}
            {conflicts.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Rooms</div>
                {conflicts.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm"
                  >
                    <div className="text-xs font-semibold text-amber-900">
                      Room {p.room} · {DAYS[p.dayOfWeek - 1]}
                    </div>
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[p.a, p.b].map((e, j) => (
                        <div key={j} className="rounded border border-amber-100 bg-white px-2 py-1">
                          <div className="font-medium text-slate-800">
                            {e.subjectName ?? "Slot"} — {e.scopeLabel}
                          </div>
                          <div className="text-slate-500">
                            {e.slotName} · {e.startTime}–{e.endTime}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {teacherConflicts.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-800">Teachers</div>
                {teacherConflicts.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-rose-200 bg-rose-50/40 px-3 py-2 text-sm"
                  >
                    <div className="text-xs font-semibold text-rose-900">
                      {p.teacherName ?? "Teacher"} · {DAYS[p.dayOfWeek - 1]}
                    </div>
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[p.a, p.b].map((e, j) => (
                        <div key={j} className="rounded border border-rose-100 bg-white px-2 py-1">
                          <div className="font-medium text-slate-800">
                            {e.subjectName ?? "Slot"} — {e.scopeLabel}
                          </div>
                          <div className="text-slate-500">
                            {e.slotName} · {e.startTime}–{e.endTime}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-day "Time slots" list removed — the template editor above
          owns slot generation, and per-day one-off variations (Friday
          early-close etc.) belong in a future per-day override feature
          on the template, not a fallback. */}

      {/* ─── Scope picker + weekly grid ─── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Fill in slots
          </h2>
          <div className="flex items-center gap-2">
            <Select
              value={scopeKind}
              onValueChange={(v) => { setScope(v as "section" | "group", ""); }}
            >
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="section">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Section</span>
                </SelectItem>
                <SelectItem value="group">
                  <span className="inline-flex items-center gap-1"><BookMarked className="h-3 w-3" /> Hifz group</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={scopeId || "__none__"}
              onValueChange={(v) => setScope(scopeKind, v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs w-64">
                <SelectValue placeholder={`Pick a ${scopeKind}…`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Pick…</SelectItem>
                {scopeKind === "section"
                  ? sectionOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))
                  : groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!scopeId ? (
          <Card>
            <CardContent className="p-6 text-sm text-slate-500 italic text-center">
              <Calendar className="h-6 w-6 mx-auto text-slate-300 mb-2" />
              Pick a section or Hifz group above to start filling slots.
            </CardContent>
          </Card>
        ) : (
          <WeekGrid
            cells={cells}
            scopeKind={scopeKind}
            classSubjects={classSubjects}
            teachers={teachers}
            onSave={saveCell}
            onClear={clearCell}
          />
        )}
      </section>

      {/* Slot dialog */}
      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New time slot</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={slotForm.name}
                  onChange={(e) => setSlotForm({ ...slotForm, name: e.target.value })}
                  placeholder="P1 / Break / Zuhr"
                />
              </div>
              <div>
                <Label>Day</Label>
                <Select
                  value={String(slotForm.dayOfWeek)}
                  onValueChange={(v) => setSlotForm({ ...slotForm, dayOfWeek: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start</Label>
                <Input
                  type="time"
                  value={slotForm.startTime}
                  onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="time"
                  value={slotForm.endTime}
                  onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Kind</Label>
              <Select
                value={slotForm.kind}
                onValueChange={(v) => setSlotForm({ ...slotForm, kind: v as TimetableSlotKind })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as TimetableSlotKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlotDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSlot}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Substitutions moved to /admin/timetable/substitutions. */}
        </>
      )}
    </div>
  );
}

// ─── Weekly grid component ───────────────────────────────────────────
// Groups slots by day-of-week; renders one row per slot with inline
// subject/teacher/room editors. Saves on blur to keep the UX snappy
// without an explicit save button per cell.
type SavePatch = { sectionSubjectId?: string | null; teacherUserId?: string | null; room?: string | null; notes?: string | null };
type SaveResult =
  | { ok: true }
  | { ok: false; conflict?: RoomConflictError; teacherConflict?: TeacherConflictError; message: string };
interface WeekGridProps {
  cells: TimetableWeekCell[];
  scopeKind: "section" | "group";
  classSubjects: ClassSubject[];
  teachers: AdminTeacher[];
  onSave: (cell: TimetableWeekCell, patch: SavePatch, opts?: { force?: boolean }) => Promise<SaveResult>;
  onClear: (cell: TimetableWeekCell) => void;
}
function WeekGrid({ cells, scopeKind, classSubjects, teachers, onSave, onClear }: WeekGridProps) {
  // Group by day-of-week so the parent can scan a column-per-day mental
  // model. The slot list is sorted by (day, start_time) already.
  const byDay = useMemo(() => {
    const m = new Map<number, TimetableWeekCell[]>();
    for (const c of cells) {
      const arr = m.get(c.slot.dayOfWeek) ?? [];
      arr.push(c);
      m.set(c.slot.dayOfWeek, arr);
    }
    return m;
  }, [cells]);

  if (cells.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-slate-500 italic">
          No time slots defined yet. Add slots above first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {DAYS.map((day, i) => {
        const dow = i + 1;
        const dayCells = byDay.get(dow) ?? [];
        if (dayCells.length === 0) return null;
        return (
          <Card key={dow}>
            <CardContent className="p-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                {day}
              </div>
              <div className="space-y-1.5">
                {dayCells.map((cell) => (
                  <CellRow
                    key={cell.slot.id}
                    cell={cell}
                    scopeKind={scopeKind}
                    classSubjects={classSubjects}
                    teachers={teachers}
                    onSave={onSave}
                    onClear={onClear}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface CellRowProps {
  cell: TimetableWeekCell;
  scopeKind: "section" | "group";
  classSubjects: ClassSubject[];
  teachers: AdminTeacher[];
  onSave: WeekGridProps["onSave"];
  onClear: WeekGridProps["onClear"];
}
function CellRow({ cell, scopeKind, classSubjects, teachers, onSave, onClear }: CellRowProps) {
  // Editable copy of the entry so we can debounce / blur-save without
  // re-fetching on every keystroke.
  const [draftSubject, setDraftSubject] = useState(cell.entry?.sectionSubjectId ?? "");
  const [draftTeacher, setDraftTeacher] = useState(cell.entry?.teacherUserId ?? "");
  const [draftRoom, setDraftRoom] = useState(cell.entry?.room ?? "");

  // Conflict state. Set when the most recent save was rejected with a
  // 409 — the row shows an inline warning + "Save anyway" button that
  // re-issues the same patch with force=true.
  const [conflict, setConflict] = useState<RoomConflictError | null>(null);
  const [teacherConflict, setTeacherConflict] = useState<TeacherConflictError | null>(null);
  const [lastPatch, setLastPatch] = useState<SavePatch | null>(null);

  const trySave = async (patch: SavePatch) => {
    setLastPatch(patch);
    const r = await onSave(cell, patch);
    if (!r.ok && r.conflict) setConflict(r.conflict); else setConflict(null);
    if (!r.ok && r.teacherConflict) setTeacherConflict(r.teacherConflict); else setTeacherConflict(null);
  };
  const forceSave = async () => {
    if (!lastPatch) return;
    const r = await onSave(cell, lastPatch, { force: true });
    if (r.ok) { setConflict(null); setTeacherConflict(null); }
  };

  useEffect(() => {
    setDraftSubject(cell.entry?.sectionSubjectId ?? "");
    setDraftTeacher(cell.entry?.teacherUserId ?? "");
    setDraftRoom(cell.entry?.room ?? "");
  }, [cell.entry?.id, cell.entry?.sectionSubjectId, cell.entry?.teacherUserId, cell.entry?.room]);

  // Break / prayer / assembly rows skip the subject/teacher editors —
  // they're informational, not assignment slots.
  const isInformational = cell.slot.kind === "break" || cell.slot.kind === "prayer" || cell.slot.kind === "assembly";

  return (
    <div className="space-y-1">
    <div className={"rounded-lg border p-2 flex flex-wrap items-center gap-2 " + KIND_TONE[cell.slot.kind]}>
      <div className="min-w-0 flex-shrink-0 w-32">
        <div className="text-xs font-semibold">{cell.slot.name}</div>
        <div className="text-[10px] opacity-80">
          {cell.slot.startTime}–{cell.slot.endTime}
        </div>
      </div>

      {isInformational ? (
        <div className="flex-1 text-xs italic opacity-80">
          {KIND_LABEL[cell.slot.kind]}
        </div>
      ) : (
        <>
          {/* Subject only makes sense for a section scope */}
          {scopeKind === "section" && (
            <Select
              value={draftSubject || "__none__"}
              onValueChange={(v) => {
                const next = v === "__none__" ? null : v;
                setDraftSubject(next ?? "");
                trySave({ sectionSubjectId: next });
              }}
            >
              <SelectTrigger className="h-7 text-xs w-40 bg-white">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No subject —</SelectItem>
                {classSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={draftTeacher || "__none__"}
            onValueChange={(v) => {
              const next = v === "__none__" ? null : v;
              setDraftTeacher(next ?? "");
              trySave({ teacherUserId: next });
            }}
          >
            <SelectTrigger className="h-7 text-xs w-44 bg-white">
              <SelectValue placeholder="Teacher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— No teacher —</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  {t.full_name || t.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={draftRoom}
            onChange={(e) => setDraftRoom(e.target.value)}
            onBlur={() => {
              if ((cell.entry?.room ?? "") !== draftRoom) {
                trySave({ room: draftRoom || null });
              }
            }}
            placeholder="Room"
            className="h-7 text-xs w-24 bg-white"
          />

          {cell.entry && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onClear(cell)}
              title="Clear slot"
              className="h-7 px-2"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          )}
        </>
      )}
    </div>
    {conflict && (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
        <span>
          Room <strong>{draftRoom || conflict.conflicts[0]?.room}</strong> is already used
          {conflict.conflicts.map((cf, i) => (
            <span key={cf.entryId}>
              {i === 0 ? " by " : i === conflict.conflicts.length - 1 ? " and " : ", "}
              <strong>{cf.subjectName ?? "another slot"}</strong> ({cf.scopeLabel})
            </span>
          ))}
          {" "}during this period.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          onClick={forceSave}
        >
          Save anyway
        </Button>
        <button
          type="button"
          className="text-amber-700 underline text-[11px]"
          onClick={() => {
            setConflict(null);
            setDraftRoom(cell.entry?.room ?? "");
          }}
        >
          Cancel
        </button>
      </div>
    )}
    {teacherConflict && (
      <div className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-900 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-rose-700 shrink-0" />
        <span>
          <strong>{teacherConflict.teacherName ?? "This teacher"}</strong> is already booked
          {teacherConflict.conflicts.map((cf, i) => (
            <span key={cf.entryId}>
              {i === 0 ? " for " : i === teacherConflict.conflicts.length - 1 ? " and " : ", "}
              <strong>{cf.subjectName ?? "another slot"}</strong> ({cf.scopeLabel})
            </span>
          ))}
          {" "}during this period.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          onClick={forceSave}
        >
          Save anyway
        </Button>
        <button
          type="button"
          className="text-rose-700 underline text-[11px]"
          onClick={() => {
            setTeacherConflict(null);
            setDraftTeacher(cell.entry?.teacherUserId ?? "");
          }}
        >
          Cancel
        </button>
      </div>
    )}
    </div>
  );
}

export default ManageTimetable;
