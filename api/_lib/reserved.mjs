// Reserved handles — a user handle must not shadow a marketing page slug or system prefix.
// Keep in sync with the generated page set (gen-site writes the middleware matcher).
export const RESERVED = new Set([
  "u", "s", "b", "api", "_brand", "_next", "_vercel", "try", "install", "login", "account",
  "demo", "docs", "blog", "pricing", "security", "self-host", "about", "faq",
  "glossary", "changelog", "x402", "use-cases", "alternatives", "agents", "compare",
  "sitemap.xml", "robots.txt", "llms.txt", "pricing.md", "favicon.ico", "share-claude-artifacts",
]);

export function isReservedHandle(h) {
  if (!h) return true;
  if (RESERVED.has(h)) return true;
  // anything that looks like a competitor/alt/use-case slug — block hyphenated multiword that ends in known suffixes
  if (/-alternative$|^compare\/|^blog\//.test(h)) return true;
  return !/^[a-z0-9][a-z0-9-]{1,30}$/.test(h); // valid handle shape
}
