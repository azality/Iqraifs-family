// PortalHome — index of /school-portal. Routes student → their dashboard,
// single-student parent → that student's dashboard, multi-student parent → picker.

import { Navigate } from "react-router";
import { Link } from "react-router";
import { HeroCard } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";

export function PortalHome() {
  const { subject } = usePinAuth();
  if (!subject) return null;

  if (subject.subjectType === "student") {
    return <Navigate to={`/school-portal/students/${subject.subjectId}`} replace />;
  }

  const students = subject.students ?? [];
  if (students.length === 1) {
    return <Navigate to={`/school-portal/students/${students[0].id}`} replace />;
  }

  return (
    <div className="space-y-5">
      <HeroCard
        title={`Welcome, ${subject.parent?.fullName ?? "Parent"}`}
        subtitle="Pick a student to continue."
      />
      {students.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-sm text-slate-600">
          No students are linked to your account yet. Please contact your school.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => (
            <Link
              key={s.id}
              to={`/school-portal/students/${s.id}`}
              className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 hover:border-indigo-300 transition flex items-center gap-4"
            >
              {s.photoUrl ? (
                <img
                  src={s.photoUrl}
                  alt={s.fullName}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-base font-semibold">
                  {s.fullName.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium text-slate-900 truncate">{s.fullName}</div>
                <div className="text-xs text-slate-500">GR # {s.grNumber}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
