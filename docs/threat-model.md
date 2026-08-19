# Threat model

- Status: Design baseline; implementation evidence is still required
- Last reviewed: 2026-08-19
- Scope: Browser, authentication, MCP, uploads and imports, scheduler, AWS administration, and backup or recovery paths

This is a living design document. The repository currently contains a synthetic browser draft, not a production system. Review this model after each security boundary is implemented and before connecting live financial data.

## Security objectives

- Keep ledger data, budgets, schedules, preferences, statements, and receipts confidential and owner-scoped.
- Prevent unauthorised, ambiguous, stale, or duplicated mutations.
- Keep credentials, session material, recovery factors, encryption keys, and deployment access out of source control and logs.
- Preserve an attributable audit trail without copying sensitive payloads into it.
- Make destructive mistakes recoverable and keep the service available within explicit cost limits.

## Assets

- Financial records and derived summaries.
- Receipt and statement objects, filenames, mappings, and import previews.
- Cognito tokens, opaque browser sessions, CSRF secrets, MCP tokens, operation hashes, and recovery factors.
- Audit events, backups, object versions, and deployment manifests.
- KMS keys, application configuration, OAuth clients, mTLS trust material, DNS, and AWS roles.
- Terraform state and backups, saved binary or JSON plans, variable files, backend configuration, and outputs.
- Service availability and the owner's AWS spending limit.

## Actors

- The owner, using a browser, ChatGPT Work, and approved recovery procedures.
- Cognito, CloudFront, API Gateway, Lambda, DynamoDB, S3, KMS, EventBridge Scheduler, and supporting AWS services.
- The OpenAI-managed MCP client presenting a client certificate and delegated owner token.
- An AWS administrator using short-lived IAM Identity Center credentials.
- An unauthenticated internet attacker or a user holding stolen browser, OAuth, or AWS credentials.
- Compromised browser content, uploaded files, statement rows, dependencies, Terraform providers, build tooling, or conversational context.

## Entry points

- CloudFront routes for application assets, `/api/*`, and `/auth/*`.
- The OAuth login and callback flow through Cognito.
- MCP protected-resource discovery and the dedicated `/mcp` endpoint.
- Short-lived S3 upload and download requests for receipts and imports.
- EventBridge Scheduler invocations and asynchronous import work.
- Local deployment tooling, the Terraform state backend, provider registry, GitHub pull requests and workflows, and the AWS control plane.
- DynamoDB point-in-time restore, S3 object-version restore, credential recovery, and access-revocation procedures.

## Trust boundaries

| Boundary                            | Data crossing it                                                      | Required protection                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Owner device to CloudFront          | HTML, opaque session cookie, CSRF header, finance responses           | TLS, strict browser headers, secure cookies, no persistent finance storage, no caching                                                 |
| CloudFront to browser API           | Auth and API requests                                                 | Private origin routing, rotating origin-verification header, disabled default endpoint                                                 |
| Browser API to Cognito              | OAuth state, code, PKCE verifier, and tokens                          | Exact redirect allowlist, one-time state, S256 PKCE, server-side exchange, redacted logs                                               |
| ChatGPT to MCP API                  | Tool inputs, OAuth token, and client certificate                      | Dedicated domain and client, mTLS, exact SAN check, JWT claim and scope validation                                                     |
| Runtime roles to data stores        | Owner-scoped records, objects, sessions, and audit events             | Least privilege, authenticated owner derivation, encryption, conditional writes, private buckets                                       |
| Scheduler to worker                 | Due date and invocation metadata                                      | Narrow invoke permission, bounded backlog, deterministic idempotency, alarms                                                           |
| Terraform operator to state and AWS | State, plans, infrastructure changes, restore, and revocation actions | MFA-backed SSO or narrowly bound OIDC, encrypted versioned state, locking, human gates, exact context, reviewed saved plan, CloudTrail |

## Abuse cases, controls, and residual risks

