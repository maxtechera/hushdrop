// Allow/block list matching. Entries: "ann@acme.com" (exact) or "@acme.com" / "acme.com" (domain).
export function normList(arr) {
  return [...new Set((Array.isArray(arr) ? arr : String(arr || "").split(","))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean)
    .map((e) => (e.includes("@") ? e : "@" + e))
    .filter((e) => /^[^\s@]*@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)))].slice(0, 500);
}
export function matches(list, email) {
  if (!list?.length) return false;
  const e = String(email).toLowerCase(), d = "@" + e.split("@")[1];
  return list.includes(e) || list.includes(d);
}
/** null if allowed, else a viewer-facing reason. */
export function checkRecipient({ allow_emails, block_emails }, email) {
  if (matches(block_emails, email)) return "This email can't open this link.";
  if (allow_emails?.length && !matches(allow_emails, email)) return "This email isn't on the list for this link. Ask the sender to add you.";
  return null;
}
