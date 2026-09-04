// PortalLayout — the parent/student portal shell (design 11a/11c).
//
// A nav bar should never grow a scrollbar: the old 13 flat tabs
// overflowed on every laptop and hid Fees / Contact school off-screen.
// Now: one-row header (brand · child-picker chip · name · EN · logout)
// and SIX grouped tabs + More ▾ —
//   Today · Learning ▾ (Lessons/Homework/Grades/Report card) · Hifz ·
//   Timetable · Attendance · Fees[badge] · More ▾ (Behavior/Comments/
//   Announcements/Forms + Contact school) · [Message school] action.
// Deferred ≠ hidden: items in More keep their count badges.
// On phones the same grouping becomes a fixed bottom bar (10b):
//   Today · Learning · Hifz · Timetable · More.
//
// Bug fixed by this structure (pilot report): the nav only rendered
// when a studentId was in the URL — on /announcements and
// /contact-school a multi-child parent lost the ENTIRE menu. The
// active student now persists across non-student routes (localStorage
// fgs_portal_last_student, falling back to the first child).

import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { LogOut, ChevronDown, Home, BookOpen, BookMarked, Calendar, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePinAuth } from "../contexts/PinAuthContext";
import {
  listMyForms,
  listMyAnnouncements,
  getMyStudentFees,
  getMyStudentBehavior,
} from "../../utils/schoolPortalApi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { RoleTour } from "../components/RoleTour";
import { LanguageDropdown } from "../components/LanguageDropdown";
import type { TourRole } from "../../utils/tours";

const LAST_STUDENT_KEY = "fgs_portal_last_student";

function Badge({ n, tone = "amber" }: { n: number; tone?: "amber" | "indigo" | "rose" }) {
  if (n <= 0) return null;
  const cls =
    tone === "rose"
      ? "bg-rose-500 text-white"
      : tone === "indigo"
      ? "bg-indigo-100 text-indigo-800"
      : "bg-amber-100 text-amber-800";
  return (
    <span className={`ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold ${cls}`}>
      {n}
    </span>
  );
}

