// scripts/remote-state-adversarial-test.mjs
// Adversarial test suite for D:\Self\license genrator\data\remote-state.json
// Challenger: teamwork_challenger_1

import fs from 'fs';
import path from 'path';

const REMOTE_STATE_PATH = 'D:/Self/license genrator/data/remote-state.json';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message, details = '') {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    const err = `  [FAIL] ${message}${details ? ' -> ' + JSON.stringify(details) : ''}`;
    console.error(err);
    failures.push(err);
  }
}

function parseDateOnly(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
}

function resolveHsnRule(rules, queryDateInput) {
  if (!Array.isArray(rules) || !queryDateInput) return null;
  const qDate = parseDateOnly(queryDateInput);
  if (!qDate || isNaN(qDate.getTime())) return null;

  const matches = rules.filter(r => {
    const from = r.effectiveFrom ? parseDateOnly(r.effectiveFrom) : null;
    const to = r.effectiveTo ? parseDateOnly(r.effectiveTo) : null;
    if (from && qDate < from) return false;
    if (to && qDate > to) return false;
    return true;
  });

  return matches;
}

console.log('================================================================');
console.log('  ADVERSARIAL VERIFICATION: REMOTE STATE CONFIGURATION');
console.log('  Target:', REMOTE_STATE_PATH);
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test Suite 1: File Existence, Byte Health & Strict JSON Syntax
// -----------------------------------------------------------------------------
console.log('--- Suite 1: JSON Syntax & Byte-Level Integrity ---');
assert(fs.existsSync(REMOTE_STATE_PATH), 'File remote-state.json must exist');

let rawContent = '';
let data = null;
try {
  rawContent = fs.readFileSync(REMOTE_STATE_PATH, 'utf8');
  assert(rawContent.length > 0, 'File content must not be empty', { bytes: rawContent.length });
  // Check for Byte Order Mark (BOM)
  assert(rawContent.charCodeAt(0) !== 0xfeff, 'File must not start with UTF-8 BOM');
  data = JSON.parse(rawContent);
  assert(typeof data === 'object' && data !== null, 'JSON.parse must yield non-null object');
} catch (err) {
  assert(false, 'File read & JSON parse must not throw', err.message);
}

// Roundtrip stringification
try {
  const serialized = JSON.stringify(data);
  const reParsed = JSON.parse(serialized);
  assert(JSON.stringify(reParsed) === serialized, 'JSON serialization must be idempotent and deterministic');
} catch (err) {
  assert(false, 'JSON roundtrip serialization must succeed', err.message);
}

// Prototype pollution check
assert(!('__proto__' in (data || {}) && data.__proto__ !== Object.prototype), 'Must not suffer prototype pollution');

// Root properties validation per interface contract
assert(typeof data?.version === 'string' && data.version.length > 0, 'root.version must be non-empty string');
assert(typeof data?.minAppVersion === 'string' && /^\d+\.\d+\.\d+/.test(data.minAppVersion), 'root.minAppVersion must follow semver');
assert(data?.activeFinancialYear === '2026-27', 'root.activeFinancialYear must be exactly "2026-27"');
assert(data?.assessmentYear === '2027-28', 'root.assessmentYear must be exactly "2027-28"');
assert(typeof data?.hsnDateOverrides === 'object' && data.hsnDateOverrides !== null, 'root.hsnDateOverrides must be an object');
assert(typeof data?.tdsTcsRules === 'object' && data.tdsTcsRules !== null, 'root.tdsTcsRules must be an object');
assert(Array.isArray(data?.banners), 'root.banners must be an array');
assert(Array.isArray(data?.notices) || Array.isArray(data?.complianceNotices), 'root must contain notices or complianceNotices array');

// -----------------------------------------------------------------------------
// Test Suite 2: Adversarial Temporal Rule Testing for HSN 9503, 4809, 3101
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: HSN Temporal Rule Integrity & Transition Dates ---');

