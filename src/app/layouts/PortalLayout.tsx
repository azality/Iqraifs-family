// PortalLayout — sticky top bar (org + subject + logout) and nav under it.
// Renders <Outlet /> for the nested portal pages.

import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePinAuth } from "../contexts/PinAuthContext";
import { listMyForms } from "../../utils/schoolPortalApi";
import { RoleTour } from "../components/RoleTour";
import { LanguageDropdown } from "../components/LanguageDropdown";
import type { TourRole } from "../../utils/tours";

interface NavItem {
  /** Translation key under `portal.nav.*`. */
  labelKey: string;
  path: (sid: string) => string;
  match: (pathname: string, sid: string) => boolean;
}

const NAV: NavItem[] = [
  {
    labelKey: "dashboard",
    path: (sid) => `/school-portal/students/${sid}`,
    match: (p, sid) => p === `/school-portal/students/${sid}`,
  },
  {
    labelKey: "lessons",
    path: (sid) => `/school-portal/students/${sid}/lessons`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/lessons`),
  },
  {
    // PR feat/timetable-consumers — weekly schedule view for parents.
    // Falls back gracefully (empty-state) when the school hasn't set up
    // slots yet, so adding the nav item doesn't dead-end users.
    labelKey: "timetable",
    path: (sid) => `/school-portal/students/${sid}/timetable`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/timetable`),
  },
  {
    labelKey: "grades",
    path: (sid) => `/school-portal/students/${sid}/grades`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/grades`),
  },
  {
    // PR feat/report-card-v2 — published term cards.
    labelKey: "reportCard",
    path: (sid) => `/school-portal/students/${sid}/report-card`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/report-card`),
  },
  {
    labelKey: "hifz",
    path: (sid) => `/school-portal/students/${sid}/hifz`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/hifz`),
  },
  {
    labelKey: "attendance",
    path: (sid) => `/school-portal/students/${sid}/attendance`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/attendance`),
  },
  {
    labelKey: "behavior",
    path: (sid) => `/school-portal/students/${sid}/behavior`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/behavior`),
  },
  {
    // PR feat/teacher-comments-feed — chronological feed across all
    // teacher-authored remarks (behavior + hifz + exams + report cards
    // + lesson notes). Lives at the per-child level since comments are
    // student-specific.
    labelKey: "teacherComments",
    path: (sid) => `/school-portal/students/${sid}/teacher-comments`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/teacher-comments`),
  },
];

const ANNOUNCEMENTS_PATH = "/school-portal/announcements";

