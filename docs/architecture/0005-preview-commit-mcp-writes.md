# ADR 0005: Require preview and commit for MCP writes

- Status: Accepted
- Date: 2026-08-18

## Context

ChatGPT can misunderstand intent, receive prompt-injected content, or retry a tool call. Sending an arbitrary mutation payload directly from a conversational client would make confirmation ambiguous and replay difficult to control.

## Decision

Every MCP mutation has an action-specific preview and commit pair. Preview validates and normalises input, calculates its effect, and stores a canonical owner-bound operation with a short expiry. It returns an operation identifier, exact hash, warnings, and proposed changes.

Commit accepts the operation identifier and expected hash rather than a replacement payload. It verifies ownership, scope, expiry, entity versions, idempotency, and single use before atomically applying the mutation and its audit event. Do not expose generic query, patch, hard-delete, or database tools.

## Consequences

- Replay, idempotency, and staleness are enforced: a retry cannot silently create a different operation, and an altered or expired preview fails closed.
- Human confirmation is not yet enforced. Every input to commit is a value the model received from the immediately preceding preview, so an injected statement row can drive preview and commit back to back and the server cannot distinguish that from a reviewed commit. Closing this needs an out-of-band binding the model cannot supply itself, such as approval through the browser session or a value threshold below which auto-commit is permitted.
- Writes require an additional round trip and short-lived operation storage.
- Expired, replayed, altered, or stale previews fail closed and must be previewed again.
