// The two-product rule: ILM Network (schools) and the family app share a
// codebase but not a hostname. The worker is the only thing enforcing
// that, so it is worth a test — the bug this covers had the school's
// Performance Dashboard rendering on family.theilmnetwork.com.

import { describe, it, expect } from "vitest";
import { productRedirect } from "./index.js";

const FAMILY = "https://family.theilmnetwork.com";
const PLATFORM = "https://app.theilmnetwork.com";
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
  it("sends a school dashboard to the platform, path intact", () => {
    expect(where(`${FAMILY}/school/orgs/63cd5732-5db4-40e1-8fb9-60782bcfd059`))
      .toBe(`${PLATFORM}/school/orgs/63cd5732-5db4-40e1-8fb9-60782bcfd059`);
  });

  it("keeps the query string, so a deep link survives the hop", () => {
    expect(where(`${FAMILY}/school/orgs/abc/admin/assessment?termId=t1`))
      .toBe(`${PLATFORM}/school/orgs/abc/admin/assessment?termId=t1`);
  });

  it.each(["school-login", "school-portal", "parent-login"])(
    "sends /%s away too",
    (seg) => {
      expect(where(`${FAMILY}/${seg}`)).toBe(`${PLATFORM}/${seg}`);
    },
  );

  it("sends an ?org= sign-in link away", () => {
    expect(where(`${FAMILY}/?org=iqra-ifs&claim=1`))
      .toBe(`${PLATFORM}/?org=iqra-ifs&claim=1`);
  });

  it("sends a school's public site away", () => {
    expect(where(`${FAMILY}/iqra-ifs`)).toBe(`${PLATFORM}/iqra-ifs`);
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
