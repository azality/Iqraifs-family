// Manage parents for an org. Mirrors ManageStudents shape: searchable
// table, single add/edit/delete, CSV bulk upload.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Plus, Upload, Search, Trash2, Pencil } from "lucide-react";
import {
  HeroCard,
  DataTable,
  cardBase,
  type DataTableColumn,
} from "../../components/school-ui";
import { Star, Users } from "lucide-react";
import {
  getSchoolMe,
  isOrgAdmin,
  listClasses,
  listParents,
  createParent,
  updateParent,
  deleteParent,
  bulkCreateParents,
  type AdminClass,
  type AdminParent,
  type CreateParentBody,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { CsvUploadDialog } from "./components/CsvUploadDialog";

const empty: CreateParentBody = { fullName: "", phone: "", email: "", relationship: "" };

export function ManageParents() {
  const { orgId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [parents, setParents] = useState<AdminParent[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminParent | null>(null);
  const [form, setForm] = useState<CreateParentBody>(empty);
  const [csvOpen, setCsvOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // class_section_id → "Grade 5-A" label, so the Children column can show
  // each child's class instead of a raw uuid.
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const sectionLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of classes) for (const s of c.sections ?? []) {
      m.set(s.id, `${c.name}-${s.name}`);
    }
    return m;
  }, [classes]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId) return;
    listParents(orgId, { search: search || undefined }).then(setParents).catch((e) => setError(e?.message || "Failed"));
  };

  useEffect(() => {
    if (orgId) listClasses(orgId).then(setClasses).catch(() => {});
    refresh();
    // eslint-disable-next-line
  }, [orgId, search]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  const startCreate = () => { setEditing(null); setForm(empty); setFormOpen(true); };
  const startEdit = (p: AdminParent) => {
    setEditing(p);
    setForm({ fullName: p.full_name, phone: p.phone || "", email: p.email || "", relationship: p.relationship || "" });
    setFormOpen(true);
  };
  const submitForm = async () => {
    if (!form.fullName) return;
    try {
      if (editing) await updateParent(orgId, editing.id, form);
      else await createParent(orgId, form);
      setFormOpen(false);
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const handleDelete = async (p: AdminParent) => {
    if (!confirm(`Delete parent "${p.full_name}"?`)) return;
    await deleteParent(orgId, p.id);
    refresh();
  };
  const handleCsvSubmit = async (rows: Array<Record<string, string>>) => {
    const res = await bulkCreateParents(orgId, rows);
    refresh();
    return res;
  };

  const columns: DataTableColumn<AdminParent>[] = [
    {
      key: "full_name",
      header: "Name",
      cell: (p) => (
        <div>
          <span className="font-medium">{p.full_name}</span>
          {(p.children?.length ?? 0) > 1 && (
            // Sibling-group badge — visually flags "this parent has
            // multiple children at this school" so admins can spot
            // families at a glance.
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              <Users className="h-2.5 w-2.5" />
              {p.children!.length} kids
            </span>
          )}
        </div>
      ),
    },
    { key: "relationship", header: "Relationship", cell: (p) => <span className="text-xs text-slate-500">{p.relationship || "—"}</span> },
    { key: "phone", header: "Phone", cell: (p) => <span className="text-xs">{p.phone || "—"}</span> },
    { key: "email", header: "Email", cell: (p) => <span className="text-xs">{p.email || "—"}</span> },
    {
      key: "children",
      header: "Children",
      cell: (p) => {
        const kids = p.children ?? [];
        if (kids.length === 0) return <span className="text-xs text-slate-400">— none linked</span>;
        return (
          <div className="flex flex-col gap-0.5">
            {kids.map((k) => (
              <div key={k.id} className="flex items-baseline gap-1.5 text-xs">
                {k.isPrimary && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                <span className="font-medium text-slate-700">{k.full_name}</span>
                {k.class_section_id && sectionLabel.get(k.class_section_id) && (
                  <span className="text-slate-500">· {sectionLabel.get(k.class_section_id)}</span>
                )}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      cell: (p) => (
        <div className="inline-flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(p)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Parents"
        subtitle={`${parents.length} parent${parents.length === 1 ? "" : "s"}`}
        rightSlot={
          <div className="flex gap-2">
            <Link to={`/school/orgs/${orgId}/admin`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Admin</Button>
            </Link>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setCsvOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Bulk CSV
            </Button>
            <Button size="sm" onClick={startCreate} className="bg-white text-slate-900 hover:bg-slate-100">
              <Plus className="h-4 w-4 mr-1" /> Add Parent
            </Button>
          </div>
        }
      />

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
        <Input className="pl-8" placeholder="Search name, phone, or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className={cardBase}>
        <DataTable<AdminParent>
          columns={columns}
          rows={parents}
          rowKey={(p) => p.id}
          emptyMessage="No parents yet."
        />
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit parent" : "Add parent"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Full name*</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div><Label>Relationship</Label><Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="father / mother / guardian" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvUploadDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="Bulk upload parents"
        columns={[
          { key: "fullName", label: "Full name", required: true, aliases: ["name", "full_name"] },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "relationship", label: "Relationship" },
          { key: "studentGrNumber", label: "Student GR# (for auto-link)", aliases: ["student_gr", "gr_no", "studentGr"] },
        ]}
        onSubmit={handleCsvSubmit}
      />
    </div>
  );
}
