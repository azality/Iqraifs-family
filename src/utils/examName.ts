// An exam's display name, in the reader's language.
//
// The Hifz half-yearly is "ششماہی امتحان" to the school and
// "Half-yearly (Hifz)" in English; storing that as ONE combined string
// meant the Urdu showed inside the English UI (23 Sep). exam.name is
// the school's primary (Urdu) name, exam.name_en the English; either
// may be absent and the reader falls back to the other. Exams named
// only in English ("1st Assessment — Written") simply have no name_en
// and read the same in both languages.
//
// Display only: anything that PARSES the name (paperOfExam's
// oral/written match) keeps reading the canonical `name`.

export function examDisplayName(
  e: { name: string; nameEn?: string | null; examNameEn?: string | null } | null | undefined,
  lang: string,
): string {
  if (!e) return "";
  const en = e.nameEn ?? e.examNameEn ?? null;
  if (lang.startsWith("ur")) return e.name || en || "";
  return en || e.name;
}
