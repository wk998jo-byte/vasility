---
name: single-port serving
description: Why this app builds-then-serves via Express instead of running a vite dev server.
---

The Express server serves both the `/api/*` REST API and the built React SPA on a
single port. The frontend calls same-origin `/api`, and there is no vite dev proxy
for `/api`.

**Why:** Running a vite dev server would not proxy `/api` to the backend, so the
app would break in the Replit preview. Building the frontend and letting Express
serve it on one port is the reliable setup.

**How to apply:** Keep the workflow as build-then-serve. If hot reload is ever
needed, add a vite `server.proxy` entry for `/api` and run two processes;
otherwise do not switch to a bare vite dev server.
