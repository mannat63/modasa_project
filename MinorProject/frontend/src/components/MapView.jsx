import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, Polyline, CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { renderToString } from 'react-dom/server';
import { Trash2, AlertTriangle, Zap, Ban, Package, Check, X, Truck, Layers, Play, Pause } from 'lucide-react';

// ── Fix default Leaflet marker icons ────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Zone type → colour (tuned to read on satellite imagery) ─
const TYPE_COLORS = {
  Market:           '#F59E0B',
  School:           '#EF4444',
  Hospital:         '#DC2626',
  Residential_High: '#22C55E',
  Residential_Low:  '#4ADE80',
  Industrial:       '#94A3B8',
};

// ── Refined route palette (muted, premium) ──────────────
const ROUTE_COLORS = [
  '#C9A04B', '#5E82C4', '#4CAF87', '#D08A3E', '#9B7BC4',
  '#4FA5B8', '#C56B6B', '#7FA85A', '#5566B8', '#C77D52',
  '#3E9E92', '#8267B8', '#A6B04A', '#5B8FD1', '#D4A93E',
];

// ── Basemap definitions ─────────────────────────────────
const BASEMAPS = {
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  streets: {
    label: 'Streets',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
};

// ═══ OSRM road-geometry: cached + concurrency-limited ════
const memCache = new Map();
const LS_KEY = 'waste-osrm-cache';

function lsGet(key) {
  if (memCache.has(key)) return memCache.get(key);
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (store[key]) { memCache.set(key, store[key]); return store[key]; }
  } catch { /* ignore */ }
  return null;
}
function lsSet(key, val) {
  memCache.set(key, val);
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    store[key] = val;
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

// Simple concurrency limiter so we never hammer the OSRM demo server
let active = 0;
const waiting = [];
const MAX_CONCURRENT = 6;
function schedule(fn) {
  return new Promise((resolve) => {
    waiting.push({ fn, resolve });
    pump();
  });
}
function pump() {
  while (active < MAX_CONCURRENT && waiting.length) {
    const { fn, resolve } = waiting.shift();
    active++;
    Promise.resolve()
      .then(fn)
      .then(resolve)
      .catch(() => resolve(null))
      .finally(() => { active--; pump(); });
  }
}

async function fetchRoad(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const cached = lsGet(coordStr);
  if (cached) return cached;

  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?geometries=geojson&overview=full`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (data.code !== 'Ok' || !coords) return null;
    const latLngs = coords.map(([lng, lat]) => [lat, lng]);
    lsSet(coordStr, latLngs);
    return latLngs;
  } catch {
    return null;
  }
}

// ── Marker icons (clean, non-glowing) ───────────────────
const truckIcon = (color) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconAnchor: [9, 9],
    iconSize: [18, 18],
  });

const binIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:22px;height:22px;border-radius:6px;
    background:#2E7D5B;display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);
  ">${renderToString(<Trash2 color="#ffffff" size={12} />)}</div>`,
  iconAnchor: [11, 11],
  iconSize: [22, 22],
});

const blockedRoadIcon = L.divIcon({
  className: '',
  html: `<div title="Area Blocked" style="
    width:24px;height:24px;border-radius:5px;background:#1f2937;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);
  ">${renderToString(<Ban color="#ffffff" size={14} />)}</div>`,
  iconAnchor: [12, 12],
  iconSize: [24, 24],
});

const highPriorityIcon = L.divIcon({
  className: '',
  html: `<div title="High Priority Area" style="
    width:24px;height:24px;border-radius:50%;background:#B5792A;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);
  ">${renderToString(<Zap color="#ffffff" size={13} />)}</div>`,
  iconAnchor: [12, 12],
  iconSize: [24, 24],
});

// Moving vehicle marker for the live view
const liveVehicleIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:26px;height:26px;border-radius:50%;
    background:#C9A04B;border:2.5px solid #fff;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 10px rgba(0,0,0,0.55);
  ">${renderToString(<Truck color="#1B2234" size={14} />)}</div>`,
  iconAnchor: [13, 13],
  iconSize: [26, 26],
});

// ── Live fleet animation (imperative Leaflet — no React re-render per frame) ──
function pointAlong(geom, cum, total, frac) {
  if (total === 0) return geom[0];
  const target = frac * total;
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  if (i >= geom.length) return geom[geom.length - 1];
  const segLen = (cum[i] - cum[i - 1]) || 1;
  const sf = (target - cum[i - 1]) / segLen;
  const [a, b] = geom[i - 1];
  const [c, d] = geom[i];
  return [a + (c - a) * sf, b + (d - b) * sf];
}

