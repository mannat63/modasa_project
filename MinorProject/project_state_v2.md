# Municipal Waste Management System — Project State Snapshot v2

> **Last Updated:** 2026-04-03 01:54 IST  
> **Location:** Modasa, Gujarat, India  
> **Project Path:** `municipal-waste-app/`

---

# 1. Project Overview

A full-stack municipal waste management application for the town of **Modasa, India** (population ~60,000). The system enables:

- **Real-time fleet tracking** on an interactive Leaflet map with zone polygons and truck markers
- **AI-powered operations** using Groq (Llama 3.3-70b) for chat, route suggestions, zone analysis, daily reports, and operational action proposals
- **Route simulation sandbox** (S1 bin epoch + S2 fleet optimization) with confirmation-gated live deployment
- **Greedy nearest-neighbour route optimization** with priority-weight biasing
- **Driver mobile portal** (standalone, no navbar) for route acknowledgement and real-time flag submission
- **Admin dashboard** with trucks, flags, audit trail tabs, and 30-second auto-polling
- **Immutable audit logging** for every write operation across all actors (admin, driver, AI, system)

### Core Architecture

```
┌─────────────┐     HTTP/JSON      ┌──────────────┐     Mongoose     ┌──────────────┐
│   Frontend   │ ←───────────────→ │   Backend    │ ←──────────────→ │  MongoDB     │
│  React+Vite  │                   │  Express.js  │                  │  Atlas       │
│  Leaflet.js  │                   │  Groq SDK    │ ←──── AI ──────→ │              │
│  Port: 5173  │                   │  Port: 5000  │                  │              │
└─────────────┘                    └──────────────┘                  └──────────────┘
```

---

# 2. Tech Stack

| Layer         | Technology                        |
|---------------|-----------------------------------|
| Frontend      | React 18 + Vite 5                 |
| Styling       | Vanilla CSS (dark-mode system)    |
| Maps          | Leaflet.js + react-leaflet        |
| Backend       | Node.js + Express                 |
| Database      | MongoDB Atlas (Mongoose ODM v7+)  |
| AI            | Groq SDK → Llama 3.3-70b-versatile |
| HTTP Client   | Axios                             |
| Routing       | React Router DOM v6               |

---

# 3. Folder Structure

```
municipal-waste-app/
├── project_state_v2.md              # This file
│
├── backend/
│   ├── .env                         # MONGODB_URI, GROQ_API_KEY, PORT
│   ├── package.json
│   ├── server.js                    # Express entry + route mounting
│   ├── seed.js                      # Seeds 42 zones + 27 trucks
│   │
│   ├── models/
│   │   ├── Zone.js
│   │   ├── Truck.js
│   │   ├── Driver.js                # Schema exists but drivers looked up via Truck
│   │   ├── Flag.js
│   │   ├── AuditLog.js              # Immutable (pre-save throws if !isNew)
│   │   └── Route.js                 # Compound index {date, truckId}
│   │
│   ├── routes/
│   │   ├── trucks.js                # /api/trucks/*
│   │   ├── zones.js                 # /api/zones/*
│   │   ├── drivers.js               # /api/drivers/*, /api/flags/*
│   │   ├── reports.js               # /api/reports/*, /api/audit
│   │   ├── ai.js                    # /api/ai/*
│   │   └── simulation.js            # /api/simulation/*
│   │
│   └── utils/
│       └── routingEngine.js         # 6 core algorithms
│
├── frontend/
│   ├── vite.config.js
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── App.jsx                  # Router — admin shell + standalone driver route
│       ├── main.jsx
│       ├── index.css                # Global dark-mode design system
│       │
│       ├── pages/
│       │   ├── Dashboard.jsx        # S0 live ops: stats, map, 3-tab panel
│       │   ├── Simulation.jsx       # S1 bin epochs + S2 fleet optimization
│       │   ├── AIPanel.jsx          # AI chat + Take Action (4 action cards)
│       │   ├── DriverView.jsx       # Admin-side driver lookup (login by Truck ID)
│       │   └── DriverMobile.jsx     # Standalone mobile driver view (/driver/:truckId)
│       │
│       ├── components/
│       │   ├── MapView.jsx          # Leaflet map
│       │   ├── TruckList.jsx
│       │   ├── ZonePanel.jsx
│       │   ├── FlagPanel.jsx
│       │   └── ChatBox.jsx          # Legacy chat (used in old AIPanel)
│       │
│       └── utils/
│           ├── api.js               # Axios wrapper — all endpoints
│           └── routeUtils.js        # Frontend haversine + greedy routing
```

