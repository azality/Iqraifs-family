#!/usr/bin/env node
// Type-check gate: runs `tsc --noEmit -p tsconfig.json` and fails only on
// errors that are NOT already recorded in tsc-baseline.json.
//
// Why a baseline: the frontend was never type-checked, so the first run
// surfaced ~85 pre-existing errors that are incomplete type declarations
// (not runtime bugs). Rather than block every PR on cleaning those up, the
// gate ratchets: anything new fails CI, anything old is tolerated until it
// is fixed. Fixing an old error shrinks the baseline (run `--update`).
//
//   npm run typecheck           -> gate (fails on new errors)
//   npm run typecheck:update    -> rewrite tsc-baseline.json from current output
//   npm run typecheck:strict    -> raw tsc, fails on any error (target state)
//
// Baseline keys are `file|TScode|message` — deliberately without line/column
// so that unrelated edits above an old error don't re-flag it.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(root, "tsc-baseline.json");
const update = process.argv.includes("--update");

const tsc = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsc", "--noEmit", "-p", "tsconfig.json", "--pretty", "false"],
  { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
);

if (tsc.error) {
  console.error("typecheck: failed to launch tsc:", tsc.error.message);
  process.exit(2);
}

// tsc --pretty false emits one error per line:
//   src/foo.tsx(12,5): error TS2304: Cannot find name 'Button'.
// Multi-line messages continue on indented lines; we keep only the first.
const ERROR_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const errors = [];
for (const line of (tsc.stdout + tsc.stderr).split(/\r?\n/)) {
  const m = ERROR_RE.exec(line);
  if (!m) continue;
  const [, file, lineNo, col, code, message] = m;
  const normFile = file.replace(/\\/g, "/");
  errors.push({
    key: `${normFile}|${code}|${message}`,
    display: `${normFile}(${lineNo},${col}): ${code}: ${message}`,
  });
}

if (update) {
  const keys = [...new Set(errors.map((e) => e.key))].sort();
  writeFileSync(baselinePath, JSON.stringify({ errors: keys }, null, 2) + "\n");
  console.log(`typecheck: wrote ${keys.length} baseline entries to tsc-baseline.json`);
  process.exit(0);
}

const baseline = new Set(
  existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")).errors : [],
);

const fresh = errors.filter((e) => !baseline.has(e.key));
const seenKeys = new Set(errors.map((e) => e.key));
const resolved = [...baseline].filter((k) => !seenKeys.has(k));

if (resolved.length) {
  console.log(
    `typecheck: ${resolved.length} baseline error(s) no longer occur — run ` +
      `\`npm run typecheck:update\` to shrink the baseline:`,
  );
  for (const k of resolved) console.log("  - " + k);
}

if (fresh.length) {
  console.error(`\ntypecheck: ${fresh.length} NEW type error(s) not in baseline:\n`);
  for (const e of fresh) console.error("  " + e.display);
  console.error(
    `\n${errors.length - fresh.length} pre-existing error(s) tolerated via tsc-baseline.json.`,
  );
  process.exit(1);
}

console.log(
  `typecheck: OK — no new errors (${errors.length} pre-existing tolerated via tsc-baseline.json).`,
);
