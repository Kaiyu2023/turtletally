# Terraform infrastructure

Terraform is the sole infrastructure-as-code engine for Turtle Tally. The Milestone 0 foundation pins Terraform and the AWS provider, but deliberately defines no provider configuration, backend, data sources, modules, resources, or outputs. No AWS credentials are needed and no apply is authorised.

Run the credential-free foundation checks from the repository root:

```sh
npm run format:check:terraform
npm run lint:terraform
npm run test:terraform
npm run terraform:plan
```

The native test is explicitly plan-only and uses a mocked AWS provider. The final command uses Terraform's detailed exit code: exit code `0` confirms that the foundation plans no changes, while exit code `2` fails the check because the plan is no longer empty.

## State and deployment boundary

Before the first AWS resource is added, a separately approved bootstrap root must create private, encrypted, versioned S3 state storage with Block Public Access, TLS-only access, Terraform `prevent_destroy`, least-privilege permissions, and native S3 lockfiles. Routine roles deny bucket and state-object deletion while allowing deletion only of the lock objects required for normal unlocking. Sandbox and production use distinct state keys rather than Terraform workspaces, and a version-restoration drill must pass before the first apply. Backend coordinates remain under `/private/terraform/backend/` and credentials come only from the owner's short-lived IAM Identity Center session.

Terraform state, backups, saved plans and their JSON forms, crash logs, variable files, and outputs can contain sensitive values. Keep them out of source control, pull requests, CI artifacts, and logs. The generated `.terraform.lock.hcl` is the exception: it contains provider selections and checksums and must be committed.

Every future apply requires an exact saved plan under `/private/terraform/plans/`, reviewed locally by the owner after `git check-ignore` verifies its path. Backend bootstrap or migration, import and state commands, force-unlock, replacement or deletion, teardown, and production apply each require their own documented approval. See the [infrastructure decision](../docs/architecture/0006-adopt-terraform-as-sole-aws-iac.md) and [manual owner gates](../docs/operations/manual-actions.md).