function LiveFleetLayer({ trucks, active }) {
  const map = useMap();
  useEffect(() => {
    if (!active) return;
    const routes = trucks
      .filter((t) => t.status === 'active' && Array.isArray(t.routeGeometry) && t.routeGeometry.length >= 2)
      .map((t, idx, arr) => {
        const geom = t.routeGeometry;
        const cum = [0];
        for (let i = 1; i < geom.length; i++) {
          const [a, b] = geom[i - 1];
          const [c, d] = geom[i];
          cum.push(cum[i - 1] + Math.hypot(c - a, d - b));
        }
        return { id: t.truckId, geom, cum, total: cum[cum.length - 1], phase: idx / arr.length };
      });
    if (!routes.length) return;

    const PERIOD = 26; // seconds per full loop

    // Create every vehicle marker up-front (at its start position) so they
    // appear instantly on toggle, then animate them each frame.
    const markers = {};
    for (const r of routes) {
      markers[r.id] = L.marker(pointAlong(r.geom, r.cum, r.total, r.phase % 1), {
        icon: liveVehicleIcon, zIndexOffset: 1000, interactive: false,
      }).addTo(map);
    }

    const startT = performance.now();
    let raf;
    const loop = (t) => {
      const el = (t - startT) / 1000;
      for (const r of routes) {
        markers[r.id].setLatLng(pointAlong(r.geom, r.cum, r.total, ((el / PERIOD) + r.phase) % 1));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      Object.values(markers).forEach((mk) => map.removeLayer(mk));
    };
  }, [active, trucks, map]);
  return null;
}

// ── Scroll-lock: require Ctrl/Cmd + scroll to zoom ──────
function ScrollLockHandler() {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
    if (map.touchZoom) map.touchZoom.disable();
    const container = map.getContainer();
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); e.stopPropagation();
        if (e.deltaY < 0) map.zoomIn(); else map.zoomOut();
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [map]);
  return null;
}

/**
 * RouteLayer — renders a straight-line route INSTANTLY, then progressively
 * upgrades to road-following geometry (OSRM, cached + throttled).
 */
