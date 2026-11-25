const mongoose = require('mongoose');
require('dotenv').config();

const Zone = require('./models/Zone');
const Truck = require('./models/Truck');
const { greedyRouteOptimize, calculateRouteMetrics } = require('./utils/routingEngine');
const { buildDistFn } = require('./utils/roadDistance');

const MODASA_CENTER = [23.47, 73.32];

const indianNames = [
  "Ramesh Patel", "Suresh Kumar", "Rahul Sharma", "Amit Singh", "Vikram Rathore",
  "Mahesh Babu", "Prakash Desai", "Gopal Iyer", "Dinesh Reddy", "Arun Varma",
  "Raju Gupta", "Rajesh Jha", "Anil Chawla", "Sunil Joshi", "Ajay Mehra",
  "Vijay Menon", "Sanjay Das", "Kamal Narayan", "Ashok Pandey", "Kiran Rao",
  "Deepak Goyal", "Pankaj Tiwari", "Naveen Soni", "Ravi Verma", "Mohan Yadav",
  "Bhavesh Mistry", "Karthik Nair"
];

const actualTypes = [
  ...Array(8).fill('Market'),
  ...Array(3).fill('School'),
  ...Array(3).fill('Hospital'),
  ...Array(20).fill('Residential_High'),
  ...Array(6).fill('Residential_Low'),
  ...Array(2).fill('Industrial')
];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => Math.random() * (max - min) + min;

const getRisk = (type) => {
  if (type === 'Market') return randFloat(0.7, 0.9);
  if (type === 'School' || type === 'Hospital') return randFloat(0.6, 0.8);
  if (type === 'Industrial') return randFloat(0.5, 0.7);
  return randFloat(0.3, 0.6); // Residential
};

const getSeverity = (type) => {
  if (type === 'Market') return randInt(3, 5);
  if (type === 'School' || type === 'Hospital') return randInt(2, 4);
  return randInt(2, 3);
};

const getZoneName = (i, type) => `${type.replace('_', ' ')} Area ${i + 1}`;

// Fisher–Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch a road-following polyline from OSRM for waypoints [[lat,lng],...].
// Returns array of [lat,lng] or null (caller falls back to straight lines).
async function fetchRoadGeometry(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?geometries=geojson&overview=full`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (data.code !== 'Ok' || !coords) return null;
    return coords.map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;
  }
}

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/municipal-waste');
    console.log('MongoDB connected for seeding...');

    await Zone.deleteMany({});
    await Truck.deleteMany({});

    // ── 1. Create zones ──────────────────────────────────
    const zones = [];
    for (let i = 0; i < actualTypes.length; i++) {
      const type = actualTypes[i];
      const dirLat = Math.random() > 0.5 ? 1 : -1;
      const dirLng = Math.random() > 0.5 ? 1 : -1;
      const latOffset = randFloat(0.01, 0.05) * dirLat;
      const lngOffset = randFloat(0.01, 0.05) * dirLng;
      const centerPoint = [MODASA_CENTER[0] + latOffset, MODASA_CENTER[1] + lngOffset];

      const d = 0.003;
      const coordinates = [
        [centerPoint[0] - d, centerPoint[1] - d],
        [centerPoint[0] + d, centerPoint[1] - d],
        [centerPoint[0] + d, centerPoint[1] + d],
        [centerPoint[0] - d, centerPoint[1] + d],
        [centerPoint[0] - d, centerPoint[1] - d],
      ];

      const zone = new Zone({
        zoneId: `Z${(i + 1).toString().padStart(3, '0')}`,
        name: getZoneName(i, type),
        type,
        riskScore: parseFloat(getRisk(type).toFixed(2)),
        coordinates,
        centerPoint,
        pickupFrequency: 'daily',
        hasBin: false,
        wasteProfile: type === 'Industrial' ? 'Dry' : (type === 'Market' ? 'Organic' : 'Mixed'),
        visualSeverity: getSeverity(type),
      });
      await zone.save();
      zones.push(zone);
    }

    // ── 2. Assign every zone to exactly one truck (round-robin) ──
    // Guarantees full coverage; trucks end up with 1–2 zones each.
    const NUM_TRUCKS = 27;
    const shuffledZones = shuffle(zones);
    const buckets = Array.from({ length: NUM_TRUCKS }, () => []);
    shuffledZones.forEach((z, i) => buckets[i % NUM_TRUCKS].push(z));

    const zoneById = {};
    for (const z of zones) zoneById[z.zoneId] = z;

    // ── 3. Build each truck with REAL routing metrics + road geometry ──
    let totalLoad = 0;
    let geomOk = 0;

    // Pre-generate every truck's depot (~±2km around Modasa) so we can build a
    // single road-distance matrix covering all depots + zone centres up front.
    const depots = Array.from({ length: NUM_TRUCKS }, () => [
      MODASA_CENTER[0] + randFloat(-0.018, 0.018),
      MODASA_CENTER[1] + randFloat(-0.018, 0.018),
    ]);

    // One OSRM road-distance matrix for the whole dataset (depots + zone centres).
    // greedy ordering + metrics then run on REAL road distances; Haversine fallback
    // if OSRM is unavailable.
    const allPoints = [...depots, ...zones.map((z) => z.centerPoint)];
    const roadDist = await buildDistFn(allPoints, { timeoutMs: 8000 });
    const { sourceFor } = require('./utils/roadDistance');
    console.log(`Distance basis: ${sourceFor(allPoints) === 'osrm' ? 'OSRM road network' : 'Haversine (OSRM unavailable)'}`);

    console.log('Computing routes + road geometry (throttled to be gentle on OSRM)...');
    for (let i = 0; i < NUM_TRUCKS; i++) {
      const depot = depots[i];
      const zoneObjs = buckets[i];

      // Order the stops with the greedy (priority + nearest-neighbour) engine
      const orderedIds = greedyRouteOptimize(zoneObjs, depot, roadDist);
      const orderedZones = orderedIds.map((id) => zoneById[id]).filter(Boolean);

      // Real distance / duration / load factor (road-network distances)
      const metrics = calculateRouteMetrics(orderedZones, depot, roadDist);
      totalLoad += metrics.loadFactor;

      // Road-following geometry for depot -> stops -> depot (fallback: straight)
      const waypoints = [depot, ...orderedZones.map((z) => z.centerPoint), depot];
      let geometry = await fetchRoadGeometry(waypoints);
      if (geometry) geomOk++; else geometry = waypoints;
      await sleep(180);

      const truck = new Truck({
        truckId: `T${(i + 1).toString().padStart(2, '0')}`,
        driverName: indianNames[i % indianNames.length],
        driverPhone: `+91 ${randInt(9000000000, 9999999999)}`,
        depotLocation: depot,
        status: 'active',
        assignedZones: orderedIds,
        routeSequence: orderedIds,
        estimatedDistance: metrics.totalDistance,
        estimatedDuration: metrics.estimatedDuration,
        currentLoadFactor: metrics.loadFactor,
        routeGeometry: geometry,
      });
      await truck.save();
    }

    const avgLoad = (totalLoad / NUM_TRUCKS) * 100;
    console.log(`Seeded ${zones.length} zones and ${NUM_TRUCKS} trucks`);
    console.log(`Avg load factor across fleet: ${avgLoad.toFixed(1)}%`);
    console.log(`Road geometry: ${geomOk}/${NUM_TRUCKS} via OSRM, ${NUM_TRUCKS - geomOk} straight-line fallback`);
    process.exit(0);
  } catch (e) {
    console.error('Seeding error:', e);
    process.exit(1);
  }
}
seed();
