// FormFill — parent-facing form submission page. Loads the form (incl.
// fields) via the portal API, picks which child the response is about
// (when needed), validates required fields, and POSTs the response.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import {
  HeroCard,
  cardBase,
  cardElev,
  sectionTitleClasses,
} from "../../components/school-ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Checkbox } from "../../components/ui/checkbox";
import { usePinAuth } from "../../contexts/PinAuthContext";
import {
  getMyForm,
  listMyForms,
  submitFormResponse,
  type Form,
  type FormField,
  type PortalStudent,
} from "../../../utils/schoolPortalApi";

type FieldValue = string | string[] | number | null;

function emptyFor(kind: FormField["kind"]): FieldValue {
  return kind === "multi_select" ? [] : kind === "number" ? null : "";
}

function isEmpty(kind: FormField["kind"], v: FieldValue): boolean {
  if (kind === "multi_select") return !Array.isArray(v) || v.length === 0;
  if (kind === "number") return v === null || v === "" || Number.isNaN(v as number);
  return typeof v !== "string" || v.trim() === "";
}

function deadlinePassed(deadline: string | null): boolean {
  if (!deadline) return false;
  const d = new Date(deadline).getTime();
  return !Number.isNaN(d) && d < Date.now();
}

function deadlineLabel(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline).getTime();
  if (Number.isNaN(d)) return null;
  if (d < Date.now()) return "Closed";
  return `Due ${new Date(deadline).toLocaleString()}`;
}

