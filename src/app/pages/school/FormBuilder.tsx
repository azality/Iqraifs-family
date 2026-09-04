// FormBuilder — create/edit a form, manage audience + fields.
// Handles both /admin/forms/new (create) and /admin/forms/:formId (edit).

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Plus, ArrowUp, ArrowDown, Pencil, Trash2, X } from "lucide-react";
import { HeroCard, cardBase, cardElev, sectionTitleClasses, NoAccessRedirect } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  listClasses,
  listStudents,
  createForm,
  getForm,
  updateForm,
  publishForm,
  postAnnouncement,
  closeForm,
  addFormField,
  updateFormField,
  deleteFormField,
  reorderFormFields,
  type AdminClass,
  type AdminStudent,
  type Form,
  type FormAudienceKind,
  type FormField,
  type FormFieldKind,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { useOrgPermissionState } from "./useOrgPermission";

const KIND_LABELS: Record<FormFieldKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  single_select: "Single choice",
  multi_select: "Multi choice",
  number: "Number",
};

interface FieldForm {
  kind: FormFieldKind;
  label: string;
  required: boolean;
  helpText: string;
  options: string[];
}

const emptyField: FieldForm = {
  kind: "short_text",
  label: "",
  required: false,
  helpText: "",
  options: [],
};

