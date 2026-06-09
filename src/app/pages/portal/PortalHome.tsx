// PortalHome — multi-child landing page for the parent portal.
//
// PR feat/parent-portal-home: replaces the previous "auto-redirect if
// single child" behavior with a real overview. Parents with one OR
// many children land here first and see plain-language status pills
// per child ("Present today", "Fee due", "Hifz revision needed").
// Tapping a card drills into that child's dashboard.
//
// Student-typed PIN tokens still skip straight to their own dashboard —
// students don't need a picker.

import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, AlertCircle } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import {
  getTodaySnapshot,
  type TodaySnapshot,
} from "../../../utils/schoolPortalApi";
import { TodayStatusPills } from "./TodayStatusPills";

export function PortalHome() {
  const { subject } = usePinAuth();
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<Record<string, TodaySnapshot>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Students-typed PIN: jump straight to their own dashboard.
  if (subject?.subjectType === "student") {
    return <Navigate to={`/school-portal/students/${subject.subjectId}`} replace />;
  }

  const students = subject?.students ?? [];

  useEffect(() => {
    let cancelled = false;
    students.forEach((s) => {
      getTodaySnapshot(s.id)
        .then((snap) => {
          if (!cancelled) setSnapshots((m) => ({ ...m, [s.id]: snap }));
        })
        .catch((e) => {
          if (!cancelled) setErrors((m) => ({
            ...m,
            [s.id]: e instanceof Error ? e.message : "Failed to load",
          }));
        });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.length]);

  if (!subject) return null;

  return (
    <div className="space-y-5">
      <HeroCard
        title={`As-salāmu ʿalaykum, ${subject.parent?.fullName ?? "Parent"}`}
        subtitle={
          students.length === 0
            ? "No students are linked to your account yet."
            : students.length === 1
            ? "Tap your child's card to see today's update."
            : `${students.length} children. Tap a card to drill in.`
        }
      />

      {students.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-sm text-slate-600 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-slate-900">No students linked</div>
            <p className="mt-1">Your account isn't connected to any students. Please contact the school office to link your children.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((s) => {
            const snap = snapshots[s.id];
            const err = errors[s.id];
            return (
              <Link
                key={s.id}
                to={`/school-portal/students/${s.id}`}
                className="block bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-300 transition overflow-hidden"
              >
                <div className="p-4 flex items-center gap-4">
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt={s.fullName}
                      className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-semibold shrink-0">
                      {s.fullName.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{s.fullName}</div>
                    <div className="text-xs text-slate-500">
                      {snap?.student.className && snap?.student.sectionName
                        ? `${snap.student.className} — ${snap.student.sectionName}`
                        : `GR # ${s.grNumber}`}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 shrink-0" />
                </div>
                <div className="px-4 pb-3">
                  {err ? (
                    <div className="text-[11px] text-rose-700">{err}</div>
                  ) : !snap ? (
                    <div className="text-[11px] text-slate-400 italic">{t("common.loading")}</div>
                  ) : (
                    <TodayStatusPills
                      studentId={s.id}
                      snapshot={snap}
                      variant="compact"
                    />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PortalHome;
