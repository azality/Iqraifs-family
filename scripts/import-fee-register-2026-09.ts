// One-off: reconcile fees with the school's own register (a "Student
// Data List" export from their old fee software, snapshot 7 Sep 2026,
// one .xls per class: Catch Up + Classes I-VI, 137 children).
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/import-fee-register-2026-09.ts --data <parsed.json> [--apply]
//
// The data file is the parsed sheets as JSON ({ "Class I": [{gr, name,
// arrears, fee, paymentLit, payment, balance}, ...], ... }) and is kept
// in the untracked fees/ folder - per-family money never goes in git.
//
// Sheet columns per child: Arrears (unpaid before Sep), Current Fee
// (September, negotiated per family), Payment (received, or "unpaid"),
// Balance (what the family still owes - the school's bottom line).
//
// What this writes:
//   - student_fee_override: updated where the sheet's fee differs.
//   - fee_status "2026-08": ONE carried-arrears row per child who owes
//     arrears (the register lumps all pre-Sep dues into one number, so
//     do we; the row's notes say so). Renders as a normal month chip.
//   - fee_status "2026-09": amount_due corrected to the sheet where it
//     differs.
//   - fee_payment: the money received, dated 7 Sep (the snapshot date -
//     actual receipt dates are not on the sheet), allocated OLDEST
//     FIRST (arrears row, then September). amount_paid/status caches
//     recomputed. A fee row that already has non-void payments is
//     SKIPPED with a warning, so re-running never double-records.
//
// Amount reconciliation (the sheets have a few hand-typos):
//   derivedPaid = arrears + fee - balance   (the school's bottom line)
//   - literal == derived: clean.
//   - literal > derived (overpayment, e.g. 6200 against 6000): record
//     the literal - money received is money received.
//   - literal within 100 below derived (e.g. 5240 vs 5250, balance 0):
//     record the derived and note the literal - the balance column is
//     the school's word that the month is settled.
//   - literal says "unpaid" but balance implies money arrived: DO NOT
//     invent a receipt - record nothing and flag for the office.
//
// Children with fee 0 and no arrears (free seats) are skipped: no
// voucher, nothing owed. Children on the roll but not on the sheet are
// WARNED, not fatal (admitted/transferred after 7 Sep - the office owes
// us their fee). A sheet row whose GR is not on the class roll is FATAL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const SNAPSHOT = "2026-09-07";
const ARREARS_PERIOD = "2026-08";
const SEP_PERIOD = "2026-09";
const NEXT_PERIOD = "2026-10";
const SOURCE_NOTE = "from the school's fee register (balance as of 7 Sep 2026)";
const APPLY = Deno.args.includes("--apply");

const dataIdx = Deno.args.indexOf("--data");
if (dataIdx < 0 || !Deno.args[dataIdx + 1]) {
  console.error("--data <parsed.json> is required");
  Deno.exit(1);
}
type Row = {
  gr: string; name: string; arrears: number; fee: number;
  paymentLit: string; payment: number; balance: number | null;
};
const SHEETS: Record<string, Row[]> = JSON.parse(
  await Deno.readTextFile(Deno.args[dataIdx + 1]),
);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

let fatal = 0;
const flags: string[] = [];
let stats = { arrearsRows: 0, payments: 0, dueFixed: 0, overrideFixed: 0, settled: 0, partial: 0, unpaidRows: 0 };

