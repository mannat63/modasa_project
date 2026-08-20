import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { updateRoute, getZones, getTrucks, aiQuery, aiAction, deployRoadBlocked } from '../utils/api';
import { signalRouteDeploy, onRouteDeploy } from '../utils/routeSync';
import { pushNotification } from '../utils/notifications';
import MapView from '../components/MapView';
import ConfirmModal from '../components/ConfirmModal';
import { CONCEPTS } from '../components/GuideModal';
import { Brain, MessageSquare, Zap, Ban, Truck, RefreshCw, ClipboardList, CheckCircle, BarChart2, TrendingUp, AlertCircle } from 'lucide-react';

// ── Quick question chips ────────────────────────────────
const QUICK_QUESTIONS = [
  'What does an epoch mean?',
  'Which zones need attention today?',
  'How can we optimize tomorrow?',
  'What is load factor?',
  'Which truck has the highest load?',
];

// Answer conceptual "what is X / explain X" questions instantly from the glossary
function conceptAnswer(q) {
  const low = q.toLowerCase();
  if (!/(what|explain|define|meaning|mean|how does|tell me about)/.test(low)) return null;
  let best = null;
  for (const key of Object.keys(CONCEPTS)) {
    const head = key.split(' ')[0];
    if (low.includes(head) && (!best || key.length > best.length)) best = key;
  }
  return best ? CONCEPTS[best] : null;
}

