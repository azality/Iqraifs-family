// The two-product rule: ILM Network (schools) and the family app share a
// codebase but not a hostname. The worker is the only thing enforcing
// that, so it is worth a test — the bug this covers had the school's
// Performance Dashboard rendering on family.theilmnetwork.com.

import { describe, it, expect } from "vitest";
import { productRedirect } from "./index.js";

const FAMILY = "https://family.theilmnetwork.com";
const PLATFORM = "https://app.theilmnetwork.com";
const PLATFORM_HOST = "app.theilmnetwork.com";
const SCHOOL = "https://iqraifs.com";

const where = (href) => productRedirect(new URL(href));

// Every first segment under the protected "/" subtree that belongs to
// the family product. Listed here rather than imported so a future edit
// to the worker's own set cannot silently empty this test.
const FAMILY_ROUTES = [
  "log", "log-behavior", "review", "monthly-review", "adjustments",
  "attendance", "rewards", "audit", "settings", "link-to-school",
  "edit-requests", "knowledge-quest", "question-bank", "question-form",
  "wishlist", "redemption-requests", "challenges", "titles-badges",
  "sadqa", "prayer-approvals", "games-review", "kid",
];

describe("school routes never render on the family host", () => {
  // Home on the family's own hostname, never the platform host: someone
  // using the family product must not be exported to the school app's
  // domain to be told there is nothing for them there.
  it("sends a school dashboard to the family home", () => {
    expect(where(`${FAMILY}/school/orgs/63cd5732-5db4-40e1-8fb9-60782bcfd059`))
      .toBe(`${FAMILY}/`);
  });

  it("drops a school deep link's path and query, staying on the host", () => {
    expect(where(`${FAMILY}/school/orgs/abc/admin/assessment?termId=t1`))
      .toBe(`${FAMILY}/`);
  });

  it.each(["school-login", "school-portal"])(
    "sends /%s home too",
    (seg) => {
      expect(where(`${FAMILY}/${seg}`)).toBe(`${FAMILY}/`);
    },
  );

  // Shipped wrong once: /parent-login LOOKS school-shaped but is the
  // family parent's own login, an alias of /login. Sending it away
  // logged family parents out of their own product.
  it("keeps /parent-login — it is the FAMILY parent's login", () => {
    expect(where(`${FAMILY}/parent-login`)).toBeNull();
  });

  it("sends an ?org= sign-in link home", () => {
    expect(where(`${FAMILY}/?org=iqra-ifs&claim=1`)).toBe(`${FAMILY}/`);
  });

  it("sends a school's public site home", () => {
    expect(where(`${FAMILY}/iqra-ifs`)).toBe(`${FAMILY}/`);
  });

  it("never sends a family visitor to the platform host", () => {
    for (const path of ["/school/orgs/abc", "/school-login", "/iqra-ifs", "/?org=iqra-ifs"]) {
      expect(where(`${FAMILY}${path}`)).not.toContain(PLATFORM_HOST);
    }
  });
});

describe("family routes stay on the family host", () => {
  it.each(FAMILY_ROUTES)("/%s is served in place", (seg) => {
    expect(where(`${FAMILY}/${seg}`)).toBeNull();
  });

  it("the family root is served in place", () => {
    expect(where(`${FAMILY}/`)).toBeNull();
  });

  it.each(["login", "signup", "welcome", "kid-login", "onboarding", "diagnostic"])(
    "/%s is shared, not school-shaped",
    (seg) => {
      expect(where(`${FAMILY}/${seg}`)).toBeNull();
    },
  );
});

describe("the mirror direction still holds", () => {
  it.each(FAMILY_ROUTES)("/%s leaves a school's own domain", (seg) => {
    expect(where(`${SCHOOL}/${seg}`)).toBe(`${FAMILY}/${seg}`);
  });

  it("a school route on the school's domain is served in place", () => {
    expect(where(`${SCHOOL}/school/orgs/abc`)).toBeNull();
  });

  it("a school route on the platform host is served in place", () => {
    expect(where(`${PLATFORM}/school/orgs/abc`)).toBeNull();
  });

  it("a school's public site on its own domain is served in place", () => {
    expect(where(`${SCHOOL}/iqra-ifs`)).toBeNull();
  });
});
