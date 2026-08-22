# ADR 0003: Use DynamoDB as the canonical ledger store

- Status: Accepted
- Date: 2026-08-18

## Context

The application has one owner, bounded monthly ledger queries, scheduled lookups, optimistic writes, and low personal-use traffic. It also needs independently controlled sessions and append-only audit events without operating a database server.

## Decision

Use DynamoDB tables for finance entities, sessions, and audit events. Partition finance records by the authenticated Cognito subject and use typed sort keys for bounded access patterns. Use targeted indexes for direct entity lookup and due schedules; do not expose scans or arbitrary queries.

Write repositories explicitly without an ORM. Use conditional and transactional writes for version checks, idempotency, and mutation-plus-audit atomicity. Keep receipt and import objects in private, versioned S3 storage rather than DynamoDB. Enable encryption, point-in-time recovery, deletion protection, and production retention.

## Consequences

- Normal requests remain inexpensive and need no database host, but every access pattern must be designed and tested in advance.
- Cross-entity reporting is limited to bounded queries and application-side calculation until measurements justify projections.
- Schema evolution must preserve sort-key and index compatibility, and restore drills are required before production.
