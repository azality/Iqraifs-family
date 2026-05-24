// Generic CSV upload dialog used by the Phase A admin importers
// (students, parents, teachers). Lets the user pick a file or paste CSV
// text, auto-maps headers to canonical keys, allows per-column overrides,
// surfaces validation errors, then hands the parsed row objects to the
// page's onSubmit.

import { useMemo, useState } from "react";
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
import { Upload, FileWarning, CheckCircle2 } from "lucide-react";
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
}

export function CsvUploadDialog({ open, onOpenChange, title, columns, onSubmit }: Props) {
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

  const rowObjects = useMemo(
    () => (parsed ? rowsToObjects(parsed.dataRows, effectiveMapping) : []),
    [parsed, effectiveMapping],
  );

  const localErrors = useMemo(
    () => (rowObjects.length ? validateRows(rowObjects, columns) : []),
    [rowObjects, columns],
  );

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
                  <p className="text-sm font-medium mb-2">
                    Preview ({rowObjects.length} rows)
                  </p>
                  <div className="border rounded-md max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          {columns.map((c) => (
                            <th key={c.key} className="text-left p-2 font-medium">
                              {c.label}{c.required ? " *" : ""}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowObjects.slice(0, 50).map((row, ridx) => {
                          const rowErrs = localErrors.filter((e) => e.row === ridx + 1);
                          return (
                            <tr key={ridx} className={rowErrs.length ? "bg-red-50" : ""}>
                              {columns.map((c) => (
                                <td key={c.key} className="p-2 border-t">
                                  {row[c.key] || <span className="text-muted-foreground">—</span>}
                                </td>
                              ))}
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
