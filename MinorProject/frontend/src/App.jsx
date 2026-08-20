import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Dashboard  from './pages/Dashboard';
import Simulation from './pages/Simulation';
import AIPanel    from './pages/AIPanel';
import Analytics  from './pages/Analytics';
import DriverView from './pages/DriverView';
import DriverMobile from './pages/DriverMobile';
import LoginPage  from './pages/LoginPage';
import ThemeToggle from './components/ThemeToggle';
import NotificationBell from './components/NotificationBell';
import HelpButton from './components/GuideModal';
import GuidedTour from './components/GuidedTour';
import { getSummary, getZones } from './utils/api';
import { onRouteDeploy } from './utils/routeSync';
import './index.css';

import { Map, Settings, Bot, Truck, MapPin, Box, Map as MapIcon, Flag, BarChart2, Recycle, LogOut, Shield } from 'lucide-react';

const ADMIN_NAV = [
  { to: '/',           icon: <Map size={16} />,      label: 'Dashboard'  },
  { to: '/simulation', icon: <Settings size={16} />, label: 'Simulation' },
  { to: '/ai',         icon: <Bot size={16} />,      label: 'Helper Panel' },
  { to: '/analytics',  icon: <BarChart2 size={16} />, label: 'Analytics' },
  { to: '/driver',     icon: <Truck size={16} />,    label: 'Driver View' },
];

// ── System State Badge with dropdown ────────────────────
function SystemBadge() {
  const [state, setState] = useState('S0');
  const [binCount, setBinCount] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [open, setOpen] = useState(false);

  const check = useCallback(async () => {
    try {
      const [zones, summary] = await Promise.allSettled([getZones(), getSummary()]);
      const zoneData = zones.status === 'fulfilled' ? zones.value || [] : [];
      const summaryData = summary.status === 'fulfilled' ? summary.value : null;
      const binned = zoneData.filter((z) => z.hasBin).length;
      setBinCount(binned);
      setMetrics(summaryData);
      if (binned > zoneData.length * 0.4) setState('S2');
      else if (binned > 0) setState('S1');
      else setState('S0');
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [check]);

  useEffect(() => onRouteDeploy(() => check()), [check]);

  const labels = { S0: 'Baseline', S1: 'Bins Active', S2: 'Fleet Optimized' };
  const cls = state === 'S0' ? 'pill--accent' : 'pill--gold';

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} className={`pill ${cls}`} style={{ cursor: 'pointer' }}>
        <span className="pill-dot pill-dot--pulse" />
        {state} — {labels[state]}
        {binCount > 0 && <span style={{ fontSize: 10, opacity: 0.75 }}>({binCount} bins)</span>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 8,
          background: 'var(--surface)', borderRadius: 10, padding: 14,
          border: '1px solid var(--border)', zIndex: 999, minWidth: 230,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            System Metrics
          </div>
          {metrics ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 2 }}>
              <Metric icon={<Truck size={12} />} label="Active Trucks" value={metrics.activeTrucks ?? '—'} />
              <Metric icon={<MapPin size={12} />} label="Total Zones" value={metrics.totalZones ?? '—'} />
              <Metric icon={<Box size={12} />} label="Bins Deployed" value={binCount} valueColor="var(--success)" />
              <Metric icon={<MapIcon size={12} />} label="Routes Today" value={metrics.activeRoutes ?? '—'} />
              <Metric icon={<Flag size={12} />} label="Pending Flags" value={metrics.pendingFlags ?? 0} valueColor={metrics.pendingFlags > 0 ? 'var(--danger)' : 'var(--text)'} />
              <Metric icon={<BarChart2 size={12} />} label="Avg Load" value={metrics.avgLoadFactor ? `${(metrics.avgLoadFactor * 100).toFixed(0)}%` : '—'} />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading metrics...</div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon} {label}</span>
      <b style={{ color: valueColor || 'var(--text)' }}>{value}</b>
    </div>
  );
}

// ── Auth helpers ────────────────────────────────────────
function getSession() {
  try {
    const raw = sessionStorage.getItem('waste-session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setSession(data) {
  if (data) sessionStorage.setItem('waste-session', JSON.stringify(data));
  else sessionStorage.removeItem('waste-session');
}

function LogoutButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        background: 'var(--danger-soft)', color: 'var(--danger)',
        border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <LogOut size={14} /> Logout
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState(getSession);

  const handleLogin = (userData) => { setSession(userData); setUser(userData); };
  const handleLogout = () => { setSession(null); setUser(null); };

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--surface)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: '10px',
            fontSize: '13px', padding: '12px 16px', boxShadow: 'var(--shadow-lg)',
          },
          success: { iconTheme: { primary: 'var(--success)', secondary: '#fff' } },
          error:   { iconTheme: { primary: 'var(--danger)', secondary: '#fff' } },
        }}
      />

      <Routes>
        {/* Driver mobile — standalone */}
        <Route path="/driver/:truckId" element={<DriverMobile />} />

        {!user && <Route path="*" element={<LoginPage onLogin={handleLogin} />} />}

        {/* Driver dashboard */}
        {user?.role === 'driver' && (
          <Route path="*" element={
            <div className="app-shell">
              <nav className="navbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <span className="navbar-brand"><Recycle size={20} /> WasteRoute</span>
                  <span className="pill pill--live"><Truck size={12} /> Driver — {user.id}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HelpButton />
                  <NotificationBell audience={`driver:${user.id}`} />
                  <ThemeToggle />
                  <LogoutButton onClick={handleLogout} />
                </div>
              </nav>
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<DriverView truckId={user.id} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          } />
        )}

        {/* Admin */}
        {user?.role === 'admin' && (
          <Route path="*" element={
            <div className="app-shell">
              <nav className="navbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="navbar-brand"><Recycle size={20} /> WasteRoute</span>
                  <SystemBadge />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <ul className="nav-links">
                    {ADMIN_NAV.map(({ to, icon, label }) => (
                      <li key={to}>
                        <NavLink to={to} end className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon} {label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
                    <span className="pill pill--gold"><Shield size={11} /> Admin</span>
                    <GuidedTour />
                    <HelpButton />
                    <NotificationBell audience="admin" />
                    <ThemeToggle />
                    <LogoutButton onClick={handleLogout} />
                  </div>
                </div>
              </nav>

              <main className="main-content">
                <Routes>
                  <Route path="/"           element={<Dashboard />}  />
                  <Route path="/simulation" element={<Simulation />} />
                  <Route path="/ai"         element={<AIPanel />}    />
                  <Route path="/analytics"  element={<Analytics />}  />
                  <Route path="/driver"     element={<DriverView />} />
                </Routes>
              </main>
            </div>
          } />
        )}
      </Routes>
    </BrowserRouter>
  );
}
