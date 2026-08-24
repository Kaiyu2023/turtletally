# ADR 0007: Maintain monthly rollups for aggregate reads

- Status: Accepted
- Date: 2026-08-24

## Context

The overview, budget, and comparison surfaces are aggregates over a month of ledger rows. The Milestone 0 draft derives every figure from raw transactions on each request and re-reads the same month once per budgeted category, so a single overview costs roughly fifteen month-sized reads.

DynamoDB charges read capacity on the bytes a query reads, and the free allowance is a small provisioned reserve shared by every surface. Transcribing the draft directly would spend that reserve repeatedly deriving figures that change only when the owner writes. Personal ledger traffic is heavily read-biased: tens of writes a month against many overview loads a day, so aggregates belong on the write path.

ADR 0003 already commits every mutation to a transaction carrying the record and its audit event, which is the natural place to maintain them.

## Decision

Keep the ledger authoritative and maintain a derived rollup item per owner and month holding totals by kind, net cash flow, transaction count, spending by category, and one bucket per day.

Update the rollup inside the same transaction that writes the ledger row and its audit event, using atomic addition of signed deltas. An edit applies the reversal and the new value, a void applies the reversal, and an import applies one pre-summed delta for the batch. A mutation and its aggregate commit or fail together and cannot diverge.

Serve an overview from the current and previous rollup items rather than a ledger query. Where a ledger window is genuinely required, read one bounded window per request and derive every figure from it in memory. Never read a partition more than once to serve a single response, and never write during a read. Use eventually consistent reads; a mutation returns its own result, so no surface depends on read-after-write.

Provide `rebuildMonth` to recompute a rollup from the ledger, and assert in tests that a rebuilt rollup equals the incrementally maintained one after every mutation.

Do not introduce DynamoDB Streams, a rollup consumer, or a response cache for this. Do not derive ledger state from a rollup. Do not treat `ProjectionExpression` as a capacity control; it does not reduce read capacity.

Treat this decision as deployment-blocking rather than an optimisation to revisit after launch. Milestone 0 implements only its in-memory equivalent: one bounded ledger read per request, every aggregate derived from that read in a single pass, and no write during a read. The rollup item and its transactional maintenance, `rebuildMonth` and its equality test, page-shaped reads for each route, cursor pagination in place of offset and total counts, and a session-lifetime client cache for the bounded account and category lists must all be in place before the first production deployment.

## Consequences

- An overview costs two item reads rather than a repeated month query, keeping aggregate reads inside a small provisioned reserve.
- Aggregates are exact and immediately visible, so preview and commit stay synchronous and no surface shows a stale total.
- Every write path must emit correct deltas. `rebuildMonth` and the equality test are the control, so a missed delta is repairable rather than permanent.
- Transactional writes cost double write capacity and are bounded to one hundred items, which suits this write rate and batch size.
- Denormalised display names and long attribute names now carry a measurable read cost, because capacity is charged on bytes read.
- Offset pagination and total counts cannot be served without reading a partition from its start, so list surfaces need cursors and a has-more flag instead.
- Milestone 0 ships the read shape but not the rollup, so the remaining work is a deployment gate recorded in `AGENTS.md` rather than an optional improvement.
