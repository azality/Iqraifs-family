// ContactSchool — parent portal messaging surface.
//
// Layout:
//   [Compose] [Threads list]
//   selected: thread → chat-style message stream + reply box
//
// Mobile: thread list and thread detail are stacked; on desktop they
// sit side by side. The simplest workable layout — we can polish if
// the pilot reveals friction.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Send, MessageSquarePlus, ArrowLeft, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HeroCard } from "../../components/school-ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { usePinAuth } from "../../contexts/PinAuthContext";
import {
  listMyThreads, getMyThread, startThread, replyInThread,
  type MyThread, type MyThreadMessage,
} from "../../../utils/schoolPortalApi";

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

export function ContactSchool() {
  const { t } = useTranslation();
  const { subject } = usePinAuth();
  const [search, setSearch] = useSearchParams();
  const activeThreadId = search.get("thread") || "";
  const setActiveThreadId = (id: string) => {
    const next = new URLSearchParams(search);
    if (id) next.set("thread", id); else next.delete("thread");
    setSearch(next);
  };

  const [threads, setThreads] = useState<MyThread[]>([]);
  const [messages, setMessages] = useState<MyThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeStudentId, setComposeStudentId] = useState<string>("");
  const [sending, setSending] = useState(false);

  const [replyBody, setReplyBody] = useState("");

  const refreshThreads = () => {
    setLoading(true);
    listMyThreads()
      .then((r) => { setThreads(r.threads); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(refreshThreads, []);

  useEffect(() => {
    if (!activeThreadId) { setMessages([]); return; }
    getMyThread(activeThreadId)
      .then((r) => setMessages(r.messages))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load thread"));
  }, [activeThreadId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.threadId === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const handleSendNew = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      setError("Subject and message both required"); return;
    }
    setSending(true);
    try {
      const r = await startThread({
        subject: composeSubject.trim(),
        body: composeBody.trim(),
        studentId: composeStudentId || undefined,
      });
      setComposeOpen(false);
      setComposeSubject(""); setComposeBody(""); setComposeStudentId("");
      refreshThreads();
      setActiveThreadId(r.threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  };

  const handleReply = async () => {
    if (!activeThreadId || !replyBody.trim()) return;
    setSending(true);
    try {
      await replyInThread(activeThreadId, replyBody.trim());
      setReplyBody("");
      // Re-fetch the thread (cheap) and the list (for latest snippet).
      const r = await getMyThread(activeThreadId);
      setMessages(r.messages);
      refreshThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title="Contact school"
        subtitle="Message the office or your child's class teacher"
        rightSlot={
          <Button
            size="sm"
            onClick={() => setComposeOpen(true)}
            className="bg-white/10 border border-white/20 text-white hover:bg-white/20"
          >
            <MessageSquarePlus className="h-4 w-4 mr-1" /> New message
          </Button>
        }
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {/* Thread detail mode (mobile): show only the selected thread */}
      {activeThread ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <button
              onClick={() => setActiveThreadId("")}
              className="text-slate-500 hover:text-slate-800 p-1 -ml-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {activeThread.subject}
              </div>
              <div className="text-[11px] text-slate-500">
                {activeThread.messageCount} message{activeThread.messageCount === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {messages.map((m) => {
              const mine = m.sentByRole === "parent";
              return (
                <div key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
                  <div
                    className={
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap " +
                      (mine ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-900")
                    }
                  >
                    {!mine && m.sentByName && (
                      <div className="text-[10px] font-semibold opacity-80 mb-0.5">{m.sentByName}</div>
                    )}
                    {m.body}
                    <div className={"text-[10px] mt-1 " + (mine ? "text-indigo-100" : "text-slate-500")}>
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
              placeholder="Type your reply…"
              className="text-sm min-h-[60px]"
              maxLength={4000}
            />
            <Button onClick={handleReply} disabled={sending || !replyBody.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        // Thread list mode
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">{t("common.loading")}</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <MessageSquare className="h-6 w-6 mx-auto text-slate-300 mb-2" />
              No messages yet. Tap <strong>New message</strong> to start a conversation.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {threads.map((thr) => (
                <li key={thr.threadId}>
                  <button
                    type="button"
                    onClick={() => setActiveThreadId(thr.threadId)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3"
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
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {thr.latestSentByRole === "school" ? "School: " : "You: "}{thr.latestBody}
                      </div>
                    </div>
                    {thr.unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold">
                        {thr.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New message to the school</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Late tomorrow, fee receipt, ..." maxLength={200} className="text-sm" />
            </div>
            {subject?.students && subject.students.length > 0 && (
              <div>
                <Label className="text-xs">About which child? (optional)</Label>
                <Select value={composeStudentId || "__none__"} onValueChange={(v) => setComposeStudentId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="— General enquiry —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— General enquiry —</SelectItem>
                    {subject.students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Type your message…" maxLength={4000}
                className="text-sm min-h-[120px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={handleSendNew} disabled={sending || !composeSubject.trim() || !composeBody.trim()}>
              <Send className="h-4 w-4 mr-1" /> {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ContactSchool;
