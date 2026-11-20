// Transactional email via Resend's HTTP API. No-op (returns { skipped: true }) until
// RESEND_API_KEY is set, so features that email never break without it.
//   RESEND_API_KEY  re_...
//   MAIL_FROM       default "Hushdrop <alerts@hushdrop.dev>" (domain must be verified in Resend)
export const mailOn = () => !!process.env.RESEND_API_KEY;

export async function sendMail({ to, subject, html, text }) {
  if (!mailOn() || !to) return { skipped: true };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM || "Hushdrop <alerts@hushdrop.dev>", to: [to], subject, html, text }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Plain, light email that reads fine in any client. */
export function layout({ title, lines, cta }) {
  const body = lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join("");
  const btn = cta ? `<p style="margin:20px 0"><a href="${esc(cta.href)}" style="background:#ff6b35;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>` : "";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;padding:24px">
<div style="max-width:520px;margin:0 auto"><h2 style="margin:0 0 16px;font-size:18px">${esc(title)}</h2>${body}${btn}
<p style="color:#888;font-size:12px;margin-top:28px">Hushdrop · change alerts with <code>hush alerts off</code></p></div></body></html>`;
}
export { esc };
