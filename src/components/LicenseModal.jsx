import React, { useState, useEffect } from 'react';
import { KeyRound, Copy, Check, ShieldCheck, AlertTriangle, Clock, ExternalLink, X } from 'lucide-react';
import { getLicenseStatus, activateLicense } from '../store';

export default function LicenseModal({ isOpen, onClose, onLicenseUpdated }) {
  const [statusData, setStatusData] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getLicenseStatus()
      .then((data) => {
        if (active) setStatusData(data);
      })
      .catch(() => {
        if (active) setErrorMsg('Failed to check license status.');
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleCopyHwid = () => {
    if (!statusData?.hwid) return;
    navigator.clipboard.writeText(statusData.hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setErrorMsg('Please enter a license key.');
      return;
    }
    try {
      setSubmitting(true);
      setErrorMsg('');
      setSuccessMsg('');
      const updated = await activateLicense(keyInput.trim());
      setStatusData(updated);
      setSuccessMsg(updated.message || 'License activated successfully!');
      setKeyInput('');
      if (onLicenseUpdated) onLicenseUpdated(updated);
    } catch (err) {
      setErrorMsg(err.message || 'Activation failed. Please check your key.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const hwid = statusData?.hwid || 'Loading...';
  const waText = encodeURIComponent(`Hello, I would like to activate E-Munim GST Billing Software.\nMy Machine ID is: ${hwid}`);
  const waUrl = `https://wa.me/?text=${waText}`;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        color: 'var(--text, #0f172a)',
        borderRadius: '16px',
        maxWidth: '560px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--border, #e2e8f0)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-subtle, #f8fafc)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: '#2563eb',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <KeyRound size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Software License</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                Offline Machine-Locked Activation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
              padding: '4px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem' }}>
          {/* Status Alert Banner */}
          {statusData && (
            <div style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              backgroundColor: statusData.valid
                ? (statusData.type === 'LIFETIME' ? '#ecfdf5' : '#eff6ff')
                : '#fef2f2',
              border: `1px solid ${
                statusData.valid
                  ? (statusData.type === 'LIFETIME' ? '#a7f3d0' : '#bfdbfe')
                  : '#fecaca'
              }`,
              color: statusData.valid
                ? (statusData.type === 'LIFETIME' ? '#065f46' : '#1e40af')
                : '#991b1b'
            }}>
              {statusData.valid ? (
                statusData.type === 'LIFETIME' ? <ShieldCheck size={20} style={{ flexShrink: 0, marginTop: 2 }} /> : <Clock size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              ) : (
                <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <div style={{ fontSize: '0.875rem' }}>
                <div style={{ fontWeight: 600 }}>
                  {statusData.status === 'ACTIVE' && 'Lifetime License Active'}
                  {statusData.status === 'TRIAL' && `Demo Trial (${statusData.daysLeft} Day${statusData.daysLeft === 1 ? '' : 's'} Left)`}
                  {statusData.status === 'EXPIRED' && 'Trial Expired'}
                  {statusData.status === 'TAMPERED' && 'System Clock Tamper Warning'}
                  {statusData.status === 'UNLICENSED' && 'Activation Required'}
                  {statusData.status === 'HWID_MISMATCH' && 'Hardware Mismatch'}
                </div>
                <div style={{ marginTop: '0.25rem', opacity: 0.9 }}>
                  {statusData.message}
                </div>
              </div>
            </div>
          )}

          {/* Machine ID Box */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.4rem', color: 'var(--text-muted, #475569)' }}>
              Your Machine ID (Hardware Fingerprint):
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-subtle, #f1f5f9)',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border, #cbd5e1)'
            }}>
              <code style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '1px', flex: 1, fontFamily: 'monospace' }}>
                {hwid}
              </code>
              <button
                type="button"
                onClick={handleCopyHwid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: copied ? '#10b981' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy ID'}
              </button>
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
              Share this Machine ID via WhatsApp or email to receive your Demo or Permanent license key.
            </p>
          </div>

          {/* Action Link to WhatsApp */}
          <div style={{ marginBottom: '1.25rem' }}>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: '#16a34a',
                fontSize: '0.85rem',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <ExternalLink size={14} /> Share Machine ID on WhatsApp
            </a>
          </div>

          {/* Activation Key Input */}
          <form onSubmit={handleActivate}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.4rem', color: 'var(--text-muted, #475569)' }}>
              Enter License Key:
            </label>
            <textarea
              rows={3}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your EMUNIM-LIC-... key here"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                resize: 'none',
                marginBottom: '0.75rem',
                background: 'var(--bg, #ffffff)',
                color: 'var(--text, #0f172a)'
              }}
            />

            {errorMsg && (
              <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem', fontWeight: 500 }}>
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div style={{ color: '#10b981', fontSize: '0.8rem', marginBottom: '0.75rem', fontWeight: 500 }}>
                {successMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border, #cbd5e1)',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  color: 'var(--text, #334155)'
                }}
              >
                Close
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1
                }}
              >
                {submitting ? 'Verifying...' : 'Activate Key'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
