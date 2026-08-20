import React from 'react';
import { truckStatusColour } from '../utils/routeUtils';
import { Truck, User } from 'lucide-react';

export default function TruckList({ trucks = [], onSelect, selectedId }) {
  return (
    <div className="panel">
      <h3 className="panel-title" style={{display:'flex', alignItems:'center', gap:6}}><Truck size={18}/> Trucks</h3>
      {trucks.length === 0 && <p className="empty-msg">No trucks loaded.</p>}
      <ul className="item-list">
        {trucks.map((truck) => {
          const loadPct = ((truck.currentLoadFactor ?? 0) * 100).toFixed(0);
          const color   = truckStatusColour(truck.status);
          const active  = truck.truckId === selectedId;
          return (
            <li
              key={truck.truckId}
              className={`item-card ${active ? 'item-card--active' : ''}`}
              onClick={() => onSelect?.(truck)}
            >
              <div className="item-card__header">
                <span className="item-id">{truck.truckId}</span>
                <span className="badge" style={{ background: color }}>
                  {truck.status}
                </span>
              </div>
              <div className="item-card__body">
                <span style={{display:'flex', alignItems:'center', gap:4}}><User size={14}/> {truck.driverName ?? 'Unassigned'}</span>
                <span>{truck.assignedZones?.length ?? 0} zones</span>
              </div>
              {/* Load bar */}
              <div className="load-bar-wrap">
                <div
                  className="load-bar"
                  style={{
                    width: `${loadPct}%`,
                    background:
                      loadPct > 80 ? '#ef4444' :
                      loadPct > 50 ? 'var(--warn)' : '#22c55e',
                  }}
                />
              </div>
              <div className="load-label">{loadPct}% load</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
