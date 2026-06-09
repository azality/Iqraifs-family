// ImportCenter — central hub for every CSV importer in the school side.
//
// Route: /school/orgs/:orgId/admin/import
//
// Why a hub: pre-launch migration from a paper school usually means
// importing classes → sections → subjects → students → parents → fee
// opening balances → old Hifz logs in a deliberate order. Scattering
// those buttons across 5 different pages made the office staff miss
// steps. This page lays them out as numbered cards with status badges
// ("ready" / "waiting on Classes"), so the admin can work the list
// top-to-bottom.
//
// Each card opens the existing CsvUploadDialog with the right columns
// + a Download Template button + (when meaningful) duplicate-key
// detection against the current data.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import {
  ArrowLeft,
  Building2,
  Users,
  Heart,
  GraduationCap,
  BookOpen,
  BookMarked,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  CalendarCheck,
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  getSchoolMe,
  isOrgAdmin,
  listClasses,
  listStudents,
  bulkCreateClasses,
  bulkCreateSections,
  bulkCreateClassSubjects,
  bulkCreateAdminStudents,
  bulkCreateParents,
  bulkCreateTeachers,
  bulkCreateHifzProgress,
  bulkCreateFees,
  bulkCreateAttendance,
  type AdminClass,
  type AdminStudent,
  type SchoolMeResponse,
  type RoleTemplate,
} from "../../../utils/schoolApi";
import { CsvUploadDialog } from "./components/CsvUploadDialog";
import { sectionTitleClasses } from "../../components/school-ui";

type ImporterId =
  | "classes"
  | "sections"
  | "subjects"
  | "students"
  | "parents"
  | "teachers"
  | "hifz"
  | "fees"
  | "attendance";

interface Importer {
  id: ImporterId;
  step: number;
  title: string;
  description: string;
  Icon: typeof Building2;
  dependsOn?: ImporterId[];
}

const IMPORTERS: Importer[] = [
  {
    id: "classes",
    step: 1,
    title: "Classes",
    description: "Grade 1, Grade 2, etc. The structural top.",
    Icon: Building2,
  },
  {
    id: "sections",
    step: 2,
    title: "Sections",
    description: "Grade 1 — A, Grade 1 — B. References Classes by name.",
    Icon: Building2,
    dependsOn: ["classes"],
  },
  {
    id: "subjects",
    step: 3,
    title: "Subjects",
    description: "Math / English / Hifz per class. References Classes by name.",
    Icon: BookOpen,
    dependsOn: ["classes"],
  },
  {
    id: "students",
    step: 4,
    title: "Students",
    description: "Roster with inline parent fields. References Sections by name.",
    Icon: GraduationCap,
    dependsOn: ["classes", "sections"],
  },
  {
    id: "parents",
    step: 5,
    title: "Parents",
    description: "Standalone parent records. Optional studentGrNumber auto-links.",
    Icon: Heart,
  },
  {
    id: "teachers",
    step: 6,
    title: "Teachers & Staff",
    description: "Class teacher, visiting teacher, office, finance. Email invite triggers automatically.",
    Icon: Users,
  },
  {
    id: "hifz",
    step: 7,
    title: "Hifz history",
    description: "Backfill old sabaq / sabqi / manzil records. References students by GR.",
    Icon: BookMarked,
    dependsOn: ["students"],
  },
  {
    id: "fees",
    step: 8,
    title: "Fee opening balances",
    description: "Carry over outstanding fees from the old system. One row per (student, period).",
    Icon: DollarSign,
    dependsOn: ["students"],
  },
  {
    id: "attendance",
    step: 9,
    title: "Attendance history",
    description: "Backfill the term's attendance from the paper register. Student must be in a section.",
    Icon: CalendarCheck,
    dependsOn: ["students"],
  },
];

