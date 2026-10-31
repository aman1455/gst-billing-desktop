import React, { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Clock } from 'lucide-react';
import { getLicenseStatus } from '../store';

export default function LicenseBadge({ onClick, refreshTrigger }) {
  const [status, setStatus] = useState(null);

  const fetchStatus = () => {
    getLicenseStatus()
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  if (!status) return null;

  let bg = '#eff6ff';
  let color = '#2563eb';
  let border = '#bfdbfe';
  let label = 'Activate';
  let Icon = KeyRound;

  if (status.status === 'ACTIVE' && status.type === 'LIFETIME') {
    bg = '#ecfdf5';
    color = '#059669';
    border = '#a7f3d0';
    label = 'Lifetime';
    Icon = ShieldCheck;
  } else if (status.status === 'TRIAL') {
    bg = '#eff6ff';
    color = '#1d4ed8';
    border = '#bfdbfe';
    label = `Trial: ${status.daysLeft}d`;
    Icon = Clock;
  } else {
    bg = '#fef2f2';
    color = '#dc2626';
    border = '#fecaca';
    label = status.status === 'EXPIRED' ? 'Expired' : (status.status === 'TAMPERED' ? 'Clock Error' : 'Activate');
    Icon = AlertCircle;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={status.message || 'License Settings'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        padding: '0 0.85rem',
        height: '36px',
        boxSizing: 'border-box',
        borderRadius: '9999px',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'opacity 0.15s ease'
      }}
    >
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}
