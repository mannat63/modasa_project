# Municipal Waste Management System — Project State Snapshot v1

> **Last Updated:** 2026-04-03  
> **Location:** Modasa, Gujarat, India  
> **Project Path:** `municipal-waste-app/`

---

# 1. Project Overview

A full-stack municipal waste management application for the town of **Modasa, India** (population ~60,000). The system enables:

- **Real-time fleet tracking** on an interactive Leaflet map with zone polygons and truck markers
- **AI-powered route optimization** using Groq (Llama 3.3-70b) for intelligent suggestions and operational reports
- **Greedy nearest-neighbour route simulation** with priority-weighted zone sequencing
- **Bin epoch simulation** (S1) for phased smart-bin placement across 3 tiers
- **Fleet optimization** (S2) for reducing fleet size while maintaining zone coverage
- **Driver portal** for route acknowledgement and real-time flag submission
- **Admin dashboard** with zones, trucks, flags, audit trails, and summary statistics
- **Immutable audit logging** for every write operation

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
| Package Mgr   | npm                               |

---

# 3. Folder Structure

```
municipal-waste-app/
├── project_state_v1.md              # This file
│
├── backend/
│   ├── .env                         # MONGODB_URI, GROQ_API_KEY, PORT
│   ├── package.json
│   ├── server.js                    # Express entry point + route mounting
│   ├── seed.js                      # Populates 42 zones + 27 trucks
│   │
│   ├── models/
│   │   ├── Zone.js                  # Zone schema
│   │   ├── Truck.js                 # Truck schema
│   │   ├── Driver.js                # Driver schema (not seeded separately)
│   │   ├── Flag.js                  # Driver-submitted flags
│   │   ├── AuditLog.js             # Immutable audit trail
│   │   └── Route.js                 # Daily route snapshots
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
│       └── routingEngine.js         # Haversine, greedy optimizer, bin sim, fleet opt
│
├── frontend/
│   ├── vite.config.js
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── App.jsx                  # Router shell + navigation
│       ├── main.jsx                 # Entry point
│       ├── index.css                # Global dark-mode design system
│       │
│       ├── pages/
│       │   ├── Dashboard.jsx        # S0 live operations view
│       │   ├── Simulation.jsx       # S1/S2 simulation sandbox
│       │   ├── AIPanel.jsx          # AI chat, zone analysis, reports
│       │   └── DriverView.jsx       # Driver login + route display + flags
│       │
│       ├── components/
│       │   ├── MapView.jsx          # Leaflet map with polygons + markers
│       │   ├── TruckList.jsx        # Truck card list with load bars
│       │   ├── ZonePanel.jsx        # Zone list with risk indicators
│       │   ├── FlagPanel.jsx        # Flag management panel
│       │   └── ChatBox.jsx          # AI chat with structured responses
│       │
│       └── utils/
│           ├── api.js               # Axios wrapper — all API endpoints
│           └── routeUtils.js        # Frontend haversine + greedy routing
```

---

# 4. Database Schemas

## Zone

```javascript
{
  zoneId:              String,    // unique, e.g. "Z001"–"Z042"
  name:                String,    // e.g. "Market Area 1"
  type:                String,    // enum: Market, Residential_High, Residential_Low,
                                  //       School, Hospital, Industrial
  riskScore:           Number,    // 0–1
  priorityWeight:      Number,    // Market=1.5, School=1.4, Hospital=1.4,
                                  // Industrial=1.2, Res_High=1.0, Res_Low=0.7
  coordinates:         [[Number]], // polygon boundary [[lat,lng], ...]
  centerPoint:         [Number],  // [lat, lng]
  pickupFrequency:     String,    // enum: daily, alternate
  hasBin:              Boolean,   // default: false
  binEpoch:            Number,    // 0=none, 1/2/3=which epoch placed it
  wasteProfile:        String,    // enum: Mixed, Organic, Dry
  visualSeverity:      Number,    // 1–5
  illegalDumping:      Boolean,
  sensitiveInstitution:Boolean,
  healthRiskLevel:     Number,    // 1–3
  blockedToday:        Boolean,   // admin can block a zone
}
```

