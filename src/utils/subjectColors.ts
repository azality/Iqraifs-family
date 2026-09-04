// subjectColors — the fixed portal-wide subject palette (design 10e):
// "Math is always the same blue" across the parent timetable, the child
// Today view, the teacher schedule and the timetable editor.
//
//   English  indigo #4f46e5     Maths   sky     #0284c7
//   Islamiyat amber #b45309     Quran/Hifz emerald #047857
//
// Subjects outside the fixed set fall back to the same name→hue hash the
// teacher calendar uses, rendered in the soft-tint style.

export interface SubjectColor {
  /** Solid edge / legend swatch. */
  edge: string;
  /** Soft tint background. */
  bg: string;
  /** Dark text on the tint. */
  fg: string;
}

const FIXED: Array<{ match: RegExp; c: SubjectColor }> = [
  { match: /english|انگریزی/i, c: { edge: "#4f46e5", bg: "#eef2ff", fg: "#3730a3" } },
  { match: /math|riyazi|ریاضی/i, c: { edge: "#0284c7", bg: "#f0f9ff", fg: "#075985" } },
  { match: /islamiyat|islamiat|deeniyat|اسلامیات/i, c: { edge: "#b45309", bg: "#fffbeb", fg: "#92400e" } },
  { match: /quran|hifz|nazra|qaidah|قرآن|حفظ|ناظرہ|قاعدہ/i, c: { edge: "#047857", bg: "#ecfdf5", fg: "#065f46" } },
  { match: /urdu|اردو/i, c: { edge: "#9333ea", bg: "#faf5ff", fg: "#6b21a8" } },
  { match: /science|سائنس/i, c: { edge: "#0d9488", bg: "#f0fdfa", fg: "#115e59" } },
];

function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function subjectColor(name: string | null | undefined): SubjectColor {
  const n = (name ?? "").trim();
  if (!n) return { edge: "#94a3b8", bg: "#f8fafc", fg: "#475569" };
  for (const f of FIXED) if (f.match.test(n)) return f.c;
  const hue = hueFor(n.toLowerCase());
  return {
    edge: `hsl(${hue} 55% 45%)`,
    bg: `hsl(${hue} 60% 95%)`,
    fg: `hsl(${hue} 45% 30%)`,
  };
}
