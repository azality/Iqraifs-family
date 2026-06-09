// School module — Fee plan templates (PR feat/fee-plans).
//
// Layer ABOVE fee_status — defines the "Grade 3: 8000 PKR tuition,
// monthly" template that bulk billing (later PR) will use to generate
// fee_status rows in one shot.
//
// Two tables:
//   class_fee_plan       — admin defines per class
//   student_fee_override — per-student exception (scholarship, sibling
//                          discount, full waiver)
//
// Endpoints:
//   GET    /school/orgs/:orgId/classes/:classId/fee-plans
//   POST   /school/orgs/:orgId/classes/:classId/fee-plans
//   PATCH  /school/orgs/:orgId/fee-plans/:planId
//   DELETE /school/orgs/:orgId/fee-plans/:planId           (soft archive)
//
//   GET    /school/orgs/:orgId/students/:studentId/fee-overrides
//          → returns effective plans for this student (inherited from
//            class) with override info merged in. One row per active plan.
//   PUT    /school/orgs/:orgId/students/:studentId/fee-overrides/:planId
//          → upserts an override (override_amount, waived, notes)
//   DELETE /school/orgs/:orgId/students/:studentId/fee-overrides/:planId
//          → removes an override (student reverts to class default)
//
// Read endpoints accept any org role; writes require admin/principal
// OR financial_staff.

import type { Hono } from "npm:hono";
import { serviceRoleClient, getAuthUserId } from "./middleware.tsx";

async function hasAnyOrgRole(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}
async function canManageFees(userId: string, orgId: string): Promise<boolean> {
  const { data } = await serviceRoleClient
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("scope_type", "organization")
    .eq("scope_id", orgId)
    .is("revoked_at", null);
  return (data ?? []).some((r: any) =>
    r.role_type === "principal" || r.role_type === "admin" || r.role_type === "financial_staff",
  );
}

