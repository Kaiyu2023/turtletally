# ADR 0009: Ship a one-binary v1 and treat MCP as an additive milestone

- Status: Accepted
- Date: 2026-08-24

## Context

The accepted records describe, in total, three Lambda binaries, two public ingresses with separate domains and certificates, OpenAI client mTLS, Cognito with two passkeys and TOTP, three DynamoDB tables, S3 for objects, a separate Terraform backend with its own bootstrap root, CloudFront with WAF, EventBridge Scheduler, KMS, Route 53, and ACM in two regions. Each is individually well argued. Nothing weighs the total against one person's capacity to build, operate, and pay for it.

`AGENTS.md` makes simplicity a primary constraint on code and forbids speculative flexibility, but says nothing about proportionality in infrastructure.

The sequencing carries a specific risk. The ChatGPT compatibility proof is the only gate whose outcome the owner does not control, ADR 0004 states that failing it stops MCP work, and reaching it requires a paid plan, a CloudFront subscription, and a registered production domain that permanently binds the passkey relying-party identity. The one thing that can fail is currently attempted last, after irreversible spend.

## Decision

The minimum shippable system is the browser application: CloudFront, one Lambda binary serving both the BFF and the API, DynamoDB, Cognito, and S3 for receipts. Everything else is an additive milestone with its own decision to proceed.

Deferred to later milestones, in this order: the scheduler worker and its EventBridge trigger; statement import; then the MCP ingress with its separate domain, certificate, client, mTLS, and runtime role. Splitting `app-api` into separate binaries happens when a measurement justifies it, not before, which is what ADR 0001 already requires.

Prove the ChatGPT compatibility gate as a throwaway spike before any irreversible commitment. The spike runs in a sandbox account against a disposable domain that is explicitly not the passkey relying party, and it proves discovery, resource binding, and mTLS only. The production gate stays where it is.

Record a monthly cost ceiling and alert thresholds before the first billable resource, and treat crossing the ceiling as a stop condition rather than a notification.

## Consequences

- A failing ChatGPT gate becomes a scope reduction — the browser application ships without MCP — rather than a project-ending outcome.
- The passkey relying-party identity is not bound until the domain decision is made on its own merits.
- v1 reaches production with materially fewer moving parts, and each deferred milestone arrives with its own review rather than as part of one large launch.
- Deferring MCP means the conversational surface, which is a product goal rather than an implementation detail, is absent from the first release.
- The cost ceiling must be set to a real figure. A ceiling recorded as a placeholder is not a control.
