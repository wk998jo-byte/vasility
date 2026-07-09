# SSC Building Portal (Bin Quraya)

Facilities QR Room Reporting MVP. Staff scan a room QR code to report facility
issues; admins and facility users manage rooms, users, and tickets via a
dashboard.

## Architecture

- **Backend**: Node.js + Express (`server/index.js`). Serves the REST API under
  `/api/*` and also serves the built React app (SPA fallback) from `web/dist`.
  Single-port design — one server handles both API and frontend.
- **Frontend**: React + Vite + Tailwind (`web/`). Built to `web/dist` and served
  statically by Express. In dev the frontend calls same-origin `/api`.
- **Database**: PostgreSQL (Replit-managed). Schema in `server/schema.sql`,
  seeding in `server/seed.js` / `server/seed-data.js`. `initDb()` runs schema +
  seed idempotently on server start.

## Running locally (Replit)

The "Start application" workflow runs `npm run build && PORT=5000 npm start`,
serving the app on port 5000 (webview). The server binds `0.0.0.0`.

- `npm run build` — build the frontend (`web/dist`)
- `npm start` — start the Express server (uses `process.env.PORT`, default 8080)
- `npm run db:init` — apply schema and seed data

## Environment variables

Set as Replit env vars / secrets (see `.env.example`):

- `DATABASE_URL`, `PG*` — provided by the Replit PostgreSQL database
- `JWT_SECRET` — signing secret for admin/facility auth tokens
- `ADMIN_USER` / `ADMIN_PASS` — seeded admin login
- `FACILITY_USER` / `FACILITY_PASS` — seeded facility login
- **Password policy**: when `ADMIN_PASS` / `FACILITY_PASS` are set, they are the
  source of truth — on every server start the stored password hashes are synced
  to match them (changing the secret + restart/republish changes the login).
- `VITE_PUBLIC_BASE_URL` — build-time base URL for QR codes (falls back to
  `window.location.origin`)
- Optional: `SMTP_*` / `NOTIFY_EMAIL` (email notifications), `CLOUDINARY_URL`
  (issue photo uploads). WhatsApp message to the reporter's phone when their
  ticket is Resolved/Closed: `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` /
  `TWILIO_WHATSAPP_NUMBER` (Twilio, highest priority), or `CALLMEBOT_KEYS`
  (free CallMeBot;
  `phone:apikey` pairs, comma-separated — each recipient registers once with
  CallMeBot) or `WHATSAPP_API_URL` / `WHATSAPP_TOKEN` (UltraMsg / Green API
  style REST gateway; POST JSON `{ token, to, body }`, phone sent as
  international digits without `+`). All degrade gracefully when unset
  (WhatsApp falls back to a console stub).

## Deployment

Configured for **autoscale** (stateless web server + managed Postgres):

- Build: `npm run build`
- Run: `npm start`

Publish via the Publish button. Replit provides `PORT` and migrates the
production database schema on publish.

## User preferences

(none recorded yet)
