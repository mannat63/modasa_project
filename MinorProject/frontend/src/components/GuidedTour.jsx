import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, ArrowRight, ArrowLeft, Map, Package, Truck, BarChart2, Bot, CheckCircle2 } from 'lucide-react';

const STEPS = [
  { to: '/', icon: <Map size={16} />, title: 'Live Control Room',
    body: 'Every truck and zone on real satellite imagery. Click a truck to see its route, load and stops. Tabs show shifts, flags and the audit log. Hit "Play live" on the map to watch the whole fleet move.' },
  { to: '/simulation', icon: <Package size={16} />, title: 'Simulate Smart Bins',
    body: 'Run bin-placement epochs to model rolling out smart bins to the highest-risk zones first. Nothing touches live routes until you Deploy — watch stop-times and routes shrink.' },
  { to: '/simulation', icon: <Truck size={16} />, title: 'Right-size the Fleet',
    body: 'Fleet Optimization tests whether fewer trucks can still cover every zone. The engine checks feasibility instantly and shows the before/after.' },
  { to: '/analytics', icon: <BarChart2 size={16} />, title: 'See the Savings',
    body: 'Analytics turns optimization into rupees — fuel, cost and CO₂ saved per month — alongside risk and flag trends. This is the slide that wins budgets.' },
  { to: '/ai', icon: <Bot size={16} />, title: 'Ask the Helper',
    body: 'Ask the AI questions in plain English, or have it propose reroutes and priority changes that you approve before drivers are notified.' },
  { to: '/driver', icon: <Truck size={16} />, title: 'The Driver Side',
    body: 'Drivers acknowledge their route, run a shift timer with per-stop check-ins (doubling as attendance), and flag issues — all synced back to the admin in real time.' },
  { to: '/', icon: <CheckCircle2 size={16} />, title: "That's the value loop",
    body: 'Model → optimise → deploy → drivers execute → measure savings — every step logged and synced. Explore freely from here!' },
];

export default function GuidedTour() {
  const [i, setI] = useState(-1);
  const navigate = useNavigate();

  const go = (n) => {
    if (n < 0 || n >= STEPS.length) { setI(-1); return; }
    setI(n);
    navigate(STEPS[n].to);
  };
  const start = () => go(0);

  return (
    <>
      <button className="icon-btn" onClick={start} title="Guided demo tour" aria-label="Guided tour">
        <Sparkles size={17} />
      </button>

      {i >= 0 && (
        <div className="tour-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gold)' }}>
              {STEPS[i].icon}
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Step {i + 1} of {STEPS.length}
              </span>
            </div>
            <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => go(-1)} aria-label="Close tour"><X size={14} /></button>
          </div>

          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{STEPS[i].title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{STEPS[i].body}</div>

          {/* progress dots */}
          <div style={{ display: 'flex', gap: 5, margin: '12px 0' }}>
            {STEPS.map((_, n) => (
              <span key={n} style={{ height: 4, flex: 1, borderRadius: 2, background: n <= i ? 'var(--gold)' : 'var(--surface-3)', transition: 'background 0.3s' }} />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button onClick={() => go(i - 1)} disabled={i === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: i === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: i === 0 ? 0.5 : 1, fontFamily: 'inherit' }}>
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={() => go(i + 1)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
              {i === STEPS.length - 1 ? 'Finish' : 'Next'} {i < STEPS.length - 1 && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
