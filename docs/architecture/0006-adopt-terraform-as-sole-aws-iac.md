# ADR 0006: Adopt Terraform as the sole AWS infrastructure engine

- Status: Accepted
- Date: 2026-08-19

## Context

The Milestone 0 CDK scaffold contained one resource-free stack and was never deployed. The owner is already familiar with Terraform and explicitly chose it so the infrastructure remains easier to understand and review. Switching before any AWS resource exists avoids an import or state migration and removes the risk of two tools claiming the same resource.

Terraform state and saved plans can contain sensitive values, and state boundaries determine deployment permissions and failure impact. The replacement therefore needs an explicit state, locking, review, and bootstrap model rather than only a syntax change.

## Decision

Use Terraform as the sole infrastructure-as-code engine. Pin Terraform 1.15.9 and the AWS provider 6.60.0, and commit the generated `.terraform.lock.hcl`. Do not retain CDK or introduce CDK for Terraform.

Milestone 0 keeps one credential-free, resource-free root in `infra`. When AWS work begins, use a separately gated bootstrap root for the state store, one account root for shared guardrails, and an environment root reused with distinct backend keys and reviewed inputs for sandbox and production. Reusable child modules may separate edge, identity, data, application, MCP, and scheduling implementation, but a child module does not own state and is not independently deployable. Do not use Terraform workspaces to separate production from sandbox.

Before managing any non-bootstrap resource, create private S3 state storage with encryption, Block Public Access, TLS-only access, versioning, Terraform `prevent_destroy`, least-privilege permissions, and native S3 locking through `use_lockfile = true`. Routine roles cannot delete the bucket or state objects; they may delete only the `.tflock` objects required to release normal locks. Bootstrap starts with restricted ignored local state, then migrates that state to the approved backend and proves version restoration before the first non-bootstrap apply. Backend coordinates use an ignored partial configuration; credentials come from short-lived IAM Identity Center sessions locally and, only if later approved, a narrowly bound GitHub OIDC role.

Keep backend partial configuration under the repository-relative `private/terraform/backend/` path and saved plans under `private/terraform/plans/`; verify each exact path is ignored before writing. The owner reviews the exact plan locally, and only that plan may be applied. Backend migration, imports, state commands, force-unlock, resource replacement or deletion, teardown, and every production apply remain separate human gates. Every default or CI Terraform test is plan-only and uses mocked providers. Add an exact-pinned Terraform configuration security scanner when the first AWS resource is introduced; native formatting, validation, tests, and the empty detailed-exit-code plan cover the resource-free foundation.

## Consequences

- Infrastructure review uses the owner's familiar HCL and Terraform plan workflow.
- CDK packages, generated output, feature flags, and CloudFormation-specific tests leave the dependency and maintenance surface.
- Remote-state bootstrap and state recovery become explicit operational responsibilities before Milestone 2 can manage AWS resources.
- State, backups, plans, plan JSON, variable files, and outputs must be handled as sensitive material and never published as CI or pull-request artifacts.
- Future resources need Terraform tests and static security scanning in addition to provider validation and owner review; `terraform validate` alone is not a security assessment.