## Truck

```javascript
{
  truckId:            String,    // unique, e.g. "T01"–"T27"
  driverName:         String,    // Indian name from seed
  driverPhone:        String,    // +91 format
  capacity:           Number,    // 0–1 normalized, default 1.0
  currentLoadFactor:  Number,    // 0–1
  status:             String,    // enum: active, inactive, standby
  assignedZones:      [String],  // array of zoneId strings
  routeSequence:      [String],  // ordered zoneIds for route
  estimatedDistance:   Number,    // km
  estimatedDuration:   Number,    // minutes
  depotLocation:      [Number],  // [lat, lng] near Modasa center
}
```

## Route (Daily Snapshot)

```javascript
{
  date:               Date,      // required
  truckId:            String,    // required
  routeSequence:      [String],  // ordered zoneIds
  status:             String,    // enum: draft, deployed, completed
  approvedBy:         String,    // admin user ID or name
  approvedAt:         Date,
  totalDistance:       Number,    // km
  totalDuration:       Number,    // minutes
  specialInstructions: String,
  systemState:        String,    // enum: S0, S1, S2
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
  type:        String,    // road_blocked, overloaded, skipped, delay
  skipReason:  String,
  status:      String,    // enum: pending, acknowledged, actioned
  adminNote:   String,
  timestamp:   Date,      // default: Date.now
}
```

## AuditLog (Immutable)

```javascript
{
  timestamp:  Date,      // default: Date.now
  actor:      String,    // enum: admin, driver, system, ai
  actorId:    String,
  action:     String,    // e.g. UPDATE_TRUCK_ROUTE, SUBMIT_FLAG
  details:    Mixed,     // flexible object
  outcome:    String,
}
// Pre-save hook: throws Error if document is not new (immutability)
// Uses Mongoose v7 pattern: throw, NOT next() callback
```

## Driver

```javascript
{
  driverId:                String,     // unique
  name:                    String,     // required
  phone:                   String,
  truckId:                 ObjectId,   // ref → Truck
  todayRouteAcknowledged:  Boolean,    // default: false
}
// NOTE: Drivers are NOT seeded separately.
// GET /api/drivers/:id looks up by Truck ID and constructs
// a virtual driver object from Truck data.
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

## Trucks (`/api/trucks`)

```
GET    /api/trucks                    → All trucks (with populated zone data)
GET    /api/trucks/:id                → Single truck by truckId
PUT    /api/trucks/:id/route          → Update route sequence (requires approvedBy)
GET    /api/trucks/:id/today-route    → Today's deployed route
POST   /api/trucks/:id/deploy-route   → Deploy route for today
```

## Zones (`/api/zones`)

```
GET    /api/zones                     → All zones
GET    /api/zones/blocked             → All blocked zones
GET    /api/zones/:id                 → Single zone by zoneId
PUT    /api/zones/:id/priority        → Update priorityWeight
PUT    /api/zones/:id/bin             → Set hasBin + binEpoch
PUT    /api/zones/:id/block           → Block zone for today
PUT    /api/zones/:id/unblock         → Unblock zone
```

## Drivers & Flags (`/api`)

```
GET    /api/drivers/:id               → Look up driver by Truck ID
GET    /api/drivers/:id/flags         → Driver's submitted flags
PATCH  /api/drivers/:id/acknowledge   → Acknowledge today's route
POST   /api/drivers/:id/flag          → Submit a flag
GET    /api/flags                     → All flags (?status=pending filter)
PUT    /api/flags/:id/acknowledge     → Admin acknowledge flag (with adminNote)
```

## Reports & Audit (`/api`)

```
GET    /api/reports/summary           → Dashboard stat cards (counts, avg load)
GET    /api/reports/today             → Trucks with today's deployed routes
POST   /api/reports/generate          → Bulk daily snapshots for all trucks
POST   /api/reports/routes            → Create/update single route (atomic upsert)
GET    /api/audit                     → Last 100 audit entries
```

## AI (`/api/ai`)

```
POST   /api/ai/query                  → Full-context question → structured JSON response
POST   /api/ai/action                 → Operational action proposals (road_blocked,
                                        area_blocked, area_priority, reroute_truck)
