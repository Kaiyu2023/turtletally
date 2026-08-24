# API conventions

- Status: Design baseline. No endpoint is deployed; the browser draft exercises these shapes against an in-memory mock.

These apply to every endpoint. [`user-preferences.md`](user-preferences.md) is the worked example.

## Shape

JSON request and response bodies use `camelCase`, matching the contract of ADR 0008. Money is a signed integer of minor units with an explicit ISO 4217 currency, never a decimal or a float. Dates the owner sees are `YYYY-MM-DD` in the owner's timezone; instants are RFC 3339 in UTC.

## Ownership

Ownership is derived from the verified session, never from the request. No endpoint accepts an owner identifier, and one supplied anyway is rejected rather than ignored.

## Concurrency

Every mutable resource carries an integer `version`. An update sends `expectedVersion`, and a mismatch returns `409` with code `CONFLICT`; a create sends `expectedVersion: null` and a resource that already exists returns the same conflict. Clients reload and re-present rather than retrying blindly.

## Errors

Errors return a code from a closed set — `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `UNAUTHENTICATED` — with a message safe to display. Messages never quote a financial value, a filename, or a token. Clients branch on the code, never on the message.

## Reads

Reads are bounded. Every collection query names a partition and a window, results are cursor-paged with a has-more flag rather than an offset and a total, and a page-shaped read returns what a route renders in one request. ADR 0007 gives the reasoning.

## Caching and method safety

Authentication and finance responses are `no-store`. A read never writes: an endpoint that materialises or back-fills a record during a `GET` is a defect, not an optimisation.

## Mutations

Mutations require the session cookie, a per-session CSRF header, and passing `Origin` and `Sec-Fetch-Site` checks, as ADR 0002 requires. Uploads are presigned and content-addressed; bytes never pass through the API.

## Versioning

The contract is versioned by the deployment, not by a URL prefix or a header. A breaking change is a decision record, because there is one client and one owner and a coordinated release is cheaper than a compatibility layer.
