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
import { Plus, Upload, Search, Trash2, Pencil, Mail, Phone, GraduationCap } from "lucide-react";
import {
  HeroCard,
  cardBase,
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

  // ─── Cluster parents into family units by shared children ─────────────
  // Algorithm: union-find on parents. Two parents are in the same family
  // iff they are both linked to at least one common student. Single
  // parents form their own one-row family.
  //
  // Renders as one card per family in the order families appear (first
  // appearance of a parent in the parents array). Search continues to
  // work because it's applied server-side; the cards just regroup.
  const families = useMemo(() => {
    if (parents.length === 0) return [];
    // child_id → list of parent_ids linked to that child
    const parentsOfChild = new Map<string, string[]>();
    for (const p of parents) {
      for (const c of p.children ?? []) {
        const arr = parentsOfChild.get(c.id) ?? [];
        arr.push(p.id);
        parentsOfChild.set(c.id, arr);
      }
    }
    // Union-find
    const parent: Record<string, string> = {};
    for (const p of parents) parent[p.id] = p.id;
    const find = (x: string): string => parent[x] === x ? x : (parent[x] = find(parent[x]));
    const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    for (const ids of parentsOfChild.values()) {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }
    // Group parents by root
    const groups = new Map<string, AdminParent[]>();
    for (const p of parents) {
      const r = find(p.id);
      const arr = groups.get(r) ?? [];
      arr.push(p);
      groups.set(r, arr);
    }
    // Each group → distinct children list (some children may appear under
    // multiple parents in the same family; dedupe by child.id)
    return Array.from(groups.values()).map((groupParents) => {
      const seenKids = new Set<string>();
      const kids: NonNullable<AdminParent["children"]> = [];
      for (const p of groupParents) {
        for (const c of p.children ?? []) {
          if (seenKids.has(c.id)) continue;
          seenKids.add(c.id);
          kids.push(c);
        }
      }
      return { parents: groupParents, children: kids };
    });
  }, [parents]);

  return (
    <div className="space-y-4">
      <HeroCard
        title="Parents"
        subtitle={
          families.length === parents.length
            ? `${parents.length} parent${parents.length === 1 ? "" : "s"}`
            : `${families.length} famil${families.length === 1 ? "y" : "ies"} · ${parents.length} parents`
        }
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

      {parents.length === 0 ? (
        <div className={`${cardBase} p-6 text-center text-sm text-slate-500`}>
          No parents yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((family) => {
            const isMultiParent = family.parents.length > 1;
            return (
              <div
                key={family.parents[0].id}
                className={`${cardBase} p-4 flex flex-col gap-3`}
              >
                {/* Family header: parent rows stacked, primary contact
                    sorting handled by server (already alphabetical). */}
                <div className="flex flex-col gap-2">
                  {family.parents.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">{p.full_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500 capitalize">
                          {p.relationship || "Parent"}
                        </div>
                        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-600">
                          {p.phone && (
                            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {p.phone}</span>
                          )}
                          {p.email && (
                            <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{p.email}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(p)}>
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {isMultiParent && (
                    <div className="inline-flex w-fit items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                      Co-parents
                    </div>
                  )}
                </div>

                {/* Children */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                    {family.children.length === 0
                      ? "No linked children"
                      : family.children.length === 1
                        ? "Child"
                        : `${family.children.length} children`}
                  </div>
                  {family.children.length === 0 ? (
                    <p className="text-xs text-slate-400">— none linked</p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {family.children.map((k) => (
                        <li key={k.id} className="flex items-baseline gap-1.5 text-xs">
                          <GraduationCap className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                          <span className="font-medium text-slate-700 truncate">{k.full_name}</span>
                          {k.class_section_id && sectionLabel.get(k.class_section_id) && (
                            <span className="text-slate-500 flex-shrink-0">· {sectionLabel.get(k.class_section_id)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
