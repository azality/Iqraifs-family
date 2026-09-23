// StreamChoicesPanel — which subject of an elective group each child
// takes ("Stream": Biology | Computer, Class IX/X).
//
// Entering Class IX a child picks a stream and studies ONE of the
// group's subjects; every marks surface counts only the chosen one. A
// child with no choice sits none of them and is flagged here and on
// the tabulation until the school decides — counting a guessed subject
// into a register would be worse than a gap.
//
// Mounted under ClassSubjectsManager whenever the class has an
// elective group. One Select per child per group; saves as it changes.

import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { toast } from "sonner";
import {
  getSectionSubjectChoices,
  putSectionSubjectChoices,
  type SubjectChoiceGroup,
} from "../../../../utils/schoolApi";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../../components/ui/select";

interface Props {
  sections: Array<{ id: string; name: string | null }>;
  /** Same right as the subject list itself. */
  editable: boolean;
}

export function StreamChoicesPanel({ sections, editable }: Props) {
  const [bySection, setBySection] = useState<Record<string, SubjectChoiceGroup[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    for (const sec of sections) {
      getSectionSubjectChoices(sec.id)
        .then((r) => setBySection((prev) => ({ ...prev, [sec.id]: r.groups })))
        .catch(() => {});
    }
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map((s) => s.id).join(",")]);

  const setChoice = async (sectionId: string, group: string, studentId: string, subjectId: string) => {
    setBusy(studentId);
    try {
      await putSectionSubjectChoices(sectionId, [
        subjectId === "__none__"
          ? { studentId, classSubjectId: null, group }
          : { studentId, classSubjectId: subjectId },
      ]);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not save the choice");
    } finally {
      setBusy(null);
    }
  };

  const anyGroups = sections.some((s) => (bySection[s.id] ?? []).length > 0);
  if (!anyGroups) return null;

  return (
    <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-indigo-600" />
        <div>
          <h5 className="text-sm font-semibold text-slate-900">Stream choices</h5>
          <p className="text-xs text-slate-500">
            Each child takes ONE subject of the group. Marks sheets, the tabulation and
            report cards count only the chosen one; a child without a choice counts in
            neither until it is set.
          </p>
        </div>
      </div>
      {sections.map((sec) =>
        (bySection[sec.id] ?? []).map((g) => {
          const missing = g.students.filter((s) => !s.chosenSubjectId).length;
          const tally = g.subjects.map((sub) => ({
            name: sub.name,
            n: g.students.filter((s) => s.chosenSubjectId === sub.id).length,
          }));
          return (
            <div key={`${sec.id}:${g.group}`} className="mt-2 rounded-md border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800">
                  {g.group}{sections.length > 1 ? ` — Section ${sec.name ?? ""}` : ""}
                </span>
                <span className="text-slate-500">
                  {tally.map((t) => `${t.name} ${t.n}`).join(" · ")}
                  {missing > 0
                    ? <span className="ml-2 font-semibold text-amber-700">{missing} undecided</span>
                    : <span className="ml-2 font-semibold text-emerald-700">all chosen</span>}
                </span>
              </div>
              <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {g.students.map((stu) => (
                  <div key={stu.id} className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 hover:bg-slate-50">
                    <span className={"truncate text-xs " + (stu.chosenSubjectId ? "text-slate-700" : "font-semibold text-amber-700")}>
                      {stu.fullName}
                      <span className="ml-1 text-[10px] text-slate-400">{stu.grNumber ?? ""}</span>
                    </span>
                    <Select
                      value={stu.chosenSubjectId ?? "__none__"}
                      onValueChange={(v) => setChoice(sec.id, g.group, stu.id, v)}
                      disabled={!editable || busy === stu.id}
                    >
                      <SelectTrigger className="h-6 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {g.subjects.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}
