import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getZones, getTrucks, simEpoch, deployEpoch, simFleet, deployFleet } from '../utils/api';
import { signalRouteDeploy } from '../utils/routeSync';
import { pushNotification } from '../utils/notifications';
import MapView from '../components/MapView';
import ConfirmModal from '../components/ConfirmModal';
import { AlertTriangle, Package, Truck, Zap, Rocket, CheckCircle, XCircle, Lightbulb, Info, Microscope, RotateCcw } from 'lucide-react';

function notifyDrivers(trucks, title, message) {
  (trucks || []).filter((t) => t.status === 'active').forEach((t) => {
    pushNotification({ audience: `driver:${t.truckId}`, kind: 'deploy', title, message });
  });
}

function MetricsTable({ before, after, labels }) {
  const rows = labels || [
    { key: 'fleet', label: 'Fleet Size' },
    { key: 'avgLoad', label: 'Avg Load', fmt: (v) => `${(v * 100).toFixed(0)}%` },
    { key: 'totalDistance', label: 'Total Distance', fmt: (v) => `${v} km` },
    { key: 'coverage', label: 'Coverage', fmt: (v) => `${v}%` },
  ];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>Metric</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)' }}>Current</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--accent)' }}>Optimized</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const bVal = before?.[r.key];
          const aVal = after?.[r.key];
          if (bVal === undefined && aVal === undefined) return null;
          const fmt = r.fmt || ((v) => v);
          return (
            <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{r.label}</td>
              <td style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }}>{bVal != null ? fmt(bVal) : '—'}</td>
              <td style={{ padding: '6px 8px', color: 'var(--accent)', textAlign: 'right', fontWeight: 600 }}>{aVal != null ? fmt(aVal) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ═════════════════════════════════════════════════════════
export default function Simulation() {
  const [zones, setZones] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [epochResults, setEpochResults] = useState({});
  const [activeEpoch, setActiveEpoch] = useState(0);
  const [totalBins, setTotalBins] = useState(0);
  const [fleetTarget, setFleetTarget] = useState(24);
  const [fleetResult, setFleetResult] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [simZones, setSimZones] = useState([]);

  useEffect(() => {
    Promise.allSettled([getZones(), getTrucks()]).then(([z, t]) => {
      if (z.status === 'fulfilled') { setZones(z.value || []); setSimZones(z.value || []); }
      if (t.status === 'fulfilled') setTrucks(t.value || []);
    });
  }, []);

  const runEpoch = async (n) => {
    setLoading(true);
    try {
      const data = await simEpoch(n);
      setEpochResults((prev) => ({ ...prev, [n]: data }));
      setActiveEpoch(n);
      if (data.updatedZones) setSimZones(data.updatedZones);
      // Cumulative bins (phases 1..n), NOT a sum of per-run "new" counts
      setTotalBins(data.cumulativeBins ?? data.binsPlaced ?? 0);
      toast.success(`Epoch ${n}: ${data.cumulativeBins} bins total (+${data.binsPlaced} new this phase)`);
    } catch (e) {
      toast.error('Epoch simulation failed: ' + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  };

  const resetSim = () => {
    setEpochResults({});
    setActiveEpoch(0);
    setTotalBins(0);
    setSimZones(zones);
    toast.success('Simulation reset to baseline (S0)');
  };

  const handleDeployEpoch = (n) => {
    setConfirm({
      title: `Deploy Epoch ${n} to Live`,
      message: `This will update the live database — ${epochResults[n]?.binsPlaced || 0} zones will have hasBin=true and reduced priorityWeight. This cannot be easily undone.`,
      confirmText: 'Deploy to Live',
      dangerLevel: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        setLoading(true);
        try {
          await deployEpoch(n, { adminId: 'admin' });
          toast.success(`Epoch ${n} deployed to live database`);
          const [freshZones, freshTrucks] = await Promise.all([getZones(), getTrucks()]);
          if (freshZones) { setZones(freshZones); setSimZones(freshZones); }
          if (freshTrucks) { setTrucks(freshTrucks); notifyDrivers(freshTrucks, 'Routes updated', `Smart-bin epoch ${n} deployed — your route may have changed.`); }
          signalRouteDeploy();
        } catch (e) {
          toast.error('Deploy failed: ' + (e.response?.data?.error || e.message));
        }
        setLoading(false);
      },
    });
  };

  const runFleetOptimize = async () => {
    setLoading(true);
    try {
      const data = await simFleet({ targetFleetSize: fleetTarget });
      setFleetResult(data);
      toast.success(data.feasible ? 'Fleet plan is feasible!' : 'Fleet plan is not feasible');
    } catch (e) {
      toast.error('Fleet optimization failed: ' + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  };

  const handleDeployFleet = () => {
    setConfirm({
      title: 'Deploy Fleet Plan to Live',
      message: `This will deactivate ${27 - fleetTarget} truck(s) and redistribute their zones. The live database will be updated.`,
      confirmText: 'Deploy Fleet Plan',
      dangerLevel: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        setLoading(true);
        try {
          await deployFleet({ targetFleetSize: fleetTarget, adminId: 'admin' });
          toast.success(`Fleet plan deployed — ${fleetTarget} trucks now active`);
          const fresh = await getTrucks();
          if (fresh) { setTrucks(fresh); notifyDrivers(fresh, 'Fleet plan deployed', `Fleet resized to ${fleetTarget} trucks — check your updated route.`); }
          signalRouteDeploy();
        } catch (e) {
          toast.error('Deploy failed: ' + (e.response?.data?.error || e.message));
        }
        setLoading(false);
      },
    });
  };

  const currentEpochData = epochResults[activeEpoch];
  const epochLabels = { 1: 'Top 20%', 2: 'Next 20%', 3: 'Next 15%' };

  return (
    <div className="page page--fill">
      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} confirmText={confirm.confirmText || 'Confirm Deploy'} dangerLevel={confirm.dangerLevel || 'danger'} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}

      {/* Simulation banner */}
      <div style={{ background: 'var(--warn-soft)', border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)', borderRadius: 8, padding: '10px 16px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle color="var(--warn)" size={20} />
        <span style={{ color: 'var(--warn)', fontSize: 13, fontWeight: 600 }}>SIMULATION MODE — Changes here do not affect live routes until deployed</span>
      </div>

      {/* State tracker */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Microscope size={14} /> State: <strong style={{ color: activeEpoch > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{activeEpoch === 0 ? 'S0 (Baseline)' : `Epoch ${activeEpoch} simulated`}</strong></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Package size={14} /> Bins placed: <strong style={{ color: totalBins > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{totalBins}</strong></span>
        {fleetResult?.feasible && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Truck size={14} /> Fleet plan: <strong style={{ color: 'var(--gold)' }}>{fleetTarget}-truck plan available</strong></span>}
      </div>

      <div className="workspace-body">
        {/* Map — fixed */}
        <div className="map-wrap workspace-map" style={{ flex: '0 0 54%' }}>
          <MapView zones={simZones} trucks={trucks} mode="simulation" />
        </div>

        {/* Controls — scroll */}
        <div className="workspace-side" style={{ flex: 1 }}>
          <div className="workspace-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* S1 */}
          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <h3 style={{ color: 'var(--accent)', margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}><Package size={18} /> Bin Placement Simulation (S1)</h3>
              {activeEpoch > 0 && (
                <button onClick={resetSim} title="Clear simulation and return to baseline"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <RotateCcw size={12} /> Reset
                </button>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
              Roll out smart bins in phases to the highest-risk zones. Bins are <strong>cumulative</strong> — Epoch 1 covers the top 20% of zones by risk, Epoch 2 the top 40%, Epoch 3 the top 55%. Binned zones are serviced far faster, which re-optimises routes.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3].map((n) => (
                <button key={n} disabled={loading} onClick={() => runEpoch(n)}
                  style={{ flex: 1, minWidth: 90, padding: '10px 12px', borderRadius: 8, border: `1px solid ${activeEpoch === n ? 'var(--success)' : epochResults[n] ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'var(--border)'}`, cursor: 'pointer', fontWeight: 600, fontSize: 12, background: activeEpoch === n ? 'var(--success-soft)' : epochResults[n] ? 'var(--surface-2)' : 'var(--surface-2)', color: activeEpoch === n ? 'var(--success)' : 'var(--text)', outline: activeEpoch === n ? '2px solid var(--success)' : 'none' }}>
                  {epochResults[n] ? `✓ Epoch ${n}` : `Run Epoch ${n}`}
                  <span style={{ fontSize: 10, display: 'block', color: 'var(--text-muted)', marginTop: 2 }}>{epochLabels[n]}</span>
                </button>
              ))}
            </div>

            {currentEpochData && (
              <div style={{ marginTop: 12 }}>
                {currentEpochData.explanation && (
                  <div style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 8, padding: '9px 12px', marginBottom: 10, fontSize: 11.5, color: 'var(--text)', lineHeight: 1.55, display: 'flex', gap: 8 }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent)' }} />
                    <span>{currentEpochData.explanation}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {[
                    { v: currentEpochData.binsPlaced, l: 'Bins Placed', c: 'var(--success)' },
                    { v: currentEpochData.estimatedStopsReduced, l: 'Stops Reduced', c: 'var(--accent)' },
                    { v: `${currentEpochData.totalTimeSaved} min`, l: 'Time Saved', c: 'var(--gold)' },
                  ].map((b, i) => (
                    <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: b.c }}>{b.v}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{b.l}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Zones affected:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {(currentEpochData.affectedZones || []).map((z) => (
                    <span key={z.zoneId} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'var(--success-soft)', color: 'var(--success)' }}>{z.name} ({z.riskScore})</span>
                  ))}
                </div>

                {(currentEpochData.truckMetrics || []).length > 0 && (
                  <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)' }}>Truck</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-muted)' }}>Before</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--accent)' }}>After</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--success)' }}>Saved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentEpochData.truckMetrics.map((t) => (
                          <tr key={t.truckId} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 6px', color: 'var(--text)' }}>{t.truckId}</td>
                            <td style={{ padding: '4px 6px', color: 'var(--text-muted)', textAlign: 'right' }}>{t.before.estimatedDuration}</td>
                            <td style={{ padding: '4px 6px', color: 'var(--accent)', textAlign: 'right' }}>{t.after.estimatedDuration}</td>
                            <td style={{ padding: '4px 6px', color: 'var(--success)', textAlign: 'right' }}>{t.timeSaved} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button disabled={loading} onClick={() => handleDeployEpoch(activeEpoch)}
                  style={{ marginTop: 10, width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Rocket size={16} /> Deploy Epoch {activeEpoch} to Live
                </button>
              </div>
            )}
          </div>

          {/* S2 */}
          <div className="panel">
            <h3 style={{ color: 'var(--gold)', margin: '0 0 12px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}><Truck size={18} /> Fleet Optimization (S2)</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Target Fleet Size: <strong style={{ color: 'var(--text)', fontSize: 16 }}>{fleetTarget}</strong> trucks</label>
              <input type="range" min={15} max={27} value={fleetTarget} onChange={(e) => setFleetTarget(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-faint)' }}><span>15</span><span>Current: 27</span></div>
            </div>

            <button disabled={loading} onClick={runFleetOptimize}
              style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading ? 'Analyzing...' : <><Zap size={16} /> Run Optimization</>}
            </button>

            {fleetResult && (
              <div style={{ marginTop: 12, borderRadius: 8, padding: 12, background: fleetResult.feasible ? 'var(--success-soft)' : 'var(--danger-soft)', border: `1px solid ${fleetResult.feasible ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}` }}>
                {fleetResult.feasible ? (
                  <>
                    <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={16} /> Feasible — {fleetTarget} trucks can cover all zones</div>
                    <MetricsTable before={fleetResult.metricsComparison?.before} after={fleetResult.metricsComparison?.after} />
                    <button disabled={loading} onClick={handleDeployFleet}
                      style={{ marginTop: 10, width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Rocket size={16} /> Deploy Fleet Plan
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={16} /> Not Feasible with {fleetTarget} trucks</div>
                    <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 6, fontWeight: 500, opacity: 0.85 }}>Trucks would be overloaded or coverage would be insufficient.</div>
                    {fleetResult.infeasibleReasons?.map((r, i) => <div key={i} style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 4, opacity: 0.85 }}>• {r}</div>)}
                    {fleetResult.minimumFeasible && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 4 }}><Lightbulb size={14} /> Minimum feasible fleet: <strong>{fleetResult.minimumFeasible}</strong> trucks</div>}
                    <MetricsTable before={fleetResult.metricsComparison?.before} after={fleetResult.metricsComparison?.after} />
                  </>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
