# SSC Building Portal — Enterprise Migration Blueprint

**Bin Quraya Operations** · Vanilla JS prototype → Production React app  
Location: `web/` · Stack: **Vite · React 18 · TypeScript · Tailwind · Zustand · Firebase · Vercel PWA**

---

## Deliverable index

| # | Requirement | Location |
|---|-------------|----------|
| 1 | Database schema (Firestore + SQL) | [`src/types/schema.ts`](src/types/schema.ts), [`src/types/schema-integrations.ts`](src/types/schema-integrations.ts), [`supabase/schema.sql`](supabase/schema.sql) |
| 2 | Directory structure | This document § [Directory structure](#directory-structure) |
| 3 | Offline-first ticket sync | [`src/providers/TicketSyncProvider.tsx`](src/providers/TicketSyncProvider.tsx), [`src/lib/offline-queue.ts`](src/lib/offline-queue.ts) |
| 4 | RBAC dashboard + realtime hooks | [`src/features/dashboard/CommandCenterDashboard.tsx`](src/features/dashboard/CommandCenterDashboard.tsx), [`src/hooks/use-dashboard-kpis.ts`](src/hooks/use-dashboard-kpis.ts) |

---

## Directory structure

```
web/
├── public/
│   ├── manifest.webmanifest
│   ├── assets/qrs/              # Static product + room QR SVGs (from prototype)
│   └── floor-plans/             # Phase 6 SVG building maps
├── supabase/
│   └── schema.sql               # PostgreSQL mirror of Firestore model
├── api/                         # Vercel serverless (Phase 4–5)
│   ├── ai/triage.ts             # OpenAI priority/team suggestion
│   ├── whatsapp/webhook.ts      # Phase 5 inbound messages
│   └── erp/sync-inventory.ts    # Phase 7 SAP/Oracle sync
├── functions/                   # Firebase Cloud Functions (optional)
│   ├── pm-cron.ts               # Phase 3 scheduled PM tickets
│   ├── notify-whatsapp.ts       # Phase 5 outbound status messages
│   └── erp-deplete.ts           # Phase 7 stock movements
└── src/
    ├── types/
    │   ├── schema.ts            # ★ Core: Users, Locations, Assets, Tickets, PM, Budget
    │   ├── schema-integrations.ts # ★ Phases 5–8: WhatsApp, FloorPlan, ERP, PTW
    │   └── index.ts
    ├── lib/
    │   ├── firebase.ts
    │   ├── offline-queue.ts     # IndexedDB mutation queue
    │   ├── permissions.ts       # RBAC
    │   └── warranty.ts          # Phase 3 warranty badge
    ├── stores/
    │   ├── auth-store.ts        # Zustand session
    │   └── ui-store.ts          # Theme, locale (AR/EN), RTL
    ├── providers/
    │   ├── AuthProvider.tsx     # ★ Phase 1 Entra SSO
    │   └── TicketSyncProvider.tsx # ★ Phase 2 offline-first sync
    ├── hooks/
    │   ├── use-auth.ts
    │   ├── use-tickets-realtime.ts
    │   └── use-dashboard-kpis.ts
    ├── features/
    │   ├── auth/LoginPage.tsx
    │   ├── report/ReportIssueForm.tsx
    │   ├── track/TrackTicketsPage.tsx
    │   ├── dashboard/CommandCenterDashboard.tsx  # ★ Phase 1/4 dashboard
    │   ├── assets/            # Phase 3 CRUD
    │   ├── floorplan/         # Phase 6 interactive SVG map
    │   ├── whatsapp/          # Phase 5 conversation log UI
    │   ├── erp/               # Phase 7 warehouse + PR views
    │   ├── ptw/               # Phase 8 permit sign-off flow
    │   └── ai/triage.ts       # Phase 4 OpenAI
    ├── components/
    │   ├── layout/AppShell.tsx  # Glass header, dark mode, i18n toggle
    │   └── ui/                  # Shadcn/Radix primitives
    ├── i18n/en.json · ar.json
    ├── App.tsx
    └── main.tsx
```

---

## Phase roadmap

| Phase | Capability | Architecture |
|-------|------------|--------------|
| **1** | RBAC, Entra SSO, relational schema | `AuthProvider`, Firestore `users` + custom claims, `permissions.ts` |
| **2** | PWA install, offline sync, push | `vite-plugin-pwa`, `TicketSyncProvider`, FCM, IndexedDB queue |
| **3** | Asset CRUD, warranty, PM cron | Admin asset forms, `warranty.ts`, Cloud Scheduler → `pm-cron` |
| **4** | AI triage, spend forecast | `/api/ai/triage`, Chart.js/Recharts on dashboard |
| **5** | WhatsApp report + status | Meta webhook → NLP → auto-ticket; outbound templates on status change |
| **6** | Interactive floor plan | SVG zones linked to `locations`; heatmap from open tickets |
| **7** | ERP depletion + auto-PR | `stock_movements` on ticket resolve; reorder rules → `purchase_requisitions` |
| **8** | Digital PTW | High-risk tickets freeze until Safety Manager signs `permits_to_work` |

---

## Data model summary (Phase 1 core)

```
users ─────────────┐
                   ├──< tickets >── assets ──< locations
vendors ───────────┘         │
pm_schedules ────────────────┘
budgets (finance KPIs)
```

**Roles:** `employee` · `technician` · `facility_manager`  
Replace prototype `admin/1234` with Firebase Auth + Firestore profile role.

---

## Environment variables

```env
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_MICROSOFT_TENANT_ID=

# Server-only (Vercel api/)
OPENAI_API_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
ERP_API_URL=
ERP_API_KEY=
```

---

## Migration from prototype (`../index.html`)

1. `node scripts/parse-inventory.js && node scripts/generate-product-qrs.js`
2. Copy `../assets/` → `public/assets/`
3. Seed Firestore: locations (9 rooms), assets (127), static QR paths
4. Run `web/` dev server; deprecate vanilla app when feature parity reached
5. Deploy `web/` root to Vercel with PWA headers

---

## Security notes

- Firestore rules enforce RBAC server-side (see comment block in `schema.ts`)
- WhatsApp webhook verifies Meta signature in `api/whatsapp/webhook.ts`
- OpenAI/ERP keys never exposed to client — Vercel API routes only
- PTW approval requires `ptw:approve` permission (Facility Manager / Safety role)
