// WeeklyDigest — the principal's Monday-morning read.
// Routed at /school/orgs/:orgId/admin/weekly-digest.
//
// Teacher Track Record Phase 4: last completed week vs the week before,
// composed into three reads — the headline numbers with deltas, the
// wins worth a thank-you, and the "needs a conversation" list. The
// backend returns data only; every judgment sentence lives here.
// Wing-scoped automatically for incharges.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { HeroCard, cardBase, cardElev, sectionTitleClasses } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  getWeeklyDigest,
  digestWeekStart,
  type SchoolMeResponse,
  type WeeklyDigestResponse,
  type DigestTeacherCount,
} from "../../../utils/schoolApi";

function fmtRange(start: string, end: string): string {
  const f = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${f(start)} – ${f(end)}`;
}

function Delta({ cur, prev, suffix = "", goodWhenUp = true }: { cur: number; prev: number; suffix?: string; goodWhenUp?: boolean }) {
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return <span className="text-[11px] text-slate-400">= last week</span>;
  const good = goodWhenUp ? d > 0 : d < 0;
  return (
    <span className={"text-[11px] font-semibold " + (good ? "text-emerald-600" : "text-rose-600")}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}{suffix} vs last week
    </span>
  );
}

// A teacher's week reduced to one activity number so movers can be ranked.
const activity = (t: DigestTeacherCount) =>
  t.rollCallDays + t.lessons + t.hifzEntries / 10 + t.grades / 5 + t.notes + t.assignments;

export function WeeklyDigest() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [data, setData] = useState<WeeklyDigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => {
    if (!orgId) return;
    getWeeklyDigest(orgId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // Opening the digest marks this week's edition as read — the
    // dashboard's "digest ready" row keys off the same week id.
    try { localStorage.setItem("fgs_digest_seen", digestWeekStart()); } catch { /* ignore */ }
  }, [orgId]);

  const insights = useMemo(() => {
    if (!data) return null;
    const wins: Array<{ text: string; userId: string }> = [];
    const concerns: Array<{ text: string; userId: string }> = [];
    const days = data.week.schoolDays;
    for (const t of data.teachers) {
      const c = t.cur, p = t.prev;
      // Wins — improvements worth a thank-you.
      if (t.ownsSection && days > 0 && c.rollCallDays >= days && p.rollCallDays < Math.max(1, data.prevWeek.schoolDays)) {
        wins.push({ userId: t.userId, text: `${t.name} marked roll call every school day (was ${p.rollCallDays}/${data.prevWeek.schoolDays})` });
      } else if (t.ownsSection && c.rollCallDays - p.rollCallDays >= 2) {
        wins.push({ userId: t.userId, text: `${t.name} — roll call up to ${c.rollCallDays}/${days} days (was ${p.rollCallDays})` });
      }
      if (c.lessons - p.lessons >= 3) {
        wins.push({ userId: t.userId, text: `${t.name} logged ${c.lessons} lessons (was ${p.lessons})` });
      }
      if (c.grades - p.grades >= 10) {
        wins.push({ userId: t.userId, text: `${t.name} entered ${c.grades} grades (was ${p.grades})` });
      }
      if (c.hifzEntries - p.hifzEntries >= 15) {
        wins.push({ userId: t.userId, text: `${t.name} — ${c.hifzEntries} hifz entries heard (was ${p.hifzEntries})` });
      }
      // Concerns — worth a conversation, not a verdict.
      const silentNow = activity(c) === 0;
      const silentPrev = activity(p) === 0;
      if (silentNow && silentPrev) {
        concerns.push({ userId: t.userId, text: `${t.name} — nothing logged for two weeks running` });
      } else if (silentNow) {
        concerns.push({ userId: t.userId, text: `${t.name} — nothing logged this week` });
      } else if (t.ownsSection && days > 0 && c.rollCallDays === 0) {
        concerns.push({ userId: t.userId, text: `${t.name} — no roll call all week (${days} school days)` });
      } else if (t.ownsSection && p.rollCallDays - c.rollCallDays >= 3) {
        concerns.push({ userId: t.userId, text: `${t.name} — roll call slipped to ${c.rollCallDays}/${days} days (was ${p.rollCallDays})` });
      }
    }
    return { wins: wins.slice(0, 6), concerns: concerns.slice(0, 8) };
  }, [data]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !(me?.roles.some((r) => r.role_type === "incharge") ?? false)) {
    return <Navigate to={`/school/orgs/${orgId}`} replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to={`/school/orgs/${orgId}`} className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <HeroCard
        eyebrow="Weekly digest"
        title={data ? `Week of ${fmtRange(data.week.start, data.week.end)}` : "Weekly digest"}
        subtitle={
          data
            ? `${data.wingScoped ? "Your wing" : "The whole school"} · compared with ${fmtRange(data.prevWeek.start, data.prevWeek.end)}`
            : "Comparing the last completed week with the one before it."
        }
        ignoreBranding
      >
        {data && (
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <div className="text-lg font-extrabold tabular-nums text-white">
                {data.week.attendancePct == null ? "—" : `${data.week.attendancePct}%`}
              </div>
              <div className="text-[11px] text-slate-400">attendance</div>
              {data.week.attendancePct != null && data.prevWeek.attendancePct != null && (
                <Delta cur={data.week.attendancePct} prev={data.prevWeek.attendancePct} suffix="pp" />
              )}
            </div>
            <div>
              <div className="text-lg font-extrabold tabular-nums text-white">
                {data.week.rollCall.expected > 0
                  ? `${Math.round((data.week.rollCall.marked / data.week.rollCall.expected) * 100)}%`
                  : "—"}
              </div>
              <div className="text-[11px] text-slate-400">roll-call compliance</div>
              {data.week.rollCall.expected > 0 && data.prevWeek.rollCall.expected > 0 && (
                <Delta
                  cur={Math.round((data.week.rollCall.marked / data.week.rollCall.expected) * 100)}
                  prev={Math.round((data.prevWeek.rollCall.marked / data.prevWeek.rollCall.expected) * 100)}
                  suffix="pp"
                />
              )}
            </div>
            <div>
              <div className="text-lg font-extrabold tabular-nums text-white">{data.week.totals.lessons}</div>
              <div className="text-[11px] text-slate-400">lessons logged</div>
              <Delta cur={data.week.totals.lessons} prev={data.prevWeek.totals.lessons} />
            </div>
            <div>
              <div className="text-lg font-extrabold tabular-nums text-white">{data.week.totals.hifzEntries}</div>
              <div className="text-[11px] text-slate-400">hifz entries</div>
              <Delta cur={data.week.totals.hifzEntries} prev={data.prevWeek.totals.hifzEntries} />
            </div>
            <div>
              <div className="text-lg font-extrabold tabular-nums text-white">{data.week.totals.grades}</div>
              <div className="text-[11px] text-slate-400">grades entered</div>
              <Delta cur={data.week.totals.grades} prev={data.prevWeek.totals.grades} />
            </div>
          </div>
        )}
      </HeroCard>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {!data && !error && <p className="text-sm text-slate-500">Building the digest…</p>}

      {data && insights && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className={`${cardBase} ${cardElev} p-5`}>
            <h3 className={sectionTitleClasses}>Wins — worth a thank-you</h3>
            {insights.wins.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No standout improvements this week.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {insights.wins.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 text-emerald-600">▲</span>
                    <span className="min-w-0 flex-1">{w.text}</span>
                    <Link to={`/school/orgs/${orgId}/admin/teachers/${w.userId}`} className="shrink-0 text-xs text-indigo-700 hover:underline">
                      Profile →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${cardBase} ${cardElev} p-5`}>
            <h3 className={sectionTitleClasses}>Needs a conversation</h3>
            {insights.concerns.length === 0 ? (
              <p className="mt-3 text-sm text-emerald-700">Every teacher logged work this week.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {insights.concerns.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 text-amber-600">●</span>
                    <span className="min-w-0 flex-1">{w.text}</span>
                    <Link to={`/school/orgs/${orgId}/admin/teachers/${w.userId}`} className="shrink-0 text-xs text-indigo-700 hover:underline">
                      Profile →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {data && (
        <section className={`${cardBase} ${cardElev} p-5`}>
          <h3 className={sectionTitleClasses}>
            Every teacher, week vs week
            <span className="ml-2 text-xs font-normal text-slate-500">({data.teachers.length})</span>
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-3">Teacher</th>
                  <th className="py-2 pr-3">Roll call</th>
                  <th className="py-2 pr-3">Lessons</th>
                  <th className="py-2 pr-3">Hifz</th>
                  <th className="py-2 pr-3">Grades</th>
                  <th className="py-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.teachers.map((t) => {
                  const cell = (cur: number, prev: number, na = false) => (
                    <td className="py-2 pr-3 tabular-nums">
                      {na ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <>
                          <span className={cur === 0 && prev === 0 ? "text-slate-300" : "font-semibold text-slate-800"}>{cur}</span>
                          {cur !== prev && (
                            <span className={"ml-1 text-[10.5px] " + (cur > prev ? "text-emerald-600" : "text-rose-500")}>
                              {cur > prev ? "▲" : "▼"}{Math.abs(cur - prev)}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  );
                  return (
                    <tr key={t.userId} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <Link to={`/school/orgs/${orgId}/admin/teachers/${t.userId}`} className="font-medium text-slate-900 hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      {cell(t.cur.rollCallDays, t.prev.rollCallDays, !t.ownsSection)}
                      {cell(t.cur.lessons, t.prev.lessons)}
                      {cell(t.cur.hifzEntries, t.prev.hifzEntries)}
                      {cell(t.cur.grades, t.prev.grades)}
                      {cell(t.cur.notes, t.prev.notes)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Roll call is days marked out of {data.week.schoolDays} school day{data.week.schoolDays === 1 ? "" : "s"};
            “—” means the teacher doesn't own a section. Arrows compare with the previous week.
          </p>
        </section>
      )}
    </div>
  );
}

export default WeeklyDigest;