export function FormBuilder() {
  const { orgId = "", formId = "" } = useParams();
  const navigate = useNavigate();
  const isNew = !formId || formId === "new";

  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(!isNew);

  // local edits for top-level fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audienceKind, setAudienceKind] = useState<FormAudienceKind>("whole_school");
  const [audienceSectionId, setAudienceSectionId] = useState<string>("");
  const [audienceStudentIds, setAudienceStudentIds] = useState<string[]>([]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [deadline, setDeadline] = useState("");

  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [studentSearch, setStudentSearch] = useState("");

  const [fieldOpen, setFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldForm>(emptyField);
  // Design 5d: questions live IN the composer. A new form keeps them
  // locally (the field API needs a formId) and creates form + fields —
  // and optionally publishes — in one go. No more empty-shell step.
  const [pendingFields, setPendingFields] = useState<FieldForm[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listStudents(orgId).then(setStudents).catch(() => {});
  }, [orgId]);

  const refresh = () => {
    if (isNew || !orgId || !formId) return;
    setLoading(true);
    getForm(orgId, formId)
      .then((f) => {
        setForm(f);
        setTitle(f.title);
        setDescription(f.description ?? "");
        setAudienceKind(f.audienceKind);
        setAudienceSectionId(f.audienceSectionId ?? "");
        setAudienceStudentIds(f.audienceStudentIds ?? []);
        setAllowMultiple(f.allowMultiple);
        setDeadline(f.deadline ? f.deadline.slice(0, 10) : "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [orgId, formId, isNew]);

  const sectionOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const c of classes) for (const s of c.sections || []) out.push({ id: s.id, label: `${c.name} - ${s.name}` });
    return out;
  }, [classes]);

  const filteredStudents = useMemo(() => {
    const s = studentSearch.toLowerCase();
    if (!s) return students.slice(0, 20);
    return students
      .filter((st) => st.full_name.toLowerCase().includes(s) || st.gr_number.toLowerCase().includes(s))
      .slice(0, 20);
  }, [students, studentSearch]);

  // Design 5d: Publish states who it reaches.
  const reachLabel = useMemo(() => {
    const active = students.filter((st) => st.status !== "withdrawn");
    if (audienceKind === "whole_school") return `${active.length} students' parents`;
    if (audienceKind === "class_section" && audienceSectionId) {
      const n = active.filter((st) => st.class_section_id === audienceSectionId).length;
      return `${n} students' parents`;
    }
    if (audienceKind === "specific_students" && audienceStudentIds.length > 0) {
      return `${audienceStudentIds.length} students' parents`;
    }
    return null;
  }, [students, audienceKind, audienceSectionId, audienceStudentIds]);

  const fields = useMemo<FormField[]>(
    () => (form?.fields ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder),
    [form],
  );

  // Permission-aware gate. isOrgAdmin still short-circuits for
  // principal/admin; other roles resolve through the effective matrix
  // (create_forms) so the Permissions editor's toggles govern this page.
  // While the matrix fetch is in flight we render nothing rather than
  // bouncing a legitimately-permitted user.
  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  const perm = useOrgPermissionState(orgId, viewerRole, "create_forms");

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !perm.allowed) {
    if (perm.loading) return null;
    return <NoAccessRedirect />;
  }
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  // Creates the form, posts the composer's questions, and (optionally)
  // publishes — one flow, per the 5d mock's "Save draft" / "Publish →".
  const handleCreate = async (publish: boolean) => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (publish && pendingFields.length === 0) {
      toast.error("Add at least one question before publishing");
      return;
    }
    setCreating(true);
    try {
      const created = await createForm(orgId, {
        title: title.trim(),
        description: description.trim() || undefined,
        audienceKind,
        audienceSectionId: audienceKind === "class_section" ? audienceSectionId || undefined : undefined,
        audienceStudentIds: audienceKind === "specific_students" ? audienceStudentIds : undefined,
        allowMultiple,
        deadline: deadline || undefined,
      });
      for (const f of pendingFields) {
        const needsOptions = f.kind === "single_select" || f.kind === "multi_select";
        await addFormField(orgId, created.id, {
          kind: f.kind,
          label: f.label.trim(),
          required: f.required,
          helpText: f.helpText.trim() || undefined,
          options: needsOptions ? f.options.filter((o) => o.trim()) : undefined,
        });
      }
      if (publish) {
        await publishForm(orgId, created.id);
        toast.success("Published");
        // Announce push (pilot feedback): nothing TELLS parents a form
        // exists — offer the matching announcement here too.
        if (confirm("Also post an announcement so parents know about this form?")) {
          try {
            await postAnnouncement(orgId, {
              title: `Please fill: ${title.trim()}`,
              body:
                `A new form "${title.trim()}" is waiting for you in the portal's Forms tab.` +
                (deadline ? ` Please respond by ${new Date(deadline).toLocaleDateString()}.` : "") +
                (description.trim() ? `\n\n${description.trim()}` : ""),
              audienceKind: audienceKind as "whole_school" | "class_section" | "specific_students",
              audienceSectionId: audienceKind === "class_section" ? audienceSectionId || undefined : undefined,
              audienceStudentIds: audienceKind === "specific_students" && audienceStudentIds.length ? audienceStudentIds : undefined,
            });
            toast.success("Announcement posted to the form's audience.");
          } catch {
            toast.error("Form published, but the announcement failed — post it from Communications → Announcements.");
          }
        }
      } else {
        toast.success(pendingFields.length > 0 ? "Draft saved with its questions" : "Draft saved");
      }
      navigate(`/school/orgs/${orgId}/admin/forms/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    try {
      await updateForm(orgId, form.id, {
        title: title.trim(),
        description: description.trim(),
        audienceKind,
        audienceSectionId: audienceKind === "class_section" ? audienceSectionId || null : null,
        audienceStudentIds: audienceKind === "specific_students" ? audienceStudentIds : [],
        allowMultiple,
        deadline: deadline || null,
      });
      toast.success("Saved");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePublish = async () => {
    if (!form) return;
    if (!form.fields || form.fields.length === 0) {
      toast.error("Add at least one field before publishing");
      return;
    }
    await publishForm(orgId, form.id);
    refresh();
    toast.success("Published");
    // Announce push (pilot feedback): the portal only shows a passive
    // badge — nothing TELLS parents a form exists. Offer a matching
    // announcement so publishing reaches phones the way schools expect.
    // Audience maps 1:1 (whole_school / class_section / specific_students
    // are valid announcement kinds too).
    if (confirm("Also post an announcement so parents know about this form?")) {
      try {
        await postAnnouncement(orgId, {
          title: `Please fill: ${form.title}`,
          body:
            `A new form "${form.title}" is waiting for you in the portal's Forms tab.` +
            (form.deadline ? ` Please respond by ${new Date(form.deadline).toLocaleDateString()}.` : "") +
            (form.description ? `\n\n${form.description}` : ""),
          audienceKind: form.audienceKind as "whole_school" | "class_section" | "specific_students",
          audienceSectionId: form.audienceSectionId ?? undefined,
          audienceStudentIds: form.audienceStudentIds?.length ? form.audienceStudentIds : undefined,
        });
        toast.success("Announcement posted to the form's audience.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Form published, but the announcement failed — post it from Communications → Announcements.");
      }
    }
  };

  const handleClose = async () => {
    if (!form) return;
    await closeForm(orgId, form.id);
    refresh();
  };

  const openFieldCreate = () => {
    setEditingField(null);
    setEditingIndex(null);
    setFieldForm(emptyField);
    setFieldOpen(true);
  };

  const openFieldEdit = (f: FormField) => {
    setEditingField(f);
    setEditingIndex(null);
    setFieldForm({
      kind: f.kind,
      label: f.label,
      required: f.required,
      helpText: f.helpText ?? "",
      options: f.options ?? [],
    });
    setFieldOpen(true);
  };

  // Pending-question editing (new-form composer, before the form exists).
  const openPendingEdit = (idx: number) => {
    setEditingField(null);
    setEditingIndex(idx);
    setFieldForm(pendingFields[idx]);
    setFieldOpen(true);
  };

  const submitField = async () => {
    if (!fieldForm.label.trim()) return;
    if (isNew) {
      const cleaned = { ...fieldForm, label: fieldForm.label.trim() };
      setPendingFields((arr) =>
        editingIndex == null
          ? [...arr, cleaned]
          : arr.map((f, i) => (i === editingIndex ? cleaned : f)),
      );
      setFieldOpen(false);
      return;
    }
    if (!form) return;
    const needsOptions = fieldForm.kind === "single_select" || fieldForm.kind === "multi_select";
    const body = {
      kind: fieldForm.kind,
      label: fieldForm.label.trim(),
      required: fieldForm.required,
      helpText: fieldForm.helpText.trim() || undefined,
      options: needsOptions ? fieldForm.options.filter((o) => o.trim()) : undefined,
    };
    try {
      if (editingField) {
        await updateFormField(orgId, editingField.id, body);
      } else {
        await addFormField(orgId, form.id, body);
      }
      setFieldOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const removeField = async (f: FormField) => {
    if (!confirm(`Delete field "${f.label}"?`)) return;
    try {
      await deleteFormField(orgId, f.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the field.");
    }
    refresh();
  };

  const moveField = async (idx: number, dir: -1 | 1) => {
    if (!form) return;
    const next = fields.slice();
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    await reorderFormFields(orgId, form.id, next.map((x) => x.id));
    refresh();
  };

  const toggleStudent = (id: string) => {
    setAudienceStudentIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  };

  const status = form?.status ?? "draft";

  return (
    <div className="space-y-4 max-w-3xl">
      <HeroCard
        title={isNew ? "New form" : title || "Form"}
        subtitle={form ? `Status: ${status}` : undefined}
        rightSlot={
          <div className="flex gap-2">
            <Link to={`/school/orgs/${orgId}/admin/forms`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Forms</Button>
            </Link>
            {form && status === "draft" && (
              <Button
                size="sm"
                className="bg-white text-indigo-700 hover:bg-indigo-50"
                onClick={handlePublish}
                title={fields.length === 0 ? "Add at least one question first" : undefined}
              >
                {reachLabel ? `Publish → ${reachLabel}` : "Publish"}
              </Button>
            )}
            {form && status === "published" && (
              <Button size="sm" variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={handleClose}>
                Close
              </Button>
            )}
          </div>
        }
      />

      <div className={`${cardBase} ${cardElev} p-4 space-y-3`}>
        <div className={sectionTitleClasses}>Details</div>
        <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
        <div><Label>Deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
        <div className="flex items-center gap-2">
          <Checkbox id="multi" checked={allowMultiple} onCheckedChange={(v) => setAllowMultiple(!!v)} />
          <Label htmlFor="multi" className="cursor-pointer">Allow multiple responses per parent</Label>
        </div>
      </div>

      <div className={`${cardBase} ${cardElev} p-4 space-y-3`}>
        <div className={sectionTitleClasses}>Audience</div>
        <RadioGroup value={audienceKind} onValueChange={(v) => setAudienceKind(v as FormAudienceKind)}>
          <div className="flex items-center gap-2"><RadioGroupItem value="whole_school" id="aud-all" /><Label htmlFor="aud-all" className="cursor-pointer">Whole school</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="class_section" id="aud-sec" /><Label htmlFor="aud-sec" className="cursor-pointer">Specific class section</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="specific_students" id="aud-stu" /><Label htmlFor="aud-stu" className="cursor-pointer">Specific students</Label></div>
        </RadioGroup>

        {audienceKind === "class_section" && (
          <div>
            <Label>Section</Label>
            <Select value={audienceSectionId || "__none__"} onValueChange={(v) => setAudienceSectionId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Pick a section" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {sectionOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {audienceKind === "specific_students" && (
          <div className="space-y-2">
            <Label>Pick students ({audienceStudentIds.length} selected)</Label>
            <Input placeholder="Search by name or GR#…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
            <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
              {filteredStudents.map((st) => (
                <label key={st.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0">
                  <Checkbox checked={audienceStudentIds.includes(st.id)} onCheckedChange={() => toggleStudent(st.id)} />
                  <span className="text-sm">{st.full_name} <span className="text-xs text-slate-500">({st.gr_number})</span></span>
                </label>
              ))}
              {filteredStudents.length === 0 && <p className="p-3 text-xs text-slate-500">No matches.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Design 5d: questions live in the composer from the start. */}
      {isNew && (
        <div className={`${cardBase} ${cardElev} p-4 space-y-2`}>
          <div className="flex items-center justify-between">
            <div className={sectionTitleClasses}>Questions</div>
            <Button size="sm" variant="outline" onClick={openFieldCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add question
            </Button>
          </div>
          {pendingFields.length === 0 ? (
            <p className="text-sm text-slate-500">
              No questions yet — a form can&apos;t be published until it has at
              least one.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingFields.map((f, idx) => (
                <li key={idx} className="flex items-start gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900">
                      {f.label}{f.required && <span className="text-rose-600"> *</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {KIND_LABELS[f.kind]}
                      {f.options.length > 0 ? ` · ${f.options.filter((o) => o.trim()).length} options` : ""}
                      {f.required ? " · required" : " · optional"}
                    </div>
                  </div>
                  <div className="inline-flex gap-0.5">
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx === 0}
                      onClick={() => setPendingFields((arr) => { const n = arr.slice(); [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; })}
                    ><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx === pendingFields.length - 1}
                      onClick={() => setPendingFields((arr) => { const n = arr.slice(); [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n; })}
                    ><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openPendingEdit(idx)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setPendingFields((arr) => arr.filter((_, i) => i !== idx))}
                    ><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!isNew && form && (
        <div className={`${cardBase} ${cardElev} p-4 space-y-2`}>
          <div className="flex items-center justify-between">
            <div className={sectionTitleClasses}>Fields</div>
            <Button size="sm" variant="outline" onClick={openFieldCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add field
            </Button>
          </div>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">No fields yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {fields.map((f, idx) => (
                <li key={f.id} className="flex items-start gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900">
                      {f.label}{f.required && <span className="text-rose-600"> *</span>}
                    </div>
                    <div className="text-xs text-slate-500">{KIND_LABELS[f.kind]}{f.options?.length ? ` · ${f.options.length} options` : ""}</div>
                  </div>
                  <div className="inline-flex gap-0.5">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveField(idx, -1)} disabled={idx === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openFieldEdit(f)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeField(f)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {isNew ? (
          <>
            <Button variant="outline" disabled={creating} onClick={() => void handleCreate(false)}>
              Save draft
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={creating}
              onClick={() => void handleCreate(true)}
              title={pendingFields.length === 0 ? "Add at least one question first" : undefined}
            >
              {creating
                ? "Saving…"
                : reachLabel
                ? `Publish → ${reachLabel}`
                : "Publish"}
            </Button>
          </>
        ) : (
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">Save changes</Button>
        )}
      </div>

      <Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingField || editingIndex != null ? "Edit question" : "Add question"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div>
              <Label>Kind</Label>
              <Select value={fieldForm.kind} onValueChange={(v) => setFieldForm({ ...fieldForm, kind: v as FormFieldKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as FormFieldKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Label *</Label><Input value={fieldForm.label} onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })} /></div>
            <div><Label>Help text</Label><Input value={fieldForm.helpText} onChange={(e) => setFieldForm({ ...fieldForm, helpText: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <Checkbox id="req" checked={fieldForm.required} onCheckedChange={(v) => setFieldForm({ ...fieldForm, required: !!v })} />
              <Label htmlFor="req" className="cursor-pointer">Required</Label>
            </div>
            {(fieldForm.kind === "single_select" || fieldForm.kind === "multi_select") && (
              <div className="space-y-2">
                <Label>Options</Label>
                {fieldForm.options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={opt} onChange={(e) => {
                      const next = fieldForm.options.slice();
                      next[i] = e.target.value;
                      setFieldForm({ ...fieldForm, options: next });
                    }} />
                    <Button variant="ghost" size="sm" onClick={() => setFieldForm({ ...fieldForm, options: fieldForm.options.filter((_, j) => j !== i) })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setFieldForm({ ...fieldForm, options: [...fieldForm.options, ""] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add option
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldOpen(false)}>Cancel</Button>
            <Button onClick={submitField}>{editingField ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
