// NotificationBell — the alerts bell in the school header.
//
// Every alert is computed from live data when the bell opens, so what
// you see is what is true right now: there is no queue that could be
// stale, and nothing to miss because a job didn't run.
//
// Mandatory alerts (roll call not taken, a hafiz milestone waiting on
// you) are marked and cannot be switched off anywhere — they're tied to
// something the role is accountable for. Everything else is governed by
// the principal's role defaults and each person's own overrides.
//
// The bell only shows things with an action or a consequence. A bell
// with forty items is a bell nobody reads, and then the mandatory ones
// stop working too.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bell } from "lucide-react";
import {
  getMyNotifications,
  markNotificationsRead,
  type NotificationAlert,
} from "../../../utils/schoolApi";

export function NotificationBell({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<NotificationAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    getMyNotifications(orgId)
      .then((r) => { setAlerts(r.alerts); setUnread(r.unreadCount); })
      .catch(() => { setAlerts([]); setUnread(0); })
      .finally(() => setLoading(false));
  };

  // Count on mount, and refresh when the bell is opened so it can't show
  // something that was dealt with in another tab.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgId]);
  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open]);

  // Close on outside click / Escape, like the rest of the header menus.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    const keys = alerts.filter((a) => !a.read).map((a) => a.key);
    if (keys.length === 0) return;
    // Optimistic: the list is derived, so a failed write just means the
    // dot comes back on the next open.
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnread(0);
    try { await markNotificationsRead(orgId, keys); } catch { load(); }
  };

  const openOne = async (a: NotificationAlert) => {
    setOpen(false);
    if (a.read) return;
    setUnread((n) => Math.max(0, n - 1));
    setAlerts((prev) => prev.map((x) => (x.key === a.key ? { ...x, read: true } : x)));
    try { await markNotificationsRead(orgId, [a.key]); } catch { /* re-derived next open */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 transition-colors hover:bg-slate-100"
        aria-label={unread > 0 ? `Alerts — ${unread} unread` : "Alerts"}
      >
        <Bell className="h-4 w-4 text-slate-600" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Alerts
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && alerts.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">Loading…</p>
            ) : alerts.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500">
                Nothing needs you right now.
              </p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {alerts.map((a) => {
                  const inner = (
                    <div className={"px-3 py-2.5 " + (a.read ? "opacity-60" : "")}>
                      <div className="flex items-start gap-2">
                        {!a.read && (
                          <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-indigo-500" />
                        )}
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-slate-800">{a.title}</p>
                          <p className="mt-0.5 text-[11.5px] leading-snug text-slate-600">{a.body}</p>
                          {a.tier === "mandatory" && (
                            <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              needs action
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={a.key} className="hover:bg-slate-50">
                      {a.href ? (
                        <Link to={a.href} onClick={() => openOne(a)} className="block">
                          {inner}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => openOne(a)} className="block w-full text-left">
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
