// MyForms — parent-facing list of forms targeted at them (or their kids).
// Renders status pills (Not submitted / Submitted / Expired), deadline
// countdowns, and an audience hint per form. Clicking a card navigates to
// /school-portal/forms/:formId where the parent can fill or review it.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Mailbox } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import { listMyForms, type MyFormSummary } from "../../../utils/schoolPortalApi";

type DerivedStatus = "not_submitted" | "submitted" | "expired";

function deriveStatus(item: MyFormSummary): DerivedStatus {
  const { form, hasResponded } = item;
  if (form.status === "closed") return "expired";
  if (form.deadline) {
    const d = new Date(form.deadline).getTime();
    if (!Number.isNaN(d) && d < Date.now()) return "expired";
  }
  if (hasResponded) return "submitted";
  return "not_submitted";
}

function statusBadgeClasses(status: DerivedStatus): string {
  switch (status) {
    case "submitted":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "expired":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "not_submitted":
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function statusLabel(status: DerivedStatus): string {
  if (status === "submitted") return "Submitted";
  if (status === "expired") return "Closed";
  return "Not submitted";
}

function deadlineLabel(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline).getTime();
  if (Number.isNaN(d)) return null;
  const diffMs = d - Date.now();
  if (diffMs < 0) return "Closed";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  if (days <= 7) return `Closes in ${days} days`;
  return `Closes ${new Date(deadline).toLocaleDateString()}`;
}

function audienceHint(form: MyFormSummary["form"]): string {
  switch (form.audience_kind) {
    case "whole_school":
      return "Whole school";
    case "class_section":
      return "Class / section";
    case "specific_students":
      return "Specific students";
    default:
      return "";
  }
}

export function MyForms() {
  const { subject } = usePinAuth();
  const orgId = subject?.orgId ?? "";
  const [items, setItems] = useState<MyFormSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setItems(null);
    setError(null);
    (async () => {
      try {
        const res = await listMyForms(orgId);
        if (!cancelled) setItems(res.forms);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load forms");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const unansweredCount = useMemo(() => {
    if (!items) return 0;
    return items.filter((i) => deriveStatus(i) === "not_submitted").length;
  }, [items]);

  const rightSlot = items ? (
    unansweredCount > 0 ? (
      <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium px-2.5 py-1">
        {unansweredCount} unanswered
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium px-2.5 py-1">
        All caught up
      </span>
    )
  ) : undefined;

  return (
    <div className="space-y-5">
      <HeroCard
        title="Forms"
        subtitle="Surveys, consent forms, and other requests from your school."
        rightSlot={rightSlot}
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!items && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${cardBase} ${cardElev} p-5 animate-pulse`}>
              <div className="h-4 w-2/3 bg-slate-200 rounded mb-3" />
              <div className="h-3 w-full bg-slate-100 rounded mb-2" />
              <div className="h-3 w-4/5 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <div
          className={`${cardBase} ${cardElev} p-10 flex flex-col items-center text-center`}
        >
          <Mailbox className="h-10 w-10 text-slate-400 mb-3" />
          <div className="text-slate-700 font-medium">No forms right now</div>
          <div className="text-slate-500 text-sm mt-1">
            When your school sends a form, it will show up here.
          </div>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => {
            const status = deriveStatus(item);
            const deadline = deadlineLabel(item.form.deadline);
            return (
              <Link
                key={item.form.id}
                to={`/school-portal/forms/${item.form.id}`}
                className={`${cardBase} ${cardElev} p-5 block hover:border-indigo-300 transition`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {item.form.title}
                    </h3>
                    {item.form.description && (
                      <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                        {item.form.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium border rounded-full px-2.5 py-1 ${statusBadgeClasses(
                      status,
                    )}`}
                  >
                    {statusLabel(status)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {deadline && (
                    <span
                      className={
                        deadline === "Closed"
                          ? "text-slate-500"
                          : deadline === "Closes today" || deadline === "Closes tomorrow"
                            ? "text-amber-700 font-medium"
                            : "text-slate-600"
                      }
                    >
                      {deadline}
                    </span>
                  )}
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{audienceHint(item.form)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
