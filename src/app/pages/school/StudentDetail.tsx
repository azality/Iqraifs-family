// Admin view of a single student: profile + linked parents + PIN +
// link-code generator. Reached from ManageStudents.

import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
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
import { Users, KeyRound, Plus, Copy, Trash2, Link2 } from "lucide-react";
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

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId || !studentId) return;
    getStudent(orgId, studentId).then(setStudent).catch((e) => setError(e?.message || "Failed to load"));
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [orgId, studentId]);

  useEffect(() => {
    if (!linkOpen || !parentSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      listParents(orgId, { search: parentSearch }).then(setSearchResults).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [linkOpen, parentSearch, orgId]);

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;
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

  const copy = (s: string) => { void navigator.clipboard.writeText(s); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-indigo-600" />
          {student.full_name}
        </h1>
        <Link to={`/school/orgs/${orgId}/admin/students`}>
          <Button variant="outline" size="sm">← Students</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 flex gap-4 items-start">
          {student.photo_url ? (
            <img src={student.photo_url} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl">
              {student.full_name.charAt(0)}
            </div>
          )}
          <div className="flex-1 text-sm space-y-1">
            <p><span className="text-muted-foreground">GR#:</span> <span className="font-mono">{student.gr_number}</span></p>
            {student.date_of_birth && <p><span className="text-muted-foreground">DOB:</span> {student.date_of_birth}</p>}
            {student.gender && <p><span className="text-muted-foreground">Gender:</span> {student.gender}</p>}
            {student.guardian_phone && <p><span className="text-muted-foreground">Phone:</span> {student.guardian_phone}</p>}
            {student.guardian_email && <p><span className="text-muted-foreground">Email:</span> {student.guardian_email}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Linked parents
          </CardTitle>
          <Button size="sm" onClick={() => setLinkOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Link parent</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {student.parents.length === 0 && <p className="text-sm text-muted-foreground">No parents linked yet.</p>}
          {student.parents.map((p) => (
            <div key={p.id} className="flex items-center gap-2 p-2 border rounded">
              <div className="flex-1">
                <p className="text-sm font-medium">{p.full_name} {p.is_primary && <Badge variant="secondary" className="ml-1 text-xs">Primary</Badge>}</p>
                <p className="text-xs text-muted-foreground">
                  {p.relationship && <>{p.relationship} · </>}
                  {p.phone || p.email || "no contact"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleUnlink(p.id)}>
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> PIN
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button size="sm" onClick={() => setPinOpen(true)}>Set PIN</Button>
          <Button size="sm" variant="outline" onClick={handleResetPin}>Reset PIN (auto-generate)</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Parent link code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button size="sm" onClick={handleGenerateCode}>Generate code</Button>
        </CardContent>
      </Card>

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
                <Input placeholder="Relationship" value={newParentForm.relationship} onChange={(e) => setNewParentForm({ ...newParentForm, relationship: e.target.value })} />
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
    </div>
  );
}
