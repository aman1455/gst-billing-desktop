import crypto from 'crypto';
import os from 'os';
import process from 'process';
import { execSync } from 'child_process';

let cachedHwid = null;

const HWID_SALT = 'e-munim-hwid-salt-v1-secure-2026';

function runCommandSafe(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim();
  } catch {
    return '';
  }
}

/**
 * Collects stable machine identifiers from the underlying OS.
 */
function getSystemFingerprints() {
  const parts = [];
  const platform = process.platform;

  if (platform === 'win32') {
    // 1. Windows MachineGuid from Registry
    const guid = runCommandSafe('powershell -NoProfile -Command "(Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Cryptography).MachineGuid"');
    if (guid) parts.push(`guid:${guid}`);

    // 2. Motherboard UUID
    const uuid = runCommandSafe('powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"');
    if (uuid && uuid !== 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF') parts.push(`uuid:${uuid}`);

    // 3. CPU ProcessorId
    const cpuId = runCommandSafe('powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).ProcessorId"');
    if (cpuId) parts.push(`cpu:${cpuId}`);
  } else if (platform === 'darwin') {
    const ioreg = runCommandSafe("ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3; }'");
    if (ioreg) parts.push(`ioreg:${ioreg}`);
  } else if (platform === 'linux') {
    const machineId = runCommandSafe('cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null');
    if (machineId) parts.push(`mid:${machineId}`);
  }

  // Fallback: network interfaces MAC addresses
  try {
    const interfaces = os.networkInterfaces();
    const macs = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          macs.push(iface.mac.toLowerCase());
        }
      }
    }
    if (macs.length > 0) {
      parts.push(`macs:${macs.sort().join(',')}`);
    }
  } catch {
    // Ignore interface errors
  }

  // CPU Model + Architecture
  try {
    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      parts.push(`cpu_model:${cpus[0].model}:${cpus.length}`);
    }
  } catch {
    // Ignore os errors
  }

  return parts.join('|');
}

/**
 * Returns formatted 16-character Hardware ID: XXXX-XXXX-XXXX-XXXX
 */
export function getHardwareId() {
  if (cachedHwid) return cachedHwid;

  const raw = getSystemFingerprints();
  const hash = crypto.createHash('sha256').update(raw + HWID_SALT).digest('hex').toUpperCase();

  // Take first 16 chars and group into 4-char chunks: ABCD-1234-EF56-7890
  const chunk1 = hash.substring(0, 4);
  const chunk2 = hash.substring(4, 8);
  const chunk3 = hash.substring(8, 12);
  const chunk4 = hash.substring(12, 16);

  cachedHwid = `${chunk1}-${chunk2}-${chunk3}-${chunk4}`;
  return cachedHwid;
}
