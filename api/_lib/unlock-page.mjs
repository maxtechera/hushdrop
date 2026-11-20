// Branded unlock page for a gated site. Pure string — no node/edge APIs, shared by
// middleware.js (edge) and api/unlock.mjs (node).
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderUnlockPage({ slug, next = "", brand = {}, error = "" }) {
  const name = (brand && brand.name) || "Hushdrop";
  const color = (brand && brand.color) || "#ff6b35";
  const logo = brand && brand.logoUri
    ? `<img src="${esc(brand.logoUri)}" alt="" style="height:40px;margin-bottom:.5rem">` : "";
  return `<!doctype html><html lang=en><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<meta name=robots content="noindex,nofollow"><title>${esc(name)} — locked</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b0c;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#161618;padding:2rem;border-radius:14px;width:min(360px,90vw);text-align:center}
h2{margin:.3rem 0 0}input{width:100%;box-sizing:border-box;padding:.7rem;margin:.6rem 0;border-radius:8px;border:1px solid #333;background:#0b0b0c;color:#eee}
button{width:100%;padding:.7rem;border:0;border-radius:8px;background:${esc(color)};color:#fff;font-weight:600;cursor:pointer}
.err{color:#ff6b6b;font-size:.85rem;min-height:1.1em;margin:.2rem 0}</style></head>
<body><form method=POST action="/api/unlock">${logo}<h2>This site is locked</h2>
<p class=err>${esc(error)}</p>
<input type=hidden name=slug value="${esc(slug)}">
<input type=hidden name=next value="${esc(next)}">
<input type=password name=password placeholder=Password autofocus autocomplete=current-password>
<button type=submit>Unlock</button></form></body></html>`;
}
