import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { badUrl, privateAddr, sign } from "../../api/_lib/webhooks.mjs";

test("badUrl blocks non-https, creds, odd ports, private hosts", () => {
  assert.equal(badUrl("https://hooks.example.com/x"), null);
  assert.match(badUrl("http://hooks.example.com/x"), /https/);
  assert.match(badUrl("https://u:p@example.com/"), /credentials/);
  assert.match(badUrl("https://example.com:8443/"), /443/);
  for (const h of ["https://localhost/", "https://127.0.0.1/", "https://10.0.0.5/", "https://[::1]/", "https://169.254.169.254/", "https://db.internal/"]) assert.ok(badUrl(h), h);
});

test("privateAddr covers v4/v6 private ranges", () => {
  for (const ip of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::ffff:127.0.0.1", "fd00::1", "fe80::1"]) assert.equal(privateAddr(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(privateAddr(ip), false, ip);
});

test("sign matches HMAC-SHA256 over t.body", () => {
  const s = sign("whsec_x", '{"a":1}', 1700000000);
  const want = createHmac("sha256", "whsec_x").update('1700000000.{"a":1}').digest("hex");
  assert.equal(s, `t=1700000000,v1=${want}`);
});
