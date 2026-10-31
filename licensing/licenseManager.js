import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { getHardwareId } from './hwid.js';
import { PUBLIC_KEY_PEM } from './publicKey.js';
import { TamperGuard } from './tamper.js';

export class LicenseManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.hwid = getHardwareId();
    this.licenseFile = path.join(dataDir, 'license.lic');
    this.tamperGuard = new TamperGuard(dataDir, this.hwid);

    // Heartbeat every 60 seconds to track monotonic time
    const timer = setInterval(() => {
      this.tamperGuard.recordHeartbeat(60);
    }, 60 * 1000);
    if (timer.unref) timer.unref();
  }

  getHWID() {
    return this.hwid;
  }

  parseAndVerifyRawKey(licenseKey) {
    if (!licenseKey || typeof licenseKey !== 'string') {
      throw new Error('License key must be a non-empty string.');
    }

    const cleanKey = licenseKey.trim();
    if (!cleanKey.startsWith('EMUNIM-LIC-')) {
      throw new Error('Invalid key format. License must start with EMUNIM-LIC-');
    }

    const rawBase64 = cleanKey.replace(/^EMUNIM-LIC-/, '').trim();
    let container;
    try {
      const jsonStr = Buffer.from(rawBase64, 'base64').toString('utf-8');
      container = JSON.parse(jsonStr);
    } catch {
      throw new Error('Corrupted license key encoding.');
    }

    if (!container.p || !container.s) {
      throw new Error('Malformed license payload structure.');
    }

    const payloadBuf = Buffer.from(JSON.stringify(container.p), 'utf-8');
    const sigBuf = Buffer.from(container.s, 'base64');

    const isValidSig = crypto.verify(null, payloadBuf, PUBLIC_KEY_PEM, sigBuf);
    if (!isValidSig) {
      throw new Error('Digital signature verification failed. Key is invalid or tampered.');
    }

    return container.p;
  }

  activate(licenseKey) {
    const payload = this.parseAndVerifyRawKey(licenseKey);

    // 1. Verify HWID
    if (payload.hwid.toUpperCase() !== this.hwid.toUpperCase()) {
      throw new Error(`License is registered to a different computer (Expected: ${this.hwid}, Key: ${payload.hwid}).`);
    }

    // 2. Verify Expiry if trial
    if (payload.type === 'TRIAL' && payload.expiresAt) {
      const expMs = new Date(payload.expiresAt).getTime();
      const currentMs = this.tamperGuard.getEffectiveCurrentTime();
      if (currentMs > expMs) {
        throw new Error('This trial license has already expired.');
      }
    }

    // 3. Save to license file
    fs.writeFileSync(this.licenseFile, licenseKey.trim(), 'utf-8');
    return this.getStatus();
  }

  getStatus() {
    const tamper = this.tamperGuard.isTampered();

    if (tamper.tampered) {
      return {
        status: 'TAMPERED',
        valid: false,
        hwid: this.hwid,
        tampered: true,
        message: tamper.reason || 'System clock rollback or tamper detected. Please correct your system clock.'
      };
    }

    if (!fs.existsSync(this.licenseFile)) {
      return {
        status: 'UNLICENSED',
        valid: false,
        hwid: this.hwid,
        type: null,
        message: 'No license installed. Please activate with a Demo or Permanent key.'
      };
    }

    try {
      const keyStr = fs.readFileSync(this.licenseFile, 'utf-8');
      const payload = this.parseAndVerifyRawKey(keyStr);

      // Check HWID binding
      if (payload.hwid.toUpperCase() !== this.hwid.toUpperCase()) {
        return {
          status: 'HWID_MISMATCH',
          valid: false,
          hwid: this.hwid,
          type: payload.type,
          message: `License belongs to another computer (${payload.hwid}). Please activate for this machine (${this.hwid}).`
        };
      }

      // Check Expiry
      if (payload.type === 'LIFETIME') {
        return {
          status: 'ACTIVE',
          valid: true,
          hwid: this.hwid,
          type: 'LIFETIME',
          customerName: payload.name || 'Valued Customer',
          issuedAt: payload.issuedAt,
          expiresAt: null,
          daysLeft: null,
          message: 'Lifetime permanent license active.'
        };
      }

      // Trial Expiry Check
      if (payload.type === 'TRIAL') {
        const expMs = new Date(payload.expiresAt).getTime();
        const currentMs = this.tamperGuard.getEffectiveCurrentTime();
        const diffMs = expMs - currentMs;

        if (diffMs <= 0) {
          return {
            status: 'EXPIRED',
            valid: false,
            hwid: this.hwid,
            type: 'TRIAL',
            customerName: payload.name || 'Valued Customer',
            issuedAt: payload.issuedAt,
            expiresAt: payload.expiresAt,
            daysLeft: 0,
            message: 'Your trial period has expired. Please purchase a full license to continue.'
          };
        }

        const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
        return {
          status: 'TRIAL',
          valid: true,
          hwid: this.hwid,
          type: 'TRIAL',
          customerName: payload.name || 'Valued Customer',
          issuedAt: payload.issuedAt,
          expiresAt: payload.expiresAt,
          daysLeft,
          message: `Trial active: ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining.`
        };
      }

      return {
        status: 'INVALID',
        valid: false,
        hwid: this.hwid,
        message: 'Unknown license type.'
      };
    } catch (err) {
      return {
        status: 'INVALID',
        valid: false,
        hwid: this.hwid,
        message: err.message || 'Invalid or corrupted license file.'
      };
    }
  }
}
