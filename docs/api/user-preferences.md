# User preferences API

- Status: Design baseline. The endpoint is not deployed; the browser draft exercises this shape against an in-memory mock, and reloading the draft resets all state.
- Conventions: [`conventions.md`](conventions.md) applies to this endpoint and to every other.

## Decision

Locale is an owner-scoped server preference. The browser may use `en-GB` while the preference request is loading, but cookies, `localStorage`, IndexedDB, and service-worker caches are not sources of truth.

The initial allowlist is:

- `en-GB` — English
- `zh-CN` — Simplified Chinese

The authenticated session determines the owner. Requests never accept an owner or user identifier.

## Contract

Wire JSON uses `camelCase`, matching the contract that ADR 0008 makes the source of truth. The Rust handler carries the serde attributes needed to produce it; no adapter layer sits in the browser.

### Read preferences

```http
GET /api/v1/preferences
Accept: application/json
```

```json
{
  "locale": "en-GB",
  "version": 1,
  "updatedAt": "2026-08-17T09:00:00Z"
}
```

If no record exists, the API returns the default preference with a version suitable for the first conditional update. It does not require a separate create route.

### Update preferences

```http
PATCH /api/v1/preferences
Content-Type: application/json
X-Csrf-Token: <per-session token>
```

```json
{
  "locale": "zh-CN",
  "expectedVersion": 1
}
```

The CSRF header is required on every mutation, alongside the session cookie and passing `Origin` and `Sec-Fetch-Site` checks. ADR 0002 gives the reasoning.

A successful response returns the complete updated resource with an incremented `version`. Unknown fields and locales outside the allowlist are rejected. A stale `expectedVersion` returns `409 Conflict`; clients reload the current preference before retrying.

Both responses use `Cache-Control: no-store`. Errors carry a code from the closed set in [`conventions.md`](conventions.md) — here `VALIDATION` for an unknown field or a locale outside the allowlist, and `CONFLICT` for a stale version — without returning internal storage details. The client maps the code to its message catalogue instead of displaying service-provided text.

## Storage

Store the resource in `FinanceData` with:

- `PK=USER#<verified Cognito sub>`
- `SK=PREFERENCES`

Updates use a conditional expression on `version`. The runtime derives the partition key from the verified session and writes the preference and its coarse audit event atomically where practical. Audit data records that preferences changed, but does not need to duplicate their full value.

The mock API mirrors the resource shape, allowlist, and optimistic-concurrency rules in memory. It deliberately accepts no owner field; production ownership and persistence begin at the authenticated API boundary.

## Evolution

Timezone and display currency may be added only when their product semantics are defined. Timezone must use an allowlisted IANA identifier. Display currency must remain separate from each transaction's stored ISO 4217 currency and must not imply conversion without an explicit exchange-rate design.

## Browser coverage

Playwright should verify that:

- the default English preference loads without browser storage;
- selecting Simplified Chinese updates navigation, headings, controls, dates, currency, and `html[lang]`;
- returning to English restores the English UI;
- the selected locale survives route changes through the API-backed application state;
- a stale preference version fails safely and does not partially change the UI;
- neither locale writes finance or preference data to browser persistent storage;
- desktop and mobile layouts have no overflow in either language;
- serious and critical accessibility scans pass in both languages.
