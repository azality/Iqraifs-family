// Generic CSV upload dialog used by the Phase A admin importers
// (students, parents, teachers). Lets the user pick a file or paste CSV
// text, auto-maps headers to canonical keys, allows per-column overrides,
// surfaces validation errors, then hands the parsed row objects to the
// page's onSubmit.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Upload, FileWarning, CheckCircle2, Download } from "lucide-react";
import {
  parseCsv,
  autoMap,
  rowsToObjects,
  validateRows,
  type ColumnSpec,
} from "../../../../utils/csvParser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: ColumnSpec[];
  onSubmit: (
    rows: Array<Record<string, string>>,
  ) => Promise<{ inserted: number; errors: Array<{ row: number; message: string }> }>;
  /** Optional duplicate-key detection (PR feat/import-center-hub). If
   *  provided, every preview row's key is computed and compared against
   *  the existing set; matches render with an amber tint + "duplicate"
   *  tag. Pure visual flag — the backend still decides whether to
   *  accept or reject. */
  duplicateDetection?: {
    /** Build the key string from a row. Return "" to skip the row. */
    keyOf: (row: Record<string, string>) => string;
    /** Lowercase set of already-taken keys. */
    existing: Set<string>;
    label?: string;
  };
  /** Suggested filename for the downloaded CSV template. Defaults to
   *  "<title>-template.csv". */
  templateFileName?: string;
}

