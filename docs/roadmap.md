# Roadmap

Milestone vocabulary used across this repository. Written in non-identifying terms; it records what each stage delivers and what must be true before the next one starts.

## Milestone 0 — foundation (current)

Repository, security design, and a browser draft over synthetic fixtures with an in-memory mock. No AWS resources, no backend, no real data. Complete when the domain contract is settled, tested, and recorded in decision records.

## Milestone 1 — domain in Rust

The domain crate expresses the contract of ADR 0008 and proves conformance against the committed fixture vector. Still no deployed infrastructure.

## Milestone 2 — first AWS resources

The Terraform bootstrap root and state backend of ADR 0006, then the browser application scope of ADR 0009: CloudFront, one Lambda binary, DynamoDB, Cognito, and S3 for receipts. Requires the recorded cost ceiling, a proven state restoration, and the owner approvals listed in the manual actions register.

## Milestone 3 — scheduling and import

The scheduler worker and its trigger, then statement import. Each is a separate decision to proceed.

## Milestone 4 — MCP

The separate ingress of ADR 0004, gated on the compatibility proof. ADR 0009 requires that proof to run first as a throwaway spike against a disposable domain.

## Not scheduled

Multi-currency, multiple owners, and mobile applications are out of scope. Adding any of them is a new decision record, not a milestone.
