# SECURITY-TODO

White-box security audit of the NAHJ applet. Branch: `claude/security-audit-comprehensive-ao2ap1`.

---

## Status update (post-audit) — items A & B are now RESOLVED

The two HIGH findings originally "intentionally left" have since been implemented
in the codebase. This section records their current state so the audit reflects
reality:

- **Item A — Authentication & authorization (RESOLVED).** `server/auth.ts` now
  ships a full auth layer: scrypt password hashing with a per-account salt,
  DB-backed sessions (hashed session tokens in `sessions`), an HttpOnly +
  `SameSite=Strict` session cookie, a double-submit CSRF token required on every
  mutating request, failed-login lockout (`MAX_FAILED_LOGINS` / `LOCKOUT_MINUTES`),
  timing-safe verification with a decoy scrypt on unknown emails, a `requireAuth`
  gate and a `requireRole` role guard mounted on the `/api` router, atomic
  first-run setup, a "cannot remove the last active admin" guard, and admin
  password reset / self-service change-password. `POST /switch-role` as an
  unauthenticated identity switch is gone; identity now derives from the verified
  session. The demo path is isolated in its own in-memory sandbox
  (`AsyncLocalStorage`) that can never reach the institution's real store or
  Firestore.
- **Item B — Firestore rules (RESOLVED).** `firestore.rules` now denies all client
  access (`allow read, write: if false`). The only legitimate access is the server
  via the Admin SDK (which bypasses rules by design). The former global
  `allow read, write: if true` wildcard is removed.

Item C (Firestore status error passthrough) and item D (payment/notification code,
deliberately untouched) remain as documented below. Everything under **Fixed** and
**Non-findings** still holds.

Note on scope: the Node/Express backend (`server/`) is a demonstration/prototype
using an in-memory datastore (`server/db.ts`) and mocked connectors
(`server/engine/connectors.ts`) that perform no real network egress. As a result,
several classic vectors (SSRF, command/NoSQL injection, path traversal, `eval`,
prototype pollution, unsafe deserialization, ReDoS) were checked for and are **not
present** in exploitable form. XSS was checked in `src/` — no
`dangerouslySetInnerHTML`/`innerHTML` sinks with user data.

---

## Fixed (applied on this branch)

### 1. Missing HTTP security headers — `server.ts` (LOW/MEDIUM)
The Express app set no security response headers.
Added a minimal, non-breaking middleware before route mounting:
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage.
- `X-Permitted-Cross-Domain-Policies: none`.

Intentionally conservative: **no** `Content-Security-Policy` or `X-Frame-Options`
were added, because the app is served as an AI Studio applet (iframe-embedded) and
uses Vite HMR in dev; a strict CSP/frame policy could break the live flow
(guardrail 6). These are recommended as a follow-up once the embedding/CSP needs
are confirmed.

### 2. Framework fingerprinting / info disclosure — `server.ts` (LOW)
`X-Powered-By: Express` was being advertised on every response.
Added `app.disable("x-powered-by")`.

### 3. Unbounded JSON body — `server.ts` (LOW)
`express.json()` was mounted without a size limit. Added `{ limit: "1mb" }` to
mitigate trivial memory-exhaustion payloads. 1mb is well above any legitimate
request body this API accepts, so no live flow is affected.

---

## Intentionally left / documented (not changed — see guardrails)

### A. No authentication or authorization on any API endpoint — `server/routes.ts` (HIGH)
Every endpoint under `/api` is unauthenticated, including state-mutating and
sensitive operations:
- `POST /api/switch-role` (arbitrary role/identity switch — see `db.setCurrentUser`)
- `POST /api/skills/:id/promote`, `/rollback`, `/killswitch`
- `POST /api/approvals/:id/decide` (approves & triggers execution)
- `POST /api/firebase/sync`
- `POST /api/mcp/servers`, `DELETE /api/mcp/servers/:id`, `POST /api/mcp/tools/call`

**Why left:** the application ships no authentication layer or session/identity
model at all — identity is a client-driven "current user" switch by design. Adding
auth middleware would break the entire live demo flow (guardrail 5/6). This is the
single most significant finding for a production deployment.
**Recommended fix:** introduce an auth gate (e.g. Firebase Auth ID-token
verification via `firebase-admin`) as Express middleware on the `/api` router,
deriving the acting user from the verified token instead of `POST /switch-role`,
and enforce role checks on the sensitive mutations above.

### B. `firestore.rules` fully public — `firestore.rules` (HIGH)
```
match /{document=**} { allow read, write: if true; }
```
This grants unauthenticated read/write to the **entire** database.
**Why left:** the file contains only a single global `{document=**}` wildcard.
Per guardrail 3, `orders`, `invoices`, and `pushTokens` must not be touched, and
because the single wildcard is the only match, it cannot be tightened without
affecting those collections. There is no provably-safe partial hardening.
**Recommended fix:** replace the global wildcard with per-collection `match`
blocks gated on `request.auth != null` (and appropriate ownership/role checks),
explicitly preserving whatever the payments/notifications flows require for
`orders`, `invoices`, and `pushTokens`.

### C. Firestore status error passthrough — `server/firebase.ts` / `GET /api/firebase/status` (LOW)
`getFirebaseStatus()` returns the raw `connectionError` message to any
unauthenticated caller. Low severity (message text only, no data). Left to avoid
altering status-reporting behavior; redact to a generic string once endpoint auth
(item A) exists.

### D. Payment & notification logic — NOT AUDITED / NOT TOUCHED (per guardrails 1 & 2)
Payment-related code (K-Net/invoice/`paymentUrl` generation in
`server/engine/connectors.ts` `createApplicationRecord`, `knet_create_invoice`
in `server/engine/mcpEngine.ts`, approval-execution writes) and any
notification/push logic were deliberately left untouched.

---

## Non-findings (verified safe)
- Firebase Web `apiKey` (`AIza...`) in `server/firebase.ts` / config JSON — **public
  by design**, not a secret (guardrail 4).
- No `eval` / `new Function` / `child_process` / dynamic `require` on user input.
- Insecure randomness (`Math.random`) is used only for **display IDs / mock
  references** (application codes, reservation refs, latency jitter), never for
  security tokens — no fix required.
- No `dangerouslySetInnerHTML` / `innerHTML` sinks in `src/`.
- CORS: no CORS middleware configured (no wildcard-plus-credentials misconfig).
