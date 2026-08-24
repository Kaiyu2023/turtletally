# ADR 0003: Use DynamoDB as the canonical ledger store

- Status: Accepted
- Date: 2026-08-18

## Context

The application has one owner, bounded monthly ledger queries, scheduled lookups, optimistic writes, and low personal-use traffic. It also needs independently controlled sessions and append-only audit events without operating a database server.

## Decision

Use DynamoDB tables for finance entities, sessions, and audit events. Partition finance records by the authenticated Cognito subject and use typed sort keys for bounded access patterns. Use targeted indexes for direct entity lookup and due schedules; do not expose scans or arbitrary queries.

Direction lives in the sign of the amount and nowhere else. A stored record carries one signed minor-unit amount, so an amount and a separate direction field cannot disagree, and every aggregation is a plain sum. A refund is a positive amount in a spending category rather than a second representation of the same fact.

Display names such as an account or category name are a read-model projection resolved from the current entity, never a value stored on the record that references it. A rename is therefore visible everywhere immediately, including in search, and no propagation job is required. Account balance is the opposite case: it is a maintained counter updated with the ledger write, not a scan, for the reason ADR 0007 gives for monthly rollups. The balance is owned by the ledger and is not directly editable; an opening balance is set once at creation and may be negative.

Write repositories explicitly without an ORM. Use conditional and transactional writes for version checks, idempotency, and mutation-plus-audit atomicity. Audit events are server-internal and are not part of the API contract: no endpoint returns them, no client reads them, and they are reached only through an owner-initiated export or a support procedure. Keeping them off the contract means a change to what is recorded is not a breaking change, and a compromised client cannot enumerate the trail it is supposed to be held to. Keep receipt and import objects in private, versioned S3 storage rather than DynamoDB. Bytes never pass through the API: the client requests a short-lived upload grant, writes to the returned URL, and reports the checksum the server verifies the stored object against. A record references an object the server already holds by its server-issued identifier; a client-minted identifier is rejected. Enable encryption, point-in-time recovery, deletion protection, and production retention.

## Consequences

- Normal requests remain inexpensive and need no database host, but every access pattern must be designed and tested in advance.
- Cross-entity reporting is limited to bounded queries and application-side calculation until measurements justify projections.
- Schema evolution must preserve sort-key and index compatibility, and restore drills are required before production.
- Audit events must therefore be recoverable without the application: their table, retention, and export path are operational concerns with their own approval, not features.
- Resolving display names on read costs a lookup against the bounded account and category lists, which a page-shaped read already loads. Storing them would trade that for a propagation job and stale history.
