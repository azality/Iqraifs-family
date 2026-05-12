// Class detail page — roster + student add + invite-code distribution.
//
// Routed as /school/classes/:classId. Accessible to:
//   - the org's principal
//   - teachers of this class
//
// Backend already enforces both. This page is identical for both roles in
// v1; teacher-only logging actions (Salah bulk, Hifz, behavior) land in the
// next PR.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { ChevronLeft, Plus, Copy, Check, AlertCircle, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  createStudent,
  getClassRoster,
  type ClassRosterEntry,
} from "../../../utils/schoolApi";

export function ClassDetail() {
  const { classId = "" } = useParams();
  const [students, setStudents] = useState<ClassRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add student dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDob, setNewDob] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ name: string; code: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await getClassRoster(classId);
      setStudents(r.students);
    } catch (e: any) {
      setError(e?.message || "Could not load roster");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (classId) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const submitAdd = async () => {
    if (!newName.trim()) { toast.error("Name required"); return; }
    setSubmitting(true);
    try {
      const result = await createStudent(classId, {
        name: newName.trim(),
        dateOfBirth: newDob || undefined,
        generateParentInvite: true,
      });
      const code = result.invite?.invite_code ?? "";
      setLastCreated({ name: result.child.name, code });
      setNewName("");
      setNewDob("");
      // Reload roster so the new row appears
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Could not add student");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success("Invite code copied");
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast.error("Could not copy — copy manually");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (error) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            Could not load class
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/school" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="h-3 w-3" />
          Back to school
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UsersRound className="h-6 w-6 text-blue-600" />
              Class roster
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {students.length} student{students.length === 1 ? "" : "s"} enrolled
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add student
          </Button>
        </div>
      </div>

      {/* Roster */}
      <Card>
        <CardContent className="p-0">
          {students.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <UsersRound className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              No students enrolled yet. Click <strong>Add student</strong> to start.
            </div>
          ) : (
            <ul className="divide-y">
              {students.map((s) => (
                <li key={s.enrollmentId} className="px-4 py-3 flex items-center gap-3">
                  <div className="text-2xl">{s.child.avatar || "👤"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.child.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.child.current_points} pts ·
                      {s.parentConnected ? (
                        <span className="text-green-700"> parent connected</span>
                      ) : (
                        <span className="text-amber-700"> parent not connected</span>
                      )}
                    </p>
                  </div>
                  {s.activeInvite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyCode(s.activeInvite!.invite_code)}
                      className="font-mono"
                    >
                      {copiedCode === s.activeInvite.invite_code ? (
                        <Check className="h-3 w-3 mr-1.5" />
                      ) : (
                        <Copy className="h-3 w-3 mr-1.5" />
                      )}
                      {s.activeInvite.invite_code}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {students.length > 0 && (
        <p className="text-xs text-muted-foreground">
          💡 Tap the invite code to copy. Paste into WhatsApp/SMS to the parent.
          They'll use it to link their family to their child's school record.
        </p>
      )}

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setLastCreated(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lastCreated ? `Student added: ${lastCreated.name}` : "Add a student"}</DialogTitle>
            <DialogDescription>
              {lastCreated
                ? "Send this invite code to the student's parent."
                : "Creates the student record and a parent invite code."}
            </DialogDescription>
          </DialogHeader>

          {lastCreated ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <p className="text-xs text-amber-800 uppercase tracking-wide mb-1">Parent invite code</p>
                <p className="font-mono text-2xl font-bold text-amber-900">{lastCreated.code}</p>
              </div>
              <Button onClick={() => copyCode(lastCreated.code)} variant="outline" className="w-full">
                {copiedCode === lastCreated.code ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy code
              </Button>
              <Badge variant="secondary" className="text-xs">
                Valid for 90 days
              </Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="student-name">Name</Label>
                <Input
                  id="student-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ahmad Khan"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="student-dob">Date of birth (optional)</Label>
                <Input
                  id="student-dob"
                  type="date"
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {lastCreated ? (
              <>
                <Button variant="outline" onClick={() => setLastCreated(null)}>Add another</Button>
                <Button onClick={() => { setAddOpen(false); setLastCreated(null); }}>Done</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={submitAdd} disabled={submitting || !newName.trim()}>
                  {submitting ? "Adding…" : "Add student"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
