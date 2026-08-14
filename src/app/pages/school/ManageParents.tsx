// Manage parents for an org. Mirrors ManageStudents shape: searchable
// table, single add/edit/delete, CSV bulk upload.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
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
import { Plus, Upload, Search, Trash2, Pencil, Mail, Phone, GraduationCap, Link2 } from "lucide-react";
import {
  HeroCard,
  cardBase,
  NoAccessRedirect,
} from "../../components/school-ui";
import { Star, Users } from "lucide-react";
import {
  getSchoolMe,
  isOrgAdmin,
  viewerRoleForOrg,
  listClasses,
  listParents,
  createParent,
  updateParent,
  deleteParent,
  bulkCreateParents,
  linkParentCanonical,
  unlinkParentCanonical,
  linkStudentParent,
  listStudents,
  type AdminStudent,
  type AdminClass,
  type AdminParent,
  type CreateParentBody,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";
import { useOrgPermissionState } from "./useOrgPermission";
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
  // Link-a-child dialog state + roster for its search.
  const [linkParent, setLinkParent] = useState<AdminParent | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [allStudents, setAllStudents] = useState<AdminStudent[]>([]);
  // Filter scope — search applies only against the selected facet.
  // "all" = parent name + student name + class. Default.
  type SearchScope = "all" | "parent" | "student" | "class";
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
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

  // Server-side search has been REMOVED — we now filter on the client
  // because the search box has to work across parent name, child name,
  // AND class. The backend would need three different params + an OR
  // semantic; cheaper to ship to the client (parents list is bounded at
  // 500 rows).
  const refresh = () => {
    if (!orgId) return;
    listParents(orgId, {}).then(setParents).catch((e) => setError(e?.message || "Failed"));
  };

  useEffect(() => {
    if (orgId) listClasses(orgId).then(setClasses).catch(() => {});
    if (orgId) listStudents(orgId).then(setAllStudents).catch(() => {});
    refresh();
    // eslint-disable-next-line
  }, [orgId]);

  // ─── Cluster parents into family units by shared children ─────────────
  // Union-find on parents. Two parents are in the same family iff they
  // both link to at least one common student. Single parents form their
  // own one-row family. MUST stay above the early returns below so the
  // hook count is constant across renders (React error #310 if not).
  const families = useMemo(() => {
    if (parents.length === 0) return [];
    const parentsOfChild = new Map<string, string[]>();
    for (const p of parents) {
      for (const c of p.children ?? []) {
        const arr = parentsOfChild.get(c.id) ?? [];
        arr.push(p.id);
        parentsOfChild.set(c.id, arr);
      }
    }
    const parent: Record<string, string> = {};
    for (const p of parents) parent[p.id] = p.id;
    const find = (x: string): string => parent[x] === x ? x : (parent[x] = find(parent[x]));
    const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    for (const ids of parentsOfChild.values()) {
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }
    const groups = new Map<string, AdminParent[]>();
    for (const p of parents) {
      const r = find(p.id);
      const arr = groups.get(r) ?? [];
      arr.push(p);
      groups.set(r, arr);
    }
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

  // Apply the search filter to families. Scope determines which fields
  // are matched: "all" matches across everything, the others narrow it.
  // Case-insensitive substring match throughout.
  const visibleFamilies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families;

    const matchParent = (p: AdminParent) =>
      p.full_name.toLowerCase().includes(q) ||
      (p.phone ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q);
    const matchChild = (c: NonNullable<AdminParent["children"]>[number]) =>
      c.full_name.toLowerCase().includes(q) ||
      (c.gr_number ?? "").toLowerCase().includes(q);
    const matchClass = (c: NonNullable<AdminParent["children"]>[number]) => {
      const label = c.class_section_id ? sectionLabel.get(c.class_section_id) : null;
      return !!label && label.toLowerCase().includes(q);
    };

    return families.filter((f) => {
      switch (searchScope) {
        case "parent":
          return f.parents.some(matchParent);
        case "student":
          return f.children.some(matchChild);
        case "class":
          return f.children.some(matchClass);
        case "all":
        default:
          return (
            f.parents.some(matchParent) ||
            f.children.some(matchChild) ||
            f.children.some(matchClass)
          );
      }
    });
  }, [families, search, searchScope, sectionLabel]);

  // ─── Likely-duplicate detection (settings/admin pass) ────────────────
  // Two UNLINKED parents are a merge candidate when their normalized
  // phone digits match, or their names match exactly (case-insensitive).
  // Rows already aliased (canonical_id set) are listed separately with
  // an Unlink action. Pure client-side — the list is bounded at 500.
  const duplicatePairs = useMemo(() => {
    const norm = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const pairs: Array<{ a: AdminParent; b: AdminParent; why: string }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const a = parents[i], b = parents[j];
        if (a.canonical_id || b.canonical_id) continue; // already merged
        const phoneMatch = norm(a.phone).length >= 7 && norm(a.phone) === norm(b.phone);
        const nameMatch = a.full_name.trim().toLowerCase() === b.full_name.trim().toLowerCase();
        if (!phoneMatch && !nameMatch) continue;
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a, b, why: phoneMatch ? "same phone" : "same name" });
      }
    }
    return pairs;
  }, [parents]);
  const aliasedParents = useMemo(
    () => parents.filter((p) => p.canonical_id),
    [parents],
  );
  const parentById = useMemo(
    () => new Map(parents.map((p) => [p.id, p])),
    [parents],
  );

  // Permission-aware gate. isOrgAdmin still short-circuits for
  // principal/admin; other roles resolve through the effective matrix
  // (manage_students) so the Permissions editor's toggles govern this page.
  // While the matrix fetch is in flight we render nothing rather than
  // bouncing a legitimately-permitted user.
  const viewerRole = me ? viewerRoleForOrg(me, orgId) : null;
  const perm = useOrgPermissionState(orgId, viewerRole, "manage_students");

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !perm.allowed) {
    if (perm.loading) return null;
    return <NoAccessRedirect />;
  }

  const startCreate = () => { setEditing(null); setForm(empty); setFormOpen(true); };
  const startEdit = (p: AdminParent) => {
    setEditing(p);
    setForm({ fullName: p.full_name, phone: p.phone || "", email: p.email || "", relationship: p.relationship || "" });
    setFormOpen(true);
  };
  const submitForm = async () => {
    if (!form.fullName) return;
    try {
      if (editing) {
        await updateParent(orgId, editing.id, form);
      } else {
        const created = await createParent(orgId, form);
        // Pilot feedback: a freshly added parent was a dead end ("no
        // linked children", no way to link). Flow straight into the
        // link-a-child dialog for the new record.
        if ((created as any)?.id) {
          openLink({ ...(created as any), children: [] });
        }
      }
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

  // ─── Link-a-child dialog (pilot feedback: parents added from this page
  // were unlinked with no way to attach a student — the link affordance
  // only existed on the student's own page). Search the roster by name /
  // GR and link; reuses the same student-parent link API as StudentDetail.
  const openLink = (p: AdminParent) => {
    setLinkParent(p);
    setLinkSearch("");
    setLinkBusy(null);
  };
  const linkResults = useMemo(() => {
    if (!linkParent) return [];
    const q = linkSearch.trim().toLowerCase();
    const linkedIds = new Set((linkParent.children ?? []).map((c) => c.id));
    return allStudents
      .filter((s) => !linkedIds.has(s.id))
      .filter((s) =>
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        (s.gr_number ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [linkParent, linkSearch, allStudents]);
  const handleLinkChild = async (studentId: string) => {
    if (!linkParent) return;
    setLinkBusy(studentId);
    try {
      await linkStudentParent(orgId, {
        studentId,
        parentId: linkParent.id,
        // First linked child ⇒ this parent becomes the primary contact.
        isPrimary: (linkParent.children ?? []).length === 0,
      });
      const linked = allStudents.find((s) => s.id === studentId);
      toast.success(`Linked ${linked?.full_name ?? "student"}.`);
      // Keep the dialog open so siblings can be linked in one sitting;
      // the freshly linked student drops out of the result list.
      setLinkParent((p) =>
        p
          ? {
              ...p,
              children: [
                ...(p.children ?? []),
                ...(linked
                  ? [{ id: linked.id, full_name: linked.full_name, gr_number: linked.gr_number, class_section_id: linked.class_section_id, isPrimary: false }]
                  : []),
              ],
            }
          : p,
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link.");
    } finally {
      setLinkBusy(null);
    }
  };

  // Merge/unlink actions are admin/principal-only (backend enforces the
  // same); permission-holders like office_staff see the panel read-only.
  const canMerge = isOrgAdmin(me, orgId);
  const handleMerge = async (alias: AdminParent, canonical: AdminParent) => {
    if (!confirm(
      `Merge "${alias.full_name}" into "${canonical.full_name}"?\n\n` +
      `A PIN login as either parent will see children of both. ` +
      `"${canonical.full_name}" becomes the main record.`,
    )) return;
    try {
      await linkParentCanonical(alias.id, canonical.id);
      toast.success(`Merged ${alias.full_name} into ${canonical.full_name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge.");
    }
    refresh();
  };
  const handleUnlink = async (alias: AdminParent) => {
    if (!confirm(`Unlink "${alias.full_name}"? It becomes an independent record again.`)) return;
    try {
      await unlinkParentCanonical(alias.id);
      toast.success(`Unlinked ${alias.full_name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unlink.");
    }
    refresh();
  };

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

      {/* Possible duplicates + existing merges (settings/admin pass). */}
      {(duplicatePairs.length > 0 || aliasedParents.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div className="text-sm font-semibold text-amber-900">
            Possible duplicate parents
          </div>
          {duplicatePairs.length === 0 && (
            <p className="text-xs text-amber-800">No unmerged duplicates detected.</p>
          )}
          {duplicatePairs.map(({ a, b, why }) => (
            <div
              key={a.id + b.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-900">{a.full_name}</span>
              <span className="text-slate-400">↔</span>
              <span className="font-medium text-slate-900">{b.full_name}</span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                {why}
              </span>
              {canMerge && (
                <span className="ml-auto flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleMerge(b, a)}>
                    Keep "{a.full_name.split(/\s+/)[0]}"
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleMerge(a, b)}>
                    Keep "{b.full_name.split(/\s+/)[0]}"
                  </Button>
                </span>
              )}
            </div>
          ))}
          {aliasedParents.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-amber-900">Already merged</div>
              {aliasedParents.map((p) => {
                const target = p.canonical_id ? parentById.get(p.canonical_id) : null;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs">
                    <span className="text-slate-700">{p.full_name}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium text-slate-900">{target?.full_name ?? "another campus's record"}</span>
                    {canMerge && (
                      <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs text-rose-700" onClick={() => handleUnlink(p)}>
                        Unlink
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filter scope chips + search input. Chips narrow which facet
          (parent / student / class) the search matches against. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
          {([
            { value: "all" as const,     label: "All" },
            { value: "parent" as const,  label: "Parent name" },
            { value: "student" as const, label: "Student name" },
            { value: "class" as const,   label: "Class" },
          ]).map((chip) => {
            const active = chip.value === searchScope;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setSearchScope(chip.value)}
                className={
                  "rounded-md px-3 py-1 font-medium transition-colors " +
                  (active
                    ? "bg-white text-slate-900 shadow"
                    : "text-slate-600 hover:bg-slate-100")
                }
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder={
              searchScope === "parent"  ? "Search parent name, phone, or email…"
              : searchScope === "student" ? "Search student name or GR#…"
              : searchScope === "class"   ? "Search class (e.g. Grade 2-A)…"
              : "Search anything — parent, student, or class…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Result count — shown only when a search is active so the user
          knows they're seeing a filtered view, not "no parents". */}
      {search.trim() && (
        <p className="text-xs text-slate-500">
          {visibleFamilies.length} of {families.length} famil{families.length === 1 ? "y" : "ies"} match
        </p>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {parents.length === 0 ? (
        <div className={`${cardBase} p-6 text-center text-sm text-slate-500`}>
          No parents yet.
        </div>
      ) : visibleFamilies.length === 0 ? (
        <div className={`${cardBase} p-6 text-center text-sm text-slate-500`}>
          No matches. Try a different search or filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFamilies.map((family) => {
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
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Link a child" onClick={() => openLink(p)}>
                          <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                        </Button>
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
                    <button
                      type="button"
                      onClick={() => openLink(family.parents[0])}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      + Link a child
                    </button>
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

      {/* Link-a-child dialog */}
      <Dialog open={!!linkParent} onOpenChange={(v) => { if (!v) setLinkParent(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link a child to {linkParent?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Search student by name or GR#…"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
            />
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {linkResults.length === 0 && (
                <li className="px-3 py-3 text-sm text-slate-500">
                  {allStudents.length === 0 ? "Loading students…" : "No matching students."}
                </li>
              )}
              {linkResults.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{s.full_name}</div>
                    <div className="text-xs text-slate-500">
                      GR# {s.gr_number}
                      {s.class_section_id && sectionLabel.get(s.class_section_id)
                        ? ` · ${sectionLabel.get(s.class_section_id)}`
                        : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={linkBusy === s.id}
                    onClick={() => handleLinkChild(s.id)}
                  >
                    {linkBusy === s.id ? "Linking…" : "Link"}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Linking connects this parent to the student's record. For
              brothers/sisters, link the same parent to each child.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkParent(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
