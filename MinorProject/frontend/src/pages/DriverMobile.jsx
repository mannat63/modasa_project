import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getTruck, getZones, getDriver, acknowledgeRoute, submitFlag } from '../utils/api';
import { onRouteDeploy } from '../utils/routeSync';
import { pushNotification } from '../utils/notifications';
import MapView from '../components/MapView';
import ShiftTracker from '../components/ShiftTracker';
import { Truck, Clock, AlertTriangle, CheckCircle, Navigation, Package, SkipForward, Flag, Ban } from 'lucide-react';

const FLAG_TYPES = [
  { key: 'road_blocked', icon: <Ban size={20} />, label: 'Road blocked' },
  { key: 'overloaded',   icon: <Package size={20} />, label: 'Stop overloaded' },
  { key: 'skipped',      icon: <SkipForward size={20} />, label: 'I skipped this stop' },
  { key: 'delay',        icon: <Clock size={20} />, label: 'Running late' },
];
const SKIP_REASONS = ['Inaccessible road', 'No waste present', 'Gate locked', 'Vehicle issue', 'Other'];

function timeStr(baseMinutes, stopIndex) {
  const totalMin = 7 * 60 + baseMinutes + stopIndex * 8;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function DriverMobile({ truckId: propTruckId }) {
  const params = useParams();
  const truckId = propTruckId || params.truckId;
  const [truck, setTruck] = useState(null);
  const [zones, setZones] = useState([]);
  const [todayRoute, setTodayRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);

  const [showFlag, setShowFlag] = useState(false);
  const [flagType, setFlagType] = useState('');
  const [flagZone, setFlagZone] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [flagLoading, setFlagLoading] = useState(false);

  const loadTruckData = useCallback(async () => {
    try {
      const [t, z, d] = await Promise.allSettled([getTruck(truckId), getZones(), getDriver(truckId)]);
      if (t.status === 'fulfilled') setTruck(t.value);
      if (z.status === 'fulfilled') setZones(z.value || []);
      if (d.status === 'fulfilled') setTodayRoute(d.value?.todayRoute || null);
      if (t.status !== 'fulfilled') setError('Could not load truck data.');
    } catch {
      setError('Could not load truck data.');
    }
    setLoading(false);
  }, [truckId]);

  useEffect(() => { loadTruckData(); }, [loadTruckData]);
  useEffect(() => onRouteDeploy(() => loadTruckData()), [loadTruckData]);

  // routeSequence may arrive as populated zone objects (from /trucks) or raw IDs.
  const routeSequence = (truck?.routeSequence || []).map((z) => (typeof z === 'string' ? z : z?.zoneId)).filter(Boolean);
  const routeZones = routeSequence.map((id) => zones.find((z) => z.zoneId === id)).filter(Boolean);
  const hasRoute = routeZones.length > 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const handleAcknowledge = async () => {
    setAckLoading(true);
    try {
      await acknowledgeRoute(truckId);
      setAcknowledged(true);
      pushNotification({ audience: 'admin', kind: 'ack', title: `${truckId} acknowledged route`, message: `${truck?.driverName || 'Driver'} confirmed today's route.` });
      toast.success('Route acknowledged! Drive safe.');
    } catch {
      setAcknowledged(true);
      toast.success('Route acknowledged!');
    }
    setAckLoading(false);
  };

  const handleFlag = async () => {
    if (!flagType) return;
    setFlagLoading(true);
    const zoneId = flagZone || routeSequence[0] || '';
    try {
      await submitFlag(truckId, { type: flagType, zoneId, skipReason: flagType === 'skipped' ? flagReason : '' });
      const zoneName = zones.find((z) => z.zoneId === zoneId)?.name || zoneId;
      const label = FLAG_TYPES.find((f) => f.key === flagType)?.label || flagType;
      pushNotification({ audience: 'admin', kind: 'flag', title: `Flag from ${truckId}`, message: `${label}${zoneName ? ` · ${zoneName}` : ''}` });
      toast.success('Issue reported. Your supervisor has been notified.');
      setFlagType(''); setFlagZone(''); setFlagReason('');
      setTimeout(() => setShowFlag(false), 1200);
    } catch (e) {
      toast.error('Failed to submit: ' + (e.response?.data?.error || e.message));
    }
    setFlagLoading(false);
  };

  if (loading) {
    return (
      <div style={shellStyle}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 80 }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} /> Loading route...
        </div>
      </div>
    );
  }

  if (error || !truck) {
    return (
      <div style={shellStyle}>
        <div style={{ textAlign: 'center', marginTop: 80, padding: 24 }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--gold)' }}><Truck size={48} /></div>
          <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>Truck {truckId}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>{error || 'Truck not found.'}</div>
        </div>
      </div>
    );
  }

  if (!hasRoute) {
    return (
      <div style={shellStyle}>
        <div style={{ textAlign: 'center', marginTop: 60, padding: 24 }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', color: 'var(--gold)' }}><Clock size={48} /></div>
          <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 600 }}>{greeting}, {truck.driverName || truckId}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 12, lineHeight: 1.6 }}>Your route for today has not been shared yet.<br />Check back soon.</div>
          <div style={{ marginTop: 20, padding: '8px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-block' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Truck: </span>
            <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>{truckId}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{greeting}, {truck.driverName || 'Driver'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{todayStr}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your truck: </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{truckId}</span>
          </div>
          <span className={`pill ${acknowledged ? 'pill--live' : 'pill--gold'}`}>
            {acknowledged ? <><CheckCircle size={14} /> Route Acknowledged</> : <><Clock size={14} /> Route Received</>}
          </span>
        </div>
      </div>

      {/* Map */}
      <div style={{ height: 240, position: 'relative' }}>
        <MapView zones={routeZones} trucks={[truck]} />
      </div>

      {/* Shift timer */}
      <div style={{ padding: '12px 16px 0' }}>
        <ShiftTracker truckId={truckId} driverName={truck.driverName} routeZones={routeZones} initialShift={todayRoute} />
      </div>

      {/* Stops */}
      <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Navigation size={14} /> Today's Stops ({routeZones.length})
        </div>
        {routeZones.map((z, i) => {
          const highPriority = (z.riskScore || 0) > 0.7;
          return (
            <div key={z.zoneId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 700 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{z.name}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                  <span style={{ padding: '1px 6px', borderRadius: 6, fontSize: 10, background: 'var(--surface-3)', color: 'var(--text-muted)' }}>{z.type?.replace('_', ' ')}</span>
                  {highPriority && <span style={{ padding: '1px 6px', borderRadius: 6, fontSize: 10, background: 'var(--danger-soft)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={10} /> High Priority</span>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>~{timeStr(0, i)}</div>
            </div>
          );
        })}
      </div>

      {/* Acknowledge */}
      {!acknowledged ? (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <button disabled={ackLoading} onClick={handleAcknowledge}
            style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: 'var(--success)', color: '#fff' }}>
            {ackLoading ? 'Acknowledging...' : <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><CheckCircle size={18} /> I've received today's route</div>}
          </button>
        </div>
      ) : (
        <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '10px 0', borderRadius: 12, background: 'var(--success-soft)', color: 'var(--success)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle size={16} /> Route Acknowledged</div>
        </div>
      )}

      {/* Flag FAB */}
      <button onClick={() => setShowFlag(true)}
        style={{ position: 'fixed', bottom: 24, right: 20, zIndex: 1000, width: 56, height: 56, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AlertTriangle size={24} />
      </button>

      {/* Flag sheet */}
      {showFlag && (
        <>
          <div onClick={() => setShowFlag(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,22,0.55)', zIndex: 2000 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2001, background: 'var(--surface)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 16px 32px', maxHeight: '70vh', overflowY: 'auto', maxWidth: 480, margin: '0 auto' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border-strong)', margin: '0 auto 16px' }} />
            <h3 style={{ color: 'var(--text)', margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={18} /> Flag an Issue</h3>

            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Which stop?</label>
            <select value={flagZone} onChange={(e) => setFlagZone(e.target.value)} className="select-input" style={{ marginBottom: 12 }}>
              <option value="">-- Current stop --</option>
              {routeZones.map((z, i) => <option key={z.zoneId} value={z.zoneId}>Stop {i + 1}: {z.name}</option>)}
            </select>

            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>What happened?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {FLAG_TYPES.map((ft) => (
                <button key={ft.key} onClick={() => setFlagType(ft.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: flagType === ft.key ? 'var(--accent-soft)' : 'var(--surface-2)', border: flagType === ft.key ? '2px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>{ft.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{ft.label}</span>
                </button>
              ))}
            </div>

            {flagType === 'skipped' && (
              <>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Reason for skipping</label>
                <select value={flagReason} onChange={(e) => setFlagReason(e.target.value)} className="select-input" style={{ marginBottom: 12 }}>
                  <option value="">-- Select reason --</option>
                  {SKIP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </>
            )}

            <button disabled={!flagType || flagLoading} onClick={handleFlag}
              style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', cursor: flagType ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 15, background: flagType ? 'var(--danger)' : 'var(--surface-3)', color: flagType ? '#fff' : 'var(--text-muted)' }}>
              {flagLoading ? 'Submitting...' : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Flag size={18} /> Submit Flag</div>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const shellStyle = {
  minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
  display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto',
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
};
