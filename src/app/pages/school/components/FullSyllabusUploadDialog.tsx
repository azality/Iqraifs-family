// FullSyllabusUploadDialog — an admin uploads ONE file holding a subject's
// syllabus for MANY classes and assessments ("maths, Class 1-7, 1st + 2nd
// Assessment") and the file's own headings route each section to the right
// (class, assessment). Deterministic string matching — no AI, no credits;
// a review matrix always sits between the file and the database.
//
// Flow: pick subject + file → buckets from splitSyllabusFile → each row
// pre-matched to a real class (classToken) and term (ordinal match) with
// dropdowns to fix what didn't match → one confirm bulk-adds per row via
// the same endpoints the per-subject panel uses (dedupe makes re-runs safe).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FileUp, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  listClassSubjects,
  getClassSubjectCurriculum,
  createClassCurriculum,
  bulkAddClassCurriculumTopics,
  listTerms,
  type AdminClass,
  type ClassSubject,
  type AcademicTerm,
} from "../../../../utils/schoolApi";
import {
  extractSyllabusText,
  splitSyllabusFile,
  parseTopicLines,
  classToken,
  detectSubjectHeadings,
  sameSubject,
} from "../../../../utils/docxText";

interface Props {
  orgId: string;
  /** Academic classes only (hifz classes have no subject curriculum). */
  classes: AdminClass[];
  open: boolean;
  onClose: () => void;
}

interface ReviewRow {
  key: string;
  classLabel: string | null;
  assessmentLabel: string | null;
  text: string;
  include: boolean;
  classId: string; // "" = unmatched
  termChoice: string; // "auto" | "whole-year" | term id
  expanded: boolean;
}

interface RowResult {
  label: string;
  added?: number;
  skipped?: number;
  error?: string;
}

// Same coarse April-start default the curriculum panel uses.
function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 3 ? y : y - 1;
  return `${startYear}-${((startYear + 1) % 100).toString().padStart(2, "0")}`;
}

/** Match "1st Assessment" → the org term whose name shares the ordinal. */
function matchTerm(label: string | null, terms: AcademicTerm[]): string {
  if (!label) return "auto";
  const l = label.toLowerCase();
  if (l.startsWith("whole year") || l.startsWith("annual")) return "whole-year";
  const ord = l.match(/^(1st|2nd|3rd|4th)/)?.[1];
  const words: Record<string, string> = { "1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth" };
  const hit = terms.find((t) => {
    const n = t.name.toLowerCase();
    if (ord && (n.includes(ord) || n.includes(words[ord]))) return true;
    return n.includes(l) || l.includes(n);
  });
  return hit ? hit.id : "auto";
}

