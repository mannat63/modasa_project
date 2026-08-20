import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE,
  // Without a timeout a stalled request hangs forever and the UI sits on
  // "Loading…" indefinitely. Fail fast instead so the page can recover.
  timeout: 15000,
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0',
  }
});

// ── Zones ──────────────────────────────────────────
export const getZones      = ()          => api.get('/zones').then(r => r.data.data);
export const getZone       = (id)        => api.get(`/zones/${id}`).then(r => r.data.data);
export const createZone    = (body)      => api.post('/zones', body).then(r => r.data.data);
export const updateZone    = (id, body)  => api.put(`/zones/${id}`, body).then(r => r.data.data);
export const deleteZone    = (id)        => api.delete(`/zones/${id}`).then(r => r.data.data);
export const toggleDumping = (id)        => api.put(`/zones/${id}/block`).then(r => r.data.data);

// ── Trucks ─────────────────────────────────────────
export const getTrucks     = ()          => api.get('/trucks').then(r => r.data.data);
export const getTruck      = (id)        => api.get(`/trucks/${id}`).then(r => r.data.data);
export const createTruck   = (body)      => api.post('/trucks', body).then(r => r.data.data);
export const updateTruck   = (id, body)  => api.put(`/trucks/${id}`, body).then(r => r.data.data);
export const deleteTruck   = (id)        => api.delete(`/trucks/${id}`).then(r => r.data.data);
export const updateRoute   = (id, body)  => api.put(`/trucks/${id}/route`, body).then(r => r.data.data);
export const updateLoad    = (id, load)  => api.patch(`/trucks/${id}/load`, { currentLoadFactor: load }).then(r => r.data.data);
export const updateStatus  = (id, status)=> api.patch(`/trucks/${id}/status`, { status }).then(r => r.data.data);

// ── Drivers ────────────────────────────────────────
export const getDrivers        = ()          => api.get('/drivers').then(r => r.data.data);
export const getDriver         = (id)        => api.get(`/drivers/${id}`).then(r => r.data.data);
export const createDriver      = (body)      => api.post('/drivers', body).then(r => r.data.data);
export const updateDriver      = (id, body)  => api.put(`/drivers/${id}`, body).then(r => r.data.data);
export const acknowledgeRoute  = (id)        => api.patch(`/drivers/${id}/acknowledge`).then(r => r.data.data);
export const submitFlag        = (id, body)  => api.post(`/drivers/${id}/flag`, body).then(r => r.data.data);
export const getDriverFlags    = (id)        => api.get(`/drivers/${id}/flags`).then(r => r.data.data);

// ── Driver shift / timer / attendance ─────────────
export const startShift    = (id)          => api.post(`/drivers/${id}/shift/start`).then(r => r.data.data);
export const checkinStop   = (id, zoneId)  => api.post(`/drivers/${id}/shift/checkin`, { zoneId }).then(r => r.data.data);
export const endShift      = (id)          => api.post(`/drivers/${id}/shift/end`).then(r => r.data.data);
export const getAttendance = ()            => api.get('/attendance').then(r => r.data.data);

// ── Reports ────────────────────────────────────────
export const getSummary    = ()          => api.get('/reports/summary').then(r => r.data.data);
export const getZoneRisk   = ()          => api.get('/reports/zones/risk').then(r => r.data.data);
export const getFlags      = (params)    => api.get('/flags', { params }).then(r => r.data.data);
export const updateFlag    = (id, body)  => api.put(`/flags/${id}/acknowledge`, body).then(r => r.data.data);
export const getRoutes     = (params)    => api.get('/reports/routes', { params }).then(r => r.data.data);
export const createRoute   = (body)      => api.post('/reports/routes', body).then(r => r.data.data);
export const approveRoute  = (id, body)  => api.patch(`/reports/routes/${id}/approve`, body).then(r => r.data.data);
export const getAuditLog   = (params)    => api.get('/audit', { params }).then(r => r.data.data);
export const deployRoutes  = (body)      => api.post('/reports/distribute', body).then(r => r.data.data);
export const acknowledgeFlag = (id, note) => api.put(`/flags/${id}/acknowledge`, { adminNote: note, actorId: 'admin' }).then(r => r.data.data);

// ── AI ─────────────────────────────────────────────
export const aiChat          = (body)    => api.post('/ai/chat', body).then(r => r.data.data);
export const aiQuery         = (body)    => api.post('/ai/query', body).then(r => r.data.data);
export const aiAction        = (body)    => api.post('/ai/action', body).then(r => r.data.data);
export const suggestRoute    = (body)    => api.post('/ai/suggest-route', body).then(r => r.data.data);
export const analyseZones    = ()        => api.post('/ai/analyse-zones').then(r => r.data.data);
export const generateReport  = (body)    => api.post('/ai/generate-report', body).then(r => r.data.data);

// ── Simulation ─────────────────────────────────────
export const simEpoch        = (n)       => api.get(`/simulation/epoch/${n}`).then(r => r.data.data);
export const deployEpoch     = (n, body) => api.post(`/simulation/epoch/${n}/deploy`, body).then(r => r.data.data);
export const simFleet        = (body)    => api.post('/simulation/fleet', body).then(r => r.data.data);
export const deployFleet     = (body)    => api.post('/simulation/fleet/deploy', body).then(r => r.data.data);

// ── Road Blocked Deploy ─────────────────────────────────
// Called ONLY on "Deploy Now" — persists blockedToday=true and reroutes trucks.
export const deployRoadBlocked = (body) => api.post('/ai/deploy-road-blocked', body).then(r => r.data.data);
