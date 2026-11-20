import { test } from "node:test";
import assert from "node:assert/strict";
import { renderLeadPage, cleanFields } from "../../api/_lib/lead-page.mjs";

test("cleanFields sanitizes, drops email, caps at 6", () => {
  assert.deepEqual(cleanFields(["Name", "email", "co<mp>any", "", 1, "a", "b", "c", "d", "e"]), ["name", "company", "1", "a", "b", "c"]);
  assert.deepEqual(cleanFields(null), []);
});

test("lead page: email step with fields and domain hint, escaped", () => {
  const html = renderLeadPage({ handle: "max", slug: "deck", next: "/max/deck", fields: ["name"], domain: "acme.com", error: '<b>"' });
  assert.match(html, /action="\/api\/lead"/);
  assert.match(html, /name="f_name"/);
  assert.match(html, /you@acme\.com/);
  assert.doesNotMatch(html, /<b>"/);
});

test("lead page: code step carries email + fields as hidden inputs", () => {
  const html = renderLeadPage({ handle: "max", slug: "deck", step: "code", email: "a@acme.com", fields: ["name"], values: { name: "Ann" } });
  assert.match(html, /name=code/);
  assert.match(html, /type=hidden name=email value="a@acme\.com"/);
  assert.match(html, /name="f_name" value="Ann"/);
});