const hsnTargets = ['9503', '4809', '3101'];
for (const code of hsnTargets) {
  const rules = data?.hsnDateOverrides?.[code];
  assert(Array.isArray(rules), `HSN ${code} override must exist as an array of rules`);
  assert(rules?.length >= 2, `HSN ${code} override must contain at least 2 temporal rules (historical + current)`);

  if (!Array.isArray(rules) || rules.length < 2) continue;

  const [historical, current] = rules;

  // Schema check on rules
  assert(typeof historical.effectiveFrom === 'string', `HSN ${code} historical rule must have effectiveFrom`);
  assert(typeof historical.effectiveTo === 'string', `HSN ${code} historical rule must have effectiveTo`);
  assert(typeof current.effectiveFrom === 'string', `HSN ${code} current rule must have effectiveFrom`);
  assert(current.effectiveTo === null, `HSN ${code} current rule must have effectiveTo: null (open-ended)`);

  const histFrom = parseDateOnly(historical.effectiveFrom);
  const histTo = parseDateOnly(historical.effectiveTo);
  const currFrom = parseDateOnly(current.effectiveFrom);

  assert(histFrom <= histTo, `HSN ${code} historical rule effectiveFrom (${historical.effectiveFrom}) <= effectiveTo (${historical.effectiveTo})`);
  assert(histTo < currFrom, `HSN ${code} historical rule effectiveTo must be strictly before current rule effectiveFrom`);

  // Disjointness: Check that histTo and currFrom are exact consecutive calendar days (no gap, no overlap)
  const dayAfterHistTo = new Date(histTo.getTime() + 24 * 60 * 60 * 1000);
  assert(
    dayAfterHistTo.toISOString().slice(0, 10) === currFrom.toISOString().slice(0, 10),
    `HSN ${code} temporal boundary has ZERO day gap/overlap (day after ${historical.effectiveTo} === ${current.effectiveFrom})`
  );
}

// Detailed transition assertions for each HSN
console.log('\n  -> Testing HSN 9503 (Toys & Models):');
{
  const rules9503 = data?.hsnDateOverrides?.['9503'];
  // Historical: 2017-07-01 to 2025-09-21 -> [12, 18]
  // Current: 2025-09-22 onwards -> [5, 18]
  const qHist = resolveHsnRule(rules9503, '2025-09-21');
  assert(qHist?.length === 1, 'HSN 9503 on 2025-09-21 resolves to exactly 1 rule');
  assert(JSON.stringify(qHist?.[0]?.rates) === JSON.stringify([12, 18]), 'HSN 9503 on 2025-09-21 returns historical rates [12, 18]');

  const qCurr = resolveHsnRule(rules9503, '2025-09-22');
  assert(qCurr?.length === 1, 'HSN 9503 on 2025-09-22 resolves to exactly 1 rule');
  assert(JSON.stringify(qCurr?.[0]?.rates) === JSON.stringify([5, 18]), 'HSN 9503 on 2025-09-22 returns current rates [5, 18]');

  const qFuture = resolveHsnRule(rules9503, '2026-10-31');
  assert(JSON.stringify(qFuture?.[0]?.rates) === JSON.stringify([5, 18]), 'HSN 9503 on FY 2026-27 date returns rates [5, 18]');

  assert(qCurr?.[0]?.authority?.includes('Circular 265/11/2026-GST') || qCurr?.[0]?.reference?.includes('Circular 265/11/2026-GST'),
    'HSN 9503 references Circular 265/11/2026-GST');
}

console.log('\n  -> Testing HSN 4809 (Sublimation & Transfer Paper):');
{
  const rules4809 = data?.hsnDateOverrides?.['4809'];
  // Historical: 2017-07-01 to 2026-10-27 -> [12, 18] / rate: 12
  // Current: 2026-10-28 onwards -> [18] / rate: 18
  const qHist = resolveHsnRule(rules4809, '2026-10-27');
  assert(qHist?.length === 1, 'HSN 4809 on 2026-10-27 resolves to exactly 1 rule');
  assert(qHist?.[0]?.rates?.includes(12), 'HSN 4809 historical includes 12%');

  const qCurr = resolveHsnRule(rules4809, '2026-10-28');
  assert(qCurr?.length === 1, 'HSN 4809 on 2026-10-28 resolves to exactly 1 rule');
  assert(JSON.stringify(qCurr?.[0]?.rates) === JSON.stringify([18]), 'HSN 4809 on 2026-10-28 returns confirmed 18% rate');
  assert(qCurr?.[0]?.rate === 18, 'HSN 4809 current single rate === 18');

  const qFY27 = resolveHsnRule(rules4809, '2027-01-15');
  assert(JSON.stringify(qFY27?.[0]?.rates) === JSON.stringify([18]), 'HSN 4809 in 2027 returns confirmed 18% rate');
}

