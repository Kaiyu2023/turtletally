# ADR 0002: Keep browser tokens behind a BFF session

- Status: Accepted
- Date: 2026-08-18

## Context

The browser needs Cognito authentication without exposing reusable access or refresh tokens to JavaScript or persistent browser storage. Mutations also need revocation, CSRF protection, and a single-owner authorization boundary.

## Decision

Use an authorization-code flow with S256 PKCE through a browser backend-for-frontend. The backend validates OAuth state, exchanges the code, and stores the encrypted refresh token in a server-side session record. The browser receives only an opaque, revocable `__Host-finance_session` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and no `Domain` attribute.

Hash session identifiers at rest. Require a per-session CSRF header plus `Origin` and `Sec-Fetch-Site` validation for mutations. Derive ownership from verified Cognito claims and keep all authentication and finance responses out of caches.

## Consequences

- Browser code never handles Cognito tokens, reducing the impact of script compromise.
- Server-side session storage, refresh, expiry, concurrency limits, and revocation become application responsibilities.
- Same-origin browser routing is required; cross-origin API access is not a supported browser architecture.
