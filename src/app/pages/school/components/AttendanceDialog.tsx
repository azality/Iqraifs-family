// Class attendance roll-call dialog.
//
// Teacher opens at the start of the day → date picker (default today)
// → per-student status select → submit. Upserts on (child_id, date) so
// fixing a mid-day mistake doesn't create duplicate rows.

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Loader2, Check, Users, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { recordAttendance, type AttendanceStatus } from "../../../../utils/schoolApi";

interface Student {
  child: { id: string; name: string; avatar: string | null };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  students: Student[];
  onRecorded: () => void;
}

function defaultDateISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface Row {
  status: AttendanceStatus;
  lateMinutes?: number;
  reason?: string;
}

export function AttendanceDialog({ open, onOpenChange, classId, students, onRecorded }: Props) {
  const [date, setDate] = useState(defaultDateISO());
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ recorded: number } | null>(null);

  // Pre-fill all students as "present" each time the dialog opens.
  // The common case is "almost everyone is present, mark exceptions."
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, Row> = {};
    for (const s of students) initial[s.child.id] = { status: "present" };
    setRows(initial);
    setDone(null);
    setDate(defaultDateISO());
  }, [open, students]);

  const setStatus = (childId: string, status: AttendanceStatus) => {
    setRows((prev) => ({
      ...prev,
      [childId]: {
        status,
        // Clear lateMinutes / reason when leaving those states
        lateMinutes: status === "late" ? prev[childId]?.lateMinutes : undefined,
        reason: status === "absent" ? prev[childId]?.reason : undefined,
      },
    }));
  };

  const setField = (childId: string, field: "lateMinutes" | "reason", value: any) => {
    setRows((prev) => ({ ...prev, [childId]: { ...prev[childId], [field]: value } }));
  };

  const submit = async () => {
    // Validate absent reasons up front
    for (const s of students) {
      const row = rows[s.child.id];
      if (row?.status === "absent" && (!row.reason || row.reason.trim().length === 0)) {
        toast.error(`${s.child.name} marked absent — needs a reason`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const records = students.map((s) => {
        const row = rows[s.child.id] ?? { status: "present" as AttendanceStatus };
        return {
          childId: s.child.id,
          status: row.status,
          lateMinutes: row.status === "late" ? row.lateMinutes : undefined,
          reason: row.status === "absent" ? row.reason : undefined,
        };
      });

      const result: any = await recordAttendance(classId, { date, records });
      setDone({ recorded: result.recorded ?? records.length });
      onRecorded();
    } catch (e: any) {
      toast.error(e?.message || "Could not record attendance");
    } finally {
      setSubmitting(false);
    }
  };

  const counts = {
    present: Object.values(rows).filter((r) => r?.status === "present").length,
    late: Object.values(rows).filter((r) => r?.status === "late").length,
    absent: Object.values(rows).filter((r) => r?.status === "absent").length,
    remote: Object.values(rows).filter((r) => r?.status === "present_remote").length,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            {done ? "Attendance recorded" : "Take attendance"}
          </DialogTitle>
          <DialogDescription>
            {done
              ? `${done.recorded} student${done.recorded === 1 ? "" : "s"} recorded for ${date}.`
              : "Defaults everyone to present. Mark exceptions; absent students need a reason."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm text-muted-foreground">Done — re-open to amend if needed.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="att-date">Date</Label>
              <Input id="att-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">
                Same date + same student upserts (no duplicate rows).
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-700">Present: {counts.present}</span>
              <span className="text-amber-700">Late: {counts.late}</span>
              <span className="text-red-700">Absent: {counts.absent}</span>
              {counts.remote > 0 && <span className="text-blue-700">Remote: {counts.remote}</span>}
            </div>

            <div className="border rounded-lg max-h-80 overflow-y-auto divide-y">
              {students.map((s) => {
                const row = rows[s.child.id] ?? { status: "present" };
                return (
                  <div key={s.child.id} className="p-2.5 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-lg">{s.child.avatar || "👤"}</span>
                      <span className="flex-1 truncate font-medium">{s.child.name}</span>
                      <Select
                        value={row.status}
                        onValueChange={(v) => setStatus(s.child.id, v as AttendanceStatus)}
                      >
                        <SelectTrigger className="w-32 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present">Present</SelectItem>
                          <SelectItem value="late">Late</SelectItem>
                          <SelectItem value="absent">Absent</SelectItem>
                          <SelectItem value="present_remote">Remote</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {row.status === "late" && (
                      <div className="flex items-center gap-2 pl-9 text-xs">
                        <span className="text-muted-foreground">Late by</span>
                        <Input
                          type="number"
                          min="0"
                          className="h-7 w-20 text-xs"
                          value={row.lateMinutes ?? ""}
                          onChange={(e) => setField(s.child.id, "lateMinutes", parseInt(e.target.value, 10) || undefined)}
                        />
                        <span className="text-muted-foreground">min</span>
                      </div>
                    )}

                    {row.status === "absent" && (
                      <div className="pl-9">
                        <Input
                          placeholder="Reason (required)"
                          className="h-7 text-xs"
                          value={row.reason ?? ""}
                          onChange={(e) => setField(s.child.id, "reason", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              Submitting will write {students.length} rows. Re-submit on the same date to amend.
            </p>
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={submitting || students.length === 0}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Record attendance
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
