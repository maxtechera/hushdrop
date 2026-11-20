import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../../api/_lib/stats.mjs";

const now = Date.parse("2026-11-20T12:00:00Z");
const rows = [
  { viewer: "a", country: "US", referrer: "slack.com", is_mobile: false, created_at: "2026-11-20T11:58:00Z" },
  { viewer: "b", country: "UY", referrer: null, is_mobile: true, created_at: "2026-11-20T09:00:00Z" },
  { viewer: "a", country: "US", referrer: "slack.com", is_mobile: false, created_at: "2026-11-18T09:00:00Z" },
];

test("aggregate: daily buckets, referrers, countries, live viewers", () => {
  const s = aggregate(rows, { now, days: 7 });
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily.at(-1).views, 2);
  assert.equal(s.daily.find((d) => d.date === "2026-11-18").views, 1);
  assert.deepEqual(s.referrers[0], { name: "slack.com", views: 2 });
  assert.deepEqual(s.countries[0], { name: "US", views: 2 });
  assert.equal(s.viewing_now, 1);
  assert.equal(s.mobile_share, 0.33);
  assert.equal(s.recent.length, 3);
});

test("aggregate: free plan gets daily views only", () => {
  const s = aggregate(rows, { now, days: 7, pro: false });
  assert.deepEqual(Object.keys(s), ["daily"]);
});
