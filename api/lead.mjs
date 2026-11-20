// Lead capture / email gate form handler (POSTed by the page middleware renders).
//   email step → validates (domain if email_gate), then either sets the access cookie
//                (lead capture) or emails a 6-digit code (email gate, when mail is on)
//   code step  → verifies the code, then sets the cookie
// Every accepted email is stored in `leads`, and emits lead.captured (webhooks, alerts).
import { createHash, randomInt } from "node:crypto";
import { admin } from "./_lib/supabase.mjs";
import { signCookie } from "./_lib/cookie.mjs";
import { renderLeadPage, cleanFields } from "./_lib/lead-page.mjs";
import { rateLimit, clientIp } from "./_lib/ratelimit.mjs";
import { mailOn, sendMail, layout } from "./_lib/mail.mjs";
import { emitDropEvent } from "./_lib/drop-events.mjs";
import { checkRecipient } from "./_lib/recipients.mjs";
import { capture } from "./_posthog.mjs";

const seg = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);
const EMAIL = /^[^\s@<>"]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i;
const hash = (s) => createHash("sha256").update(s).digest("hex");

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = ""; for await (const c of req) raw += c;
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.statusCode = 405; return res.end("POST only"); }
  const secret = process.env.HUSH_GATE_SECRET;
  if (!secret) { res.statusCode = 503; return res.end("gate misconfigured"); }
  const b = await readBody(req);
  const handle = String(b.handle || ""), slug = String(b.slug || "");
  if (!seg(handle) || !seg(slug)) { res.statusCode = 400; return res.end("bad drop"); }
  const next = typeof b.next === "string" && b.next.startsWith(`/${handle}/${slug}`) && !/[\r\n]/.test(b.next) ? b.next : `/${handle}/${slug}`;

  const db = admin();
  const { data: site } = await db.from("sites").select("*").eq("handle", handle).eq("slug", slug).maybeSingle();
  if (!site) { res.statusCode = 404; return res.end("no such drop"); }
  const fields = cleanFields(site.lead_fields);
  const email = String(b.email || "").trim().toLowerCase();
  const values = Object.fromEntries(fields.map((f) => [f, String(b[`f_${f}`] || "").trim().slice(0, 200)]));
  const page = (o) => {
    res.statusCode = o.error ? 400 : 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("x-robots-tag", "noindex, nofollow");
    res.setHeader("cache-control", "no-store");
    return res.end(renderLeadPage({ handle, slug, next, fields, domain: site.email_gate, email, values, ...o }));
  };

  const rl = await rateLimit(`lead:${clientIp(req)}`, { limit: 30, windowSec: 3600 });
  if (!rl.ok) return page({ error: "Too many attempts. Try again in a bit." });
  if (!EMAIL.test(email)) return page({ error: "Enter a valid email address." });
  if (fields.some((f) => !values[f])) return page({ error: "Please fill in every field." });
  if (site.email_gate && email.split("@")[1] !== site.email_gate) return page({ error: `Use your @${site.email_gate} email.` });
  const denied = checkRecipient(site, email);
  if (denied) return page({ error: denied });
  const mustVerify = site.email_gate || site.allow_emails?.length;

  // Email gate with mail configured → prove the address with a one-time code.
  let verified = false;
  if (mustVerify && mailOn()) {
    const code = String(b.code || "").trim();
    if (!code) {
      const c = String(randomInt(0, 1e6)).padStart(6, "0");
      await db.from("lead_codes").upsert({ site_id: site.id, email, code_hash: hash(`${site.id}:${email}:${c}`), attempts: 0, expires_at: new Date(Date.now() + 600000).toISOString() });
      await sendMail({ to: email, subject: `Your code for ${slug}: ${c}`, html: layout({ title: `Your code: ${c}`, lines: [`Enter this code to open <b>${slug}</b>. It expires in 10 minutes.`] }), text: `Your code to open ${slug}: ${c} (expires in 10 minutes)` });
      return page({ step: "code" });
    }
    const { data: row } = await db.from("lead_codes").select("code_hash, attempts, expires_at").eq("site_id", site.id).eq("email", email).maybeSingle();
    if (!row || new Date(row.expires_at) < new Date() || row.attempts >= 5) return page({ step: "email", error: "That code expired. Request a new one." });
    if (row.code_hash !== hash(`${site.id}:${email}:${code}`)) {
      await db.from("lead_codes").update({ attempts: row.attempts + 1 }).eq("site_id", site.id).eq("email", email);
      return page({ step: "code", error: "Wrong code." });
    }
    await db.from("lead_codes").delete().eq("site_id", site.id).eq("email", email);
    verified = true;
  }

  const country = req.headers["x-vercel-ip-country"] || null;
  await db.from("leads").insert({ site_id: site.id, email, fields: fields.length ? values : null, verified, country });
  await emitDropEvent("lead.captured", { site_id: site.id, user_id: site.user_id, handle, slug, email, fields: fields.length ? values : undefined, country, verified });
  await capture({ distinctId: site.user_id || handle, event: "lead_captured", properties: { slug, handle, gate: site.email_gate ? "email_domain" : "lead", verified, custom_fields: fields.length } });

  const cookie = await signCookie(`lead:${handle}/${slug}`, secret, 30 * 86400);
  res.statusCode = 302;
  res.setHeader("Set-Cookie", `hl_${handle}_${slug}=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/${handle}/${slug}; Max-Age=${30 * 86400}`);
  res.setHeader("Location", next);
  return res.end();
}