export function PortalLayout() {
  const { t } = useTranslation();
  const { subject, logout } = usePinAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ studentId?: string }>();

  const isParent = subject?.subjectType === "parent";

  // ── Persistent student context (the 11a bug fix). ────────────────────
  const [lastStudentId, setLastStudentId] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_STUDENT_KEY); } catch { return null; }
  });
  useEffect(() => {
    if (!params.studentId) return;
    setLastStudentId(params.studentId);
    try { localStorage.setItem(LAST_STUDENT_KEY, params.studentId); } catch { /* ignore */ }
  }, [params.studentId]);

  const activeStudentId = useMemo(() => {
    if (params.studentId) return params.studentId;
    if (subject?.subjectType === "student") return subject.subjectId;
    const kids = subject?.students ?? [];
    if (kids.length === 1) return kids[0].id;
    if (lastStudentId && kids.some((s) => s.id === lastStudentId)) return lastStudentId;
    return kids[0]?.id ?? null;
  }, [params.studentId, subject, lastStudentId]);

  const activeStudent = (subject?.students ?? []).find((s) => s.id === activeStudentId)
    ?? (subject?.subjectType === "student" ? { id: subject.subjectId, fullName: subject.student?.fullName ?? "" } : null);

  const subjectName = subject?.parent?.fullName || subject?.student?.fullName || "";

  // Tab title = the school's name while inside the parent/student portal.
  useEffect(() => {
    const name = subject?.orgName?.trim();
    if (!name) return;
    document.title = /iqra/i.test(name) ? name : `Iqra — ${name}`;
    return () => { document.title = "Iqra — Islamic Family System"; };
  }, [subject?.orgName]);

  // ── Badges (best-effort; deferred ≠ hidden). ─────────────────────────
  const [unansweredForms, setUnansweredForms] = useState(0);
  const [unpaidFees, setUnpaidFees] = useState(0);
  const [recentAnnouncements, setRecentAnnouncements] = useState(0);
  const [behaviorWeek, setBehaviorWeek] = useState(0);
  useEffect(() => {
    if (!isParent || !subject?.orgId) return;
    listMyForms(subject.orgId)
      .then((r) => {
        const count = (r.forms ?? []).filter((f) => {
          if (f.hasResponded) return false;
          if (f.form.status !== "published") return false;
          if (f.form.deadline && new Date(f.form.deadline).getTime() < Date.now()) return false;
          return true;
        }).length;
        setUnansweredForms(count);
      })
      .catch(() => setUnansweredForms(0));
  }, [isParent, subject?.orgId]);
  useEffect(() => {
    listMyAnnouncements()
      .then((r) => {
        const weekAgo = Date.now() - 7 * 86400e3;
        setRecentAnnouncements(
          (r.announcements ?? []).filter((a: any) => {
            const ts = Date.parse(a.publishedAt ?? a.published_at ?? a.createdAt ?? a.created_at ?? "");
            return Number.isFinite(ts) && ts >= weekAgo;
          }).length,
        );
      })
      .catch(() => setRecentAnnouncements(0));
  }, [subject?.orgId]);
  useEffect(() => {
    if (!activeStudentId) return;
    if (isParent) {
      getMyStudentFees(activeStudentId)
        .then((r) => setUnpaidFees((r.fees ?? []).filter((f: any) => f.status && f.status !== "paid" && f.status !== "waived").length))
        .catch(() => setUnpaidFees(0));
    }
    getMyStudentBehavior(activeStudentId)
      .then((r) => {
        const weekAgo = Date.now() - 7 * 86400e3;
        setBehaviorWeek(
          (r.entries ?? []).filter((e: any) => {
            const ts = Date.parse(e.observedAt ?? e.observed_at ?? e.createdAt ?? e.created_at ?? "");
            return Number.isFinite(ts) && ts >= weekAgo;
          }).length,
        );
      })
      .catch(() => setBehaviorWeek(0));
  }, [activeStudentId, isParent]);

  const handleLogout = () => {
    let slug = subject?.orgSlug;
    if (!slug) {
      try { slug = window.localStorage.getItem("fgs_portal_slug") || undefined; } catch { /* ignore */ }
    }
    logout();
    navigate(slug ? `/${slug}` : "/school-login", { replace: true });
  };

  const portalRole: TourRole | null =
    subject?.subjectType === "student" ? "portal_student" : isParent ? "portal_parent" : null;

  // ── Route helpers ────────────────────────────────────────────────────
  const sid = activeStudentId ?? "";
  const p = location.pathname;
  const base = `/school-portal/students/${sid}`;
  const isToday = p === base;
  const isLearning = ["/lessons", "/homework", "/grades", "/report-card"].some((s) => p.startsWith(base + s));
  const isHifz = p.startsWith(`${base}/hifz`);
  const isTimetable = p.startsWith(`${base}/timetable`);
  const isAttendance = p.startsWith(`${base}/attendance`);
  const isFees = p.startsWith(`${base}/fees`);
  const isMore =
    p.startsWith(`${base}/behavior`) || p.startsWith(`${base}/teacher-comments`) ||
    p.startsWith("/school-portal/announcements") || p.startsWith("/school-portal/forms") ||
    p.startsWith("/school-portal/contact-school");
  const moreBadge = recentAnnouncements + unansweredForms + behaviorWeek;

  const tabCls = (active: boolean) =>
    "inline-flex items-center px-3 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap " +
    (active ? "border-indigo-600 text-indigo-700 font-semibold" : "border-transparent font-medium text-slate-600 hover:text-slate-900");

  const learningItems = [
    { label: t("portal.nav.lessons"), to: `${base}/lessons` },
    { label: t("portal.nav.homework"), to: `${base}/homework` },
    { label: t("portal.nav.grades"), to: `${base}/grades` },
    { label: t("portal.nav.reportCard"), to: `${base}/report-card` },
  ];

  const [phoneMoreOpen, setPhoneMoreOpen] = useState(false);
  useEffect(() => { setPhoneMoreOpen(false); }, [location.pathname]);

  const moreItems = (
    <>
      <DropdownMenuItem onClick={() => navigate(`${base}/behavior`)}>
        {t("portal.nav.behavior")}
        {behaviorWeek > 0 && (
          <span className="ml-auto text-[10.5px] text-slate-400">
            {t("portal.nav.notesThisWeek", { count: behaviorWeek })}
          </span>
        )}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate(`${base}/teacher-comments`)}>
        {t("portal.nav.teacherComments")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate("/school-portal/announcements")}>
        {t("portal.nav.announcements")}
        <span className="ml-auto"><Badge n={recentAnnouncements} tone="indigo" /></span>
      </DropdownMenuItem>
      {isParent && (
        <DropdownMenuItem onClick={() => navigate("/school-portal/forms")}>
          {t("portal.nav.forms")}
          <span className="ml-auto"><Badge n={unansweredForms} tone="rose" /></span>
        </DropdownMenuItem>
      )}
      {isParent && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/school-portal/contact-school")}>
            {t("portal.nav.contactSchool")}
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        {/* One-row header: brand · child chip · name · EN · logout. */}
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <Link to="/school-portal" className="flex items-center gap-2.5 min-w-0">
            {subject?.orgLogoUrl ? (
              <img src={subject.orgLogoUrl} alt="" className="h-8 w-8 rounded-lg object-cover ring-1 ring-slate-200 flex-shrink-0" />
            ) : (
              <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {(subject?.orgName ?? "P").slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="truncate text-[13px] font-extrabold uppercase tracking-wide text-indigo-800">
              {subject?.orgName ?? "Portal"}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {/* Child picker — the filled chip IS the context switch. */}
            {isParent && (subject?.students?.length ?? 0) > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex max-w-[160px] items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-800"
                  >
                    <span className="truncate">{activeStudent?.fullName || t("portal.nav.pickStudent")}</span>
                    <ChevronDown className="h-3 w-3 flex-none text-indigo-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(subject?.students ?? []).map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => navigate(`/school-portal/students/${s.id}`)}>
                      {s.fullName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : activeStudent && isParent ? (
              <span className="hidden sm:inline-flex max-w-[160px] items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-800">
                <span className="truncate">{activeStudent.fullName}</span>
              </span>
            ) : null}
            <span className="hidden md:block text-xs text-slate-500">{subjectName}</span>
            <LanguageDropdown />
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md px-2.5 py-1.5"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("common.logout")}</span>
            </button>
          </div>
        </div>

        {/* Desktop tab row — 6 grouped tabs + More; never scrolls. */}
        {activeStudentId && (
          <nav className="mx-auto hidden max-w-6xl items-center px-3 sm:flex sm:px-4" data-tour="portal-nav">
            <NavLink to={base} end className={tabCls(isToday)}>
              {t("portal.nav.today")}
            </NavLink>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={tabCls(isLearning)}>
                  {t("portal.nav.learning")} <ChevronDown className="ml-0.5 h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {learningItems.map((it) => (
                  <DropdownMenuItem key={it.to} onClick={() => navigate(it.to)}>
                    {it.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <NavLink to={`${base}/hifz`} className={tabCls(isHifz)}>
              {t("portal.nav.hifz")}
            </NavLink>
            <NavLink to={`${base}/timetable`} className={tabCls(isTimetable)}>
              {t("portal.nav.timetable")}
            </NavLink>
            <NavLink to={`${base}/attendance`} className={tabCls(isAttendance)}>
              {t("portal.nav.attendance")}
            </NavLink>
            {isParent && (
              <NavLink to={`${base}/fees`} className={tabCls(isFees)}>
                {t("portal.nav.fees")}
                <Badge n={unpaidFees} />
              </NavLink>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={tabCls(isMore)}>
                  {t("portal.nav.more")} <ChevronDown className="ml-0.5 h-3 w-3" />
                  <Badge n={moreBadge} tone="indigo" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {moreItems}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* The role's #1 action lives in the right slot (11b). */}
            {isParent && (
              <Link
                to="/school-portal/contact-school"
                className="ml-auto hidden rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 md:inline-flex"
              >
                {t("portal.nav.messageSchool")}
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>

      {/* Phone bottom bar (10b): the same grouping, five thumbs-reach tabs. */}
      {activeStudentId && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white sm:hidden">
          {phoneMoreOpen && (
            <div className="border-b border-slate-100 px-2 py-2">
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: t("portal.nav.attendance"), to: `${base}/attendance`, badge: 0 },
                  ...(isParent ? [{ label: t("portal.nav.fees"), to: `${base}/fees`, badge: unpaidFees }] : []),
                  { label: t("portal.nav.behavior"), to: `${base}/behavior`, badge: behaviorWeek },
                  { label: t("portal.nav.teacherComments"), to: `${base}/teacher-comments`, badge: 0 },
                  { label: t("portal.nav.reportCard"), to: `${base}/report-card`, badge: 0 },
                  { label: t("portal.nav.announcements"), to: "/school-portal/announcements", badge: recentAnnouncements },
                  ...(isParent
                    ? [
                        { label: t("portal.nav.forms"), to: "/school-portal/forms", badge: unansweredForms },
                        { label: t("portal.nav.contactSchool"), to: "/school-portal/contact-school", badge: 0 },
                      ]
                    : []),
                ].map((it) => (
                  <Link
                    key={it.to}
                    to={it.to}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 active:bg-slate-100"
                  >
                    {it.label}
                    <Badge n={it.badge} />
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-5">
            {[
              { label: t("portal.nav.today"), to: base, active: isToday, Icon: Home },
              { label: t("portal.nav.learning"), to: `${base}/lessons`, active: isLearning, Icon: BookOpen },
              { label: t("portal.nav.hifz"), to: `${base}/hifz`, active: isHifz, Icon: BookMarked },
              { label: t("portal.nav.timetable"), to: `${base}/timetable`, active: isTimetable, Icon: Calendar },
            ].map(({ label, to, active, Icon }) => (
              <Link
                key={to}
                to={to}
                className={
                  "flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold " +
                  (active ? "text-indigo-700" : "text-slate-500")
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setPhoneMoreOpen((v) => !v)}
              className={
                "relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold " +
                (isMore || phoneMoreOpen ? "text-indigo-700" : "text-slate-500")
              }
            >
              <MoreHorizontal className="h-5 w-5" />
              {t("portal.nav.more")}
              {moreBadge + unpaidFees > 0 && (
                <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-rose-500" />
              )}
            </button>
          </div>
        </nav>
      )}

      {portalRole && subject?.subjectId && (
        <RoleTour role={portalRole} userId={subject.subjectId} />
      )}
    </div>
  );
}
