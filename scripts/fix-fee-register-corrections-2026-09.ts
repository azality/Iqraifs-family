// One-off: the office's corrections to three rows the fee-register
// import flagged (22 Sep, answers from the accounts office).
//
//   npx deno run --allow-net --allow-env --allow-read --env=.env \
//     scripts/fix-fee-register-corrections-2026-09.ts [--apply]
//
// The register's Payment and Balance columns disagreed on three
// children; import-fee-register-2026-09.ts recorded its best reading
// and flagged all three rather than guessing silently. The office's
// answers:
//
//   GR 2325 Ayesha Mannan  5250 paid in full     -> we already had it
//   GR 1973 Abdullah Sidd. 4900 paid, NO extra   -> we recorded 4950
//   GR 2476 Abu Bakar      6200 paid, 200 EXTRA  -> "next month 5800"
//
// Abdullah's 50 was a slip on the sheet: void the payment, record the
// 4900 the office confirms. Voids never delete - the ledger keeps both
// rows with the reason.
//
// Abu Bakar's 200 is a real advance, and the office wants October to
// ask for 5800. We do NOT reduce his fee (it is 6000 and the register
// says so); we ALLOCATE the money he actually sent: 6000 settles
// September, 200 sits against October. His October voucher is created
// now carrying that 200, so it reads 5800 remaining the day it opens.
// bulk-generate PROTECTS any row with money on it, so running October
// billing later will not disturb it - which also means his October
// amount_due is frozen at today's 6000; if the school renegotiates his
// fee before October, edit that row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ORG = "63cd5732-5db4-40e1-8fb9-60782bcfd059"; // iqra-ifs
const PAID_ON = "2026-09-07"; // the register snapshot, as the import used
const APPLY = Deno.args.includes("--apply");

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const student = async (gr: string) => {
  const { data } = await db.from("student")
    .select("id,gr_number,full_name")
    .eq("org_id", ORG).eq("gr_number", gr).eq("status", "active").single();
  return data!;
};
const feeRow = async (studentId: string, period: string) => {
  const { data } = await db.from("fee_status")
    .select("id,period,amount_due,amount_paid,status")
    .eq("student_id", studentId).eq("period", period).maybeSingle();
  return data;
};
const livePayments = async (feeId: string) => {
  const { data } = await db.from("fee_payment")
    .select("id,amount,paid_on").eq("fee_status_id", feeId).is("voided_at", null);
  return data ?? [];
};
// amount_paid is a cache of the ledger - always recompute, never assume.
const resettle = async (feeId: string) => {
  const rows = await livePayments(feeId);
  const paid = rows.reduce((a, p) => a + Number(p.amount), 0);
  const { data: f } = await db.from("fee_status").select("amount_due,status").eq("id", feeId).single();
  const due = Number(f!.amount_due ?? 0);
  const status = f!.status === "waived" ? "waived" : paid <= 0 ? "unpaid" : paid >= due ? "paid" : "partial";
  const paidDate = status === "paid"
    ? rows.map((p) => p.paid_on).sort().slice(-1)[0] ?? null
    : null;
  await db.from("fee_status").update({ amount_paid: paid, status, paid_date: paidDate }).eq("id", feeId);
  return { paid, due, status };
};

let acted = 0;

// ── 1. Abdullah Siddiqui: 4950 -> 4900 ───────────────────────────────
{
  const s = await student("1973");
  const sep = await feeRow(s.id, "2026-09");
  const pays = await livePayments(sep!.id);
  const wrong = pays.find((p) => Number(p.amount) === 4950);
  if (!wrong) {
    console.log(`1973 ${s.full_name}: no 4950 payment live - already corrected, skipping`);
  } else {
    console.log(`1973 ${s.full_name}: void 4950, record 4900 (due ${sep!.amount_due})`);
    acted++;
    if (APPLY) {
      await db.from("fee_payment").update({
        voided_at: new Date().toISOString(),
        void_reason: "Register read 4950; the accounts office confirms 4900 was received, no extra (22 Sep).",
      }).eq("id", wrong.id);
      await db.from("fee_payment").insert({
        org_id: ORG, fee_status_id: sep!.id, student_id: s.id,
        amount: 4900, paid_on: PAID_ON,
        notes: "Corrected from the register's 4950 - office confirmed 4900 (22 Sep).",
      });
      console.log("   ->", JSON.stringify(await resettle(sep!.id)));
    }
  }
}

// ── 2. Abu Bakar: 6000 settles September, 200 carries to October ─────
{
  const s = await student("2476");
  const sep = await feeRow(s.id, "2026-09");
  const sepDue = Number(sep!.amount_due); // 6000
  const pays = await livePayments(sep!.id);
  const lump = pays.find((p) => Number(p.amount) === 6200);
  const oct = await feeRow(s.id, "2026-10");
  if (!lump && oct) {
    console.log(`2476 ${s.full_name}: already split - skipping`);
  } else if (!lump) {
    console.log(`2476 ${s.full_name}: no 6200 payment live - inspect by hand`);
  } else {
    console.log(`2476 ${s.full_name}: split 6200 -> ${sepDue} Sep + ${6200 - sepDue} advance on October`);
    acted++;
    if (APPLY) {
      await db.from("fee_payment").update({
        voided_at: new Date().toISOString(),
        void_reason: "Re-allocated: 6000 settles September, 200 carried to October as an advance (office, 22 Sep).",
      }).eq("id", lump.id);
      await db.from("fee_payment").insert({
        org_id: ORG, fee_status_id: sep!.id, student_id: s.id,
        amount: sepDue, paid_on: PAID_ON,
        notes: "Part of the Rs 6,200 received on 7 Sep - settles September.",
      });
      console.log("   Sep ->", JSON.stringify(await resettle(sep!.id)));

      // October voucher, carrying the advance. Created at his current
      // monthly fee; bulk-generate will leave it alone (it has money).
      let octId = oct?.id;
      if (!octId) {
        const { data: ins, error } = await db.from("fee_status").insert({
          org_id: ORG, student_id: s.id, period: "2026-10",
          amount_due: sepDue, amount_paid: 0, status: "unpaid",
          due_date: "2026-10-15",
          notes: `Monthly Tuition: ${sepDue}; opened early to carry Rs ${6200 - sepDue} paid in advance on 7 Sep.`,
        }).select("id").single();
        if (error) { console.error("   October voucher failed:", error.message); Deno.exit(1); }
        octId = ins.id;
      }
      await db.from("fee_payment").insert({
        org_id: ORG, fee_status_id: octId, student_id: s.id,
        amount: 6200 - sepDue, paid_on: PAID_ON,
        notes: "Advance - the Rs 200 paid over September's fee on 7 Sep.",
      });
      console.log("   Oct ->", JSON.stringify(await resettle(octId!)));
    }
  }
}

// ── 3. Ayesha Mannan: confirm only, nothing to change ────────────────
{
  const s = await student("2325");
  const sep = await feeRow(s.id, "2026-09");
  const ok = Number(sep!.amount_paid) === 5250 && sep!.status === "paid";
  console.log(`2325 ${s.full_name}: ${sep!.amount_paid}/${sep!.amount_due} ${sep!.status} - ${ok ? "matches the office, no change" : "UNEXPECTED, inspect"}`);
}

console.log(`\n${acted} correction${acted === 1 ? "" : "s"}${APPLY ? " applied" : " pending"}.`);
if (!APPLY) console.log("Dry run - re-run with --apply to write.");
