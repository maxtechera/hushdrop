// Plan checks for paid features. Paid features are gated on profiles.plan now, with or
// without Stripe: until checkout is live, the admin sets plans by hand (Max, 2026-11-20).
// Self-hosters can set HUSH_ALL_FEATURES=1 to unlock everything on their own instance.
import { admin } from "./supabase.mjs";

export const PAID = new Set(["pro", "team"]);

export async function planOf(userId) {
  const { data } = await admin().from("profiles").select("plan").eq("user_id", userId).maybeSingle();
  return data?.plan || "free";
}

/** True when this user may use a Pro feature. */
export async function hasPro(userId) {
  if (process.env.HUSH_ALL_FEATURES === "1") return true;
  return PAID.has(await planOf(userId));
}

export const UPGRADE = { upgrade: "https://hushdrop.dev/pricing", hint: "Pro feature: upgrade at https://hushdrop.dev/pricing" };
