// Timetable schedule editor — "define once, generate everywhere".
//
// Implementation of the Claude Design handoff (Timetable Settings
// Redesign). Three sections — School week, The school day, Holidays —
// plus a sticky right-rail preview that publishes the skeleton (one
// timetable_slot per day × period) only when the admin clicks Publish.
//
// Key design moves from the handoff:
// - Single "period length" knob updates every academic period at once.
// - Global "gap between periods" rather than per-period.
// - ± steppers (5-min) instead of free-form typing.
// - Ramadan toggle that shortens academic periods and previews the new
//   home time.
// - Holidays with Religious / National / School chips + quick-add
//   presets + "subject to moon sighting" note on Eid dates.
//
// Backend wiring:
// - The week template + ramadan + first bell + global gap persist to
//   organizations.settings.timetable_template via applyTimetableTemplate.
// - Holidays + school days persist to organizations.settings.school_year
//   via updateOrganization.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  applyTimetableTemplate,
  getTimetableTemplate,
  getOrganization,
  updateOrganization,
  type TimetableTemplatePeriod,
  type SchoolYearHoliday,
} from "../../../utils/schoolApi";

type Kind = "academic" | "break" | "prayer";
type HolidayType = "religious" | "national" | "school";
interface Block { id: number; name: string; kind: Kind; dur: number; }
interface Holiday extends SchoolYearHoliday {
  id: number;
  type: HolidayType;
  moon: boolean;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_META: Record<Kind, { label: string; chipBg: string; chipColor: string; rowBg: string; bar: string }> = {
  academic: { label: "Period",  chipBg: "#EEF0FE", chipColor: "#4F46E5", rowBg: "#FDFDFE", bar: "#4F46E5" },
  break:    { label: "Break",   chipBg: "#F1F3F7", chipColor: "#5B6472", rowBg: "#FAFBFC", bar: "#C6CCD8" },
  prayer:   { label: "Prayer",  chipBg: "#E7F8F0", chipColor: "#047857", rowBg: "#FCFEFD", bar: "#059669" },
};

const TYPE_META: Record<HolidayType, { label: string; chipBg: string; chipColor: string }> = {
  religious: { label: "Religious", chipBg: "#E7F8F0", chipColor: "#047857" },
  national:  { label: "National",  chipBg: "#EEF0FE", chipColor: "#4F46E5" },
  school:    { label: "School",    chipBg: "#FDF3E2", chipColor: "#92600A" },
};

const PRESETS: Array<{ label: string; name: string; type: HolidayType; moon: boolean }> = [
  { label: "Kashmir Day", name: "Kashmir Day", type: "national", moon: false },
  { label: "Labour Day", name: "Labour Day", type: "national", moon: false },
  { label: "Shab-e-Barat", name: "Shab-e-Barat", type: "religious", moon: true },
  { label: "Ashura", name: "Ashura (9th–10th Muharram)", type: "religious", moon: true },
];

function parseHM(t: string): number {
  const [h, m] = t.split(":").map((s) => parseInt(s, 10) || 0);
  return h * 60 + m;
}
function fmt(mins: number): string {
  let h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m < 10 ? "0" : ""}${m} ${ap}`;
}
function fmtShort(mins: number): string {
  let h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m < 10 ? "0" : ""}${m}`;
}
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}
function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

let nextId = 1000;

