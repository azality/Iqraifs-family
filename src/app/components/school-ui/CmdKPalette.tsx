// CmdKPalette — global search palette for the school admin shell.
//
// Triggers:
//   - Cmd-K / Ctrl-K anywhere in a school admin route opens the palette
//   - Esc closes it
//   - Typing 2+ chars debounces a backend search (250 ms)
//   - Enter on a result navigates; results are grouped by kind
//
// Why a separate component:
//   The shell mounts it once; pages don't need to know it exists. The
//   palette uses cmdk via the shared ui/command primitives.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { GraduationCap, User, MessageSquare, Loader2, UserCog, BookOpen, ListChecks } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import {
  schoolSearch,
  type SchoolSearchResponse,
} from "../../../utils/schoolApi";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function CmdKPalette() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SchoolSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  // Cmd-K / Ctrl-K global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    // Header search button (and anything else) can open the palette via
    // this event — the keyboard shortcut alone was undiscoverable and
    // useless on phones.
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("iqra:open-search", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("iqra:open-search", onOpenEvent);
    };
  }, []);

  // Debounced search.
  useEffect(() => {
    if (!orgId || q.trim().length < MIN_CHARS) {
      setResults(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await schoolSearch(orgId, q.trim());
        // Drop stale responses.
        if (reqIdRef.current === myReq) setResults(r);
      } catch {
        if (reqIdRef.current === myReq) setResults(null);
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [orgId, q]);

  // Reset state on close.
  useEffect(() => {
    if (!open) { setQ(""); setResults(null); }
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const empty = useMemo(() => {
    if (loading) return false;
    if (q.trim().length < MIN_CHARS) return false;
    if (!results) return false;
    return (
      results.students.length === 0 &&
      results.parents.length === 0 &&
      results.threads.length === 0 &&
      (results.teachers ?? []).length === 0 &&
      (results.sections ?? []).length === 0 &&
      (results.topics ?? []).length === 0
    );
  }, [loading, q, results]);

  if (!orgId) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} contentClassName="self-start mt-[8vh] sm:mt-[12vh] w-full max-w-xl" title="Search" description="Search students, teachers, classes, topics, parents, threads">
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder="Search students, teachers, classes, topics…"
      />
      <CommandList>
        {q.trim().length < MIN_CHARS ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">
            Type at least {MIN_CHARS} characters.
          </div>
        ) : loading ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500 inline-flex items-center justify-center w-full gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </div>
        ) : empty ? (
          <CommandEmpty>No matches for &ldquo;{q}&rdquo;.</CommandEmpty>
        ) : results ? (
          <>
            {results.students.length > 0 && (
              <CommandGroup heading="Students">
                {results.students.map((s) => (
                  <CommandItem
                    key={`s:${s.id}`}
                    value={`student ${s.fullName} ${s.grNumber}`}
                    onSelect={() => go(s.path)}
                  >
                    <GraduationCap className="h-4 w-4 text-indigo-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{s.fullName}</span>
                      <span className="text-[11px] text-slate-500">
                        {s.grNumber}{s.className ? ` · ${s.className}${s.sectionName ? ` — ${s.sectionName}` : ""}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {(results.teachers ?? []).length > 0 && (
              <CommandGroup heading="Teachers & staff">
                {(results.teachers ?? []).map((t) => (
                  <CommandItem
                    key={`tc:${t.userId}`}
                    value={`teacher ${t.name} ${t.email ?? ""}`}
                    onSelect={() => go(t.path)}
                  >
                    <UserCog className="h-4 w-4 text-violet-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{t.name}</span>
                      <span className="text-[11px] text-slate-500">
                        {t.roleType.replace(/_/g, " ")}{t.email ? ` · ${t.email}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {(results.sections ?? []).length > 0 && (
              <CommandGroup heading="Classes">
                {(results.sections ?? []).map((c) => (
                  <CommandItem
                    key={`cl:${c.sectionId}`}
                    value={`class ${c.label}`}
                    onSelect={() => go(c.path)}
                  >
                    <BookOpen className="h-4 w-4 text-sky-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{c.label}</span>
                      <span className="text-[11px] text-slate-500">
                        {c.kind === "hifz" ? "Hifz class" : "Class section"}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {(results.topics ?? []).length > 0 && (
              <CommandGroup heading="Syllabus topics">
                {(results.topics ?? []).map((t) => (
                  <CommandItem
                    key={`tp:${t.id}`}
                    value={`topic ${t.name} ${t.subjectName} ${t.className}`}
                    onSelect={() => go(t.path)}
                  >
                    <ListChecks className="h-4 w-4 text-emerald-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{t.name}</span>
                      <span className="text-[11px] text-slate-500">
                        {t.className} · {t.subjectName}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.parents.length > 0 && (
              <CommandGroup heading="Parents">
                {results.parents.map((p) => (
                  <CommandItem
                    key={`p:${p.id}`}
                    value={`parent ${p.fullName} ${p.phone ?? ""} ${p.email ?? ""}`}
                    onSelect={() => go(p.path)}
                  >
                    <User className="h-4 w-4 text-emerald-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{p.fullName}</span>
                      <span className="text-[11px] text-slate-500">
                        {p.phone ?? p.email ?? "—"}
                        {p.children.length > 0 && (
                          <> · {p.children.map((c) => c.fullName).join(", ")}</>
                        )}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.threads.length > 0 && (
              <CommandGroup heading="Message threads">
                {results.threads.map((t) => (
                  <CommandItem
                    key={`t:${t.id}`}
                    value={`thread ${t.subject} ${t.studentName ?? ""}`}
                    onSelect={() => go(t.path)}
                  >
                    <MessageSquare className="h-4 w-4 text-amber-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{t.subject || "(no subject)"}</span>
                      <span className="text-[11px] text-slate-500">
                        {t.studentName ?? "—"}
                        {t.lastMessageAt && (
                          <> · {new Date(t.lastMessageAt).toLocaleDateString()}</>
                        )}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

export default CmdKPalette;
