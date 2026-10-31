import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { getHardwareId } from '../licensing/hwid.js';
import { LicenseManager } from '../licensing/licenseManager.js';

console.log('[*] Running Licensing & Anti-Tamper Tests...\n');

// 1. HWID format test
const hwid = getHardwareId();
console.log('  Testing HWID Generation:', hwid);
assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(hwid), 'HWID must be 16 chars hyphen-separated');
console.log('  ✓ HWID format verified.');

// Setup temporary test directory
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-unit-test-'));

try {
  const lm = new LicenseManager(testDataDir);

  // 2. Initial Unlicensed State
  const initial = lm.getStatus();
  assert.strictEqual(initial.status, 'UNLICENSED');
  assert.strictEqual(initial.valid, false);
  console.log('  ✓ Unlicensed state verified.');

  // 3. Generate and activate 7-day demo key
  const genOutput = execSync(`node scripts/license-tool.mjs generate --hwid ${hwid} --days 7 --name "Test User"`).toString();
  const keyMatch = genOutput.match(/EMUNIM-LIC-[A-Za-z0-9+/=]+/);
  assert(keyMatch, 'Key must be output by CLI');
  const demoKey = keyMatch[0];

  const actResult = lm.activate(demoKey);
  assert.strictEqual(actResult.status, 'TRIAL');
  assert.strictEqual(actResult.valid, true);
  assert.strictEqual(actResult.daysLeft, 7);
  console.log('  ✓ 7-day Demo Key generated and activated.');

  // 4. HWID Mismatch test (try to use key on different machine)
  const otherHwid = '9999-8888-7777-6666';
  const otherGenOutput = execSync(`node scripts/license-tool.mjs generate --hwid ${otherHwid} --days 7`).toString();
  const otherKey = otherGenOutput.match(/EMUNIM-LIC-[A-Za-z0-9+/=]+/)[0];

  let threwMismatch = false;
  try {
    lm.activate(otherKey);
  } catch (err) {
    threwMismatch = true;
    assert(err.message.includes('different computer'), 'Must reject other computer HWID');
  }
  assert(threwMismatch, 'Must reject key generated for another HWID');
  console.log('  ✓ Cross-computer copying blocked (HWID mismatch verified).');

  // 5. Digital signature forgery test
  let tamperedKey = demoKey.slice(0, -4) + 'AAAA';
  let threwForgery = false;
  try {
    lm.activate(tamperedKey);
  } catch {
    threwForgery = true;
  }
  assert(threwForgery, 'Must reject altered signature');
  console.log('  ✓ Tampered key forgery blocked (Signature check verified).');

  // 6. Generate and activate Lifetime key
  const lifetimeOutput = execSync(`node scripts/license-tool.mjs generate --hwid ${hwid} --type lifetime --name "VIP Client"`).toString();
  const lifetimeKey = lifetimeOutput.match(/EMUNIM-LIC-[A-Za-z0-9+/=]+/)[0];

  const lifeResult = lm.activate(lifetimeKey);
  assert.strictEqual(lifeResult.status, 'ACTIVE');
  assert.strictEqual(lifeResult.valid, true);
  assert.strictEqual(lifeResult.type, 'LIFETIME');
  assert.strictEqual(lifeResult.customerName, 'VIP Client');
  console.log('  ✓ Lifetime permanent key activation verified.');

  // 7. Clock Rollback Simulation
  const stateFile = path.join(testDataDir, '.lic_state');
  assert(fs.existsSync(stateFile), '.lic_state must exist');

  // Simulate user turning clock backward by writing future maxSeenTimestamp
  const rawState = fs.readFileSync(stateFile, 'utf-8');
  const [hmac, dataStr] = rawState.split('::');
  const stateObj = JSON.parse(dataStr);
  // Advance state by 30 days into the future
  stateObj.maxSeenTimestamp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  lm.tamperGuard.saveState(stateObj);

  // Reload state in TamperGuard to simulate app restart after user rolled clock back
  const reloaded = lm.tamperGuard.loadState();
  const tamperStatus = lm.tamperGuard.isTampered();
  assert(tamperStatus.tampered, 'Clock rollback must be detected');
  assert(lm.getStatus().status === 'TAMPERED', 'Status must be TAMPERED when clock is rolled back');
  console.log('  ✓ Clock rollback tampering successfully detected and blocked.');

  console.log('\nAll Licensing & Anti-Tamper Tests Passed! (7/7)\n');
} finally {
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
