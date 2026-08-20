import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getSummary, getZones, getTrucks, getFlags, getAuditLog, updateFlag, getAttendance } from '../utils/api';
import { onRouteDeploy } from '../utils/routeSync';
import MapView from '../components/MapView';
import { generateTruckReport, downloadPdf, downloadAllAsZip } from '../utils/generateReport';
import { Truck, MapPin, Map, Flag, Box, AlertTriangle, Package, SkipForward, Clock, Download, RefreshCw, ClipboardList, CheckCircle, Navigation, Timer, CheckCircle2 } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────
const loadColor = (v) => (v > 0.85 ? 'var(--danger)' : v > 0.7 ? 'var(--warn)' : 'var(--success)');

const flagTypeIcons = {
  road_blocked: { icon: <AlertTriangle size={16} />, color: 'var(--danger)' },
  overloaded:   { icon: <Package size={16} />, color: 'var(--warn)' },
  skipped:      { icon: <SkipForward size={16} />, color: 'var(--warn)' },
  delay:        { icon: <Clock size={16} />, color: 'var(--info)' },
};

const statusColors = {
  pending:      { bg: 'var(--warn-soft)', text: 'var(--warn)', label: 'Pending' },
  acknowledged: { bg: 'var(--accent-soft)', text: 'var(--accent)', label: 'Acknowledged' },
  actioned:     { bg: 'var(--success-soft)', text: 'var(--success)', label: 'Actioned' },
};

const actorBadge = {
  admin:  { bg: 'var(--accent-soft)', color: 'var(--accent)', label: 'Admin' },
  driver: { bg: 'var(--warn-soft)', color: 'var(--warn)', label: 'Driver' },
  ai:     { bg: 'var(--gold-soft)', color: 'var(--gold)', label: 'Helper' },
  system: { bg: 'var(--surface-3)', color: 'var(--text-muted)', label: 'System' },
};

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Stat Card ───────────────────────────────────────────
const StatCard = ({ label, value, icon, color }) => (
  <div className="stat-card" style={{ '--card-accent': color }}>
    <span className="stat-icon">{icon}</span>
    <div>
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);

