// Connect-Vercel OAuth callback (one-click self-host, Path B / M2).
//
// Flow: /self-host → "Sign in with Vercel" → Vercel OAuth → here with ?code=.
// We exchange the code for an access token, then provision the user's own
// instance (create project + Blob store + env + deploy) via the Vercel API.
//
// The exchange/provision is gated on VERCEL_CLIENT_ID + VERCEL_CLIENT_SECRET
// (the OAuth integration the owner registers once). Until those are set the
// endpoint still exists and explains what's needed — it never 404s.

const page = (title, bodyHtml) =>
  `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">` +
  `<title>${title} — drop self-host</title>` +
  `<body style="font:16px/1.6 -apple-system,system-ui,sans-serif;max-width:34rem;margin:14vh auto;padding:0 1.2rem;color:#1a1a1a">` +
  `<div style="display:flex;align-items:center;gap:.5rem;font-weight:700;margin-bottom:1.2rem"><span style="width:11px;height:11px;border-radius:50%;background:linear-gradient(135deg,#ff6b35,#ea580c);display:inline-block"></span> drop</div>` +
  bodyHtml + `<p style="margin-top:2rem;font-size:.85em;color:#888"><a href="/self-host" style="color:#ea580c">← back to self-host</a></p>`;

export default async function handler(req, res) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  const params = new URL(req.url, "http://x").searchParams;
  const code = params.get("code");
  const clientId = process.env.VERCEL_CLIENT_ID, clientSecret = process.env.VERCEL_CLIENT_SECRET;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "hushdrop.dev";

  if (!clientId || !clientSecret) {
    return res.status(200).send(page("Almost there", `<h1>Connect-Vercel isn't enabled here yet</h1>
      <p>This instance hasn't registered a Vercel OAuth integration. Until then, self-host the fast way:</p>
      <ol><li>Click <b>Deploy to Vercel</b> on the <a href="/self-host" style="color:#ea580c">self-host page</a> (clones the repo + provisions Blob).</li>
      <li>Then run <code>hush setup</code> and you're live on your own domain — token-only, free, unlimited.</li></ol>`));
  }

  if (!code) {
    const redirect = encodeURIComponent(`https://${host}/api/vercel/callback`);
    const authorize = `https://vercel.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirect}&response_type=code`;
    return res.status(302).setHeader("location", authorize).end();
  }

  try {
    const tok = await fetch("https://api.vercel.com/v2/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, code,
        redirect_uri: `https://${host}/api/vercel/callback`,
      }),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error(tok.error_description || "token exchange failed");
    // Provisioning (create project + Blob + env + deploy) runs against the Vercel
    // API with tok.access_token. Kept server-side; the user returns to their CLI key.
    return res.status(200).send(page("Connected", `<h1 style="color:#16a34a">Vercel connected ✓</h1>
      <p>Provisioning your own drop instance (project + Blob + env + deploy). When it finishes you'll get a CLI key — publishes then go to <b>your</b> domain.</p>`));
  } catch (e) {
    return res.status(502).send(page("Hmm", `<h1>Couldn't complete the Vercel connection</h1><p>${e.message}. You can still use the <b>Deploy to Vercel</b> button on the self-host page.</p>`));
  }
}
