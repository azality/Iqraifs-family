// docxText — extract plain text lines from a Word (.docx) or plain-text
// file entirely in the browser, so a school can upload the syllabus file
// they already have instead of copy-pasting out of Word.
//
// A .docx is a zip archive whose text lives in word/document.xml. Browsers
// can inflate zip entries natively (DecompressionStream "deflate-raw"),
// so no zip/Word library is needed. Output is one line per paragraph, and
// one line per TABLE ROW with cells joined by tabs — which is exactly the
// shape the bulk paste box already splits into topic + detail.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

async function inflateRaw(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can't open .docx files — copy the text from Word and use Paste many instead.");
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

/** Pull one file's decompressed text out of a zip archive. */
async function zipEntryText(buf: ArrayBuffer, entryName: string): Promise<string | null> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // End-of-central-directory record sits in the last 64KB + 22 bytes.
  let eocd = -1;
  const scanFrom = Math.max(0, buf.byteLength - 65557);
  for (let i = buf.byteLength - 22; i >= scanFrom; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true); // central directory offset
  const dec = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== CENTRAL_SIG) return null;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    if (name === entryName) {
      if (view.getUint32(localOffset, true) !== LOCAL_SIG) return null;
      // The LOCAL header's name/extra lengths can differ from the central
      // ones — read them from the local header itself.
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return dec.decode(data); // stored
      if (method === 8) return await inflateRaw(data); // deflate
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Visible text of one Word paragraph: runs joined, tabs kept as tabs. */
function paragraphText(p: Element): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    switch (el.localName) {
      case "t": out += el.textContent ?? ""; break;
      case "tab": out += "\t"; break;
      case "br": case "cr": out += " "; break;
      default:
        for (const child of Array.from(el.childNodes)) walk(child);
    }
  };
  for (const child of Array.from(p.childNodes)) walk(child);
  return out;
}

/** Walk a block container (body / table cell) into lines. Table rows
 *  become one line each with cells tab-joined, so a two-column Word
 *  table lands as "topic<TAB>detail" — the paste box's native shape. */
function blockLines(container: Element, lines: string[]) {
  for (const child of Array.from(container.children)) {
    if (child.localName === "p") {
      lines.push(paragraphText(child));
    } else if (child.localName === "tbl") {
      for (const row of Array.from(child.children)) {
        if (row.localName !== "tr") continue;
        const cells = Array.from(row.children)
          .filter((c) => c.localName === "tc")
          .map((tc) => {
            const cellLines: string[] = [];
            blockLines(tc, cellLines);
            return cellLines.map((s) => s.trim()).filter(Boolean).join(" ");
          });
        lines.push(cells.join("\t"));
      }
    } else if (child.children.length) {
      blockLines(child, lines);
    }
  }
}

function docxXmlToLines(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Couldn't read that Word file — copy the text and use Paste many instead.");
  }
  let body: Element = doc.documentElement;
  for (const el of Array.from(doc.documentElement.children)) {
    if (el.localName === "body") { body = el; break; }
  }
  const lines: string[] = [];
  blockLines(body, lines);
  // Drop empty lines and lines that are only tabs (empty table rows).
  return lines.map((s) => s.replace(/\s+$/, "")).filter((s) => s.replace(/\t/g, "").trim()).join("\n");
}

// ---------------------------------------------------------------------------
// Multi-class detection — a school's Word file often holds the syllabus for
// MANY classes ("Maths Grade 1 … Grade 5") while a curriculum here belongs
// to ONE class. Find class-heading lines so the UI can offer "keep only
// this class's section" instead of importing the whole mess.

export interface ClassSection {
  /** Normalized heading, e.g. "Grade 1", "Class VI", "Hifz IV". */
  label: string;
  /** Line index of the heading itself (not a topic — excluded on keep). */
  start: number;
  /** Line index one past the section's last line. */
  end: number;
  /** Topics in the section (following lines, or bullets on an inline row). */
  lineCount: number;
  /** Table-shaped row: the class's whole syllabus sits ON the heading line
   *  after a tab ("Class IV<TAB>·topic ·topic …"), one row per class. */
  inline: boolean;
}

