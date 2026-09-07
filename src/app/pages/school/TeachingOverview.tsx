// Teaching overview — Teacher Track Record Phase 2, redesigned per the
// 12a/12b handoff (7 Sep).
//
// The first version ranked everyone by pace, so week-3 pilot data read
// as a league table of bad teachers — when the −91pp block really meant
// "hasn't started logging" (one row belonged to a teacher whose password
// was issued an hour earlier). The page now grows through a lifecycle:
//
//   PILOT MODE   grouped by adoption stage. "Not started" is an
//                onboarding to-do list showing what each teacher HAS
//                done; active teachers get the real table; Qaris get
//                their own columns (pace and grading never applied to
//                them — the dashes are gone). One banner replaces a
//                column of identical "ramp" chips.
//
//   TERM'S END   once every ramp window has closed and everyone has
//                started, the groups dissolve into one honest ranked
//                table. A lifecycle, not a setting.
//
// Who sees this: principal/admin — whole school; incharge — own wing
// only (backend-scoped); teachers and office — 403. Deliberately NOT
// stated on the page — everyone who can open it already has access,
// and an on-screen ACL reads wrong when the page is projected in a
// staff meeting.

import { useMemo, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowUpDown, GraduationCap, KeyRound, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  getTeachingOverview,
  resetTeacherPassword,
  viewerRoleForOrg,
} from "../../../utils/schoolApi";
import { useWorkspace } from "../../contexts/WorkspaceContext";

type SortKey = "pace" | "lessons" | "freshness" | "rollcall" | "notes" | "name";

type Row = {
  userId: string;
  name: string;
  sectionCount: number;
  subjectCount: number;
  isHifz: boolean;
  paceDeltaPp: number | null;
  lessons: number;
  lessonsPerWeek: number;
  freshnessDays: number | null;
  ungradedPastDue: number;
  rollCall: { marked: number; schoolDays: number } | null;
  heardRatePct: number | null;
  notes: { pos: number; con: number };
  inRamp: boolean;
  topicsDone?: number;
  lastSignInAt?: string | null;
  accountCreatedAt?: string | null;
  lastHifzDays?: number | null;
};

const dayMs = 86400000;
const daysAgo = (iso: string | null | undefined): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / dayMs) : null;

