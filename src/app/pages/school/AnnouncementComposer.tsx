// AnnouncementComposer — handles both:
//   * /admin/announcements/new        (create form)
//   * /admin/announcements/:id        (read-only view + delete)

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Plus, Trash2, Paperclip } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  HeroCard,
  cardBase,
  cardElev,
  sectionTitleClasses,
} from "../../components/school-ui";
import {
  getAnnouncement,
  getSchoolMe,
  isOrgAdmin,
  listClasses,
  listClassSubjects,
  listStudents,
  postAnnouncement,
  deleteAnnouncement,
  type AdminClass,
  type AdminStudent,
  type Announcement,
  type AnnouncementAudienceKind,
  type AnnouncementInput,
  type AnnouncementProgram,
  type ClassSubject,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

// Labels match the spec the principal cares about — they're not just
// the raw enum slugs. Each kind also gets a one-line "who reads it"
// hint so the admin understands the reach before posting.
const AUDIENCE_LABEL: Record<AnnouncementAudienceKind, string> = {
  whole_school: "Whole school",
  staff: "Staff",
  teachers: "Teachers",
  parents_only: "Parents",
  students_only: "Students",
  class: "Whole class (all sections)",
  class_section: "One section",
  subject: "By subject",
  program: "Hifz / Conventional",
  specific_students: "Individual student(s)",
};
const AUDIENCE_HINT: Record<AnnouncementAudienceKind, string> = {
  whole_school: "Everyone in the school.",
  staff: "Teachers + office + finance + admin.",
  teachers: "Teaching staff only.",
  parents_only: "Every parent.",
  students_only: "Every student.",
  class: "All students + parents + teachers of one grade.",
  class_section: "One section's students + parents + teachers.",
  subject: "Students enrolled in one subject + their parents + the subject teacher.",
  program: "Students of one program + their parents + their teachers.",
  specific_students: "Picked students + their parents.",
};

// Display order in the form — internal staff bucket first, then outward
// to parents/students, then narrow scopes.
const AUDIENCE_KINDS: AnnouncementAudienceKind[] = [
  "whole_school",
  "staff",
  "teachers",
  "parents_only",
  "students_only",
  "class",
  "class_section",
  "subject",
  "program",
  "specific_students",
];

interface FormState {
  title: string;
  body: string;
  audienceKind: AnnouncementAudienceKind;
  audienceSectionId: string;
  audienceClassId: string;
  audienceSubjectId: string;
  audienceProgram: AnnouncementProgram | "";
  audienceStudentIds: string[];
  expiresAt: string;
  attachments: Array<{ label: string; url: string }>;
  publishPublicly: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  audienceKind: "whole_school",
  audienceSectionId: "",
  audienceClassId: "",
  audienceSubjectId: "",
  audienceProgram: "",
  audienceStudentIds: [],
  expiresAt: "",
  attachments: [],
  publishPublicly: false,
};

export function AnnouncementComposer() {
  const { orgId = "", announcementId } = useParams();
  const navigate = useNavigate();
  const isView = Boolean(announcementId);

  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [existing, setExisting] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Design 5e: "Narrower…" reveals the six narrow scopes; the common
  // four live on one chip row. Reach preview needs a students count.
  const [narrowOpen, setNarrowOpen] = useState(false);
  const [reachStudents, setReachStudents] = useState<AdminStudent[] | null>(null);
  useEffect(() => {
    if (!orgId) return;
    listStudents(orgId).then(setReachStudents).catch(() => setReachStudents(null));
  }, [orgId]);
  const reachLabel = useMemo(() => {
    if (!reachStudents) return null;
    const active = reachStudents.filter((st) => st.status !== "withdrawn");
    switch (form.audienceKind) {
      case "whole_school": return `~${active.length} students + families + staff`;
      case "parents_only":
      case "students_only": return `~${active.length} students' families`;
      case "class_section": {
        if (!form.audienceSectionId) return null;
        const n = active.filter((st) => st.class_section_id === form.audienceSectionId).length;
        return `~${n} students' families`;
      }
      case "specific_students":
        return form.audienceStudentIds.length > 0
          ? `${form.audienceStudentIds.length} student${form.audienceStudentIds.length === 1 ? "" : "s"} + parents`
          : null;
      default: return null;
    }
  }, [reachStudents, form.audienceKind, form.audienceSectionId, form.audienceStudentIds]);
  // Subjects are loaded lazily once the admin picks a class for the
  // subject audience — saves us from pulling every class_subject in the
  // org just to populate a select that's only used some of the time.
  const [subjectsForClass, setSubjectsForClass] = useState<ClassSubject[]>([]);

  useEffect(() => {
    getSchoolMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listStudents(orgId).then(setStudents).catch(() => {});
  }, [orgId]);

  useEffect(() => {
    if (!isView || !orgId || !announcementId) return;
    getAnnouncement(orgId, announcementId)
      .then(setExisting)
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [isView, orgId, announcementId]);

  // Lazy-load class_subjects whenever the admin switches the class for
  // the subject-targeted audience. Reset the picked subject if the
  // class changes so we don't post a subject from the wrong class.
  useEffect(() => {
    if (form.audienceKind !== "subject" || !form.audienceClassId) {
      setSubjectsForClass([]);
      return;
    }
    let cancelled = false;
    listClassSubjects(form.audienceClassId)
      .then((r) => {
        if (!cancelled) setSubjectsForClass(r.subjects ?? []);
      })
      .catch(() => {
        if (!cancelled) setSubjectsForClass([]);
      });
    return () => { cancelled = true; };
  }, [form.audienceKind, form.audienceClassId]);

  const sections = useMemo(
    () =>
      classes.flatMap((c) =>
        c.sections.map((s) => ({
          id: s.id,
          label: `${c.name} – ${s.name}`,
        })),
      ),
    [classes],
  );

  if (meLoading) return null;
  if (!me || me.roles.length === 0) return <Navigate to="/school" replace />;

  const canDelete = isOrgAdmin(me, orgId) || existing?.authorUserId === me.userId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    const payload: AnnouncementInput = {
      title: form.title.trim(),
      body: form.body.trim(),
      audienceKind: form.audienceKind,
    };
    if (form.audienceKind === "class_section") {
      if (!form.audienceSectionId) {
        toast.error("Please pick a section");
        return;
      }
      payload.audienceSectionId = form.audienceSectionId;
    }
    if (form.audienceKind === "specific_students") {
      if (form.audienceStudentIds.length === 0) {
        toast.error("Please pick at least one student");
        return;
      }
      payload.audienceStudentIds = form.audienceStudentIds;
    }
    if (form.audienceKind === "class") {
      if (!form.audienceClassId) {
        toast.error("Please pick a class");
        return;
      }
      payload.audienceClassId = form.audienceClassId;
    }
    if (form.audienceKind === "subject") {
      if (!form.audienceSubjectId) {
        toast.error("Please pick a subject");
        return;
      }
      payload.audienceSubjectId = form.audienceSubjectId;
    }
    if (form.audienceKind === "program") {
      if (form.audienceProgram !== "hifz" && form.audienceProgram !== "conventional") {
        toast.error("Please pick a program");
        return;
      }
      payload.audienceProgram = form.audienceProgram;
    }
    if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString();
    if (form.attachments.length > 0) {
      payload.attachments = form.attachments.filter(
        (a) => a.label.trim() && a.url.trim(),
      );
    }
    (payload as any).publishPublicly = form.publishPublicly;
    setSubmitting(true);
    try {
      await postAnnouncement(orgId, payload);
      toast.success("Announcement published");
      navigate(`/school/orgs/${orgId}/admin/announcements`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (!confirm(`Delete announcement "${existing.title}"?`)) return;
    try {
      await deleteAnnouncement(orgId, existing.id);
      toast.success("Deleted");
      navigate(`/school/orgs/${orgId}/admin/announcements`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const addAttachment = () =>
    setForm((s) => ({ ...s, attachments: [...s.attachments, { label: "", url: "" }] }));

  const updateAttachment = (i: number, patch: Partial<{ label: string; url: string }>) =>
    setForm((s) => ({
      ...s,
      attachments: s.attachments.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));

  const removeAttachment = (i: number) =>
    setForm((s) => ({
      ...s,
      attachments: s.attachments.filter((_, idx) => idx !== i),
    }));

  const toggleStudent = (id: string) =>
    setForm((s) => ({
      ...s,
      audienceStudentIds: s.audienceStudentIds.includes(id)
        ? s.audienceStudentIds.filter((x) => x !== id)
        : [...s.audienceStudentIds, id],
    }));

  // ── Read-only view ─────────────────────────────────────────────────
  if (isView) {
    return (
      <div className="space-y-4">
        <HeroCard
          title={existing?.title ?? "Announcement"}
          subtitle={
            existing
              ? `${AUDIENCE_LABEL[existing.audienceKind]} · ${new Date(
                  existing.publishedAt,
                ).toLocaleString()}`
              : ""
          }
          rightSlot={
            <Link to={`/school/orgs/${orgId}/admin/announcements`}>
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                ← All
              </Button>
            </Link>
          }
        />

        {existing && (
          <article className={`${cardBase} ${cardElev} p-6 space-y-4`}>
            <p className="text-xs text-slate-500">
              {existing.authorName ? `By ${existing.authorName} · ` : ""}
              {new Date(existing.publishedAt).toLocaleString()}
              {existing.expiresAt && (
                <> · expires {new Date(existing.expiresAt).toLocaleDateString()}</>
              )}
            </p>
            <div className="text-sm text-slate-800 whitespace-pre-wrap">{existing.body}</div>
            {existing.attachments && existing.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                {existing.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {a.label}
                  </a>
                ))}
              </div>
            )}
            {canDelete && (
              <div className="pt-3 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-1 text-rose-600" />
                  Delete announcement
                </Button>
              </div>
            )}
          </article>
        )}
      </div>
    );
  }

  // ── Compose form ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <HeroCard
        title="New announcement"
        subtitle="Compose a message for your audience."
        rightSlot={
          <Link to={`/school/orgs/${orgId}/admin/announcements`}>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              ← All
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className={`${cardBase} ${cardElev} p-6 space-y-5`}>
        <div className="space-y-1.5">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="body">Body *</Label>
          <Textarea
            id="body"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={6}
            required
          />
          <p className="text-xs text-slate-500">Markdown allowed</p>
        </div>

        <div className="space-y-2">
          <Label>Audience</Label>
          {/* One chip row for the 90% case; "Narrower…" reveals the six
              narrow scopes (design 5e). */}
          <div className="flex flex-wrap gap-1.5">
            {(["whole_school", "staff", "parents_only", "students_only"] as AnnouncementAudienceKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setForm({ ...form, audienceKind: k })}
                title={AUDIENCE_HINT[k]}
                className={
                  "min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " +
                  (form.audienceKind === k
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {AUDIENCE_LABEL[k]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setNarrowOpen((v) => !v)}
              className={
                "min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold " +
                (narrowOpen || !["whole_school", "staff", "parents_only", "students_only"].includes(form.audienceKind)
                  ? "border border-indigo-200 bg-indigo-50 text-indigo-800"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              Narrower… {narrowOpen ? "▴" : "▾"}
            </button>
          </div>
          {(narrowOpen || !["whole_school", "staff", "parents_only", "students_only"].includes(form.audienceKind)) && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
              {(["teachers", "class", "class_section", "subject", "program", "specific_students"] as AnnouncementAudienceKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm({ ...form, audienceKind: k })}
                  title={AUDIENCE_HINT[k]}
                  className={
                    "min-h-[32px] rounded-full px-3 py-1 text-xs font-medium " +
                    (form.audienceKind === k
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                  }
                >
                  {AUDIENCE_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">{AUDIENCE_HINT[form.audienceKind]}</p>
        </div>

        {form.audienceKind === "class_section" && (
          <div className="space-y-1.5">
            <Label htmlFor="section">Section *</Label>
            <select
              id="section"
              value={form.audienceSectionId}
              onChange={(e) => setForm({ ...form, audienceSectionId: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Pick a section…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {form.audienceKind === "class" && (
          <div className="space-y-1.5">
            <Label htmlFor="cls">Class *</Label>
            <select
              id="cls"
              value={form.audienceClassId}
              onChange={(e) => setForm({ ...form, audienceClassId: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Pick a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Reaches every section of {form.audienceClassId
                ? (classes.find((c) => c.id === form.audienceClassId)?.name ?? "this class")
                : "the picked class"}.
            </p>
          </div>
        )}

        {form.audienceKind === "subject" && (
          <div className="space-y-1.5">
            <Label htmlFor="subj-class">Class *</Label>
            <select
              id="subj-class"
              value={form.audienceClassId}
              onChange={(e) =>
                setForm({ ...form, audienceClassId: e.target.value, audienceSubjectId: "" })
              }
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Pick a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {form.audienceClassId && (
              <>
                <Label htmlFor="subj">Subject *</Label>
                <select
                  id="subj"
                  value={form.audienceSubjectId}
                  onChange={(e) => setForm({ ...form, audienceSubjectId: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">
                    {subjectsForClass.length === 0 ? "Loading…" : "Pick a subject…"}
                  </option>
                  {subjectsForClass.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {form.audienceKind === "program" && (
          <div className="space-y-1.5">
            <Label>Program *</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {(["hifz", "conventional"] as AnnouncementProgram[]).map((p) => (
                <label
                  key={p}
                  className={
                    "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm capitalize " +
                    (form.audienceProgram === p
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                      : "border-slate-200 hover:bg-slate-50")
                  }
                >
                  <input
                    type="radio"
                    name="audienceProgram"
                    value={p}
                    checked={form.audienceProgram === p}
                    onChange={() => setForm({ ...form, audienceProgram: p })}
                  />
                  {p}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Students with this program on their record will see it, plus their parents and teachers.
            </p>
          </div>
        )}

        {form.audienceKind === "specific_students" && (
          <div className="space-y-1.5">
            <Label>Students *</Label>
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1">
              {students.length === 0 ? (
                <p className="text-xs text-slate-500 px-2 py-1">No students.</p>
              ) : (
                students.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-sm px-2 py-1 hover:bg-slate-50 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={form.audienceStudentIds.includes(s.id)}
                      onChange={() => toggleStudent(s.id)}
                    />
                    <span className="font-mono text-xs text-slate-500">{s.gr_number}</span>
                    <span>{s.full_name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-slate-500">
              {form.audienceStudentIds.length} selected
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="expiresAt">Expires (optional)</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: "3 days", days: 3 },
              { label: "1 week", days: 7 },
              { label: "2 weeks", days: 14 },
            ].map((pr) => {
              const target = new Date(Date.now() + pr.days * 86400e3);
              const val = `${target.toISOString().slice(0, 10)}T17:00`;
              const active = form.expiresAt === val;
              return (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => setForm({ ...form, expiresAt: active ? "" : val })}
                  className={
                    "min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold " +
                    (active
                      ? "border border-indigo-200 bg-indigo-50 text-indigo-800"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                  }
                >
                  {pr.label}
                </button>
              );
            })}
            <Input
              id="expiresAt"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="h-9 w-56"
            />
          </div>
        </div>

        {/* Public-site visibility (Phase 2 of the public school site). */}
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.publishPublicly}
              onChange={(e) => setForm({ ...form, publishPublicly: e.target.checked })}
            />
            <div>
              <div className="text-sm font-medium text-slate-900">Also publish on the public school site</div>
              <div className="text-xs text-slate-500">
                Visitors at /your-slug will see this in the "Latest news" section.
                Use for admissions / events / closures.
              </div>
            </div>
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className={sectionTitleClasses}>Attachments</Label>
            <Button type="button" variant="outline" size="sm" onClick={addAttachment}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          {form.attachments.map((a, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input
                placeholder="Label"
                value={a.label}
                onChange={(e) => updateAttachment(i, { label: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="https://…"
                value={a.url}
                onChange={(e) => updateAttachment(i, { url: e.target.value })}
                className="flex-[2]"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => removeAttachment(i)}
              >
                <Trash2 className="h-4 w-4 text-rose-600" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/school/orgs/${orgId}/admin/announcements`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700">
            {submitting ? "Publishing…" : reachLabel ? `Publish → ${reachLabel}` : "Publish"}
          </Button>
        </div>
      </form>
    </div>
  );
}