console.log('\n  -> Testing HSN 3101 (Bio-stimulants & Organic Fertilizers):');
{
  const rules3101 = data?.hsnDateOverrides?.['3101'];
  // Historical: 2017-07-01 to 2026-10-27 -> [5, 18]
  // Current: 2026-10-28 onwards -> [5] / rate: 5
  const qHist = resolveHsnRule(rules3101, '2026-10-27');
  assert(qHist?.length === 1, 'HSN 3101 on 2026-10-27 resolves to exactly 1 rule');
  assert(qHist?.[0]?.rates?.includes(18), 'HSN 3101 historical reflects disputed 18% slab');

  const qCurr = resolveHsnRule(rules3101, '2026-10-28');
  assert(qCurr?.length === 1, 'HSN 3101 on 2026-10-28 resolves to exactly 1 rule');
  assert(JSON.stringify(qCurr?.[0]?.rates) === JSON.stringify([5]), 'HSN 3101 on 2026-10-28 returns confirmed 5% rate');
  assert(qCurr?.[0]?.rate === 5, 'HSN 3101 current single rate === 5');

  const qFY27 = resolveHsnRule(rules3101, '2027-02-20');
  assert(JSON.stringify(qFY27?.[0]?.rates) === JSON.stringify([5]), 'HSN 3101 in 2027 returns 5% rate');
  const condText = `${qCurr?.[0]?.classificationCondition || ''} ${qCurr?.[0]?.description || ''} ${qCurr?.[0]?.label || ''}`;
  assert(/Fertili[sz]er Control Order|FCO/i.test(condText),
    'HSN 3101 specifies FCO 1985 Schedule VI registration condition');
}

// Fuzzing & boundary queries
console.log('\n  -> Running 3,000 randomized temporal queries & edge cases:');
{
  let fuzzFailures = 0;
  const startTs = new Date('2017-07-01T00:00:00Z').getTime();
  const endTs = new Date('2030-12-31T00:00:00Z').getTime();

  for (let i = 0; i < 3000; i++) {
    const randomTs = startTs + Math.random() * (endTs - startTs);
    const dateStr = new Date(randomTs).toISOString().slice(0, 10);
    for (const code of hsnTargets) {
      const res = resolveHsnRule(data.hsnDateOverrides[code], dateStr);
      if (!res || res.length !== 1) {
        fuzzFailures++;
      }
    }
  }
  assert(fuzzFailures === 0, 'All 3,000 random dates in 2017-2030 resolve to EXACTLY ONE rule without collision', { fuzzFailures });

  // Leap year test (2028-02-29)
  const leapRes9503 = resolveHsnRule(data.hsnDateOverrides['9503'], '2028-02-29');
  assert(leapRes9503?.length === 1 && JSON.stringify(leapRes9503[0].rates) === JSON.stringify([5, 18]), 'Leap year 2028-02-29 resolves correctly for 9503');

  const leapRes4809 = resolveHsnRule(data.hsnDateOverrides['4809'], '2028-02-29');
  assert(leapRes4809?.length === 1 && JSON.stringify(leapRes4809[0].rates) === JSON.stringify([18]), 'Leap year 2028-02-29 resolves correctly for 4809');

  const leapRes3101 = resolveHsnRule(data.hsnDateOverrides['3101'], '2028-02-29');
  assert(leapRes3101?.length === 1 && JSON.stringify(leapRes3101[0].rates) === JSON.stringify([5]), 'Leap year 2028-02-29 resolves correctly for 3101');

  // Adversarial edge inputs: invalid dates, null, undefined, extreme dates
  assert(resolveHsnRule(data.hsnDateOverrides['9503'], '1990-01-01')?.length === 0, 'Pre-GST date 1990-01-01 returns empty match (out of range)');
  assert(resolveHsnRule(data.hsnDateOverrides['9503'], null) === null, 'null date safely returns null without crash');
  assert(resolveHsnRule(data.hsnDateOverrides['9503'], undefined) === null, 'undefined date safely returns null without crash');
  assert(resolveHsnRule(data.hsnDateOverrides['9503'], 'not-a-date') === null, 'Malformed date string safely returns null without crash');
  assert(resolveHsnRule(undefined, '2026-10-31') === null, 'Undefined rules array safely returns null without crash');
}

// -----------------------------------------------------------------------------
// Test Suite 3: Section 206C(1H) TCS Abolition Logic
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Section 206C(1H) Abolition Logic ---');

const rule206 = data?.tdsTcsRules?.['206C(1H)'];
assert(Boolean(rule206), 'Section 206C(1H) rule entry must exist');
assert(rule206?.status === 'abolished', 'Section 206C(1H) status must be "abolished"');
assert(rule206?.uiSelectable === false, 'Section 206C(1H) uiSelectable must be explicitly false');
assert(rule206?.effectiveTo === '2025-03-31', 'Section 206C(1H) effectiveTo must be "2025-03-31"');
assert(rule206?.abolitionEffectiveDate === '2025-04-01', 'Section 206C(1H) abolitionEffectiveDate must be "2025-04-01"');
assert(rule206?.legalBasis?.includes('Finance Act 2025'), 'Section 206C(1H) cites Finance Act 2025');

