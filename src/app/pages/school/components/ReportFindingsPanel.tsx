// ReportFindingsPanel — "what do I tell this parent", computed.
//
// 25 Sep: the teacher writing forty remarks at night cannot cross-check
// every subject against the child's own average, spot which PAPER lost
// the marks, or notice that manzil is slipping while sabaq holds. The
// arithmetic does that; this panel just shows it, worst first, with a
// one-click copy so it can go straight into the remark.
//
// Staff-only — parents see remarks, not the workings.

import { useState } from "react";
import { AlertTriangle, Eye, Sparkles, Copy, Check } from "lucide-react";
import type { ReportFinding, FindingSeverity } from "../../../../utils/schoolApi";

const TONE: Record<FindingSeverity, { box: string; Icon: typeof AlertTriangle; label: string }> = {
  concern: { box: "border-rose-200 bg-rose-50 text-rose-900", Icon: AlertTriangle, label: "Needs attention" },
  watch: { box: "border-amber-200 bg-amber-50 text-amber-900", Icon: Eye, label: "Worth mentioning" },
  strength: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: Sparkles, label: "Strength" },
};

export function ReportFindingsPanel({
  findings, notable,
}: { findings: ReportFinding[]; notable: boolean }) {
  const [copied, setCopied] = useState(false);
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500 no-print">
        Nothing stands out in this child's numbers — the automatic remark fits as it is.
      </div>
    );
  }

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(findings.map((f) => `• ${f.en}`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked - the text is on screen anyway */ }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 no-print">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          What the numbers say
          {notable && (
            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200">
              worth a personal remark
            </span>
          )}
        </span>
        <button type="button" onClick={() => void copyAll()}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy all</>}
        </button>
      </div>
      <ul className="space-y-1.5">
        {findings.map((f, i) => {
          const tone = TONE[f.severity] ?? TONE.watch;
          return (
            <li key={`${f.kind}-${f.subject ?? ""}-${i}`}
              className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[12px] ${tone.box}`}>
              <tone.Icon className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span className="flex-1">
                {f.en}
                {/* The Urdu line is right there, so a teacher writing an
                    Urdu remark does not have to translate it themselves. */}
                <span dir="rtl" lang="ur" className="mt-0.5 block text-[11px] opacity-75">{f.ur}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-slate-400">
        Computed from this child's own marks, attendance and hifz record — not a prediction.
        Use it to write the remark; the card only shows what you save.
      </p>
    </div>
  );
}
