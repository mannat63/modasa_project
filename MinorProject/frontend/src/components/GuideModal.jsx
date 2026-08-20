import React, { useState } from 'react';
import { HelpCircle, X, Map, Settings, Bot, Truck, Package, Timer, Flag, Layers, BookOpen } from 'lucide-react';

const FEATURES = [
  { icon: <Map size={16} />, title: 'Dashboard', body: 'The live control room. The map shows all 27 trucks and 42 zones over real satellite imagery. Stat cards summarise the fleet. Click any truck to see its exact route, load, and stops; the right panel tabs switch between Trucks, Shifts (attendance), Flags (driver-reported issues), and Audit (every action logged).' },
  { icon: <Settings size={16} />, title: 'Simulation', body: 'A safe sandbox — nothing changes live routes until you press Deploy. Run bin-placement Epochs (S1) to model rolling out smart bins, or Fleet Optimization (S2) to test running fewer trucks. Compare before/after metrics, then deploy to apply it for real.' },
  { icon: <Bot size={16} />, title: 'Helper Panel', body: 'Ask questions about your operation in plain English ("which zones need attention today?") and get answers with map highlights. The Take Action tab lets the Helper propose reroutes, priority changes, or road blocks that you approve before drivers are notified.' },
  { icon: <Truck size={16} />, title: 'Driver View', body: 'What each driver sees: today’s route, an Acknowledge button, a shift timer to clock in / check in at each stop / clock out, and a form to flag issues. Everything a driver does flows back to the admin in real time.' },
];

const GLOSSARY = [
  { term: 'Epoch', def: 'A phase of the smart-bin rollout. Epoch 1 places bins in the top 20% of zones by risk, Epoch 2 the top 40%, Epoch 3 the top 55%. Bins are cumulative — each epoch builds on the previous one. Binned zones are serviced in ~1 min instead of ~8, so routes get shorter.' },
  { term: 'Load Factor', def: 'How full a truck’s workload is, 0–100%. Computed from the priority weight of its assigned zones versus its capacity. High load = a busy, near-capacity truck.' },
  { term: 'Risk Score', def: 'A 0–1 score of how urgently a zone needs collection, based on waste type, footfall, and sensitivity (markets and hospitals score highest).' },
  { term: 'Smart Bin', def: 'A sensor-equipped bin that pre-sorts and compacts waste, making pickup far faster and letting the route skip low-fill stops.' },
  { term: 'Fleet Optimization', def: 'Finding the smallest number of trucks that can still cover every zone, by redistributing zones from trucks you switch off — saving fuel and labour.' },
  { term: 'System State (S0/S1/S2)', def: 'S0 = baseline (no bins). S1 = smart bins active. S2 = fleet optimized. The badge in the top bar shows the current state.' },
  { term: 'Flag', def: 'An issue a driver reports from the field (road blocked, stop overloaded, skipped, running late). Flags appear instantly in the admin’s Flags tab and notifications.' },
  { term: 'Attendance / Shift', def: 'When a driver taps Start Shift they clock in; each stop check-in is timestamped; End Shift clocks out. The admin sees who is present, their duration, and stop-by-stop timings — useful as an attendance and performance record.' },
];

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="Help & guide" aria-label="Help">
        <HelpCircle size={17} />
      </button>
      {open && (
        <div className="confirm-overlay" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', width: 'min(680px, 94vw)', maxHeight: '86vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                <BookOpen size={20} style={{ color: 'var(--gold)' }} /> WasteRoute Guide
              </div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>

            <div style={{ overflowY: 'auto', padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Features</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {FEATURES.map((f) => (
                  <div key={f.title} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                      <span style={{ color: 'var(--accent)' }}>{f.icon}</span> {f.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{f.body}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '20px 0 10px' }}>Glossary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {GLOSSARY.map((g) => (
                  <div key={g.term} style={{ display: 'flex', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flexShrink: 0, width: 150, fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{g.term}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{g.def}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
                Tip: you can also ask the Helper Panel things like <em>"what does an epoch mean?"</em>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Shared concept answers so the Helper can respond instantly to "what is X". */
export const CONCEPTS = GLOSSARY.reduce((acc, g) => { acc[g.term.toLowerCase()] = `${g.term} — ${g.def}`; return acc; }, {});
