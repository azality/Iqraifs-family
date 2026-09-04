// PortalHome — the parent landing screen (design 10a).
//
// The daily check should take 20 seconds, zero taps: every child's card
// carries the whole story right here — attendance chip, then ONLY the
// lines that need the parent (due homework with a Submit link, the
// latest hifz result + tonight's task, teacher notes, a fee that's
// due). A quiet child gets one grey "nothing needs you" line — honest,
// not empty. School announcements and the real parent actions sit at
// the bottom. Tapping the child's name still drills into their pages.

import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, AlertCircle } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import {
  getTodaySnapshot,
  listMyAnnouncements,
  type TodaySnapshot,
} from "../../../utils/schoolPortalApi";
import { getSurah } from "../../../utils/quranSurahs";

function Dot({ tone }: { tone: "amber" | "emerald" | "rose" | "slate" | "indigo" }) {
  const bg = {
    amber: "#d97706", emerald: "#047857", rose: "#e11d48", slate: "#94a3b8", indigo: "#4f46e5",
  }[tone];
  return <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: bg }} />;
}

export function PortalHome() {
  const { subject } = usePinAuth();
  const { t, i18n } = useTranslation();
  const [snapshots, setSnapshots] = useState<Record<string, TodaySnapshot>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [latestAnnouncement, setLatestAnnouncement] = useState<{ title: string; count: number } | null>(null);

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

  useEffect(() => {
    listMyAnnouncements()
      .then((r) => {
        const list = (r.announcements ?? []) as any[];
        const weekAgo = Date.now() - 7 * 86400e3;
        const recent = list.filter((a) => {
          const ts = Date.parse(a.publishedAt ?? a.published_at ?? a.createdAt ?? a.created_at ?? "");
          return Number.isFinite(ts) && ts >= weekAgo;
        });
        if (recent.length > 0) setLatestAnnouncement({ title: recent[0].title, count: recent.length });
      })
      .catch(() => {});
  }, []);

  // Early returns AFTER all hooks (React #310 discipline).
  if (subject?.subjectType === "student") {
    return <Navigate to={`/school-portal/students/${subject.subjectId}`} replace />;
  }
  if (!subject) return null;

  const todayLabel = new Date().toLocaleDateString(i18n.language === "ur" ? "ur-PK" : undefined, {
    weekday: "long", month: "short", day: "numeric",
  });
  const fmtDue = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400e3);
    if (diff <= 0) return t("portal.home.dueToday");
    if (diff === 1) return t("portal.home.dueTomorrow");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };
  const fmtTime = (iso: string | null): string => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
  };
  const qualityWord = (q: string | null): string => {
    if (!q) return "";
    const map: Record<string, string> = {
      excellent: t("hifzTeach.qExcellent"), good: t("hifzTeach.qGood"),
      weak: t("hifzTeach.qWeak"), needs_practice: t("hifzTeach.qNeedsPractice"),
      not_learned: t("hifzTeach.qNotLearned"),
    };
    return map[q] ?? q;
  };

  const firstStudentId = students[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <HeroCard
        title={t("portal.home.greeting")}
        subtitle={`${subject.parent?.fullName ?? ""} · ${todayLabel}`}
      />

      {students.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-sm text-slate-600 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-slate-900">{t("portal.home.noChildrenTitle")}</div>
            <p className="mt-1">{t("portal.home.noChildrenBody")}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((s) => {
            const snap = snapshots[s.id];
            const err = errors[s.id];
            const att = snap?.attendanceToday ?? null;
            const attChip = !snap
              ? null
              : att === null
              ? { cls: "border-slate-200 bg-slate-50 text-slate-500", label: `○ ${t("portal.home.rollNotTaken")}` }
              : att.status === "present"
              ? { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: `✓ ${t("portal.home.present")}${att.takenAt ? ` ${fmtTime(att.takenAt)}` : ""}` }
              : att.status === "late"
              ? { cls: "border-amber-200 bg-amber-50 text-amber-800", label: `⏱ ${t("portal.home.late")}${att.takenAt ? ` ${fmtTime(att.takenAt)}` : ""}` }
              : att.status === "excused"
              ? { cls: "border-sky-200 bg-sky-50 text-sky-700", label: t("portal.home.excused") }
              : { cls: "border-rose-200 bg-rose-50 text-rose-700", label: `✗ ${t("portal.home.absent")}` };

            // The lines that need the parent — build only what's real.
            const lines: Array<{ tone: "amber" | "emerald" | "rose" | "slate" | "indigo"; node: React.ReactNode }> = [];
            if (snap) {
              if (snap.homeworkPending.count > 0) {
                lines.push({
                  tone: "amber",
                  node: (
                    <span className="flex flex-1 items-start justify-between gap-2">
                      <span className="min-w-0">
                        <strong>
                          {snap.homeworkPending.soonestSubject
                            ? t("portal.home.subjectHomeworkDue", { subject: snap.homeworkPending.soonestSubject, when: fmtDue(snap.homeworkPending.soonestDueDate) })
                            : t("portal.home.homeworkDue", { count: snap.homeworkPending.count, when: fmtDue(snap.homeworkPending.soonestDueDate) })}
                        </strong>
                        {snap.homeworkPending.soonestTitle ? <> — {snap.homeworkPending.soonestTitle}</> : null}
                      </span>
                      <Link to={`/school-portal/students/${s.id}/homework`} className="flex-none text-[11.5px] font-bold text-indigo-600 hover:underline">
                        {t("portal.home.submit")}
                      </Link>
                    </span>
                  ),
                });
              }
              const lh = snap.latestHifz;
              if (lh && Date.now() - Date.parse(lh.recordedAt) < 7 * 86400e3) {
                const surah = getSurah(lh.surahNumber)?.nameTransliterated ?? lh.surahNumber;
                const kindWord = ["sabaq", "sabqi", "manzil"].includes(lh.kind) ? t(`hifzTeach.${lh.kind}`) : lh.kind;
                const dayDiff = Math.floor((Date.now() - Date.parse(lh.recordedAt)) / 86400e3);
                const when = dayDiff <= 0 ? t("portal.home.today") : dayDiff === 1 ? t("portal.home.yesterday") : new Date(lh.recordedAt).toLocaleDateString(undefined, { weekday: "short" });
                lines.push({
                  tone: lh.missed ? "rose" : "emerald",
                  node: lh.missed ? (
                    <span className="flex-1">{t("portal.home.hifzMissed", { when })}</span>
                  ) : (
                    <span className="flex-1">
                      {t("portal.home.hifzLine", { when, kind: kindWord, portion: `${surah} ${lh.ayahFrom}–${lh.ayahTo}` })}
                      {lh.quality ? <> · <strong>{qualityWord(lh.quality)}</strong></> : null}
                      {lh.parentAction ? <> — {lh.parentAction}</> : lh.teacherRemarks ? <> — {lh.teacherRemarks}</> : null}
                    </span>
                  ),
                });
              }
              if (snap.latestTeacherNote) {
                lines.push({
                  tone: snap.latestTeacherNote.kind === "positive" ? "indigo" : "amber",
                  node: <span className="flex-1">{t("portal.home.teacherNote")} {snap.latestTeacherNote.summary}</span>,
                });
              }
              if (snap.feesDueNow) {
                lines.push({
                  tone: "rose",
                  node: (
                    <span className="flex flex-1 items-start justify-between gap-2">
                      <span>{t("portal.home.feeDue", { amount: snap.feesDueNow.amount.toLocaleString(), period: snap.feesDueNow.periodLabel })}</span>
                      <Link to={`/school-portal/students/${s.id}/fees`} className="flex-none text-[11.5px] font-bold text-indigo-600 hover:underline">
                        {t("portal.home.payFees")}
                      </Link>
                    </span>
                  ),
                });
              }
            }

            return (
              <div key={s.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    {s.photoUrl ? (
                      <img src={s.photoUrl} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-500 text-sm font-extrabold text-white">
                        {s.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                    )}
                    <Link to={`/school-portal/students/${s.id}`} className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-[15px] font-extrabold text-slate-900">
                        {s.fullName}
                        <ChevronRight className="h-4 w-4 flex-none text-slate-300" />
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {snap?.student.className && snap?.student.sectionName
                          ? `${snap.student.className} — ${snap.student.sectionName}`
                          : `GR # ${s.grNumber}`}
                      </span>
                    </Link>
                    {attChip && (
                      <span className={`flex-none rounded-full border px-2.5 py-1 text-[11px] font-bold ${attChip.cls}`}>
                        {attChip.label}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    {err ? (
                      <div className="text-[11px] text-rose-700">{t("portal.snapshotError")}</div>
                    ) : !snap ? (
                      <div className="text-[11px] italic text-slate-400">{t("common.loading")}</div>
                    ) : lines.length === 0 ? (
                      <div className="flex items-start gap-2 text-[12.5px] text-slate-500">
                        <Dot tone="slate" />
                        <span>{t("portal.home.quiet")}</span>
                      </div>
                    ) : (
                      lines.map((l, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12.5px] text-slate-700">
                          <Dot tone={l.tone} />
                          {l.node}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {latestAnnouncement && (
            <Link
              to="/school-portal/announcements"
              className="flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5"
            >
              <span className="flex-none text-[10.5px] font-extrabold uppercase tracking-wide text-indigo-700">
                {t("portal.home.school")}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-indigo-900">{latestAnnouncement.title}</span>
              <span className="flex-none text-[11px] font-semibold text-indigo-400">
                {t("portal.home.announcementCount", { count: latestAnnouncement.count })}
              </span>
            </Link>
          )}

          <div className="flex gap-2">
            <Link to="/school-portal/contact-school" className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-bold text-slate-700 hover:border-slate-300">
              {t("portal.home.messageSchool")}
            </Link>
            {firstStudentId && (
              <Link to={`/school-portal/students/${firstStudentId}/fees`} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-bold text-slate-700 hover:border-slate-300">
                {t("portal.home.payFees")}
              </Link>
            )}
            <Link to="/school-portal/announcements" className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-bold text-slate-700 hover:border-slate-300">
              {t("portal.nav.announcements")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortalHome;