export function FormFill() {
  const { formId = "" } = useParams<{ formId: string }>();
  const { subject } = usePinAuth();
  const navigate = useNavigate();
  const orgId = subject?.orgId ?? "";

  const [form, setForm] = useState<Form | null>(null);
  const [hasResponded, setHasResponded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [touched, setTouched] = useState<boolean>(false);

  // Parent's linked students.
  const parentStudents: PortalStudent[] = useMemo(
    () => (subject?.subjectType === "parent" ? (subject.students ?? []) : []),
    [subject],
  );

  // Eligible students for this form (intersected with audience_student_ids
  // when audience_kind === 'specific_students').
  const eligibleStudents: PortalStudent[] = useMemo(() => {
    if (!form) return parentStudents;
    if (form.audience_kind === "specific_students" && form.audience_student_ids) {
      const ids = new Set(form.audience_student_ids);
      return parentStudents.filter((s) => ids.has(s.id));
    }
    return parentStudents;
  }, [form, parentStudents]);

  useEffect(() => {
    if (!orgId || !formId) return;
    let cancelled = false;
    setForm(null);
    setLoadError(null);
    (async () => {
      try {
        const f = await getMyForm(orgId, formId);
        if (cancelled) return;
        setForm(f);
        // Initialize value map for known fields.
        const init: Record<string, FieldValue> = {};
        (f.fields ?? []).forEach((field) => {
          init[field.id] = emptyFor(field.kind);
        });
        setValues(init);
        // Best-effort: figure out if the parent has already responded so we
        // can show the "already submitted" panel when allow_multiple is false.
        try {
          const my = await listMyForms(orgId);
          if (cancelled) return;
          const summary = my.forms.find((x) => x.form.id === formId);
          if (summary) setHasResponded(summary.hasResponded);
        } catch {
          // Non-fatal; just skip the gating.
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, formId]);

  // Auto-pick the only eligible student.
  useEffect(() => {
    if (!selectedStudentId && eligibleStudents.length === 1) {
      setSelectedStudentId(eligibleStudents[0].id);
    }
  }, [eligibleStudents, selectedStudentId]);

  // Pre-select first student when there are multiple (per spec).
  useEffect(() => {
    if (!selectedStudentId && eligibleStudents.length > 1) {
      setSelectedStudentId(eligibleStudents[0].id);
    }
  }, [eligibleStudents, selectedStudentId]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {loadError}
        </div>
        <Link
          to="/school-portal/forms"
          className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to forms
        </Link>
      </div>
    );
  }

  if (!form) {
    return <div className="text-slate-500 text-sm">Loading…</div>;
  }

  const closed = form.status !== "published" || deadlinePassed(form.deadline);
  const alreadyDone = hasResponded && !form.allow_multiple;
  const fields = [...(form.fields ?? [])].sort(
    (a, b) => a.display_order - b.display_order,
  );

  const validate = (): string | null => {
    if (eligibleStudents.length > 0 && !selectedStudentId) {
      return "Please pick which child this is about.";
    }
    for (const f of fields) {
      if (f.required && isEmpty(f.kind, values[f.id] ?? emptyFor(f.kind))) {
        return `Please fill in: ${f.label}`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      // Backend expects per-kind discriminated fields, not a unified `value`.
      const payload = fields.map((f) => {
        const v = values[f.id];
        if (f.kind === "multi_select") {
          return { fieldId: f.id, valueMulti: Array.isArray(v) ? v : [] };
        }
        if (f.kind === "number") {
          return {
            fieldId: f.id,
            valueNumber: v === "" || v === null || v === undefined ? null : Number(v),
          };
        }
        return { fieldId: f.id, valueText: typeof v === "string" ? v : "" };
      });
      await submitFormResponse(orgId, formId, {
        onBehalfOfStudentId: selectedStudentId || undefined,
        values: payload,
      });
      toast.success("Response submitted");
      navigate("/school-portal/forms");
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed to submit");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <HeroCard
        title={form.title}
        subtitle={form.description ?? undefined}
        rightSlot={
          deadlineLabel(form.deadline) ? (
            <span className="inline-flex items-center rounded-full bg-white/10 text-white border border-white/20 text-xs px-2.5 py-1">
              {deadlineLabel(form.deadline)}
            </span>
          ) : undefined
        }
      />

      <div>
        <Link
          to="/school-portal/forms"
          className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to forms
        </Link>
      </div>

      {alreadyDone && (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-700`}>
          You&rsquo;ve already responded to this form. Thanks!{" "}
          <Link to="/school-portal/forms" className="text-indigo-700 hover:underline">
            Back to forms
          </Link>
        </div>
      )}

      {!alreadyDone && closed && (
        <div className={`${cardBase} ${cardElev} p-6 text-sm text-slate-700`}>
          This form is closed and no longer accepting responses.
        </div>
      )}

      {!alreadyDone && !closed && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {eligibleStudents.length > 1 && (
            <section className={`${cardBase} ${cardElev} p-5`}>
              <h2 className={sectionTitleClasses}>Which child is this about?</h2>
              <div className="mt-3 grid sm:grid-cols-2 gap-2">
                {eligibleStudents.map((s) => {
                  const active = selectedStudentId === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setSelectedStudentId(s.id)}
                      className={
                        "text-left rounded-lg border px-3 py-2.5 transition " +
                        (active
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-indigo-300")
                      }
                    >
                      <div className="font-medium text-slate-900 text-sm">{s.fullName}</div>
                      <div className="text-xs text-slate-500">GR # {s.grNumber}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className={`${cardBase} ${cardElev} p-5 space-y-5`}>
            {fields.length === 0 && (
              <p className="text-sm text-slate-500">This form has no fields.</p>
            )}
            {fields.map((field) => {
              const v = values[field.id] ?? emptyFor(field.kind);
              const showError =
                touched && field.required && isEmpty(field.kind, v);
              return (
                <div key={field.id} className="space-y-1.5">
                  <Label htmlFor={`f-${field.id}`} className="text-sm font-medium text-slate-800">
                    {field.label}
                    {field.required && <span className="text-rose-600 ml-0.5">*</span>}
                  </Label>

                  {field.kind === "short_text" && (
                    <Input
                      id={`f-${field.id}`}
                      type="text"
                      value={typeof v === "string" ? v : ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                    />
                  )}

                  {field.kind === "long_text" && (
                    <Textarea
                      id={`f-${field.id}`}
                      rows={4}
                      value={typeof v === "string" ? v : ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                    />
                  )}

                  {field.kind === "number" && (
                    <Input
                      id={`f-${field.id}`}
                      type="number"
                      value={v === null ? "" : String(v)}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.id]: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                    />
                  )}

                  {field.kind === "single_select" && (
                    <RadioGroup
                      value={typeof v === "string" ? v : ""}
                      onValueChange={(val) =>
                        setValues((prev) => ({ ...prev, [field.id]: val }))
                      }
                      className="gap-2"
                    >
                      {(field.options ?? []).map((opt) => (
                        <div key={opt} className="flex items-center gap-2">
                          <RadioGroupItem id={`f-${field.id}-${opt}`} value={opt} />
                          <Label
                            htmlFor={`f-${field.id}-${opt}`}
                            className="text-sm font-normal text-slate-700"
                          >
                            {opt}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {field.kind === "multi_select" && (
                    <div className="space-y-2">
                      {(field.options ?? []).map((opt) => {
                        const arr = Array.isArray(v) ? v : [];
                        const checked = arr.includes(opt);
                        return (
                          <div key={opt} className="flex items-center gap-2">
                            <Checkbox
                              id={`f-${field.id}-${opt}`}
                              checked={checked}
                              onCheckedChange={(c) => {
                                setValues((prev) => {
                                  const cur = Array.isArray(prev[field.id])
                                    ? (prev[field.id] as string[])
                                    : [];
                                  const next = c
                                    ? Array.from(new Set([...cur, opt]))
                                    : cur.filter((x) => x !== opt);
                                  return { ...prev, [field.id]: next };
                                });
                              }}
                            />
                            <Label
                              htmlFor={`f-${field.id}-${opt}`}
                              className="text-sm font-normal text-slate-700"
                            >
                              {opt}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {field.help_text && (
                    <p className="text-xs text-slate-500">{field.help_text}</p>
                  )}
                  {showError && (
                    <p className="text-xs text-rose-600">This field is required.</p>
                  )}
                </div>
              );
            })}
          </section>

          <div className="flex items-center justify-between">
            <Link
              to="/school-portal/forms"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </form>
      )}

    </div>
  );
}
