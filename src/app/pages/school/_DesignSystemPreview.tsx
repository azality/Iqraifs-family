// Internal design-system preview. Renders every school-ui primitive with
// sample data so we can iterate on the look without touching real pages.
// Mounted at /school/_design (underscore prefix flags it as internal).

import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Clock,
  GraduationCap,
  Info,
  Sparkles,
  Users,
} from "lucide-react";
import {
  AlertCard,
  DataTable,
  HeroCard,
  KpiTile,
  StatusPill,
  pageTitleClasses,
  sectionTitleClasses,
  mutedClasses,
  type DataTableColumn,
} from "../../components/school-ui";

interface SectionRow {
  id: string;
  name: string;
  students: number;
  attendance: number;
  status: "compliant" | "watch" | "flagged" | "neutral";
}

const SAMPLE_SECTIONS: SectionRow[] = [
  { id: "1", name: "Grade 5 · Aleem", students: 28, attendance: 96.4, status: "compliant" },
  { id: "2", name: "Grade 4 · Hakeem", students: 26, attendance: 88.0, status: "watch" },
  { id: "3", name: "Grade 3 · Saleem", students: 24, attendance: 72.3, status: "flagged" },
  { id: "4", name: "Grade 6 · Kareem", students: 30, attendance: 95.0, status: "compliant" },
];

export function _DesignSystemPreview() {
  const columns: DataTableColumn<SectionRow>[] = [
    { key: "name", header: "Class · Section" },
    { key: "students", header: "Students", align: "right", width: "w-24" },
    {
      key: "attendance",
      header: "Attendance",
      align: "right",
      width: "w-32",
      cell: (r) => <span className="tabular-nums">{r.attendance.toFixed(1)}%</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "w-32",
      cell: (r) => <StatusPill status={r.status} />,
    },
  ];

  return (
    <div className="space-y-8 p-2">
      <div>
        <h1 className={pageTitleClasses}>School Design System</h1>
        <p className={mutedClasses}>
          Preview of school-ui primitives. Internal — not linked from nav.
        </p>
      </div>

      {/* HeroCard with KPI tiles (dark variant) */}
      <section className="space-y-3">
        <h2 className={sectionTitleClasses}>HeroCard + KpiTile (dark)</h2>
        <HeroCard
          title="School at a Glance"
          subtitle="School-wide performance and attendance"
          asOf="Today · 14:32"
          rightSlot={
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <span className="font-medium text-emerald-300">3 healthy</span>
              <span className="text-slate-500">·</span>
              <span className="font-medium text-amber-300">1 watch</span>
              <span className="text-slate-500">·</span>
              <span className="font-medium text-rose-300">1 flagged</span>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            <KpiTile icon={Users} label="Students" value={428} hint="across 18 sections" />
            <KpiTile
              icon={CheckCircle}
              label="Attendance"
              value="94.2%"
              hint="vs 91.8% last week"
              deltaPp={2.4}
            />
            <KpiTile icon={GraduationCap} label="Teachers" value={32} hint="2 unassigned" />
            <KpiTile
              icon={Sparkles}
              label="Behavior"
              value="+184"
              hint="net points this week"
              deltaPp={-1.2}
            />
            <KpiTile icon={Clock} label="Pending Approvals" value={7} hint="3 over 24h" muted />
          </div>
        </HeroCard>
      </section>

      {/* KpiTile light variant */}
      <section className="space-y-3">
        <h2 className={sectionTitleClasses}>KpiTile (light, standalone)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile variant="light" icon={Users} label="Students" value={428} hint="this term" />
          <KpiTile
            variant="light"
            icon={BookOpen}
            label="Hifz Progress"
            value="64%"
            hint="avg juz completion"
            deltaPp={3.1}
          />
          <KpiTile
            variant="light"
            icon={CheckCircle}
            label="Fees Paid"
            value="78%"
            hint="22% outstanding"
            deltaPp={-4.0}
          />
          <KpiTile
            variant="light"
            icon={Clock}
            label="Forms Awaiting"
            value={null}
            hint="coming soon"
            muted
          />
        </div>
      </section>

      {/* Alerts */}
      <section className="space-y-3">
        <h2 className={sectionTitleClasses}>AlertCard</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <AlertCard
            severity="critical"
            kind="Attendance"
            icon={AlertOctagon}
            title="Grade 3 · Saleem below 75%"
            body="Section has fallen below threshold for 4 consecutive days."
            actionLabel="View section"
            actionHref="#"
          />
          <AlertCard
            severity="warning"
            kind="Behavior"
            icon={AlertTriangle}
            title="Concerns spike in Grade 6"
            body="12 concern logs in 3 days — review with class teacher."
            actionLabel="Open feed"
            onAction={() => undefined}
          />
          <AlertCard
            severity="info"
            kind="Roster"
            icon={Info}
            title="3 roster requests awaiting"
            body="Teachers submitted student moves pending principal approval."
            actionLabel="Review"
            actionHref="#"
          />
          <AlertCard
            severity="success"
            kind="Hifz"
            icon={Sparkles}
            title="Grade 5 hit Juz 5 milestone"
            body="Whole section completed 5th juz this week — recognition due."
          />
        </div>
      </section>

      {/* StatusPill */}
      <section className="space-y-3">
        <h2 className={sectionTitleClasses}>StatusPill</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status="compliant" />
          <StatusPill status="watch" />
          <StatusPill status="flagged" />
          <StatusPill status="neutral" />
          <StatusPill status="compliant" size="md" label="On track" />
          <StatusPill status="flagged" size="md" label="Needs attention" />
        </div>
      </section>

      {/* DataTable */}
      <section className="space-y-3">
        <h2 className={sectionTitleClasses}>DataTable</h2>
        <div className="rounded-xl border border-slate-200 bg-white">
          <DataTable<SectionRow>
            columns={columns}
            rows={SAMPLE_SECTIONS}
            rowKey={(r) => r.id}
            rankColumn
            onRowClick={() => undefined}
          />
        </div>

        <h3 className={sectionTitleClasses + " pt-4"}>Empty state</h3>
        <div className="rounded-xl border border-slate-200 bg-white">
          <DataTable<SectionRow>
            columns={columns}
            rows={[]}
            rowKey={(r) => r.id}
            emptyMessage="No sections match this filter."
          />
        </div>
      </section>
    </div>
  );
}

export default _DesignSystemPreview;
