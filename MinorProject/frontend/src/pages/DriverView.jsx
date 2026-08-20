import React, { useEffect, useState } from 'react';
import { getDriver, getDriverFlags, acknowledgeRoute, submitFlag } from '../utils/api';
import MapView from '../components/MapView';
import { getTrucks, getZones } from '../utils/api';
import { onRouteDeploy } from '../utils/routeSync';
import { pushNotification } from '../utils/notifications';
import ShiftTracker from '../components/ShiftTracker';
import { Truck, CheckCircle, ClockIcon, Flag } from 'lucide-react';

const FLAG_TYPES = ['road_blocked', 'overloaded', 'skipped', 'delay'];

export default function DriverView({ truckId: preAuthId }) {
  const [driverId, setDriverId] = useState(preAuthId || '');
  const [inputId,  setInputId]  = useState('');
  const [driver,   setDriver]   = useState(null);
  const [flags,    setFlags]    = useState([]);
  const [zones,    setZones]    = useState([]);
  const [truck,    setTruck]    = useState(null);
  const [flagForm, setFlagForm] = useState({ type: 'skipped', zoneId: '', skipReason: '' });
  const [msg,      setMsg]      = useState('');

  const loginWithId = async (id) => {
    if (!id?.trim()) return;
    setMsg('');
    try {
      const d = await getDriver(id.trim());
      setDriver(d);
      setDriverId(id.trim());

      const [allZones, f] = await Promise.allSettled([
        getZones(),
        getDriverFlags(id.trim()),
      ]);

      if (allZones.status === 'fulfilled') setZones(allZones.value || []);
      if (f.status === 'fulfilled') setFlags(f.value || []);

      setTruck({
        truckId: d.truckId,
        routeSequence: d.routeSequence || [],
        driverName: d.name,
      });
    } catch {
      setMsg('Error: Driver not found. Please enter a Truck ID (e.g., T01)');
    }
  };

  const login = () => loginWithId(inputId);

  // Auto-login if pre-authenticated from LoginPage
  useEffect(() => {
    if (preAuthId && !driver) {
      loginWithId(preAuthId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preAuthId]);

  // Re-fetch truck/zone data on any route deployment
  useEffect(() => {
    if (!driverId) return;
    return onRouteDeploy(async () => {
      try {
        const [d, z] = await Promise.allSettled([getDriver(driverId), getZones()]);
        if (d.status === 'fulfilled') {
          setDriver(d.value);
          setTruck({
            truckId: d.value.truckId,
            routeSequence: d.value.routeSequence || [],
            driverName: d.value.name,
          });
        }
        if (z.status === 'fulfilled') setZones(z.value || []);
      } catch { /* silent */ }
    });
  }, [driverId]);

  const routeZones = truck?.routeSequence
    ?.map((id) => zones.find((z) => z.zoneId === id))
    .filter(Boolean) ?? [];



  const acknowledge = async () => {
    try {
      await acknowledgeRoute(driverId);
      setDriver((d) => ({ ...d, todayRouteAcknowledged: true }));
      setMsg('Success: Route acknowledged.');
    } catch (e) {
      const detail = e.response?.data?.error || e.message;
      setMsg('Error: ' + detail);
    }
  };

  const submitFlagHandler = async () => {
    try {
      await submitFlag(driverId, flagForm);
      pushNotification({
        audience: 'admin', kind: 'flag',
        title: `Flag from ${truck?.truckId || driverId}`,
        message: `${flagForm.type?.replace('_', ' ')}${flagForm.zoneId ? ` · ${flagForm.zoneId}` : ''}`,
      });
      setMsg('Success: Flag submitted.');
      const f = await getDriverFlags(driverId);
      setFlags(f || []);
    } catch (e) {
      const detail = e.response?.data?.error || e.message;
      setMsg('Error: ' + detail);
    }
  };

  if (!driver) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="panel" style={{ maxWidth: 380, width: '100%' }}>
          <h2 className="panel-title" style={{ textAlign: 'center', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Truck size={20}/> Driver Login</h2>
          <input
            className="search-input"
            placeholder="Enter your Truck ID (e.g., T01)..."
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
          />
          <button className="action-btn" style={{ marginTop: 12, width: '100%' }} onClick={login}>
            Log In
          </button>
          {msg && <p className="sub-note" style={{ color: '#ef4444', marginTop: 8 }}>{msg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="page page--fill">
      <div className="page-header">
        <h1 className="page-title" style={{display:'flex', alignItems:'center', gap:8}}><Truck size={24}/> Driver: {driver.name}</h1>
        <span className={`badge ${driver.todayRouteAcknowledged ? 'badge--green' : 'badge--yellow'}`} style={{display:'flex', alignItems:'center', gap:4}}>
          {driver.todayRouteAcknowledged ? <><CheckCircle size={14}/> Route Acknowledged</> : <><ClockIcon size={14}/> Pending Acknowledgement</>}
        </span>
      </div>

      <div className="workspace-body">
        {/* Left panel — scroll */}
        <div className="workspace-side" style={{ width: 340, flexShrink: 0 }}>
        <div className="workspace-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Route */}
          <div className="panel">
            <h3 className="panel-title">Today's Route — {truck?.truckId ?? 'No truck assigned'}</h3>
            {routeZones.length === 0 && <p className="empty-msg">No route assigned.</p>}
            <ol className="route-sequence">
              {routeZones.map((z, i) => (
                <li key={z.zoneId}>
                  <span className="seq-num">{i + 1}</span> {z.name}
                  <span className="seq-type"> ({z.type})</span>
                </li>
              ))}
            </ol>
            {!driver.todayRouteAcknowledged && (
              <button className="action-btn action-btn--green" style={{ marginTop: 12, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }} onClick={acknowledge}>
                <CheckCircle size={14}/> Acknowledge Route
              </button>
            )}
          </div>

          {/* Shift timer / attendance */}
          {routeZones.length > 0 && (
            <ShiftTracker truckId={driverId} driverName={driver.name} routeZones={routeZones} initialShift={driver.todayRoute} />
          )}

          {/* Flag form */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h3 className="panel-title" style={{display:'flex', alignItems:'center', gap:6}}><Flag size={16}/> Submit Flag</h3>
            <select
              className="select-input"
              value={flagForm.type}
              onChange={(e) => setFlagForm((p) => ({ ...p, type: e.target.value }))}
            >
              {FLAG_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <select
              className="select-input"
              style={{ marginBottom: 8 }}
              value={flagForm.zoneId}
              onChange={(e) => setFlagForm((p) => ({ ...p, zoneId: e.target.value }))}
            >
              <option value="">-- Select the stop / zone --</option>
              {routeZones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>{z.name} ({z.zoneId})</option>
              ))}
              {routeZones.length === 0 && zones.map((z) => (
                <option key={z.zoneId} value={z.zoneId}>{z.name} ({z.zoneId})</option>
              ))}
            </select>
            <input
              className="search-input"
              placeholder="Reason (optional)"
              value={flagForm.skipReason}
              onChange={(e) => setFlagForm((p) => ({ ...p, skipReason: e.target.value }))}
            />
            <button className="action-btn" style={{ marginTop: 8 }} onClick={submitFlagHandler}>
              Submit Flag
            </button>
          </div>

          {msg && <p className="sub-note" style={{ marginTop: 8 }}>{msg}</p>}

          {/* Past flags */}
          {flags.length > 0 && (
            <div className="panel">
              <h3 className="panel-title">My Flags</h3>
              {flags.map((f) => (
                <div key={f.flagId} className="item-card" style={{ marginBottom: 6 }}>
                  <strong>{f.type}</strong> — {f.zoneId}
                  <span className="badge" style={{ marginLeft: 8 }}>{f.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Map — fixed */}
        <div className="map-wrap workspace-map" style={{ flex: 1 }}>
          <MapView zones={routeZones} trucks={truck ? [truck] : []} />
        </div>
      </div>
    </div>
  );
}
