// Lead-capture / email-gate page shown before a drop opens. Pure string (edge + node).
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LABEL = { name: "Name", company: "Company", phone: "Phone", title: "Job title", website: "Website" };
export const fieldLabel = (f) => LABEL[f] || String(f).replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
export const cleanFields = (arr) => (Array.isArray(arr) ? arr : []).map((f) => String(f).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32)).filter(Boolean).filter((f) => f !== "email").slice(0, 6);

/**
 * @param {{handle,slug,next,fields?:string[],domain?:string|null,step?:"email"|"code",email?:string,error?:string,values?:object}} o
 */
export function renderLeadPage({ handle, slug, next = "", fields = [], domain = null, step = "email", email = "", error = "", values = {} }) {
  const hidden = `<input type=hidden name=handle value="${esc(handle)}"><input type=hidden name=slug value="${esc(slug)}"><input type=hidden name=next value="${esc(next)}">`;
  const inputs = step === "code"
    ? `<p class=sub>We sent a 6-digit code to <b>${esc(email)}</b>.</p><input type=hidden name=email value="${esc(email)}">
       ${cleanFields(fields).map((f) => `<input type=hidden name="f_${esc(f)}" value="${esc(values[f] || "")}">`).join("")}
       <input name=code inputmode=numeric autocomplete=one-time-code maxlength=6 placeholder="123456" required autofocus>`
    : `<input type=email name=email value="${esc(email)}" placeholder="${domain ? `you@${esc(domain)}` : "you@company.com"}" autocomplete=email required autofocus>
       ${cleanFields(fields).map((f) => `<input name="f_${esc(f)}" value="${esc(values[f] || "")}" placeholder="${esc(fieldLabel(f))}" required>`).join("")}`;
  const sub = step === "code" ? "" : domain ? `<p class=sub>Only <b>@${esc(domain)}</b> email addresses can open this.</p>` : `<p class=sub>Enter your email to view this.</p>`;
  return `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<meta name=robots content="noindex,nofollow"><meta name=color-scheme content="light dark"><title>${esc(slug)}</title>
<style>:root{--bg:#f6f6f7;--card:#fff;--fg:#141416;--mut:#6b6b73;--line:#dcdce0;--acc:#ff6b35}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--card:#161618;--fg:#eee;--mut:#9a9aa2;--line:#2c2c30}}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}
form{background:var(--card);padding:2rem;border-radius:14px;width:min(380px,100%);box-sizing:border-box;border:1px solid var(--line)}
h2{margin:0 0 .3rem;font-size:1.2rem}.sub{color:var(--mut);margin:.2rem 0 1rem;font-size:.92rem}
input{width:100%;box-sizing:border-box;padding:.7rem;margin:.35rem 0;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:1rem}
button{width:100%;padding:.75rem;margin-top:.6rem;border:0;border-radius:8px;background:var(--acc);color:#fff;font-weight:600;font-size:1rem;cursor:pointer}
.err{color:#e5484d;font-size:.88rem;min-height:1.1em;margin:.2rem 0}.foot{color:var(--mut);font-size:.75rem;margin-top:1rem;text-align:center}.foot a{color:inherit}</style></head>
<body><form method=POST action="/api/lead"><h2>${step === "code" ? "Check your email" : "View " + esc(slug)}</h2>${sub}
<p class=err>${esc(error)}</p>${hidden}${inputs}<button type=submit>${step === "code" ? "Verify" : "Continue"}</button>
<p class=foot>Your email is shared with the person who sent this link · <a href="https://hushdrop.dev" target=_blank rel=noopener>Hushdrop</a></p></form></body></html>`;
}
