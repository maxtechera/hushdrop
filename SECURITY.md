# Security Policy

## The model
drop is **zero-knowledge** for password-protected drops: branding + AES-256 encryption happen
**client-side** (StatiCrypt / WebCrypto) before upload, so the server (Vercel Blob) only ever stores
ciphertext. Unlocked drops are public but served `noindex, nofollow, noai` and live at unguessable slugs.
Self-hosting keeps the URL, the content, and the keys entirely on your own infra.

## Reporting a vulnerability
Please report privately — **do not** open a public issue for security problems.
Email **maxi.techerag@gmail.com** with steps to reproduce. Expect an initial response within 72 hours.

In scope: the managed publish endpoint, the hosted-tier auth/device flow, the edge proxy, the encryption
pipeline. Out of scope: a leaked drop URL/password shared by the owner (that's intended sharing).
