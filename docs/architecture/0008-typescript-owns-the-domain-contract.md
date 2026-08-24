# ADR 0008: Let TypeScript own the domain contract and make Rust conform

- Status: Accepted
- Date: 2026-08-24

## Context

The domain exists once, in `apps/web/src/data`: around fifty exported types, thirty operations, and the ledger rules that derive every figure the product shows. It was discovered by building the browser draft, and it now has executable tests over its aggregates, its conflict paths, and its identity rules.

The planned Rust workspace will express the same domain a second time, across a camelCase boundary on the wire and a snake_case one in the language. Nothing currently detects drift between them: a search for `openapi`, `codegen`, `typeshare`, `ts-rs` or `schemars` finds no tooling. Left alone, the two definitions diverge silently and the first symptom is a runtime deserialisation failure or, worse, a silently dropped field on a financial record.

A generator in either direction would remove the duplication but add a build step, a toolchain dependency, and a generated artefact to review. The contract is small, changes rarely, and is already covered by tests.

## Decision

Treat the TypeScript definitions in `apps/web/src/data/types.ts` as the source of truth for the domain contract, and require the Rust types to conform to it.

Conformance is proven by data, not by generation. The mock's golden fixtures are exported as JSON and committed as a conformance vector; the Rust crate deserialises that vector, re-derives the same aggregates, and asserts identical minor-unit results. A field added on one side without the other fails that test rather than reaching production.

Do not add a code generator, an OpenAPI document, or a schema compiler while the contract is this size and the vector holds. Do not let Rust define a domain shape the TypeScript contract does not have. Revisit if the contract outgrows one reviewable file or a second consumer appears.

## Consequences

- One reviewable definition of the domain, and drift fails a test instead of a request.
- Rust must carry serde attributes to match the wire casing, which is mechanical but must be maintained by hand.
- The conformance vector becomes a release obligation: it is regenerated whenever the fixtures change, and its diff is part of review.
- The vector proves shape and arithmetic, not behaviour. Conflict, expiry, and authorisation paths still need their own tests on each side.
