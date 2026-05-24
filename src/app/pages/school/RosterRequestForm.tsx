// RosterRequestForm — multi-step form for teachers to request adding or
// removing a student from a section.
//
// Routed at /school/orgs/:orgId/sections/:sectionId/roster/new.
// Steps:
//   1. Kind: add existing / add new / remove
//   2. Payload (student picker, new-student form, or roster picker)
//   3. Reason

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ChevronLeft, UserPlus, UserMinus } from "lucide-react";
import { HeroCard, cardBase, cardElev } from "../../components/school-ui";
import {
  listStudents,
  postRosterRequest,
  type AdminStudent,
} from "../../../utils/schoolApi";

type RequestMode = "add-existing" | "add-new" | "remove";

interface NewStudent {
  grNumber: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  guardianPhone: string;
  guardianEmail: string;
}

const emptyNew: NewStudent = {
  grNumber: "",
  fullName: "",
  dateOfBirth: "",
  gender: "",
  guardianPhone: "",
  guardianEmail: "",
};

export function RosterRequestForm() {
  const { orgId = "", sectionId = "" } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<RequestMode | null>(null);

  const [allStudents, setAllStudents] = useState<AdminStudent[]>([]);
  const [sectionStudents, setSectionStudents] = useState<AdminStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [newStudent, setNewStudent] = useState<NewStudent>(emptyNew);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    listStudents(orgId).then(setAllStudents).catch(() => {});
    if (sectionId) {
      listStudents(orgId, { classSectionId: sectionId })
        .then(setSectionStudents)
        .catch(() => {});
    }
  }, [orgId, sectionId]);

  // Students not currently in this section, for the "add existing" picker.
  const eligibleAddExisting = useMemo(() => {
    const inSection = new Set(sectionStudents.map((s) => s.id));
    return allStudents.filter((s) => !inSection.has(s.id));
  }, [allStudents, sectionStudents]);

  const submit = async () => {
    if (!mode) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "add-existing") {
        await postRosterRequest(orgId, sectionId, {
          kind: "add",
          studentId: selectedStudentId,
          reason: reason || undefined,
        });
      } else if (mode === "remove") {
        await postRosterRequest(orgId, sectionId, {
          kind: "remove",
          studentId: selectedStudentId,
          reason: reason || undefined,
        });
      } else if (mode === "add-new") {
        await postRosterRequest(orgId, sectionId, {
          kind: "add",
          newStudentPayload: {
            grNumber: newStudent.grNumber,
            fullName: newStudent.fullName,
            dateOfBirth: newStudent.dateOfBirth || undefined,
            gender: newStudent.gender || undefined,
            guardianPhone: newStudent.guardianPhone || undefined,
            guardianEmail: newStudent.guardianEmail || undefined,
          },
          reason: reason || undefined,
        });
      }
      toast.success("Roster change request submitted for review.");
      navigate(`/school/orgs/${orgId}/admin/classes`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const canAdvanceFrom2 = (): boolean => {
    if (mode === "add-existing" || mode === "remove") return !!selectedStudentId;
    if (mode === "add-new") return !!newStudent.grNumber && !!newStudent.fullName;
    return false;
  };

  const stepLabels = ["Kind", "Details", "Reason"];

  return (
    <div className="space-y-4 max-w-2xl">
      <HeroCard
        title="Roster Request"
        subtitle="Request to add or remove a student from this section"
        rightSlot={
          <Link to={`/school/orgs/${orgId}/admin/classes`}>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
        }
      />

      <ol className="flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                  (active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                    : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-500")
                }
              >
                <span
                  className={
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold " +
                    (active
                      ? "bg-indigo-600 text-white"
                      : done
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-600")
                  }
                >
                  {n}
                </span>
                {label}
              </span>
              {i < 2 && <span className="text-slate-300">›</span>}
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <Card className={`${cardBase} ${cardElev}`}>
        <CardContent className="p-5">
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { key: "add-existing", icon: UserPlus, label: "Add existing student" },
                  { key: "add-new", icon: UserPlus, label: "Add new student" },
                  { key: "remove", icon: UserMinus, label: "Remove from section" },
                ] as Array<{ key: RequestMode; icon: typeof UserPlus; label: string }>
              ).map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.key;
                return (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => setMode(opt.key)}
                    className={
                      "rounded-lg border p-4 text-left transition-colors " +
                      (active
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-indigo-300")
                    }
                  >
                    <Icon className="h-5 w-5 text-indigo-600 mb-2" />
                    <div className="text-sm font-medium">{opt.label}</div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && mode === "add-existing" && (
            <div className="space-y-2">
              <Label>Pick student to add</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Search by name…" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleAddExisting.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} (GR# {s.gr_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 2 && mode === "add-new" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>GR#*</Label>
                <Input
                  value={newStudent.grNumber}
                  onChange={(e) => setNewStudent({ ...newStudent, grNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>Full name*</Label>
                <Input
                  value={newStudent.fullName}
                  onChange={(e) => setNewStudent({ ...newStudent, fullName: e.target.value })}
                />
              </div>
              <div>
                <Label>Date of birth</Label>
                <Input
                  type="date"
                  value={newStudent.dateOfBirth}
                  onChange={(e) => setNewStudent({ ...newStudent, dateOfBirth: e.target.value })}
                />
              </div>
              <div>
                <Label>Gender</Label>
                <Select
                  value={newStudent.gender || "__none__"}
                  onValueChange={(v) =>
                    setNewStudent({ ...newStudent, gender: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Guardian phone</Label>
                <Input
                  value={newStudent.guardianPhone}
                  onChange={(e) => setNewStudent({ ...newStudent, guardianPhone: e.target.value })}
                />
              </div>
              <div>
                <Label>Guardian email</Label>
                <Input
                  type="email"
                  value={newStudent.guardianEmail}
                  onChange={(e) => setNewStudent({ ...newStudent, guardianEmail: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 2 && mode === "remove" && (
            <div className="space-y-2">
              <Label>Pick student to remove from this section</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select student…" />
                </SelectTrigger>
                <SelectContent>
                  {sectionStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} (GR# {s.gr_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <Label htmlFor="rr-reason">Reason</Label>
              <Textarea
                id="rr-reason"
                rows={4}
                placeholder="Why is this change needed?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 1}
          onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2)))}
        >
          Previous
        </Button>
        {step < 3 ? (
          <Button
            disabled={
              (step === 1 && !mode) || (step === 2 && !canAdvanceFrom2())
            }
            onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
          >
            Next
          </Button>
        ) : (
          <Button disabled={submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        )}
      </div>
    </div>
  );
}
