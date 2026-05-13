// Parent-only review page for Guess-the-Prophet rounds.
//
// Lists each kid's recent rounds with the chosen Prophet, status, and a
// per-round override dialog. Two overrides supported:
//   - Award bonus points (any positive integer, with reason)
//   - Void the round (reverses any awarded points; the Prophet becomes
//     re-pickable for the kid sooner)
//
// Why this exists: the kid game is fast — a 6-year-old can tap the wrong
// Prophet in the picker, or get a "no" because we don't have a fact in
// the table. Parent wants to fix outcomes after the fact without
// invalidating the audit trail. Both override actions write point_events
// so Recent Activity reflects the change.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ChevronLeft, ChevronRight, Gamepad2, Loader2, Trophy, X, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useAuth } from "../contexts/AuthContext";
import {
  getChildRounds,
  parentOverrideRound,
  type RoundWithVoidMarker,
} from "../../utils/prophetGuessApi";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function statusBadge(round: RoundWithVoidMarker) {
  if (round.voided) {
    return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">Voided</Badge>;
  }
  if (round.status === "won") {
    return <Badge className="bg-green-600">Won</Badge>;
  }
  if (round.status === "lost") {
    return <Badge variant="destructive">Lost</Badge>;
  }
  return <Badge variant="secondary">In progress</Badge>;
}

export function GamesReview() {
  const { isParentMode } = useAuth();
  const { children: kids } = useFamilyContext();

  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [rounds, setRounds] = useState<RoundWithVoidMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Override dialog state
  const [overrideTarget, setOverrideTarget] = useState<RoundWithVoidMarker | null>(null);
  const [action, setAction] = useState<"award" | "void">("award");
  const [points, setPoints] = useState("5");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-select the first kid on mount
  useEffect(() => {
    if (!selectedChildId && kids.length > 0) {
      setSelectedChildId(kids[0].id);
    }
  }, [kids, selectedChildId]);

  const reload = async (childId: string) => {
    if (!childId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getChildRounds(childId);
      setRounds(r.rounds);
    } catch (e: any) {
      setError(e?.message || "Could not load rounds");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedChildId) reload(selectedChildId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  const openOverride = (round: RoundWithVoidMarker, initialAction: "award" | "void") => {
    setOverrideTarget(round);
    setAction(initialAction);
    setPoints(initialAction === "award" ? "5" : "");
    setReason("");
  };
  const closeOverride = () => setOverrideTarget(null);

  const submitOverride = async () => {
    if (!overrideTarget) return;
    if (reason.trim().length < 5) {
      toast.error("Please give a reason (5+ characters)");
      return;
    }
    if (action === "award") {
      const n = parseInt(points, 10);
      if (!Number.isInteger(n) || n <= 0 || n > 100) {
        toast.error("Points must be a whole number 1–100");
        return;
      }
    }
    setSubmitting(true);
    try {
      await parentOverrideRound(overrideTarget.id, {
        childId: overrideTarget.childId,
        action,
        points: action === "award" ? parseInt(points, 10) : undefined,
        reason: reason.trim(),
      });
      toast.success(
        action === "award"
          ? `Awarded ${points} points`
          : "Round voided — points reversed and Prophet re-pickable",
      );
      closeOverride();
      await reload(selectedChildId);
    } catch (e: any) {
      toast.error(e?.message || "Could not apply override");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isParentMode) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardHeader>
          <CardTitle>Parents only</CardTitle>
          <CardDescription>Switch to parent mode to review game rounds.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="h-3 w-3" />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
          <Gamepad2 className="h-6 w-6 text-purple-600" />
          Games review
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent Guess-the-Prophet rounds. Award bonus points or void a round if your kid made a mistake.
        </p>
      </div>

      {/* Kid picker */}
      {kids.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Reviewing:</span>
          {kids.map((k) => (
            <Button
              key={k.id}
              size="sm"
              variant={selectedChildId === k.id ? "default" : "outline"}
              onClick={() => setSelectedChildId(k.id)}
            >
              {k.avatar || "👤"} {k.name}
            </Button>
          ))}
        </div>
      )}

      {/* Rounds list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-6 flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      ) : rounds.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Gamepad2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            No rounds played yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rounds.map((round) => {
            const isOverridable = !round.voided;
            const isInProgress = round.status === "in-progress";
            const questionsAsked = round.questionsAsked.length;
            const guessesUsed = round.guessAttempts.length;
            return (
              <Card key={round.id} className={round.voided ? "opacity-60" : ""}>
                <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {round.prophet ? `${round.prophet.name} (${round.prophet.englishName ?? "—"})` : "Unknown prophet"}
                      </span>
                      {statusBadge(round)}
                      {round.pointsAwarded > 0 && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                          +{round.pointsAwarded} pts
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Started {dayLabel(round.startedAt)} · {questionsAsked} question{questionsAsked === 1 ? "" : "s"} · {guessesUsed} guess{guessesUsed === 1 ? "" : "es"}
                      {round.voided && round.voidReason && (
                        <span className="italic"> · voided: "{round.voidReason}"</span>
                      )}
                    </p>
                  </div>
                  {isOverridable && (
                    <div className="flex items-center gap-1.5">
                      {!isInProgress && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openOverride(round, "award")}
                          className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1" />
                          Award
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openOverride(round, "void")}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Void
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Override dialog */}
      <Dialog open={!!overrideTarget} onOpenChange={(o) => { if (!o) closeOverride(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {action === "award" ? (
                <><Trophy className="h-5 w-5 text-amber-600" /> Award bonus points</>
              ) : (
                <><X className="h-5 w-5 text-red-600" /> Void round</>
              )}
            </DialogTitle>
            <DialogDescription>
              {action === "award"
                ? "Give your kid extra points for this round. The bonus appears in Recent Activity."
                : "Voids the round and reverses any points awarded. The Prophet becomes re-pickable for them sooner."}
            </DialogDescription>
          </DialogHeader>

          {/* Tabs to switch action within the dialog */}
          {overrideTarget && !overrideTarget.voided && overrideTarget.status !== "in-progress" && (
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setAction("award")}
                className={`px-2.5 py-1 rounded-full ${action === "award" ? "bg-amber-100 text-amber-900 font-semibold" : "bg-gray-100 text-gray-600"}`}
              >
                Award points
              </button>
              <button
                onClick={() => setAction("void")}
                className={`px-2.5 py-1 rounded-full ${action === "void" ? "bg-red-100 text-red-900 font-semibold" : "bg-gray-100 text-gray-600"}`}
              >
                Void round
              </button>
            </div>
          )}

          <div className="space-y-3 py-2">
            {action === "award" && (
              <div className="space-y-1">
                <Label htmlFor="po-points">Bonus points</Label>
                <Input
                  id="po-points"
                  type="number"
                  min="1"
                  max="100"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  className="w-32"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="po-reason">Reason (5+ characters)</Label>
              <Textarea
                id="po-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  action === "award"
                    ? 'e.g. "Was right, tapped wrong button"'
                    : 'e.g. "Pressed buttons by accident — let\'s play fresh"'
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeOverride} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submitOverride}
              disabled={submitting || reason.trim().length < 5}
              className={action === "void" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              {action === "award" ? `Award ${points || 0} points` : "Void round"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
