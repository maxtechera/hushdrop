import { test } from "node:test";
import assert from "node:assert/strict";
import { makeVerifier } from "../../skill/site.mjs";
import handler from "../../api/unlock.mjs";

function res() {
  return { statusCode: 200, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b = "") { this.body = b; return this; } };
}
const req = (body) => ({ method: "POST", headers: { "content-type": "application/json" },
  async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });

test("wrong password → 401 unlock page; right password → 302 + cookie", async () => {
  process.env.HUSH_GATE_SECRET = "test-secret";
  const v = await makeVerifier("open-sesame", { name: "X" });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => v });
  try {
    let r = res();
    await handler(req({ slug: "demo", password: "wrong", next: "/demo/" }), r);
    assert.equal(r.statusCode, 401);
    assert.match(r.body, /locked/);

    r = res();
    await handler(req({ slug: "demo", password: "open-sesame", next: "/demo/page" }), r);
    assert.equal(r.statusCode, 302);
    assert.equal(r.headers["location"], "/demo/page");
    assert.match(r.headers["set-cookie"], /^hush_demo=.*Path=\/demo\//);
  } finally { globalThis.fetch = realFetch; }
});

test("missing secret → 503; bad slug → 400", async () => {
  delete process.env.HUSH_GATE_SECRET;
  let r = res();
  await handler(req({ slug: "demo", password: "x" }), r);
  assert.equal(r.statusCode, 503);

  process.env.HUSH_GATE_SECRET = "s";
  r = res();
  await handler(req({ slug: "../etc", password: "x" }), r);
  assert.equal(r.statusCode, 400);
});
