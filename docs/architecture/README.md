# Architecture decision records

Each record states a decision that would be expensive to reverse silently, the context that forced it, and what it costs. Records are immutable once accepted: a change is a new record that supersedes the old one, not an edit.

Use [`0000-template.md`](0000-template.md) for a new record. Number sequentially and record `Supersedes` and `Superseded by` on both sides of a replacement.

| ADR                                                 | Decision                                           | Status   |
| --------------------------------------------------- | -------------------------------------------------- | -------- |
| [0001](0001-rust-arm64-zip-lambdas.md)              | Rust ARM64 ZIP Lambda functions, three binaries    | Accepted |
| [0002](0002-browser-bff-sessions.md)                | Browser tokens stay behind a BFF session           | Accepted |
| [0003](0003-dynamodb-data-model.md)                 | DynamoDB as the canonical ledger store             | Accepted |
| [0004](0004-separate-browser-and-mcp-ingress.md)    | Separate browser and MCP ingress                   | Accepted |
| [0005](0005-preview-commit-mcp-writes.md)           | Preview and commit for every MCP write             | Accepted |
| [0006](0006-adopt-terraform-as-sole-aws-iac.md)     | Terraform as the sole AWS infrastructure engine    | Accepted |
| [0007](0007-monthly-rollups-for-aggregate-reads.md) | Monthly rollups maintained on the write path       | Accepted |
| [0008](0008-typescript-owns-the-domain-contract.md) | TypeScript owns the domain contract, Rust conforms | Accepted |
| [0009](0009-v1-deployment-scope.md)                 | A one-binary v1, with MCP as an additive milestone | Accepted |

ADR 0006 replaced an earlier choice of CDK that predates this log and has no record of its own.