function RouteLayer({ waypoints, color, weight = 4, opacity = 0.85, road = true }) {
  const [roadCoords, setRoadCoords] = useState(() => {
    if (!road || !waypoints || waypoints.length < 2) return null;
    const key = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
    return lsGet(key);
  });

  const wpKey = useMemo(
    () => (waypoints || []).map((p) => p.join(',')).join(';'),
    [waypoints]
  );

  useEffect(() => {
    if (!road || !waypoints || waypoints.length < 2) return;
    if (roadCoords) return; // already have it (cache)
    let cancelled = false;
    schedule(() => fetchRoad(waypoints)).then((result) => {
      if (!cancelled && Array.isArray(result) && result.length >= 2) setRoadCoords(result);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpKey, road]);

  if (!waypoints || waypoints.length < 2) return null;
  const positions = roadCoords || waypoints;
  const isStraight = !roadCoords;

  return (
    <>
      {/* subtle casing for legibility on imagery */}
      <Polyline positions={positions} pathOptions={{ color: '#ffffff', weight: weight + 3, opacity: 0.35, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline
        positions={positions}
        pathOptions={{
          color, weight, opacity,
          lineCap: 'round', lineJoin: 'round',
          dashArray: isStraight ? '6 8' : undefined, // dashed until road geometry resolves
        }}
      />
    </>
  );
}

function ZoneActionMenu({ position, zone, mode, onAction, onClose }) {
  if (!position || !zone) return null;
  const actions = [
    { key: 'priority', label: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={14} /> Set High Priority Today</span>, modes: ['action', 'live'] },
    { key: 'block',    label: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ban size={14} /> Mark Area Blocked</span>,       modes: ['action', 'live'] },
    { key: 'bin',      label: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Package size={14} /> Place Bin Here</span>,       modes: ['simulation'] },
  ].filter((a) => a.modes.includes(mode));
  if (actions.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', zIndex: 1000, left: position.x, top: position.y,
      background: 'var(--surface)', borderRadius: 10, padding: 6,
      border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', minWidth: 190,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 10px', borderBottom: '1px solid var(--border)' }}>
        {zone.name} ({zone.zoneId})
      </div>
      {actions.map((a) => (
        <button key={a.key} onClick={() => { onAction(a.key, zone); onClose(); }}
          style={{ display: 'block', width: '100%', padding: '8px 10px', fontSize: 12, background: 'transparent', color: 'var(--text)', border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 6 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >{a.label}</button>
      ))}
    </div>
  );
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { if (onMapClick) onMapClick(e); } });
  return null;
}

// ═════════════════════════════════════════════════════════
// MAP VIEW
// ═════════════════════════════════════════════════════════
export default function MapView({
  zones = [],
  trucks = [],
  selectedTruck = null,
  onZoneClick = null,
  onRoadClick = null,
  highlightedIds = [],
  mode = 'live',
}) {
  const center = [23.47, 73.32];
  const [actionMenu, setActionMenu] = useState(null);
  const [basemap, setBasemap] = useState('satellite');
  const [live, setLive] = useState(false);
  const highlightSet = new Set(highlightedIds);

  const zoneMap = useMemo(() => {
    const m = {};
    for (const z of zones) m[z.zoneId] = z;
    return m;
  }, [zones]);

  const zoneToTruck = useMemo(() => {
    const m = {};
    for (const t of trucks) {
      for (const zId of (t.assignedZones || t.routeSequence || [])) {
        if (typeof zId === 'string') m[zId] = t.truckId;
        else if (zId?.zoneId) m[zId.zoneId] = t.truckId;
      }
    }
    return m;
  }, [trucks]);

  const buildWaypoints = (truck) => {
    const seq = truck?.routeSequence || [];
    if (seq.length < 1) return null;
    const depot = truck.depotLocation;
    const pts = [];
    if (depot?.length === 2) pts.push(depot);
    for (const item of seq) {
      const pt = item && typeof item === 'object' ? item.centerPoint : zoneMap[item]?.centerPoint;
      if (pt?.length === 2) pts.push(pt);
    }
    if (depot?.length === 2) pts.push(depot);
    return pts.length >= 2 ? pts : null;
  };

  const selectedWaypoints = useMemo(
    () => (selectedTruck ? buildWaypoints(selectedTruck) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTruck, zoneMap]
  );

  // Single-truck view (driver) counts as "focused" → show road route
  const focusedSingle = !selectedTruck && trucks.length === 1 ? trucks[0] : null;
  const focusedWaypoints = useMemo(
    () => (focusedSingle ? buildWaypoints(focusedSingle) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusedSingle, zoneMap]
  );

  const handleZoneClick = (zone, e) => {
    if (onZoneClick) onZoneClick(zone);
    if (mode === 'action' || mode === 'simulation') {
      const rect = e.originalEvent?.target?.closest?.('.map-container')?.getBoundingClientRect();
      if (rect) {
        setActionMenu({ zone, position: { x: e.originalEvent.clientX - rect.left, y: e.originalEvent.clientY - rect.top } });
      }
    }
  };
  const handleAction = (actionKey, zone) => { if (onZoneClick) onZoneClick(zone, actionKey); };

  const bm = BASEMAPS[basemap];

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={center} zoom={13}
        style={{ height: '100%', width: '100%' }}
        className="map-container"
        scrollWheelZoom={false} zoomControl={true}
        dragging={true} doubleClickZoom={true} touchZoom={false}
      >
        <TileLayer key={basemap} url={bm.url} attribution={bm.attribution} maxZoom={19} />
        {bm.labels && (
          <TileLayer key={`${basemap}-labels`} url={bm.labels} maxZoom={19} />
        )}

        <ScrollLockHandler />
        <MapClickHandler onMapClick={(e) => {
          setActionMenu(null);
          if (onRoadClick) onRoadClick([e.latlng.lat, e.latlng.lng]);
        }} />

        {/* ── Zone polygons ── */}
        {zones.map((zone) => {
          if (!zone.coordinates?.length) return null;
          const typeColor = TYPE_COLORS[zone.type] || '#94A3B8';
          const isBlocked = zone.blockedToday;
          const isHighlighted = highlightSet.has(zone.zoneId);
          return (
            <Polygon
              key={zone.zoneId}
              positions={zone.coordinates}
              pathOptions={{
                color: isBlocked ? '#1f2937' : isHighlighted ? '#C9A04B' : '#ffffff',
                fillColor: isBlocked ? '#1f2937' : typeColor,
                fillOpacity: isBlocked ? 0.5 : isHighlighted ? 0.5 : 0.35,
                weight: isHighlighted ? 3 : 1.5,
                opacity: isHighlighted ? 1 : 0.9,
                dashArray: isBlocked ? '8 4' : undefined,
              }}
              eventHandlers={{ click: (e) => handleZoneClick(zone, e) }}
            >
              <Popup>
                <div style={{ minWidth: 200, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  <strong style={{ color: isBlocked ? '#1f2937' : typeColor, fontSize: 14 }}>{zone.name}</strong>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{zone.zoneId} - {zone.type?.replace('_', ' ')}</div>
                  <hr style={{ margin: '6px 0', borderColor: 'var(--border)' }} />
                  <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                    <div>Risk Score: <b>{zone.riskScore ?? 'N/A'}</b></div>
                    <div>Severity: <b>{zone.visualSeverity ?? 'N/A'}/5</b></div>
                    <div>Waste Type: <b>{zone.wasteProfile || 'Mixed'}</b></div>
                    <div>Pickup: <b>{zone.pickupFrequency || 'daily'}</b></div>
                    <div>Smart Bin: <b style={{ color: zone.hasBin ? '#2E7D5B' : '#999' }}>
                      {zone.hasBin ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} /> Epoch {zone.binEpoch}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={12} /> None</span>}
                    </b></div>
                    <div>Assigned Truck: <b style={{ color: '#5E82C4' }}>{zoneToTruck[zone.zoneId] || '—'}</b></div>
                    {zone.illegalDumping && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#DC2626', fontWeight: 600, marginTop: 4 }}>
                        <AlertTriangle size={14} /> Illegal Dumping Reported
                      </div>
                    )}
                    {zone.highPriorityToday && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#B5792A', fontWeight: 700, marginTop: 4 }}><Zap size={14} /> HIGH PRIORITY — Deployed</div>
                    )}
                    {zone.blockedToday && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1f2937', fontWeight: 700, marginTop: 4 }}><Ban size={14} /> AREA BLOCKED — Deployed</div>
                    )}
                  </div>
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* ── Zone centre markers ── */}
        {zones.map((zone) => {
          if (!zone.centerPoint?.length) return null;
          const typeColor = TYPE_COLORS[zone.type] || '#94A3B8';
          if (zone.blockedToday) {
            return (
              <Marker key={`blocked-${zone.zoneId}`} position={zone.centerPoint} icon={blockedRoadIcon}>
                <Popup><div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 6 }}><Ban size={14} /> Area Blocked</div>
                  <div style={{ fontSize: 12 }}><b>{zone.name}</b><br />Zone {zone.zoneId} — access restricted today.</div>
                </div></Popup>
              </Marker>
            );
          }
          if (zone.highPriorityToday) {
            return (
              <Marker key={`hp-${zone.zoneId}`} position={zone.centerPoint} icon={highPriorityIcon}>
                <Popup><div style={{ fontFamily: 'Inter, sans-serif', minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#B5792A', marginBottom: 6 }}><Zap size={14} /> High Priority Area</div>
                  <div style={{ fontSize: 12 }}><b>{zone.name}</b><br />Zone {zone.zoneId} — priority servicing today.</div>
                </div></Popup>
              </Marker>
            );
          }
          if (zone.hasBin) {
            return (
              <Marker key={`bin-${zone.zoneId}`} position={zone.centerPoint} icon={binIcon}>
                <Popup><strong>{zone.name}</strong><br /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Trash2 size={12} /> Smart bin installed (Epoch {zone.binEpoch})</span></Popup>
              </Marker>
            );
          }
          return (
            <CircleMarker key={`c-${zone.zoneId}`} center={zone.centerPoint} radius={5}
              pathOptions={{ color: '#ffffff', fillColor: typeColor, fillOpacity: 0.95, weight: 1.5 }} />
          );
        })}

        {/* ── Routes (from precomputed road geometry — instant, reads as a real operation) ── */}
        {/* Solo / driver view: one prominent route */}
        {focusedSingle && (
          focusedSingle.routeGeometry?.length >= 2 ? (
            <>
              <Polyline positions={focusedSingle.routeGeometry} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }} />
              <Polyline positions={focusedSingle.routeGeometry} pathOptions={{ color: '#5E82C4', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
            </>
          ) : (focusedWaypoints && (
            <RouteLayer key={`foc-${focusedSingle?.truckId}`} waypoints={focusedWaypoints} color="#5E82C4" weight={5} opacity={0.95} road />
          ))
        )}

        {/* Fleet operation view: every active truck's road route */}
        {!focusedSingle && trucks.map((t, idx) => {
          const isSel = selectedTruck?.truckId === t.truckId;
          const geom = (Array.isArray(t.routeGeometry) && t.routeGeometry.length >= 2) ? t.routeGeometry : null;
          if (!geom) {
            if (isSel) {
              const wp = buildWaypoints(t);
              return wp ? <RouteLayer key={`osrm-${t.truckId}`} waypoints={wp} color="#C9A04B" weight={5} opacity={0.95} road /> : null;
            }
            return null;
          }
          return (
            <React.Fragment key={`geo-${t.truckId}`}>
              {isSel && <Polyline positions={geom} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }} />}
              <Polyline positions={geom} pathOptions={{
                color: isSel ? '#C9A04B' : ROUTE_COLORS[idx % ROUTE_COLORS.length],
                weight: isSel ? 5 : 2,
                opacity: isSel ? 0.95 : (selectedTruck ? 0.12 : 0.5),
                lineCap: 'round', lineJoin: 'round',
              }} />
            </React.Fragment>
          );
        })}

        {/* Live-moving fleet */}
        <LiveFleetLayer trucks={trucks} active={live} />

        {/* ── Truck markers ── */}
        {trucks.map((truck, idx) => {
          if (!truck.depotLocation?.length) return null;
          const color = truck.status === 'active' ? ROUTE_COLORS[idx % ROUTE_COLORS.length]
            : truck.status === 'standby' ? '#B5792A' : '#94A3B8';
          return (
            <Marker key={truck.truckId} position={truck.depotLocation} icon={truckIcon(color)}>
              <Popup><div style={{ fontFamily: 'Inter, sans-serif', minWidth: 150 }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}><Truck size={14} /> {truck.truckId}</strong>
                <div style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>
                  Driver: {truck.driverName ?? 'Unassigned'}<br />
                  Status: <span style={{ color: truck.status === 'active' ? '#2E7D5B' : '#B5792A' }}>{truck.status}</span><br />
                  Zones: {(truck.assignedZones || []).length}<br />
                  Load: {((truck.currentLoadFactor ?? 0) * 100).toFixed(0)}%<br />
                  Distance: {truck.estimatedDistance || 0} km
                </div>
              </div></Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ── Live movement toggle ── */}
      <button
        onClick={() => setLive((v) => !v)}
        title={live ? 'Pause live movement' : 'Play live fleet movement'}
        style={{
          position: 'absolute', top: 12, left: 52, zIndex: 600,
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
          borderRadius: 9, border: '1px solid var(--border)',
          background: live ? 'var(--accent)' : 'var(--surface)',
          color: live ? 'var(--on-accent)' : 'var(--text)',
          boxShadow: 'var(--shadow)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        }}
      >
        {live ? <Pause size={13} /> : <Play size={13} />}
        {live ? 'Live' : 'Play live'}
      </button>

      {/* ── Basemap switcher ── */}
      <div className="map-layers">
        <span style={{ display: 'flex', alignItems: 'center', padding: '0 6px', color: 'var(--text-muted)' }}><Layers size={13} /></span>
        {Object.entries(BASEMAPS).map(([key, def]) => (
          <button key={key} className={`map-layer-btn ${basemap === key ? 'map-layer-btn--active' : ''}`} onClick={() => setBasemap(key)}>
            {def.label}
          </button>
        ))}
      </div>

      {/* ── Floating action menu ── */}
      {actionMenu && (
        <ZoneActionMenu position={actionMenu.position} zone={actionMenu.zone} mode={mode} onAction={handleAction} onClose={() => setActionMenu(null)} />
      )}

      {/* ── Legend ── */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 500,
        background: 'var(--surface)', borderRadius: 10, padding: '10px 14px',
        border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', boxShadow: 'var(--shadow)',
      }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 5 }}>Zone Types</div>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            {type.replace('_', ' ')}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
          <span style={{ display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></span> Smart Bin
        </div>
      </div>

      {/* ── Zoom hint ── */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, zIndex: 500,
        background: 'var(--surface)', borderRadius: 8, padding: '5px 12px',
        fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      }}>
        Ctrl + Scroll to zoom
      </div>
    </div>
  );
}