export function TimetableWeekTemplate() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [activeDays, setActiveDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [firstBell, setFirstBell] = useState("08:00");
  const [periodLen, setPeriodLen] = useState(45);
  const [gap, setGap] = useState(5);
  const [blocks, setBlocks] = useState<Block[]>([
    { id: nextId++, name: "Period 1", kind: "academic", dur: 45 },
    { id: nextId++, name: "Period 2", kind: "academic", dur: 45 },
    { id: nextId++, name: "Break",    kind: "break",    dur: 20 },
    { id: nextId++, name: "Period 3", kind: "academic", dur: 45 },
    { id: nextId++, name: "Zuhr prayer", kind: "prayer", dur: 30 },
    { id: nextId++, name: "Period 4", kind: "academic", dur: 45 },
  ]);
  const [ramadan, setRamadan] = useState(false);
  const [ramadanLen, setRamadanLen] = useState(30);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [dirty, setDirty] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Holiday form
  const [hName, setHName] = useState("");
  const [hStart, setHStart] = useState("");
  const [hEnd, setHEnd] = useState("");

  // Load existing template + school year.
  useEffect(() => {
    if (!orgId) return;
    getTimetableTemplate(orgId)
      .then((r) => {
        const t = r.template as any;
        if (!t) return;
        if (Array.isArray(t.days)) {
          const arr = [false, false, false, false, false, false, false];
          for (const d of t.days) if (d >= 1 && d <= 7) arr[d - 1] = true;
          setActiveDays(arr);
        }
        if (typeof t.startTime === "string") setFirstBell(t.startTime);
        if (Array.isArray(t.periods)) {
          setBlocks(t.periods.map((p: any) => ({
            id: nextId++,
            name: p.name ?? "Period",
            kind: (p.kind === "academic" || p.kind === "break" || p.kind === "prayer") ? p.kind : "academic",
            dur: p.durationMinutes ?? 45,
          })));
          const ac = t.periods.filter((p: any) => p.kind === "academic");
          if (ac.length > 0) setPeriodLen(ac[0].durationMinutes ?? 45);
          const firstGap = (t.periods[1]?.gapBefore ?? t.periods[0]?.gapBefore);
          if (typeof firstGap === "number") setGap(firstGap);
        }
        if (typeof t.ramadan === "boolean") setRamadan(t.ramadan);
        if (typeof t.ramadanLen === "number") setRamadanLen(t.ramadanLen);
        setPublished(!!t.published);
      })
      .catch(() => { /* fresh school */ });
    getOrganization(orgId)
      .then((r) => {
        const sy: any = (r.organization as any).settings?.school_year ?? {};
        if (Array.isArray(sy.holidays)) {
          setHolidays(sy.holidays.map((h: any) => ({
            id: nextId++,
            name: h.name ?? "",
            startDate: h.startDate ?? "",
            endDate: h.endDate ?? h.startDate ?? "",
            type: (h.type === "religious" || h.type === "national") ? h.type : "school",
            moon: !!h.moon,
          })));
        }
        if (Array.isArray(sy.schoolDays) && sy.schoolDays.length > 0) {
          const arr = [false, false, false, false, false, false, false];
          for (const d of sy.schoolDays) if (d >= 1 && d <= 7) arr[d - 1] = true;
          setActiveDays(arr);
        }
      })
      .catch(() => { /* non-fatal */ });
  }, [orgId]);

  function markDirty() { setDirty(true); setPublished(false); }

  function toggleDay(i: number) {
    setActiveDays((s) => { const next = s.slice(); next[i] = !next[i]; return next; });
    markDirty();
  }

  function changePeriodLen(delta: number) {
    setPeriodLen((s) => {
      const next = Math.max(20, Math.min(90, s + delta));
      setBlocks((bs) => bs.map((b) => b.kind === "academic" ? { ...b, dur: next } : b));
      markDirty();
      return next;
    });
  }

  function changeGap(delta: number) {
    setGap((s) => Math.max(0, Math.min(15, s + delta)));
    markDirty();
  }

  function addBlock(kind: Kind) {
    setBlocks((s) => {
      let name: string; let dur: number;
      if (kind === "academic") {
        name = "Period " + (s.filter((b) => b.kind === "academic").length + 1);
        dur = periodLen;
      } else if (kind === "break") { name = "Break"; dur = 20; }
      else { name = "Prayer"; dur = 30; }
      return [...s, { id: nextId++, name, kind, dur }];
    });
    markDirty();
  }

  function updateBlock(id: number, patch: Partial<Block>) {
    setBlocks((s) => s.map((b) => b.id === id ? { ...b, ...patch } : b));
    markDirty();
  }
  function removeBlock(id: number) {
    setBlocks((s) => s.filter((b) => b.id !== id)); markDirty();
  }
  function moveBlock(id: number, dir: -1 | 1) {
    setBlocks((s) => {
      const idx = s.findIndex((b) => b.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= s.length) return s;
      const next = s.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    markDirty();
  }

  function addHolidayFromForm(e: React.FormEvent) {
    e.preventDefault();
    const name = hName.trim();
    if (!name || !hStart) return;
    setHolidays((s) => [...s, {
      id: nextId++, name, startDate: hStart, endDate: hEnd || hStart, type: "school", moon: false,
    }]);
    setHName(""); setHStart(""); setHEnd("");
  }
  function addPresetHoliday(preset: typeof PRESETS[number]) {
    setHolidays((s) => [...s, {
      id: nextId++, name: preset.name, type: preset.type, moon: preset.moon,
      startDate: todayPlus(30), endDate: todayPlus(30),
    }]);
  }
  function removeHoliday(id: number) {
    setHolidays((s) => s.filter((h) => h.id !== id));
  }

  // Computed
  const { previewBlocks, dayEnd, ramadanEnd } = useMemo(() => {
    let cursor = parseHM(firstBell);
    const pb = blocks.map((b, i) => {
      const start = cursor;
      const end = start + b.dur;
      cursor = end + (i < blocks.length - 1 ? gap : 0);
      return { ...b, start, end };
    });
    let rCursor = parseHM(firstBell);
    blocks.forEach((b, i) => {
      const d = b.kind === "academic" ? ramadanLen : b.dur;
      rCursor += d + (i < blocks.length - 1 ? gap : 0);
    });
    return { previewBlocks: pb, dayEnd: cursor, ramadanEnd: rCursor };
  }, [blocks, firstBell, gap, ramadanLen]);

  const activeCount = activeDays.filter(Boolean).length;
  const activeLabels = DAY_LABELS.filter((_, i) => activeDays[i]);
  const contiguous = activeLabels.length > 2 && activeLabels.every((l, idx) => DAY_LABELS.indexOf(l) === DAY_LABELS.indexOf(activeLabels[0]) + idx);
  const weekSummary = activeCount === 0
    ? "No school days selected yet."
    : `School runs ${contiguous ? `${activeLabels[0]} – ${activeLabels[activeLabels.length - 1]}` : activeLabels.join(", ")} · ${activeCount} days a week.`;

  const dayStart = parseHM(firstBell);
  const lenMin = dayEnd - dayStart;
  const lenLabel = `${Math.floor(lenMin / 60)} h${lenMin % 60 ? ` ${lenMin % 60} min` : ""}`;
  const slotCount = blocks.length * activeCount;
  const totalOff = holidays.reduce((sum, h) => sum + daysBetween(h.startDate, h.endDate), 0);
  const sortedHolidays = useMemo(() => holidays.slice().sort((a, b) => a.startDate < b.startDate ? -1 : 1), [holidays]);
  const availablePresets = PRESETS.filter((p) => !holidays.some((h) => h.name === p.name));

  async function publish() {
    if (!orgId) return;
    setPublishing(true);
    setError(null);
    try {
      const days = activeDays.map((on, i) => on ? i + 1 : 0).filter((n) => n > 0);
      const periods: TimetableTemplatePeriod[] = blocks.map((b, i) => ({
        name: b.name,
        durationMinutes: b.dur,
        gapBefore: i === 0 ? 0 : gap,
        kind: b.kind,
      }));
      await applyTimetableTemplate(orgId, { days, periods, startTime: firstBell,
        // @ts-expect-error — backend ignores unknown keys; we stash extras
        // so the editor can reload them.
        ramadan, ramadanLen, published: true,
      } as any);
      await updateOrganization(orgId, {
        school_year: {
          schoolDays: days,
          holidays: holidays.map((h) => ({ name: h.name, startDate: h.startDate, endDate: h.endDate, type: h.type, moon: h.moon } as any)),
        } as any,
      });
      setPublished(true); setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────
  const cardBase: React.CSSProperties = {
    background: "#FFFFFF", border: "1px solid #E8EBF2", borderRadius: 16,
    padding: 24, display: "flex", flexDirection: "column", gap: 18,
  };
  const sectionTitle: React.CSSProperties = { font: "700 16px/1.3 'Inter', system-ui, sans-serif", color: "#111827", margin: 0 };
  const sectionSub: React.CSSProperties = { font: "400 13.5px/1.55 'Inter', system-ui, sans-serif", color: "#5B6472", margin: 0 };
  const fontI = "'Inter', system-ui, sans-serif";

  function Stepper({ value, label, onInc, onDec, color = "#4F46E5", focusRing = "#C7CDF6" }: { value: string; label: string; onInc: () => void; onDec: () => void; color?: string; focusRing?: string }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ font: `600 12.5px/1 ${fontI}`, color: "#3B4252" }}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", background: "#FFFFFF", border: "1px solid #D9DEE8", borderRadius: 10, overflow: "hidden" }}>
          <button type="button" onClick={onDec}
                  style={{ cursor: "pointer", border: "none", background: "transparent", font: `700 16px/1 ${fontI}`, color, padding: "9px 13px" }}
                  aria-label={`Decrease ${label}`}>−</button>
          <span style={{ font: `600 14px/1 ${fontI}`, color: "#1F2430", padding: "0 6px", minWidth: 58, textAlign: "center" }}>{value}</span>
          <button type="button" onClick={onInc}
                  style={{ cursor: "pointer", border: "none", background: "transparent", font: `700 16px/1 ${fontI}`, color, padding: "9px 13px" }}
                  aria-label={`Increase ${label}`}>+</button>
        </span>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: fontI, color: "#1F2430" }}>
      {/* Inter font for the redesign — local @import is OK since this
          page is leaf-level and won't be SSR'd. */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
        <h1 style={{ font: `800 26px/1.2 ${fontI}`, color: "#111827", margin: 0 }}>School schedule</h1>
        <p style={{ font: `400 14.5px/1.6 ${fontI}`, color: "#5B6472", margin: 0, maxWidth: "70ch" }}>
          Set the school week, build the standard day once, and mark the year's holidays. Period 1 is Period 1 for every grade and section — define it here and it applies school-wide.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 24, alignItems: "start" }}>

        {/* ─── LEFT ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>

          {/* School week */}
          <section style={cardBase}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={sectionTitle}>1 · School week</h2>
              <p style={sectionSub}>Which days does school run? The day you build below repeats on each of these.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DAY_LABELS.map((label, i) => {
                const on = activeDays[i];
                return (
                  <button key={label} type="button" onClick={() => toggleDay(i)} aria-pressed={on}
                          style={{
                            cursor: "pointer", font: `600 13px/1 ${fontI}`, padding: "11px 18px", borderRadius: 10,
                            background: on ? "#4F46E5" : "#FFFFFF",
                            color: on ? "#FFFFFF" : "#8A93A3",
                            border: `1px solid ${on ? "#4F46E5" : "#D9DEE8"}`,
                          }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <p style={{ font: `500 13px/1.4 ${fontI}`, color: "#047857", margin: 0 }}>{weekSummary}</p>
          </section>

          {/* Day builder */}
          <section style={cardBase}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={sectionTitle}>2 · The school day</h2>
              <p style={sectionSub}>Build the day once — start time, period length, breaks and prayer. Times below are worked out for you.</p>
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", background: "#F7F8FB", border: "1px solid #EDF0F6", borderRadius: 12, padding: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, font: `600 12.5px/1 ${fontI}`, color: "#3B4252" }}>First bell
                <input type="time" value={firstBell}
                       onChange={(e) => { setFirstBell(e.target.value || "08:00"); markDirty(); }}
                       style={{ font: `500 14px/1.3 ${fontI}`, color: "#1F2430", background: "#FFFFFF", border: "1px solid #D9DEE8", borderRadius: 10, padding: "9px 12px" }} />
              </label>
              <Stepper label="Period length" value={`${periodLen} min`} onInc={() => changePeriodLen(5)} onDec={() => changePeriodLen(-5)} />
              <Stepper label="Gap between periods" value={`${gap} min`} onInc={() => changeGap(5)} onDec={() => changeGap(-5)} />
              <span style={{ font: `400 12.5px/1.5 ${fontI}`, color: "#8A93A3", flex: 1, minWidth: 160 }}>
                Changing period length updates every academic period. Breaks and prayer keep their own length.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {blocks.map((b, i) => {
                const meta = KIND_META[b.kind];
                const p = previewBlocks[i];
                return (
                  <div key={b.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    border: "1px solid #EDF0F6", background: meta.rowBg, borderRadius: 12,
                    padding: "10px 14px", flexWrap: "wrap",
                  }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button type="button" onClick={() => moveBlock(b.id, -1)} aria-label="Move up"
                              style={{ cursor: "pointer", border: "none", background: "transparent", color: "#8A93A3", font: `600 11px/1 ${fontI}`, padding: "2px 4px" }}>▲</button>
                      <button type="button" onClick={() => moveBlock(b.id, 1)} aria-label="Move down"
                              style={{ cursor: "pointer", border: "none", background: "transparent", color: "#8A93A3", font: `600 11px/1 ${fontI}`, padding: "2px 4px" }}>▼</button>
                    </span>
                    <span style={{
                      font: `600 11px/1 ${fontI}`, letterSpacing: "0.04em", textTransform: "uppercase",
                      color: meta.chipColor, background: meta.chipBg, borderRadius: 999,
                      padding: "6px 10px", minWidth: 64, textAlign: "center",
                    }}>{meta.label}</span>
                    <input type="text" value={b.name}
                           onChange={(e) => updateBlock(b.id, { name: e.target.value })} aria-label="Block name"
                           style={{ font: `600 14px/1.3 ${fontI}`, color: "#1F2430", background: "#FFFFFF", border: "1px solid #D9DEE8", borderRadius: 10, padding: "9px 12px", flex: 1, minWidth: 140 }} />
                    <span style={{ display: "inline-flex", alignItems: "center", background: "#FFFFFF", border: "1px solid #D9DEE8", borderRadius: 10, overflow: "hidden" }}>
                      <button type="button" onClick={() => updateBlock(b.id, { dur: Math.max(5, b.dur - 5) })} aria-label="Shorter"
                              style={{ cursor: "pointer", border: "none", background: "transparent", font: `700 15px/1 ${fontI}`, color: "#4F46E5", padding: "8px 11px" }}>−</button>
                      <span style={{ font: `600 13px/1 ${fontI}`, color: "#1F2430", minWidth: 52, textAlign: "center" }}>{b.dur} min</span>
                      <button type="button" onClick={() => updateBlock(b.id, { dur: Math.min(120, b.dur + 5) })} aria-label="Longer"
                              style={{ cursor: "pointer", border: "none", background: "transparent", font: `700 15px/1 ${fontI}`, color: "#4F46E5", padding: "8px 11px" }}>+</button>
                    </span>
                    <span style={{ font: `600 13.5px/1 ${fontI}`, color: "#5B6472", fontVariantNumeric: "tabular-nums", minWidth: 128, textAlign: "end" }}>
                      {fmtShort(p.start)} – {fmt(p.end)}
                    </span>
                    <button type="button" onClick={() => removeBlock(b.id)} aria-label="Remove block"
                            style={{ cursor: "pointer", border: "none", background: "transparent", color: "#C2491D", font: `600 16px/1 ${fontI}`, padding: "6px 8px", borderRadius: 8 }}>✕</button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => addBlock("academic")}
                      style={{ cursor: "pointer", font: `600 13px/1 ${fontI}`, color: "#4F46E5", background: "#EEF0FE", border: "1px dashed #A9B2F0", borderRadius: 10, padding: "11px 16px" }}>+ Period</button>
              <button type="button" onClick={() => addBlock("break")}
                      style={{ cursor: "pointer", font: `600 13px/1 ${fontI}`, color: "#5B6472", background: "#F1F3F7", border: "1px dashed #C6CCD8", borderRadius: 10, padding: "11px 16px" }}>+ Break</button>
              <button type="button" onClick={() => addBlock("prayer")}
                      style={{ cursor: "pointer", font: `600 13px/1 ${fontI}`, color: "#047857", background: "#E7F8F0", border: "1px dashed #8FD4B6", borderRadius: 10, padding: "11px 16px" }}>+ Prayer</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderTop: "1px solid #EDF0F6", paddingTop: 16 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", font: `600 14px/1.3 ${fontI}`, color: "#1F2430" }}>
                <input type="checkbox" checked={ramadan}
                       onChange={(e) => { setRamadan(e.target.checked); markDirty(); }}
                       style={{ width: 18, height: 18, accentColor: "#047857" }} />
                Ramadan timings
              </label>
              <Stepper label=" " value={`${ramadanLen} min`}
                       onInc={() => { setRamadanLen(Math.min(45, ramadanLen + 5)); markDirty(); }}
                       onDec={() => { setRamadanLen(Math.max(20, ramadanLen - 5)); markDirty(); }}
                       color="#047857" focusRing="#8FD4B6" />
              <span style={{ font: `400 13px/1.5 ${fontI}`, color: "#5B6472" }}>
                {ramadan
                  ? `During Ramadan, academic periods shorten and school ends at ${fmt(ramadanEnd)}.`
                  : "When enabled, academic periods shorten for the month — holidays and Eid dates stay as set below."}
              </span>
            </div>
          </section>

          {/* Holidays */}
          <section style={cardBase}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h2 style={sectionTitle}>3 · Holidays &amp; vacations</h2>
                <p style={sectionSub}>No classes are scheduled on these dates. Eid dates can be adjusted once the moon is sighted.</p>
              </div>
              <span style={{ font: `600 13px/1 ${fontI}`, color: "#4F46E5", background: "#EEF0FE", borderRadius: 999, padding: "8px 14px", whiteSpace: "nowrap" }}>
                {totalOff} {totalOff === 1 ? "day" : "days"} off this year
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedHolidays.length === 0 ? (
                <div style={{ font: `400 13px/1.5 ${fontI}`, color: "#8A93A3", border: "1px dashed #D9DEE8", borderRadius: 12, padding: "16px", textAlign: "center" }}>
                  No holidays yet — add some below.
                </div>
              ) : sortedHolidays.map((hol) => {
                const meta = TYPE_META[hol.type];
                const n = daysBetween(hol.startDate, hol.endDate);
                const range = n === 1 ? fmtDate(hol.startDate) : `${fmtDate(hol.startDate)} – ${fmtDate(hol.endDate)}`;
                return (
                  <div key={hol.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid #EDF0F6", borderRadius: 12, padding: "12px 16px", flexWrap: "wrap" }}>
                    <span style={{
                      font: `600 11px/1 ${fontI}`, letterSpacing: "0.04em", textTransform: "uppercase",
                      color: meta.chipColor, background: meta.chipBg, borderRadius: 999,
                      padding: "6px 10px", minWidth: 62, textAlign: "center",
                    }}>{meta.label}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 180 }}>
                      <span style={{ font: `600 14.5px/1.3 ${fontI}`, color: "#1F2430" }}>{hol.name}</span>
                      {hol.moon && <span style={{ font: `400 12.5px/1.3 ${fontI}`, color: "#8A93A3" }}>Subject to moon sighting — adjust nearer the time</span>}
                    </span>
                    <span style={{ font: `500 13.5px/1.3 ${fontI}`, color: "#5B6472", fontVariantNumeric: "tabular-nums" }}>{range}</span>
                    <span style={{ font: `600 12.5px/1 ${fontI}`, color: "#4F46E5", minWidth: 56, textAlign: "end" }}>{n} {n === 1 ? "day" : "days"}</span>
                    <button type="button" onClick={() => removeHoliday(hol.id)} aria-label="Remove holiday"
                            style={{ cursor: "pointer", border: "none", background: "transparent", color: "#C2491D", font: `600 16px/1 ${fontI}`, padding: "6px 8px", borderRadius: 8 }}>✕</button>
                  </div>
                );
              })}
            </div>

            {availablePresets.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ font: `600 12.5px/1 ${fontI}`, color: "#8A93A3" }}>Quick add:</span>
                {availablePresets.map((preset) => (
                  <button key={preset.label} type="button" onClick={() => addPresetHoliday(preset)}
                          style={{ cursor: "pointer", font: `600 12.5px/1 ${fontI}`, color: "#3B4252", background: "#F7F8FB", border: "1px solid #D9DEE8", borderRadius: 999, padding: "8px 14px" }}>
                    + {preset.label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={addHolidayFromForm} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: "#F7F8FB", border: "1px solid #EDF0F6", borderRadius: 12, padding: 16 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, font: `600 12.5px/1 ${fontI}`, color: "#3B4252", flex: 1, minWidth: 160 }}>Holiday name
                <input type="text" required value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. Sports day"
                       style={{ font: `500 14px/1.3 ${fontI}`, color: "#1F2430", background: "#FFFFFF", border: "1px solid #D9DEE8", borderRadius: 10, padding: "9px 12px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, font: `600 12.5px/1 ${fontI}`, color: "#3B4252" }}>From
                <input type="date" required value={hStart} onChange={(e) => setHStart(e.target.value)}
                       style={{ font: `500 14px/1.3 ${fontI}`, color: "#1F2430", background: "#FFFFFF", border: "1px solid #D9DEE8", borderRadius: 10, padding: "9px 12px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, font: `600 12.5px/1 ${fontI}`, color: "#3B4252" }}>To (optional)
                <input type="date" value={hEnd} onChange={(e) => setHEnd(e.target.value)}
                       style={{ font: `500 14px/1.3 ${fontI}`, color: "#1F2430", background: "#FFFFFF", border: "1px solid #D9DEE8", borderRadius: 10, padding: "9px 12px" }} />
              </label>
              <button type="submit"
                      style={{ cursor: "pointer", background: "#059669", color: "#FFFFFF", border: "none", font: `700 13.5px/1 ${fontI}`, padding: "12px 20px", borderRadius: 10 }}>
                Add holiday
              </button>
            </form>
          </section>
        </div>

        {/* ─── RIGHT RAIL ─── */}
        <aside style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #E8EBF2", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={{ font: `700 15px/1.3 ${fontI}`, color: "#111827", margin: 0 }}>Every school day</h2>
              <span style={{ font: `500 12.5px/1.4 ${fontI}`, color: "#8A93A3" }}>
                {activeCount > 0 ? `Repeats every ${activeCount === 5 && activeDays[0] && activeDays[4] && !activeDays[5] && !activeDays[6] ? "Mon–Fri" : activeLabels.join(", ")}` : "Pick school days above"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {previewBlocks.map((b) => {
                const meta = KIND_META[b.kind];
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ font: `600 12px/1.3 ${fontI}`, color: "#8A93A3", fontVariantNumeric: "tabular-nums", minWidth: 58 }}>{fmtShort(b.start)}</span>
                    <span style={{ width: 4, borderRadius: 2, background: meta.bar, alignSelf: "stretch", minHeight: 34 }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ font: `600 13.5px/1.3 ${fontI}`, color: "#1F2430" }}>{b.name}</span>
                      <span style={{ font: `400 12px/1.3 ${fontI}`, color: "#8A93A3" }}>{b.dur} min</span>
                    </span>
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ font: `600 12px/1.3 ${fontI}`, color: "#8A93A3", fontVariantNumeric: "tabular-nums", minWidth: 58 }}>{fmtShort(dayEnd)}</span>
                <span style={{ width: 4, alignSelf: "stretch" }} />
                <span style={{ font: `600 13.5px/1.3 ${fontI}`, color: "#047857" }}>Home time</span>
              </div>
            </div>
            <div style={{ borderTop: "1px solid #EDF0F6", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ font: `600 13px/1.4 ${fontI}`, color: "#1F2430" }}>
                First bell {fmt(dayStart)} · home at {fmt(dayEnd)} · {lenLabel}
              </span>
              <span style={{ font: `400 12.5px/1.5 ${fontI}`, color: "#5B6472" }}>
                Same times for every grade and section — Period 1 means the same thing across the whole school.
              </span>
            </div>
          </div>

          <div style={{ background: "#FFFFFF", border: "1px solid #E8EBF2", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ font: `400 13px/1.55 ${fontI}`, color: "#5B6472" }}>
              Publishing creates <strong style={{ color: "#1F2430" }}>{slotCount} weekly slots</strong> ({blocks.length} blocks × {activeCount} days). Sections and Hifz groups then fill in their own subject + teacher per slot.
            </span>
            <button type="button" onClick={publish} disabled={publishing || activeCount === 0 || blocks.length === 0}
                    style={{
                      cursor: publishing ? "wait" : "pointer",
                      background: "#059669", color: "#FFFFFF", border: "none",
                      font: `700 14.5px/1 ${fontI}`, padding: "14px 20px", borderRadius: 12,
                      opacity: activeCount === 0 || blocks.length === 0 ? 0.5 : 1,
                    }}>
              {publishing ? "Publishing…" : (published && !dirty ? "Published ✓" : "Publish timetable")}
            </button>
            {published && !dirty && (
              <span style={{ font: `500 12.5px/1.5 ${fontI}`, color: "#047857" }}>
                Skeleton published — sections and Hifz groups can now fill in subjects and teachers.
              </span>
            )}
            {dirty && published && (
              <span style={{ font: `500 12.5px/1.5 ${fontI}`, color: "#92600A" }}>
                Unsaved changes — republish to apply.
              </span>
            )}
            {error && <span style={{ font: `500 12.5px/1.5 ${fontI}`, color: "#C2491D" }}>{error}</span>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default TimetableWeekTemplate;
