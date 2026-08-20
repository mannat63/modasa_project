import React, { useState } from 'react';
import { riskColour } from '../utils/routeUtils';
import { toggleDumping } from '../utils/api';

import { MapPin, ShoppingCart, Home, Building, GraduationCap, PlusCircle, Factory, Droplets, RefreshCcw, AlertTriangle, ShieldCheck, Flag } from 'lucide-react';

const TYPE_ICONS = {
  Market: <ShoppingCart size={14}/>, Residential_High: <Building size={14}/>, Residential_Low: <Home size={14}/>,
  School: <GraduationCap size={14}/>, Hospital: <PlusCircle size={14}/>, Industrial: <Factory size={14}/>,
};

export default function ZonePanel({ zones = [], onRefresh }) {
  const [search, setSearch] = useState('');

  const filtered = zones.filter(
    (z) =>
      z.name?.toLowerCase().includes(search.toLowerCase()) ||
      z.zoneId?.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleDumping = async (zoneId) => {
    try {
      await toggleDumping(zoneId);
      onRefresh?.();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="panel">
      <h3 className="panel-title" style={{display:'flex', alignItems:'center', gap:6}}><MapPin size={18}/> Zones</h3>
      <input
        className="search-input"
        placeholder="Search zones..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ul className="item-list">
        {filtered.map((zone) => {
          const color = riskColour(zone.riskScore);
          return (
            <li key={zone.zoneId} className="item-card">
              <div className="item-card__header">
                <span className="item-id" style={{display:'flex', alignItems:'center', gap:4}}>
                  {TYPE_ICONS[zone.type] ?? <MapPin size={14}/>} {zone.name}
                </span>
                <span
                  className="badge"
                  style={{ background: color }}
                  title={`Risk: ${zone.riskScore}`}
                >
                  {zone.type}
                </span>
              </div>
              <div className="item-card__body" style={{ fontSize: 12 }}>
                <span style={{display:'flex', alignItems:'center', gap:4}}><Droplets size={12}/> {zone.wasteProfile}</span>
                <span style={{display:'flex', alignItems:'center', gap:4}}><RefreshCcw size={12}/> {zone.pickupFrequency}</span>
                <span style={{display:'flex', alignItems:'center', gap:4}}><AlertTriangle size={12}/> sev {zone.visualSeverity ?? '-'}/5</span>
              </div>
              {/* Risk score bar */}
              <div className="load-bar-wrap">
                <div
                  className="load-bar"
                  style={{ width: `${(zone.riskScore ?? 0) * 100}%`, background: color }}
                />
              </div>
              <div className="load-label">risk {((zone.riskScore ?? 0) * 100).toFixed(0)}%</div>

              {zone.illegalDumping && (
                <div className="flag-chip flag-chip--danger" style={{display:'inline-flex', alignItems:'center', gap:4}}><AlertTriangle size={12}/> Illegal Dumping</div>
              )}
              {zone.sensitiveInstitution && (
                <div className="flag-chip flag-chip--info" style={{display:'inline-flex', alignItems:'center', gap:4}}><PlusCircle size={12}/> Sensitive</div>
              )}
              <button
                className="mini-btn"
                onClick={() => handleToggleDumping(zone.zoneId)}
                title="Toggle illegal dumping flag"
              >
                {zone.illegalDumping ? <span style={{display:'inline-flex', alignItems:'center', gap:4}}><ShieldCheck size={12}/> Clear Dumping</span> : <span style={{display:'inline-flex', alignItems:'center', gap:4}}><Flag size={12} color="#ef4444"/> Flag Dumping</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