export function CsvUploadDialog({
  open,
  onOpenChange,
  title,
  columns,
  onSubmit,
  duplicateDetection,
  templateFileName,
}: Props) {
  const [rawText, setRawText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<number, string | null>>({});

  const parsed = useMemo(() => {
    if (!rawText.trim()) return null;
    const grid = parseCsv(rawText);
    if (grid.length === 0) return null;
    const [headers, ...dataRows] = grid;
    return { headers, dataRows };
  }, [rawText]);

  // Whenever the headers change, recompute the auto-map.
  const effectiveMapping = useMemo(() => {
    if (!parsed) return {};
    const auto = autoMap(parsed.headers, columns);
    return { ...auto, ...columnMapping };
  }, [parsed, columnMapping, columns]);

  // Mirror parsed rows into mutable state so cells can be edited in
  // place before upload (Phase 2 of Import Center). The useEffect
  // syncs whenever the parsed input or mapping changes, but in-between
  // the rows are user-mutable. localEdits === rowObjects when no edits
  // have happened.
  const computedRows = useMemo(
    () => (parsed ? rowsToObjects(parsed.dataRows, effectiveMapping) : []),
    [parsed, effectiveMapping],
  );
  const [editedRows, setEditedRows] = useState<Array<Record<string, string>>>([]);
  // Resync whenever the underlying CSV / mapping changes — discards
  // any in-place edits to avoid stale state.
  useEffect(() => {
    setEditedRows(computedRows);
  }, [computedRows]);
  const rowObjects = editedRows;

  const localErrors = useMemo(
    () => (rowObjects.length ? validateRows(rowObjects, columns) : []),
    [rowObjects, columns],
  );

  const updateCell = (rowIdx: number, key: string, value: string) => {
    setEditedRows((rs) => {
      const next = rs.slice();
      next[rowIdx] = { ...next[rowIdx], [key]: value };
      return next;
    });
  };

  const removeRow = (rowIdx: number) => {
    setEditedRows((rs) => rs.filter((_, i) => i !== rowIdx));
  };

  // Per-row duplicate flag — Set of row indices that match an existing
  // record. Empty when no detection config supplied; cheap to compute.
  const duplicateRows = useMemo(() => {
    if (!duplicateDetection || rowObjects.length === 0) return new Set<number>();
    const out = new Set<number>();
    for (let i = 0; i < rowObjects.length; i++) {
      const k = duplicateDetection.keyOf(rowObjects[i]);
      if (k && duplicateDetection.existing.has(k.toLowerCase())) out.add(i);
    }
    return out;
  }, [rowObjects, duplicateDetection]);

  // Generate + download a CSV containing just the header row so the
  // admin has a known-good starting point. Browser-only (Blob+anchor)
  // so no server round-trip.
  const downloadTemplate = () => {
    const headers = columns.map((c) => c.label.replace(/[*\s\(\)]/g, (m) => {
      // Drop required marker / parens; keep words for human readability.
      return m === "*" || m === "(" || m === ")" ? "" : m;
    }).trim());
    const csv = headers.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFileName || `${title.toLowerCase().replace(/\s+/g, "-")}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    setColumnMapping({});
    setResult(null);
  };

  const handleSubmit = async () => {
    if (rowObjects.length === 0) return;
    setSubmitting(true);
    try {
      const res = await onSubmit(rowObjects);
      setResult(res);
    } catch (e) {
      setResult({
        inserted: 0,
        errors: [{ row: 0, message: e instanceof Error ? e.message : String(e) }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setRawText("");
    setColumnMapping({});
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a CSV file or paste CSV text. The first row should be column headers.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div>
                <p className="text-sm font-medium">Need a starting point?</p>
                <p className="text-xs text-muted-foreground">
                  Download a blank CSV with all the column headers your school can fill out offline.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5 mr-1" /> Template
              </Button>
            </div>
            <div>
              <Label htmlFor="csv-file" className="text-sm font-medium">Upload file</Label>
              <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFile} />
            </div>
            <div>
              <Label htmlFor="csv-text" className="text-sm font-medium">…or paste CSV</Label>
              <Textarea
                id="csv-text"
                rows={6}
                placeholder="name,email,..."
                value={rawText}
                onChange={(e) => { setRawText(e.target.value); setColumnMapping({}); }}
              />
            </div>

            {parsed && (
              <>
                <div className="border rounded-md p-3 bg-muted/30">
                  <p className="text-sm font-medium mb-2">Column mapping</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {parsed.headers.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="truncate min-w-0 flex-1 font-mono">{h}</span>
                        <span className="text-muted-foreground">→</span>
                        <Select
                          value={effectiveMapping[idx] || "__skip__"}
                          onValueChange={(v) =>
                            setColumnMapping((m) => ({ ...m, [idx]: v === "__skip__" ? null : v }))
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">(skip)</SelectItem>
                            {columns.map((c) => (
                              <SelectItem key={c.key} value={c.key}>
                                {c.label}{c.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-medium">
                      Preview ({rowObjects.length} rows)
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Click any cell to edit · ✕ to remove a row before upload
                    </p>
                  </div>
                  <div className="border rounded-md max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          {columns.map((c) => (
                            <th key={c.key} className="text-left p-2 font-medium">
                              {c.label}{c.required ? " *" : ""}
                            </th>
                          ))}
                          <th className="w-8 p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowObjects.slice(0, 50).map((row, ridx) => {
                          const rowErrs = localErrors.filter((e) => e.row === ridx + 1);
                          const isDup = duplicateRows.has(ridx);
                          const rowCls = rowErrs.length
                            ? "bg-red-50"
                            : isDup
                            ? "bg-amber-50"
                            : "";
                          return (
                            <tr key={ridx} className={rowCls}>
                              {columns.map((c, ci) => (
                                <td key={c.key} className="p-1 border-t align-top">
                                  {/* Inline editable cell — keeps the
                                      preview row layout but lets the
                                      admin patch typos before upload.
                                      Plain <input> rather than the UI
                                      Input component so the row stays
                                      compact. */}
                                  <input
                                    value={row[c.key] ?? ""}
                                    onChange={(e) => updateCell(ridx, c.key, e.target.value)}
                                    className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded px-1.5 py-1 text-xs focus:outline-none focus:bg-white"
                                  />
                                  {ci === 0 && isDup && (
                                    <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium px-1.5 py-0.5">
                                      duplicate
                                    </span>
                                  )}
                                </td>
                              ))}
                              <td className="p-1 border-t align-top">
                                <button
                                  type="button"
                                  onClick={() => removeRow(ridx)}
                                  className="text-slate-400 hover:text-rose-600 text-xs px-1"
                                  title="Remove row"
                                  aria-label="Remove row"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {localErrors.length > 0 && (
                  <Alert variant="destructive">
                    <FileWarning className="h-4 w-4" />
                    <AlertDescription>
                      {localErrors.length} row(s) have missing required fields. They will be skipped on upload.
                    </AlertDescription>
                  </Alert>
                )}
                {duplicateRows.size > 0 && (
                  <Alert className="border-amber-300 bg-amber-50 text-amber-900">
                    <FileWarning className="h-4 w-4" />
                    <AlertDescription>
                      {duplicateRows.size} row(s) match {duplicateDetection?.label ?? "an existing record"}.
                      They'll be rejected by the server with a duplicate error — review or remove them
                      before uploading.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}

        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Inserted {result.inserted} row(s).{" "}
              {result.errors.length > 0 && (
                <>
                  {result.errors.length} failed:
                  <ul className="mt-1 list-disc list-inside text-xs">
                    {result.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>Row {e.row}: {e.message}</li>
                    ))}
                  </ul>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || rowObjects.length === 0}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload {rowObjects.length || ""} row{rowObjects.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
