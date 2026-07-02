---
name: CORS testing blind spot
description: Why curl-based auth tests passed while every real browser login failed; how CORS must be configured/tested in this app.
---

# CORS testing blind spot

**Rule:** When verifying API endpoints "work", always test with a browser-style
`Origin` header (`curl -H "Origin: https://<app-domain>"`), not just plain curl.

**Why:** Login appeared broken for days ("invalid credentials") while plain-curl
tests returned 200. Browsers send an `Origin` header on fetch POSTs even
same-origin; the cors middleware allow-list lacked the deployment's own domain,
threw `Error('Not allowed by CORS')`, and Express surfaced it as HTTP 500 —
which the frontend displayed as "invalid credentials". Curl without Origin
bypassed the check entirely (`!origin` → allowed).

**How to apply:**
- CORS allow-list is built from `REPLIT_DOMAINS` + `REPLIT_DEV_DOMAIN` +
  `VITE_PUBLIC_BASE_URL` env vars at startup — never hardcode domains.
- Deny unknown origins with `callback(null, false)` (omit CORS headers), never
  `callback(new Error(...))` (becomes a 500 and masks the real cause).
- Smoke test matrix: allowed origin → 200 + matching ACAO header; unknown
  origin → response without ACAO; no origin → 200.

Related earlier lesson: seeded account passwords sync from ADMIN_PASS /
FACILITY_PASS secrets on every server start (secrets are the source of truth),
and username matching is case-insensitive (mobile auto-capitalization caused
false "invalid credentials" too).
