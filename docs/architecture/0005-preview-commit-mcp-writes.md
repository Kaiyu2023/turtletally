# ADR 0005: Require preview and commit for MCP writes

- Status: Accepted
- Date: 2026-08-18

## Context

ChatGPT can misunderstand intent, receive prompt-injected content, or retry a tool call. Sending an arbitrary mutation payload directly from a conversational client would make confirmation ambiguous and replay difficult to control.

## Decision

Every MCP mutation has an action-specific preview and commit pair. Preview validates and normalises input, calculates its effect, and stores a canonical owner-bound operation with a short expiry. It returns an operation identifier, exact hash, warnings, and proposed changes.

Commit accepts the operation identifier and expected hash rather than a replacement payload. It verifies ownership, scope, expiry, entity versions, idempotency, and single use before atomically applying the mutation and its audit event. Do not expose generic query, patch, hard-delete, or database tools.

## Consequences

- The owner can review the exact effect before a financial change and retries cannot silently create a different operation.
- Writes require an additional round trip and short-lived operation storage.
- Expired, replayed, altered, or stale previews fail closed and must be previewed again.