/** Where a not-started teacher is on the onboarding ladder. */
function stageOf(r: Row): { label: string; tone: string } {
  if (!r.lastSignInAt) {
    const created = daysAgo(r.accountCreatedAt);
    return created !== null && created <= 0
      ? { label: "account created today", tone: "bg-sky-50 text-sky-700 ring-sky-200" }
      : { label: "never signed in", tone: "bg-rose-50 text-rose-700 ring-rose-200" };
  }
  const active = r.lessons > 0 || (r.rollCall?.marked ?? 0) > 0 || r.notes.pos + r.notes.con > 0;
  if (!active) return { label: "signed in, idle", tone: "bg-amber-50 text-amber-800 ring-amber-200" };
  return { label: "warming up", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
}

/** What they HAVE done — shown instead of a meaningless −91pp. */
function doneSoFar(r: Row): string {
  const bits: string[] = [];
  if (!r.lastSignInAt) {
    const created = daysAgo(r.accountCreatedAt);
    return created !== null && created <= 0
      ? "Nothing yet — couldn't have: account created today"
      : "Nothing yet — has not signed in";
  }
  if (r.lessons > 0) bits.push(`${r.lessons} lesson${r.lessons === 1 ? "" : "s"}`);
  else bits.push("no lessons logged");
  if (r.rollCall) bits.push(`roll call ${r.rollCall.marked}/${r.rollCall.schoolDays}`);
  if (r.ungradedPastDue > 0) bits.push(`${r.ungradedPastDue} ungraded`);
  if (r.notes.pos + r.notes.con > 0) bits.push(`${r.notes.pos + r.notes.con} behavior notes`);
  if (r.lessonsPerWeek > 0) bits.push("active this week");
  return bits.join(" · ");
}

function reminderText(r: Row, url: string): string {
  return (
    `Assalamu alaikum ${r.name} — a gentle reminder to log your lessons, ` +
    `attendance and syllabus progress on the school system: ${url}`
  );
}

export function TeachingOverview() {
  const { orgId = "" } = useParams();
  const { me } = useWorkspace();
  const role = viewerRoleForOrg(me, orgId);
  const canReset = role === "admin" || role === "principal";

  const [data, setData] = useState<any>(null);
  const [term, setTerm] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("pace");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    getTeachingOverview(orgId, term || undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [orgId, term]);

  const all: Row[] = useMemo(
    () =>
      ((data?.rows ?? []) as Row[]).filter(
        (r) => !query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [data, query],
  );

  // ── The lifecycle split ─────────────────────────────────────────────
  // Qaris: hifz teachers with no academic pace to be measured by.
  const qaris = useMemo(() => all.filter((r) => r.isHifz && r.paceDeltaPp == null), [all]);
  const academic = useMemo(() => all.filter((r) => !qaris.includes(r)), [all, qaris]);
  const notStarted = useMemo(
    () => academic.filter((r) => (r.topicsDone ?? 0) === 0),
    [academic],
  );
  const logging = useMemo(
    () => academic.filter((r) => (r.topicsDone ?? 0) > 0),
    [academic],
  );
  const anyRamp = academic.some((r) => r.inRamp);
  const allInRamp = academic.length > 0 && academic.every((r) => r.inRamp);
  // "Pilot · week 3" — how far into the term we are, from the term's
  // start date (older payloads don't carry it; the chip degrades to
  // just "Pilot").
  const pilotWeek = useMemo(() => {
    const start = data?.term?.start ? Date.parse(`${data.term.start}T00:00:00Z`) : NaN;
    if (!Number.isFinite(start) || start > Date.now()) return null;
    return Math.floor((Date.now() - start) / (7 * dayMs)) + 1;
  }, [data]);
  // An old backend (pre-deploy window) sends rows without the adoption
  // fields; grouping on missing data would file every teacher under
  // "never signed in". Old payload -> old layout: the flat table.
  const hasAdoptionData = ((data?.rows ?? []) as any[]).some((r) => "topicsDone" in r);
  // Grouped while onboarding is still happening; one flat honest table
  // once everyone has started and every ramp window has closed.
  const pilotMode = hasAdoptionData && (notStarted.length > 0 || anyRamp);

  const sorted = (list: Row[]): Row[] => {
    const num = (v: number | null | undefined, hi: boolean) => (v == null ? (hi ? -1 : 999) : v);
    const out = [...list];
    switch (sortKey) {
      case "name": out.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "pace": out.sort((a, b) => num(a.paceDeltaPp, false) - num(b.paceDeltaPp, false)); break;
      case "lessons": out.sort((a, b) => a.lessonsPerWeek - b.lessonsPerWeek); break;
      case "freshness": out.sort((a, b) => num(b.freshnessDays, true) - num(a.freshnessDays, true)); break;
      case "rollcall":
        out.sort(
          (a, b) =>
            (a.rollCall ? a.rollCall.marked / a.rollCall.schoolDays : 2) -
            (b.rollCall ? b.rollCall.marked / b.rollCall.schoolDays : 2),
        );
        break;
      case "notes": out.sort((a, b) => a.notes.pos + a.notes.con - (b.notes.pos + b.notes.con)); break;
    }
    return out;
  };

  const copyReminder = async (r: Row) => {
    try {
      await navigator.clipboard.writeText(reminderText(r, "https://iqraifs.com"));
      setCopiedId(r.userId);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast.error("Couldn't copy — long-press the text to copy manually");
    }
  };
  const copyAll = async () => {
    const txt = notStarted.map((r) => `• ${r.name}: ${doneSoFar(r)}`).join("\n");
    try {
      await navigator.clipboard.writeText(
        `Onboarding follow-ups:\n${txt}\n\nSystem: https://iqraifs.com`,
      );
      toast.success(`Copied a follow-up list for ${notStarted.length} teachers`);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  const resendSetup = async (r: Row) => {
    // Issues a fresh temp password through the same forced-change flow the
    // suite exercises (check 34). Admin/principal only — the backend
    // enforces it; the button just doesn't render for an incharge.
    setResetting(r.userId);
    try {
      const res = await resetTeacherPassword(orgId, r.userId);
      const temp = (res as any)?.tempPassword;
      if (temp) {
        await navigator.clipboard.writeText(
          `Assalamu alaikum ${r.name} — your login for the school system:\n` +
            `iqraifs.com · your email · temporary password: ${temp}\n` +
            `It will ask you to set your own password on first sign-in.`,
        );
        toast.success(`New temp password for ${r.name} copied — paste it to her on WhatsApp`);
      } else {
        toast.error("Reset succeeded but no password came back");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResetting(null);
    }
  };

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      onClick={() => setSortKey(k)}
      className={
        "cursor-pointer whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider " +
        (sortKey === k ? "text-indigo-700" : "text-slate-400 hover:text-slate-600")
      }
    >
      <span className="inline-flex items-center gap-1">{children}<ArrowUpDown className="h-3 w-3" /></span>
    </th>
  );

  const paceChip = (pp: number | null) =>
    pp == null ? (
      <span className="text-slate-300">—</span>
    ) : (
      <span
        className={
          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums " +
          (pp >= 0
            ? "bg-emerald-50 text-emerald-700"
            : pp <= -15
              ? "bg-rose-50 text-rose-700"
              : "bg-amber-50 text-amber-800")
        }
      >
        {pp >= 0 ? "+" : ""}{pp}pp
      </span>
    );

  const teacherCell = (r: Row, showRamp: boolean) => (
    <>
      <Link
        to={`/school/orgs/${orgId}/admin/teachers/${r.userId}`}
        className="font-medium text-indigo-700 hover:underline"
      >
        {r.name}
      </Link>
      <span className="ml-2 text-[11px] text-slate-400">
        {r.sectionCount} sec · {r.subjectCount} subj
      </span>
      {showRamp && r.inRamp && (
        <span
          className="ml-2 cursor-help rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200"
          title="New this term — metrics are muted for the first 6 weeks"
        >
          ramp
        </span>
      )}
    </>
  );

  // The honest ranked table — 12b, and the "Logging" group inside 12a.
  const rankedTable = (list: Row[], showRamp: boolean) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b border-slate-100">
          <tr>
            <Th k="name">Teacher</Th>
            <Th k="pace">Pace</Th>
            <Th k="lessons">Lessons/wk</Th>
            <Th k="freshness">Grading</Th>
            <Th k="rollcall">Roll call</Th>
            <Th k="notes">Notes +/−</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted(list).map((r) => (
            <tr key={r.userId} className="hover:bg-slate-50/60">
              <td className="px-3 py-2">{teacherCell(r, showRamp)}</td>
              <td className="px-3 py-2">{paceChip(r.paceDeltaPp)}</td>
              <td className="px-3 py-2 tabular-nums">
                {r.lessonsPerWeek}
                <span className="text-[11px] text-slate-400"> ({r.lessons})</span>
              </td>
              <td className="px-3 py-2 tabular-nums text-xs">
                {r.freshnessDays == null && r.ungradedPastDue === 0 ? (
                  <span className="text-slate-300">nothing due yet</span>
                ) : (
                  <>
                    {r.freshnessDays != null && (
                      <span>{r.freshnessDays === 0 ? "same-day" : `${r.freshnessDays}d`}</span>
                    )}
                    {r.ungradedPastDue > 0 && (
                      <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {r.ungradedPastDue} ungraded
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {r.rollCall ? `${r.rollCall.marked}/${r.rollCall.schoolDays}` : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {r.notes.pos + r.notes.con === 0 ? (
                  <span className="text-slate-300">—</span>
                ) : (
                  <>
                    <span className="text-emerald-700">{r.notes.pos}+</span>
                    <span className="text-slate-300"> / </span>
                    <span className="text-rose-600">{r.notes.con}−</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <GraduationCap className="h-6 w-6 text-indigo-600" />
            Teaching overview
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {all.length} teacher{all.length === 1 ? "" : "s"}
            {data?.wingScoped ? " in your wing" : ""} · click a name for their track record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teacher…"
            className="h-8 w-48 rounded-md border border-slate-200 bg-white px-2 text-sm"
          />
          {data?.terms?.length > 0 && (
            <select
              value={term || (data.term?.id ?? "")}
              onChange={(e) => setTerm(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              {data.terms.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}{t.isCurrent ? " (current)" : ""}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Computing across all teachers…
        </div>
      ) : !data || all.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No teaching activity to show.
        </div>
      ) : pilotMode ? (
        <>
          {/* One banner instead of a column of identical ramp chips. */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
              Pilot{pilotWeek != null ? ` · week ${pilotWeek}` : ""}
            </div>
            <p className="mt-1 text-sm text-indigo-900">
              Right now this page measures <b>adoption, not teaching quality</b>.
              {allInRamp
                ? " Every account is inside its 42-day ramp window, so nobody is ranked yet"
                : anyRamp
                  ? " Accounts inside their 42-day ramp window aren't being ranked yet"
                  : ""}
              {notStarted.length > 0
                ? " — the “not started” list below is an onboarding to-do list, not a league table."
                : "."}
            </p>
          </div>

          {/* Stage summary — each card jumps to its group below. */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                n: notStarted.length, t: "Not started",
                d: "no syllabus entries — onboarding list",
                cls: "border-red-200 bg-red-50", num: "text-red-700", anchor: "stage-not-started",
              },
              {
                n: logging.length, t: "Logging",
                d: logging.length > 0 && logging.every((r) => (r.paceDeltaPp ?? 0) >= 0)
                  ? "on or ahead of the calendar"
                  : "ranked by pace — the real table",
                cls: "border-emerald-200 bg-emerald-50", num: "text-emerald-700", anchor: "stage-logging",
              },
              {
                n: qaris.length, t: "Hifz (Qaris)",
                d: "measured by rounds heard, not pace",
                cls: "border-amber-200 bg-amber-50", num: "text-amber-700", anchor: "stage-hifz",
              },
            ].map((c) => (
              <button
                key={c.t}
                type="button"
                onClick={() =>
                  document.getElementById(c.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition hover:brightness-[0.98] ${c.cls}`}
              >
                <span className={`text-3xl font-extrabold tabular-nums ${c.num}`}>{c.n}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${c.num}`}>{c.t}</span>
                  <span className="block truncate text-[11.5px] text-slate-600">{c.d}</span>
                </span>
              </button>
            ))}
          </div>

          {/* ── Not started: what they HAVE done, and a way to nudge ── */}
          {notStarted.length > 0 && (
            <section id="stage-not-started" className="scroll-mt-4 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Not started · {notStarted.length}
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                    what they have done, instead of −{data?.expectedPct ?? ""}pp
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={copyAll}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Copy follow-up list
                </button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {notStarted.map((r) => {
                  const st = stageOf(r);
                  return (
                    <li key={r.userId} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div>{teacherCell(r, false)}</div>
                        <div className="text-xs text-slate-600">{doneSoFar(r)}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${st.tone}`}>
                        {st.label}
                      </span>
                      {!r.lastSignInAt && canReset ? (
                        <button
                          type="button"
                          onClick={() => resendSetup(r)}
                          disabled={resetting === r.userId}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <KeyRound className="h-3 w-3" />
                          {resetting === r.userId ? "Issuing…" : "New setup password"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => copyReminder(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {copiedId === r.userId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          {copiedId === r.userId ? "Copied" : "Copy reminder"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── Logging: the real table with real columns ── */}
          {logging.length > 0 && (
            <section id="stage-logging" className="scroll-mt-4 space-y-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Logging · {logging.length}
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                  on the board — sortable, furthest behind first
                </span>
              </h2>
              {rankedTable(logging, false)}
            </section>
          )}
        </>
      ) : (
        // ── 12b: the lifecycle's destination — one honest ranked table.
        rankedTable(academic, true)
      )}

      {/* ── Qaris: their own columns; pace and grading never applied ── */}
      {!loading && qaris.length > 0 && (
        <section id="stage-hifz" className="scroll-mt-4 space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Hifz · {qaris.length} {qaris.length === 1 ? "Qari" : "Qaris"}
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
              measured by rounds heard, not syllabus pace
            </span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Qari</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Roster heard recently</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Roll call</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Last round</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...qaris]
                  .sort((a, b) => (b.heardRatePct ?? -1) - (a.heardRatePct ?? -1))
                  .map((r) => (
                    <tr key={r.userId} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2">{teacherCell(r, false)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.heardRatePct == null ? (
                          <span className="text-slate-400">no rounds yet</span>
                        ) : (
                          <span
                            className={
                              r.heardRatePct >= 80
                                ? "font-semibold text-emerald-700"
                                : r.heardRatePct >= 50
                                  ? "text-amber-700"
                                  : "font-semibold text-rose-700"
                            }
                          >
                            {r.heardRatePct}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.rollCall ? `${r.rollCall.marked}/${r.rollCall.schoolDays}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.lastHifzDays == null
                          ? "—"
                          : r.lastHifzDays === 0
                            ? "today"
                            : r.lastHifzDays === 1
                              ? "yesterday"
                              : `${r.lastHifzDays} days ago`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-[11px] text-slate-400">
        Pace = avg topics-complete % minus term-elapsed %
        {data?.expectedPct != null ? ` (~${data.expectedPct}% by now)` : ""}. Grading = median
        days from due date to first grade + ungraded backlog. Context beats ranking — read
        alongside each teacher's Track Record.
      </p>
    </div>
  );
}

export default TeachingOverview;
