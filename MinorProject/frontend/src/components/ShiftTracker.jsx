import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Play, Square, MapPin, CheckCircle2, Clock, Timer } from 'lucide-react';
import { startShift, checkinStop, endShift } from '../utils/api';
import { pushNotification } from '../utils/notifications';

function fmtClock(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Driver shift timer + per-stop attendance check-ins.
 * @param {{ truckId: string, driverName?: string, routeZones: object[], initialShift?: object }} props
 */
export default function ShiftTracker({ truckId, driverName, routeZones = [], initialShift = null }) {
  const [startedAt, setStartedAt] = useState(initialShift?.shiftStartedAt || null);
  const [endedAt, setEndedAt] = useState(initialShift?.shiftEndedAt || null);
  const [progress, setProgress] = useState(initialShift?.stopProgress || []);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const tick = useRef(null);

  // Re-sync when parent refetches
  useEffect(() => {
    if (initialShift) {
      setStartedAt(initialShift.shiftStartedAt || null);
      setEndedAt(initialShift.shiftEndedAt || null);
      setProgress(initialShift.stopProgress || []);
    }
  }, [initialShift?.shiftStartedAt, initialShift?.shiftEndedAt, initialShift?.stopProgress?.length]);

  const onDuty = startedAt && !endedAt;

  useEffect(() => {
    if (onDuty) {
      tick.current = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(tick.current);
    }
  }, [onDuty]);

  const reachedMap = {};
  for (const s of progress) reachedMap[s.zoneId] = s.reachedAt;

  const handleStart = async () => {
    setBusy(true);
    try {
      const r = await startShift(truckId);
      setStartedAt(r.shiftStartedAt);
      setEndedAt(null);
      setProgress(r.stopProgress || []);
      pushNotification({ audience: 'admin', kind: 'ack', title: `${truckId} started shift`, message: `${driverName || 'Driver'} clocked in at ${fmtTime(r.shiftStartedAt)}.` });
      toast.success('Shift started — drive safe!');
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    setBusy(false);
  };

  const handleCheckin = async (zoneId) => {
    if (reachedMap[zoneId]) return;
    setBusy(true);
    try {
      const r = await checkinStop(truckId, zoneId);
      setProgress(r.stopProgress || []);
      toast.success('Stop checked in');
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    setBusy(false);
  };

  const handleEnd = async () => {
    setBusy(true);
    try {
      const r = await endShift(truckId);
      setEndedAt(r.shiftEndedAt);
      const dur = fmtClock(new Date(r.shiftEndedAt) - new Date(r.shiftStartedAt));
      pushNotification({ audience: 'admin', kind: 'deploy', title: `${truckId} ended shift`, message: `${driverName || 'Driver'} clocked out — ${dur}, ${progress.length}/${routeZones.length} stops.` });
      toast.success('Shift ended. Great work!');
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    setBusy(false);
  };

  const elapsed = startedAt ? (endedAt ? new Date(endedAt) - new Date(startedAt) : now - new Date(startedAt)) : 0;

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header / timer */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: onDuty ? 'var(--success-soft)' : 'var(--surface-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>
            <Timer size={15} /> Shift & Attendance
          </div>
          {startedAt && (
            <span className={`pill ${onDuty ? 'pill--live' : 'pill--gold'}`}>
              {onDuty ? <><span className="pill-dot pill-dot--pulse" /> On duty</> : <><CheckCircle2 size={12} /> Completed</>}
            </span>
          )}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', marginTop: 8, letterSpacing: '-0.5px' }}>
          {fmtClock(elapsed)}
        </div>
        {startedAt && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            <Clock size={11} style={{ verticalAlign: -1 }} /> Started {fmtTime(startedAt)}
            {endedAt && <> · Ended {fmtTime(endedAt)}</>}
            {' · '}{progress.length}/{routeZones.length} stops reached
          </div>
        )}
      </div>

      {/* Action */}
      <div style={{ padding: '12px 16px' }}>
        {!startedAt && (
          <button disabled={busy} onClick={handleStart}
            style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Play size={16} /> Start Shift
          </button>
        )}
        {onDuty && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, maxHeight: 220, overflowY: 'auto' }}>
              {routeZones.map((z, i) => {
                const reached = reachedMap[z.zoneId];
                return (
                  <button key={z.zoneId} disabled={busy || !!reached} onClick={() => handleCheckin(z.zoneId)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, cursor: reached ? 'default' : 'pointer', textAlign: 'left',
                      border: `1px solid ${reached ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'var(--border)'}`,
                      background: reached ? 'var(--success-soft)' : 'var(--surface-2)' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: reached ? 'var(--success)' : 'var(--surface-3)', color: reached ? '#fff' : 'var(--text-muted)' }}>
                      {reached ? <CheckCircle2 size={14} /> : i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: reached ? 600 : 500 }}>{z.name}</span>
                    {reached ? (
                      <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>{fmtTime(reached)}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={12} /> Reached</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button disabled={busy} onClick={handleEnd}
              style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: '1px solid var(--danger)', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: 'var(--danger-soft)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Square size={14} /> End Shift
            </button>
          </>
        )}
        {endedAt && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {routeZones.map((z, i) => {
              const reached = reachedMap[z.zoneId];
              return (
                <div key={z.zoneId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < routeZones.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ color: reached ? 'var(--success)' : 'var(--text-faint)' }}>{reached ? <CheckCircle2 size={14} /> : <Clock size={14} />}</span>
                  <span style={{ flex: 1, color: 'var(--text)' }}>{z.name}</span>
                  <span style={{ fontSize: 11, color: reached ? 'var(--success)' : 'var(--text-faint)' }}>{reached ? fmtTime(reached) : 'not reached'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