---

# 4. Database Schemas

## Zone

```javascript
{
  zoneId:               String,     // unique, "Z001"–"Z042"
  name:                 String,     // "Market Area 1", "School Area North"
  type:                 String,     // Market | Residential_High | Residential_Low |
                                    // School | Hospital | Industrial
  riskScore:            Number,     // 0–1
  priorityWeight:       Number,     // Market=1.5, School=1.4, Hospital=1.4,
                                    // Industrial=1.2, Res_High=1.0, Res_Low=0.7
  coordinates:          [[Number]], // polygon boundary
  centerPoint:          [Number],   // [lat, lng]
  pickupFrequency:      String,     // daily | alternate
  hasBin:               Boolean,    // default false
  binEpoch:             Number,     // 0–3
  wasteProfile:         String,     // Mixed | Organic | Dry
  visualSeverity:       Number,     // 1–5
  illegalDumping:       Boolean,
  sensitiveInstitution: Boolean,
  healthRiskLevel:      Number,     // 1–3
  blockedToday:         Boolean,
}
```

## Truck

```javascript
{
  truckId:             String,    // unique, "T01"–"T27"
  driverName:          String,
  driverPhone:         String,    // +91 format
  capacity:            Number,    // 0–1, default 1.0
  currentLoadFactor:   Number,    // 0–1
  status:              String,    // active | inactive | standby
  assignedZones:       [String],  // array of zoneIds
  routeSequence:       [String],  // ordered zoneIds
  estimatedDistance:    Number,    // km
  estimatedDuration:   Number,    // minutes
  depotLocation:       [Number],  // [23.4671, 73.0155]
}
```

## Route (Daily Snapshot)

```javascript
{
  date:                 Date,      // required
  truckId:              String,    // required
  routeSequence:        [String],
  status:               String,    // draft | deployed | completed
  approvedBy:           String,
  approvedAt:           Date,
  totalDistance:         Number,
  totalDuration:        Number,
  specialInstructions:  String,
  systemState:          String,    // S0 | S1 | S2
  acknowledgedByDriver: Boolean,   // default false
}
// Compound unique index: { date: 1, truckId: 1 }
```

## Flag

```javascript
{
  flagId:      String,    // unique, "FLG-{timestamp}"
  truckId:     String,
  zoneId:      String,    // required
  driverName:  String,
  type:        String,    // road_blocked | overloaded | skipped | delay
  skipReason:  String,
  status:      String,    // pending | acknowledged | actioned
  adminNote:   String,
  timestamp:   Date,
}
```

## AuditLog (Immutable)

```javascript
{
  timestamp: Date,
  actor:     String,    // admin | driver | system | ai
  actorId:   String,
  action:    String,
  details:   Mixed,
  outcome:   String,
}
// Pre-save: throws if !this.isNew (Mongoose v7 pattern)
```

## Driver

```javascript
{
  driverId:               String,     // unique
  name:                   String,
  phone:                  String,
  truckId:                ObjectId,   // ref → Truck
  todayRouteAcknowledged: Boolean,
}
// NOTE: Not seeded separately. GET /api/drivers/:id
// looks up by Truck ID and returns virtual driver object.
```

---

# 5. Backend API Endpoints

## Server Mount Order (`server.js`)

```javascript
app.use('/api/trucks',      trucksRouter);
app.use('/api/zones',       zonesRouter);
app.use('/api/ai',          aiRouter);
app.use('/api/simulation',  simulationRouter);
app.use('/api',             reportsRouter);   // /api/reports/*, /api/audit
app.use('/api',             driversRouter);   // /api/drivers/*, /api/flags/*
```

