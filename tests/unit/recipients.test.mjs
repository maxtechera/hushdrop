import { test } from "node:test";
import assert from "node:assert/strict";
import { normList, matches, checkRecipient } from "../../api/_lib/recipients.mjs";

test("normList: emails and domains, dedupe, drop junk", () => {
  assert.deepEqual(normList("Ann@Acme.com, acme.com,@beta.io, nope, ann@acme.com"), ["ann@acme.com", "@acme.com", "@beta.io"]);
});
test("matches exact email or domain", () => {
  assert.equal(matches(["@acme.com"], "bob@acme.com"), true);
  assert.equal(matches(["ann@acme.com"], "bob@acme.com"), false);
  assert.equal(matches([], "x@y.com"), false);
});
test("checkRecipient: block wins, allow restricts", () => {
  const site = { allow_emails: ["@acme.com"], block_emails: ["eve@acme.com"] };
  assert.equal(checkRecipient(site, "ann@acme.com"), null);
  assert.ok(checkRecipient(site, "eve@acme.com"));
  assert.ok(checkRecipient(site, "x@other.com"));
  assert.equal(checkRecipient({}, "x@other.com"), null);
});
