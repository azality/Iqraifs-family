// The tour must show once and never again. It was showing on every
// login because the only path that recorded it was a clean FINISHED,
// and the principal tour's last step targets the setup checklist —
// which stops rendering once a school is set up.

import { describe, it, expect } from "vitest";
import { TOURS, stepsForRole } from "./tours";

const ALL = () => true;
const NONE = () => false;

describe("stepsForRole", () => {
  it("keeps every step when all targets are on the page", () => {
    expect(stepsForRole("principal", ALL)).toHaveLength(TOURS.principal.length);
  });

  it("drops a step whose target is gone — the setup checklist", () => {
    const steps = stepsForRole(
      "principal",
      (sel) => sel !== '[data-tour="setup-checklist"]',
    );
    expect(steps).toHaveLength(TOURS.principal.length - 1);
    expect(steps.some((s) => s.target === '[data-tour="setup-checklist"]')).toBe(false);
  });

  it("keeps the welcome step, which targets body and is always mountable", () => {
    const steps = stepsForRole("principal", (sel) => sel !== '[data-tour="kpi-grid"]');
    expect(steps[0].target).toBe("body");
  });

  it("falls back to the full set rather than showing a lone welcome card", () => {
    // Nothing mounted: a one-step "tour" explains nothing, so show the
    // real thing and let Joyride warn about what it cannot find.
    expect(stepsForRole("principal", NONE)).toHaveLength(TOURS.principal.length);
  });

  it("every role's tour survives the filter with something to say", () => {
    for (const role of Object.keys(TOURS) as Array<keyof typeof TOURS>) {
      expect(stepsForRole(role, ALL).length).toBeGreaterThan(0);
      expect(stepsForRole(role, NONE).length).toBeGreaterThan(0);
    }
  });
});

describe("tour copy", () => {
  it("names no school — this text is shown to every school", () => {
    const text = JSON.stringify(TOURS);
    expect(text).not.toContain("Iqra");
  });
});