## Trucks — `/api/trucks`

```
GET    /api/trucks                    → All trucks
GET    /api/trucks/:id                → Single truck by truckId
PUT    /api/trucks/:id/route          → Update route sequence (body: {routeSequence, approvedBy})
GET    /api/trucks/:id/today-route    → Today's deployed route
POST   /api/trucks/:id/deploy-route   → Deploy route for today
```

## Zones — `/api/zones`

```
GET    /api/zones                     → All zones
GET    /api/zones/blocked             → Blocked zones only
GET    /api/zones/:id                 → Single zone by zoneId
PUT    /api/zones/:id/priority        → Update priorityWeight
PUT    /api/zones/:id/bin             → Set hasBin + binEpoch
PUT    /api/zones/:id/block           → Block zone for today
PUT    /api/zones/:id/unblock         → Unblock zone
```

## Drivers & Flags — `/api`

```
GET    /api/drivers/:id               → Look up driver by Truck ID (returns virtual driver from Truck)
GET    /api/drivers/:id/flags         → Driver's submitted flags
PATCH  /api/drivers/:id/acknowledge   → Acknowledge today's route
POST   /api/drivers/:id/flag          → Submit a flag (body: {type, zoneId, skipReason})
GET    /api/flags                     → All flags (?status=pending filter supported)
PUT    /api/flags/:id/acknowledge     → Admin acknowledge flag (body: {adminNote, actorId})
```

## Reports & Audit — `/api`

```
GET    /api/reports/summary           → Dashboard stat cards (totalZones, totalTrucks, activeTrucks,
                                        pendingFlags, activeRoutes, avgLoadFactor)
GET    /api/reports/today             → Trucks with today's deployed routes
POST   /api/reports/generate          → Bulk daily snapshots for all trucks
POST   /api/reports/routes            → Create/update single route (atomic upsert)
GET    /api/audit                     → Last 100 audit entries
```

## AI — `/api/ai`

```
POST   /api/ai/query                  → Full-context question → structured JSON response
                                        Response: {answer, dataPoints[], recommendation,
                                                   actionSuggested, mapHighlight}
POST   /api/ai/action                 → Operational action proposals
                                        actionType: road_blocked | area_blocked |
                                                    area_priority | reroute_truck
                                        Returns: {affectedTrucks, proposedChanges, explanation,
                                                  requiresApproval: true}
POST   /api/ai/chat                   → Legacy alias for /query
POST   /api/ai/suggest-route          → Greedy route suggestion for a truck
POST   /api/ai/analyse-zones          → Zone risk analysis + AI recommendations
POST   /api/ai/generate-report        → Full markdown daily operations report
```

## Simulation — `/api/simulation`

```
GET    /api/simulation/epoch/:n       → Simulate bin epoch (1/2/3)
                                        Returns: {binsPlaced, estimatedStopsReduced,
                                                  totalTimeSaved, affectedZones, truckMetrics,
                                                  updatedZones}
POST   /api/simulation/epoch/:n/deploy→ Deploy epoch to live DB (updates hasBin + priorityWeight)
POST   /api/simulation/fleet          → Fleet optimization analysis (body: {targetFleetSize})
                                        Returns: {feasible, infeasibleReasons, minimumFeasible,
                                                  metricsComparison, updatedTrucks}
POST   /api/simulation/fleet/deploy   → Deploy fleet plan to live DB
```

---

# 6. Routing Engine (`/backend/utils/routingEngine.js`)

| Function | Logic |
|----------|-------|
| `calculateDistance(p1, p2)` | Haversine formula → km between two `[lat, lng]` |
| `calculateRouteMetrics(zones, depot)` | Total dist, ETA (15km/h + 5min/stop), loadFactor = sum(weights)/(n*1.5) capped 1.0 |
| `greedyRouteOptimize(zones, depot)` | effectiveDist = distance / priorityWeight → nearest-neighbour |
| `simulateBinEpoch(zones, epoch)` | Epoch 1→top 20%, 2→next 20%, 3→next 15% by riskScore. Reduces weight by 0.2 |
| `fleetOptimize(trucks, zones, target)` | Deactivate fewest-zone trucks, round-robin redistribute, check load < 0.92 |
| `findAlternativeRoutes(...)` | 3 strategies: skip blocked, substitute nearest, reverse-priority |

