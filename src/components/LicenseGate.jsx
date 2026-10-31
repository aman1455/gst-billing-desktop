import React, { useState, useEffect } from 'react';
import { KeyRound, Copy, Check, ShieldAlert, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import { getLicenseStatus, activateLicense } from '../store';

export default function LicenseGate({ children }) {
  const [statusData, setStatusData] = useState({ checking: true, valid: false });
  const [keyInput, setKeyInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const checkStatus = () => {
    return getLicenseStatus()
      .then((data) => {
        setStatusData({ checking: false, ...data });
        return data;
      })
      .catch((err) => {
        setStatusData({
          checking: false,
          valid: false,
          status: 'ERROR',
          message: err.message || 'Unable to communicate with local license service.'
        });
      });
  };

  useEffect(() => {
    checkStatus();

    const handleLicenseReq = (e) => {
      if (e.detail?.licenseStatus) {
        setStatusData({ checking: false, ...e.detail.licenseStatus });
      } else {
        checkStatus();
      }
    };

    window.addEventListener('license-required', handleLicenseReq);
    return () => window.removeEventListener('license-required', handleLicenseReq);
  }, []);

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
      setStatusData({ checking: false, ...updated });
      setSuccessMsg(updated.message || 'License activated successfully! Launching app...');
      setKeyInput('');
    } catch (err) {
      setErrorMsg(err.message || 'Activation failed. Please check your key.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Initial Loading Screen
  if (statusData.checking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #f0f2f5)',
        color: 'var(--text-primary, #111827)'
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid rgba(37, 99, 235, 0.2)',
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1rem'
        }} />
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary, #6b7280)' }}>
          Checking license status...
        </p>
      </div>
    );
  }

  // 2. License is Valid (Lifetime or Active Demo Trial) -> Grant Full Access
  if (statusData.valid) {
    return children;
  }

  // 3. License is Invalid / Expired / Missing -> Hard Full-Screen Lock
  const hwid = statusData.hwid || 'Detecting...';
  const waText = encodeURIComponent(`Hello, I would like to activate E-Munim GST Billing Software.\nMy Machine ID is: ${hwid}`);
  const waUrl = `https://wa.me/?text=${waText}`;

  const isExpired = statusData.status === 'EXPIRED';
  const isMismatch = statusData.status === 'HWID_MISMATCH';
  const isTampered = statusData.status === 'TAMPERED';

  let bannerTone = {
    bg: '#eff6ff',
    border: '#bfdbfe',
    text: '#1e40af',
    title: 'Activation Required',
    desc: 'An active Demo or Permanent license is required to access E-Munim.'
  };

  if (isExpired) {
    bannerTone = {
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#991b1b',
      title: 'Demo Trial Expired',
      desc: 'Your trial period has expired. Please enter a license key to unlock your software.'
    };
  } else if (isMismatch) {
    bannerTone = {
      bg: '#fff1f2',
      border: '#fecdd3',
      text: '#9f1239',
      title: 'Hardware Mismatch',
      desc: 'This license belongs to another computer. Please activate a key registered to this Machine ID.'
    };
  } else if (isTampered) {
    bannerTone = {
      bg: '#fffbeb',
      border: '#fde68a',
      text: '#92400e',
      title: 'System Clock Tamper Warning',
      desc: statusData.message || 'System clock rollback detected. Please correct your system clock to proceed.'
    };
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'var(--bg-primary, #f0f2f5)',
      color: 'var(--text-primary, #111827)'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        background: 'var(--card-bg, #ffffff)',
        borderRadius: '16px',
        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.15)',
        border: '1px solid var(--border-color, #e2e8f0)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid var(--border-color, #e2e8f0)',
          background: 'var(--bg-secondary, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: '#2563eb',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <KeyRound size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              E-Munim GST Billing
            </h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #6b7280)' }}>
              Offline Machine-Locked Software Activation
            </p>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {/* Status Alert Banner */}
          <div style={{
            padding: '0.9rem 1rem',
            borderRadius: '10px',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            backgroundColor: bannerTone.bg,
            border: `1px solid ${bannerTone.border}`,
            color: bannerTone.text
          }}>
            {isExpired ? (
              <Clock size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            ) : isTampered || isMismatch ? (
              <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            ) : (
              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            )}
            <div style={{ fontSize: '0.86rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
                {bannerTone.title}
              </div>
              <div style={{ lineHeight: 1.45, opacity: 0.95 }}>
                {bannerTone.desc}
              </div>
            </div>
          </div>

          {/* Machine ID Display Box */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '0.45rem',
              color: 'var(--text-primary, #111827)'
            }}>
              Your Machine ID (Hardware Fingerprint):
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-tertiary, #f1f5f9)',
              padding: '0.55rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)'
            }}>
              <code style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '1px',
                flex: 1,
                fontFamily: 'monospace',
                color: 'var(--text-primary, #0f172a)'
              }}>
                {hwid}
              </code>
              <button
                type="button"
                onClick={handleCopyHwid}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: copied ? '#059669' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy ID'}
              </button>
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #6b7280)' }}>
              Send this ID to your administrator to generate your Demo or Permanent license key.
            </p>
          </div>

          {/* WhatsApp Direct Share Link */}
          <div style={{ marginBottom: '1.25rem' }}>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: '#16a34a',
                fontSize: '0.86rem',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <ExternalLink size={15} /> Share Machine ID on WhatsApp
            </a>
          </div>

          {/* Key Input Form */}
          <form onSubmit={handleActivate}>
            <label style={{
              display: 'block',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '0.45rem',
              color: 'var(--text-primary, #111827)'
            }}>
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
                padding: '0.65rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                resize: 'none',
                marginBottom: '0.75rem',
                background: 'var(--bg-secondary, #ffffff)',
                color: 'var(--text-primary, #0f172a)'
              }}
            />

            {errorMsg && (
              <div style={{
                color: 'var(--danger, #dc2626)',
                fontSize: '0.82rem',
                marginBottom: '0.75rem',
                fontWeight: 600
              }}>
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div style={{
                color: 'var(--success, #059669)',
                fontSize: '0.82rem',
                marginBottom: '0.75rem',
                fontWeight: 600
              }}>
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '0.65rem 1rem',
                borderRadius: '8px',
                fontSize: '0.92rem',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.75 : 1,
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
              }}
            >
              {submitting ? 'Verifying Key...' : 'Activate License'}
            </button>
          </form>

          {/* Privacy Note */}
          <div style={{
            marginTop: '1.25rem',
            textAlign: 'center',
            fontSize: '0.76rem',
            color: 'var(--text-muted, #9ca3af)'
          }}>
            100% Offline & Private &bull; All your data stays safely on your computer.
          </div>
        </div>
      </div>
    </div>
  );
}
