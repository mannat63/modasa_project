# WasteRoute AI — Municipal Waste Management System
### Modasa, Gujarat, India | Full-Stack AI-Powered Operations Platform

> Built with React + Vite · Node.js + Express · MongoDB Atlas · Groq AI (GPT-OSS 120B)

---

## 🗺 What It Does

A complete municipal waste management platform for the town of Modasa (~60,000 population):

- **Live Fleet Dashboard** — 27 trucks on a real-time Leaflet map with zone polygons, load bars, and route overlays
- **AI Operations Center** — Ask questions in natural language; get structured answers with map highlights and action suggestions
- **Simulation Sandbox** — Bin placement epochs (S1/S2/S3) and fleet size optimization with before/after metrics
- **Driver Mobile Portal** — Standalone mobile view per truck (`/driver/:truckId`) for route acknowledgement and flag submission
- **PDF Report Generation** — Per-truck and bulk ZIP download of official route documents
- **Immutable Audit Trail** — Every write operation logged with actor, action, and outcome

---

## ⚡ Quick Start (Local)

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone the repo
```bash
git clone https://github.com/your-username/wasteroute-ai.git
cd wasteroute-ai
```

### 2. Set up Backend
```bash
cd municipal-waste-app/backend
npm install
```

Create `backend/.env`:
```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/municipal-waste
GROQ_API_KEY=gsk_your_groq_key_here
PORT=5000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### 3. Seed the Database
```bash
npm run seed
# → Seeds 42 zones and 27 trucks for Modasa
```

### 4. Start Backend
```bash
npm start          # Production
npm run dev        # Development (with nodemon auto-restart)
# → Server running on port 5000
# → MongoDB connected
```

### 5. Set up Frontend
```bash
cd ../frontend
npm install
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

### 6. Start Frontend
```bash
npm run dev
# → http://localhost:5173
```

---

## 🌐 Access URLs (Local)

| Page | URL |
|------|-----|
| Admin Dashboard | http://localhost:5173/ |
| Simulation Sandbox | http://localhost:5173/simulation |
| AI Operations Center | http://localhost:5173/ai |
| Driver Login (admin) | http://localhost:5173/driver |
| Driver Mobile (field) | http://localhost:5173/driver/T01 |
| Backend Health | http://localhost:5000/ |

---

## 🚀 Deployment

### Backend → Render

