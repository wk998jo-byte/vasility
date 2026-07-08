---
name: Pasted secret sanitization
description: User-pasted secret URLs (e.g. CLOUDINARY_URL) may include placeholder brackets/quotes; validate and sanitize before use.
---

The rule: never trust the raw format of a user-pasted secret URL. Validate the expected scheme and strip wrapper characters (`< >`, quotes, whitespace, `KEY=` prefixes) before handing it to an SDK.

**Why:** The user pasted `cloudinary://<key>:<secret>@cloud` (keeping the docs' placeholder brackets). The `cloudinary` npm package validates `CLOUDINARY_URL` at *import time* and threw, crashing the whole Express server on startup. After a format guard, the brackets still produced `Invalid api_key %3C...%3E`.

**How to apply:** Import such SDKs dynamically inside an init function with try/catch so a bad secret disables the feature (with a console warning) instead of killing the server. Sanitize the env value and write the cleaned value back to `process.env` before the SDK reads it. Log an "enabled/disabled" status line at startup (never the value itself).
