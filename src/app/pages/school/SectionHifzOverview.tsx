// Phase C.1: Per-section hifz snapshot for the class teacher.
//
// Sortable table of students with their cumulative hifz progress. Click
// a row to open the HifzLogEntry modal pre-filled for that student.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
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
  type SchoolMeResponse,
  type SectionHifzSummaryRow,
} from "../../../utils/schoolApi";
import { HifzLogEntry } from "./HifzLogEntry";

type SortKey = "name" | "ayahs" | "last";
type SortDir = "asc" | "desc";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function SectionHifzOverview() {
  const { orgId = "", sectionId = "" } = useParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [students, setStudents] = useState<SectionHifzSummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [logTarget, setLogTarget] = useState<SectionHifzSummaryRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  if (meLoading) return null;
  if (!me) return <Navigate to="/school" replace />;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const maxAyahs = Math.max(1, ...sorted.map((s) => s.ayahsMemorized));

  const columns: DataTableColumn<SectionHifzSummaryRow>[] = [
    {
      key: "name",
      header: (
        <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1">
          Student <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (s) => <span className="font-medium">{s.studentName}</span>,
    },
    {
      key: "ayahs",
      header: (
        <button type="button" onClick={() => toggleSort("ayahs")} className="inline-flex items-center gap-1">
          Ayahs memorized <ArrowUpDown className="h-3 w-3" />
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
      key: "last",
      header: (
        <button type="button" onClick={() => toggleSort("last")} className="inline-flex items-center gap-1">
          Last entry <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (s) => <span className="text-xs text-slate-500">{formatDate(s.lastEntry)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-20",
      cell: (s) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setLogTarget(s);
          }}
        >
          Log
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <HeroCard
        title="Hifz Progress"
        subtitle={`${sorted.length} student${sorted.length === 1 ? "" : "s"} · cumulative memorization`}
        rightSlot={
          <Link to={`/school/orgs/${orgId}/admin/classes`}>
            <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">← Classes</Button>
          </Link>
        }
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {loading ? (
        <p className="p-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className={cardBase}>
          <DataTable<SectionHifzSummaryRow>
            columns={columns}
            rows={sorted}
            rowKey={(s) => s.studentId}
            emptyMessage="No students in this section."
            onRowClick={(s) => setLogTarget(s)}
          />
        </div>
      )}

      {logTarget && (
        <HifzLogEntry
          orgId={orgId}
          studentId={logTarget.studentId}
          studentName={logTarget.studentName}
          open={!!logTarget}
          onOpenChange={(v) => { if (!v) setLogTarget(null); }}
          onSuccess={() => {
            setLogTarget(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
