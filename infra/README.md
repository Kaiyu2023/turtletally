# Terraform infrastructure

Terraform is the sole infrastructure-as-code engine for Turtle Tally
([ADR 0006](../docs/architecture/0006-adopt-terraform-as-sole-aws-iac.md)). Every
root and module here is checked without credentials, and nothing in this
repository can apply anything on its own.

## Layout

| Directory     | What it owns                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `.`           | The resource-free foundation. It pins the versions and must always plan no changes.                        |
| `bootstrap`   | The private state bucket, created by its own root with restricted local state before anything else exists. |
| `environment` | One deployable stack per stage, reused with distinct backend keys and reviewed inputs.                     |
| `modules/*`   | Reusable implementation units. A module owns no state and is not independently deployable.                 |

The environment root composes `data` (tables, objects, and the key that encrypts
them), `identity` (the user pool, the browser client, and one client per
assistant), `application` (one function per ingress, each with its own role),
`edge` (the distribution the browser and its API share), `mcp` (the separate
ingress of [ADR 0004](../docs/architecture/0004-separate-browser-and-mcp-ingress.md)),
and `observability` (the cost ceiling and the alarms).

## Checks

```sh
npm run format:check:terraform
npm run lint:terraform
npm run test:terraform
npm run scan:terraform
npm run terraform:plan
```

Every test uses a mocked provider and `command = plan`, so no check can reach an
account. `npm run terraform:plan` uses the detailed exit code on the
resource-free foundation: `0` confirms it plans no changes, and `2` fails the
check because it no longer does.

The configuration scanner is Trivy, pinned to 0.74.0 and downloaded in CI
against its published checksum. Install the same version locally to run
`npm run scan:terraform`. A finding is fixed, or narrowed and explained in
`.trivyignore.yaml` with the reason it is accepted; the severity threshold is never
lowered to make one disappear.

## Applying

An apply is an owner action and follows
[the deployment runbook](../docs/operations/deployment.md) and
[the manual actions register](../docs/operations/manual-actions.md). Backend
coordinates live under the ignored `private/terraform/backend/` path, saved plans
under `private/terraform/plans/`, and both are verified with `git check-ignore`
before anything is written to them.

## State and deployment boundary

Before the first non-bootstrap AWS resource is managed, the bootstrap root
creates private, encrypted, versioned S3 state storage with Block Public Access,
TLS-only access, Terraform `prevent_destroy`, least-privilege permissions, and
native S3 lockfiles. Routine roles deny bucket and state-object deletion while
allowing deletion only of the lock objects required for normal unlocking.
Sandbox and production use distinct state keys rather than Terraform workspaces,
and a version-restoration drill must pass before the first non-bootstrap apply.

Terraform state, backups, saved plans and their JSON forms, crash logs, variable
files, and outputs can contain sensitive values. Keep them out of source control,
pull requests, CI artifacts, and logs. The generated `.terraform.lock.hcl` files
are the exception: they carry provider selections and checksums and are committed.