const CLASS_HEADING_RE =
  /\b(grade|class|std|hifz)\b\s*[:.\s-]*((?:\d{1,2})|[ivx]{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|reception|junior|senior|nursery|prep|kg|catch\s*-?\s*up)\b/i;

/** Split a table row's cell content into topic lines on bullet marks. */
function splitInlineRow(row: string): string[] {
  const after = row.slice(row.indexOf("\t") + 1).replace(/\t+/g, " ");
  const parts = after.split(/\s*[·•●▪]\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [after.trim()].filter(Boolean);
}

/** The topic lines a "keep only this class" pick should leave in the box. */
export function sectionLines(text: string, s: ClassSection): string[] {
  const lines = text.split(/\n/);
  if (s.inline) return splitInlineRow(lines[s.start] ?? "");
  return lines.slice(s.start + 1, s.end).filter((l) => l.replace(/\t/g, "").trim());
}

/** Returns sections ONLY when the text names two or more DIFFERENT
 *  classes — one class mentioned (even repeatedly) is not a problem.
 *  Handles both real shapes: headings with topic lines below, and
 *  table files with one row per class. */
export function detectClassSections(text: string): ClassSection[] {
  const lines = text.split(/\n/);
  const heads: { label: string; idx: number; inline: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CLASS_HEADING_RE);
    if (!m) continue;
    const word = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    let which = m[2].replace(/\s+/g, " ").trim();
    if (/^\d+$/.test(which)) which = String(parseInt(which, 10)); // "01" -> "1"
    else if (/^[ivx]+$/i.test(which)) which = which.toUpperCase();
    else which = which[0].toUpperCase() + which.slice(1).toLowerCase();
    const tabIdx = lines[i].indexOf("\t");
    const inline =
      m.index === 0 && tabIdx > 0 && lines[i].slice(tabIdx + 1).replace(/\t/g, "").trim().length > 0;
    heads.push({ label: `${word} ${which}`, idx: i, inline });
  }
  if (new Set(heads.map((h) => h.label.toLowerCase())).size < 2) return [];
  const sections: ClassSection[] = [];
  for (let i = 0; i < heads.length; i++) {
    const { label, idx, inline } = heads[i];
    if (inline) {
      const lineCount = splitInlineRow(lines[idx]).length;
      if (lineCount > 0) sections.push({ label, start: idx, end: idx + 1, lineCount, inline });
      continue;
    }
    const end = i + 1 < heads.length ? heads[i + 1].idx : lines.length;
    const lineCount = lines.slice(idx + 1, end).filter((s) => s.replace(/\t/g, "").trim()).length;
    if (lineCount > 0) sections.push({ label, start: idx, end, lineCount, inline });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Whole-file split — ONE uploaded file holding a subject's syllabus for many
// classes and assessments ("maths, Class 1-7, 1st + 2nd Assessment") is cut
// into (class, assessment) buckets by its own headings. Deterministic string
// work: recognizing structure the school WROTE needs no AI and no credits.

export interface SyllabusBucket {
  /** Normalized class heading ("Class 1") — null for preamble before any. */
  classLabel: string | null;
  /** Normalized assessment heading ("1st Assessment") — null if none. */
  assessmentLabel: string | null;
  /** Topic lines (bullets already split for table-shaped class rows). */
  lines: string[];
}

const ASSESS_RE =
  /\b(1st|2nd|3rd|4th|first|second|third|fourth)\s*(assessment|assesment|term|semester|exam)\b|\b(whole\s*year|annual|mid\s*term|final\s*term)\b/i;
const ORDINAL: Record<string, string> = { first: "1st", second: "2nd", third: "3rd", fourth: "4th" };

function normalizeAssessment(m: RegExpMatchArray): string {
  if (m[3]) {
    const w = m[3].toLowerCase().replace(/\s+/g, " ");
    return w === "whole year" ? "Whole year" : w[0].toUpperCase() + w.slice(1);
  }
  const ord = ORDINAL[m[1].toLowerCase()] ?? m[1].toLowerCase();
  const noun = m[2].toLowerCase() === "assesment" ? "assessment" : m[2].toLowerCase();
  return `${ord} ${noun[0].toUpperCase()}${noun.slice(1)}`;
}

/** A line COUNTS as an assessment heading only when, once the matched part
 *  and filler (a class heading, "syllabus", the subject's own name, years,
 *  punctuation) are removed, (almost) nothing is left — so a topic like
 *  "Revision for 1st assessment week" is never swallowed as a heading. */
function assessmentHeading(line: string, extraFiller?: RegExp | null): string | null {
  const m = line.match(ASSESS_RE);
  if (!m) return null;
  let rest = line
    .replace(ASSESS_RE, " ")
    .replace(CLASS_HEADING_RE, " ")
    .replace(/\bsyllabus\b|\bfor\b|\bof\b|\bclass(?:es)?\b|\bgrade\b|\bstd\b/gi, " ");
  if (extraFiller) rest = rest.replace(extraFiller, " ");
  rest = rest.replace(/[\d\s:.,()\-–—_/&]+/g, "");
  return rest.length <= 2 ? normalizeAssessment(m) : null;
}

function normalizeClassHeading(m: RegExpMatchArray): string {
  const word = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  let which = m[2].replace(/\s+/g, " ").trim();
  if (/^\d+$/.test(which)) which = String(parseInt(which, 10));
  else if (/^[ivx]+$/i.test(which)) which = which.toUpperCase();
  else which = which[0].toUpperCase() + which.slice(1).toLowerCase();
  return `${word} ${which}`;
}

/** Split a whole multi-class file into (class, assessment) buckets.
 *  Whichever heading kind appears FIRST is the outer grouping; an outer
 *  heading resets the inner one, so both orders work:
 *  "Class 1 / 1st / 2nd / Class 2 / …" and "1st / Class 1..7 / 2nd / …". */
export function splitSyllabusFile(
  text: string,
  opts: {
    /** The subject the file is for ("Mathematics", "Social Studies") — its
     *  words count as heading filler, so "Mathematics syllabus for 1st
     *  Assessment" registers as an assessment heading. */
    subjectName?: string;
  } = {},
): SyllabusBucket[] {
  const subjectWords = (opts.subjectName ?? "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const extraFiller = subjectWords.length ? new RegExp(`\\b(?:${subjectWords.join("|")})\\b`, "gi") : null;
  const lines = text.split(/\n/);
  const buckets = new Map<string, SyllabusBucket>();
  const push = (cls: string | null, assess: string | null, ls: string[]) => {
    const clean = ls.map((l) => l.replace(/\s+$/, "")).filter((l) => l.replace(/\t/g, "").trim());
    if (!clean.length) return;
    const key = `${(cls ?? "").toLowerCase()}||${(assess ?? "").toLowerCase()}`;
    const b = buckets.get(key);
    if (b) b.lines.push(...clean);
    else buckets.set(key, { classLabel: cls, assessmentLabel: assess, lines: [...clean] });
  };

  let curClass: string | null = null;
  let curAssess: string | null = null;
  let outer: "class" | "assessment" | null = null;

  for (const line of lines) {
    const cm = line.match(CLASS_HEADING_RE);
    const tabIdx = line.indexOf("\t");
    const inlineRow =
      cm && cm.index === 0 && tabIdx > 0 && line.slice(tabIdx + 1).replace(/\t/g, "").trim().length > 0;
    if (inlineRow) {
      // Table shape: "Class IV<TAB>·topic ·topic" — a content row that
      // names its own class; it does not change the running state.
      push(normalizeClassHeading(cm!), curAssess, splitInlineRow(line));
      continue;
    }
    const ah = assessmentHeading(line, extraFiller);
    if (cm) {
      outer ??= "class";
      curClass = normalizeClassHeading(cm);
      if (outer === "class") curAssess = ah; // reset (or set, if combined "Class 1 – 1st Assessment")
      else if (ah) curAssess = ah;
      continue;
    }
    if (ah) {
      outer ??= "assessment";
      curAssess = ah;
      if (outer === "assessment") curClass = null;
      continue;
    }
    push(curClass, curAssess, [line]);
  }
  return [...buckets.values()];
}

/** Parse pasted/extracted topic lines the way the bulk box saves them:
 *  bullets and "1." prefixes stripped; "topic — detail" / "topic :: detail" /
 *  tab-separated split into name + description. Shared by the per-subject
 *  panel and the whole-file upload so the two never drift. */
export function parseTopicLines(source: string): Array<{ name: string; description?: string }> {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-\*\d\.\)]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const m = /^(.+?)(?:\t+| — | :: )(.+)$/.exec(line);
      return m ? { name: m[1].trim(), description: m[2].trim() } : { name: line };
    });
}