---

# 7. Current Features Working

| Feature | Status |
|---------|--------|
| Dashboard — stat cards, map, 3-tab panel (Trucks/Flags/Audit) | ✅ |
| Dashboard — truck cards with load bars, click to show route | ✅ |
| Dashboard — flag acknowledgement with admin notes | ✅ |
| Dashboard — audit timeline with actor badges | ✅ |
| Dashboard — 30-second auto-polling for new flags | ✅ |
| Simulation — S1 bin epoch (3 phases) with before/after truck metrics | ✅ |
| Simulation — S2 fleet optimization with slider + feasibility analysis | ✅ |
| Simulation — confirmation modals before live deployment | ✅ |
| Simulation — cumulative state tracker | ✅ |
| AI Panel — Ask AI tab with structured responses + typing indicator | ✅ |
| AI Panel — quick question chips (5 pre-built) | ✅ |
| AI Panel — map auto-highlight from AI responses | ✅ |
| AI Panel — "Apply this action" bridge to Take Action tab | ✅ |
| AI Panel — Take Action tab: 4 action cards with preview + 2-step approve | ✅ |
| AI Panel — zone analysis + daily report generation | ✅ |
| Driver View (admin) — login by Truck ID, see route, acknowledge, flag | ✅ |
| Driver Mobile — standalone `/driver/:truckId`, no navbar | ✅ |
| Driver Mobile — greeting, route map, stop list with ETAs | ✅ |
| Driver Mobile — large acknowledge button | ✅ |
| Driver Mobile — floating flag FAB + bottom sheet with 4 types | ✅ |
| Leaflet map — zone polygons, truck markers, route polylines | ✅ |
| Save & Deploy — atomic route upsert | ✅ |
| Audit trail — immutable log for all write operations | ✅ |
| Data seeded — 42 zones, 27 trucks for Modasa | ✅ |

---

# 8. Frontend Structure

## Router (`App.jsx`)

```
/driver/:truckId  → DriverMobile (standalone, no navbar, mobile-first)
/*                → Admin shell with navbar containing:
  /               → Dashboard
  /simulation     → Simulation
  /ai             → AIPanel
  /driver         → DriverView (admin-side login)
```

## Pages

| Page | File | Key Features |
|------|------|-------------|
| Dashboard | `Dashboard.jsx` | 65/35 layout, stats row, 3 tabs (Trucks/Flags/Audit), LIVE VIEW badge, 30s polling |
| Simulation | `Simulation.jsx` | Yellow sim banner, S1 epoch buttons + results, S2 fleet slider, confirm modals |
| AI Panel | `AIPanel.jsx` | Ask AI chat + Take Action cards (road_blocked, area_priority, area_blocked, reroute), 2-step approve |
| Driver View | `DriverView.jsx` | Admin-side: login by Truck ID, route display, acknowledge, flag submit |
| Driver Mobile | `DriverMobile.jsx` | Standalone: greeting, map, stop list, acknowledge, floating flag FAB + bottom sheet |

## Components

| Component | Purpose |
|-----------|---------|
| `MapView` | Leaflet map with zone polygons, truck markers, route polylines |
| `TruckList` | Truck card list with load factor colour bars |
| `ZonePanel` | Zone list with search, risk indicators, dumping toggle |
| `FlagPanel` | Flag management with status workflow |
| `ChatBox` | Legacy AI chat component (kept for backward compatibility) |

## API Client (`api.js`)

