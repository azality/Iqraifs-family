// FormsList — admin/teacher list of forms with filter pills.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Plus, Eye, MessageSquare, XCircle, Trash2 } from "lucide-react";
import { HeroCard, DataTable, type DataTableColumn } from "../../components/school-ui";
import {
  getSchoolMe,
  isOrgAdmin,
  listForms,
  closeForm,
  deleteForm,
  type Form,
  type FormStatus,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

const STATUS_BADGE: Record<FormStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-emerald-100 text-emerald-700",
  closed: "bg-rose-100 text-rose-700",
};

function FormStatusBadge({ status }: { status: FormStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

function audienceLabel(f: Form): string {
  switch (f.audience_kind) {
    case "whole_school":
      return "Whole school";
    case "class_section":
      return f.audience_section_id ? "Class section" : "Class section";
    case "specific_students":
      return `${f.audience_student_ids?.length ?? 0} specific`;
  }
}

export function FormsList() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [filter, setFilter] = useState<FormStatus | "all">("all");
  const [forms, setForms] = useState<Form[]>([]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listForms(orgId, filter !== "all" ? { status: filter } : {})
      .then((r) => setForms(r.forms))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  };

  useEffect(refresh, [orgId, filter]);

  const filtered = useMemo(() => forms, [forms]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const handleClose = async (f: Form) => {
    if (!confirm(`Close form "${f.title}"?`)) return;
    await closeForm(orgId, f.id);
    refresh();
  };

  const handleDelete = async (f: Form) => {
    if (!confirm(`Delete form "${f.title}"?`)) return;
    await deleteForm(orgId, f.id);
    refresh();
  };

  const columns: Array<DataTableColumn<Form>> = [
    {
      key: "title",
      header: "Title",
      cell: (f) => (
        <div>
          <div className="font-medium text-slate-900">{f.title}</div>
          {f.description && <div className="text-xs text-slate-500 line-clamp-1">{f.description}</div>}
        </div>
      ),
    },
    { key: "audience", header: "Audience", cell: (f) => <span className="text-xs text-slate-600">{audienceLabel(f)}</span> },
    { key: "status", header: "Status", width: "w-24", cell: (f) => <FormStatusBadge status={f.status} /> },
    { key: "responses", header: "Responses", align: "right", width: "w-24", cell: (f) => <span className="tabular-nums">{f.responseCount ?? 0}</span> },
    { key: "deadline", header: "Deadline", width: "w-32", cell: (f) => <span className="text-xs text-slate-600 tabular-nums">{f.deadline ? f.deadline.slice(0, 10) : "—"}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-36",
      cell: (f) => (
        <div className="inline-flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Link to={`/school/orgs/${orgId}/admin/forms/${f.id}`}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Open"><Eye className="h-3.5 w-3.5" /></Button>
          </Link>
          <Link to={`/school/orgs/${orgId}/admin/forms/${f.id}/responses`}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Responses"><MessageSquare className="h-3.5 w-3.5" /></Button>
          </Link>
          {f.status === "published" && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Close" onClick={() => handleClose(f)}>
              <XCircle className="h-3.5 w-3.5 text-amber-600" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(f)}>
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      ),
    },
  ];

  const pills: Array<{ key: FormStatus | "all"; label: string }> = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "published", label: "Published" },
    { key: "closed", label: "Closed" },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Forms"
        subtitle="Surveys, permission slips, and requests"
        rightSlot={
          <div className="flex gap-2">
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
            </Link>
            <Button size="sm" className="bg-white text-indigo-700 hover:bg-indigo-50" onClick={() => navigate(`/school/orgs/${orgId}/admin/forms/new`)}>
              <Plus className="h-4 w-4 mr-1" /> New Form
            </Button>
          </div>
        }
      />

      <div className="flex gap-2 flex-wrap">
        {pills.map((p) => (
          <button
            key={p.key}
            onClick={() => setFilter(p.key)}
            className={
              "rounded-full px-3 py-1 text-xs font-medium transition " +
              (filter === p.key
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(f) => f.id}
        onRowClick={(f) => navigate(`/school/orgs/${orgId}/admin/forms/${f.id}`)}
        emptyMessage="No forms yet."
      />
    </div>
  );
}