// ── Helpers ─────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '12px 16px' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)',
          animation: `typePulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}



// ═════════════════════════════════════════════════════════
// HELPER PANEL PAGE
// ═════════════════════════════════════════════════════════
export default function AIPanel() {
  const [tab, setTab] = useState('ask');
  const [zones, setZones] = useState([]);
  const [trucks, setTrucks] = useState([]);

  // Map highlights
  const [highlightZones, setHighlightZones] = useState([]);
  const [highlightRoute, setHighlightRoute] = useState([]);

  // Chat state
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m WasteWise Helper. Ask me about zones, routes, flags, or operational insights.', raw: null },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Action state
  const [actionResult, setActionResult] = useState(null);
  const [loadingActionType, setLoadingActionType] = useState(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  // Action form fields
  const [roadBlockedZone, setRoadBlockedZone] = useState('');
  const [areaPriorityZone, setAreaPriorityZone] = useState('');
  const [areaBlockedZone, setAreaBlockedZone] = useState('');
  const [actionTruck, setActionTruck] = useState('');
  const [actionText, setActionText] = useState('');
  const [manualRoute, setManualRoute] = useState([]); // ordered zoneId array for manual reroute
  const [rerouteZoneToAdd, setRerouteZoneToAdd] = useState(''); // zone picker for adding to manual route

  // Bin fill levels for intelligent optimization preview
  // Seeded from stored binFillLevel; can be overridden locally by admin sliders
  const [fillLevels, setFillLevels] = useState({});

  // Seed fill levels from zone data (stored or realistic random per-zone)
  const seedFillLevels = (zoneList) => {
    const seed = {};
    for (const z of zoneList) {
      if (!z.hasBin) continue;
      if (z.binFillLevel != null) {
        // Use stored value from DB (set on epoch deploy)
        seed[z.zoneId] = z.binFillLevel;
      } else {
        // Realistic random seed based on type + slight variance — never plain 50%
        const typeBases = {
          Market: 65, Hospital: 55, School: 48,
          Industrial: 58, Residential_High: 52, Residential_Low: 35,
        };
        const base = typeBases[z.type] || 50;
        const variance = Math.floor(Math.random() * 25) - 10; // ±10 around base
        seed[z.zoneId] = Math.min(95, Math.max(15, base + variance));
      }
    }
    setFillLevels(seed);
  };

  const loadData = async () => {
    const [z, t] = await Promise.allSettled([getZones(), getTrucks()]);
    if (z.status === 'fulfilled') {
      const zoneList = z.value || [];
      setZones(zoneList);
      seedFillLevels(zoneList);
    }
    if (t.status === 'fulfilled') setTrucks(t.value || []);
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync when ANY page deploys route changes (same-tab + cross-tab)
  useEffect(() => {
    return onRouteDeploy(() => loadData());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  // ── Chat ──────────────────────────────────────────
  const sendChat = async (text) => {
    const q = (text || chatInput).trim();
    if (!q || chatLoading) return;
    setChatInput('');

    setMessages((prev) => [...prev, { role: 'user', content: q, raw: null }]);
    setChatLoading(true);

    // Conceptual questions ("what is an epoch?") answered instantly from the guide
    const concept = conceptAnswer(q);
    if (concept) {
      setMessages((prev) => [...prev, { role: 'assistant', content: concept, raw: null }]);
      setChatLoading(false);
      return;
    }

    try {
      const data = await aiQuery({ question: q });

      // Build display message
      let display = data?.answer || '(No response)';
      if (data?.dataPoints?.length) {
        display += '\n\n' + data.dataPoints.map((d) => `- ${d}`).join('\n');
      }
      if (data?.recommendation) {
        display += `\n\nRecommendation: ${data.recommendation}`;
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: display, raw: data }]);

      // Handle map highlights
      if (data?.mapHighlight) {
        const ids = data.mapHighlight.ids || [];
        if (data.mapHighlight.type === 'zone') {
          setHighlightZones(zones.filter((z) => ids.includes(z.zoneId)));
          setHighlightRoute([]);
        } else if (data.mapHighlight.type === 'truck' || data.mapHighlight.type === 'route') {
          const truck = trucks.find((t) => ids.includes(t.truckId));
          if (truck) {
            const line = (truck.routeSequence || [])
              .map((id) => zones.find((z) => z.zoneId === id)?.centerPoint)
              .filter(Boolean);
            setHighlightRoute(line);
          }
        }
      }
    } catch (err) {
      toast.error('Could not reach Helper. Check your GROQ_API_KEY.');
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Warning: Could not reach Helper. Check your GROQ_API_KEY or try again.',
        raw: null,
      }]);
    }
    setChatLoading(false);
  };

  // Pre-fill action from Helper suggestion
  const applyAiAction = (action) => {
    setTab('action');
    if (action?.zoneId) {
      setRoadBlockedZone(action.zoneId);
      setAreaPriorityZone(action.zoneId);
      setAreaBlockedZone(action.zoneId);
    }
    if (action?.truckId) setActionTruck(action.truckId);
    if (action?.description) setActionText(action.description);
  };

  // ── Actions ───────────────────────────────────────
  const runAction = async (actionType, payload) => {
    setLoadingActionType(actionType);
    setActionMsg('');
    setActionResult(null);
    try {
      const data = await aiAction({ actionType, payload, adminId: 'admin' });
      setActionResult({ actionType, ...data });

      // Highlight affected trucks on map
      if (data?.proposedChanges?.length) {
        const routes = data.proposedChanges
          .flatMap((c) => (c.proposedRoute || []))
          .map((id) => zones.find((z) => z.zoneId === id)?.centerPoint)
          .filter(Boolean);
        setHighlightRoute(routes);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    }
    setLoadingActionType(null);
  };

  const deployProposedChanges = async () => {
    if (!actionResult?.proposedChanges) return;
    setDeployLoading(true);
    try {
      if (['road_blocked', 'area_blocked', 'area_priority'].includes(actionResult.actionType)) {
        const blockedZoneIds = actionResult.proposedChanges.flatMap((c) => c.removedZones || []);
        await deployRoadBlocked({
          blockedZoneIds,
          actionType: actionResult.actionType,
          targetZoneId: actionResult.actionType === 'area_priority' ? areaPriorityZone : undefined,
          proposedChanges: actionResult.proposedChanges,
          adminId: 'admin',
        });
        toast.success(`Action deployed — successfully applied to mapped routes.`);
      } else {
        // For all other action types: update routes only
        for (const change of actionResult.proposedChanges) {
          if (change.proposedRoute) {
            await updateRoute(change.truckId, {
              routeSequence: change.proposedRoute,
              approvedBy: 'admin',
            });
          }
        }
        toast.success('Routes updated! Drivers will see new routes on their next app open.');
      }

      // Notify each affected driver
      const kind = actionResult.actionType === 'area_priority' ? 'priority'
        : actionResult.actionType.includes('block') ? 'block' : 'deploy';
      (actionResult.proposedChanges || []).forEach((c) => {
        if (c.truckId) pushNotification({
          audience: `driver:${c.truckId}`, kind,
          title: 'Route updated',
          message: `${actionResult.actionType.replace(/_/g, ' ')} — your route has changed.`,
        });
      });

      setActionResult(null);
      // Refresh local data
      const [freshZones, freshTrucks] = await Promise.all([getZones(), getTrucks()]);
      if (freshZones) setZones(freshZones);
      if (freshTrucks) setTrucks(freshTrucks);
      // Signal Dashboard to immediately refresh map (shows blocked zones in black)
      signalRouteDeploy();
    } catch (err) {
      toast.error('Deploy failed: ' + (err.response?.data?.error || err.message));
    }
    setDeployLoading(false);
    setConfirmAction(null);
  };

  // Map data
  const mapZones = highlightZones.length > 0 ? highlightZones : zones;

  return (
    <div className="page page--fill">
      <div className="page-header">
        <h1 className="page-title" style={{display:'flex', alignItems:'center', gap:8}}><Brain size={24}/> Helper Operations Center</h1>
        <span className="pill pill--gold">Helper + Live Data</span>
      </div>

      <div className="workspace-body">

        {/* ── Map (fixed) ── */}
        <div className="map-wrap workspace-map" style={{ flex: '0 0 54%' }}>
          <MapView zones={mapZones} trucks={trucks} />
        </div>

        {/* ── Right Panel ── */}
        <div className="workspace-side" style={{ flex: 1 }}>

          {/* Tabs */}
          <div className="tab-row" style={{ marginBottom: 8 }}>
            <button className={`tab-btn ${tab === 'ask' ? 'tab-btn--active' : ''}`} onClick={() => setTab('ask')} style={{display:'flex', alignItems:'center', gap:6}}>
              <MessageSquare size={16}/> Ask Helper
            </button>
            <button className={`tab-btn ${tab === 'action' ? 'tab-btn--active' : ''}`} onClick={() => setTab('action')} style={{display:'flex', alignItems:'center', gap:6}}>
              <Zap size={16}/> Take Action
            </button>
          </div>

          {/* ═══════ ASK HELPER TAB ═══════ */}
          {tab === 'ask' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                      background: msg.role === 'user' ? 'var(--accent-soft)' : 'var(--surface-2)',
                      border: '1px solid var(--border)',
                    }}>
                      {/* Main text */}
                      <pre style={{
                        margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', lineHeight: 1.5,
                      }}>{msg.content}</pre>

                      {/* Recommendation box */}
                      {msg.raw?.recommendation && (
                        <div style={{
                          marginTop: 8, padding: '8px 12px', borderRadius: 8,
                          background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                        }}>
                          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginBottom: 2 }}>RECOMMENDATION</div>
                          <div style={{ fontSize: 12, color: 'var(--text)' }}>{msg.raw.recommendation}</div>
                        </div>
                      )}

                      {/* Action suggestion */}
                      {msg.raw?.actionSuggested && (
                        <button
                          onClick={() => applyAiAction(msg.raw.actionSuggested)}
                          style={{
                            marginTop: 8, padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                          }}
                        >Apply this action</button>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                    <div style={{
                      padding: '4px 14px', borderRadius: 12,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick questions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0' }}>
                {QUICK_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => sendChat(q)} style={{
                    padding: '5px 11px', borderRadius: 16, fontSize: 11, border: '1px solid var(--border)',
                    background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >{q}</button>
                ))}
              </div>

              {/* Input */}
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  rows={2}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask anything about routes, trucks, zones, performance..."
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, resize: 'none',
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
                <button
                  onClick={() => sendChat()}
                  disabled={chatLoading}
                  style={{
                    padding: '0 18px', borderRadius: 10, border: 'none',
                    background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >{chatLoading ? '...' : 'Send'}</button>
              </div>
            </div>
          )}

          {/* ═══════ TAKE ACTION TAB ═══════ */}
          {tab === 'action' && (
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>

              {/* Action cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* 0. Intelligent Route Optimization */}
                <ActionCard
                  icon={<BarChart2 size={18}/>} title="Intelligent Route Optimization"
                  accent="#8b5cf6"
                  badge="Combined"
                  description="Analyzes bin fill levels and zone importance together to suggest optimally ordered routes. Higher-urgency stops are prioritized first."
                  loading={loadingActionType === 'intelligent_route_optimize'}
                  onPreview={() => {
                    // Attach fill level overrides from local inputs into payload
                    runAction('intelligent_route_optimize', { fillLevelOverrides: fillLevels });
                  }}
                >
                  {/* Fill level sliders for deployed bins */}
                  {(() => {
                    const binnedZones = zones.filter((z) => z.hasBin);
                    return binnedZones.length > 0 ? (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>
                            <TrendingUp size={12}/>
                            <span>Live fill levels — <strong style={{ color: '#8b5cf6' }}>{binnedZones.length} deployed bins</strong></span>
                          </div>
                          <button
                            onClick={loadData}
                            title="Refresh live bin data"
                            style={{
                              padding: '2px 8px', fontSize: 10, borderRadius: 6, border: '1px solid #8b5cf640',
                              background: '#8b5cf610', color: '#8b5cf6', cursor: 'pointer', fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            <RefreshCw size={10}/> Sync
                          </button>
                        </div>
                        <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {binnedZones.map((z) => {
                            const val = fillLevels[z.zoneId] ?? z.binFillLevel ?? 50;
                            const fillColor = val >= 90 ? '#ef4444' : val >= 70 ? '#f59e0b' : '#22c55e';
                            return (
                              <div key={z.zoneId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                                <span style={{ width: 86, color: 'var(--muted)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={z.name}>{z.name}</span>
                                <div style={{ flex: 1, position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
                                  {/* Fill bar background */}
                                  <div style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, background: 'var(--surface-3)' }} />
                                  <div style={{ position: 'absolute', left: 0, width: `${val}%`, height: 6, borderRadius: 3, background: fillColor, transition: 'width 0.2s' }} />
                                  <input
                                    type="range" min={0} max={100} step={5}
                                    value={val}
                                    onChange={(e) => setFillLevels(prev => ({ ...prev, [z.zoneId]: parseInt(e.target.value) }))}
                                    style={{ position: 'absolute', left: 0, right: 0, opacity: 0, cursor: 'pointer', width: '100%', margin: 0 }}
                                  />
                                </div>
                                <span style={{ width: 36, textAlign: 'right', fontWeight: 700, flexShrink: 0, color: fillColor }}>{val}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--muted)', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={12}/> No smart bins deployed yet. Run Simulation epochs first.
                      </div>
                    );
                  })()}
                </ActionCard>

                {/* 1. Road Blocked */}
                <ActionCard
                  icon={<Ban size={18}/>} title="Road Blocked"
                  description="Report a blocked road near a zone. Helper will reroute affected trucks."
                  loading={loadingActionType === 'road_blocked'}
                  onPreview={() => {
                    const zone = zones.find((z) => z.zoneId === roadBlockedZone);
                    runAction('road_blocked', {
                      location: zone?.centerPoint || [23.4671, 73.0155],
                      radius: 0.5,
                      zoneId: roadBlockedZone,
                    });
                  }}
                >
                  <ZoneSelect icon={<Ban size={16}/>} zones={zones} value={roadBlockedZone} onChange={setRoadBlockedZone} />
                </ActionCard>

                {/* 2. Area High Priority */}
                <ActionCard
                  icon={<Zap size={18}/>} title="Area High Priority Today"
                  description="Elevate a zone to first-stop priority for its assigned truck."
                  loading={loadingActionType === 'area_priority'}
                  onPreview={() => runAction('area_priority', { zoneId: areaPriorityZone })}
                >
                  <ZoneSelect icon={<Zap size={16}/>} zones={zones} value={areaPriorityZone} onChange={setAreaPriorityZone} />
                </ActionCard>

                {/* 3. Area Blocked Today */}
                <ActionCard
                  icon={<Ban size={18}/>} title="Area Blocked Today"
                  description="Block a zone. Helper will redistribute its load to the nearest available truck."
                  loading={loadingActionType === 'area_blocked'}
                  onPreview={() => runAction('area_blocked', { zoneId: areaBlockedZone })}
                >
                  <ZoneSelect icon={<Ban size={16}/>} zones={zones} value={areaBlockedZone} onChange={setAreaBlockedZone} />
                </ActionCard>

                {/* 4. Manual Reroute — Structured Zone Sequence Builder */}
                <ActionCard
                  icon={<RefreshCw size={18}/>} title="Manual Reroute"
                  description="Define an explicit route order for a truck. Select zones in the exact sequence you want."
                  loading={loadingActionType === 'reroute_truck'}
                  onPreview={() => {
                    if (!actionTruck) return;
                    runAction('reroute_truck', {
                      truckId: actionTruck,
                      routeSequence: manualRoute,
                    });
                  }}
                >
                  {/* Truck selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)', display: 'flex' }}><Truck size={16}/></span>
                    <select
                      value={actionTruck}
                      onChange={(e) => {
                        setActionTruck(e.target.value);
                        setManualRoute([]);
                      }}
                      style={{ ...selectStyle, border: 'none', padding: 0, background: 'transparent', margin: 0, outline: 'none' }}
                    >
                      <option value="">-- Select Truck --</option>
                      {trucks.filter(t => t.status === 'active').map((t) => (
                        <option key={t.truckId} value={t.truckId}>{t.truckId} — {t.driverName} ({(t.routeSequence||[]).length} zones)</option>
                      ))}
                    </select>
                  </div>

                  {actionTruck && (() => {
                    const selectedTruck = trucks.find(t => t.truckId === actionTruck);
                    const currentSeq = selectedTruck?.routeSequence || [];
                    return (
                      <div style={{ marginTop: 4 }}>
                        {/* Load current route button */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <button
                            onClick={() => setManualRoute([...currentSeq])}
                            style={{
                              flex: 1, padding: '5px 8px', fontSize: 10, borderRadius: 6,
                              border: '1px solid var(--border)', background: 'var(--surface-2)',
                              cursor: 'pointer', color: 'var(--accent)', fontWeight: 600,
                            }}
                          >Load Current Route ({currentSeq.length} stops)</button>
                          <button
                            onClick={() => setManualRoute([])}
                            style={{
                              padding: '5px 8px', fontSize: 10, borderRadius: 6,
                              border: '1px solid #ef444440', background: 'var(--danger-soft)',
                              cursor: 'pointer', color: '#ef4444', fontWeight: 600,
                            }}
                          >Clear</button>
                        </div>

                        {/* Add zone picker */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <select
                            value={rerouteZoneToAdd}
                            onChange={(e) => setRerouteZoneToAdd(e.target.value)}
                            style={{ ...selectStyle, flex: 1, fontSize: 11, padding: '4px 6px' }}
                          >
                            <option value="">+ Add zone to route...</option>
                            {zones
                              .filter(z => !manualRoute.includes(z.zoneId))
                              .map(z => (
                                <option key={z.zoneId} value={z.zoneId}>{z.zoneId} — {z.name} ({z.type?.replace('_',' ')})</option>
                              ))}
                          </select>
                          <button
                            disabled={!rerouteZoneToAdd}
                            onClick={() => {
                              if (rerouteZoneToAdd && !manualRoute.includes(rerouteZoneToAdd)) {
                                setManualRoute(prev => [...prev, rerouteZoneToAdd]);
                                setRerouteZoneToAdd('');
                              }
                            }}
                            style={{
                              padding: '4px 10px', fontSize: 11, borderRadius: 6, fontWeight: 700,
                              border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                            }}
                          >Add</button>
                        </div>

                        {/* Ordered stop list */}
                        {manualRoute.length > 0 && (
                          <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 4, background: 'var(--surface-2)' }}>
                            {manualRoute.map((zoneId, i) => {
                              const z = zones.find(zn => zn.zoneId === zoneId);
                              return (
                                <div key={zoneId} style={{
                                  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px',
                                  fontSize: 11, borderBottom: i < manualRoute.length - 1 ? '1px solid #e5e7eb' : 'none',
                                }}>
                                  <span style={{
                                    width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: 9, fontWeight: 700,
                                    background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0,
                                  }}>{i + 1}</span>
                                  <span style={{ flex: 1, color: 'var(--text)' }}>{z?.name || zoneId}</span>
                                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>{z?.type?.replace('_',' ')}</span>
                                  {/* Move up */}
                                  <button disabled={i === 0} onClick={() => {
                                    const arr = [...manualRoute]; [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; setManualRoute(arr);
                                  }} style={{ border: 'none', background: 'none', cursor: i>0?'pointer':'default', color: i>0?'var(--accent)':'#ccc', fontSize: 12, padding: 0 }}>▲</button>
                                  {/* Move down */}
                                  <button disabled={i === manualRoute.length-1} onClick={() => {
                                    const arr = [...manualRoute]; [arr[i], arr[i+1]] = [arr[i+1], arr[i]]; setManualRoute(arr);
                                  }} style={{ border: 'none', background: 'none', cursor: i<manualRoute.length-1?'pointer':'default', color: i<manualRoute.length-1?'var(--accent)':'#ccc', fontSize: 12, padding: 0 }}>▼</button>
                                  {/* Remove */}
                                  <button onClick={() => setManualRoute(prev => prev.filter((_, j) => j !== i))}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, padding: 0 }}>✕</button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Route preview chain */}
                        {manualRoute.length > 0 && (
                          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Route:</span>
                            {manualRoute.map((id, i) => (
                              <span key={id}>
                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{id}</span>
                                {i < manualRoute.length - 1 && <span style={{ margin: '0 2px' }}>→</span>}
                              </span>
                            ))}
                          </div>
                        )}

                        {manualRoute.length === 0 && (
                          <div style={{ fontSize: 10, color: 'var(--muted)', padding: '6px 0' }}>
                            No stops added yet. Use "Load Current Route" or add zones manually.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </ActionCard>
              </div>

              {/* Action Result */}
              {actionResult && (
                <div style={{
                  marginTop: 16, padding: 14, borderRadius: 10,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}>
                  <h4 style={{ color: 'var(--accent)', margin: '0 0 8px', fontSize: 14, display:'flex', alignItems:'center', gap:6 }}>
                    <ClipboardList size={16}/> Helper Proposal — {actionResult.actionType?.replace('_', ' ')}
                  </h4>

                  {/* Explanation */}
                  {actionResult.explanation && (
                    <div style={{
                      padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                      background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                      fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                    }}>{actionResult.explanation}</div>
                  )}

                  {/* Affected trucks */}
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                    Affected trucks: <strong style={{ color: 'var(--text)' }}>
                      {actionResult.affectedTrucks?.join(', ') || 'None'}
                    </strong>
                  </div>

                  {/* Proposed changes */}
                  {actionResult.proposedChanges?.map((change, i) => (
                    <div key={i} style={{
                      padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)',
                      border: '1px solid var(--border)', marginBottom: 6, fontSize: 12,
                    }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600, display:'flex', alignItems:'center', gap:4, marginBottom: 4 }}><Truck size={12}/> {change.truckId}</div>
                      {change.reason && <div style={{ color: 'var(--muted)', marginTop: 2, marginBottom: 4 }}>{change.reason}</div>}

                      {/* Intelligent optimize: show per-stop urgency breakdown */}
                      {change.stopDetails?.length > 0 ? (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Optimized Stop Order</div>
                          {change.stopDetails.map((stop, si) => (
                            <div key={stop.zoneId} style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
                              borderBottom: si < change.stopDetails.length - 1 ? '1px solid #f0f0f0' : 'none',
                            }}>
                              <span style={{
                                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                background: si === 0 ? '#ef4444' : si === 1 ? '#f59e0b' : si === 2 ? '#eab308' : '#6b7280',
                                color: '#fff', fontSize: 9, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>{si + 1}</span>
                              <span style={{ flex: 1, color: 'var(--text)', fontWeight: 500 }}>{stop.name}</span>
                              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{stop.zoneType}</span>
                              <span style={{
                                fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
                                background: stop.urgencyScore >= 80 ? '#fef2f2' : stop.urgencyScore >= 60 ? '#fffbeb' : '#f0fdf4',
                                color: stop.urgencyScore >= 80 ? '#dc2626' : stop.urgencyScore >= 60 ? '#d97706' : '#16a34a',
                              }}>{stop.fillStatus}</span>
                              <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{stop.urgencyScore}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {change.removedZones?.length > 0 && (
                            <div style={{ color: '#ef4444', marginTop: 2 }}>Removed: {change.removedZones.join(', ')}</div>
                          )}
                          {change.proposedRoute && (
                            <div style={{ color: '#22c55e', marginTop: 2 }}>New route: {change.proposedRoute.join(' -> ')}</div>
                          )}
                        </>
                      )}
                      {change.note && <div style={{ color: 'var(--warn)', marginTop: 4 }}>{change.note}</div>}
                    </div>
                  ))}

                  {/* Approve button with confirmation */}
                  {!confirmAction ? (
                    <button
                      disabled={deployLoading}
                      onClick={() => setConfirmAction(true)}
                      style={{
                        marginTop: 8, width: '100%', padding: '11px 0', borderRadius: 8,
                        border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                        background: 'var(--success)', color: '#fff',
                      }}
                    ><div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6}}><CheckCircle size={16} /> Approve & Notify Drivers</div></button>
                  ) : null}
                  {confirmAction && (
                    <ConfirmModal
                      title="Deploy Route Changes"
                      message="This will update live routes for all affected trucks. Drivers will see the new routes immediately."
                      confirmText="Deploy Now"
                      dangerLevel="warning"
                      onConfirm={deployProposedChanges}
                      onCancel={() => setConfirmAction(null)}
                    />
                  )}
                </div>
              )}


            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes for typing dots */}
      <style>{`
        @keyframes typePulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── Reusable sub-components ─────────────────────────────

const selectStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
  fontSize: 12, boxSizing: 'border-box',
};

function ZoneSelect({ zones, value, onChange, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
      {icon && <span style={{ color: 'var(--muted)', display: 'flex' }}>{icon}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...selectStyle, border: 'none', padding: 0, background: 'transparent', margin: 0, outline: 'none' }}>
        <option value="">-- Select Zone --</option>
        {zones.map((z) => (
          <option key={z.zoneId} value={z.zoneId}>
            {z.zoneId} — {z.name} ({z.type})
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionCard({ icon, title, description, loading, onPreview, children, accent, badge }) {
  const color = accent || 'var(--accent)';
  return (
    <div style={{
      padding: 14, borderRadius: 10, background: 'var(--surface)',
      border: `1px solid ${accent ? accent + '40' : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, color }}>{icon}</span>
        <h4 style={{ margin: 0, color: 'var(--text)', fontSize: 14, flex: 1 }}>{title}</h4>
        {badge && (
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
            background: color + '20', color, border: `1px solid ${color}40`,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>{badge}</span>
        )}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--muted)' }}>{description}</p>
      {children}
      <button
        disabled={loading}
        onClick={onPreview}
        style={{
          marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 8,
          border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
          background: color, color: '#fff',
        }}
      >{loading ? 'Analyzing...' : 'Preview Impact'}</button>
    </div>
  );
}
