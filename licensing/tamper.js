import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

const STATE_SALT = 'e-munim-tamper-guard-salt-2026';
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes grace for clock drift

export class TamperGuard {
  constructor(dataDir, hwid) {
    this.dataDir = dataDir;
    this.hwid = hwid;
    this.stateFile = path.join(dataDir, '.lic_state');
    this.secretKey = crypto.createHash('sha256').update(hwid + STATE_SALT).digest();
    this.lastNetworkTime = null;
    this.tampered = false;
    this.tamperReason = null;

    this.state = this.loadState();
    this.checkFilesystemMtime();
    this.startNetworkSync();
  }

  loadState() {
    try {
      if (!fs.existsSync(this.stateFile)) {
        const initial = {
          maxSeenTimestamp: Date.now(),
          lastHeartbeat: Date.now(),
          totalUptimeSec: 0
        };
        this.saveState(initial);
        return initial;
      }

      const raw = fs.readFileSync(this.stateFile, 'utf-8');
      const [hmac, dataStr] = raw.split('::');
      const expectedHmac = crypto.createHmac('sha256', this.secretKey).update(dataStr).digest('hex');

      if (hmac !== expectedHmac) {
        const licFile = path.join(this.dataDir, 'license.lic');
        if (!fs.existsSync(licFile)) {
          const initial = {
            maxSeenTimestamp: Date.now(),
            lastHeartbeat: Date.now(),
            totalUptimeSec: 0
          };
          this.saveState(initial);
          return initial;
        }

        this.tampered = true;
        this.tamperReason = 'License state file signature invalid or tampered.';
        return { maxSeenTimestamp: Date.now(), lastHeartbeat: Date.now(), totalUptimeSec: 0 };
      }

      const parsed = JSON.parse(dataStr);
      const now = Date.now();

      // Clock rollback detection
      if (now < parsed.maxSeenTimestamp - CLOCK_TOLERANCE_MS) {
        this.tampered = true;
        this.tamperReason = `Clock rollback detected! System clock (${new Date(now).toISOString()}) is earlier than last recorded run (${new Date(parsed.maxSeenTimestamp).toISOString()}).`;
      } else {
        parsed.maxSeenTimestamp = Math.max(parsed.maxSeenTimestamp, now);
        parsed.lastHeartbeat = now;
        this.saveState(parsed);
      }

      return parsed;
    } catch {
      this.tampered = true;
      this.tamperReason = 'Failed to read license state file.';
      return { maxSeenTimestamp: Date.now(), lastHeartbeat: Date.now(), totalUptimeSec: 0 };
    }
  }

  saveState(state) {
    try {
      const dataStr = JSON.stringify(state);
      const hmac = crypto.createHmac('sha256', this.secretKey).update(dataStr).digest('hex');
      fs.writeFileSync(this.stateFile, `${hmac}::${dataStr}`, 'utf-8');
    } catch {
      // Ignore write errors
    }
  }

  recordHeartbeat(deltaSec = 60) {
    const now = Date.now();
    if (now < this.state.maxSeenTimestamp - CLOCK_TOLERANCE_MS) {
      this.tampered = true;
      this.tamperReason = 'Clock rollback detected during operation.';
      return;
    }

    this.state.maxSeenTimestamp = Math.max(this.state.maxSeenTimestamp, now);
    this.state.lastHeartbeat = now;
    this.state.totalUptimeSec = (this.state.totalUptimeSec || 0) + deltaSec;
    this.saveState(this.state);
  }

  /**
   * Scans recently modified files in data directory.
   * If any file's mtime is in the future compared to current system clock,
   * clock rollback occurred.
   */
  checkFilesystemMtime() {
    try {
      if (!fs.existsSync(this.dataDir)) return;
      const now = Date.now();
      const files = fs.readdirSync(this.dataDir, { withFileTypes: true });

      for (const f of files) {
        if (f.name === '.lic_state') continue;
        const fullPath = path.join(this.dataDir, f.name);
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > now + CLOCK_TOLERANCE_MS) {
          this.tampered = true;
          this.tamperReason = `Filesystem date inconsistency detected. File ${f.name} was modified in future: ${stat.mtime.toISOString()}`;
          break;
        }
      }
    } catch {
      // Ignore FS scan errors
    }
  }

  /**
   * Opportunistically queries trusted HTTPS server headers to check network time.
   * Non-blocking and silent on failure (e.g. offline).
   */
  startNetworkSync() {
    const checkNetwork = () => {
      try {
        const req = https.request('https://www.google.com', { method: 'HEAD', timeout: 4000 }, (res) => {
          const dateHeader = res.headers.date;
          if (dateHeader) {
            const serverMs = new Date(dateHeader).getTime();
            const now = Date.now();
            this.lastNetworkTime = serverMs;

            // If system clock is off by more than 15 minutes compared to true network time
            if (Math.abs(serverMs - now) > 15 * 60 * 1000) {
              if (now < serverMs - 15 * 60 * 1000) {
                this.tampered = true;
                this.tamperReason = `System clock is significantly behind true internet time (${new Date(serverMs).toISOString()}).`;
              }
              // Advance maxSeenTimestamp if server time is ahead
              this.state.maxSeenTimestamp = Math.max(this.state.maxSeenTimestamp, serverMs);
              this.saveState(this.state);
            }
          }
        });
        req.on('error', () => { /* offline - ignore */ });
        req.end();
      } catch {
        // Offline
      }
    };

    // Run once after 5 seconds, then once every 30 minutes
    const t1 = setTimeout(checkNetwork, 5000);
    if (t1.unref) t1.unref();
    const t2 = setInterval(checkNetwork, 30 * 60 * 1000);
    if (t2.unref) t2.unref();
  }

  resetState() {
    this.tampered = false;
    this.tamperReason = null;
    const initial = {
      maxSeenTimestamp: Date.now(),
      lastHeartbeat: Date.now(),
      totalUptimeSec: 0
    };
    this.state = initial;
    this.saveState(initial);
    return initial;
  }

  isTampered() {
    return {
      tampered: this.tampered,
      reason: this.tamperReason
    };
  }

  getEffectiveCurrentTime() {
    // Return max of system time, max recorded time, or network time
    return Math.max(Date.now(), this.state.maxSeenTimestamp, this.lastNetworkTime || 0);
  }
}
