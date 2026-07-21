# Facility Maintenance Center — FMC (Bin Quraya)

Formerly "SSC Building Portal". Brand name is FMC everywhere user-facing;
new ticket numbers use the `FMC-` prefix (old `SSC-` tickets remain valid).

Facilities QR Room Reporting MVP. Staff scan a room QR code to report facility
issues; admins and facility users manage rooms, users, and tickets via a
dashboard.

## Roles

- `admin` — main admin: all sites, full control, gets WhatsApp new-ticket alerts.
- `site_admin` — one site: manages that site's rooms/tickets, can create/delete
  `sub_admin`/`facility` users of own site, gets WhatsApp alerts for own-site
  tickets.
- `sub_admin` — one site: ticket updates only (status/cost), no user/room
  management, no WhatsApp alerts.
- `facility` / `viewer` — unchanged (staff working tickets / read-only).

All users have a full profile (full_name, phone, email, site). New-ticket
WhatsApp alerts fan out to all main admins + the ticket site's site admins
(+ legacy `ADMIN_WHATSAPP`), deduplicated by phone digits.

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
  `TWILIO_WHATSAPP_FROM` (env var, preferred sender) or `TWILIO_WHATSAPP_NUMBER`
  (secret fallback) — currently the official sender `whatsapp:+15553707968`.
  `ADMIN_WHATSAPP` (shared env var) — admin phone that receives a WhatsApp
  alert for every new ticket (template prefix `ssc_ticket_admin`).
  `TWILIO_TEMPLATE_WELCOME` / `TWILIO_TEMPLATE_DONE` hold approved WhatsApp
  Content template SIDs (HX...) required to message users outside the 24-hour
  session window (Twilio error 63016 otherwise); unset = freeform text
  (session-only). Fallbacks: `CALLMEBOT_KEYS`
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
