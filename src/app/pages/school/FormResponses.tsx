// FormResponses — admin view of submissions for a form.

import { Fragment, useEffect, useMemo, useState } from "react";

const FragmentWithKey = Fragment;
import { Link, Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  getSchoolMe,
  getForm,
  isOrgAdmin,
  listFormResponses,
  type Form,
  type FormField,
  type FormResponse,
  type FormResponseValue,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

function valueToString(v: FormResponseValue["value"]): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function lookup(values: FormResponseValue[], fieldId: string): string {
  const v = values.find((x) => x.fieldId === fieldId);
  return v ? valueToString(v.value) : "";
}

function truncate(s: string, n = 40): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FormResponses() {
  const { orgId = "", formId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId || !formId) return;
    getForm(orgId, formId).then(setForm).catch(() => {});
    listFormResponses(orgId, formId)
      .then((r) => setResponses(r.responses))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [orgId, formId]);

  const fields = useMemo<FormField[]>(
    () => (form?.fields ?? []).slice().sort((a, b) => a.display_order - b.display_order),
    [form],
  );

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const toggle = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    if (!form) return;
    const header = ["Submitter", "On behalf of", "Submitted at", ...fields.map((f) => f.label)];
    const rows = responses.map((r) => [
      r.submitted_by_name ?? r.submitted_by ?? "",
      r.on_behalf_of_student_name ?? r.on_behalf_of_student_id ?? "",
      r.submitted_at,
      ...fields.map((f) => lookup(r.values, f.id)),
    ]);
    downloadCsv(`${form.title.replace(/\s+/g, "_")}_responses.csv`, [header, ...rows]);
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title={form ? `Responses to ${form.title}` : "Responses"}
        subtitle={`${responses.length} submitted`}
        rightSlot={
          <div className="flex gap-2">
            <Link to={`/school/orgs/${orgId}/admin/forms`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Forms</Button>
            </Link>
            <Button size="sm" className="bg-white text-indigo-700 hover:bg-indigo-50" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>
        }
      />

      <div className={`${cardBase} ${cardElev} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Submitter</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">On behalf of</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Submitted</th>
              {fields.map((f) => (
                <th key={f.id} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {responses.length === 0 ? (
              <tr>
                <td colSpan={4 + fields.length} className="px-3 py-8 text-center text-sm text-slate-500">
                  No responses yet.
                </td>
              </tr>
            ) : (
              responses.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <FragmentWithKey key={r.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => toggle(r.id)}>
                      <td className="px-3 py-2">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                      </td>
                      <td className="px-3 py-2">{r.submitted_by_name ?? r.submitted_by ?? "—"}</td>
                      <td className="px-3 py-2">{r.on_behalf_of_student_name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{new Date(r.submitted_at).toLocaleString()}</td>
                      {fields.map((f) => (
                        <td key={f.id} className="px-3 py-2 text-xs text-slate-700">
                          {truncate(lookup(r.values, f.id))}
                        </td>
                      ))}
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50">
                        <td colSpan={4 + fields.length} className="px-6 py-3">
                          <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            {fields.map((f) => (
                              <div key={f.id}>
                                <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
                                <dd className="text-slate-800 whitespace-pre-wrap">{lookup(r.values, f.id) || "—"}</dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </FragmentWithKey>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
