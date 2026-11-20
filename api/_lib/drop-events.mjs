// Fan-out for things that happen to a hosted drop (viewed, first opened, lead captured).
// Every listener is best-effort: a failure here must never break serving a drop.
// Later features (webhooks, open alerts) register here instead of editing api/view.mjs.
import { capture } from "../_posthog.mjs";
import { webhookListener } from "./webhooks.mjs";
import { alertListener } from "./alerts.mjs";

const listeners = [];
export const onDropEvent = (fn) => listeners.push(fn);
onDropEvent(webhookListener);
onDropEvent(alertListener);

/**
 * @param {string} type  "drop.viewed" | "drop.first_opened" | "lead.captured"
 * @param {object} data  { site_id, user_id, handle, slug, views, country, referrer, email? }
 */
export async function emitDropEvent(type, data) {
  if (type === "drop.first_opened") {
    await capture({
      distinctId: data.user_id || data.handle,
      event: "drop_first_opened",
      properties: { slug: data.slug, handle: data.handle, country_code: data.country || null, referring_domain: data.referrer || "$direct" },
    });
  }
  await Promise.allSettled(listeners.map((fn) => fn(type, data)));
}
