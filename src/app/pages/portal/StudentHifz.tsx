// StudentHifz — Quran memorization progress entries for a student.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { DataTable, HeroCard } from "../../components/school-ui";
import {
  getMyStudentHifz,
  type MyStudentHifzResponse,
  type HifzEntry,
} from "../../../utils/schoolPortalApi";

export function StudentHifz() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [data, setData] = useState<MyStudentHifzResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyStudentHifz(studentId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const last = data.summary.lastEntry
    ? new Date(data.summary.lastEntry).toLocaleDateString()
    : "—";

  return (
    <div className="space-y-5">
      <HeroCard
        title="Hifz Progress"
        subtitle="Quran memorization log"
        rightSlot={
          <div className="text-right text-xs text-indigo-200">
            <div className="text-2xl text-white font-semibold tabular-nums">
              {data.summary.ayahsMemorized}
            </div>
            <div>ayahs · {data.summary.surahsCompleted} surahs</div>
            <div>last entry · {last}</div>
          </div>
        }
      />
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <DataTable<HifzEntry>
          rows={data.entries}
          rowKey={(r) => r.id}
          emptyMessage="No hifz entries yet."
          columns={[
            {
              key: "surah_number",
              header: "Surah",
              width: "w-20",
              cell: (r) => <span className="tabular-nums">{r.surah_number}</span>,
            },
            {
              key: "ayahs",
              header: "Ayahs",
              width: "w-28",
              cell: (r) => (
                <span className="tabular-nums">
                  {r.ayah_from}–{r.ayah_to}
                </span>
              ),
            },
            {
              key: "kind",
              header: "Kind",
              width: "w-32",
              cell: (r) => (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 capitalize">
                  {r.kind}
                </span>
              ),
            },
            {
              key: "quality",
              header: "Quality",
              width: "w-32",
              cell: (r) =>
                r.quality ? (
                  <span className="text-slate-700 capitalize">
                    {r.quality.replace(/_/g, " ")}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                ),
            },
            {
              key: "recorded_at",
              header: "Date",
              width: "w-32",
              cell: (r) => new Date(r.recorded_at).toLocaleDateString(),
            },
          ]}
        />
      </div>
    </div>
  );
}
