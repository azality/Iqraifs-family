// Deno tests for the pure helpers in schoolAuth.ts.
//
// Run from project root:
//   npx deno test --allow-env supabase/functions/make-server-f116e23f/schoolAuth_test.ts
// Or via the npm script: `npm run test:backend`.
//
// SCOPE: pure logic only. Anything that talks to Supabase isn't tested here —
// that requires either a live Postgres test DB or a supabase-js mock, both
// of which are heavier than is worth right now. The role × permission matrix
// is covered separately via vitest in src/lib/rolePermissions.test.ts.
//
// What's covered here:
//   - isRoleActiveNow date-window semantics (the highest-stakes pure
//     helper — bugs in this gate visiting-teacher access cliffs).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
// Test the PURE module — schoolAuth.ts re-exports these, but importing
// from schoolAuth.ts would transitively pull in npm:hono and require a
// deno.json/deno install. roleValidity.ts has no runtime deps.
import { isRoleActiveNow, todayUtcDate } from "./roleValidity.ts";

Deno.test("isRoleActiveNow — revoked row is always inactive", () => {
  assertEquals(
    isRoleActiveNow({
      revoked_at: "2026-06-01T12:00:00Z",
      valid_from: null,
      valid_until: null,
    }, "2026-06-03"),
    false,
  );
});

Deno.test("isRoleActiveNow — open-ended (no window) is active when not revoked", () => {
  assertEquals(
    isRoleActiveNow({ revoked_at: null, valid_from: null, valid_until: null }, "2026-06-03"),
    true,
  );
});

Deno.test("isRoleActiveNow — window in the future is not active yet", () => {
  assertEquals(
    isRoleActiveNow({
      revoked_at: null,
      valid_from: "2026-09-01",
      valid_until: "2026-12-15",
    }, "2026-06-03"),
    false,
  );
});

Deno.test("isRoleActiveNow — window in the past is no longer active", () => {
  assertEquals(
    isRoleActiveNow({
      revoked_at: null,
      valid_from: "2026-01-01",
      valid_until: "2026-05-31",
    }, "2026-06-03"),
    false,
  );
});

Deno.test("isRoleActiveNow — today inside window (inclusive bounds) is active", () => {
  assertEquals(
    isRoleActiveNow({
      revoked_at: null,
      valid_from: "2026-06-01",
      valid_until: "2026-08-31",
    }, "2026-06-03"),
    true,
  );
  // First day of window is inclusive.
  assertEquals(
    isRoleActiveNow({
      revoked_at: null,
      valid_from: "2026-06-03",
      valid_until: "2026-08-31",
    }, "2026-06-03"),
    true,
  );
  // Last day of window is inclusive.
  assertEquals(
    isRoleActiveNow({
      revoked_at: null,
      valid_from: "2026-06-01",
      valid_until: "2026-06-03",
    }, "2026-06-03"),
    true,
  );
});

Deno.test("isRoleActiveNow — open start, future end is active", () => {
  // Substitute role granted with no start date but expiring in August.
  assertEquals(
    isRoleActiveNow({
      revoked_at: null,
      valid_from: null,
      valid_until: "2026-08-31",
    }, "2026-06-03"),
    true,
  );
});

Deno.test("isRoleActiveNow — past start, open end is active", () => {
  // Permanent staff hired Sept 2025; no end date.
  assertEquals(
    isRoleActiveNow({
      revoked_at: null,
      valid_from: "2025-09-01",
      valid_until: null,
    }, "2026-06-03"),
    true,
  );
});

Deno.test("isRoleActiveNow — revoked beats valid window", () => {
  // A visiting teacher fired mid-contract.
  assertEquals(
    isRoleActiveNow({
      revoked_at: "2026-06-02T09:00:00Z",
      valid_from: "2026-06-01",
      valid_until: "2026-08-31",
    }, "2026-06-03"),
    false,
  );
});

Deno.test("todayUtcDate — returns YYYY-MM-DD slice of provided date", () => {
  const d = new Date("2026-06-03T23:59:59Z");
  assertEquals(todayUtcDate(d), "2026-06-03");
});

Deno.test("todayUtcDate — boundary: midnight UTC counts as the new day", () => {
  const d = new Date("2026-06-04T00:00:00Z");
  assertEquals(todayUtcDate(d), "2026-06-04");
});
