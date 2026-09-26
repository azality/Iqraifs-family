// =============================================================================
// Report cards browser — a class at a time, one click per card.
//
// Ambreen (27 Sep, voice note): to read the cards she was going People →
// student → profile → report card → pick the term → back, back, back →
// next student. "تو یہ صرف اس کو تھوڑا سا آسان کر دیں پلیز". This gives the
// office one page: pick the class, see every child with their card's
// state, open a card, and step child-to-child from inside the card.
//
//   GET /orgs/:orgId/report-cards-browser?termId=&sectionId=
//
// Without sectionId: the term picker's terms + every section with a head
// count. With sectionId: that section's children, ordered as the register
// is, each with hasMarks / finalizedAt / publishedAt so the list reads as
// a checklist of what is ready and what would print blank.
//
// Who sees it: the office sees every section; an incharge their wing —
// the same rule as the marking board. Teachers keep their own section
// pages; this browser is an office reading tool.
//
// Unlike the marking board, Hifz sections ARE listed: the board hides
// them because their marks live on their own paper, but their report
// cards exist and the office reads those too.
// =============================================================================

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";
import { hasAdminOrPrincipal, inchargeClassIds } from "./schoolAuth.ts";
import { classOrder } from "./markingProgress.ts";
import { resolveMarkingTerm } from "./schoolMarkingProgress.tsx";

export function installReportCardsBrowser(school: Hono): void {
  school.get("/orgs/:orgId/report-cards-browser", async (c) => {
    const userId = getAuthUserId(c);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const orgId = c.req.param("orgId");

    const isOffice = await hasAdminOrPrincipal(userId, orgId);
    let wingClassIds: string[] | null = null;
    if (!isOffice) {
      wingClassIds = await inchargeClassIds(userId, orgId);
      if (!wingClassIds.length) {
        return c.json({ error: "the report cards browser is for the office and incharges", code: "FORBIDDEN" }, 403);
      }
    }

    // Term: the one asked for, else the one being marked (NOT blindly the
    // current one — the school reads the 1st Assessment's cards while the
    // 2nd is already running).
    let termId = c.req.query("termId") ?? "";
    if (!termId) termId = (await resolveMarkingTerm(orgId))?.id ?? "";
    const { data: term } = await serviceRoleClient
      .from("academic_term").select("id, name, org_id")
      .eq("id", termId).maybeSingle();
    if (!term || (term as any).org_id !== orgId) {
      return c.json({ term: null, terms: [], sections: [] });
    }
    const { data: allTerms } = await serviceRoleClient
      .from("academic_term").select("id, name, is_current")
      .eq("org_id", orgId).is("archived_at", null)
      .order("start_date", { ascending: true });
    const termList = ((allTerms ?? []) as any[]).map((t) => ({
      id: t.id, name: t.name, isCurrent: !!t.is_current,
    }));

    // Sections in the caller's reach. Sandbox stays out; Hifz stays IN.
    let secQ = serviceRoleClient
      .from("class_section")
      .select("id, name, schedule_key, class:class_id(id, name, kind, org_id)");
    if (wingClassIds) secQ = secQ.in("class_id", wingClassIds);
    const { data: secRows } = await secQ;
    const sections = ((secRows ?? []) as any[])
      .filter((s) => s.class?.org_id === orgId && s.schedule_key !== "sandbox")
      .sort((a, b) =>
        classOrder(a.class.name) - classOrder(b.class.name) ||
        String(a.name).localeCompare(String(b.name)));

    const { data: stuRows } = await serviceRoleClient
      .from("student").select("id, full_name, gr_number, class_section_id")
      .in("class_section_id", sections.map((s) => s.id))
      .eq("status", "active");
    const bySec = new Map<string, any[]>();
    for (const r of ((stuRows ?? []) as any[])) {
      const arr = bySec.get(r.class_section_id) ?? [];
      arr.push(r);
      bySec.set(r.class_section_id, arr);
    }

    const sectionList = sections.map((s) => ({
      id: s.id,
      name: s.name,
      className: s.class.name,
      kind: s.class.kind ?? null,
      students: (bySec.get(s.id) ?? []).length,
    }));

    const sectionId = c.req.query("sectionId") ?? "";
    if (!sectionId) {
      return c.json({ term: { id: termId, name: (term as any).name }, terms: termList, sections: sectionList });
    }
    if (!sections.some((s) => s.id === sectionId)) {
      return c.json({ error: "section not found", code: "NOT_FOUND" }, 404);
    }

    // The section's children, register order (GR then name).
    const kids = (bySec.get(sectionId) ?? []).sort((a, b) =>
      String(a.gr_number ?? "").localeCompare(String(b.gr_number ?? ""), undefined, { numeric: true }) ||
      String(a.full_name).localeCompare(String(b.full_name)));
    const kidIds = kids.map((k) => k.id);

    // Card workflow state for the term.
    const finalized = new Map<string, string>();
    const published = new Map<string, string>();
    if (kidIds.length) {
      const { data: cards } = await serviceRoleClient
        .from("term_report_card")
        .select("student_id, finalized_at, published_at")
        .eq("term_id", termId).in("student_id", kidIds);
      for (const r of ((cards ?? []) as any[])) {
        if (r.finalized_at) finalized.set(r.student_id, r.finalized_at);
        if (r.published_at) published.set(r.student_id, r.published_at);
      }
    }

    // Who has ANY mark this term - a card with none would print blank.
    // Every exam of the term counts here, the Hifz papers included.
    const marked = new Set<string>();
    if (kidIds.length) {
      const { data: exams } = await serviceRoleClient
        .from("exam").select("id")
        .eq("term_id", termId).is("archived_at", null);
      const examIds = ((exams ?? []) as any[]).map((e) => e.id);
      if (examIds.length) {
        const { data: scores } = await serviceRoleClient
          .from("exam_subject_score")
          .select("student_id")
          .in("exam_id", examIds).in("student_id", kidIds)
          .not("obtained_marks", "is", null)
          .limit(10000);
        for (const r of ((scores ?? []) as any[])) marked.add(r.student_id);
      }
    }

    return c.json({
      term: { id: termId, name: (term as any).name },
      terms: termList,
      sections: sectionList,
      section: sectionList.find((s) => s.id === sectionId) ?? null,
      students: kids.map((k) => ({
        id: k.id,
        name: k.full_name,
        gr: k.gr_number,
        hasMarks: marked.has(k.id),
        finalizedAt: finalized.get(k.id) ?? null,
        publishedAt: published.get(k.id) ?? null,
      })),
    });
  });
}

export default installReportCardsBrowser;
