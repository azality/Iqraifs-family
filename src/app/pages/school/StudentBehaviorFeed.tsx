// StudentBehaviorFeed — timeline of behavior notes for a single student.
// Embeddable; pass orgId + studentId. If allowDelete is true, callers who
// recorded the note OR who are org admins/principals see a delete button.

import { useEffect, useState } from "react";
import { Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  deleteBehaviorNote,
  getSchoolMe,
  getStudentBehaviorNotes,
  isOrgAdmin,
  type BehaviorNote,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

interface Props {
  orgId: string;
  studentId: string;
  sectionId?: string;
  allowDelete?: boolean;
  /** Optional refresh-trigger key — bumping it re-fetches the feed. */
  refreshKey?: number;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function StudentBehaviorFeed({
  orgId,
  studentId,
  allowDelete,
  refreshKey,
}: Props) {
  const [notes, setNotes] = useState<BehaviorNote[]>([]);
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null));
  }, []);

  const load = () => {
    setLoading(true);
    getStudentBehaviorNotes(orgId, studentId)
      .then((r) => setNotes(r.notes))
      .catch((e) => setError(e?.message || "Failed to load notes"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!orgId || !studentId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, studentId, refreshKey]);

  const canDelete = (n: BehaviorNote): boolean => {
    if (!allowDelete) return false;
    if (isOrgAdmin(me, orgId)) return true;
    return !!me?.userId && n.recordedBy === me.userId;
  };

  const handleDelete = async (n: BehaviorNote) => {
    if (!confirm("Delete this behavior note?")) return;
    try {
      await deleteBehaviorNote(orgId, n.id);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading && notes.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading notes…</p>;
  }
  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No behavior notes yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {notes.map((n) => {
        const positive = n.kind === "positive";
        return (
          <li
            key={n.id}
            className={
              "rounded-lg border p-3 " +
              (positive ? "border-emerald-100 bg-emerald-50/40" : "border-rose-100 bg-rose-50/40")
            }
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                {positive ? (
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      "text-[10px] uppercase tracking-wide " +
                      (positive
                        ? "border-emerald-300 text-emerald-700"
                        : "border-rose-300 text-rose-700")
                    }
                  >
                    {n.kind}
                  </Badge>
                  {n.category && (
                    <span className="text-xs font-medium text-slate-700">{n.category}</span>
                  )}
                  <span
                    className={
                      "ml-auto text-xs font-semibold tabular-nums " +
                      (n.points >= 0 ? "text-emerald-700" : "text-rose-700")
                    }
                  >
                    {n.points > 0 ? `+${n.points}` : n.points}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{n.notes}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>{relTime(n.observedAt)}</span>
                  {n.recordedBy && <span>· by {n.recordedBy.slice(0, 8)}</span>}
                </div>
              </div>
              {canDelete(n) && (
                <Button variant="ghost" size="sm" onClick={() => handleDelete(n)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
