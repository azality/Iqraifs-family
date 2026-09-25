// AutoRemarksCard — the school's own comment chart (25 Sep).
//
// "If the student overall is between 95% to 100% this should be the
// comment... 5% increments... fail comments below 40%." Every report
// card whose teacher/principal remark is EMPTY pre-populates from this
// chart by overall percentage — free, instant, no AI. A remark someone
// actually writes always wins, and the editor on the card page keeps
// auto text out of the textarea so the chart keeps applying until then.
//
// Lives on the Grade scales page, beside the letter-grade chart it
// mirrors. Saved as ONE org-settings key (server merges per key).

import { useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";
import {
  getRemarkBands, updateOrganization, type RemarkBandRow,
} from "../../../../utils/schoolApi";

export function AutoRemarksCard({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<RemarkBandRow[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = () => {
    getRemarkBands(orgId)
      .then((r) => { setRows(r.bands); setIsCustom(r.isCustom); })
      .catch(() => {});
  };
  useEffect(load, [orgId]);

  const save = async () => {
    setBusy(true);
    try {
      await updateOrganization(orgId, { report_remark_bands: rows });
      toast.success("Remarks chart saved — empty remarks on every card now follow it.");
      setIsCustom(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!confirm("Reset the remarks chart to the built-in defaults?")) return;
    setBusy(true);
    try {
      await updateOrganization(orgId, { report_remark_bands: null });
      toast.success("Back to the default chart.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset");
    } finally {
      setBusy(false);
    }
  };
  const edit = (i: number, field: "classTeacher" | "principal", v: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MessageSquareQuote className="h-4 w-4 text-indigo-600" />
          Automatic remarks — by overall percentage
          {isCustom && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200">customized</span>}
        </span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Edit"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-3 text-xs text-slate-500">
            When a card's teacher or principal remark is left empty, the matching row below
            fills it in automatically — on the printed card and the parent portal. A remark
            someone writes on the card always replaces the automatic one.
          </p>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={`${r.minPct}-${r.maxPct}`} className="rounded-md border border-slate-100 p-2.5">
                <div className="mb-1.5 text-xs font-bold tabular-nums text-slate-700">
                  {r.minPct}–{r.maxPct}%{r.maxPct <= 40 ? " (below pass mark)" : ""}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Class teacher's remark</div>
                    <Textarea value={r.classTeacher} onChange={(e) => edit(i, "classTeacher", e.target.value)}
                      className="h-16 text-xs" maxLength={600} />
                  </div>
                  <div>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Principal's remark</div>
                    <Textarea value={r.principal} onChange={(e) => edit(i, "principal", e.target.value)}
                      className="h-16 text-xs" maxLength={600} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save remarks chart"}
            </Button>
            {isCustom && (
              <Button size="sm" variant="outline" onClick={() => void reset()} disabled={busy}>
                Reset to defaults
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
