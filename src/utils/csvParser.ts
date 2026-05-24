// Minimal CSV parser — handles quoted fields, escaped quotes, CRLF.
// Avoids adding papaparse as a dependency. Sufficient for the Phase A
// admin importers (small files, well-formed UTF-8).

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush final field/row if no trailing newline.
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Drop fully empty trailing rows.
  return rows.filter((r) => r.length > 0 && r.some((c) => c.trim().length > 0));
}

export interface ColumnSpec {
  key: string; // canonical key we want in the output object
  label: string;
  required?: boolean;
  aliases?: string[]; // header names that should auto-map to this key
}

// Auto-map a header row to a list of ColumnSpec, by normalized name match.
export function autoMap(
  headers: string[],
  specs: ColumnSpec[],
): Record<number, string | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<number, string | null> = {};
  headers.forEach((h, idx) => {
    const nh = norm(h);
    const hit = specs.find((sp) => {
      if (norm(sp.key) === nh || norm(sp.label) === nh) return true;
      return (sp.aliases || []).some((a) => norm(a) === nh);
    });
    map[idx] = hit ? hit.key : null;
  });
  return map;
}

export function rowsToObjects(
  dataRows: string[][],
  columnMapping: Record<number, string | null>,
): Array<Record<string, string>> {
  return dataRows.map((cells) => {
    const obj: Record<string, string> = {};
    cells.forEach((val, idx) => {
      const key = columnMapping[idx];
      if (key) obj[key] = (val || "").trim();
    });
    return obj;
  });
}

export function validateRows(
  rows: Array<Record<string, string>>,
  specs: ColumnSpec[],
): Array<{ row: number; message: string }> {
  const errors: Array<{ row: number; message: string }> = [];
  const required = specs.filter((s) => s.required);
  rows.forEach((r, idx) => {
    required.forEach((spec) => {
      if (!r[spec.key] || r[spec.key].length === 0) {
        errors.push({ row: idx + 1, message: `Missing required field: ${spec.label}` });
      }
    });
  });
  return errors;
}
