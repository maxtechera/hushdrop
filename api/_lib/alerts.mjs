// drop-events listener: email the owner when a drop is opened (first open: Free;
// every new viewer: Pro). Respects sites.notify_opens, else profiles.notify_opens.
import { admin } from "./supabase.mjs";
import { hasPro } from "./plan.mjs";
import { sendMail, layout, esc } from "./mail.mjs";
import { capture } from "../_posthog.mjs";

const COUNTRY = (c) => { try { return c ? new Intl.DisplayNames(["en"], { type: "region" }).of(c) : null; } catch { return c; } };

export async function alertListener(type, d) {
  if (type === "lead.captured") return leadAlert(d);
  if (type !== "drop.viewed" || !d?.user_id) return;
  const first = !!d.first_view;
  if (!first && !d.new_viewer) return;
  const db = admin();
  const [{ data: prof }, { data: site }] = await Promise.all([
    db.from("profiles").select("notify_opens").eq("user_id", d.user_id).maybeSingle(),
    db.from("sites").select("notify_opens").eq("id", d.site_id).maybeSingle(),
  ]);
  const mode = site?.notify_opens || prof?.notify_opens || "first";
  if (mode === "off") return;
  if (!first && (mode !== "every" || !(await hasPro(d.user_id)))) return;
  let email = null;
  try { const { data } = await db.auth.admin.getUserById(d.user_id); email = data?.user?.email || null; } catch {}
  if (!email) return;
  const url = `https://hushdrop.dev/${d.handle}/${d.slug}`;
  const where = [COUNTRY(d.country), d.referrer ? `via ${esc(d.referrer)}` : null].filter(Boolean).join(", ");
  const who = d.email ? esc(d.email) : "Someone";
  const r = await sendMail({
    to: email,
    subject: first ? `${d.slug} was just opened` : `${d.slug}: new viewer (${d.views} views)`,
    html: layout({
      title: first ? `Your drop was opened` : `New viewer on ${d.slug}`,
      lines: [`${who} opened <b>${esc(d.slug)}</b>${where ? ` (${where})` : ""}.`, `Total views: ${d.views}.`],
      cta: { href: url, label: "Open the drop" },
    }),
    text: `${who} opened ${d.slug}${where ? ` (${where})` : ""}. Views: ${d.views}. ${url}\nCheck anytime: hush stats ${d.slug}`,
  });
  await capture({ distinctId: d.user_id, event: "open_alert_sent", properties: { slug: d.slug, first, mode, sent: !!r.ok, skipped: !!r.skipped } });
}

async function ownerEmail(db, userId) {
  try { const { data } = await db.auth.admin.getUserById(userId); return data?.user?.email || null; } catch { return null; }
}

// Every captured lead is worth an email unless alerts are off (Free: it's the owner's lead).
async function leadAlert(d) {
  if (!d?.user_id) return;
  const db = admin();
  const [{ data: prof }, { data: site }] = await Promise.all([
    db.from("profiles").select("notify_opens").eq("user_id", d.user_id).maybeSingle(),
    db.from("sites").select("notify_opens").eq("id", d.site_id).maybeSingle(),
  ]);
  if ((site?.notify_opens || prof?.notify_opens) === "off") return;
  const to = await ownerEmail(db, d.user_id);
  if (!to) return;
  const extra = d.fields ? Object.entries(d.fields).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ") : "";
  const r = await sendMail({
    to,
    subject: `${d.email} opened ${d.slug}`,
    html: layout({ title: "New lead", lines: [`<b>${esc(d.email)}</b>${d.verified ? " (verified)" : ""} opened <b>${esc(d.slug)}</b>${d.country ? ` from ${COUNTRY(d.country)}` : ""}.`, extra].filter(Boolean), cta: { href: `https://hushdrop.dev/${d.handle}/${d.slug}`, label: "Open the drop" } }),
    text: `${d.email} opened ${d.slug}. ${extra}\nAll leads: hush leads ${d.slug}`,
  });
  await capture({ distinctId: d.user_id, event: "lead_alert_sent", properties: { slug: d.slug, sent: !!r.ok, skipped: !!r.skipped } });
}