function planToJson(r: any) {
  return {
    id: r.id,
    orgId: r.org_id,
    classId: r.class_id,
    name: r.name,
    amount: Number(r.amount),
    frequency: r.frequency as "monthly" | "one_off",
    defaultDueDay: r.default_due_day,
    oneOffDueDate: r.one_off_due_date,
    archivedAt: r.archived_at,
  };
}
function overrideToJson(r: any) {
  return {
    id: r.id,
    planId: r.class_fee_plan_id,
    studentId: r.student_id,
    overrideAmount: r.override_amount !== null ? Number(r.override_amount) : null,
    waived: r.waived,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export function installFeePlans(school: Hono): void {
  // ─── Class fee plans CRUD ───────────────────────────────────────────
  school.get("/orgs/:orgId/classes/:classId/fee-plans", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const classId = c.req.param("classId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    // Validate the class lives in this org so we don't accidentally
    // leak another org's plan list.
    const { data: cls } = await serviceRoleClient
      .from("class").select("org_id").eq("id", classId).maybeSingle();
    if (!cls || (cls as any).org_id !== orgId) {
      return c.json({ error: "class not in this org" }, 404);
    }
    const { data, error } = await serviceRoleClient
      .from("class_fee_plan")
      .select("*")
      .eq("class_id", classId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ plans: (data ?? []).map(planToJson) });
  });

  school.post("/orgs/:orgId/classes/:classId/fee-plans", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const classId = c.req.param("classId");
    if (!(await canManageFees(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: cls } = await serviceRoleClient
      .from("class").select("org_id").eq("id", classId).maybeSingle();
    if (!cls || (cls as any).org_id !== orgId) {
      return c.json({ error: "class not in this org" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const amount = Number(body.amount);
    const frequency = body.frequency === "one_off" ? "one_off" : "monthly";
    if (!name) return c.json({ error: "name required" }, 400);
    if (!Number.isFinite(amount) || amount < 0) {
      return c.json({ error: "amount must be a non-negative number" }, 400);
    }
    let default_due_day: number | null = null;
    let one_off_due_date: string | null = null;
    if (frequency === "monthly") {
      const d = body.defaultDueDay !== undefined ? Number(body.defaultDueDay) : null;
      if (d !== null) {
        if (!Number.isInteger(d) || d < 1 || d > 28) {
          return c.json({ error: "defaultDueDay must be 1..28" }, 400);
        }
        default_due_day = d;
      }
    } else {
      const dt = body.oneOffDueDate ? String(body.oneOffDueDate) : null;
      if (dt && !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
        return c.json({ error: "oneOffDueDate must be YYYY-MM-DD" }, 400);
      }
      one_off_due_date = dt;
    }
    const { data, error } = await serviceRoleClient
      .from("class_fee_plan")
      .insert({
        org_id: orgId,
        class_id: classId,
        name,
        amount,
        frequency,
        default_due_day,
        one_off_due_date,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ plan: planToJson(data) }, 201);
  });

  school.patch("/orgs/:orgId/fee-plans/:planId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const planId = c.req.param("planId");
    if (!(await canManageFees(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: existing } = await serviceRoleClient
      .from("class_fee_plan").select("org_id, frequency").eq("id", planId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "plan not found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if ("name" in body) {
      const n = String(body.name ?? "").trim();
      if (!n) return c.json({ error: "name cannot be empty" }, 400);
      patch.name = n;
    }
    if ("amount" in body) {
      const a = Number(body.amount);
      if (!Number.isFinite(a) || a < 0) return c.json({ error: "amount invalid" }, 400);
      patch.amount = a;
    }
    if ("defaultDueDay" in body) {
      const d = body.defaultDueDay === null ? null : Number(body.defaultDueDay);
      if (d !== null && (!Number.isInteger(d) || d < 1 || d > 28)) {
        return c.json({ error: "defaultDueDay must be 1..28" }, 400);
      }
      patch.default_due_day = d;
    }
    if ("oneOffDueDate" in body) {
      const dt = body.oneOffDueDate;
      if (dt && !/^\d{4}-\d{2}-\d{2}$/.test(String(dt))) {
        return c.json({ error: "oneOffDueDate invalid" }, 400);
      }
      patch.one_off_due_date = dt ?? null;
    }
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
    const { data, error } = await serviceRoleClient
      .from("class_fee_plan").update(patch).eq("id", planId).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ plan: planToJson(data) });
  });

  school.delete("/orgs/:orgId/fee-plans/:planId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const planId = c.req.param("planId");
    if (!(await canManageFees(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: existing } = await serviceRoleClient
      .from("class_fee_plan").select("org_id").eq("id", planId).maybeSingle();
    if (!existing || (existing as any).org_id !== orgId) {
      return c.json({ error: "plan not found" }, 404);
    }
    // Soft archive — overrides reference plans via cascade, but
    // historical fee_status rows generated from this plan don't, so
    // soft-archive lets the archive coexist with paid history.
    const { error } = await serviceRoleClient
      .from("class_fee_plan")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", planId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Student effective plans + overrides ────────────────────────────
  // Returns one row per active class plan for the student's section's
  // class, with override (if any) merged in. effectiveAmount accounts
  // for waiver/override:
  //   - waived       → 0
  //   - has override → override_amount
  //   - else         → plan.amount
  school.get("/orgs/:orgId/students/:studentId/fee-overrides", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    if (!(await hasAnyOrgRole(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { data: stu } = await serviceRoleClient
      .from("student")
      .select("org_id, class_section:class_section_id(class_id)")
      .eq("id", studentId)
      .maybeSingle();
    if (!stu || (stu as any).org_id !== orgId) {
      return c.json({ error: "student not found" }, 404);
    }
    const classId = (stu as any).class_section?.class_id;
    if (!classId) {
      // Student not in a class yet — no plans, no overrides.
      return c.json({ plans: [] });
    }
    const { data: plans } = await serviceRoleClient
      .from("class_fee_plan")
      .select("*")
      .eq("class_id", classId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    const planIds = ((plans ?? []) as any[]).map((p) => p.id);
    const { data: overrides } = planIds.length
      ? await serviceRoleClient
          .from("student_fee_override")
          .select("*")
          .eq("student_id", studentId)
          .in("class_fee_plan_id", planIds)
      : { data: [] as any[] };
    const overrideMap = new Map<string, any>();
    for (const o of (overrides ?? []) as any[]) overrideMap.set(o.class_fee_plan_id, o);

    const out = ((plans ?? []) as any[]).map((p) => {
      const o = overrideMap.get(p.id);
      const planJson = planToJson(p);
      const overrideJson = o ? overrideToJson(o) : null;
      const effective =
        o?.waived ? 0
        : o?.override_amount !== null && o?.override_amount !== undefined ? Number(o.override_amount)
        : Number(p.amount);
      return { plan: planJson, override: overrideJson, effectiveAmount: effective };
    });
    return c.json({ plans: out });
  });

  school.put("/orgs/:orgId/students/:studentId/fee-overrides/:planId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const planId = c.req.param("planId");
    if (!(await canManageFees(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    // Validate student + plan both live in this org.
    const { data: stu } = await serviceRoleClient
      .from("student").select("org_id").eq("id", studentId).maybeSingle();
    if (!stu || (stu as any).org_id !== orgId) return c.json({ error: "student not found" }, 404);
    const { data: plan } = await serviceRoleClient
      .from("class_fee_plan").select("org_id").eq("id", planId).maybeSingle();
    if (!plan || (plan as any).org_id !== orgId) return c.json({ error: "plan not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const waived = body.waived === true;
    let override_amount: number | null = null;
    if (!waived && body.overrideAmount !== undefined && body.overrideAmount !== null) {
      const n = Number(body.overrideAmount);
      if (!Number.isFinite(n) || n < 0) return c.json({ error: "overrideAmount invalid" }, 400);
      override_amount = n;
    }
    const notes = body.notes ? String(body.notes).slice(0, 500) : null;

    // Upsert via delete-then-insert keeps the audit notes clean (the
    // UNIQUE (student, plan) constraint blocks plain insert if a row
    // already exists, and PostgREST upsert without a returning clause
    // gets noisy).
    await serviceRoleClient
      .from("student_fee_override")
      .delete()
      .eq("student_id", studentId)
      .eq("class_fee_plan_id", planId);
    const { data, error } = await serviceRoleClient
      .from("student_fee_override")
      .insert({
        org_id: orgId,
        student_id: studentId,
        class_fee_plan_id: planId,
        override_amount,
        waived,
        notes,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ override: overrideToJson(data) });
  });

  school.delete("/orgs/:orgId/students/:studentId/fee-overrides/:planId", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    const studentId = c.req.param("studentId");
    const planId = c.req.param("planId");
    if (!(await canManageFees(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const { error } = await serviceRoleClient
      .from("student_fee_override")
      .delete()
      .eq("student_id", studentId)
      .eq("class_fee_plan_id", planId)
      .eq("org_id", orgId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });

  // ─── Bulk fee generation (PR feat/bulk-fee-billing) ─────────────────
  //
  // POST /school/orgs/:orgId/fees/bulk-generate
  // body: { period: "2026-09", classIds?: string[], dryRun?: boolean }
  //
  // For each class with active monthly fee plans:
  //   - walk every student in the class's sections
  //   - resolve effective amount per plan (override → plan default)
  //   - skip waived overrides (effectiveAmount = 0)
  //   - upsert fee_status (org_id, student_id, period) — UNIQUE
  //     constraint means re-running is idempotent
  //
  // Returns { created, updated, skipped, waived, total } so the admin
  // sees exactly what happened. dryRun: true computes the same plan
  // without writing — useful for "preview before billing" UX.
  //
  // One-off (non-monthly) plans are NOT swept here; they're per-student
  // and billed via the plan's oneOffDueDate at admission time. Future
  // PR can extend if there's demand.
  school.post("/orgs/:orgId/fees/bulk-generate", async (c) => {
    const userId = getAuthUserId(c);
    const orgId = c.req.param("orgId");
    if (!(await canManageFees(userId, orgId))) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const period = String(body.period ?? "").trim();
    const dryRun = body.dryRun === true;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return c.json({ error: "period must be YYYY-MM" }, 400);
    }
    const classIds: string[] | null = Array.isArray(body.classIds) && body.classIds.length > 0
      ? body.classIds.map((x: any) => String(x))
      : null;

    // 1. Pull monthly plans (optionally scoped to classes the admin chose).
    let planQ = serviceRoleClient
      .from("class_fee_plan")
      .select("id, class_id, name, amount, default_due_day")
      .eq("org_id", orgId)
      .eq("frequency", "monthly")
      .is("archived_at", null);
    if (classIds) planQ = planQ.in("class_id", classIds);
    const { data: plans, error: planErr } = await planQ;
    if (planErr) return c.json({ error: planErr.message }, 500);
    if (!plans || plans.length === 0) {
      return c.json({ created: 0, updated: 0, skipped: 0, waived: 0, total: 0, message: "No monthly plans found." });
    }

    // 2. Index plans by class for downstream walks.
    const plansByClass = new Map<string, any[]>();
    for (const p of plans as any[]) {
      const arr = plansByClass.get(p.class_id) ?? [];
      arr.push(p);
      plansByClass.set(p.class_id, arr);
    }
    const classIdsTouched = Array.from(plansByClass.keys());

    // 3. Pull students for every class — via their class_sections.
    const { data: sections } = await serviceRoleClient
      .from("class_section")
      .select("id, class_id")
      .in("class_id", classIdsTouched);
    const sectionIds = ((sections ?? []) as any[]).map((s) => s.id);
    const sectionToClass = new Map<string, string>();
    for (const s of ((sections ?? []) as any[])) sectionToClass.set(s.id, s.class_id);

    const { data: students } = sectionIds.length
      ? await serviceRoleClient
          .from("student")
          .select("id, class_section_id")
          .in("class_section_id", sectionIds)
      : { data: [] as any[] };

    // 4. Pull all existing overrides for the plans in one shot.
    const planIds = (plans as any[]).map((p) => p.id);
    const { data: overrides } = planIds.length
      ? await serviceRoleClient
          .from("student_fee_override")
          .select("student_id, class_fee_plan_id, override_amount, waived")
          .eq("org_id", orgId)
          .in("class_fee_plan_id", planIds)
      : { data: [] as any[] };
    const overrideByKey = new Map<string, any>();
    for (const o of ((overrides ?? []) as any[])) {
      overrideByKey.set(`${o.student_id}:${o.class_fee_plan_id}`, o);
    }

    // 5. Walk students × plans, compute effective amounts, queue upserts.
    type Row = {
      org_id: string;
      student_id: string;
      period: string;
      amount_due: number;
      amount_paid: number;
      status: string;
      due_date: string;
      recorded_by: string;
      notes: string;
    };
    const rows: Row[] = [];
    let waived = 0;
    const dueDateFor = (defaultDueDay: number | null): string => {
      const day = defaultDueDay && defaultDueDay >= 1 && defaultDueDay <= 28
        ? defaultDueDay : 5;
      return `${period}-${String(day).padStart(2, "0")}`;
    };

    for (const stu of ((students ?? []) as any[])) {
      const classId = sectionToClass.get(stu.class_section_id);
      if (!classId) continue;
      const studentPlans = plansByClass.get(classId) ?? [];
      // Sum across plans for this student. We collapse into ONE fee_status
      // row per (student, period) since the table has UNIQUE (student, period).
      // The notes column carries the breakdown for receipt rendering.
      let total = 0;
      const breakdown: string[] = [];
      let earliestDue: string | null = null;
      for (const plan of studentPlans) {
        const ov = overrideByKey.get(`${stu.id}:${plan.id}`);
        if (ov?.waived) {
          waived++;
          continue;
        }
        const amt = ov?.override_amount !== null && ov?.override_amount !== undefined
          ? Number(ov.override_amount)
          : Number(plan.amount);
        total += amt;
        breakdown.push(`${plan.name}: ${amt}`);
        const due = dueDateFor(plan.default_due_day);
        if (!earliestDue || due < earliestDue) earliestDue = due;
      }
      if (total <= 0 || !earliestDue) continue;
      rows.push({
        org_id: orgId,
        student_id: stu.id,
        period,
        amount_due: total,
        amount_paid: 0,
        status: "unpaid",
        due_date: earliestDue,
        recorded_by: userId,
        notes: breakdown.join("; "),
      });
    }

    if (dryRun) {
      return c.json({
        created: rows.length,
        updated: 0,
        skipped: 0,
        waived,
        total: rows.length,
        dryRun: true,
        sample: rows.slice(0, 3),
      });
    }

    // 6. Check existing fee_status rows so we can split into created vs updated.
    const studentIdsToBill = rows.map((r) => r.student_id);
    const { data: existing } = studentIdsToBill.length
      ? await serviceRoleClient
          .from("fee_status")
          .select("student_id")
          .eq("org_id", orgId)
          .eq("period", period)
          .in("student_id", studentIdsToBill)
      : { data: [] as any[] };
    const existingSet = new Set(((existing ?? []) as any[]).map((r) => r.student_id));

    // 7. Upsert. fee_status has UNIQUE (student, period) so onConflict
    // updates amounts in place — if the admin runs Sept billing twice
    // after editing a plan, the second run reflects new totals without
    // doubling rows.
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      if (existingSet.has(r.student_id)) updated++;
      else created++;
    }
    const { error: upsertErr } = await serviceRoleClient
      .from("fee_status")
      .upsert(rows, { onConflict: "student_id,period" });
    if (upsertErr) return c.json({ error: upsertErr.message }, 500);

    return c.json({
      created,
      updated,
      skipped: 0,
      waived,
      total: rows.length,
    });
  });
}

export default installFeePlans;
