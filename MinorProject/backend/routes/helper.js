const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const Truck = require('../models/Truck');
const Zone = require('../models/Zone');
const Flag = require('../models/Flag');
const Route = require('../models/Route');
const AuditLog = require('../models/AuditLog');
const {
  calculateDistance,
  calculateRouteMetrics,
  greedyRouteOptimize,
} = require('../utils/routingEngine');
const { buildDistFn } = require('../utils/roadDistance');

// Road-distance function over the given depots + zone centres for a request
// (cached OSRM matrix call; transparent Haversine fallback).
async function roadDistFor(trucks, zones) {
  const pts = [
    ...(trucks || []).map((t) => t.depotLocation).filter(Boolean),
    ...(zones || []).map((z) => z.centerPoint || z.center).filter(Boolean),
  ];
  return buildDistFn(pts, { timeoutMs: 4000 });
}

// ── Groq client (lazy) ──────────────────────────────────
// Instantiated on first use so a missing GROQ_API_KEY only fails the AI
// endpoints — it must NOT throw at module load and crash the whole API.
let _groq = null;
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      const e = new Error('AI is not configured (GROQ_API_KEY missing)');
      e.statusCode = 503;
      throw e;
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

const SYSTEM_PROMPT = `You are the AI assistant for a municipal waste management system in Modasa, India.
You have access to live operational data. Answer questions clearly and concisely.
Always structure your response as JSON with this exact format:
{
  "answer": "Your main answer in plain English",
  "dataPoints": ["specific fact 1", "specific fact 2"],
  "recommendation": "Optional: one clear recommendation",
  "actionSuggested": null,
  "mapHighlight": null
}
Where actionSuggested can be null or:
{ "type": "reroute|prioritize|block|none", "truckId": "...", "zoneId": "...", "description": "..." }
And mapHighlight can be null or:
{ "type": "zone|truck|route", "ids": ["..."] }
Return ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON.`;

// ── Helper: gather live context from database ───────────
async function gatherLiveContext() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [trucks, zones, flags, auditLogs, deployedRoutes, blockedZones] = await Promise.all([
    Truck.find().lean(),
    Zone.find().lean(),
    Flag.find({ timestamp: { $gte: today } }).sort({ timestamp: -1 }).lean(),
    AuditLog.find({ timestamp: { $gte: today } }).sort({ timestamp: -1 }).limit(20).lean(),
    Route.find({ date: { $gte: today }, status: 'deployed' }).lean(),
    Zone.find({ blockedToday: true }).lean(),
  ]);

  const activeTrucks = trucks.filter((t) => t.status === 'active');
  const avgLoad =
    activeTrucks.length > 0
      ? activeTrucks.reduce((s, t) => s + (t.currentLoadFactor || 0), 0) / activeTrucks.length
      : 0;

  // Determine system state
  const binnedZones = zones.filter((z) => z.hasBin);
  let systemState = 'S0';
  if (binnedZones.length > zones.length * 0.2) systemState = 'S1';
  if (binnedZones.length > zones.length * 0.4) systemState = 'S2';

  const problemZones = zones.filter(z => z.blockedToday || z.illegalDumping || (z.riskScore || 0) >= 0.6);
  return {
    summary: {
      totalZones: zones.length,
      totalTrucks: trucks.length,
      activeTrucks: activeTrucks.length,
      avgLoadFactor: parseFloat(avgLoad.toFixed(3)),
      pendingFlags: flags.filter((f) => f.status === 'pending').length,
      deployedRoutes: deployedRoutes.length,
      blockedZones: blockedZones.length,
      systemState,
    },
    trucks: activeTrucks.map((t) => ({
      id: t.truckId,
      routeLen: t.routeSequence?.length || 0,
      load: t.currentLoadFactor,
    })),
    problemZones: problemZones.map((z) => ({
      id: z.zoneId,
      risk: z.riskScore,
      blocked: z.blockedToday,
      dumping: z.illegalDumping,
    })),
    flags: flags.filter((f) => f.status === 'pending').map((f) => ({
      truck: f.truckId,
      zone: f.zoneId,
      type: f.type,
    })),
    audit: auditLogs.slice(0, 3).map((a) => a.action),
  };
}

// ── Helper: call Groq LLM ───────────────────────────────
async function callGroq(systemPrompt, userMessage) {
  const completion = await getGroq().chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  const raw = completion.choices?.[0]?.message?.content || '{}';

  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      answer: raw,
      dataPoints: [],
      recommendation: null,
      actionSuggested: null,
      mapHighlight: null,
    };
  }
}

