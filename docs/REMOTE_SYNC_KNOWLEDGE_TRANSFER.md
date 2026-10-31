# Knowledge Transfer: Central Remote Sync & Licensing Architecture

## 1. Project Background & Objective
We maintain two related applications:
1. **Desktop Billing App (Client):** `Free-GST-Billing-Software` (E-Munim) — an offline-first Node.js/Express + React desktop application for Indian GST invoices.
2. **License Generator & Control Hub (Server):** `license genrator` — hosted freely on Vercel (`api/generate.js`, `api/verify.js`, serverless functions).

### Goal:
Allow the software owner to update settings, revoke licenses, push new GST/tax rates, and broadcast announcements from the Vercel app, which automatically synchronize down to all active desktop client installations whenever they have internet access, without breaking offline billing capability.

---

## 2. Current Architecture & Tech Stack

### Client Repo: `Free-GST-Billing-Software`
- **Main Server:** `server.js` (Express on localhost port, e.g. 47412).
- **Licensing Engine:** `licensing/licenseManager.js`
  - Validates cryptographic RSA signatures on licenses offline via `licensing/publicKey.js`.
  - Machine binding via hardware fingerprinting (`licensing/hwid.js`).
  - Monotonic time tracking and clock-rollback detection via `licensing/tamper.js`.
  - Blocks modifying `/api` calls if license is invalid or unlicensed.
- **Tax & Statutory Logic:** Hardcoded in `src/utils/hsnRates.js`, `src/utils/tdsTcs.js`, `src/utils.js`.

### Server Repo: `license genrator` (Hosted on Vercel)
- **Deployment:** Vercel serverless Node.js functions.
- **Existing API:**
  - `api/generate.js` (Signs payload with RSA private key from env `LICENSE_PRIVATE_KEY`).
  - `api/verify.js` (Checks signature and expiry).
  - `api/_utils.js` (Cryptographic helpers, key resolution).
- **Constraint:** Vercel serverless functions are ephemeral and stateless. Local file writes do not persist across invocations.

---

## 3. Desired Architecture: Offline-First Hybrid Sync

```
[Vercel Server: license genrator]
     │
     ├── GET /api/config
     │     └── Returns: latest GST rates, HSN updates, notices, latest app version
     │
     └── POST /api/license/sync
           └── Receives: { hwid, licenseKey, appVersion }
           └── Returns: { status: 'ACTIVE' | 'REVOKED' | 'EXTENDED', expiresAt, configHash }
                     ▲
                     │ (Background fetch when internet is available)
                     │
[Desktop Client: Free-GST-Billing-Software]
     ├── If Online: Syncs with Vercel, saves cache locally in data/remote-config.json
     └── If Offline: Continues 100% offline using locally cached rules and offline RSA checks
```

---

## 4. Key Implementation Requirements

### Requirement A: Stateless Vercel Persistence
Since Vercel local files are ephemeral, use one of the following free options for persistent storage (choose the simplest):
- **Option 1 (Zero-cost, git-driven):** Store config (rates, announcements) in a versioned `config.json` inside the Vercel repo. Whenever updated and pushed, Vercel auto-deploys in 15 seconds.
- **Option 2 (Free cloud database):** Connect Upstash Redis (Vercel KV) or Supabase PostgreSQL (free tier) for dynamic license revocation lists, trial extensions, and remote lockouts.

### Requirement B: Vercel Server Endpoints (`license genrator`)
1. **`GET /api/config`**:
   - Returns `{ version, gstRates, hsnOverrides, tdsTcsRules, announcement: { active, message, type } }`.
2. **`POST /api/license/sync`**:
   - Validates client `{ hwid, licenseKey }`.
   - Checks if HWID or license key is on the revocation blacklist.
   - Returns updated expiry date, revocation status, or confirmation of validity.

### Requirement C: Desktop Client Integration (`Free-GST-Billing-Software`)
1. **Background Sync Worker (`licensing/syncWorker.js`):**
   - Non-blocking: Runs silently in the background on startup and every 6-12 hours.
   - Safe timeout: Fails silently if offline or if Vercel endpoint is unreachable.
   - Caches remote data into `data/remoteConfig.json`.
2. **License Revocation Enforcement (`licensing/licenseManager.js`):**
   - If server returns `REVOKED`, save a revoked flag locally in `data/` and lock the app.
3. **Dynamic Rule Consumption:**
   - Update tax utilities (`hsnRates.js`, `utils.js`) to first check `remoteConfig.json` for any rate overrides before falling back to built-in constants.

---

## 5. Security & Reliability Constraints

1. **Never Break Offline Mode:** Users working in offline warehouses or stores must never be locked out simply because there is no internet connection.
2. **Tamper Resistance:** Remote configuration and license status updates must be cryptographically signed or verified using HTTPS to prevent man-in-the-middle attacks.
3. **No Breaking API Changes:** Existing saved bills and calculation history must never be altered retroactively. Overrides only apply to new invoices.