// Section 194Q counter-check
const rule194Q = data?.tdsTcsRules?.['194Q'];
assert(Boolean(rule194Q), 'Section 194Q rule entry must exist');
assert(rule194Q?.status === 'active', 'Section 194Q status must be "active"');
assert(rule194Q?.uiSelectable === true, 'Section 194Q uiSelectable must be true');

// Advisory Banner validation
console.log('\n--- Suite 4: Advisory Banner Validation ---');
const banner = data?.banners?.find(b => b.id === 'banner-tcs-206c-1h-abolition' || b.section === '206C(1H)');
assert(Boolean(banner), 'Advisory banner for Section 206C(1H) abolition must exist in banners array');
assert(banner?.type === 'warning', 'Banner type must be "warning"');
assert(typeof banner?.title === 'string' && banner.title.length > 0, 'Banner title must be non-empty string');
assert(typeof banner?.message === 'string' && banner.message.length > 0, 'Banner message must be non-empty string');
assert(banner?.message?.includes('1 April 2025'), 'Banner message must specify abolition effective date "1 April 2025"');
assert(banner?.message?.includes('Finance Act 2025'), 'Banner message must cite Finance Act 2025');
assert(banner?.message?.includes('194Q'), 'Banner message must refer to Section 194Q TDS');

// Check embedded banner in tdsTcsRules
assert(Boolean(rule206?.advisoryBanner), 'Advisory banner must also be linked directly in tdsTcsRules["206C(1H)"]');
assert(rule206?.advisoryBanner?.message?.includes('1 April 2025'), 'Embedded advisory banner mentions 1 April 2025');

// -----------------------------------------------------------------------------
// Test Suite 5: Compliance Notices Validation
// -----------------------------------------------------------------------------
console.log('\n--- Suite 5: Compliance Notices (ITC Refund & RCM for FY 2026-27) ---');

const allNotices = [...(data?.notices || []), ...(data?.complianceNotices || [])];

// 1. ITC Refund Notice
const itcNotice = allNotices.find(n => n.category === 'itc_refund' && (n.financialYear === '2026-27' || n.fy === '2026-27'));
assert(Boolean(itcNotice), 'ITC refund compliance notice for FY 2026-27 must be present');
assert(typeof itcNotice?.title === 'string' && itcNotice.title.length > 0, 'ITC refund notice has non-empty title');
assert(typeof itcNotice?.summary === 'string' || typeof itcNotice?.content === 'string', 'ITC refund notice has non-empty summary/content');

const itcText = `${itcNotice?.title || ''} ${itcNotice?.summary || ''} ${itcNotice?.content || ''}`;
assert(/inverted duty structure/i.test(itcText), 'ITC notice mentions inverted duty structure');
assert(/input services/i.test(itcText), 'ITC notice mentions input services refund');
assert(/10 days|automated/i.test(itcText), 'ITC notice mentions automated cash ledger / 10-day timeline');

// 2. RCM Compliance Notice
const rcmNotice = allNotices.find(n => n.category === 'rcm_compliance' && (n.financialYear === '2026-27' || n.fy === '2026-27'));
assert(Boolean(rcmNotice), 'RCM compliance notice for FY 2026-27 must be present');
assert(typeof rcmNotice?.title === 'string' && rcmNotice.title.length > 0, 'RCM notice has non-empty title');
assert(typeof rcmNotice?.summary === 'string' || typeof rcmNotice?.content === 'string', 'RCM notice has non-empty summary/content');

const rcmText = `${rcmNotice?.title || ''} ${rcmNotice?.summary || ''} ${rcmNotice?.content || ''}`;
assert(/Reverse Charge|RCM/i.test(rcmText), 'RCM notice mentions Reverse Charge Mechanism');
assert(/scrap|waste|electronic statement/i.test(rcmText), 'RCM notice mentions scrap/waste expansion or electronic statement reconciliation');

// -----------------------------------------------------------------------------
// Final Verdict
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`RESULTS: Passed: ${passed} | Failed: ${failed}`);
if (failed === 0) {
  console.log('VERDICT: APPROVE');
} else {
  console.error('VERDICT: REJECT');
  console.error('Failures:', failures);
}
console.log('================================================================');

process.exit(failed > 0 ? 1 : 0);
