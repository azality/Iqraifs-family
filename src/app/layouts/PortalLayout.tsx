// PortalLayout — sticky top bar (org + subject + logout) and nav under it.
// Renders <Outlet /> for the nested portal pages.

import { useMemo } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { LogOut } from "lucide-react";
import { usePinAuth } from "../contexts/PinAuthContext";

interface NavItem {
  label: string;
  path: (sid: string) => string;
  match: (pathname: string, sid: string) => boolean;
}

const NAV: NavItem[] = [
  {
    label: "Dashboard",
    path: (sid) => `/school-portal/students/${sid}`,
    match: (p, sid) => p === `/school-portal/students/${sid}`,
  },
  {
    label: "Lessons",
    path: (sid) => `/school-portal/students/${sid}/lessons`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/lessons`),
  },
  {
    label: "Grades",
    path: (sid) => `/school-portal/students/${sid}/grades`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/grades`),
  },
  {
    label: "Hifz",
    path: (sid) => `/school-portal/students/${sid}/hifz`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/hifz`),
  },
  {
    label: "Attendance",
    path: (sid) => `/school-portal/students/${sid}/attendance`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/attendance`),
  },
  {
    label: "Behavior",
    path: (sid) => `/school-portal/students/${sid}/behavior`,
    match: (p, sid) => p.startsWith(`/school-portal/students/${sid}/behavior`),
  },
];

export function PortalLayout() {
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

  const handleLogout = () => {
    logout();
    navigate("/school-login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/school-portal" className="flex flex-col min-w-0">
            <span className="text-xs uppercase tracking-widest text-indigo-600 font-bold">
              {subject?.orgName ?? "Portal"}
            </span>
            <span className="text-sm font-medium text-slate-900 truncate">
              Student &amp; Parent Portal
            </span>
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
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md px-3 py-1.5"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
        {activeStudentId && (
          <nav className="max-w-6xl mx-auto px-4 -mb-px flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.match(location.pathname, activeStudentId);
              return (
                <NavLink
                  key={item.label}
                  to={item.path(activeStudentId)}
                  end={item.label === "Dashboard"}
                  className={
                    "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap " +
                    (active
                      ? "border-indigo-600 text-indigo-700 font-medium"
                      : "border-transparent text-slate-600 hover:text-slate-900")
                  }
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
