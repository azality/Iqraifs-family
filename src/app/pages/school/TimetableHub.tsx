// Timetable hub — four scoped surfaces for what was previously one
// cluttered page.
//
// Each card answers the question its visitor is actually asking:
//   - Schedule       → when do periods happen? (holidays + school year)
//   - Sections       → who teaches what to this class?
//   - Teachers       → what does this teacher's week look like?
//   - Substitutions  → who's covering today?
//
// Lives at /school/orgs/:orgId/admin/timetable. The old crammed page
// is now /timetable/sections (the "fill in" workflow).

import { Link, useParams } from "react-router";
import { Calendar, Users, GraduationCap, ArrowRight, Shuffle } from "lucide-react";
import { HeroCard } from "../../components/school-ui";

interface TileProps {
  to: string;
  title: string;
  blurb: string;
  Icon: typeof Calendar;
  accent: string;
  accentBg: string;
}

function Tile({ to, title, blurb, Icon, accent, accentBg }: TileProps) {
  return (
    <Link
      to={to}
      className="group block rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-lg p-2.5" style={{ background: accentBg }}>
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{blurb}</p>
        </div>
      </div>
    </Link>
  );
}

export function TimetableHub() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const base = `/school/orgs/${orgId}/admin/timetable`;

  return (
    <div className="space-y-5">
      <HeroCard
        title="Timetable"
        subtitle="Four jobs that all feed the same schedule. Pick the one you came here to do."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Tile
          to={`${base}/schedule`}
          title="School schedule"
          blurb="When do periods happen? Set the school week, build the standard day once, and mark the year's holidays. Publishing this generates the empty grid that the next two surfaces fill in."
          Icon={Calendar} accent="#4F46E5" accentBg="#EEF0FE"
        />
        <Tile
          to={`${base}/sections`}
          title="Section schedules"
          blurb="For each class section or Hifz group: who teaches what at each period of the week. The day-to-day timetable-building work."
          Icon={Users} accent="#059669" accentBg="#E7F8F0"
        />
        <Tile
          to={`/school/orgs/${orgId}/admin/teachers`}
          title="Teacher schedules"
          blurb="See any teacher's weekly grid — useful for spotting overloaded teachers, gaps in coverage, or what someone's covering today."
          Icon={GraduationCap} accent="#92600A" accentBg="#FDF3E2"
        />
        <Tile
          to={`${base}/substitutions`}
          title="Substitutions"
          blurb="One-off coverage for a specific date — when a teacher is on leave or unwell, who's standing in for which period."
          Icon={Shuffle} accent="#C2491D" accentBg="#FDEEE8"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
        <strong className="text-slate-800">How the pieces connect:</strong>{" "}
        the <em>School schedule</em> is the empty grid (Period 1 on Mon, etc.). <em>Section schedules</em> drop subjects + teachers into each slot.{" "}
        <em>Teacher schedules</em> is the read-only view of the same data filtered by teacher. <em>Substitutions</em> is a per-date override on top.
      </div>
    </div>
  );
}

export default TimetableHub;