for (const [clsName, rows] of Object.entries(SHEETS)) {
  const { data: cls } = await db
    .from("class").select("id,name,class_section(id)")
    .eq("org_id", ORG).eq("name", clsName);
  if (!cls?.length) { console.error(`class not found: ${clsName}`); fatal++; continue; }
  const secIds = cls.flatMap((c: any) => c.class_section.map((s: any) => s.id));
  const { data: students } = await db
    .from("student").select("id,gr_number,full_name")
    .in("class_section_id", secIds).eq("status", "active");
  const byGr = new Map((students ?? []).map((s) => [String(s.gr_number), s]));
  const ids = (students ?? []).map((s) => s.id);

  const { data: plans } = await db
    .from("class_fee_plan").select("id,amount")
    .eq("class_id", (cls[0] as any).id).eq("frequency", "monthly").is("archived_at", null);
  const plan = (plans ?? [])[0];
  const { data: ovr } = await db
    .from("student_fee_override").select("id,student_id,override_amount,waived")
    .eq("org_id", ORG).in("student_id", ids.length ? ids : ["-"]);
  const ovrByStu = new Map((ovr ?? []).map((o) => [o.student_id, o]));
  const { data: fees } = await db
    .from("fee_status").select("id,student_id,period,amount_due,amount_paid,status")
    .in("student_id", ids.length ? ids : ["-"]);
  const feeByKey = new Map((fees ?? []).map((f) => [`${f.student_id}:${f.period}`, f]));

  console.log(`\n=== ${clsName}: ${rows.length} sheet rows, ${byGr.size} on roll`);
  const unseen = new Set(byGr.keys());

  for (const r of rows) {
    let s = byGr.get(r.gr);
    let movedFrom: string | null = null;
    if (!s) {
      // The sheets were written on 7 Sep and children have moved class
      // since (Hifz I -> Hifz IV, Catch Up -> Hifz I, 23 Sep). A fee
      // belongs to the CHILD, not to the sheet it was written on, so
      // resolve them org-wide and bill them where they sit now. Only a
      // GR that exists nowhere is fatal.
      const { data: elsewhere } = await db
        .from("student")
        .select("id,gr_number,full_name,class_section:class_section_id(class_id,class:class_id(name))")
        .eq("org_id", ORG).eq("gr_number", r.gr).eq("status", "active").maybeSingle();
      if (!elsewhere) {
        console.error(`  !! GR ${r.gr} ${r.name}: not on any active roll - REFUSING`);
        fatal++;
        continue;
      }
      s = elsewhere as any;
      movedFrom = (elsewhere as any).class_section?.class?.name ?? "?";
      flags.push(`${clsName} GR ${r.gr} ${s!.full_name}: on ${clsName}'s sheet but now in ${movedFrom} - billed where they sit now`);
      // Their vouchers and override live under the new class, so they
      // are not in this class's maps - load them for this one child.
      const { data: theirFees } = await db.from("fee_status")
        .select("id,student_id,period,amount_due,amount_paid,status").eq("student_id", s!.id);
      for (const f of theirFees ?? []) feeByKey.set(`${f.student_id}:${f.period}`, f);
      // A child who has moved keeps the override of the class they
      // left, so they have TWO - read the one on the class they are
      // billed under now (the same rule the fees page follows since
      // v1.3.5), never whichever row comes back first.
      const nowClassId = (elsewhere as any).class_section?.class_id ?? null;
      const { data: theirOvrs } = await db.from("student_fee_override")
        .select("id,student_id,override_amount,waived,plan:class_fee_plan_id(class_id)")
        .eq("student_id", s!.id);
      const mine = (theirOvrs ?? []).find((o: any) => o.plan?.class_id === nowClassId);
      if (mine) ovrByStu.set(s!.id, mine);
      const strays = (theirOvrs ?? []).length - (mine ? 1 : 0);
      if (strays > 0) {
        flags.push(`${clsName} GR ${r.gr} ${s!.full_name}: also carries ${strays} fee override${strays === 1 ? "" : "s"} from the class they left - dormant, left in place`);
      }
    }
    unseen.delete(r.gr);
    if (r.fee === 0 && r.arrears === 0) { console.log(`  ${r.gr} ${s.full_name}: free seat, skipped`); continue; }

    // ── settle what was actually paid ──
    const totalDue = r.arrears + r.fee;
    const balance = r.balance ?? Math.max(0, totalDue - r.payment);
    const derived = Math.max(0, totalDue - balance);
    const litUnpaid = /unpaid/i.test(r.paymentLit);
    let paid: number;
    if (litUnpaid && derived > 0) {
      paid = 0;
      flags.push(`${clsName} GR ${r.gr} ${s.full_name}: payment column says UNPAID but balance ${balance} implies ${derived} arrived - recorded NOTHING, ask the office which is right`);
    } else if (r.payment > derived) {
      paid = r.payment; // overpayment - money received is money received
      if (r.payment !== derived) {
        flags.push(
          `${clsName} GR ${r.gr} ${s.full_name}: Payment column says ${r.payment}, ` +
          `Balance column says ${balance} against ${totalDue} due (which implies ${derived} arrived) - ` +
          `recorded the ${r.payment} written as received; ask the office to confirm`,
        );
      }
    } else if (r.payment < derived && derived - r.payment <= 100) {
      paid = derived; // balance column is the school's word that it's settled
      flags.push(`${clsName} GR ${r.gr} ${s.full_name}: payment written ${r.payment}, balance says settled at ${derived} - recorded ${derived}`);
    } else if (r.payment < derived) {
      paid = r.payment;
      flags.push(`${clsName} GR ${r.gr} ${s.full_name}: payment ${r.payment} vs derived ${derived} disagree by ${derived - r.payment} - recorded the written payment, ask the office`);
    } else {
      paid = derived;
    }

    // oldest first: arrears row, then September
    const toArrears = Math.min(paid, r.arrears);
    const toSep = paid - toArrears;

    const acts: string[] = [];

    // ── override: the sheet's negotiated fee is the school's latest word ──
    const o = ovrByStu.get(s.id);
    const eff = o?.waived ? 0 : Number(o?.override_amount ?? plan?.amount ?? 0);
    if (eff !== r.fee && r.fee > 0) {
      acts.push(`override ${eff}->${r.fee}`);
      stats.overrideFixed++;
      if (APPLY) {
        if (o) {
          await db.from("student_fee_override").update({ override_amount: r.fee, waived: false }).eq("id", o.id);
        } else if (movedFrom) {
          // `plan` belongs to the sheet's class, which is not theirs any
          // more - never pin a fee to a class the child has left.
          flags.push(`${clsName} GR ${r.gr} ${s!.full_name}: moved to ${movedFrom} and has no fee override there - set their monthly fee (${r.fee}) on ${movedFrom}'s plan by hand`);
        } else if (plan) {
          await db.from("student_fee_override").insert({
            org_id: ORG, student_id: s.id, class_fee_plan_id: plan.id,
            override_amount: r.fee, notes: SOURCE_NOTE,
          });
        }
      }
    }

    // ── carried arrears row ──
    if (r.arrears > 0) {
      const key = `${s.id}:${ARREARS_PERIOD}`;
      const existing = feeByKey.get(key);
      if (existing) {
        flags.push(`${clsName} GR ${r.gr}: already has a ${ARREARS_PERIOD} row - left untouched`);
      } else {
        const status = toArrears >= r.arrears ? "paid" : toArrears > 0 ? "partial" : "unpaid";
        acts.push(`arrears ${r.arrears} (${status}${toArrears ? ` ${toArrears}` : ""})`);
        stats.arrearsRows++;
        if (APPLY) {
          const { data: ins, error } = await db.from("fee_status").insert({
            org_id: ORG, student_id: s.id, period: ARREARS_PERIOD,
            amount_due: r.arrears, amount_paid: toArrears, status,
            due_date: "2026-08-31", paid_date: toArrears >= r.arrears ? SNAPSHOT : null,
            notes: `Carried balance up to Aug 2026, ${SOURCE_NOTE}`,
          }).select("id").single();
          if (error) { console.error(`  write failed ${r.gr}: ${error.message}`); fatal++; continue; }
          if (toArrears > 0) {
            await db.from("fee_payment").insert({
              org_id: ORG, fee_status_id: ins.id, student_id: s.id,
              amount: toArrears, paid_on: SNAPSHOT, notes: SOURCE_NOTE,
            });
            stats.payments++;
          }
        }
      }
    }

    // ── September row ──
    if (r.fee > 0) {
      const sep = feeByKey.get(`${s.id}:${SEP_PERIOD}`);
      if (!sep) {
        flags.push(`${clsName} GR ${r.gr} ${s.full_name}: fee ${r.fee} but NO September voucher exists - generate it first`);
      } else {
        if (Number(sep.amount_due) !== r.fee) {
          acts.push(`Sep due ${sep.amount_due}->${r.fee}`);
          stats.dueFixed++;
          if (APPLY) await db.from("fee_status").update({ amount_due: r.fee }).eq("id", sep.id);
        }
        if (toSep > 0) {
          if (Number(sep.amount_paid ?? 0) > 0) {
            flags.push(`${clsName} GR ${r.gr}: September already has ${sep.amount_paid} recorded - payment NOT re-recorded`);
          } else {
            // Money over September's fee is an ADVANCE, not an
            // overpayment parked on a settled month. The office set
            // this rule for Abu Bakar's Rs 200 ("next month 5800"), so
            // the excess opens October carrying it. Anything past a
            // whole further month is left for the office to place.
            const onSep = Math.min(toSep, r.fee);
            const advance = Math.min(toSep - onSep, r.fee);
            const spare = toSep - onSep - advance;
            const status = onSep >= r.fee ? "paid" : "partial";
            acts.push(`Sep paid ${onSep} (${status})${advance > 0 ? ` | ${advance} advance -> Oct` : ""}`);
            stats.payments++;
            if (status === "paid") stats.settled++; else stats.partial++;
            if (advance > 0) {
              flags.push(`${clsName} GR ${r.gr} ${s.full_name}: paid ${toSep} against a ${r.fee} fee - ${advance} carried onto October as an advance${spare > 0 ? `, and ${spare} MORE is unplaced - tell me where it goes` : ""}`);
            }
            if (APPLY) {
              await db.from("fee_payment").insert({
                org_id: ORG, fee_status_id: sep.id, student_id: s.id,
                amount: onSep, paid_on: SNAPSHOT, notes: SOURCE_NOTE,
              });
              await db.from("fee_status").update({
                amount_paid: onSep, status,
                paid_date: status === "paid" ? SNAPSHOT : null,
              }).eq("id", sep.id);
              if (advance > 0) {
                let octId = feeByKey.get(`${s.id}:${NEXT_PERIOD}`)?.id;
                if (!octId) {
                  const { data: ins, error } = await db.from("fee_status").insert({
                    org_id: ORG, student_id: s.id, period: NEXT_PERIOD,
                    amount_due: r.fee, amount_paid: 0, status: "unpaid",
                    due_date: `${NEXT_PERIOD}-15`,
                    notes: `Monthly Tuition: ${r.fee}; opened early to carry Rs ${advance} paid in advance on ${SNAPSHOT}.`,
                  }).select("id").single();
                  if (error) { console.error(`  October voucher failed ${r.gr}: ${error.message}`); fatal++; continue; }
                  octId = ins.id;
                }
                await db.from("fee_payment").insert({
                  org_id: ORG, fee_status_id: octId, student_id: s.id,
                  amount: advance, paid_on: SNAPSHOT,
                  notes: `Advance - paid over September's fee on ${SNAPSHOT}.`,
                });
                const st2 = advance >= r.fee ? "paid" : "partial";
                await db.from("fee_status").update({
                  amount_paid: advance, status: st2,
                  paid_date: st2 === "paid" ? SNAPSHOT : null,
                }).eq("id", octId);
                stats.payments++;
              }
            }
          }
        } else stats.unpaidRows++;
      }
    }

    if (acts.length) console.log(`  ${r.gr} ${s.full_name}: ${acts.join(" | ")}`);
  }
  for (const gr of unseen) {
    flags.push(`${clsName}: on roll but NOT on the sheet: GR ${gr} ${byGr.get(gr)!.full_name} - office owes us their fee`);
  }
}

console.log(`\nSummary: ${JSON.stringify(stats)}`);
if (flags.length) {
  console.log(`\nFor the office / Muneeb (${flags.length}):`);
  for (const f of flags) console.log(`  - ${f}`);
}
if (fatal > 0) { console.error(`\n${fatal} fatal problems${APPLY ? "" : " - fix before --apply"}.`); Deno.exit(1); }
if (!APPLY) console.log("\nDry run - re-run with --apply to write.");
