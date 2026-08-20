import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Flag, Rocket, Ban, Zap, CheckCircle, Info, Trash2 } from 'lucide-react';
import {
  getNotifications, unreadCount, markAllRead,
  clearNotifications, onNotificationsChange,
} from '../utils/notifications';

const KIND_META = {
  flag:     { icon: <Flag size={15} />,        color: 'var(--danger)',  bg: 'var(--danger-soft)' },
  deploy:   { icon: <Rocket size={15} />,      color: 'var(--success)', bg: 'var(--success-soft)' },
  block:    { icon: <Ban size={15} />,         color: 'var(--text-muted)', bg: 'var(--surface-3)' },
  priority: { icon: <Zap size={15} />,         color: 'var(--warn)',    bg: 'var(--warn-soft)' },
  ack:      { icon: <CheckCircle size={15} />, color: 'var(--success)', bg: 'var(--success-soft)' },
  info:     { icon: <Info size={15} />,        color: 'var(--accent)',  bg: 'var(--accent-soft)' },
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/** @param {{ audience: string }} props */
export default function NotificationBell({ audience }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    setItems(getNotifications(audience));
    setCount(unreadCount(audience));
  }, [audience]);

  useEffect(() => {
    refresh();
    return onNotificationsChange(refresh);
  }, [refresh]);

  const openPanel = () => {
    setOpen(true);
    markAllRead(audience);
    refresh();
  };

  return (
    <>
      <button className="icon-btn" onClick={() => (open ? setOpen(false) : openPanel())} title="Notifications" aria-label="Notifications">
        <Bell size={17} />
        {count > 0 && <span className="notif-dot">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div className="notif-overlay" onClick={() => setOpen(false)}>
          <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
            <div className="notif-panel__head">
              <span className="notif-panel__title"><Bell size={15} /> Notifications</span>
              {items.length > 0 && (
                <button className="notif-panel__clear" onClick={() => { clearNotifications(audience); refresh(); }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Trash2 size={12} /> Clear all</span>
                </button>
              )}
            </div>
            <div className="notif-list">
              {items.length === 0 && (
                <div className="notif-empty">You're all caught up.</div>
              )}
              {items.map((n) => {
                const m = KIND_META[n.kind] || KIND_META.info;
                return (
                  <div key={n.id} className={`notif-item ${n.read ? '' : 'notif-item--unread'}`}>
                    <div className="notif-item__icon" style={{ background: m.bg, color: m.color }}>{m.icon}</div>
                    <div className="notif-item__body">
                      <div className="notif-item__title">{n.title}</div>
                      {n.message && <div className="notif-item__msg">{n.message}</div>}
                      <div className="notif-item__time">{timeAgo(n.ts)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