1. Push code to GitHub
2. Create new **Web Service** on [render.com](https://render.com)
3. Settings:
   - **Root Directory**: `municipal-waste-app/backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add Environment Variables in Render dashboard:
   ```
   MONGODB_URI      = your Atlas URI
   GROQ_API_KEY     = your Groq key
   PORT             = 10000
   FRONTEND_URL     = https://your-vercel-app.vercel.app
   NODE_ENV         = production
   ```

### Frontend → Vercel

1. Create new project on [vercel.com](https://vercel.com)
2. Settings:
   - **Root Directory**: `municipal-waste-app/frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variable:
   ```
   VITE_API_URL = https://your-render-app.onrender.com/api
   ```

---

## 📡 API Endpoints

### Trucks `/api/trucks`
```
GET    /api/trucks                     → All 27 trucks
GET    /api/trucks/:id                 → Single truck by truckId
PUT    /api/trucks/:id/route           → Update route sequence
GET    /api/trucks/:id/today-route     → Today's deployed route
POST   /api/trucks/:id/deploy-route    → Deploy route for today
```

### Zones `/api/zones`
```
GET    /api/zones                      → All 42 zones
GET    /api/zones/blocked              → Blocked zones only
GET    /api/zones/:id                  → Single zone
PUT    /api/zones/:id/priority         → Update priorityWeight
PUT    /api/zones/:id/bin              → Set hasBin + binEpoch
PUT    /api/zones/:id/block            → Block zone for today
PUT    /api/zones/:id/unblock          → Unblock zone
```

### Drivers & Flags `/api`
```
GET    /api/drivers/:id                → Look up driver by truck ID
GET    /api/drivers/:id/flags          → Driver's submitted flags
PATCH  /api/drivers/:id/acknowledge    → Acknowledge today's route
POST   /api/drivers/:id/flag           → Submit a flag
GET    /api/flags                      → All flags (?status=pending)
PUT    /api/flags/:id/acknowledge      → Admin acknowledge flag
```

### Reports & Audit `/api`
```
GET    /api/reports/summary            → Dashboard stat cards
GET    /api/reports/today              → Trucks with today's routes
POST   /api/reports/generate           → Bulk daily snapshots
POST   /api/reports/routes             → Create/update single route
POST   /api/reports/distribute         → Mark routes as distributed
GET    /api/audit                      → Last 100 audit entries
```

### AI `/api/ai`
```
POST   /api/ai/query                   → Chat question → structured JSON response
POST   /api/ai/action                  → Operational action proposals (4 types)
POST   /api/ai/chat                    → Legacy alias for /query
POST   /api/ai/suggest-route           → Greedy route suggestion for a truck
POST   /api/ai/analyse-zones           → Zone risk analysis
POST   /api/ai/generate-report         → Full markdown daily operations report
```

### Simulation `/api/simulation`
```
GET    /api/simulation/epoch/:n        → Simulate bin epoch (1/2/3) — read only
POST   /api/simulation/epoch/:n/deploy → Deploy epoch to live DB + reroute trucks
POST   /api/simulation/fleet           → Fleet optimization analysis — read only
POST   /api/simulation/fleet/deploy    → Deploy fleet plan to live DB
```

---

## 🤖 AI Model

- **Provider**: [Groq](https://console.groq.com)
- **Model**: `openai/gpt-oss-120b`
- **Usage**: Structured JSON responses for chat queries, operational action proposals, zone analysis, and daily report generation

---

## 🗄 Database

- **Platform**: MongoDB Atlas (Mongoose ODM v9+)
- **Collections**: zones, trucks, drivers, flags, auditlogs, routes
- **Seed data**: 42 zones + 27 trucks for Modasa, Gujarat

---

## ✅ Test Checklist

Run through these after setup to verify the system:

- [ ] `npm run seed` runs without errors → 42 zones, 27 trucks in DB
- [ ] All 27 trucks load on map at `localhost:5173`
- [ ] All 42 zones show as colored polygons
- [ ] Click a truck card → route polyline appears on map
- [ ] Click a zone polygon → popup shows name, type, risk, assigned truck
- [ ] Go to `/driver/T01` → mobile view loads with route
- [ ] Submit a flag → appears in Dashboard → Flags tab
- [ ] Acknowledge flag → toast confirms, flag status updates
- [ ] Ask AI: "Which zones need attention today?" → structured response
- [ ] Epoch 1 simulation → before/after truck metrics table
- [ ] Deploy Epoch 1 → confirm modal → zones update in DB
- [ ] Click "Download Route PDF" on a truck → PDF downloads
- [ ] Click "Download All PDFs" → ZIP file downloads
- [ ] Every action creates an entry in Dashboard → Audit tab

---

## 📁 Project Structure

```
municipal-waste-app/
├── backend/
│   ├── .env                    # MONGODB_URI, GROQ_API_KEY, PORT, FRONTEND_URL
│   ├── server.js               # Express entry + route mounting + CORS
│   ├── seed.js                 # Seeds 42 zones + 27 trucks
│   ├── models/                 # Zone, Truck, Driver, Flag, AuditLog, Route
│   ├── routes/                 # trucks, zones, drivers, reports, ai, simulation
│   └── utils/
│       └── routingEngine.js    # 6 core algorithms (greedy, haversine, fleet, etc.)
│
└── frontend/
    ├── .env                    # VITE_API_URL
    ├── src/
    │   ├── App.jsx             # Router + SystemBadge + Toaster
    │   ├── pages/              # Dashboard, Simulation, AIPanel, DriverView, DriverMobile
    │   ├── components/         # MapView, ConfirmModal, TruckList, ZonePanel, FlagPanel
    │   └── utils/
    │       ├── api.js          # Axios client — all 40+ endpoints
    │       └── generateReport.js  # jsPDF report generator
    └── index.css               # Dark-mode design system
```

---

## 🔐 Security Notes

- Driver access is currently lookup-based via Truck ID — **add JWT auth before production**
- Keep `.env` files out of version control (`.gitignore` already handles this)
- Rotate your Groq API key if this repo is made public
