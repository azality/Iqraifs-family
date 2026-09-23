// The db half of subjectStreams: load the choices and hand back the
// pure resolver. Separate file so the pure rule stays importable by
// unit tests without touching middleware/env.

import { serviceRoleClient } from "./middleware.tsx";
import { buildSitsResolver, type SitsResolver, type StreamSubject } from "./subjectStreams.ts";

/** Resolver for one class's subjects over the given students. When no
 *  subject carries an elective_group the choice query is skipped -
 *  every class except IX and X takes this path and pays nothing. */
export async function loadSitsResolver(
  subjects: Array<StreamSubject & Record<string, unknown>>,
  studentIds: string[],
): Promise<SitsResolver> {
  const hasGroups = subjects.some((s) => (s.elective_group ?? "").toString().trim() !== "");
  if (!hasGroups || studentIds.length === 0) return buildSitsResolver(subjects, []);
  const subjectIds = subjects.map((s) => s.id);
  const choices: Array<{ student_id: string; class_subject_id: string }> = [];
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await serviceRoleClient
      .from("student_subject_choice")
      .select("student_id, class_subject_id")
      .in("student_id", studentIds.slice(i, i + 200))
      .in("class_subject_id", subjectIds);
    choices.push(...((data ?? []) as any[]));
  }
  return buildSitsResolver(subjects, choices);
}
