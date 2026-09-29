// Fetch EVERY row of a query, 1000 at a time (29 Sep 2026).
//
// Supabase returns at most 1000 rows per select and says nothing when it
// truncates. Three shipped bugs came from that - the marking board
// (#620), the "unmarked" Senior students (25 Sep), and the Hifz II
// round-up graying out children the qari had just heard (29 Sep, caught
// by the TEACHER). scripts/check-row-caps.mjs now fails CI on unbounded
// event-table selects; this is the sanctioned way to do an unbounded one.
//
// The builder is called once per page and must apply its own filters AND
// a stable .order (usually .order("id")) - without an order, pages can
// overlap or skip under concurrent writes:
//
//   const { rows, error } = await allRows((from, to) =>
//     serviceRoleClient.from("hifz_progress")
//       .select("...").eq("student_id", id).order("id").range(from, to));

export async function allRows<T = unknown>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: { message: string } | null }> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { rows, error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows, error: null };
}
