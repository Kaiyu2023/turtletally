# ADR 0010: Fix the DynamoDB key design and how a mutation commits

- Status: Accepted
- Date: 2026-08-25

## Context

ADR 0003 chose DynamoDB and named the access patterns; ADR 0007 added a derived
rollup that a mutation must maintain in the same transaction. Neither fixes the
keys. Sort keys and index projections are the part of a DynamoDB design that
cannot be changed later without a migration, so they belong in a decision
record rather than only in the adapter that happens to build them.

Two mechanics also constrain the design. `ADD` works only on a top-level
attribute, so a rollup's per-category and per-day buckets cannot be incremented
the same way its totals are. And a single expression may not both create a map
and write a key inside it.

## Decision

Partition reference records by owner and reach each through a typed sort-key
prefix: `PREFERENCES`, `ACCOUNT#`, `CATEGORY#`, `BUDGET#<month>#<category>`,
`BUDGET_DEFAULT#<category>`, `SCHEDULE#`, `RECEIPT#`, `UPLOAD#`, and
`ROLLUP#<month>`. A budget's key carries its month and category, so setting the
same budget twice cannot produce two rows.

Give the ledger a partition per owner and month, `OWNER#<sub>#LEDGER#<month>`,
with sort key `TX#<occurredAt>#<id>`. A month window is then one query per month
it spans, and the sort key is the same total order the cursor uses, so the
newest rows are the first page read backwards. Resolve a transaction by
identifier through one sparse index, `TransactionById`, keyed on
`OWNER#<sub>#TX` and the identifier.

Do not add an index for due schedules. The product has one owner and the
schedule list is bounded, so it is already a single prefix query; an index would
only pay for itself with many owners, which is out of scope.

Commit every mutation as one `TransactWriteItems` carrying the record, the
rollup updates its deltas imply, the account balance moves, and the audit event.
Totals move with `ADD`; per-category and per-day buckets move with
`SET bucket.key = if_not_exists(bucket.key, :zero) + :delta`. Because that
addressing needs the maps to exist, a write first issues one idempotent update
that creates the rollup item's empty maps and its month. Refuse a commit that
would exceed the hundred-item transaction limit rather than splitting it.

Store an upload grant as its own item with a time-to-live attribute and redeem
it with a delete that returns the old value, so the grant is single use and an
unredeemed one expires without a cleanup job.

Keep the table's key attributes out of the contract types: they are added when a
record is written and removed when it is read.

## Consequences

- The access patterns are fixed and cheap: bounded prefix queries for reference
  data, one query per month for a ledger window, one item read for an aggregate.
- Sort-key and index compatibility is now a stated constraint on schema
  evolution, and changing either is a migration rather than an edit.
- A write costs one extra idempotent update before its transaction. That is the
  price of nested atomic addition, and it is paid on writes, which are rare.
- Reads are eventually consistent by default, which ADR 0007 already relies on;
  a mutation returns its own result, so no surface depends on read-after-write.
- A cancelled transaction surfaces as a conflict rather than a server error,
  because the only conditions in it are version and existence checks.
- The audit table is written in the same transaction as the record, so a
  mutation cannot be recorded without its trail or the reverse.
