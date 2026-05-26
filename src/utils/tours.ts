// Guided first-run tour definitions and persistence helpers.
//
// Each role has a Joyride step array. Completion is persisted in localStorage
// under `fgs_tour_completed:<userId>` so the same browser shared by multiple
// users (common on shared school devices) doesn't suppress someone else's tour.

import type { Step } from "react-joyride";

const STORAGE_KEY = "fgs_tour_completed";

export type TourRole =
  | "principal"
  | "admin"
  | "class_teacher"
  | "visiting_teacher"
  | "financial_staff"
  | "office_staff"
  | "portal_student"
  | "portal_parent";

function readList(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(userId: string, arr: string[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(arr));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function hasCompletedTour(role: TourRole, userId: string): boolean {
  return readList(userId).includes(role);
}

export function markTourCompleted(role: TourRole, userId: string): void {
  const arr = readList(userId);
  if (!arr.includes(role)) {
    arr.push(role);
    writeList(userId, arr);
  }
}

export function resetTour(role: TourRole, userId: string): void {
  const arr = readList(userId).filter((r) => r !== role);
  writeList(userId, arr);
}

// ─── Step definitions ───────────────────────────────────────────────────
// Targets are CSS selectors that exist on the page where the tour fires.
// react-joyride tolerates missing targets (it warns and skips), so a stale
// step won't crash the page.

export const TOURS: Record<TourRole, Step[]> = {
  principal: [
    {
      target: "body",
      placement: "center",
      title: "Welcome to Iqra Family School",
      content:
        "You're set up as Principal. Let's take a 1-minute tour so you know where everything is.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="manage-toolbar"]',
      title: "Navigation toolbar",
      content:
        "These buttons take you to every area of your school: classes, students, parents, teachers, link codes, roster requests, permissions, settings, and announcements.",
    },
    {
      target: '[data-tour="kpi-grid"]',
      title: "Performance at a glance",
      content:
        "Daily snapshot of your school: students enrolled, today's attendance, behavior trends, pending approvals. This stays up to date automatically.",
    },
    {
      target: '[data-tour="alerts-row"]',
      title: "Alerts that matter to you",
      content:
        "As Principal you see org-wide rollups: how many sections are flagged, stale roster requests, etc. Class teachers see drill-down alerts for their own sections.",
    },
    {
      target: '[data-tour="leaderboard"]',
      title: "Class leaderboard",
      content: "Click any section to drill into its attendance / behavior / grades.",
    },
    {
      target: '[data-tour="setup-checklist"]',
      title: "Quick-start checklist",
      content:
        "Knock these out and your school is ready to operate. The list disappears once everything is done.",
    },
  ],
  admin: [
    {
      target: "body",
      placement: "center",
      title: "Welcome, Admin",
      content:
        "You can manage students, parents, teachers, and daily ops here. 1-minute tour incoming.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="manage-toolbar"]',
      title: "Your toolkit",
      content:
        "Classes, Students, Parents, Teachers, Link Codes, Roster Requests, Announcements — everything you need.",
    },
    {
      target: '[data-tour="kpi-grid"]',
      title: "School at a glance",
      content: "Live counts and trends.",
    },
    {
      target: '[data-tour="setup-checklist"]',
      title: "Get started",
      content: "Follow the checklist below to onboard your school.",
    },
  ],
  class_teacher: [
    {
      target: "body",
      placement: "center",
      title: "Welcome, Teacher",
      content: "You'll mostly work within your section. Quick tour:",
      disableBeacon: true,
    },
    {
      target: '[data-tour="manage-toolbar"]',
      title: "Jump to your section",
      content:
        "From Classes → Sections → your class section, you can take attendance, log behavior, post the day's sabaq, log Hifz progress, and grade assignments.",
    },
    {
      target: '[data-tour="leaderboard"]',
      title: "Your section",
      content:
        "Click your section to open daily ops. You also see alerts specific to your section in the alerts row above.",
    },
  ],
  visiting_teacher: [
    {
      target: "body",
      placement: "center",
      title: "Welcome, Visiting Teacher",
      content: "You can log lessons and observations for sections you teach. Quick tour:",
      disableBeacon: true,
    },
    {
      target: '[data-tour="manage-toolbar"]',
      title: "Your toolkit",
      content: "Open Classes to find a section, then post lessons and behavior notes.",
    },
  ],
  financial_staff: [
    {
      target: "body",
      placement: "center",
      title: "Welcome, Finance",
      content: "You manage fees. 30-second tour:",
      disableBeacon: true,
    },
    {
      target: '[data-tour="manage-toolbar"]',
      title: "Fees console",
      content:
        "Open Settings → Fees for the org-wide overview. From any student you can record paid/unpaid and attach a receipt URL.",
    },
  ],
  office_staff: [
    {
      target: "body",
      placement: "center",
      title: "Welcome, Office",
      content: "You can manage students and teachers. Quick tour:",
      disableBeacon: true,
    },
    {
      target: '[data-tour="manage-toolbar"]',
      title: "Manage data",
      content:
        "Use Students, Parents, and Teachers to add or edit records. CSV bulk upload is supported on each page.",
    },
  ],
  portal_student: [
    {
      target: "body",
      placement: "center",
      title: "Welcome!",
      content: "This is your student portal. Quick tour:",
      disableBeacon: true,
    },
    {
      target: '[data-tour="portal-nav"]',
      title: "Your tabs",
      content: "Dashboard, Lessons, Grades, Hifz, Attendance, Behavior, Announcements.",
    },
    {
      target: '[data-tour="portal-dashboard-tiles"]',
      title: "Your stats",
      content: "Attendance %, average grade, Hifz ayahs memorized, behavior score.",
    },
  ],
  portal_parent: [
    {
      target: "body",
      placement: "center",
      title: "Welcome!",
      content: "See your child's progress here. Quick tour:",
      disableBeacon: true,
    },
    {
      target: '[data-tour="portal-nav"]',
      title: "Your tabs",
      content: "Lessons, Grades, Hifz, Attendance, Behavior, Fees, Forms, and Announcements.",
    },
    {
      target: '[data-tour="portal-dashboard-tiles"]',
      title: "Today's snapshot",
      content: "Quick view of how your child is doing.",
    },
  ],
};

// ─── Role picker ────────────────────────────────────────────────────────
// Picks the most-specific tour for the current user. Principal trumps all.
// Other role_type strings (admin, class_teacher, ...) are scoped roles
// that may not exist in today's role_type union but are anticipated by
// the school-pilot RBAC roadmap; treat any unknown role_type as a no-op.

export function pickTourForUser(
  me: { roles: Array<{ role_type: string }> },
  isPrincipal: boolean,
): TourRole | null {
  if (isPrincipal) return "principal";
  const has = (rt: string) => me.roles.some((r) => r.role_type === rt);
  if (has("admin")) return "admin";
  if (has("class_teacher")) return "class_teacher";
  if (has("visiting_teacher")) return "visiting_teacher";
  if (has("financial_staff")) return "financial_staff";
  if (has("office_staff")) return "office_staff";
  return null;
}
