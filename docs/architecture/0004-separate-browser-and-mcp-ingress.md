# ADR 0004: Separate browser and MCP ingress

- Status: Accepted
- Date: 2026-08-18

## Context

The browser and ChatGPT have different clients, authentication flows, trust boundaries, data exposure, and failure modes. Sharing one public ingress or runtime role would couple browser sessions to machine-to-machine OAuth and broaden compromise impact.

## Decision

Serve the browser through CloudFront and a same-origin BFF. Serve MCP through a separate Regional API Gateway REST custom domain protected by OpenAI client mTLS, scoped Cognito access tokens, certificate-SAN validation, and a dedicated runtime role. Disable both API Gateway default endpoints.

Keep the MCP handler stateless and expose only action-specific, bounded tools. Do not reuse the browser app client, session, origin, or permissions. Treat the production-style Cognito, OAuth resource binding, mTLS, and ChatGPT compatibility proof as a blocking gate.

## Consequences

- A compromise or configuration error on one ingress has a smaller blast radius.
- Separate domains, certificates, API configuration, alarms, clients, and permissions add infrastructure work.
- MCP development stops if the compatibility gate fails; a custom OAuth compatibility service is not an automatic fallback.
