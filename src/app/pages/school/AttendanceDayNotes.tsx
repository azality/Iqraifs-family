// Attendance day notes — org-wide "why was attendance unusual today"
// annotations on the principal/admin dashboard (pilot ask Sep 3 2026:
// a strike or protest call in Karachi kept kids home; months later the
// dip in the history should still be explainable).
//
// Everyone with org access sees the notes; only principal/admin can
// write (backend enforces; we also hide the controls). Self-contained:
// renders nothing while loading and stays a single slim strip.

import { useEffect, useState } from "react";
import { StickyNote, Pencil, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getSchoolMe,
  isOrgAdmin,
  listAttendanceDayNotes,
  putAttendanceDayNote,
  type AttendanceDayNote,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  orgId: string;
  /** Today's school-wide attendance %, when the dashboard has it. */
  todayPct?: number | null;
  /** Period average %, for "unusually low vs normal" comparison. */
  periodPct?: number | null;
}

export function AttendanceDayNotes({ orgId, todayPct = null, periodPct = null }: Props) {
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [notes, setNotes] = useState<AttendanceDayNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const today = todayStr();
  const canEdit = isOrgAdmin(me, orgId);
  const todayNote = notes.find((n) => n.noteDate === today) ?? null;
  const pastNotes = notes.filter((n) => n.noteDate !== today);

  // Auto-nudge: today's attendance is unusually low — either in absolute
  // terms (< 70%) or well below the period's normal (10+ points under).
  // Only when some attendance HAS been recorded (null = nothing marked
  // yet this morning; nudging then would be noise).
  const lowToday =
    todayPct != null &&
    todayPct > 0 &&
    (todayPct < 70 || (periodPct != null && periodPct - todayPct >= 10));
  const nudge = lowToday && !todayNote && canEdit;

  const refresh = () => {
    const start = new Date(Date.now() - 60 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    listAttendanceDayNotes(orgId, { startDate: start })
      .then((r) => setNotes(r.notes))
      .catch(() => {})
      .finally(() => setLoaded(true));
  };

  useEffect(() => {
    if (!orgId) return;
    getSchoolMe().then(setMe).catch(() => setMe(null));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Nothing to show: still loading, or a non-admin org with no notes.
  if (!loaded) return null;
  if (!canEdit && notes.length === 0) return null;

  const save = async () => {
    setSaving(true);
    try {
      await putAttendanceDayNote(orgId, today, draft);
      toast.success(draft.trim() ? "Day note saved" : "Day note removed");
      setEditing(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={
        "rounded-xl border px-4 py-2.5 text-sm " +
        (nudge ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide " +
            (nudge ? "text-amber-700" : "text-slate-400")
          }
        >
          {nudge ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          ) : (
            <StickyNote className="h-3.5 w-3.5 text-amber-500" />
          )}
          Day note
        </span>

        {!editing && todayNote && (
          <span className="min-w-0 flex-1 text-slate-800">
            {todayNote.note}
            {todayNote.createdByName && (
              <span className="ml-1.5 text-xs text-slate-400">
                — {todayNote.createdByName}
              </span>
            )}
          </span>
        )}

        {!editing && !todayNote && canEdit && (
          nudge ? (
            <span className="min-w-0 flex-1 text-amber-900">
              Attendance is low today ({Math.round(todayPct as number)}%) —{" "}
              <button
                onClick={() => {
                  setDraft("");
                  setEditing(true);
                }}
                className="font-medium text-amber-900 underline hover:text-amber-950"
              >
                add a reason
              </button>{" "}
              so it's explainable later (strike, rain, event…).
            </span>
          ) : (
            <button
              onClick={() => {
                setDraft("");
                setEditing(true);
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              Add a note about today's attendance (e.g. strike, rain, event)
            </button>
          )
        )}

        {!editing && todayNote && canEdit && (
          <button
            onClick={() => {
              setDraft(todayNote.note);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-700"
            aria-label="Edit day note"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}

        {pastNotes.length > 0 && (
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            Past notes ({pastNotes.length})
            {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            autoFocus
            placeholder="e.g. Strike/protest call in Karachi — many parents kept children home"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            {todayNote && (
              <span className="text-[11px] text-slate-400">
                Clear the text and save to remove the note.
              </span>
            )}
          </div>
        </div>
      )}

      {historyOpen && pastNotes.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {pastNotes.map((n) => (
            <li key={n.noteDate} className="flex items-baseline gap-2 text-xs">
              <span className="w-24 flex-shrink-0 font-medium text-slate-500 tabular-nums">
                {dayLabel(n.noteDate)}
              </span>
              <span className="min-w-0 text-slate-700">
                {n.note}
                {n.createdByName && (
                  <span className="ml-1 text-slate-400">— {n.createdByName}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AttendanceDayNotes;
