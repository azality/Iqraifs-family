// ParentInbox — admin/principal/office_staff view of parent messages.
//
// Same chat-style layout as the parent ContactSchool page; mirror images
// of each other. Front-office uses this all day to triage parent calls
// that would otherwise come in by WhatsApp/phone.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, Send, Inbox, MessageSquare, User,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  getSchoolMe, viewerRoleForOrg,
  listInbox, getInboxThread, replyToInboxThread,
  type InboxThread, type InboxThreadDetail, type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { sectionTitleClasses } from "../../components/school-ui";

function isStaff(me: SchoolMeResponse | null, orgId: string): boolean {
  const role = viewerRoleForOrg(me, orgId);
  return role === "principal" || role === "admin" || role === "office_staff";
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ParentInbox() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [search, setSearch] = useSearchParams();
  const activeThreadId = search.get("thread") || "";
  const setActiveThreadId = (id: string) => {
    const next = new URLSearchParams(search);
    if (id) next.set("thread", id); else next.delete("thread");
    setSearch(next);
  };

  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [detail, setDetail] = useState<InboxThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refreshList = () => {
    if (!orgId) return;
    setLoading(true);
    listInbox(orgId)
      .then((r) => { setThreads(r.threads); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(refreshList, [orgId]);

  useEffect(() => {
    if (!orgId || !activeThreadId) { setDetail(null); return; }
    getInboxThread(orgId, activeThreadId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load thread"));
  }, [orgId, activeThreadId]);

  const totalUnread = useMemo(
    () => threads.reduce((s, t) => s + t.unreadCount, 0),
    [threads],
  );

  if (meLoading) {
    return (
      <div className="p-6 text-sm text-slate-500">Loading inbox…</div>
    );
  }
  if (!isStaff(me, orgId)) {
    // Defensive — F17 saw office_staff land on a blank body. If we
    // ever fail isStaff here, render an explanation and a link back
    // instead of an invisible <Navigate /> that may not fire.
    return (
      <div className="p-6 text-sm text-rose-700 space-y-2">
        <div>This page is restricted to principals, admins, and office staff.</div>
        <Link to={`/school/orgs/${orgId}`} className="underline">Return to dashboard →</Link>
      </div>
    );
  }

  const handleReply = async () => {
    if (!detail || !replyBody.trim()) return;
    setSending(true);
    try {
      await replyToInboxThread(orgId, detail.thread.threadId, replyBody.trim());
      setReplyBody("");
      const r = await getInboxThread(orgId, detail.thread.threadId);
      setDetail(r);
      refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Admin
          </Button>
        </Link>
      </div>
      <div>
        <h1 className={sectionTitleClasses}>
          Parent inbox
          {totalUnread > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-indigo-600 text-white text-xs font-medium px-2 py-0.5">
              {totalUnread} unread
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Parent → school messages from the portal. Replies show up in the parent's
          Contact school screen.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Thread list */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <Inbox className="h-6 w-6 mx-auto text-slate-300 mb-2" />
              No messages yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {threads.map((thr) => (
                <li key={thr.threadId}>
                  <button
                    type="button"
                    onClick={() => setActiveThreadId(thr.threadId)}
                    className={
                      "w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-2 " +
                      (thr.threadId === activeThreadId ? "bg-indigo-50/40" : "")
                    }
                  >
                    <div className={
                      "h-2 w-2 rounded-full mt-2 shrink-0 " +
                      (thr.unreadCount > 0 ? "bg-indigo-500" : "bg-transparent")
                    } />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={
                          "text-sm truncate " +
                          (thr.unreadCount > 0 ? "font-semibold text-slate-900" : "text-slate-800")
                        }>
                          {thr.subject}
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">{relTime(thr.latestAt)}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 inline-flex items-center gap-1">
                        <User className="h-3 w-3" /> {thr.parentName ?? "Parent"}
                        {thr.studentName ? ` · about ${thr.studentName}` : ""}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {thr.latestSentByRole === "school" ? "Us: " : "Parent: "}{thr.latestBody}
                      </div>
                    </div>
                    {thr.unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold shrink-0">
                        {thr.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Thread detail */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {!detail ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <MessageSquare className="h-6 w-6 mx-auto text-slate-300 mb-2" />
              Pick a thread on the left.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="text-sm font-semibold text-slate-900">{detail.thread.subject}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {detail.thread.parentName ?? "Parent"}
                  {detail.thread.studentName ? ` · about ${detail.thread.studentName}` : ""}
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-[55vh] overflow-y-auto">
                {detail.messages.map((m) => {
                  const us = m.sentByRole === "school";
                  return (
                    <div key={m.id} className={"flex " + (us ? "justify-end" : "justify-start")}>
                      <div
                        className={
                          "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap " +
                          (us ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-900")
                        }
                      >
                        {!us && (
                          <div className="text-[10px] font-semibold opacity-80 mb-0.5">
                            {m.sentByName ?? detail.thread.parentName ?? "Parent"}
                          </div>
                        )}
                        {us && m.sentByName && (
                          <div className="text-[10px] font-semibold opacity-80 mb-0.5">{m.sentByName}</div>
                        )}
                        {m.body}
                        <div className={"text-[10px] mt-1 " + (us ? "text-indigo-100" : "text-slate-500")}>
                          {relTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 p-3 flex gap-2 items-end">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Reply to the parent…"
                  className="text-sm min-h-[60px]"
                  maxLength={4000}
                />
                <Button onClick={handleReply} disabled={sending || !replyBody.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ParentInbox;
