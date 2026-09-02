// Admin view of a single student: profile + linked parents + PIN +
// link-code generator. Reached from ManageStudents.

import { useEffect, useState } from "react";
import { ReadmitDialog } from "./components/ReadmitDialog";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Users, KeyRound, Plus, Copy, Trash2, Link2, BookMarked, Trophy, ClipboardCheck, Wallet, FileText, ArrowRightLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { HeroCard, sectionTitleClasses } from "../../components/school-ui";
import { HifzLogEntry } from "./HifzLogEntry";
import { RelationshipField } from "./components/RelationshipField";
import { HifzProgressFeed } from "./HifzProgressFeed";
import { StudentGradesFeed } from "./StudentGradesFeed";
import { StudentFeeOverrides } from "./StudentFeeOverrides";
import {
  getSchoolMe,
  isOrgAdmin,
  getStudent,
  listParents,
  createParent,
  linkStudentParent,
  unlinkStudentParent,
  setPin,
  resetPin,
  createLinkCode,
  listClasses,
  getStudentBehaviorNotes,
  transferStudent,
  type AdminClass,
  type StudentWithParents,
  type AdminParent,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

export function StudentDetail() {
  const { orgId = "", studentId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [student, setStudent] = useState<StudentWithParents | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Linking parents
  const [linkOpen, setLinkOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<AdminParent[]>([]);
  const [newParentForm, setNewParentForm] = useState({ fullName: "", phone: "", email: "", relationship: "" });

  // PIN
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [resetPinValue, setResetPinValue] = useState<string | null>(null);

  // Link code
  const [codeOpen, setCodeOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expiresAt: string | null } | null>(null);

  // Transfer-to-sibling-campus dialog (settings/admin pass). Target
  // campuses = other orgs where the CALLER is admin/principal — the
  // backend requires admin at both source and target.
  const navigate = useNavigate();
  const [transferOpen, setTransferOpen] = useState(false);
  const [readmitOpen, setReadmitOpen] = useState(false);
  const [transferOrgId, setTransferOrgId] = useState("");
  const [transferSectionId, setTransferSectionId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferClasses, setTransferClasses] = useState<AdminClass[]>([]);
  const [transferBusy, setTransferBusy] = useState(false);

  useEffect(() => {
    if (!transferOrgId) { setTransferClasses([]); return; }
    let cancelled = false;
    listClasses(transferOrgId)
      .then((cs) => { if (!cancelled) setTransferClasses(cs); })
      .catch(() => { if (!cancelled) setTransferClasses([]); });
    return () => { cancelled = true; };
  }, [transferOrgId]);

  // Hifz logger
  const [hifzOpen, setHifzOpen] = useState(false);
  const [hifzReloadKey, setHifzReloadKey] = useState(0);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId || !studentId) return;
    getStudent(orgId, studentId).then(setStudent).catch((e) => setError(e?.message || "Failed to load"));
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [orgId, studentId]);

  // Which class/section is this child in right now? (pilot: the page
  // didn't say — you had to already know.) Resolved from the classes
  // list; also tells us if the class is part of the Hifz program.
  const [sectionInfo, setSectionInfo] = useState<{ label: string; sectionId: string; isHifz: boolean } | null>(null);
  useEffect(() => {
    if (!orgId || !student?.class_section_id) { setSectionInfo(null); return; }
    listClasses(orgId)
      .then((cs) => {
        for (const cl of cs) {
          const sec = (cl.sections ?? []).find((x) => x.id === student.class_section_id);
          if (sec) {
            setSectionInfo({
              label: `${cl.name} · ${sec.name}`,
              sectionId: sec.id,
              isHifz: cl.kind === "hifz" || sec.schedule_key === "hifz",
            });
            return;
          }
        }
        setSectionInfo(null);
      })
      .catch(() => setSectionInfo(null));
  }, [orgId, student?.class_section_id]);

  // Behavior at a glance (last 30 days).
  const [behav30, setBehav30] = useState<{ pos: number; con: number } | null>(null);
  useEffect(() => {
    if (!orgId || !studentId) return;
    const start = new Date(); start.setDate(start.getDate() - 30);
    getStudentBehaviorNotes(orgId, studentId, { startDate: start.toISOString().slice(0, 10) })
      .then((r: any) => {
        const notes = r?.notes ?? [];
        setBehav30({
          pos: notes.filter((n: any) => n.kind === "positive").length,
          con: notes.filter((n: any) => n.kind === "concern").length,
        });
      })
      .catch(() => setBehav30(null));
  }, [orgId, studentId]);

  useEffect(() => {
    if (!linkOpen || !parentSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      listParents(orgId, { search: parentSearch }).then(setSearchResults).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [linkOpen, parentSearch, orgId]);

  if (meLoading) return null;
  // Any school-role user in this org can read a student profile; the
  // admin-only write actions inside the page (delete, link parent, etc.)
  // remain gated by isOrgAdmin checks at the individual button level.
  // Previously the whole page redirected non-admins to /school, which
  // blocked class teachers from seeing their own students.
  if (!me || me.roles.length === 0) return <Navigate to="/school" replace />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!student) return null;

  const handleLinkExisting = async (parentId: string, isPrimary = false) => {
    await linkStudentParent(orgId, { studentId, parentId, isPrimary });
    setLinkOpen(false);
    setParentSearch("");
    refresh();
  };

  const handleCreateAndLink = async () => {
    if (!newParentForm.fullName) return;
    const created = await createParent(orgId, newParentForm);
    await linkStudentParent(orgId, { studentId, parentId: created.id, isPrimary: student.parents.length === 0 });
    setLinkOpen(false);
    setNewParentForm({ fullName: "", phone: "", email: "", relationship: "" });
    refresh();
  };

  const handleUnlink = async (parentId: string) => {
    if (!confirm("Unlink this parent from the student?")) return;
    await unlinkStudentParent(orgId, studentId, parentId);
    refresh();
  };

  const handleSetPin = async () => {
    if (!/^\d{4,6}$/.test(pinValue)) { alert("PIN must be 4-6 digits"); return; }
    await setPin(orgId, { subjectType: "student", subjectId: studentId, pin: pinValue });
    setPinOpen(false);
    setPinValue("");
  };

  const handleResetPin = async () => {
    const res = await resetPin(orgId, { subjectType: "student", subjectId: studentId });
    setResetPinValue(res.pin);
  };

  const handleGenerateCode = async () => {
    const res = await createLinkCode(orgId, { studentId });
    setGeneratedCode(res);
    setCodeOpen(true);
  };

  // Sibling campuses this caller can transfer INTO: other orgs from /me
  // where they're admin/principal. The backend re-checks both sides and
  // same-school-group membership, so a non-sibling org in the list just
  // errors cleanly on submit.
  const transferTargets =
    isOrgAdmin(me, orgId)
      ? (me?.organizations ?? []).filter(
          (o) => o.id !== orgId && isOrgAdmin(me, o.id),
        )
      : [];

  const handleTransfer = async () => {
    if (!transferOrgId || !transferSectionId) {
      toast.error("Pick the target campus and section.");
      return;
    }
    const targetName = transferTargets.find((o) => o.id === transferOrgId)?.name ?? "the other campus";
    if (!confirm(
      `Transfer ${student?.full_name ?? "this student"} to ${targetName}?\n\n` +
      `They leave this campus's roster immediately; attendance and records here are preserved for audit.`,
    )) return;
    setTransferBusy(true);
    try {
      const res = await transferStudent(studentId, {
        toOrgId: transferOrgId,
        toSectionId: transferSectionId,
        reason: transferReason.trim() || undefined,
      });
      toast.success(`Transferred to ${targetName}` + (res.warning ? ` (${res.warning})` : ""));
      setTransferOpen(false);
      // The student is no longer in this org — back to the roster.
      navigate(`/school/orgs/${orgId}/admin/students`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed.");
    } finally {
      setTransferBusy(false);
    }
  };

  const copy = (s: string) => { void navigator.clipboard.writeText(s); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <Link to={`/school/orgs/${orgId}/admin/students`}>
          <Button variant="outline" size="sm">← Students</Button>
        </Link>
      </div>

      {student.status === "withdrawn" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-sm text-amber-900">
            <strong>This student has left the school</strong>
            {student.left_at ? ` on ${new Date(student.left_at).toLocaleDateString()}` : ""}
            {student.left_reason ? ` — "${student.left_reason}"` : ""}.
            {" "}Record and history are read-only reference; they are excluded
            from rosters, attendance and fee billing.
          </div>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setReadmitOpen(true)}
          >
            Re-admit
          </Button>
        </div>
      )}

      {student.status === "withdrawn" && (
        <ReadmitDialog
          orgId={orgId}
          student={student as any}
          open={readmitOpen}
          onClose={() => setReadmitOpen(false)}
          onDone={() => getStudent(orgId, studentId).then(setStudent).catch(() => {})}
        />
      )}

      <HeroCard
        eyebrow={student.status === "withdrawn" ? "Student · Left" : "Student"}
        title={student.full_name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {sectionInfo ? (
              <Link
                to={`/school/orgs/${orgId}/sections/${sectionInfo.sectionId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 font-medium text-white ring-1 ring-white/25 hover:bg-white/20"
                title="Open this class"
              >
                {sectionInfo.label} →
              </Link>
            ) : student.class_section_id ? null : (
              <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-amber-200 ring-1 ring-amber-300/40">No class assigned</span>
            )}
            {sectionInfo?.isHifz && (
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 font-medium text-emerald-200 ring-1 ring-emerald-300/40">Hifz Program</span>
            )}
            <span><span className="text-slate-500">GR#</span> <span className="font-mono text-slate-200">{student.gr_number}</span></span>
            {student.date_of_birth && <span><span className="text-slate-500">DOB</span> {student.date_of_birth}</span>}
            {student.gender && <span><span className="text-slate-500">Gender</span> {student.gender}</span>}
            {student.guardian_phone && <span><span className="text-slate-500">Phone</span> {student.guardian_phone}</span>}
            {student.guardian_email && <span><span className="text-slate-500">Email</span> {student.guardian_email}</span>}
            {behav30 && (behav30.pos > 0 || behav30.con > 0) && (
              <span title="Behavior notes in the last 30 days">
                <span className="text-emerald-300">+{behav30.pos}</span>{" "}
                <span className="text-rose-300">−{behav30.con}</span>{" "}
                <span className="text-slate-500">(30d)</span>
              </span>
            )}
          </span>
        }
        rightSlot={
          <div className="flex items-start gap-3">
            {student.photo_url ? (
              <img
                src={student.photo_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-2 ring-white/20"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-indigo-500/30 flex items-center justify-center text-white font-bold text-xl ring-2 ring-white/20">
                {(student.full_name ?? "?").charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {student.status !== "withdrawn" && (
              <Button
                size="sm"
                className="h-7 bg-white text-slate-900 hover:bg-slate-100"
                onClick={() => setHifzOpen(true)}
              >
                <BookMarked className="h-3.5 w-3.5 mr-1" /> Log Hifz
              </Button>
              )}
              <Link to={`/school/orgs/${orgId}/admin/students/${studentId}/report-card`}>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white w-full"
                >
                  <FileText className="h-3.5 w-3.5 mr-1" /> Report card
                </Button>
              </Link>
              {student.status !== "withdrawn" && (
                <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setPinOpen(true)}
              >
                <KeyRound className="h-3.5 w-3.5 mr-1" /> Set PIN
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={handleGenerateCode}
              >
                <Link2 className="h-3.5 w-3.5 mr-1" /> Link code
              </Button>
                </>
              )}
              {student.status !== "withdrawn" && transferTargets.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setTransferOpen(true)}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transfer
                </Button>
              )}
            </div>
          </div>
        }
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className={sectionTitleClasses}>Linked parents</div>
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Link parent
          </Button>
        </div>
        <Card>
          <CardContent className="p-3 space-y-2">
          {student.parents.length === 0 && <p className="text-sm text-muted-foreground">No parents linked yet.</p>}
          {student.parents.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-2 border border-slate-100 rounded-lg hover:bg-slate-50/60">
              <div className="flex-1">
                <p className="text-sm font-medium">{p.full_name} {p.is_primary && <Badge variant="secondary" className="ml-1 text-xs">Primary</Badge>}</p>
                <p className="text-xs text-muted-foreground">
                  {p.relationship && <>{p.relationship} · </>}
                  {p.phone || p.email || "no contact"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleUnlink(p.id)}>
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              </Button>
            </div>
          ))}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className={sectionTitleClasses}>PIN & link code</div>
        </div>
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPinOpen(true)}>
              <KeyRound className="h-3.5 w-3.5 mr-1" /> Set PIN
            </Button>
            <Button size="sm" variant="outline" onClick={handleResetPin}>
              Reset PIN (auto-generate)
            </Button>
            <Button size="sm" variant="outline" onClick={handleGenerateCode}>
              <Link2 className="h-3.5 w-3.5 mr-1" /> Generate parent link code
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Academic / Hifz / Fees as deliberate, separate tracks.
          Spec explicitly asks: the two progress systems shouldn't be
          mixed into one generic 'grades' screen. Both stay accessible
          from the SAME student profile, but each gets its own surface
          and visual identity (amber for Academic, indigo for Hifz). */}
      <Tabs defaultValue="academic" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="academic" className="gap-1.5">
            <Trophy className="h-3.5 w-3.5" /> Academic
          </TabsTrigger>
          <TabsTrigger value="hifz" className="gap-1.5">
            <BookMarked className="h-3.5 w-3.5" /> Hifz
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Fees
          </TabsTrigger>
        </TabsList>

        <TabsContent value="academic" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-600" /> Grades
              </CardTitle>
              {isOrgAdmin(me, orgId) && student.class_section_id && (
                <Link to={`/school/orgs/${orgId}/sections/${student.class_section_id}/assignments`}>
                  <Button size="sm" variant="outline">
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Log Grade
                  </Button>
                </Link>
              )}
            </CardHeader>
            <CardContent>
              <StudentGradesFeed orgId={orgId} studentId={studentId} />
            </CardContent>
          </Card>
          {/* Deep-links into the section-level surfaces for the
              remaining academic concerns. We don't embed full
              attendance / behavior here — they're sized for the
              section context. The links keep the surface coherent
              without duplicating heavy lists. */}
          {student.class_section_id && (
            <Card>
              <CardContent className="pt-4 flex flex-wrap gap-2">
                <Link to={`/school/orgs/${orgId}/sections/${student.class_section_id}/attendance`}>
                  <Button size="sm" variant="outline">Attendance →</Button>
                </Link>
                <Link to={`/school/orgs/${orgId}/sections/${student.class_section_id}/behavior`}>
                  <Button size="sm" variant="outline">Behavior →</Button>
                </Link>
                <Link to={`/school/orgs/${orgId}/sections/${student.class_section_id}/gradebook?studentId=${student.id}`}>
                  <Button size="sm" variant="outline">Gradebook (this student) →</Button>
                </Link>
                <Link to={`/school/orgs/${orgId}/sections/${student.class_section_id}`}>
                  <Button size="sm" variant="outline">Curriculum →</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="hifz" className="mt-4 space-y-4">
          {/* Hifz progress lives on its own tab with its own header so
              there's no risk of it reading as "yet another grade." */}
          <div className="flex items-center justify-between">
            <div className={sectionTitleClasses}>Hifz progress</div>
            <Button size="sm" onClick={() => setHifzOpen(true)}>
              <BookMarked className="h-3.5 w-3.5 mr-1" /> Log Hifz
            </Button>
          </div>
          <HifzProgressFeed
            orgId={orgId}
            studentId={studentId}
            reloadKey={hifzReloadKey}
          />
        </TabsContent>

        <TabsContent value="fees" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Wallet className="h-4 w-4 text-emerald-600" /> Fee history
                </div>
                <Link to={`/school/orgs/${orgId}/students/${studentId}/fees`}>
                  <Button size="sm" variant="outline">Manage fees →</Button>
                </Link>
              </div>
              <p className="text-xs text-slate-500 mt-1">View fee history, mark periods paid, and add new fee periods.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900 text-sm">Plan & overrides</div>
                <Link to={`/school/orgs/${orgId}/admin/fees/plans`}>
                  <Button size="sm" variant="ghost" className="text-xs">Edit class plans →</Button>
                </Link>
              </div>
              <StudentFeeOverrides orgId={orgId} studentId={studentId} canManage={true} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Link parent dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link a parent</DialogTitle>
            <DialogDescription>Search for an existing parent, or create a new one below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Search existing parents</Label>
              <Input value={parentSearch} onChange={(e) => setParentSearch(e.target.value)} placeholder="Name, phone or email…" />
              {searchResults.length > 0 && (
                <div className="border rounded mt-2 max-h-48 overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleLinkExisting(p.id, student.parents.length === 0)}
                      className="w-full text-left p-2 text-sm hover:bg-muted/50 border-b last:border-b-0"
                    >
                      <p className="font-medium">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground">{p.phone || p.email || "no contact"}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Or create new</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Full name *" value={newParentForm.fullName} onChange={(e) => setNewParentForm({ ...newParentForm, fullName: e.target.value })} />
                <RelationshipField value={newParentForm.relationship} onChange={(v) => setNewParentForm({ ...newParentForm, relationship: v })} />
                <Input placeholder="Phone" value={newParentForm.phone} onChange={(e) => setNewParentForm({ ...newParentForm, phone: e.target.value })} />
                <Input placeholder="Email" value={newParentForm.email} onChange={(e) => setNewParentForm({ ...newParentForm, email: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAndLink} disabled={!newParentForm.fullName}>Create &amp; link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set PIN dialog */}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set PIN</DialogTitle></DialogHeader>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="4-6 digits"
            value={pinValue}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinOpen(false)}>Cancel</Button>
            <Button onClick={handleSetPin}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN result */}
      <Dialog open={!!resetPinValue} onOpenChange={(v) => { if (!v) setResetPinValue(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New PIN</DialogTitle>
            <DialogDescription>This is shown once. Copy and share securely.</DialogDescription>
          </DialogHeader>
          <div className="text-3xl font-mono font-bold text-center py-4 tracking-widest">{resetPinValue}</div>
          <DialogFooter>
            <Button onClick={() => { if (resetPinValue) copy(resetPinValue); }}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
            <Button variant="outline" onClick={() => setResetPinValue(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HifzProgressFeed moved into the Hifz tab above. Phase C.1's
          loose embed at the page bottom is gone — the tabbed layout
          replaces it. */}

      <HifzLogEntry
        orgId={orgId}
        studentId={studentId}
        studentName={student.full_name}
        hifzOnly={sectionInfo?.isHifz ?? false}
        open={hifzOpen}
        onOpenChange={setHifzOpen}
        onSuccess={() => setHifzReloadKey((k) => k + 1)}
      />

      {/* Link code result */}
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parent link code</DialogTitle>
            <DialogDescription>For parent to enter in the family app.</DialogDescription>
          </DialogHeader>
          <div className="text-4xl font-mono font-bold text-center py-4 tracking-widest text-indigo-700">
            {generatedCode?.code}
          </div>
          {generatedCode?.expiresAt && (
            <p className="text-xs text-center text-muted-foreground">
              Expires {new Date(generatedCode.expiresAt).toLocaleDateString()}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => { if (generatedCode?.code) copy(generatedCode.code); }}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
            <Button variant="outline" onClick={() => setCodeOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer to sibling campus (settings/admin pass) */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer {student?.full_name ?? "student"}</DialogTitle>
            <DialogDescription>
              Move this student to a sibling campus in your chain. Their
              records here stay for audit; the roster spot moves.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Target campus</Label>
              <select
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={transferOrgId}
                onChange={(e) => { setTransferOrgId(e.target.value); setTransferSectionId(""); }}
              >
                <option value="">Choose a campus…</option>
                {transferTargets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Target class & section</Label>
              <select
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={transferSectionId}
                onChange={(e) => setTransferSectionId(e.target.value)}
                disabled={!transferOrgId}
              >
                <option value="">
                  {transferOrgId
                    ? transferClasses.length > 0 ? "Choose a section…" : "No sections at that campus"
                    : "Pick a campus first"}
                </option>
                {transferClasses.flatMap((c) =>
                  (c.sections ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{c.name} — {s.name}</option>
                  )),
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-reason">Reason (optional)</Label>
              <Input
                id="transfer-reason"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Family moved closer to North campus"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={transferBusy || !transferOrgId || !transferSectionId}>
              {transferBusy ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
