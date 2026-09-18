// InboxButton — parent messages, in the school header.
//
// The inbox had no door of its own: principals and admins reached it
// through the "Today" menu and office staff through the toolbar list.
// Two clicks, easy to miss, and what is behind it is a parent waiting
// for a person to answer them (18 Sep: "there's no direct way for me as
// an admin or the principal to go to my messages").
//
// The badge counts parents STILL WAITING FOR A REPLY — not messages, not
// threads. A number that only falls when someone actually answers is the
// only one worth putting in a header.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { getInboxUnreadCount } from "../../../utils/schoolApi";

export function InboxButton({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const load = () => {
      getInboxUnreadCount(orgId)
        .then((r) => { if (!cancelled) setWaiting(r.unreadCount ?? 0); })
        // Silent: a header badge is never worth an error toast, and the
        // count re-derives on the next focus.
        .catch(() => {});
    };
    load();
    // Re-read when the tab is returned to. A reply sent on a phone, or
    // by a colleague, should not leave a stale number sitting in the
    // header for the rest of the day.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [orgId]);

  const label = t("toolbar.actions.parentInbox");

  return (
    <Link
      to={`/school/orgs/${orgId}/admin/inbox`}
      className="relative rounded-lg p-2 transition-colors hover:bg-slate-100"
      aria-label={waiting > 0 ? `${label} — ${waiting} waiting for a reply` : label}
      title={label}
    >
      <Mail className="h-4 w-4 text-slate-600" />
      {waiting > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {waiting > 9 ? "9+" : waiting}
        </span>
      )}
    </Link>
  );
}

export default InboxButton;