// ── Truck Card ──────────────────────────────────────────
function TruckCard({ truck, isSelected, onClick }) {
  const load = truck.currentLoadFactor || 0;
  const color = loadColor(load);
  const assignedCount = (truck.assignedZones || truck.routeSequence || []).length;

  return (
    <div className={`truck-card ${isSelected ? 'truck-card--selected' : ''}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 14, color: 'var(--text)' }}>{truck.truckId}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{assignedCount} zones</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{truck.driverName || '—'}</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Navigation size={12} /> {truck.estimatedDistance || 0} km</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {truck.estimatedDuration || 0} min</span>
      </div>
      <div className="load-bar-wrap">
        <div className="load-bar" style={{ width: `${(load * 100).toFixed(0)}%`, background: color }} />
      </div>
      <div style={{ fontSize: 10, color, marginTop: 2, textAlign: 'right' }}>{(load * 100).toFixed(0)}% load</div>
    </div>
  );
}

// ── Stop Sequence ───────────────────────────────────────
function StopSequence({ truck, zones }) {
  const seq = truck.routeSequence || [];
  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Navigation size={14} /> Route: {truck.truckId}
      </div>
      {seq.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No route assigned</div>}
      {seq.map((id, i) => {
        const z = zones.find((zn) => zn.zoneId === id);
        if (!z) return null;
        const highRisk = (z.riskScore || 0) > 0.7;
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0 }}>{i + 1}</span>
            <span style={{ color: 'var(--text)', flex: 1 }}>{z.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{z.type?.replace('_', ' ')}</span>
            {highRisk && <span style={{ color: 'var(--danger)' }} title="High Risk"><AlertTriangle size={14} /></span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Flag Card ───────────────────────────────────────────
function FlagCard({ flag, zones, onAcknowledge }) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const ft = flagTypeIcons[flag.type] || { icon: <Flag size={16} />, color: 'var(--text-muted)' };
  const st = statusColors[flag.status] || statusColors.pending;
  const zone = zones.find((z) => z.zoneId === flag.zoneId);

  return (
    <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 8, borderLeft: `3px solid ${ft.color}`, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: ft.color }}>
          <span>{ft.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{flag.truckId}</span>
        </div>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.text, fontWeight: 700 }}>{st.label}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        {zone?.name || flag.zoneId} — <span style={{ textTransform: 'capitalize' }}>{flag.type?.replace('_', ' ')}</span>
      </div>
      {flag.skipReason && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>"{flag.skipReason}"</div>}
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>{timeAgo(flag.timestamp || flag.createdAt)}</div>

      {flag.status === 'pending' && !showNote && (
        <button onClick={() => setShowNote(true)} style={{ marginTop: 8, padding: '5px 12px', fontSize: 11, borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Acknowledge</button>
      )}
      {showNote && (
        <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin note..."
            style={{ flex: 1, padding: '6px 8px', fontSize: 11, borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          <button onClick={() => { onAcknowledge(flag.flagId, note); setShowNote(false); setNote(''); }}
            style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, background: 'var(--success)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Send</button>
        </div>
      )}
    </div>
  );
}

// ── Audit Entry ─────────────────────────────────────────
function AuditEntry({ entry }) {
  const badge = actorBadge[entry.actor] || actorBadge.system;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <div style={{ width: 56, flexShrink: 0, color: 'var(--text-faint)', fontSize: 10 }}>{timeAgo(entry.timestamp || entry.createdAt)}</div>
      <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, flexShrink: 0, height: 18 }}>{badge.label}</span>
      <div style={{ color: 'var(--text)', flex: 1 }}>
        {entry.action?.replace(/_/g, ' ')}
        {entry.actorId && <span style={{ color: 'var(--text-faint)' }}> — {entry.actorId}</span>}
      </div>
    </div>
  );
}

// ── Attendance Card ─────────────────────────────────────
function fmtTime(d) {
  return d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
}
function fmtDur(min) {
  if (!min) return '0m';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function AttendanceCard({ row, zones }) {
  const present = row.attendance === 'present';
  const stateColor = row.onDuty ? 'var(--success)' : present ? 'var(--gold)' : 'var(--text-faint)';
  const stateLabel = row.onDuty ? 'On duty' : present ? 'Completed' : 'Absent';
  const zoneName = (id) => zones.find((z) => z.zoneId === id)?.name || id;

  return (
    <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: `3px solid ${stateColor}`, borderRadius: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{row.truckId}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{row.driverName}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 10, color: stateColor, background: 'color-mix(in srgb, currentColor 14%, transparent)' }}>{stateLabel}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        <span><Clock size={11} style={{ verticalAlign: -1 }} /> {fmtTime(row.shiftStartedAt)}{row.shiftEndedAt ? `–${fmtTime(row.shiftEndedAt)}` : ''}</span>
        <span><Timer size={11} style={{ verticalAlign: -1 }} /> {fmtDur(row.durationMin)}</span>
        <span><CheckCircle2 size={11} style={{ verticalAlign: -1 }} /> {row.stopsReached}/{row.totalStops} stops</span>
      </div>
      {row.stopProgress?.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {row.stopProgress.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--text)' }}>{zoneName(s.zoneId)}</span>
              <span style={{ color: 'var(--text-muted)' }}>{fmtTime(s.reachedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ═════════════════════════════════════════════════════════
export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [zones, setZones] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [flags, setFlags] = useState([]);
  const [audit, setAudit] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [tab, setTab] = useState('trucks');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const [s, z, t, f, a, at] = await Promise.allSettled([
      getSummary(), getZones(), getTrucks(), getFlags(), getAuditLog(), getAttendance(),
    ]);
    if (s.status === 'fulfilled') setSummary(s.value);
    if (z.status === 'fulfilled') setZones(z.value || []);
    if (t.status === 'fulfilled') setTrucks(t.value || []);
    if (f.status === 'fulfilled') setFlags(f.value || []);
    if (a.status === 'fulfilled') setAudit((a.value || []).slice(0, 50));
    if (at.status === 'fulfilled') setAttendance(at.value || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(true);
    pollRef.current = setInterval(() => load(false), 30000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => onRouteDeploy(() => load(false)), [load]);

  const handleAcknowledge = async (flagId, note) => {
    try {
      await updateFlag(flagId, { adminNote: note, actorId: 'admin' });
      toast.success('Flag acknowledged successfully');
      load();
    } catch (e) {
      toast.error('Failed to acknowledge flag: ' + (e.response?.data?.error || e.message));
    }
  };

  const pendingCount = flags.filter((f) => f.status === 'pending').length;
  const onDutyCount = attendance.filter((a) => a.onDuty).length;
  const displayTrucks = useMemo(() => trucks.filter((t) => t.status !== 'inactive'), [trucks]);
  const mapTrucks = selectedTruck ? displayTrucks.filter((t) => t.truckId === selectedTruck.truckId) : displayTrucks;

  return (
    <div className="page page--fill">
      <div className="page-header">
        <h1 className="page-title"><Map size={24} /> Municipal Waste Control</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="pill pill--live"><span className="pill-dot pill-dot--pulse" /> LIVE VIEW</span>
          <button className="refresh-btn" onClick={() => { const today = new Date().toLocaleDateString('en-IN'); downloadAllAsZip(trucks, zones, today); }}>
            <Download size={14} /> Download All PDFs
          </button>
          <button className="refresh-btn" onClick={() => { load(true); toast.success('Dashboard refreshed'); }}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {summary && (
        <div className="stats-row">
          <StatCard label="Active Trucks" value={summary.activeTrucks} icon={<Truck size={20} />} color="var(--success)" />
          <StatCard label="Total Zones" value={summary.totalZones} icon={<MapPin size={20} />} color="var(--accent)" />
          <StatCard label="Deployed Today" value={summary.activeRoutes} icon={<Map size={20} />} color="var(--gold)" />
          <StatCard label="Pending Flags" value={summary.pendingFlags} icon={<Flag size={20} />} color="var(--danger)" />
          <StatCard label="Avg Load" value={`${(summary.avgLoadFactor * 100).toFixed(0)}%`} icon={<Box size={20} />} color="var(--warn)" />
        </div>
      )}

      <div className="workspace-body">
        {/* Map — fixed, never scrolls */}
        <div className="map-wrap workspace-map" style={{ flex: '0 0 64%' }}>
          {loading && (<div className="loading-overlay"><div className="spinner" /><span>Loading routes...</span></div>)}
          <MapView zones={zones} trucks={mapTrucks} selectedTruck={selectedTruck} />
        </div>

        {/* Side — pinned focus at top, scrollable list below */}
        <div className="workspace-side" style={{ flex: '0 0 calc(36% - 16px)' }}>
          {/* Pinned selected-truck focus */}
          {selectedTruck && (
            <div className="workspace-pinned" style={{ marginBottom: 10 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><Truck size={16} /> {selectedTruck.truckId}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selectedTruck.driverName}</div>
                  </div>
                  <button className="mini-btn" style={{ marginTop: 0 }} onClick={() => setSelectedTruck(null)}>Close</button>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span><Navigation size={12} style={{ verticalAlign: -1 }} /> {selectedTruck.estimatedDistance} km</span>
                  <span><Clock size={12} style={{ verticalAlign: -1 }} /> {selectedTruck.estimatedDuration} min</span>
                  <span style={{ color: loadColor(selectedTruck.currentLoadFactor || 0) }}><Box size={12} style={{ verticalAlign: -1 }} /> {((selectedTruck.currentLoadFactor || 0) * 100).toFixed(0)}% load</span>
                </div>
                <StopSequence truck={selectedTruck} zones={zones} />
                <button onClick={() => { const today = new Date().toLocaleDateString('en-IN'); const blob = generateTruckReport(selectedTruck, zones, today); downloadPdf(blob, `Route_${selectedTruck.truckId}_${(selectedTruck.driverName || '').replace(/\s+/g, '_')}.pdf`); }}
                  style={{ marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Download size={14} /> Download Route PDF
                </button>
              </div>
            </div>
          )}

          <div className="tab-row workspace-pinned">
            {[
              { key: 'trucks', icon: <Truck size={14} />, text: 'Trucks', count: displayTrucks.length, tone: 'neutral' },
              { key: 'attendance', icon: <Timer size={14} />, text: 'Shifts', count: onDutyCount, tone: 'success' },
              { key: 'flags', icon: <Flag size={14} />, text: 'Flags', count: pendingCount, tone: 'danger' },
              { key: 'audit', icon: <ClipboardList size={14} />, text: 'Audit', count: null },
            ].map((t) => (
              <button key={t.key} className={`tab-btn ${tab === t.key ? 'tab-btn--active' : ''}`} onClick={() => setTab(t.key)}>
                {t.icon}{t.text}
                {t.count > 0 && <span className={`tab-count tab-count--${t.tone}`}>{t.count}</span>}
              </button>
            ))}
          </div>

          <div className="workspace-scroll" style={{ marginTop: 8 }}>
            {tab === 'trucks' && (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {displayTrucks.filter((t) => t.status === 'active').length} active &nbsp;|&nbsp; {zones.length} zones covered
                  {pendingCount > 0 && <span style={{ color: 'var(--danger)', marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> {pendingCount} unacknowledged flag(s)</span>}
                </div>
                {displayTrucks.map((t) => (
                  <TruckCard key={t.truckId} truck={t} isSelected={selectedTruck?.truckId === t.truckId} onClick={() => setSelectedTruck(selectedTruck?.truckId === t.truckId ? null : t)} />
                ))}
              </>
            )}

            {tab === 'attendance' && (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {onDutyCount} on duty &nbsp;|&nbsp; {attendance.filter((a) => a.attendance === 'present').length} present today
                </div>
                {attendance.filter((a) => a.status !== 'inactive').map((a) => (
                  <AttendanceCard key={a.truckId} row={a} zones={zones} />
                ))}
              </>
            )}

            {tab === 'flags' && (
              <>
                {flags.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon"><CheckCircle size={32} /></div>
                    <div className="empty-state-text">No flags reported today — all clear!</div>
                  </div>
                )}
                {flags.map((f) => <FlagCard key={f.flagId || f._id} flag={f} zones={zones} onAcknowledge={handleAcknowledge} />)}
              </>
            )}

            {tab === 'audit' && (
              <>
                {audit.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon"><ClipboardList size={32} /></div>
                    <div className="empty-state-text">No audit entries yet.<br />Actions will appear here as they happen.</div>
                  </div>
                )}
                {audit.map((e, i) => <AuditEntry key={e._id || i} entry={e} />)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
