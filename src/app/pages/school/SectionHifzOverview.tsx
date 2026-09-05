// Phase C.1: Per-section hifz snapshot for the class teacher.
//
// Sortable table of students with their cumulative hifz progress. Click
// a row to open the HifzLogEntry modal pre-filled for that student.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { ArrowUpDown } from "lucide-react";
import {
  HeroCard,
  DataTable,
  cardBase,
  type DataTableColumn,
} from "../../components/school-ui";
import {
  getSchoolMe,
  getSectionHifzSummary,
  isOrgAdmin,
  listClasses,
  type SchoolMeResponse,
  type SectionHifzSummaryRow,
} from "../../../utils/schoolApi";
import { HifzLogEntry } from "./HifzLogEntry";
import { HifzRoundMode } from "./HifzRoundMode";
import { NazraRoundMode } from "./NazraRoundMode";
import { getSurah } from "../../../utils/quranSurahs";
import { HifzProgressFeed } from "./HifzProgressFeed";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

type SortKey = "name" | "ayahs" | "last";
type SortDir = "asc" | "desc";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function SectionHifzOverview() {
  const { t } = useTranslation();
  const { orgId = "", sectionId = "" } = useParams();
  // ?round=1 (from the dashboard banner) auto-starts today's round once
  // the roster is loaded — the dialog opens on the first student.
  const [searchParams, setSearchParams] = useSearchParams();
  const [roundConsumed, setRoundConsumed] = useState(false);
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [students, setStudents] = useState<SectionHifzSummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [logTarget, setLogTarget] = useState<SectionHifzSummaryRow | null>(null);
  // Roster snapshot taken when the dialog opens: "Save · next student"
  // walks THIS order even though the table re-sorts after each save
  // (last-entry sort would otherwise shuffle the queue mid-class).
  const [logRoster, setLogRoster] = useState<SectionHifzSummaryRow[]>([]);
  // Per-student history dialog (pilot: "see how much they completed and
  // their past records") — embeds the same feed StudentDetail uses.
  const [historyTarget, setHistoryTarget] = useState<SectionHifzSummaryRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Hifz classes log only sabaq/sabqi/manzil; academic Quran/Nazra
  // tracks keep the full kind list.
  const [isHifzSection, setIsHifzSection] = useState(false);
  // "Hifz I — A", shown in the Round Mode header.
  const [sectionLabel, setSectionLabel] = useState("");
  // Round Mode (design 6a/6b): the focused screen replaces the table
  // while a round is running. The modal stays for one-off Log buttons.
  const [roundActive, setRoundActive] = useState(false);
  useEffect(() => {
    if (!orgId || !sectionId) return;
    listClasses(orgId)
      .then((classes) => {
        for (const c of classes) {
          for (const s of c.sections ?? []) {
            if (s.id === sectionId) {
              setIsHifzSection(c.kind === "hifz" || (s as any).schedule_key === "hifz");
              setSectionLabel(`${c.name} — ${s.name}`);
              return;
            }
          }
        }
      })
      .catch(() => {});
  }, [orgId, sectionId]);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  const refresh = () => {
    if (!orgId || !sectionId) return;
    setLoading(true);
    getSectionHifzSummary(orgId, sectionId)
      .then((r) => setStudents(r.students))
      .catch((e) => setError(e?.message || "Failed to load summary"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sectionId, reloadKey]);

  const sorted = useMemo(() => {
    const arr = [...students];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.studentName.localeCompare(b.studentName);
      else if (sortKey === "ayahs") cmp = a.ayahsMemorized - b.ayahsMemorized;
      else if (sortKey === "last") {
        const av = a.lastEntry ? new Date(a.lastEntry).getTime() : 0;
        const bv = b.lastEntry ? new Date(b.lastEntry).getTime() : 0;
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [students, sortKey, sortDir]);

  useEffect(() => {
    if (roundConsumed || searchParams.get("round") !== "1") return;
    if (loading || sorted.length === 0) return;
    setRoundConsumed(true);
    setRoundActive(true);
    const next = new URLSearchParams(searchParams);
    next.delete("round");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sorted, roundConsumed, searchParams]);

  if (meLoading) return null;
  if (!me) return <Navigate to="/school" replace />;

  // Round Mode takes over the page while running. Don't gate on `loading`
  // — saves refresh the summary in the background and the round keeps its
  // own queue.
  // A non-hifz section reaches this page through its Quran/Nazra
  // subject, and those children are reading rather than memorizing —
  // "ayahs memorized" reads 0 for every one of them and the S/Sq/M
  // chips describe a routine they don't follow. Show reading position
  // instead. (Pilot report: Uroosa Basit, Class II A, Sep 2026.)
  const isNazraGroup = !isHifzSection;

  if (roundActive && sorted.length > 0) {
    // A nazra group reads; it does not memorize. Same round loop, but
    // the screen is position-and-advance rather than sabaq/sabqi/manzil.
    return isNazraGroup ? (
      <NazraRoundMode
        orgId={orgId}
        groupLabel={sectionLabel || "Nazra"}
        roster={sorted}
        onClose={() => setRoundActive(false)}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    ) : (
      <HifzRoundMode
        orgId={orgId}
        sectionLabel={sectionLabel || t("hifzTeach.progressTitle")}
        roster={sorted}
        onExit={() => setRoundActive(false)}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const maxAyahs = Math.max(1, ...sorted.map((s) => s.ayahsMemorized));

  const positionText = (s: SectionHifzSummaryRow): string => {
    const p = s.nazraPosition;
    if (!p) return "Not started";
    const where = p.juzNumber
      ? `Para ${p.juzNumber}`
      : p.surahNumber
      ? getSurah(p.surahNumber)?.nameTransliterated ?? `Surah ${p.surahNumber}`
      : "—";
    const range = p.ayahFrom != null && p.ayahTo != null ? ` · ayah ${p.ayahFrom}–${p.ayahTo}` : "";
    return `${where}${range}`;
  };

  const nazraColumns: DataTableColumn<SectionHifzSummaryRow>[] = [
    {
      key: "name",
      header: (
        <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1">
          {t("hifzTeach.colStudent")} <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (s) => <span className="font-medium">{s.studentName}</span>,
    },
    {
      key: "position",
      header: "Reading position",
      cell: (s) => (
        <span className="text-[12.5px] text-slate-700">
          {positionText(s)}
          {s.nazraPosition?.isRevision && (
            <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
              revision
            </span>
          )}
        </span>
      ),
    },
    {
      key: "today",
      header: t("hifzTeach.colToday"),
      cell: (s) => (
        <span
          className={
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold " +
            (s.today?.nazra
              ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
              : "bg-slate-100 text-slate-400")
          }
        >
          {s.today?.nazra ? "Heard" : "Pending"}
        </span>
      ),
    },
    {
      key: "last",
      header: (
        <button type="button" onClick={() => toggleSort("last")} className="inline-flex items-center gap-1">
          {t("hifzTeach.colLast")} <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (s) => <span className="text-xs text-slate-500">{formatDate(s.lastEntry)}</span>,
    },
  ];

  const columns: DataTableColumn<SectionHifzSummaryRow>[] = [
    {
      key: "name",
      header: (
        <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1">
          {t("hifzTeach.colStudent")} <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (s) => <span className="font-medium">{s.studentName}</span>,
    },
    {
      key: "ayahs",
      header: (
        <button type="button" onClick={() => toggleSort("ayahs")} className="inline-flex items-center gap-1">
          {t("hifzTeach.colAyahs")} <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (s) => {
        const pct = (s.ayahsMemorized / maxAyahs) * 100;
        const color =
          pct >= 75 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <span className="tabular-nums text-xs text-slate-700">{s.ayahsMemorized}</span>
          </div>
        );
      },
    },
    {
      key: "today",
      header: t("hifzTeach.colToday"),
      cell: (s) => {
        const t = s.today ?? { sabaq: false, sabqi: false, manzil: false };
        const chip = (done: boolean, label: string) => (
          <span
            className={
              "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold " +
              (done
                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                : "bg-slate-100 text-slate-400")
            }
            title={label + (done ? " — heard today" : " — pending")}
          >
            {label}
          </span>
        );
        return (
          <div className="inline-flex gap-1">
            {chip(t.sabaq, "S")}
            {chip(t.sabqi, "Sq")}
            {chip(t.manzil, "M")}
          </div>
        );
      },
    },
    {
      key: "last",
      header: (
        <button type="button" onClick={() => toggleSort("last")} className="inline-flex items-center gap-1">
          {t("hifzTeach.colLast")} <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (s) => <span className="text-xs text-slate-500">{formatDate(s.lastEntry)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-40",
      cell: (s) => (
        <div className="inline-flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setHistoryTarget(s);
            }}
          >
            {t("hifzTeach.history")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setLogRoster(sorted);
              setLogTarget(s);
            }}
          >
            {t("hifzTeach.log")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title={isNazraGroup ? "Nazra Progress" : t("hifzTeach.progressTitle")}
        subtitle={
          isNazraGroup
            ? `${sorted.length} students · where each child has read up to`
            : t("hifzTeach.progressSubtitle", { count: sorted.length })
        }
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Pilot (hifz teachers): one tap starts the daily round —
                the dialog opens on the first student and "Save · next
                student" walks the whole class. */}
            {sorted.length > 0 && (
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setRoundActive(true)}
              >
                {isNazraGroup ? "Start today's Nazra round" : t("hifzTeach.startRound")}
              </Button>
            )}
            <Link to={`/school/orgs/${orgId}/admin/classes`}>
              <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">{t("hifzTeach.backClasses")}</Button>
            </Link>
          </div>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {loading ? (
        <p className="p-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className={cardBase}>
          <DataTable<SectionHifzSummaryRow>
            columns={isNazraGroup ? nazraColumns : columns}
            rows={sorted}
            rowKey={(s) => s.studentId}
            emptyMessage="No students in this section."
            onRowClick={(s) => {
              setLogRoster(sorted);
              setLogTarget(s);
            }}
          />
        </div>
      )}

      {logTarget && (() => {
        const idx = logRoster.findIndex((r) => r.studentId === logTarget.studentId);
        const next = idx >= 0 && idx < logRoster.length - 1 ? logRoster[idx + 1] : null;
        return (
          <HifzLogEntry
            orgId={orgId}
            studentId={logTarget.studentId}
            studentName={logTarget.studentName}
            hifzOnly={isHifzSection}
            positionLabel={idx >= 0 ? t("hifzTeach.studentOf", { n: idx + 1, total: logRoster.length }) : null}
            onNextStudent={next ? () => setLogTarget(next) : null}
            open={!!logTarget}
            onOpenChange={(v) => { if (!v) setLogTarget(null); }}
            // NOTE: onSuccess must NOT close the dialog — "Save · next
            // kind" and "Save · next student" keep it open. Close-mode
            // saves close via onOpenChange inside the dialog.
            onSuccess={() => setReloadKey((k) => k + 1)}
          />
        );
      })()}

      {historyTarget && (
        <Dialog open={!!historyTarget} onOpenChange={(v) => { if (!v) setHistoryTarget(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("hifzTeach.historyTitle", { name: historyTarget.studentName })}</DialogTitle>
            </DialogHeader>
            <HifzProgressFeed
              orgId={orgId}
              studentId={historyTarget.studentId}
              reloadKey={reloadKey}
              allowDelete={isOrgAdmin(me, orgId)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
