// HeaderSearch — inline global search in the school header (>= sm).
//
// Pilot (Muneeb): the palette overlay still read as a popup; he wants to
// type in the header bar and see results drop down RIGHT THERE. So on
// desktop this is a real input with an attached results dropdown —
// Google-style. Phones keep the CmdK overlay (no room for an inline
// dropdown in the mobile header).

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Search, GraduationCap, User, UserCog, BookOpen, ListChecks,
  MessageSquare, Loader2,
} from "lucide-react";
import { schoolSearch, type SchoolSearchResponse } from "../../../utils/schoolApi";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function HeaderSearch({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SchoolSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Ctrl/Cmd-K focuses the header input (desktop's visible search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Debounced backend search.
  useEffect(() => {
    if (!orgId || q.trim().length < MIN_CHARS) { setResults(null); setLoading(false); return; }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await schoolSearch(orgId, q.trim());
        if (reqIdRef.current === myReq) setResults(r);
      } catch {
        if (reqIdRef.current === myReq) setResults(null);
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [orgId, q]);

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    setResults(null);
    inputRef.current?.blur();
    navigate(path);
  };

  type Row = { key: string; icon: JSX.Element; title: string; sub: string; path: string };
  const rows: Array<{ heading: string; items: Row[] }> = useMemo(() => {
    if (!results) return [];
    const groups: Array<{ heading: string; items: Row[] }> = [];
    const push = (heading: string, items: Row[]) => { if (items.length) groups.push({ heading, items }); };
    push("Students", results.students.map((s) => ({
      key: `s:${s.id}`,
      icon: <GraduationCap className="h-3.5 w-3.5 text-indigo-500" />,
      title: s.fullName,
      sub: `${s.grNumber}${s.className ? ` · ${s.className}${s.sectionName ? ` — ${s.sectionName}` : ""}` : ""}`,
      path: s.path,
    })));
    push("Teachers & staff", (results.teachers ?? []).map((t) => ({
      key: `t:${t.userId}`,
      icon: <UserCog className="h-3.5 w-3.5 text-violet-500" />,
      title: t.name,
      sub: t.roleType.replace(/_/g, " "),
      path: t.path,
    })));
    push("Classes", (results.sections ?? []).map((c) => ({
      key: `c:${c.sectionId}`,
      icon: <BookOpen className="h-3.5 w-3.5 text-sky-500" />,
      title: c.label,
      sub: c.kind === "hifz" ? "Hifz class" : "Class section",
      path: c.path,
    })));
    push("Syllabus topics", (results.topics ?? []).map((t) => ({
      key: `tp:${t.id}`,
      icon: <ListChecks className="h-3.5 w-3.5 text-emerald-500" />,
      title: t.name,
      sub: `${t.className} · ${t.subjectName}`,
      path: t.path,
    })));
    push("Parents", results.parents.map((p) => ({
      key: `p:${p.id}`,
      icon: <User className="h-3.5 w-3.5 text-emerald-600" />,
      title: p.fullName,
      sub: p.phone ?? p.email ?? "—",
      path: p.path,
    })));
    push("Messages", results.threads.map((t) => ({
      key: `th:${t.id}`,
      icon: <MessageSquare className="h-3.5 w-3.5 text-amber-500" />,
      title: t.subject || "(no subject)",
      sub: t.studentName ?? "—",
      path: t.path,
    })));
    return groups;
  }, [results]);

  const flat = useMemo(() => rows.flatMap((g) => g.items), [rows]);
  const showPanel = open && q.trim().length >= MIN_CHARS;

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-indigo-300 focus-within:bg-white transition-colors min-w-[190px]">
        <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && flat.length > 0) go(flat[0].path);
          }}
          placeholder="Search…"
          className="w-32 lg:w-44 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 outline-none"
          aria-label="Search students, teachers, classes, topics"
        />
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        ) : (
          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Ctrl K</kbd>
        )}
      </div>

      {showPanel && (
        <div className="absolute right-0 z-50 mt-1.5 w-[26rem] max-h-[65vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {loading && !results ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : flat.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No matches for &ldquo;{q.trim()}&rdquo;.
            </div>
          ) : (
            rows.map((g) => (
              <div key={g.heading} className="py-1.5">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {g.heading}
                </div>
                {g.items.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => go(it.path)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-indigo-50/60"
                  >
                    {it.icon}
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-900">{it.title}</span>
                      <span className="block truncate text-[11px] text-slate-500">{it.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default HeaderSearch;
