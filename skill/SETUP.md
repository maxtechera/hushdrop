# drop — backend setup (stand up your own deployment)

`drop` serves from **your** domain via a Vercel Blob store behind this repo's edge proxy. Do this
once; afterwards every machine just needs `hush setup` (the token) — the backend is shared.

## What you're building

- A **Vercel project** deploying this repo (`index.html` landing + `middleware.js` edge proxy + `vercel.json`).
- A **Vercel Blob store** that holds the uploaded drops.
- A **domain** (e.g. `share.yoursite.com`) pointed at the project.
- A **token** (`BLOB_READ_WRITE_TOKEN`) the CLI uses to upload/list/delete.

## Steps

```bash
# 0. clone + deploy this repo to Vercel
git clone https://github.com/maxtechera/hushdrop && cd hushdrop
vercel link --yes                     # creates .vercel/project.json (note the projectId + orgId)

# 1. add a Blob store named "drops" and pull its token
vercel blob store add drops           # link to this project, all environments
vercel env pull .env.local --environment=production    # contains BLOB_READ_WRITE_TOKEN

# 2. discover your PUBLIC blob host: do one upload and read the returned URL's host.
#    e.g. https://<id>.public.blob.vercel-storage.com  →  host = <id>.public.blob.vercel-storage.com
#    middleware.js reads BLOB host from the BLOB constant — set it there (and vercel.json fallback rewrite).

# 3. deploy + attach your domain
vercel deploy --prod --yes
vercel domains add share.yoursite.com

# 4. point the skill at this deployment
node skill/drop.mjs init \
  --domain share.yoursite.com \
  --blob-host <id>.public.blob.vercel-storage.com \
  --project prj_xxx --org team_xxx        # projectId/orgId from .vercel/project.json

# 5. give the skill the token (or run `vercel login` and let setup pull it)
node skill/drop.mjs setup --token "$(grep BLOB_READ_WRITE_TOKEN .env.local | cut -d= -f2- | tr -d '\"')"
```

## Wiring the blob host

`drop` itself doesn't need the blob host (the SDK returns blob URLs), but the **serving side** does.
Set your host in two places so encrypted HTML renders correctly:

**`middleware.js`** — the edge proxy that fixes Blob's `Content-Disposition: attachment` + CSP:

```js
const BLOB = "https://<id>.public.blob.vercel-storage.com";
```

**`vercel.json`** — the fallback rewrite:

```json
{
  "rewrites": [
    { "source": "/", "destination": "/index.html" },
    { "source": "/(.*)", "destination": "https://<id>.public.blob.vercel-storage.com/$1" }
  ]
}
```

Why both: `vercel.json` routes requests to the blob, and `middleware.js` rewrites the response
headers so password-protected HTML **decrypts and renders in-browser** instead of downloading, and so
CSP doesn't block StatiCrypt's unlock script. Serving is otherwise a dumb transparent proxy — all
branding/encryption happens at upload time in `drop.mjs`.

## Branding

Edit `skill/brand/brand.json` (name, colors, owner, social links) and replace
`skill/brand/logo-white.png` + `skill/brand/favicon.png`. These flow into the unlock gate, the corner
badge, download pages, and link-preview cards automatically.

## New machine (after the backend exists)

```bash
git clone https://github.com/maxtechera/hushdrop && cd hushdrop
node skill/drop.mjs setup     # installs deps + writes ~/.hushdrop/.env (pulls token from Vercel if logged in)
```

`hush list`/`rm` read the store directly, so they work from any machine; passwords are kept locally in
`~/.hushdrop/manifest.json`.
