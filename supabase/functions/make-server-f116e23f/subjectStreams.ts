// Streams / electives - who sits which subject, in one place.
//
// A subject with an elective_group is one of a set of alternatives
// ("Stream": Biology | Computer, Class IX). A child takes exactly one
// subject of a group; a subject with no group is taken by everyone.
//
// The rule every counting surface shares:
//   - no elective_group        -> every student sits it
//   - elective_group + chosen  -> sits it
//   - elective_group, chose a  -> does NOT sit the others
//   - elective_group, chose    -> a child with NO choice in the group
//     nothing                     sits NONE of its subjects, and is
//                                 reported so the school decides -
//                                 counting a guessed subject into a
//                                 register would be worse than a gap.
//
// Stray score rows for a subject the child does not sit (Class IX's 21
// Biology "absent" stamps on computer students) are NEVER counted, and
// never deleted either - the rule filters them out wherever marks are
// summed.

export interface StreamSubject {
  id: string;
  elective_group?: string | null;
}
export interface SubjectChoice {
  student_id: string;
  class_subject_id: string;
}

export interface SitsResolver {
  /** Does this student sit this subject? Unknown subject ids -> true
   *  (only subjects of THIS class are ever passed in). */
  sits(studentId: string, subjectId: string): boolean;
  /** Group names this class has, in subject order. */
  groups: string[];
  /** Students (of the given roster) with no choice in a group. */
  unchosen(studentIds: string[]): Array<{ group: string; studentIds: string[] }>;
}

export function buildSitsResolver(
  subjects: StreamSubject[],
  choices: SubjectChoice[],
): SitsResolver {
  const groupOf = new Map<string, string>(); // subjectId -> group
  const groups: string[] = [];
  for (const s of subjects) {
    const g = (s.elective_group ?? "").trim();
    if (!g) continue;
    groupOf.set(s.id, g);
    if (!groups.includes(g)) groups.push(g);
  }
  // student -> set of chosen groups; membership check is per (student, subject)
  const chosenSubject = new Set<string>(); // `${student}:${subject}`
  const chosenGroups = new Map<string, Set<string>>(); // student -> groups chosen
  for (const c of choices) {
    const g = groupOf.get(c.class_subject_id);
    if (!g) continue; // a choice row for a non-elective subject is inert
    chosenSubject.add(`${c.student_id}:${c.class_subject_id}`);
    const set = chosenGroups.get(c.student_id) ?? new Set<string>();
    set.add(g);
    chosenGroups.set(c.student_id, set);
  }
  return {
    groups,
    sits(studentId, subjectId) {
      const g = groupOf.get(subjectId);
      if (!g) return true;
      return chosenSubject.has(`${studentId}:${subjectId}`);
    },
    unchosen(studentIds) {
      return groups
        .map((g) => ({
          group: g,
          studentIds: studentIds.filter((id) => !(chosenGroups.get(id)?.has(g))),
        }))
        .filter((x) => x.studentIds.length > 0);
    },
  };
}
