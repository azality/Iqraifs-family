// StudentBehaviorFeed — timeline of behavior notes for a single student.
// Embeddable; pass orgId + studentId. If allowDelete is true, callers who
// recorded the note OR who are org admins/principals see a delete button.
//
// Wired into StudentDetail's Behavior tab (6 Sep 2026). Until then this
// file was written but imported nowhere, so a teacher looking at one
// child could see only a 30-day +N/−N tally and a link to the whole
// class's log — they had to find that child's notes by eye.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Sparkles, AlertTriangle, Plus } from "lucide-react";
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
  /** Rendered inside the empty state, so an empty feed offers the way in
   *  instead of being a dead end. */
  onAddNote?: () => void;
}

type TFn = (k: string, o?: Record<string, unknown>) => string;

function relTime(iso: string, t: TFn): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return t("behavior.justNow");
  if (m < 60) return t("behavior.minsAgo", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("behavior.hoursAgo", { n: h });
  const d = Math.round(h / 24);
  return t("behavior.daysAgo", { n: d });
}

export function StudentBehaviorFeed({
  orgId,
  studentId,
  allowDelete,
  refreshKey,
  onAddNote,
}: Props) {
  const { t } = useTranslation();
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
      .catch((e) => setError(e?.message || t("behavior.loadFailed")))
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
    if (!confirm(t("behavior.deleteConfirm"))) return;
    try {
      await deleteBehaviorNote(orgId, n.id);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading && notes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("behavior.loading")}</p>;
  }
  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }
  if (notes.length === 0) {
    // An empty log has to say what it is and offer the way in, not just
    // report emptiness — a teacher read the bare version as a refusal.
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <div>
          <p className="text-sm font-medium text-slate-800">
            {t("behavior.noneForStudent")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("behavior.noneForStudentBody")}
          </p>
        </div>
        {onAddNote && (
          <Button size="sm" onClick={onAddNote}>
            <Plus className="h-4 w-4 mr-1" /> {t("behavior.addANote")}
          </Button>
        )}
      </div>
    );
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
                    {t(`behavior.${n.kind}`)}
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
                  {/* recordedBy is a raw user id and the API returns no
                      name with it, so the old "· by 8d787815" told the
                      teacher nothing. Dropped until the note carries a
                      recorder name. */}
                  <span>{relTime(n.observedAt, t)}</span>
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
