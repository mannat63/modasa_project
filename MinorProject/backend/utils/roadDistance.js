/**
 * Road-network distance provider.
 *
 * Builds a distance function distFn(a, b) → kilometres between two [lat, lng]
 * points, backed by OSRM's Table (distance-matrix) service so the optimiser
 * reasons about REAL road-network distances instead of straight-line
 * great-circle distance.
 *
 * Design goals:
 *  - One matrix call per optimisation context (not one call per pair), via the
 *    OSRM `table` service, then O(1) lookups during routing.
 *  - Results cached per exact point-set for the process lifetime, so repeated
 *    requests over the same (static) depots/zones reuse a single network call.
 *  - Transparent Haversine fallback: if OSRM is unavailable, rate-limited,
 *    times out, or a point is missing from the matrix, routing silently falls
 *    back to great-circle distance. The app NEVER breaks because of OSRM.
 */

const { calculateDistance } = require('./routingEngine');

// Public demo server. Supports the Table service with distance annotations.
const OSRM_TABLE_BASE = 'https://router.project-osrm.org/table/v1/driving/';

// Demo server caps the matrix at 100 coordinates; stay safely under it.
const MAX_POINTS = 100;

const keyOf = (p) => `${(+p[0]).toFixed(5)},${(+p[1]).toFixed(5)}`;

// Global, process-lifetime cache keyed by the exact set of points.
// setHash -> { source: 'osrm'|'haversine', idx?: Map, matrix?: number[][] }
const _cache = new Map();

function setHash(points) {
  return points.map(keyOf).sort().join('|');
}

/**
 * Fetch a road-distance matrix (metres) from OSRM for the given points.
 * Returns number[][] on success, or null on any failure (caller falls back).
 */
async function osrmTable(points, timeoutMs) {
  // OSRM expects lng,lat order; it returns distances in metres.
  const coordStr = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_TABLE_BASE}${coordStr}?annotations=distance`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code !== 'Ok' || !Array.isArray(data.distances)) return null;
    return data.distances; // metres, data.distances[i][j]
  } catch {
    return null; // network error, abort/timeout, bad JSON → fallback
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a distance function over the supplied [lat,lng] points.
 *
 * @param {number[][]} points - all points that routing will query (depot(s) + zone centres)
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=3000] - abort the OSRM call after this long
 * @param {boolean} [opts.enabled=true] - set false to force Haversine (e.g. tests)
 * @returns {Promise<Function>} distFn(a, b) → km (road distance, Haversine fallback)
 */
async function buildDistFn(points, opts = {}) {
  const { timeoutMs = 3000, enabled = true } = opts;

  // De-duplicate points by rounded key.
  const uniq = [];
  const seen = new Set();
  for (const p of points || []) {
    if (!p || p.length < 2 || p[0] == null || p[1] == null) continue;
    const k = keyOf(p);
    if (!seen.has(k)) { seen.add(k); uniq.push(p); }
  }

  // Not worth (or not possible to) build a matrix → plain Haversine.
  if (!enabled || uniq.length < 2 || uniq.length > MAX_POINTS) {
    return calculateDistance;
  }

  const hash = setHash(uniq);
  let entry = _cache.get(hash);

  if (!entry) {
    const matrix = await osrmTable(uniq, timeoutMs);
    if (matrix) {
      const idx = new Map(uniq.map((p, i) => [keyOf(p), i]));
      entry = { source: 'osrm', idx, matrix };
    } else {
      entry = { source: 'haversine' };
    }
    _cache.set(hash, entry);
  }

  if (entry.source !== 'osrm') return calculateDistance;

  const { idx, matrix } = entry;
  return function roadDist(a, b) {
    const ia = idx.get(keyOf(a));
    const ib = idx.get(keyOf(b));
    if (ia == null || ib == null) return calculateDistance(a, b);
    const metres = matrix[ia] && matrix[ia][ib];
    if (metres == null || !isFinite(metres)) return calculateDistance(a, b);
    return parseFloat((metres / 1000).toFixed(3));
  };
}

/** Diagnostic: was the last matrix for these points served by OSRM or fallback? */
function sourceFor(points) {
  const uniq = [];
  const seen = new Set();
  for (const p of points || []) {
    if (!p || p.length < 2) continue;
    const k = keyOf(p);
    if (!seen.has(k)) { seen.add(k); uniq.push(p); }
  }
  return _cache.get(setHash(uniq))?.source || 'unknown';
}

module.exports = { buildDistFn, sourceFor };