POST   /api/ai/chat                   → Legacy alias for /query (accepts message or question)
POST   /api/ai/suggest-route          → Greedy route suggestion for a truck
POST   /api/ai/analyse-zones          → Zone risk analysis with AI recommendations
POST   /api/ai/generate-report        → Full markdown daily operations report
```

## Simulation (`/api/simulation`)

```
GET    /api/simulation/epoch/:n       → Simulate bin epoch (1/2/3) — returns metrics
POST   /api/simulation/epoch/:n/deploy→ Deploy epoch to live DB (updates hasBin)
POST   /api/simulation/fleet          → Fleet optimization analysis
POST   /api/simulation/fleet/deploy   → Deploy fleet plan to live DB
```

---

# 6. Routing Engine (`/backend/utils/routingEngine.js`)

```
calculateDistance(point1, point2)
  → Haversine formula, returns km between two [lat, lng] points

calculateRouteMetrics(zoneSequence, depotLocation)
  → Returns { totalDistance, estimatedDuration, loadFactor }
  → Assumes 15 km/h avg speed + 5 min/stop overhead
  → loadFactor = sum(priorityWeights) / (numZones * 1.5), capped at 1.0

greedyRouteOptimize(zones, depotLocation)
  → Priority-biased nearest-neighbour sequencing
  → effectiveDist = distance / priorityWeight (high priority = shorter effective dist)
  → Returns ordered array of zoneIds

simulateBinEpoch(allZones, epochNumber)
  → Epoch 1: Top 20% by riskScore get bins
  → Epoch 2: Next 20% get bins
  → Epoch 3: Next 15% get bins
  → Reduces priorityWeight by 0.2 for binned zones
  → Returns { updatedZones, binsPlaced, estimatedStopsReduced }

fleetOptimize(trucks, zones, targetFleetSize)
  → Deactivates trucks with fewest zones first
  → Round-robin redistributes orphaned zones
  → Checks if any truck exceeds 0.92 load factor
  → Returns { feasible, updatedTrucks, infeasibleReasons, metricsComparison }

findAlternativeRoutes(truckId, blockedRoads, blockedZones, allTrucks, allZones)
  → Strategy 1: Skip blocked zones
  → Strategy 2: Substitute with nearest unassigned zones
  → Strategy 3: Reverse-priority ordering
  → Returns array of alternatives with extraDistance, newETA, tradeOffs
```

---

# 7. Current Features Working

- ✅ **Dashboard** — Stat cards, 3-tab panel (Trucks/Flags/Audit), interactive map, 30s polling
- ✅ **Truck Cards** — Load factor bars (green/yellow/red), click to show route on map
- ✅ **Flag System** — Driver submit → admin acknowledge with notes → status workflow
- ✅ **Audit Trail** — Immutable log with actor badges (Admin/Driver/AI/System)
- ✅ **Route Simulation** — S1 bin epoch (3 phases) + S2 fleet optimization with feasibility check
- ✅ **Confirmation Modals** — Before any live DB deployment
- ✅ **AI Chat** — Groq-powered with structured responses (answer + dataPoints + recommendation)
- ✅ **AI Zone Analysis** — Risk ranking with AI-generated recommendations
- ✅ **AI Daily Report** — Full markdown operations report from live data
- ✅ **AI Action Proposals** — road_blocked, area_blocked, area_priority, reroute_truck
- ✅ **Driver Login** — By Truck ID, shows assigned route, acknowledge button, flag submission
- ✅ **Leaflet Map** — Zone polygons, truck markers, route polylines
- ✅ **Save & Deploy** — Route snapshot creation with atomic upsert
- ✅ **Data Seeded** — 42 zones, 27 trucks for Modasa

---

# 8. Frontend Structure

## Pages

| Page          | Route          | Purpose                                        |
|---------------|----------------|------------------------------------------------|
| Dashboard     | `/`            | Live ops: stats, map, trucks, flags, audit     |
| Simulation    | `/simulation`  | S1 bin epochs + S2 fleet optimization sandbox  |
| AIPanel       | `/ai`          | Chat, zone analysis, report generation         |
| DriverView    | `/driver`      | Login by Truck ID → route → acknowledge → flag |

## Components

| Component  | Purpose                                            |
|------------|---------------------------------------------------|
| MapView    | Leaflet map with zone polygons, truck markers, polylines |
| TruckList  | Truck cards with load factor colour bars           |
| ZonePanel  | Zone list with search, risk bars, dumping toggle   |
| FlagPanel  | Flag management with status workflow               |
| ChatBox    | AI chat with structured response rendering (answer + dataPoints + recommendation) |

---

# 9. System State

| Property         | Value                                             |
|------------------|---------------------------------------------------|
| System State     | S0 (no bins placed by default)                    |
| Zones Seeded     | 42 (8 Market, 3 School, 3 Hospital, 20 Res_High, 6 Res_Low, 2 Industrial) |
| Trucks Seeded    | 27 (all active, each with 1-2 assigned zones)     |
| Modasa Center    | `[23.4671, 73.0155]`                              |
| Zone Spread      | 0.01–0.05 degrees from center                     |
| Depot Location   | Same as Modasa center for all trucks               |

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

# Install dependencies (if first time)
npm install

# Ensure .env has MONGODB_URI, GROQ_API_KEY, PORT=5000

# Seed database (only needed once)
node seed.js

# Start server
node server.js
# → "Server running on port 5000"
# → "MongoDB connected"
```

