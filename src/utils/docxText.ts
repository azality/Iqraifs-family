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
