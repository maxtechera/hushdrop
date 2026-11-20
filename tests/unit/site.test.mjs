import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectSiteFiles, makeVerifier } from "../../skill/site.mjs";

async function fixtureDir() {
  const d = await mkdtemp(join(tmpdir(), "site-"));
  await writeFile(join(d, "index.html"), "<head></head>body");
  await mkdir(join(d, "assets"), { recursive: true });
  await writeFile(join(d, "assets/app.css"), "a{}");
  await mkdir(join(d, "node_modules"), { recursive: true });
  await writeFile(join(d, "node_modules/junk.js"), "x");
  return d;
}

test("collectSiteFiles walks a folder, skips node_modules, finds index", async () => {
  const d = await fixtureDir();
  const { files, indexRel } = await collectSiteFiles(d);
  const rels = files.map((f) => f.rel).sort();
  assert.deepEqual(rels, ["assets/app.css", "index.html"]); // node_modules skipped
  assert.equal(indexRel, "index.html");
  await rm(d, { recursive: true, force: true });
});

test("collectSiteFiles throws when no index.html", async () => {
  const d = await mkdtemp(join(tmpdir(), "noidx-"));
  await writeFile(join(d, "page.html"), "x");
  await assert.rejects(() => collectSiteFiles(d), /index\.html/);
  await rm(d, { recursive: true, force: true });
});

test("makeVerifier emits the documented shape", async () => {
  const v = await makeVerifier("pw", { name: "Hushdrop" });
  assert.equal(v.v, 1);
  assert.equal(v.algo, "PBKDF2-SHA256");
  assert.equal(v.iters, 100000);
  assert.ok(v.salt && v.hash);
  assert.deepEqual(v.brand, { name: "Hushdrop" });
});
