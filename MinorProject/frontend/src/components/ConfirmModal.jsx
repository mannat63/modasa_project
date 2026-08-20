import React from 'react';

const LEVELS = {
  normal:  { bg: 'var(--accent)', color: 'var(--on-accent)' },
  warning: { bg: 'var(--warn)', color: '#fff' },
  danger:  { bg: 'var(--danger)', color: '#fff' },
};

/**
 * Reusable confirmation modal.
 * @param {string}   title        — Modal heading
 * @param {string}   message      — Body text
 * @param {string}   confirmText  — Button label (default "Confirm")
 * @param {Function} onConfirm    — Called on confirm
 * @param {Function} onCancel     — Called on dismiss
 * @param {'normal'|'warning'|'danger'} dangerLevel
 */
export default function ConfirmModal({
  title = 'Confirm',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  onConfirm,
  onCancel,
  dangerLevel = 'normal',
}) {
  const level = LEVELS[dangerLevel] || LEVELS.normal;

  return (
    <div
      className="confirm-overlay"
      onClick={onCancel}
    >
      <div
        className="confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: 'var(--text)', margin: '0 0 8px', fontSize: 16 }}>{title}</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="confirm-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="confirm-action-btn"
            style={{ background: level.bg, color: level.color }}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