```javascript
// Zones:       getZones, getZone, createZone, updateZone, deleteZone, toggleDumping
// Trucks:      getTrucks, getTruck, createTruck, updateTruck, deleteTruck, updateRoute, updateLoad, updateStatus
// Drivers:     getDrivers, getDriver, createDriver, updateDriver, acknowledgeRoute, submitFlag, getDriverFlags
// Reports:     getSummary, getZoneRisk, getFlags, updateFlag, getRoutes, createRoute, approveRoute, getAuditLog
// AI:          aiChat, aiQuery, aiAction, suggestRoute, analyseZones, generateReport
// Simulation:  simEpoch, deployEpoch, simFleet, deployFleet
```

---

# 9. System State

| Property | Value |
|----------|-------|
| System State | S0 (baseline, no bins placed) |
| Zones | 42 (8 Market, 3 School, 3 Hospital, 20 Res_High, 6 Res_Low, 2 Industrial) |
| Trucks | 27 (all active, each with 1–2 assigned zones) |
| Modasa Center | `[23.4671, 73.0155]` |
| Zone Spread | 0.01–0.05 degrees from center |
| Depot Location | `[23.4671, 73.0155]` for all trucks |

---

# 10. Environment Variables

Create `/backend/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/municipal-waste
GROQ_API_KEY=gsk_your_groq_api_key_here
PORT=5000
```

---

# 11. How to Run the Project

## Backend

```bash
cd municipal-waste-app/backend

# Install dependencies (first time only)
npm install

# Seed database (first time only)
node seed.js

# Start server
node server.js
# → "Server running on port 5000"
# → "MongoDB connected"
```

## Frontend

```bash
cd municipal-waste-app/frontend

# Install dependencies (first time only)
npm install

# Start dev server
npm run dev
# → http://localhost:5173
```

## URLs

```
Admin Dashboard:    http://localhost:5173/
Simulation:         http://localhost:5173/simulation
AI Panel:           http://localhost:5173/ai
Driver Login:       http://localhost:5173/driver
Driver Mobile:      http://localhost:5173/driver/T01   (replace T01 with any truck ID)
Backend API:        http://localhost:5000/api/
```

---

# 12. Known Issues & Fixes Applied

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | `next is not a function` | Mongoose v7 removed `next` callback in pre-save middleware | Changed AuditLog to `throw` pattern |
| 2 | `{ new: true }` deprecation | Mongoose v7 uses `returnDocument: 'after'` | Replaced across all routes |
| 3 | Dashboard empty | `Promise.all` fails if one call fails | Changed to `Promise.allSettled` |
| 4 | Driver View "not found" | No Driver docs seeded; separate model | Backend looks up by Truck ID |
| 5 | Save & Deploy 404 | Missing `POST /reports/routes` | Added atomic upsert endpoint |
| 6 | Save & Deploy 400 (dup key) | Route compound index conflict | `findOneAndUpdate` with upsert |
| 7 | Chat empty bubbles | Frontend expected `{reply}`, backend sends `{answer}` | ChatBox extracts structured fields |
| 8 | API data unwrapping | Backend wraps in `{success, data}` | All api.js calls use `.data.data` |
| 9 | Route mounting conflicts | Reports/Drivers need root `/api` mount | Fixed server.js mount order |
| 10 | Flag submit validation error | `zoneId` was not being sent in request body | Fixed DriverView to pass zoneId |

---

# 13. Next Steps

1. **Authentication** — JWT-based auth for Admin vs Driver access control
2. **Socket.io Real-time** — Live truck location push + flag notification broadcasts
3. **Route Drag-and-Drop** — Admin can reorder zone stops visually on the map
4. **Push Notifications** — Notify drivers on route changes or flag acknowledgements
5. **Weather API** — Adjust route priorities based on Modasa weather (rainy = higher risk)
6. **Analytics Charts** — Historical data: route efficiency trends, flag frequency, load over time
7. **Geofencing Alerts** — When trucks enter/leave zone boundaries
8. **Unit/Integration Tests** — For routingEngine.js functions and API routes
9. **Production Deploy** — Vercel (frontend) + Render/Railway (backend)
10. **Mobile PWA** — Make DriverMobile installable as a Progressive Web App

---

*End of Project State Snapshot v2*