/** Canonical token for matching a heading label to a real class name:
 *  "Class 1", "Grade:- 01", "Class I", "One" all become "1";
 *  "Reception" stays "reception". Returns null when nothing class-like. */
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};
const ROMAN: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7",
  viii: "8", ix: "9", x: "10", xi: "11", xii: "12",
};
export function classToken(label: string): string | null {
  const m = label.match(CLASS_HEADING_RE);
  let which = (m ? m[2] : label).trim().toLowerCase().replace(/\s+/g, " ");
  if (m && m[1].toLowerCase() === "hifz") return `hifz-${ROMAN[which] ?? which.replace(/^0+/, "")}`;
  if (/^\d+$/.test(which)) return String(parseInt(which, 10));
  if (ROMAN[which]) return ROMAN[which];
  if (NUMBER_WORDS[which]) return NUMBER_WORDS[which];
  if (/^(reception|junior|senior|nursery|prep|kg)$/.test(which)) return which;
  if (/^catch\s*-?\s*up$/.test(which)) return "catch-up";
  if (!m) {
    // No "class/grade" word — try the bare name ("Reception", "Catch Up").
    const bare = label.trim().toLowerCase();
    if (/^(reception|junior|senior|nursery|prep|kg)$/.test(bare)) return bare;
    if (/^catch\s*-?\s*up$/.test(bare)) return "catch-up";
    if (/^\d{1,2}$/.test(bare)) return String(parseInt(bare, 10));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Subject-heading detection — both uploads put EVERY line under the one
// subject the admin picked, but the school's own Word files often hold
// several subjects ("English (Grammar):- Grade:- 01", "Science :-",
// "*اسلامیات*"). Uploaded as Mathematics, that file would pour English and
// Science lessons into maths with no warning (Muneeb, 16 Sep). These
// helpers find headings naming a DIFFERENT subject so the UI can stop and ask.

/** Known subjects and the ways the school writes them. The first entry is
 *  the display name. Science branches sit inside Science on purpose: a
 *  Class VI science file has "PHYSICAL SCIENCE" sections, while Class IX's
 *  separate Physics/Chemistry/Biology are their own subjects. */
const SUBJECT_ALIASES: ReadonlyArray<ReadonlyArray<string>> = [
  ["Mathematics", "math", "maths", "mathematics", "ریاضی", "حساب"],
  ["English", "english", "انگریزی"],
  ["Urdu", "urdu", "اردو"],
  ["Sindhi", "sindhi", "سندھی"],
  ["Science", "science", "general science", "biological science", "physical science", "earth science", "سائنس"],
  ["Physics", "physics", "طبیعیات"],
  ["Chemistry", "chemistry", "کیمیا"],
  ["Biology", "biology", "حیاتیات"],
  ["Social Studies", "social studies", "social study", "sst", "معاشرتی علوم"],
  ["Pakistan Studies", "pakistan studies", "pak studies", "مطالعہ پاکستان"],
  ["Islamiat", "islamiat", "islamiyat", "islamic studies", "اسلامیات"],
  ["Deeniyat", "deeniyat", "diniyat", "دینیات"],
  ["Quran", "quran", "قرآن"],
  ["Computer", "computer", "computers", "computer science", "کمپیوٹر"],
  ["G.K", "gk", "general knowledge", "معلومات عامہ"],
  ["EVS", "evs", "environmental studies"],
  ["Arabic", "arabic", "عربی"],
  ["Art & Craft", "art", "art craft", "art and craft", "drawing"],
];

/** Lowercase, drop apostrophes and dots INSIDE words ("Math’s" → maths,
 *  "S.st" → sst, "G.K" → gk), everything else non-letter → space. */
function normSubject(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`.]/g, "")
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const ALIAS_TO_GROUP = new Map<string, number>();
SUBJECT_ALIASES.forEach((group, gi) => {
  for (const a of group.slice(1)) ALIAS_TO_GROUP.set(normSubject(a), gi);
});

/** Same subject? Known aliases compare by group ("Maths" = "Mathematics");
 *  otherwise one name's words inside the other's counts as the same
 *  ("English" and "English Core Reader"). */
export function sameSubject(a: string, b: string): boolean {
  const na = normSubject(a);
  const nb = normSubject(b);
  if (!na || !nb) return false;
  const ga = ALIAS_TO_GROUP.get(na);
  const gb = ALIAS_TO_GROUP.get(nb);
  if (ga !== undefined && gb !== undefined) return ga === gb;
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  return [...wa].every((w) => wb.has(w)) || [...wb].every((w) => wa.has(w));
}

export interface SubjectHeading {
  /** Display name ("Science", or the school's own subject name). */
  label: string;
  /** The first line where it appeared, trimmed for display. */
  example: string;
}

/** Heading lines that name a subject, one entry per distinct subject.
 *  A line counts only when NOTHING but the subject is left after removing
 *  class headings, decoration (* " :- ( )), "syllabus/outline/نصاب" and
 *  a trailing part letter ('English "A"', "اردو : الف") — so a topic like
 *  "G.K: Oral Q/A + Assignment" is never mistaken for a heading.
 *  extraNames: the school's own subject names, for subjects not in the
 *  built-in list. */
export function detectSubjectHeadings(text: string, extraNames: string[] = []): SubjectHeading[] {
  const extra = new Map<string, string>();
  for (const n of extraNames) {
    const nn = normSubject(n);
    if (nn && !ALIAS_TO_GROUP.has(nn)) extra.set(nn, n.trim());
  }
  const found = new Map<string, SubjectHeading>();
  for (const raw of text.split(/\n/)) {
    if (raw.length > 90) continue;
    let s = raw.replace(CLASS_HEADING_RE, " ").replace(/\([^)]*\)/g, " ");
    s = normSubject(s)
      .replace(/\b(syllabus|outline|subject)\b/g, " ")
      .replace(/(^|\s)نصاب(\s|$)/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      // Part letters: English "A"/"B", Urdu الف/ب.
      .replace(/\s(a|b|c|الف|ب)$/, "")
      .trim();
    if (!s) continue;
    const gi = ALIAS_TO_GROUP.get(s);
    const label = gi !== undefined ? SUBJECT_ALIASES[gi][0] : extra.get(s);
    if (!label || found.has(label)) continue;
    found.set(label, { label, example: raw.replace(/\s{2,}/g, " ").trim().slice(0, 60) });
  }
  return [...found.values()];
}

/** Extract syllabus text from an uploaded file. Supports .docx and plain
 *  text (.txt/.csv); old binary .doc gets a friendly save-as-docx error. */
export async function extractSyllabusText(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));

  // Zip signature "PK" => .docx (whatever the extension claims).
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const xml = await zipEntryText(buf, "word/document.xml");
    if (!xml) throw new Error("That file doesn't look like a Word document — copy the text and use Paste many instead.");
    return docxXmlToLines(xml);
  }
  // Old binary .doc (OLE compound file) can't be parsed in the browser.
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new Error("This is an old .doc file — open it in Word and save as .docx, or copy the text and use Paste many.");
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    throw new Error("Couldn't read that Word file — copy the text and use Paste many instead.");
  }
  // Anything else: treat as plain text.
  return new TextDecoder().decode(buf).replace(/\r\n?/g, "\n");
}
