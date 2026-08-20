import React, { useEffect, useMemo, useState } from 'react';
import { getTrucks, getZones, getFlags, getAttendance, simFleet } from '../utils/api';
import { BarChart2, Fuel, IndianRupee, Leaf, Truck, TrendingDown, Flag, AlertTriangle, Users, Info, MapPin } from 'lucide-react';

// ── Assumptions (shown transparently) ───────────────────
const KM_PER_L = 3.5;      // heavy waste collection truck
const DIESEL = 90;         // ₹ per litre
const CO2_PER_L = 2.68;    // kg CO₂ per litre diesel
const DAYS = 26;           // working days per month
const DRIVER_DAY = 550;    // ₹ per driver per day (labour)

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

// ── Small horizontal bar list ───────────────────────────
function BarList({ rows, color = 'var(--accent)', unit = '' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 120, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <div style={{ flex: 1, height: 18, background: 'var(--surface-3)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: r.color || color, borderRadius: 5, transition: 'width 0.4s' }} />
          </div>
          <span style={{ width: 46, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{r.display ?? r.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

// ── Vertical time-series bars (last 7 days) ─────────────
function TimeBars({ data, color = 'var(--accent)' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{d.value || ''}</span>
          <div style={{ width: '70%', height: `${(d.value / max) * 100}%`, minHeight: d.value ? 4 : 0, background: color, borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, icon, children, note }) {
  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: 'var(--gold)' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      </div>
      {children}
      {note && <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

function SaveTile({ icon, value, label, color }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', flex: 1, minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, marginBottom: 4 }}>{icon}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span></div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

export default function Analytics() {
  const [trucks, setTrucks] = useState([]);
  const [zones, setZones] = useState([]);
  const [flags, setFlags] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [target, setTarget] = useState(22);
  const [feasible, setFeasible] = useState(null);

  useEffect(() => {
    Promise.allSettled([getTrucks(), getZones(), getFlags(), getAttendance()]).then(([t, z, f, a]) => {
      if (t.status === 'fulfilled') setTrucks(t.value || []);
      if (z.status === 'fulfilled') setZones(z.value || []);
      if (f.status === 'fulfilled') setFlags(f.value || []);
      if (a.status === 'fulfilled') setAttendance(a.value || []);
    });
  }, []);

  // Check feasibility of the chosen fleet size via the real engine
  useEffect(() => {
    let cancelled = false;
    simFleet({ targetFleetSize: target })
      .then((r) => { if (!cancelled) setFeasible(!!r.feasible); })
      .catch(() => { if (!cancelled) setFeasible(null); });
    return () => { cancelled = true; };
  }, [target]);

  const activeTrucks = trucks.filter((t) => t.status === 'active');
  const totalKm = useMemo(() => activeTrucks.reduce((s, t) => s + (t.estimatedDistance || 0), 0), [activeTrucks]);
  const avgKm = useMemo(() => mean(activeTrucks.map((t) => t.estimatedDistance || 0)), [activeTrucks]);
  const avgLoad = useMemo(() => mean(activeTrucks.map((t) => t.currentLoadFactor || 0)) * 100, [activeTrucks]);

  // ── ROI from fleet right-sizing ──
  const freed = Math.max(0, activeTrucks.length - target);
  const litresDay = (freed * avgKm) / KM_PER_L;
  const fuelMonth = litresDay * DAYS;
  const fuelInrMonth = fuelMonth * DIESEL;
  const laborInrMonth = freed * DRIVER_DAY * DAYS;
  const totalInrMonth = fuelInrMonth + laborInrMonth;
  const co2Month = fuelMonth * CO2_PER_L;

  // ── Historical: flags over last 7 days ──
  const flagsByDay = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ key: d.getTime(), label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: 0 });
    }
    for (const f of flags) {
      const ts = new Date(f.timestamp || f.createdAt); ts.setHours(0, 0, 0, 0);
      const day = days.find((d) => d.key === ts.getTime());
      if (day) day.value++;
    }
    return days;
  }, [flags]);

  // ── Zone risk by type ──
  const riskByType = useMemo(() => {
    const groups = {};
    for (const z of zones) {
      const key = (z.type || 'Other').replace('_', ' ');
      (groups[key] ||= []).push(z.riskScore || 0);
    }
    return Object.entries(groups)
      .map(([label, arr]) => ({ label, value: Math.round(mean(arr) * 100), display: Math.round(mean(arr) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [zones]);

  const topRisk = useMemo(() => [...zones].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 6), [zones]);

  const present = attendance.filter((a) => a.attendance === 'present').length;
  const onDuty = attendance.filter((a) => a.onDuty).length;
  const absent = attendance.filter((a) => a.status !== 'inactive' && a.attendance !== 'present').length;

  return (
    <div className="page" style={{ overflowY: 'auto' }}>
      <div className="page-header">
        <h1 className="page-title"><BarChart2 size={24} /> Analytics & ROI</h1>
        <span className="pill pill--gold"><TrendingDown size={12} /> Savings & Insights</span>
      </div>

      {/* KPI row */}
      <div className="stats-row">
        <div className="stat-card" style={{ '--card-accent': 'var(--accent)' }}><span className="stat-icon"><Truck size={20} /></span><div><div className="stat-value">{activeTrucks.length}</div><div className="stat-label">Active Trucks</div></div></div>
        <div className="stat-card" style={{ '--card-accent': 'var(--gold)' }}><span className="stat-icon"><MapPin size={20} /></span><div><div className="stat-value">{Math.round(totalKm)} km</div><div className="stat-label">Daily Fleet Distance</div></div></div>
        <div className="stat-card" style={{ '--card-accent': 'var(--warn)' }}><span className="stat-icon"><BarChart2 size={20} /></span><div><div className="stat-value">{avgLoad.toFixed(0)}%</div><div className="stat-label">Avg Load</div></div></div>
        <div className="stat-card" style={{ '--card-accent': 'var(--success)' }}><span className="stat-icon"><Users size={20} /></span><div><div className="stat-value">{present}/{attendance.length || 0}</div><div className="stat-label">Present Today</div></div></div>
      </div>

      {/* ROI panel */}
      <Card title="Return on Investment — Fleet Right-Sizing" icon={<IndianRupee size={18} />}
        note={`Assumptions: ${KM_PER_L} km/L diesel, ${inr(DIESEL)}/L, ${CO2_PER_L} kg CO₂/L, ${DAYS} working days/month, ${inr(DRIVER_DAY)}/driver/day. Savings scale with real fleet distance and are illustrative — swap in live fuel-sensor data for exact figures.`}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target fleet size: <strong style={{ color: 'var(--text)', fontSize: 15 }}>{target}</strong> trucks &nbsp;
              <span style={{ color: freed > 0 ? 'var(--success)' : 'var(--text-muted)' }}>({freed} freed)</span>
            </label>
            <input type="range" min={15} max={activeTrucks.length || 27} value={target} onChange={(e) => setTarget(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-faint)' }}><span>15</span><span>Current: {activeTrucks.length}</span></div>
          </div>
          <span className={`pill ${feasible === false ? '' : 'pill--live'}`} style={feasible === false ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : {}}>
            {feasible === null ? 'Checking…' : feasible ? '✓ Feasible — covers all zones' : '✕ Not feasible at this size'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <SaveTile icon={<Truck size={14} />} value={freed} label="Trucks freed" color="var(--accent)" />
          <SaveTile icon={<Fuel size={14} />} value={`${Math.round(fuelMonth).toLocaleString('en-IN')} L`} label="Fuel saved / month" color="var(--warn)" />
          <SaveTile icon={<IndianRupee size={14} />} value={inr(totalInrMonth)} label="Saved / month" color="var(--success)" />
          <SaveTile icon={<Leaf size={14} />} value={`${Math.round(co2Month).toLocaleString('en-IN')} kg`} label="CO₂ avoided / month" color="var(--success)" />
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text)', background: 'var(--success-soft)', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)', borderRadius: 8, padding: '10px 14px' }}>
          Projected annual saving at this plan: <strong style={{ color: 'var(--success)' }}>{inr(totalInrMonth * 12)}</strong> and <strong style={{ color: 'var(--success)' }}>{Math.round(co2Month * 12 / 1000).toLocaleString('en-IN')} tonnes CO₂</strong> avoided.
        </div>
      </Card>

      {/* Charts grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card title="Flags Reported — Last 7 Days" icon={<Flag size={18} />} note="Live from reported flags. Populates as drivers report issues from the field.">
          <TimeBars data={flagsByDay} color="var(--danger)" />
        </Card>

        <Card title="Zone Risk by Type" icon={<AlertTriangle size={18} />} note="Average risk score (0–100) per zone category — drives collection priority.">
          <BarList rows={riskByType} color="var(--warn)" unit="" />
        </Card>

        <Card title="Attendance — Today" icon={<Users size={18} />} note="Live shift/attendance. Accumulates into weekly & monthly records in production.">
          <BarList rows={[
            { label: 'On duty now', value: onDuty, display: onDuty, color: 'var(--success)' },
            { label: 'Present today', value: present, display: present, color: 'var(--accent)' },
            { label: 'Not started', value: absent, display: absent, color: 'var(--text-faint)' },
          ]} />
        </Card>

        <Card title="Highest-Risk Zones" icon={<MapPin size={18} />} note="Top zones by risk score — first candidates for smart-bin rollout.">
          <BarList rows={topRisk.map((z) => ({ label: z.name, value: Math.round((z.riskScore || 0) * 100), display: Math.round((z.riskScore || 0) * 100), color: 'var(--danger)' }))} />
        </Card>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', padding: '4px 2px 20px' }}>
        <Info size={14} /> With live GPS, load and fuel sensors, these figures become real-time truth rather than model estimates.
      </div>
    </div>
  );
}