| Surface and abuse case                                                                                                                 | Planned controls                                                                                                                                                                                                                                                                                                                                                                                 | Residual risk and required evidence                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser script steals tokens or finance data; a cross-site request mutates the ledger                                                  | Tokens remain behind the BFF; `Secure`, `HttpOnly`, `SameSite=Strict` cookie; CSRF header; `Origin` and `Sec-Fetch-Site` checks; strict CSP; no third-party scripts; `no-store`; no finance data in browser persistence                                                                                                                                                                          | A compromised owner device or browser extension can still observe rendered data. Test CSP, cookie flags, cache behaviour, CSRF, and session revocation.                                                                                                                                               |
| OAuth callback is used for state confusion, code replay, session fixation, or an unintended redirect                                   | Random short-lived server-side state and PKCE verifier; S256; exact callback allowlist; single-use code exchange; clean redirect; no OAuth values in logs                                                                                                                                                                                                                                        | Cognito or callback configuration can drift. Prove failure for missing, altered, expired, and replayed state before production.                                                                                                                                                                       |
| A valid client reads or mutates another owner's object                                                                                 | Ownership comes only from verified Cognito claims; client-supplied owner identifiers are rejected; owner-keyed queries; bounded pagination; conditional writes                                                                                                                                                                                                                                   | Authorization defects remain possible even in a single-owner UI. Add IDOR tests to every repository and ingress path.                                                                                                                                                                                 |
| A client spoofs ChatGPT, replays an MCP token, broadens scope, injects instructions, or retries a write                                | Dedicated mTLS domain and OAuth client; exact certificate SAN; issuer, expiry, token-use, client, audience/resource, and scope checks; authorizer cache initially disabled; bounded action-specific tools; preview/commit; idempotency; no generic query or patch tool                                                                                                                           | Cognito resource binding and the exact ChatGPT flow are unproven until the blocking compatibility test. Workspace handling of returned data remains outside this system and needs owner review.                                                                                                       |
| A receipt or statement carries executable content, parser abuse, excessive data, misleading rows, or duplicate transactions            | Private presigned uploads with random keys, size and MIME constraints, checksum and magic-byte verification; PDF/JPEG/PNG only; attachment downloads; bounded parsers; preview plus hash; idempotent commit; synthetic test fixtures                                                                                                                                                             | Version 1 has no malware-scanning service. A valid-looking malicious file can remain stored; it must never be rendered inline, and broader upload support requires a new review.                                                                                                                      |
| A scheduler retry, clock edge, or missed invocation creates duplicates or skips entries                                                | Europe/London date rules; bounded backlog; deterministic occurrence idempotency key; conditional transaction; atomic audit and schedule advancement where possible; worker concurrency limit; failure alarm                                                                                                                                                                                      | A prolonged AWS outage can exceed the backlog window. Retry, leap-year, DST, end-of-month, and missed-run tests must establish the supported recovery window.                                                                                                                                         |
| An administrator, deployment, or dependency introduces excessive access, data loss, or credential exposure                             | No root or IAM-user keys; MFA-backed SSO; narrowly scoped runtime and deployment roles; pinned dependencies and Actions; local audits and secret scan; explicit root/backend/profile/account/region/stage/input context; reviewed exact saved plan; no production destroy                                                                                                                        | The single AWS account and owner recovery path remain concentrated trust points. CloudTrail, access review, offline recovery material, and independent phishing-resistant factors reduce but do not remove that risk.                                                                                 |
| Terraform state or a saved plan leaks sensitive values, is corrupted, is applied under the wrong identity, or is modified concurrently | State and plans never enter source control, CI artifacts, or logs; dedicated ignored local paths; private encrypted, versioned, deletion-protected S3 backend; native lockfile; routine denial of state deletion; least-privilege paths; distinct stage/root keys; exact caller and backend verification; approved saved-plan checksum; encrypted backup and recovery gates for state operations | A privileged state reader can see values that application controls mark sensitive, and a mistaken state operation can detach or recreate resources. Restrict state access, review CloudTrail, test restoration, and require explicit approval for migration, import, state commands, or force-unlock. |
| Deletion, encryption-key loss, or a flawed restore makes data unavailable or exposes a restored copy                                   | DynamoDB PITR; S3 versioning; KMS encryption; production retention and deletion protection; narrowly authorised restore; redacted restore evidence; recovery drills                                                                                                                                                                                                                              | A privileged KMS or account compromise can defeat these controls. Restores create additional sensitive copies that must be inventoried and removed after verification.                                                                                                                                |
| Logs, metrics, audit events, or support evidence leak financial content                                                                | Structured coarse events; request identifiers; payload and secret redaction; audit before/after hashes instead of values; bounded retention; synthetic diagnostics                                                                                                                                                                                                                               | Reduced edge logging on an eligible CloudFront flat-rate plan limits investigation detail. Application audit coverage and alarm evidence must compensate for that blind spot.                                                                                                                         |
| Request floods or configuration mistakes cause denial of service or unexpected cost                                                    | WAF and rate rules within the approved plan; API throttles; reserved concurrency; bounded inputs; small provisioned data capacity; budget alerts; no unapproved paid services                                                                                                                                                                                                                    | The selected flat-rate plan and WAF coverage require manual console confirmation. Budget alerts detect spend but do not automatically prevent it.                                                                                                                                                     |

## Residual-risk gates

The owner must explicitly accept the following before live use:

- ChatGPT workspace retention, training, sharing, and administrator settings.
- The proven Cognito resource binding, OAuth callback, mTLS certificate, and MCP scope behaviour.
- Version 1 receipt handling without managed malware scanning.
- CloudFront flat-rate plan eligibility, included WAF controls, and reduced logging.
- The single-account administration and tested offline recovery model.

Any failed compatibility proof, high or critical dependency or infrastructure finding, unreviewed or changed Terraform plan, unavailable recovery path, missing, disabled, bypassed, or failed state locking, or unexpected paid service is a stop condition.

## Review triggers

Review and date this document when an entry point, data class, AWS service, OAuth or MCP flow, upload type, user model, deployment path, or recovery mechanism changes. The final pre-production review must link each planned control to a passing test, configuration assertion, alarm, or completed owner drill.
