import React, { useState } from 'react';
import { updateFlag } from '../utils/api';

import { Flag, Truck, MapPin, User, ClipboardList, AlertTriangle, Package, SkipForward, Clock } from 'lucide-react';

const TYPE_ICONS = {
  road_blocked: <AlertTriangle size={14}/>, overloaded: <Package size={14}/>, skipped: <SkipForward size={14}/>, delay: <Clock size={14}/>,
};

const STATUS_COLOR = {
  pending: 'var(--warn)', acknowledged: 'var(--text)', actioned: '#22c55e',
};

export default function FlagPanel({ flags = [], onRefresh }) {
  const [noteMap, setNoteMap] = useState({});

  const handle = async (flagId, status) => {
    try {
      await updateFlag(flagId, { status, adminNote: noteMap[flagId] || '' });
      onRefresh?.();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="panel">
      <h3 className="panel-title" style={{display:'flex', alignItems:'center', gap:6}}><Flag size={18}/> Flags</h3>
      {flags.length === 0 && <p className="empty-msg">No active flags.</p>}
      <ul className="item-list">
        {flags.map((flag) => {
          const color = STATUS_COLOR[flag.status] ?? '#6b7280';
          return (
            <li key={flag.flagId} className="item-card">
              <div className="item-card__header">
                <span className="item-id" style={{display:'flex', alignItems:'center', gap:4}}>
                  {TYPE_ICONS[flag.type] ?? <Flag size={14}/>} {flag.type?.replace('_', ' ')}
                </span>
                <span className="badge" style={{ background: color }}>{flag.status}</span>
              </div>
              <div className="item-card__body" style={{ fontSize: 12 }}>
                <span style={{display:'flex', alignItems:'center', gap:4}}><Truck size={12}/> {flag.truckId}</span>
                <span style={{display:'flex', alignItems:'center', gap:4}}><MapPin size={12}/> {flag.zoneId}</span>
                <span style={{display:'flex', alignItems:'center', gap:4}}><User size={12}/> {flag.driverName}</span>
              </div>
              {flag.skipReason && (
                <p className="sub-note">Reason: {flag.skipReason}</p>
              )}
              <div className="flag-timestamp">
                {flag.timestamp ? new Date(flag.timestamp).toLocaleString() : ''}
              </div>

              {/* Admin note + actions */}
              {flag.status === 'pending' && (
                <div className="flag-actions">
                  <input
                    className="search-input"
                    placeholder="Admin note..."
                    value={noteMap[flag.flagId] ?? ''}
                    onChange={(e) =>
                      setNoteMap((p) => ({ ...p, [flag.flagId]: e.target.value }))
                    }
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="mini-btn mini-btn--blue"
                      onClick={() => handle(flag.flagId, 'acknowledged')}
                    >
                      Acknowledge
                    </button>
                    <button
                      className="mini-btn mini-btn--green"
                      onClick={() => handle(flag.flagId, 'actioned')}
                    >
                      Action
                    </button>
                  </div>
                </div>
              )}
              {flag.adminNote && (
                <p className="sub-note" style={{display:'flex', alignItems:'center', gap:4}}><ClipboardList size={12}/> {flag.adminNote}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