## Frontend

```bash
cd municipal-waste-app/frontend

# Install dependencies (if first time)
npm install

# Start dev server
npm run dev
# → Opens at http://localhost:5173
```

---

# 12. Known Issues & Fixes Applied

| #  | Issue                                   | Root Cause                                        | Fix Applied                                    |
|----|----------------------------------------|--------------------------------------------------|------------------------------------------------|
| 1  | `next is not a function`               | Mongoose v7 removed `next` callback in middleware | Changed AuditLog pre-save to use `throw`       |
| 2  | `{ new: true }` deprecation warnings   | Mongoose v7 uses `returnDocument: 'after'`       | Replaced across all route files                |
| 3  | Dashboard empty after changes          | `Promise.all` fails entirely if one call fails   | Changed to `Promise.allSettled`                |
| 4  | Driver View "not found"                | No Driver documents seeded; separate model       | Backend now looks up by Truck ID               |
| 5  | Save & Deploy 404                      | Missing `POST /reports/routes` endpoint          | Added upsert endpoint in reports.js            |
| 6  | Save & Deploy 400 (duplicate key)      | Route compound index `{date, truckId}` conflict  | Changed to `findOneAndUpdate` with upsert      |
| 7  | Chat shows empty bubbles               | Frontend expected `{reply}`, backend sends `{answer}` | Fixed ChatBox to extract structured response |
| 8  | API `r.data` vs `r.data.data`          | Backend wraps in `{success, data}`               | All API utils unwrap `.data.data`              |
| 9  | Route mounting conflicts               | Reports/Drivers needed root `/api` mount         | Fixed server.js mount order                    |

---

# 13. Next Steps

The following features and improvements should be implemented next:

1. **Authentication** — Implement JWT or session-based auth for Admin vs Driver access control
2. **Real-time Updates** — Integrate Socket.io for live truck location push and flag notifications
3. **Route Editing** — Allow admins to manually drag-and-drop reorder zones in a truck's route
4. **Notification System** — Push notifications to drivers when routes change or flags are acknowledged
5. **Weather Integration** — Pull Modasa weather data to adjust route priorities on rainy days
6. **Analytics Dashboard** — Historical charts showing route efficiency, flag trends, load factor over time
7. **Geofencing** — Alert when trucks enter/leave zone boundaries
8. **Testing Suite** — Unit tests for routingEngine.js functions and integration tests for API routes
9. **Production Deployment** — Configure Vercel (frontend) + Render/Railway (backend) with production env vars
10. **Mobile Responsiveness** — Make Driver View fully mobile-friendly for field use

---

*End of Project State Snapshot v1*
