// RosterReviewQueue — admin/principal queue for reviewing teacher-submitted
// roster change requests. Tabs: Pending / Approved / Rejected.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  ClipboardList,
  ChevronLeft,
  Check,
  X,
  UserPlus,
  UserMinus,
} from "lucide-react";
import {
  getRosterRequests,
  getSchoolMe,
  isOrgAdmin,
  patchRosterRequest,
  type RosterRequest,
  type RosterRequestStatus,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

type Tab = "pending" | "approved" | "rejected";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

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

export function RosterReviewQueue() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [requests, setRequests] = useState<RosterRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Review dialog state.
  const [review, setReview] = useState<{
    req: RosterRequest;
    status: "approved" | "rejected";
  } | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    getRosterRequests(orgId, { status: tab as RosterRequestStatus })
      .then((r) => setRequests(r.requests))
      .catch((e) => setError(e?.message || "Failed to load requests"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, tab]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  const openReview = (req: RosterRequest, status: "approved" | "rejected") => {
    setReview({ req, status });
    setReviewerNotes("");
  };

  const submitReview = async () => {
    if (!review) return;
    setSubmitting(true);
    try {
      await patchRosterRequest(orgId, review.req.id, {
        status: review.status,
        reviewerNotes: reviewerNotes.trim() || undefined,
      });
      toast.success(`Request ${review.status}.`);
      setReview(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-indigo-600" />
          Roster requests
        </h1>
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" /> Admin
          </Button>
        </Link>
      </div>

      <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
              (tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading && requests.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No {tab} requests.
            </p>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id} className="p-4 flex flex-wrap items-start gap-3">
                  <div className="mt-1">
                    {r.kind === "add" ? (
                      <UserPlus className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <UserMinus className="h-5 w-5 text-rose-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {r.kind}
                      </Badge>
                      <span className="text-sm font-medium">
                        {r.newStudentPayload
                          ? `${r.newStudentPayload.fullName} (new — GR# ${r.newStudentPayload.grNumber})`
                          : r.studentId
                          ? `Student ${r.studentId.slice(0, 8)}…`
                          : "—"}
                      </span>
                      <span className="text-xs text-slate-500">
                        section {r.sectionId.slice(0, 8)}…
                      </span>
                    </div>
                    {r.reason && (
                      <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                        {r.reason}
                      </p>
                    )}
                    <div className="mt-1 text-xs text-slate-500">
                      Submitted {relTime(r.createdAt)}
                      {r.requestedBy && ` · by ${r.requestedBy.slice(0, 8)}`}
                    </div>
                    {r.status !== "pending" && r.reviewerNotes && (
                      <p className="mt-1 text-xs italic text-slate-600">
                        Reviewer: {r.reviewerNotes}
                      </p>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReview(r, "rejected")}
                      >
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => openReview(r, "approved")}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!review} onOpenChange={(v) => { if (!v) setReview(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {review?.status === "approved" ? "Approve request" : "Reject request"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              {review?.status === "approved"
                ? "Approving will apply the roster change immediately."
                : "Rejecting will close the request without applying any changes."}
            </p>
            <Textarea
              placeholder="Reviewer notes (optional)"
              rows={3}
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitReview} disabled={submitting}>
              {submitting ? "Saving…" : `Confirm ${review?.status}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
