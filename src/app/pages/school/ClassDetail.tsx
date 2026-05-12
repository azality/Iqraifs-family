// Class detail — roster + teacher daily logging surface.
//
// Routed as /school/classes/:classId. Accessible to the org's principal
// and teachers of this class (backend enforces both).
//
// Header has class metadata + the "Log Salah for class" bulk button.
// Each student row exposes per-student logging via a dropdown menu:
//   - Log behavior
//   - Log sabaq (Hifz-track classes only)
//   - Copy invite code (when parent not yet connected)

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import {
  ChevronLeft, Plus, Copy, Check, AlertCircle, UsersRound, MoreVertical,
  BookOpen, Heart, Hand,
} from "lucide-react";
import { toast } from "sonner";
import {
  createStudent,
  getClassDetail,
  getClassRoster,
  type ClassRosterEntry,
  type SchoolClass,
} from "../../../utils/schoolApi";
import { BulkSalahDialog } from "./components/BulkSalahDialog";
import { LogSabaqDialog } from "./components/LogSabaqDialog";
import { LogBehaviorDialog } from "./components/LogBehaviorDialog";

export function ClassDetail() {
  const { classId = "" } = useParams();
  const [cls, setCls] = useState<SchoolClass | null>(null);
  const [students, setStudents] = useState<ClassRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [bulkSalahOpen, setBulkSalahOpen] = useState(false);
  const [sabaqTarget, setSabaqTarget] = useState<{ id: string; name: string } | null>(null);
  const [behaviorTarget, setBehaviorTarget] = useState<{ id: string; name: string } | null>(null);

  // Add-student form state
  const [newName, setNewName] = useState("");
  const [newDob, setNewDob] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ name: string; code: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [detail, roster] = await Promise.all([
        getClassDetail(classId),
        getClassRoster(classId),
      ]);
      setCls(detail.class);
      setStudents(roster.students);
    } catch (e: any) {
      setError(e?.message || "Could not load class");
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
      setLastCreated({ name: result.child.name, code: result.invite?.invite_code ?? "" });
      setNewName("");
      setNewDob("");
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
  if (error || !cls) {
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

  const isHifzClass = cls.track === "hifz" || cls.track === "hybrid";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/school" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" />
        Back to school
      </Link>

      {/* Header + class metadata */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-blue-600" />
            {cls.name}
          </h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            <Badge variant="secondary" className="capitalize">{cls.track}</Badge>
            {cls.grade_level !== null && <Badge variant="outline">Grade {cls.grade_level}</Badge>}
            <span>· {students.length} student{students.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setBulkSalahOpen(true)} variant="outline" disabled={students.length === 0}>
            <Hand className="h-4 w-4 mr-2" />
            Log Salah for class
          </Button>
          <Button onClick={() => setAddStudentOpen(true)}>
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
                      {s.child.current_points} pts ·{" "}
                      {s.parentConnected ? (
                        <span className="text-green-700">parent connected</span>
                      ) : (
                        <span className="text-amber-700">parent not connected</span>
                      )}
                    </p>
                  </div>

                  {/* Inline invite-code copy (when not consumed) */}
                  {s.activeInvite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyCode(s.activeInvite!.invite_code)}
                      className="font-mono text-xs"
                    >
                      {copiedCode === s.activeInvite.invite_code ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : (
                        <Copy className="h-3 w-3 mr-1" />
                      )}
                      {s.activeInvite.invite_code}
                    </Button>
                  )}

                  {/* Per-student actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Open actions">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setBehaviorTarget({ id: s.child.id, name: s.child.name })}
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        Log behavior
                      </DropdownMenuItem>
                      {isHifzClass && (
                        <DropdownMenuItem
                          onClick={() => setSabaqTarget({ id: s.child.id, name: s.child.name })}
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          Log sabaq
                        </DropdownMenuItem>
                      )}
                      {s.activeInvite && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copyCode(s.activeInvite!.invite_code)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy invite code
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {students.length > 0 && (
        <p className="text-xs text-muted-foreground">
          💡 Tap an invite code to copy. Send via WhatsApp/SMS so the parent can link their family.
        </p>
      )}

      {/* Add Student Dialog */}
      <Dialog
        open={addStudentOpen}
        onOpenChange={(o) => { setAddStudentOpen(o); if (!o) setLastCreated(null); }}
      >
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
              <Badge variant="secondary" className="text-xs">Valid for 90 days</Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="student-name">Name</Label>
                <Input id="student-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ahmad Khan" autoFocus />
              </div>
              <div className="space-y-1">
                <Label htmlFor="student-dob">Date of birth (optional)</Label>
                <Input id="student-dob" type="date" value={newDob} onChange={(e) => setNewDob(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            {lastCreated ? (
              <>
                <Button variant="outline" onClick={() => setLastCreated(null)}>Add another</Button>
                <Button onClick={() => { setAddStudentOpen(false); setLastCreated(null); }}>Done</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAddStudentOpen(false)}>Cancel</Button>
                <Button onClick={submitAdd} disabled={submitting || !newName.trim()}>
                  {submitting ? "Adding…" : "Add student"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Salah */}
      <BulkSalahDialog
        open={bulkSalahOpen}
        onOpenChange={setBulkSalahOpen}
        classId={classId}
        students={students.map((s) => ({ child: s.child }))}
        onLogged={reload}
      />

      {/* Log Sabaq (per-student) */}
      {sabaqTarget && (
        <LogSabaqDialog
          open={!!sabaqTarget}
          onOpenChange={(o) => { if (!o) setSabaqTarget(null); }}
          childId={sabaqTarget.id}
          childName={sabaqTarget.name}
          onLogged={reload}
        />
      )}

      {/* Log Behavior (per-student) */}
      {behaviorTarget && (
        <LogBehaviorDialog
          open={!!behaviorTarget}
          onOpenChange={(o) => { if (!o) setBehaviorTarget(null); }}
          orgId={cls.organization_id}
          childId={behaviorTarget.id}
          childName={behaviorTarget.name}
          onLogged={reload}
        />
      )}
    </div>
  );
}
