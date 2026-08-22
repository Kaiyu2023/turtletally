# ADR 0001: Use Rust ARM64 ZIP Lambda functions

- Status: Accepted
- Date: 2026-08-18

## Context

The application needs three low-traffic serverless workloads: the browser API, the MCP API, and the scheduler worker. Low idle cost, small deployment artifacts, predictable cold starts, and a limited dependency surface matter more than framework breadth.

## Decision

Build native ARM64 ZIP functions in Rust for the `provided.al2023` runtime. Use Axum with `lambda_http` for HTTP handling, `rmcp` for the stateless MCP endpoint, and `lambda_runtime` for scheduled work. Keep `app-api`, `mcp-api`, and `scheduler-worker` as separate binaries and share focused domain and adapter crates.

Do not use containers, Lambda layers, a Lambda per route, or one binary containing every ingress path unless measurements establish a concrete need.

## Consequences

- Native binaries should reduce artifact size and idle cost, but require a pinned Rust toolchain and ARM64 build support.
- Each binary can have a narrowly scoped role and dependency set at the cost of three release artifacts.
- Artifact size, cold starts, and memory settings must be measured before changing framework or packaging choices.
