// Every staff link must land on a real route.
//
// "Can you create something to make sure the links are working and
// doesn't take me to the page-not-found page" (Muneeb, 23 Sep) - after
// the Parents page linked children to /school/orgs/:orgId/students/:id,
// which only exists in the PIN portal shell, and a principal got the
// org 404. This test statically collects every literal
// `/school/orgs/${...}/...` template in the staff pages and checks it
// against the org shell's route table in routes.tsx.
//
// Deliberately static: importing routes.tsx would drag the whole app
// (contexts, supabase) into the test. The org subtree is FLAT (one
// `children:` - its own), so its `path:` literals compare directly;
// if someone nests a subtree in there, the childrenCount assertion
// below fails first and says so.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const routesSrc = readFileSync(join(root, "src", "app", "routes.tsx"), "utf-8");

// ── The org shell's routes, path literals between its declaration and
//    its catch-all ────────────────────────────────────────────────────
const orgStart = routesSrc.indexOf('path: "school/orgs/:orgId"');
const orgEnd = routesSrc.indexOf("<OrgNotFound />");
expect(orgStart).toBeGreaterThan(-1);
expect(orgEnd).toBeGreaterThan(orgStart);
const orgSpan = routesSrc.slice(orgStart, orgEnd);
const orgPaths = [...orgSpan.matchAll(/path: "([^"]*)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== "school/orgs/:orgId" && p !== "*");

// ── Every literal staff link template ────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const pageFiles = walk(join(root, "src", "app", "pages", "school"));

interface FoundLink { file: string; template: string }
const links: FoundLink[] = [];
for (const file of pageFiles) {
  const src = readFileSync(file, "utf-8");
  for (const m of src.matchAll(/`\/school\/orgs\/\$\{[^}]+\}\/([^`]*)`/g)) {
    // Strip query and hash - routing ignores them. A conditional query
    // suffix (`${focus ? "?tab=x" : ""}`) splits at the ternary's own
    // "?", leaving an unclosed "${" - cut there too.
    let rest = m[1].split(/[?#]/)[0];
    const dangling = rest.lastIndexOf("${");
    if (dangling >= 0 && !rest.includes("}", dangling)) rest = rest.slice(0, dangling);
    links.push({ file: file.slice(root.length + 1), template: rest });
  }
}

// A link segment matches a route segment when the route declares a
// param (anything matches) or the literals agree; a link's ${...}
// segment matches only a param segment - a dynamic value can never
// prove a literal.
function matches(linkPath: string, routePath: string): boolean {
  const ls = linkPath.split("/").filter(Boolean);
  const rs = routePath.split("/").filter(Boolean);
  if (ls.length !== rs.length) return false;
  return rs.every((r, i) => {
    const l = ls[i];
    if (r.startsWith(":")) return true;
    if (/^\$\{[^}]+\}$/.test(l)) return false;
    return l === r;
  });
}

describe("staff links resolve to real org routes", () => {
  it("found the org route table and a meaningful number of links", () => {
    // If routes.tsx is restructured these anchors move with it; a nested
    // subtree inside the org children would break flat comparison, so
    // fail loudly rather than silently pass.
    expect((orgSpan.match(/children:/g) ?? []).length).toBe(1);
    expect(orgPaths.length).toBeGreaterThan(40);
    expect(links.length).toBeGreaterThan(60);
  });

  it("every literal /school/orgs/:orgId/... link matches a declared route", () => {
    const dead = links.filter(
      (l) => l.template !== "" && !orgPaths.some((r) => matches(l.template, r)),
    );
    expect(
      dead.map((d) => `${d.file} -> /school/orgs/:orgId/${d.template}`),
    ).toEqual([]);
  });
});
