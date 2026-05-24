// Phase C.1: Per-section hifz snapshot for the class teacher.
//
// Sortable table of students with their cumulative hifz progress. Click
// a row to open the HifzLogEntry modal pre-filled for that student.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { BookMarked, ArrowUpDown } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookMarked className="h-6 w-6 text-indigo-600" />
          Section hifz overview
        </h1>
        <Link to={`/school/orgs/${orgId}/admin/classes`}>
          <Button variant="outline" size="sm">← Classes</Button>
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No students in this section.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="flex items-center gap-1 font-medium"
                    >
                      Student <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("ayahs")}
                      className="flex items-center gap-1 font-medium ml-auto"
                    >
                      Ayahs memorized <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("last")}
                      className="flex items-center gap-1 font-medium"
                    >
                      Last entry <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => (
                  <TableRow
                    key={s.studentId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLogTarget(s)}
                  >
                    <TableCell className="font-medium">{s.studentName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.ayahsMemorized}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(s.lastEntry)}
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