// ═════════════════════════════════════════════════════════
// POST /api/ai/query — Ask the AI a question with live context
// ═════════════════════════════════════════════════════════
router.post('/query', async (req, res) => {
  try {
    const { question, context: extraContext } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: 'question is required' });
    }

    // 1. Gather live context
    const liveContext = await gatherLiveContext();

    // 2. Build user message with context
    const userMessage = `
LIVE OPERATIONAL DATA:
${JSON.stringify(liveContext)}

${extraContext ? `ADDITIONAL CONTEXT:\n${JSON.stringify(extraContext)}\n` : ''}
USER QUESTION: ${question}
`;

    // 3. Call Groq
    const parsed = await callGroq(SYSTEM_PROMPT, userMessage);

    // 4. Audit log
    await AuditLog.create({
      actor: 'ai',
      actorId: 'groq-gpt-oss',
      action: 'QUERY_ANSWERED',
      details: { question, answerPreview: (parsed.answer || '').slice(0, 200) },
      outcome: 'success',
    });

    // 5. Return
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('POST /ai/query error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════
// POST /api/ai/action — AI-assisted operational action
// ═════════════════════════════════════════════════════════
router.post('/action', async (req, res) => {
  try {
    const { actionType, payload, adminId } = req.body;

    if (!actionType) {
      return res.status(400).json({ success: false, error: 'actionType is required' });
    }

    const trucks = await Truck.find().lean();
    const zones = await Zone.find().lean();
    const zoneMap = {};
    for (const z of zones) zoneMap[z.zoneId] = z;

    // Road-distance basis for all re-routing in this action (OSRM, Haversine fallback)
    const roadDist = await roadDistFor(trucks, zones);

    let affectedTrucks = [];
    let proposedChanges = [];

    // ── road_blocked ────────────────────────────────────
    if (actionType === 'road_blocked') {
      const { location, radius } = payload || {};
      // location = [lat, lng], radius in km (default 0.5)
      const refPoint = location || [23.4671, 73.0155];
      const maxDist = radius || 0.5;

      // Find zones within range of the blocked road
      const nearbyZoneIds = new Set();
      for (const z of zones) {
        if (!z.centerPoint) continue;
        const d = roadDist(refPoint, z.centerPoint);
        if (d <= maxDist) nearbyZoneIds.add(z.zoneId);
      }

      // Find trucks whose routeSequence passes through those zones
      for (const t of trucks) {
        const seq = t.routeSequence || [];
        const affected = seq.filter((id) => nearbyZoneIds.has(id));
        if (affected.length > 0) {
          // Re-route excluding affected zones
          const remainingZones = seq
            .filter((id) => !nearbyZoneIds.has(id))
            .map((id) => zoneMap[id])
            .filter(Boolean);
          const newSeq = greedyRouteOptimize(remainingZones, t.depotLocation || [23.4671, 73.0155], roadDist);

          affectedTrucks.push(t.truckId);
          proposedChanges.push({
            truckId: t.truckId,
            originalRoute: seq,
            proposedRoute: newSeq,
            removedZones: affected,
            reason: `Road blocked near [${refPoint}], zones ${affected.join(', ')} are inaccessible`,
          });
        }
      }
    }

    // ── area_blocked ────────────────────────────────────
    else if (actionType === 'area_blocked') {
      const { zoneId } = payload || {};
      const blockedZone = zoneMap[zoneId];

      if (blockedZone) {
        // Find the truck assigned to this zone
        const assignedTruck = trucks.find((t) =>
          (t.assignedZones || []).includes(zoneId) || (t.routeSequence || []).includes(zoneId)
        );

        if (assignedTruck) {
          affectedTrucks.push(assignedTruck.truckId);

          // Find nearest truck with low load to absorb the zone's neighbours
          const otherTrucks = trucks.filter(
            (t) => t.truckId !== assignedTruck.truckId && t.status === 'active' && (t.currentLoadFactor || 0) < 0.85
          );

          let absorber = null;
          let bestDist = Infinity;
          for (const ot of otherTrucks) {
            const depot = ot.depotLocation || [23.4671, 73.0155];
            const d = roadDist(depot, blockedZone.centerPoint || [23.4671, 73.0155]);
            if (d < bestDist) {
              bestDist = d;
              absorber = ot;
            }
          }

          // Reroute assigned truck without this zone
          const remainingZones = (assignedTruck.routeSequence || [])
            .filter((id) => id !== zoneId)
            .map((id) => zoneMap[id])
            .filter(Boolean);
          const newSeq = greedyRouteOptimize(remainingZones, assignedTruck.depotLocation || [23.4671, 73.0155], roadDist);

          proposedChanges.push({
            truckId: assignedTruck.truckId,
            originalRoute: assignedTruck.routeSequence,
            proposedRoute: newSeq,
            removedZones: [zoneId],
            reason: `Zone ${zoneId} (${blockedZone.name}) is blocked`,
          });

          if (absorber) {
            affectedTrucks.push(absorber.truckId);
            proposedChanges.push({
              truckId: absorber.truckId,
              originalRoute: absorber.routeSequence,
              proposedRoute: [...(absorber.routeSequence || [])],
              note: `Truck ${absorber.truckId} (load: ${((absorber.currentLoadFactor || 0) * 100).toFixed(0)}%) is the nearest available truck if zone work needs absorption`,
              reason: `Standby absorber for blocked zone ${zoneId}`,
            });
          }
        }
      }
    }

    // ── area_priority ───────────────────────────────────
    else if (actionType === 'area_priority') {
      const { zoneId } = payload || {};

      // Find the truck that services this zone
      const assignedTruck = trucks.find((t) =>
        (t.routeSequence || []).includes(zoneId)
      );

      if (assignedTruck) {
        affectedTrucks.push(assignedTruck.truckId);

        // Move the priority zone to position 0 in the sequence
        const seq = [...(assignedTruck.routeSequence || [])];
        const idx = seq.indexOf(zoneId);
        if (idx > 0) {
          seq.splice(idx, 1);
          seq.unshift(zoneId);
        }

        proposedChanges.push({
          truckId: assignedTruck.truckId,
          originalRoute: assignedTruck.routeSequence,
          proposedRoute: seq,
          reason: `Zone ${zoneId} elevated to first stop for priority servicing`,
        });
      }
    }

    // ── reroute_truck ───────────────────────────────────
    else if (actionType === 'reroute_truck') {
      const { truckId, routeSequence: explicitSeq, excludeZones } = payload || {};
      const truck = trucks.find((t) => t.truckId === truckId);

      if (truck) {
        affectedTrucks.push(truck.truckId);

        if (explicitSeq && Array.isArray(explicitSeq) && explicitSeq.length > 0) {
          // ── Structured manual reroute: admin defined exact zone order ──
          // Validate all zone IDs exist
          const validIds = explicitSeq.filter((id) => zoneMap[id]);
          const invalidIds = explicitSeq.filter((id) => !zoneMap[id]);

          const stopDetails = validIds.map((id, i) => {
            const z = zoneMap[id];
            return {
              zoneId: id,
              name: z?.name || id,
              zoneType: z?.type || 'Unknown',
              stopNumber: i + 1,
            };
          });

          proposedChanges.push({
            truckId: truck.truckId,
            originalRoute: truck.routeSequence || [],
            proposedRoute: validIds,
            stopDetails,
            reason: invalidIds.length > 0
              ? `Manual route set: ${validIds.length} stops. Warning: ${invalidIds.join(', ')} not found.`
              : `Manual route set: ${validIds.length} stops in admin-defined order.`,
          });
        } else {
          // ── Legacy fallback: exclude zones and re-optimize ──
          const excludeSet = new Set(excludeZones || []);
          const remainingZones = (truck.routeSequence || [])
            .filter((id) => !excludeSet.has(id))
            .map((id) => zoneMap[id])
            .filter(Boolean);
          const newSeq = greedyRouteOptimize(remainingZones, truck.depotLocation || [23.4671, 73.0155], roadDist);

          proposedChanges.push({
            truckId: truck.truckId,
            originalRoute: truck.routeSequence,
            proposedRoute: newSeq,
            removedZones: excludeZones || [],
            reason: `Manual reroute: excluding zones ${(excludeZones || []).join(', ')}`,
          });
        }
      }
    }

    // ── intelligent_route_optimize ───────────────────────
    else if (actionType === 'intelligent_route_optimize') {
      const { fillLevelOverrides = {} } = payload || {};

      // Composite urgency = bin fill weight + zone importance weight
      // fillScore: hasBin zones get 0–60 pts based on fill%, no-bin zones use riskScore*40
      // importanceScore: priorityWeight-based 0–40 pts
      const IMPORTANCE_MAX = 1.5;

      const zoneUrgency = {};
      for (const z of zones) {
        let fillScore = 0;
        let fillLabel = 'No bin';

        if (z.hasBin) {
          // Admin override > stored value > default 50%
          const fill = fillLevelOverrides[z.zoneId] != null
            ? fillLevelOverrides[z.zoneId]
            : (z.binFillLevel != null ? z.binFillLevel : 50);
          fillScore = (fill / 100) * 60;
          if (fill >= 90) fillLabel = `OVERFLOW RISK (${fill}%)`;
          else if (fill >= 70) fillLabel = `${fill}% — high`;
          else if (fill >= 40) fillLabel = `${fill}% — moderate`;
          else fillLabel = `${fill}% — low`;
        } else {
          // No bin: use riskScore as fill urgency proxy
          fillScore = (z.riskScore || 0.5) * 40;
          fillLabel = `No bin (risk ${((z.riskScore || 0) * 100).toFixed(0)}%)`;
        }

        const pw = z.priorityWeight || 1.0;
        const importanceScore = (pw / IMPORTANCE_MAX) * 40;
        const total = fillScore + importanceScore;

        zoneUrgency[z.zoneId] = {
          fillScore: parseFloat(fillScore.toFixed(1)),
          importanceScore: parseFloat(importanceScore.toFixed(1)),
          total: parseFloat(total.toFixed(1)),
          fillLabel,
          type: z.type,
          name: z.name,
        };
      }

      // For each active truck, intelligently recalculate route geographically using urgency weights
      const activeTrucks = trucks.filter((t) => t.status === 'active' && (t.routeSequence || []).length > 1);
      for (const t of activeTrucks) {
        const origSeq = [...(t.routeSequence || [])];
        const remaining = origSeq.map(id => zoneMap[id]).filter(Boolean);
        if (remaining.length === 0) continue;

        const depot = t.depotLocation || [23.4671, 73.0155];
        let currentLoc = depot;
        const newRoute = [];

        // Nearest-urgency-neighbor routing algorithm
        while (remaining.length > 0) {
          let bestIdx = 0;
          let bestScore = -Infinity;

          for (let i = 0; i < remaining.length; i++) {
            const z = remaining[i];
            const u = zoneUrgency[z.zoneId]?.total || 1.0;
            const dist = roadDist(currentLoc, z.centerPoint || [23.4671, 73.0155]);
            
            // Optimization logic: strongly favor urgency, but factor in travel distance linearly.
            // By subtracting distance (in km) * penalty, a highly urgent bin (score 90) easily beats
            // a low urgency bin (score 50) even if the urgent bin is 15km away (15 * 1.5 = 22.5 penalty).
            // This prevents depot proximity from locking the first stop and genuinely reorders routes based on priority!
            const score = u - (dist * 1.5); 

            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          }

          const chosen = remaining.splice(bestIdx, 1)[0];
          newRoute.push(chosen.zoneId);
          currentLoc = chosen.centerPoint || currentLoc;
        }

        const changed = newRoute.some((id, i) => id !== origSeq[i]);
        if (changed) {
          affectedTrucks.push(t.truckId);
          const stopDetails = newRoute.map((id) => {
            const u = zoneUrgency[id] || {};
            return {
              zoneId: id,
              name: u.name || id,
              urgencyScore: u.total || 0,
              fillStatus: u.fillLabel || 'Unknown',
              zoneType: u.type || 'Unknown',
            };
          });
          proposedChanges.push({
            truckId: t.truckId,
            originalRoute: origSeq,
            proposedRoute: newRoute,
            stopDetails,
            reason: `Optimized by combining geographic proximity and urgency. Top stop: ${zoneUrgency[newRoute[0]]?.name} (score ${zoneUrgency[newRoute[0]]?.total})`,
          });
        }
      }
    }

    // ── Generate AI explanation ──────────────────────────
    let explanation = '';
    try {
      const explainPrompt = `You are a waste management operations AI. Given these proposed route changes, write a clear 2-3 sentence explanation of what happened and why. Be specific with truck and zone IDs. Return ONLY plain text, no JSON.`;
      const explainMsg = `Action: ${actionType}\nAffected trucks: ${affectedTrucks.join(', ')}\nChanges:\n${JSON.stringify(proposedChanges)}`;

      const completion = await getGroq().chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: explainPrompt },
          { role: 'user', content: explainMsg },
        ],
        max_tokens: 300,
        temperature: 0.3,
      });
      explanation = completion.choices?.[0]?.message?.content || 'Changes proposed successfully.';
    } catch (aiErr) {
      console.error('AI explanation generation failed:', aiErr.message);
      explanation = `Action "${actionType}" would affect ${affectedTrucks.length} truck(s). Review proposed changes before deploying.`;
    }

    // ── Audit log ───────────────────────────────────────
    await AuditLog.create({
      actor: 'ai',
      actorId: adminId || 'system',
      action: `AI_ACTION_${actionType.toUpperCase()}`,
      details: {
        actionType,
        affectedTrucks,
        proposedChangesCount: proposedChanges.length,
      },
      outcome: 'success',
    });

    res.json({
      success: true,
      data: {
        affectedTrucks,
        proposedChanges,
        explanation,
        requiresApproval: true,
      },
    });
  } catch (err) {
    console.error('POST /ai/action error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════
// Legacy endpoints (kept for frontend compatibility)
// ═════════════════════════════════════════════════════════

// POST /api/ai/chat — alias for /query
router.post('/chat', async (req, res) => {
  try {
    const { message, question } = req.body;
    const q = question || message;
    if (!q) return res.status(400).json({ success: false, error: 'message or question is required' });

    const liveContext = await gatherLiveContext();
    const userMessage = `LIVE DATA:\n${JSON.stringify(liveContext.summary)}\n\nTrucks: ${liveContext.trucks.length}, Zones: ${liveContext.zones.length}, Flags today: ${liveContext.todayFlags.length}\n\nQUESTION: ${q}`;
    const parsed = await callGroq(SYSTEM_PROMPT, userMessage);

    await AuditLog.create({
      actor: 'ai',
      actorId: 'groq-gpt-oss',
      action: 'CHAT_ANSWERED',
      details: { question: q },
      outcome: 'success',
    });

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('POST /ai/chat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/suggest-route — quick route suggestion
router.post('/suggest-route', async (req, res) => {
  try {
    const { truckId, zoneIds } = req.body;
    const truck = await Truck.findOne({ truckId }).lean();
    if (!truck) return res.status(404).json({ success: false, error: 'Truck not found' });

    const targetZoneIds = zoneIds || truck.assignedZones || [];
    const zoneObjects = await Zone.find({ zoneId: { $in: targetZoneIds } }).lean();
    const depot = truck.depotLocation || [23.4671, 73.0155];

    const roadDist = await roadDistFor([truck], zoneObjects);
    const optimizedSeq = greedyRouteOptimize(zoneObjects, depot, roadDist);
    const orderedZones = optimizedSeq.map((id) => zoneObjects.find((z) => z.zoneId === id)).filter(Boolean);
    const metrics = calculateRouteMetrics(orderedZones, depot, roadDist);

    res.json({
      success: true,
      data: {
        truckId,
        suggestedRoute: optimizedSeq,
        metrics,
      },
    });
  } catch (err) {
    console.error('POST /ai/suggest-route error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/analyse-zones — zone risk analysis
router.post('/analyse-zones', async (req, res) => {
  try {
    const zones = await Zone.find().lean();
    const highRisk = zones.filter((z) => (z.riskScore || 0) >= 0.7);
    const dumping = zones.filter((z) => z.illegalDumping);
    const blocked = zones.filter((z) => z.blockedToday);

    const summary = {
      totalZones: zones.length,
      highRiskCount: highRisk.length,
      illegalDumpingCount: dumping.length,
      blockedCount: blocked.length,
      highRiskZones: highRisk.map((z) => ({ zoneId: z.zoneId, name: z.name, riskScore: z.riskScore })),
      avgRiskScore: parseFloat((zones.reduce((s, z) => s + (z.riskScore || 0), 0) / (zones.length || 1)).toFixed(3)),
    };

    let aiAnalysis = null;
    try {
      const analysisPrompt = `Analyse this zone risk data for a municipal waste system in Modasa, India. Give a brief risk summary and 2-3 actionable recommendations. Return plain text.`;
      const completion = await getGroq().chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: analysisPrompt },
          { role: 'user', content: JSON.stringify(summary) },
        ],
        max_tokens: 500,
        temperature: 0.3,
      });
      aiAnalysis = completion.choices?.[0]?.message?.content || null;
    } catch (aiErr) {
      console.error('AI analysis failed:', aiErr.message);
    }

    res.json({ success: true, data: { ...summary, aiAnalysis } });
  } catch (err) {
    console.error('POST /ai/analyse-zones error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/generate-report — markdown operations report
router.post('/generate-report', async (req, res) => {
  try {
    const liveContext = await gatherLiveContext();

    const reportPrompt = `Generate a concise daily operations report in Markdown format for the Modasa Municipal Waste Management system. Include: Executive Summary, Fleet Status, Zone Risk Overview, Flags & Incidents, and Recommendations. Use the live data provided. Keep it to about 400 words.`;

    const completion = await getGroq().chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: reportPrompt },
        { role: 'user', content: JSON.stringify(liveContext) },
      ],
      max_tokens: 1000,
      temperature: 0.4,
    });

    const report = completion.choices?.[0]?.message?.content || '# Report generation failed';

    await AuditLog.create({
      actor: 'ai',
      actorId: 'groq-gpt-oss',
      action: 'GENERATE_REPORT',
      details: { reportLength: report.length },
      outcome: 'success',
    });

    res.json({ success: true, data: { report } });
  } catch (err) {
    console.error('POST /ai/generate-report error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═════════════════════════════════════════════════════════
// POST /api/ai/deploy-road-blocked
// Triggered ONLY when "Deploy Now" is clicked in the Helper panel.
// Persists blocked state on zones and reroutes affected trucks.
// ═════════════════════════════════════════════════════════
router.post('/deploy-road-blocked', async (req, res) => {
  try {
    const { blockedZoneIds = [], proposedChanges = [], adminId, actionType } = req.body;

    if (!blockedZoneIds.length && !proposedChanges.length) {
      return res.status(400).json({ success: false, error: 'blockedZoneIds or proposedChanges required' });
    }

    // Collect all zone IDs to block (from direct list + proposed change removedZones)
    const allZoneIdsToBlock = new Set(blockedZoneIds);
    for (const c of proposedChanges) {
      for (const id of (c.removedZones || [])) allZoneIdsToBlock.add(id);
    }

    // 1. Mark each zone as blockedToday, roadBlocked, or highPriorityToday depending on actionType
    const blockedResults = [];
    if (actionType === 'area_priority') {
      const { targetZoneId } = req.body;
      if (targetZoneId) {
        const zone = await Zone.findOneAndUpdate({ zoneId: targetZoneId }, { highPriorityToday: true }, { returnDocument: 'after' });
        if (zone) blockedResults.push(zone.zoneId);
      }
    } else {
      const updateField = actionType === 'road_blocked' ? { roadBlocked: true } : { blockedToday: true };
      for (const zoneId of allZoneIdsToBlock) {
        const zone = await Zone.findOneAndUpdate(
          { zoneId },
          updateField,
          { returnDocument: 'after' }
        );
        if (zone) blockedResults.push(zone.zoneId);
      }
    }

    // 2. Apply proposed route changes to trucks (skip blocked zones)
    const updatedTrucks = [];
    const freshZones = await Zone.find().lean();
    const zoneMap = {};
    for (const z of freshZones) zoneMap[z.zoneId] = z;

    const allTrucksForDist = await Truck.find().lean();
    const roadDist = await roadDistFor(allTrucksForDist, freshZones);

    for (const change of proposedChanges) {
      if (!change.truckId || !change.proposedRoute) continue;
      const truck = await Truck.findOne({ truckId: change.truckId }).lean();
      if (!truck) continue;

      const depot = truck.depotLocation || [23.4671, 73.0155];
      const seqZones = change.proposedRoute.map((id) => zoneMap[id]).filter(Boolean);
      const metrics = calculateRouteMetrics(seqZones, depot, roadDist);

      await Truck.findOneAndUpdate(
        { truckId: change.truckId },
        {
          routeSequence: change.proposedRoute,
          estimatedDistance: metrics.totalDistance,
          estimatedDuration: metrics.estimatedDuration,
          currentLoadFactor: metrics.loadFactor,
        }
      );
      updatedTrucks.push(change.truckId);
    }

    // 3. Audit log
    await AuditLog.create({
      actor: 'admin',
      actorId: adminId || 'admin',
      action: 'DEPLOY_ROAD_BLOCKED',
      details: {
        blockedZones: [...allZoneIdsToBlock],
        trucksRerouted: updatedTrucks,
      },
      outcome: 'success',
    });

    console.log(`[DEPLOY_ROAD_BLOCKED] Zones blocked: ${[...allZoneIdsToBlock].join(', ')} | Trucks rerouted: ${updatedTrucks.join(', ')}`);

    res.json({
      success: true,
      data: {
        blockedZones: [...allZoneIdsToBlock],
        trucksRerouted: updatedTrucks,
      },
    });
  } catch (err) {
    console.error('POST /ai/deploy-road-blocked error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

