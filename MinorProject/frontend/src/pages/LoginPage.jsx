import React, { useState, useEffect } from 'react';
import { Recycle, Shield, Truck, Eye, EyeOff, ArrowRight, AlertCircle, MapPin, User } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { getTrucks, getZones } from '../utils/api';

const ADMIN_CREDS = { username: 'admin', password: 'admin123' };

export default function LoginPage({ onLogin }) {
  const [role, setRole]         = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [truckId, setTruckId]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [shake, setShake]       = useState(false);
  const [fleet, setFleet]       = useState(null);

  // Load the real fleet so drivers can pick themselves by name + show live counts.
  useEffect(() => {
    let off = false;
    Promise.allSettled([getTrucks(), getZones()]).then(([t, z]) => {
      if (off) return;
      const trucks = t.status === 'fulfilled' ? (t.value || []) : [];
      const zones  = z.status === 'fulfilled' ? (z.value || []) : [];
      if (trucks.length) setFleet({ trucks: trucks.filter((x) => x.status !== 'inactive'), zoneCount: zones.length });
    });
    return () => { off = true; };
  }, []);

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 420); };
  const switchRole = (r) => { setRole(r); setError(''); setUsername(''); setPassword(''); setTruckId(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await new Promise((r) => setTimeout(r, 450));

    if (role === 'admin') {
      if (username.trim() === ADMIN_CREDS.username && password === ADMIN_CREDS.password) {
        onLogin({ role: 'admin', name: 'Administrator', id: 'admin' });
      } else { setError('Incorrect username or password'); triggerShake(); }
    } else {
      const raw = truckId.trim().toUpperCase().replace(/^T/, '');
      const id = /^\d{1,2}$/.test(raw) ? `T${raw.padStart(2, '0')}` : '';
      if (!id) { setError('Select your truck, or enter an ID like T01'); triggerShake(); }
      else {
        const match = fleet?.trucks.find((t) => t.truckId === id);
        onLogin({ role: 'driver', name: match?.driverName || id, id });
      }
    }
    setLoading(false);
  };

  const isDriver = role === 'driver';
  const canSubmit = isDriver ? !!truckId : (!!username && !!password);
  const selectedDriver = fleet?.trucks.find((t) => t.truckId === truckId)?.driverName;

  return (
    <div className="login-wrap">
      <div style={{ position: 'absolute', top: 18, right: 18, zIndex: 3 }}><ThemeToggle /></div>

      <div className={`login-card ${shake ? 'login-shake' : ''}`}>
        <div className="login-top">
          <div className="login-logo"><Recycle size={28} /></div>
          <div className="login-title">WasteRoute</div>
          <div className="login-sub">{isDriver ? 'Driver portal · Modasa Nagarpalika' : 'Municipal control room · Modasa'}</div>
          {fleet && (
            <div className="login-pills">
              <span className="login-pill"><Truck size={12} /> {fleet.trucks.length} trucks</span>
              <span className="login-pill"><MapPin size={12} /> {fleet.zoneCount} zones</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-roles" role="tablist">
            <button type="button" role="tab" aria-selected={!isDriver}
              className={`login-role ${!isDriver ? 'login-role--on' : ''}`} onClick={() => switchRole('admin')}>
              <Shield size={15} /> Admin
            </button>
            <button type="button" role="tab" aria-selected={isDriver}
              className={`login-role login-role--driver ${isDriver ? 'login-role--on' : ''}`} onClick={() => switchRole('driver')}>
              <Truck size={15} /> Driver
            </button>
          </div>

          {isDriver ? (
            <>
              <label className="login-label" htmlFor="truck">Your truck</label>
              <div className="login-field">
                <Truck size={16} />
                {fleet?.trucks.length ? (
                  <select id="truck" value={truckId} onChange={(e) => setTruckId(e.target.value)} autoFocus>
                    <option value="">Select your truck…</option>
                    {fleet.trucks.map((t) => (
                      <option key={t.truckId} value={t.truckId}>{t.truckId} — {t.driverName || 'Unassigned'}</option>
                    ))}
                  </select>
                ) : (
                  <input id="truck" type="text" value={truckId} autoFocus
                    onChange={(e) => setTruckId(e.target.value)} placeholder="Enter your Truck ID (e.g. T01)" />
                )}
              </div>
              {selectedDriver && (
                <div className="login-signing"><User size={13} /> Signing in as {selectedDriver}</div>
              )}
            </>
          ) : (
            <>
              <label className="login-label" htmlFor="user">Username</label>
              <div className="login-field">
                <Shield size={16} />
                <input id="user" type="text" value={username} autoFocus autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" />
              </div>

              <label className="login-label" htmlFor="pw" style={{ marginTop: 16 }}>Password</label>
              <div className="login-field">
                <input id="pw" type={showPw ? 'text' : 'password'} value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
                <button type="button" className="login-eye" onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </>
          )}

          {error && <div className="login-err"><AlertCircle size={14} /> {error}</div>}

          <button type="submit" disabled={loading || !canSubmit}
            className={`login-submit ${isDriver ? 'login-submit--driver' : ''}`}>
            {loading ? <span className="login-spin" /> : (<>{isDriver ? 'View my route' : 'Sign in'} <ArrowRight size={16} /></>)}
          </button>

          <div className="login-hint">
            {isDriver
              ? <>Pick your name from the list — no ID to remember.</>
              : <>Demo access — <code>admin</code> / <code>admin123</code></>}
          </div>
        </form>

        <div className="login-foot">Modasa Nagarpalika · Aravalli · Smart City Initiative 2026</div>
      </div>
    </div>
  );
}