export function ImportCenter() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [openId, setOpenId] = useState<ImporterId | null>(null);

  // Existing-data signals so dependent cards can light up green and
  // duplicate detection can flag rows the user re-uploaded.
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);

  const refresh = () => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listStudents(orgId).then(setStudents).catch(() => {});
  };

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [orgId]);

  // Existing keys for duplicate detection. Built once per dataset
  // change. All lower-cased to match the dialog's case-insensitive
  // comparison.
  const existingClassNames = useMemo(
    () => new Set(classes.map((c) => c.name.toLowerCase().trim())),
    [classes],
  );
  const existingSectionKeys = useMemo(
    () => new Set(
      classes.flatMap((c) =>
        (c.sections ?? []).map((s) => `${c.name}|${s.name}`.toLowerCase()),
      ),
    ),
    [classes],
  );
  const existingStudentGrs = useMemo(
    () => new Set(students.map((s) => s.gr_number.toLowerCase().trim())),
    [students],
  );

  // Per-importer "ready?" signal. Today this is just "do its deps have
  // any data yet?" — good enough to surface the order; not strict
  // gating because some imports can run in parallel.
  const depMet = (imp: Importer): boolean => {
    if (!imp.dependsOn) return true;
    return imp.dependsOn.every((d) => {
      if (d === "classes") return classes.length > 0;
      if (d === "sections") {
        return classes.some((c) => (c.sections ?? []).length > 0);
      }
      if (d === "students") return students.length > 0;
      return true;
    });
  };

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  // Importer dialog renderer — switched on openId so we don't mount all 7.
  const renderDialog = () => {
    if (!openId) return null;
    if (openId === "classes") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import classes"
          templateFileName="classes-template.csv"
          columns={[
            { key: "name", label: "name", required: true, aliases: ["class_name", "class"] },
            { key: "displayOrder", label: "displayOrder", aliases: ["order", "sort"] },
          ]}
          duplicateDetection={{
            keyOf: (r) => (r.name ?? "").trim(),
            existing: existingClassNames,
            label: "an existing class name",
          }}
          onSubmit={async (rows) => {
            const typed = rows.map((r) => ({
              name: r.name,
              displayOrder: r.displayOrder ? Number(r.displayOrder) : undefined,
            }));
            const res = await bulkCreateClasses(orgId, typed);
            refresh();
            return res;
          }}
        />
      );
    }
    if (openId === "sections") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import sections"
          templateFileName="sections-template.csv"
          columns={[
            { key: "className", label: "className", required: true, aliases: ["class", "class_name"] },
            { key: "sectionName", label: "sectionName", required: true, aliases: ["section", "section_name"] },
          ]}
          duplicateDetection={{
            keyOf: (r) => `${(r.className ?? "").trim()}|${(r.sectionName ?? "").trim()}`,
            existing: existingSectionKeys,
            label: "an existing section of that class",
          }}
          onSubmit={async (rows) => {
            const typed = rows.map((r) => ({
              className: r.className,
              sectionName: r.sectionName,
            }));
            const res = await bulkCreateSections(orgId, typed);
            refresh();
            return res;
          }}
        />
      );
    }
    if (openId === "subjects") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import subjects"
          templateFileName="subjects-template.csv"
          columns={[
            { key: "className", label: "className", required: true, aliases: ["class", "class_name"] },
            { key: "subjectName", label: "subjectName", required: true, aliases: ["subject", "subject_name"] },
            { key: "sortOrder", label: "sortOrder", aliases: ["order", "sort"] },
          ]}
          onSubmit={async (rows) => {
            const typed = rows.map((r) => ({
              className: r.className,
              subjectName: r.subjectName,
              sortOrder: r.sortOrder ? Number(r.sortOrder) : undefined,
            }));
            const res = await bulkCreateClassSubjects(orgId, typed);
            refresh();
            return res;
          }}
        />
      );
    }
    if (openId === "students") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import students"
          templateFileName="students-template.csv"
          columns={[
            { key: "grNumber", label: "GR#", required: true, aliases: ["gr_no", "gr no"] },
            { key: "fullName", label: "Full name", required: true, aliases: ["name", "full_name"] },
            { key: "classSection", label: "Class & section (e.g. Class 3 - A)", aliases: ["section", "class_section"] },
            { key: "dateOfBirth", label: "Date of birth", aliases: ["dob"] },
            { key: "gender", label: "Gender" },
            { key: "guardianPhone", label: "Guardian phone", aliases: ["phone"] },
            { key: "guardianEmail", label: "Guardian email", aliases: ["email"] },
            { key: "program", label: "Program (hifz / conventional)" },
            { key: "parentFullName", label: "Parent full name", aliases: ["parent_name"] },
            { key: "parentPhone", label: "Parent phone" },
            { key: "parentEmail", label: "Parent email" },
            { key: "parentRelationship", label: "Parent relationship" },
          ]}
          duplicateDetection={{
            keyOf: (r) => (r.grNumber ?? "").trim(),
            existing: existingStudentGrs,
            label: "an existing student GR#",
          }}
          onSubmit={async (rows) => {
            const res = await bulkCreateAdminStudents(orgId, rows);
            refresh();
            return res;
          }}
        />
      );
    }
    if (openId === "parents") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import parents"
          templateFileName="parents-template.csv"
          columns={[
            { key: "fullName", label: "Full name", required: true, aliases: ["name"] },
            { key: "phone", label: "Phone" },
            { key: "email", label: "Email" },
            { key: "relationship", label: "Relationship" },
            { key: "studentGrNumber", label: "Student GR# (for auto-link)", aliases: ["student_gr", "gr_no"] },
          ]}
          onSubmit={async (rows) => {
            const res = await bulkCreateParents(orgId, rows);
            return res;
          }}
        />
      );
    }
    if (openId === "teachers") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import teachers & staff"
          templateFileName="teachers-template.csv"
          columns={[
            { key: "email", label: "Email", required: true },
            { key: "fullName", label: "Full name", required: true, aliases: ["name"] },
            { key: "roleTemplate", label: "Role (class_teacher / visiting_teacher / financial_staff / office_staff)", required: true, aliases: ["role", "role_template"] },
          ]}
          onSubmit={async (rows) => {
            const allowed: ReadonlyArray<RoleTemplate> = [
              "class_teacher", "visiting_teacher", "financial_staff", "office_staff",
            ];
            const typed = rows.map((r) => {
              const raw = (r.roleTemplate || "").trim();
              const roleTemplate: RoleTemplate = (allowed as readonly string[]).includes(raw)
                ? (raw as RoleTemplate)
                : "class_teacher";
              return { email: r.email, fullName: r.fullName, roleTemplate };
            });
            const res = await bulkCreateTeachers(orgId, typed);
            return res;
          }}
        />
      );
    }
    if (openId === "fees") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import fee opening balances"
          templateFileName="fees-template.csv"
          columns={[
            { key: "grNumber", label: "Student GR#", required: true, aliases: ["student_gr", "gr_no"] },
            { key: "period", label: "Period (e.g. 2026-08)", required: true, aliases: ["month"] },
            { key: "amountDue", label: "Amount due", aliases: ["due", "fees"] },
            { key: "amountPaid", label: "Amount paid", aliases: ["paid"] },
            { key: "status", label: "Status (unpaid / paid / partial / waived)" },
            { key: "dueDate", label: "Due date (YYYY-MM-DD)", aliases: ["due_date"] },
            { key: "paidDate", label: "Paid date (YYYY-MM-DD)", aliases: ["paid_date"] },
            { key: "notes", label: "Notes" },
          ]}
          onSubmit={async (rows) => {
            const typed = rows.map((r) => ({
              grNumber: r.grNumber,
              period: r.period,
              amountDue: r.amountDue || undefined,
              amountPaid: r.amountPaid || undefined,
              status: (r.status as any) || undefined,
              dueDate: r.dueDate || undefined,
              paidDate: r.paidDate || undefined,
              notes: r.notes || undefined,
            }));
            const res = await bulkCreateFees(orgId, typed);
            return res;
          }}
        />
      );
    }
    if (openId === "attendance") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import attendance history"
          templateFileName="attendance-template.csv"
          columns={[
            { key: "grNumber", label: "Student GR#", required: true, aliases: ["student_gr", "gr_no"] },
            { key: "date", label: "Date (YYYY-MM-DD)", required: true },
            { key: "status", label: "Status (present / absent / late / excused)", required: true },
            { key: "notes", label: "Notes" },
          ]}
          onSubmit={async (rows) => {
            const typed = rows.map((r) => ({
              grNumber: r.grNumber,
              date: r.date,
              status: (r.status as any) || "present",
              notes: r.notes || undefined,
            }));
            const res = await bulkCreateAttendance(orgId, typed);
            return res;
          }}
        />
      );
    }
    if (openId === "hifz") {
      return (
        <CsvUploadDialog
          open
          onOpenChange={(v) => { if (!v) { setOpenId(null); refresh(); } }}
          title="Import Hifz history"
          templateFileName="hifz-template.csv"
          columns={[
            { key: "grNumber", label: "Student GR#", required: true, aliases: ["student_gr", "gr_no"] },
            { key: "recordedAt", label: "Date (YYYY-MM-DD)", aliases: ["date"] },
            { key: "kind", label: "Kind (sabaq / sabqi / manzil / memorized / revised / tested)", required: true },
            { key: "surahNumber", label: "Surah #", required: true, aliases: ["surah"] },
            { key: "ayahFrom", label: "Ayah from", required: true, aliases: ["from", "ayah_start"] },
            { key: "ayahTo", label: "Ayah to", required: true, aliases: ["to", "ayah_end"] },
            { key: "quality", label: "Quality (excellent / good / needs_practice / weak)" },
            { key: "mistakesCount", label: "Mistakes" },
            { key: "juzNumber", label: "Juz / Para" },
            { key: "pageNumber", label: "Page" },
            { key: "missed", label: "Missed (true/false)" },
            { key: "notes", label: "Notes" },
          ]}
          onSubmit={async (rows) => {
            const typed = rows.map((r) => ({
              grNumber: r.grNumber,
              recordedAt: r.recordedAt || undefined,
              kind: (r.kind as any) || "sabaq",
              surahNumber: Number(r.surahNumber),
              ayahFrom: Number(r.ayahFrom),
              ayahTo: Number(r.ayahTo),
              quality: (r.quality as any) || undefined,
              notes: r.notes || undefined,
              mistakesCount: r.mistakesCount ? Number(r.mistakesCount) : undefined,
              juzNumber: r.juzNumber ? Number(r.juzNumber) : undefined,
              pageNumber: r.pageNumber ? Number(r.pageNumber) : undefined,
              missed: r.missed === "true" || r.missed === "1",
            }));
            const res = await bulkCreateHifzProgress(orgId, typed);
            return res;
          }}
        />
      );
    }
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to={`/school/orgs/${orgId}/admin`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Admin
          </Button>
        </Link>
      </div>

      <div>
        <h1 className={sectionTitleClasses}>Import Center</h1>
        <p className="mt-1 text-sm text-slate-600">
          Bring an existing school's data in via CSV. Work top-to-bottom for the
          smoothest path — each step's dependencies are flagged below. Every
          importer accepts a CSV download template, shows a preview, highlights
          duplicates against your existing data, and reports per-row errors.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {IMPORTERS.map((imp) => {
          const ready = depMet(imp);
          return (
            <Card
              key={imp.id}
              className={!ready ? "opacity-60" : ""}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-indigo-50 text-indigo-700 p-2">
                    <imp.Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Step {imp.step}
                      </span>
                      {ready ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-medium px-1.5 py-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium px-1.5 py-0.5">
                          <AlertCircle className="h-3 w-3" /> Waiting on{" "}
                          {imp.dependsOn?.join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-900">
                      {imp.title}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">{imp.description}</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setOpenId(imp.id)}>
                    Open importer
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {renderDialog()}
    </div>
  );
}

export default ImportCenter;
