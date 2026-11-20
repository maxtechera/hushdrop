// Pure aggregation of drop_views rows → the stats payload. No I/O, unit-tested.
const DAY = 86400000;

export function aggregate(rows, { now = Date.now(), days = 30, pro = true } = {}) {
  const daily = new Map();
  for (let i = days - 1; i >= 0; i--) daily.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0);
  const refs = new Map(), countries = new Map();
  let mobile = 0, live = new Set();
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    const d = new Date(t).toISOString().slice(0, 10);
    if (daily.has(d)) daily.set(d, daily.get(d) + 1);
    const ref = r.referrer || "direct";
    refs.set(ref, (refs.get(ref) || 0) + 1);
    if (r.country) countries.set(r.country, (countries.get(r.country) || 0) + 1);
    if (r.is_mobile) mobile++;
    if (now - t < 5 * 60000) live.add(r.viewer);
  }
  const top = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, views: v }));
  const out = { daily: [...daily.entries()].map(([date, views]) => ({ date, views })) };
  if (pro) {
    out.referrers = top(refs);
    out.countries = top(countries);
    out.mobile_share = rows.length ? Math.round((mobile / rows.length) * 100) / 100 : 0;
    out.viewing_now = live.size;
    out.recent = rows.slice(0, 20).map((r) => ({ at: r.created_at, country: r.country || null, referrer: r.referrer || "direct", mobile: !!r.is_mobile, email: r.email || null }));
  }
  return out;
}