export function FullSyllabusUploadDialog({ orgId, classes, open, onClose }: Props) {
  const year = currentAcademicYear();
  const [subjectsByClass, setSubjectsByClass] = useState<Map<string, ClassSubject[]>>(new Map());
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  // The file's raw text, kept for the other-subjects check: class headings
  // like "Science :- Grade:- 01" are consumed by the split, so the rows
  // alone can't show them.
  const [rawText, setRawText] = useState("");
  // Which other-subject set the admin confirmed ("these really are all
  // Mathematics topics"). Keyed by the set, so a new file asks again.
  const [ackKey, setAckKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<RowResult[] | null>(null);

  // Load every class's subjects + the org's terms once per open.
  useEffect(() => {
    if (!open) return;
    setLoadingMeta(true);
    Promise.all([
      Promise.all(
        classes.map(async (c) => [c.id, (await listClassSubjects(c.id)).subjects] as const),
      ),
      listTerms(orgId),
    ])
      .then(([pairs, t]) => {
        setSubjectsByClass(new Map(pairs));
        setTerms((t.terms ?? []).filter((x) => !x.archivedAt));
      })
      .catch((e) => toast.error(e?.message || "Could not load classes"))
      .finally(() => setLoadingMeta(false));
  }, [open, orgId, classes]);

  const subjectNames = useMemo(() => {
    const names = new Map<string, number>();
    for (const subs of subjectsByClass.values())
      for (const s of subs) {
        const k = s.name.trim();
        names.set(k, (names.get(k) ?? 0) + 1);
      }
    return [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [subjectsByClass]);

  // Headings naming a subject OTHER than the one typed. Every section goes
  // under that one subject, so a mixed file would pour English and Science
  // lessons into, say, Mathematics.
  const otherSubjects = useMemo(() => {
    const want = subjectName.trim();
    if (!rawText || !want) return [];
    return detectSubjectHeadings(rawText, subjectNames).filter((h) => !sameSubject(h.label, want));
  }, [rawText, subjectName, subjectNames]);
  const otherKey = `${fileName}|${subjectName.trim().toLowerCase()}|${otherSubjects.map((h) => h.label).join(",")}`;
  const otherAcknowledged = otherSubjects.length === 0 || ackKey === otherKey;

  const tokenToClass = useMemo(() => {
    const map = new Map<string, AdminClass>();
    for (const c of classes) {
      const t = classToken(c.name);
      if (t) map.set(t, c);
    }
    return map;
  }, [classes]);

  const subjectFor = (classId: string): ClassSubject | null => {
    const subs = subjectsByClass.get(classId) ?? [];
    const want = subjectName.trim().toLowerCase();
    if (!want) return null;
    return (
      subs.find((s) => s.name.trim().toLowerCase() === want) ??
      subs.find(
        (s) =>
          s.name.trim().toLowerCase().includes(want) || want.includes(s.name.trim().toLowerCase()),
      ) ??
      null
    );
  };

  const buildRows = (text: string) => {
    const buckets = splitSyllabusFile(text, { subjectName: subjectName.trim() });
    if (!buckets.length) {
      toast.error("Couldn't find any text in that file.");
      return;
    }
    const next: ReviewRow[] = buckets.map((b, i) => {
      const token = b.classLabel ? classToken(b.classLabel) : null;
      const matched = token ? tokenToClass.get(token) : undefined;
      return {
        key: `${i}:${b.classLabel ?? "?"}:${b.assessmentLabel ?? "?"}`,
        classLabel: b.classLabel,
        assessmentLabel: b.assessmentLabel,
        text: b.lines.join("\n"),
        // Preamble (no class heading) is usually titles/junk — off by default.
        include: !!matched,
        classId: matched?.id ?? "",
        termChoice: matchTerm(b.assessmentLabel, terms),
        expanded: false,
      };
    });
    setRows(next);
    const matched = next.filter((r) => r.classId).length;
    toast.success(
      `Found ${next.length} section${next.length === 1 ? "" : "s"} — ${matched} matched to your classes. Review below, then Add all.`,
    );
  };

  const handleFilePicked = async (file: File | null) => {
    if (!file) return;
    if (!subjectName.trim()) {
      // The subject's words double as heading filler during the split, so
      // it has to be known before the file is parsed.
      toast.error("Type the subject name first (e.g. Mathematics), then choose the file.");
      return;
    }
    setReading(true);
    setResults(null);
    try {
      const text = (await extractSyllabusText(file)).trim();
      if (!text) {
        toast.error(`Couldn't find any text in ${file.name} — if it's a scan, use Read from photo inside the subject.`);
        return;
      }
      setFileName(file.name);
      setRawText(text);
      setAckKey("");
      buildRows(text);
    } catch (e: any) {
      toast.error(e?.message || "Could not read that file");
    } finally {
      setReading(false);
    }
  };

  const patchRow = (key: string, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const includable = rows.filter((r) => r.include && r.classId && r.text.trim());

  const handleSave = async () => {
    if (!subjectName.trim()) {
      toast.error("Type the subject name first (e.g. Mathematics).");
      return;
    }
    if (!otherAcknowledged) {
      toast.error(
        `This file also has ${otherSubjects.map((h) => h.label).join(", ")} headings — split it by subject, or confirm in the red box that everything is ${subjectName.trim()}.`,
      );
      return;
    }
    const missing = includable.filter((r) => !subjectFor(r.classId));
    if (missing.length) {
      const cls = classes.find((c) => c.id === missing[0].classId);
      toast.error(
        `${cls?.name ?? "A class"} has no "${subjectName.trim()}" subject — add it under that class first, or untick that row.`,
      );
      return;
    }
    setSaving(true);
    const out: RowResult[] = [];
    try {
      for (let i = 0; i < includable.length; i++) {
        const row = includable[i];
        const cls = classes.find((c) => c.id === row.classId);
        const label = `${cls?.name ?? row.classLabel} · ${
          row.termChoice === "whole-year"
            ? "Whole year"
            : terms.find((t) => t.id === row.termChoice)?.name ?? row.assessmentLabel ?? "auto term"
        }`;
        setProgress(`Saving ${label} (${i + 1}/${includable.length})…`);
        try {
          const cs = subjectFor(row.classId)!;
          const got = await getClassSubjectCurriculum(cs.id, { academicYear: year });
          const curriculum =
            got.curriculum ??
            (await createClassCurriculum(cs.id, { academicYear: year, title: `${cs.name} · ${year}` }))
              .curriculum;
          const names = parseTopicLines(row.text);
          const termVal =
            row.termChoice === "auto" ? undefined : row.termChoice === "whole-year" ? null : row.termChoice;
          const r = await bulkAddClassCurriculumTopics(
            curriculum.id,
            names,
            termVal !== undefined ? { academicTermId: termVal } : {},
          );
          out.push({ label, added: r.added, skipped: names.length - r.added });
        } catch (e: any) {
          out.push({ label, error: e?.message || "failed" });
        }
      }
      setResults(out);
      const added = out.reduce((n, r) => n + (r.added ?? 0), 0);
      const failed = out.filter((r) => r.error).length;
      if (failed) toast.error(`${added} topics added; ${failed} section${failed === 1 ? "" : "s"} failed — see below.`);
      else toast.success(`Done — ${added} topics added across ${out.length} section${out.length === 1 ? "" : "s"}.`);
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  const reset = () => {
    setRows([]);
    setResults(null);
    setFileName("");
    setRawText("");
    setAckKey("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload a whole syllabus file</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-600">
          One file, one subject, many classes — e.g. maths for Class 1–7, both
          assessments. Headings in the file ("Class 1", "1st Assessment") route
          each part automatically; you review everything before it saves.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            list="fsu-subjects"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="Subject (e.g. Mathematics)"
            className="h-8 w-52 rounded-md border border-slate-200 bg-white px-2 text-sm"
          />
          <datalist id="fsu-subjects">
            {subjectNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="file"
              accept=".docx,.doc,.txt,.csv,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              className="hidden"
              onChange={(e) => {
                void handleFilePicked(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {reading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
              )}
              {fileName ? "Change file" : "Choose file"}
            </span>
          </label>
          {fileName && <span className="max-w-[180px] truncate text-xs text-slate-500">{fileName}</span>}
          <span className="text-[10px] text-slate-400">Year: {year}</span>
        </div>

        {loadingMeta && <p className="text-xs text-slate-500">Loading your classes…</p>}

        {otherSubjects.length > 0 && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-2.5">
            <p className="text-xs font-semibold text-rose-800">
              This file looks like it has other subjects too:{" "}
              {otherSubjects.map((h) => h.label).join(", ")}
            </p>
            <ul className="mt-1 space-y-0.5">
              {otherSubjects.slice(0, 4).map((h) => (
                <li key={h.label} className="truncate text-[11px] text-rose-700">
                  “{h.example}”
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-rose-800">
              Every section below will be saved under <b>{subjectName.trim()}</b>. Upload one
              file per subject instead — or, if these really are {subjectName.trim()} topics,
              confirm:
            </p>
            <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-rose-900">
              <input
                type="checkbox"
                checked={ackKey === otherKey}
                onChange={(e) => setAckKey(e.target.checked ? otherKey : "")}
                className="h-3.5 w-3.5 rounded border-rose-300"
              />
              I checked — everything in this file is {subjectName.trim()}
            </label>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const cls = classes.find((c) => c.id === r.classId);
              const noSubject = r.classId && subjectName.trim() && !subjectFor(r.classId);
              const lineCount = r.text.split(/\n/).filter((s) => s.trim()).length;
              return (
                <div
                  key={r.key}
                  className={`rounded border p-2 ${
                    r.include && r.classId ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => patchRow(r.key, { include: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                    />
                    <span className="min-w-[70px] text-[11px] text-slate-500">
                      {r.classLabel ?? "No class heading"}
                      {r.assessmentLabel ? ` · ${r.assessmentLabel}` : ""}
                    </span>
                    <select
                      value={r.classId}
                      onChange={(e) => patchRow(r.key, { classId: e.target.value, include: !!e.target.value })}
                      className={`h-7 rounded-md border px-1.5 text-xs ${
                        r.classId ? "border-slate-200 bg-white text-slate-700" : "border-amber-300 bg-amber-50 text-amber-800"
                      }`}
                    >
                      <option value="">Pick a class…</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.termChoice}
                      onChange={(e) => patchRow(r.key, { termChoice: e.target.value })}
                      className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700"
                    >
                      <option value="auto">Term: match syllabus</option>
                      <option value="whole-year">Whole year</option>
                      {terms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => patchRow(r.key, { expanded: !r.expanded })}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                    >
                      {r.expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {lineCount} topic{lineCount === 1 ? "" : "s"}
                    </button>
                  </div>
                  {noSubject && (
                    <p className="mt-1 text-[11px] text-rose-600">
                      {cls?.name} has no "{subjectName.trim()}" subject — add it there first or untick this row.
                    </p>
                  )}
                  {r.expanded && (
                    <Textarea
                      value={r.text}
                      onChange={(e) => patchRow(r.key, { text: e.target.value })}
                      rows={Math.min(10, Math.max(3, lineCount))}
                      className="mt-2 text-xs font-mono"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {results && (
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            {results.map((r, i) => (
              <p key={i} className={`text-[11px] ${r.error ? "text-rose-600" : "text-slate-600"}`}>
                {r.label}:{" "}
                {r.error
                  ? r.error
                  : `${r.added} added${r.skipped ? ` · ${r.skipped} skipped as duplicates` : ""}`}
              </p>
            ))}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-[11px] text-slate-500">
            {saving ? progress : rows.length ? `${includable.length} of ${rows.length} sections will be added` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }} disabled={saving}>
              {results ? "Close" : "Cancel"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !includable.length || !otherAcknowledged}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Add all sections
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
