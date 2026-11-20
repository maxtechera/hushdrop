import { test } from "node:test";
import assert from "node:assert/strict";
import { signCookie, verifyCookie } from "../../api/_lib/cookie.mjs";
import { verifyPassword } from "../../api/_lib/gate.mjs";
import { renderUnlockPage } from "../../api/_lib/unlock-page.mjs";
import { makeVerifier } from "../../skill/site.mjs";

test("cookie round-trips and rejects tampering / expiry", async () => {
  const c = await signCookie("my-site", "s3cret", 100, 1000);
  assert.equal(await verifyCookie(c, "my-site", "s3cret", 1050), true);
  assert.equal(await verifyCookie(c, "my-site", "s3cret", 2000), false); // expired
  assert.equal(await verifyCookie(c, "other", "s3cret", 1050), false);   // wrong slug
  assert.equal(await verifyCookie(c, "my-site", "wrong", 1050), false);  // wrong secret
  assert.equal(await verifyCookie(c + "x", "my-site", "s3cret", 1050), false);
});

test("verifyPassword accepts the verifier makeVerifier produced (cross-module)", async () => {
  const v = await makeVerifier("hunter2", { name: "X" });
  assert.equal(await verifyPassword(v, "hunter2"), true);
  assert.equal(await verifyPassword(v, "nope"), false);
});

test("unlock page escapes input and includes the form fields", () => {
  const html = renderUnlockPage({ slug: "abc", next: "/abc/x", brand: { name: "Hushdrop" }, error: '<b>"' });
  assert.match(html, /name=slug value="abc"/);
  assert.match(html, /action="\/api\/unlock"/);
  assert.doesNotMatch(html, /<b>"/); // error was escaped
});