export function PortalLayout() {
  const { t } = useTranslation();
  const { subject, logout } = usePinAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ studentId?: string }>();

  const activeStudentId = useMemo(() => {
    if (params.studentId) return params.studentId;
    if (subject?.subjectType === "student") return subject.subjectId;
    if (subject?.students && subject.students.length === 1) return subject.students[0].id;
    return null;
  }, [params.studentId, subject]);

  const subjectName = subject?.parent?.fullName || subject?.student?.fullName || "";

  // Parent-only: fetch unanswered-forms count once for the nav badge.
  const [unansweredForms, setUnansweredForms] = useState<number>(0);
  useEffect(() => {
    if (subject?.subjectType !== "parent" || !subject.orgId) return;
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
  }, [subject?.subjectType, subject?.orgId]);
  const formsActive = location.pathname.startsWith("/school-portal/forms");
  const announcementsActive = location.pathname.startsWith(ANNOUNCEMENTS_PATH);
  const feesActive =
    activeStudentId !== null &&
    location.pathname.startsWith(`/school-portal/students/${activeStudentId}/fees`);

  const handleLogout = () => {
    logout();
    navigate("/school-login", { replace: true });
  };

  const portalRole: TourRole | null =
    subject?.subjectType === "student"
      ? "portal_student"
      : subject?.subjectType === "parent"
      ? "portal_parent"
      : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/school-portal" className="flex items-center gap-3 min-w-0">
            {/* Brand mark from /pin-me — admin uploads in Settings. Falls
                back to a generic emoji circle when no logo is set so the
                header still looks intentional. */}
            {subject?.orgLogoUrl ? (
              <img
                src={subject.orgLogoUrl}
                alt=""
                className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200 flex-shrink-0"
              />
            ) : (
              <span className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {(subject?.orgName ?? "P").slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-xs uppercase tracking-widest text-indigo-600 font-bold">
                {subject?.orgName ?? "Portal"}
              </span>
              <span className="text-sm font-medium text-slate-900 truncate">
                {subject?.orgMotto ||
                  t("portal.loginTitle").split("—")[1]?.trim() ||
                  "Student & Parent Portal"}
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {subject?.subjectType === "parent" && subject.students && subject.students.length > 1 && (
              <select
                className="text-sm border border-slate-300 rounded-md px-2 py-1 bg-white"
                value={activeStudentId ?? ""}
                onChange={(e) => navigate(`/school-portal/students/${e.target.value}`)}
              >
                <option value="" disabled>
                  Pick a student
                </option>
                {subject.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            )}
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-medium text-slate-900">{subjectName}</span>
              <span className="text-xs text-slate-500 capitalize">{subject?.subjectType}</span>
            </div>
            <LanguageDropdown />
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md px-3 py-1.5"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("common.logout")}</span>
            </button>
          </div>
        </div>
        {activeStudentId && (
          <nav
            // overflow-x-auto lets the menu scroll horizontally on narrow
            // viewports. Without explicit overflow-y-hidden some browsers
            // (Edge / iOS Safari) render a stray vertical scrollbar.
            className="max-w-6xl mx-auto px-4 -mb-px flex items-center gap-1 overflow-x-auto overflow-y-hidden"
            data-tour="portal-nav"
          >
            {NAV.map((item) => {
              const active = item.match(location.pathname, activeStudentId);
              return (
                <NavLink
                  key={item.labelKey}
                  to={item.path(activeStudentId)}
                  end={item.labelKey === "dashboard"}
                  className={
                    "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap " +
                    (active
                      ? "border-indigo-600 text-indigo-700 font-medium"
                      : "border-transparent text-slate-600 hover:text-slate-900")
                  }
                >
                  {t(`portal.nav.${item.labelKey}`)}
                </NavLink>
              );
            })}
            <NavLink
              to={ANNOUNCEMENTS_PATH}
              className={
                "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap " +
                (announcementsActive
                  ? "border-indigo-600 text-indigo-700 font-medium"
                  : "border-transparent text-slate-600 hover:text-slate-900")
              }
            >
              {t("portal.nav.announcements")}
            </NavLink>
            {subject?.subjectType === "parent" && activeStudentId && (
              <NavLink
                to={`/school-portal/students/${activeStudentId}/fees`}
                className={
                  "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap " +
                  (feesActive
                    ? "border-indigo-600 text-indigo-700 font-medium"
                    : "border-transparent text-slate-600 hover:text-slate-900")
                }
              >
                {t("portal.nav.fees")}
              </NavLink>
            )}
            {subject?.subjectType === "parent" && (
              <NavLink
                to="/school-portal/contact-school"
                className={
                  "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap " +
                  (location.pathname.startsWith("/school-portal/contact-school")
                    ? "border-indigo-600 text-indigo-700 font-medium"
                    : "border-transparent text-slate-600 hover:text-slate-900")
                }
              >
                {t("portal.nav.contactSchool")}
              </NavLink>
            )}
            {subject?.subjectType === "parent" && (
              <NavLink
                to="/school-portal/forms"
                className={
                  "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 " +
                  (formsActive
                    ? "border-indigo-600 text-indigo-700 font-medium"
                    : "border-transparent text-slate-600 hover:text-slate-900")
                }
              >
                {t("portal.nav.forms")}
                {unansweredForms > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                    {unansweredForms}
                  </span>
                )}
              </NavLink>
            )}
          </nav>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      {portalRole && subject?.subjectId && (
        <RoleTour role={portalRole} userId={subject.subjectId} />
      )}
    </div>
  );
}
