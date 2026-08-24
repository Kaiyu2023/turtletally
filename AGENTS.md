# Repository instructions

These rules apply to the entire Turtle Tally repository.

## Safety boundaries

- Never commit secrets, credentials, tokens, cookies, OAuth codes, real financial data, statements, receipts, production identifiers, or unredacted logs.
- Use synthetic fixtures only. Convert any locally supplied bank sample into a synthetic fixture before committing it.
- Never create long-lived AWS access keys. Human AWS access uses IAM Identity Center/SSO outside this repository.
- Do not add AWS credentials to GitHub Secrets. A future deployment workflow must use short-lived GitHub OIDC credentials, least privilege, and a protected environment.
- Never run `terraform destroy` or apply a destroy plan against production. Production data resources require service-level deletion protection, recovery controls, and Terraform `prevent_destroy` while they remain managed.
- Do not deploy, change billing, select a domain, or cross a documented human gate without the owner's explicit approval.
- Before every apply, resolve the exact root configuration, backend key, AWS profile, account, region, stage, variable file, Terraform version, and provider lock revision. Generate a saved plan only under the repository-relative `private/terraform/plans/` path after verifying the exact path is ignored, show it to the owner locally, and apply only that exact approved plan.
- Treat Terraform state, backups, saved plans and their JSON forms, crash logs, variable files, and outputs as sensitive. Never commit, publish, attach, or log them. Commit `.terraform.lock.hcl`.
- Backend bootstrap or migration, import, state move/remove/provider replacement, state restoration, force-unlock, replacement or deletion, teardown, and production apply each require a separate documented owner approval.
- Stop if the Cognito, OAuth resource binding, OpenAI mTLS, or ChatGPT Work compatibility proof fails. Do not add a custom OAuth adapter without explicit owner approval.
- Do not weaken passkey recovery, enable a paid AWS add-on, or connect live financial data to ChatGPT without the corresponding documented owner approval.
- Do not deploy to production until ADR 0007 is implemented in full. Serving an aggregate by re-querying the ledger, offset pagination, and refetching bounded reference lists per route are not deployable states.

## Required checks

- Read [`docs/roadmap.md`](docs/roadmap.md) for the milestone vocabulary these rules refer to.
- Before implementation, read `finance-app-implementation-plan.md` completely when it is present locally. Append dated evidence to its Progress, Surprises and discoveries, Decision log, and Outcomes sections as work progresses. It is intentionally untracked; never stage or publish it without a reviewed, sanitized replacement.
- Run `./scripts/check-repository-secrets.sh` before every commit.
- Keep dependencies and GitHub Actions pinned and review updates before merging.
- Run `npm run check` before merging. It is the single gate: repository secret scan, formatting, linting, type checks, unit, browser and Terraform tests, dependency audits, builds, and a credential-free Terraform plan that must contain no changes. When a component is added, extend that script rather than this list.
- Keep sensitive request and response bodies out of logs and test output.
- Every Terraform test run in CI or the default local checks must set `command = plan` and use mocked providers. A test that can apply infrastructure requires a separate owner-approved workflow with explicit cost and cleanup gates.

## Working practices

- Work on a feature branch and merge through a pull request. Never push directly to protected `main`.
- Make small, reviewable commits.
- Treat security controls and stop conditions as product requirements.
- Keep public documentation free of personal bank details, account IDs, domains, email addresses, and other unnecessary identifying information.
- Preserve unrelated user changes and never use destructive Git commands without explicit authorization.

## Code simplicity

- Treat simplicity as a primary design constraint. Choose the simplest design that fully satisfies the current requirements.
- Minimise code, concepts, dependencies, abstraction layers, indirection, and configuration. Do not add speculative flexibility or generalise before a concrete need exists.
- Prefer clear names, focused functions, explicit types, and straightforward control flow so the code explains itself.
- Avoid docstrings and comments when the code can express the same intent. Add one only when it explains a non-obvious reason, external constraint, security invariant, or important trade-off; never use comments to narrate what the code already says.
- Keep each frontend page in its own folder. Put page orchestration in `index.tsx`, page-specific presentation in `components.tsx`, and promote a component to the shared layer only when the same semantics genuinely repeat.
- Apply the same folder and orchestration/presentation split to an app-level composite when its main return block becomes difficult to scan.

## Rust guidance

- Represent money as signed 64-bit minor units with an explicit currency. Never use floating point in persisted or API models.
- Keep domain validation in explicit types and constructors. Prefer focused functions, typed errors, and straightforward repository code over macros, reflection, or an ORM.
- Keep the three deployment binaries separate and share only domain, application, authentication, adapter, and test-support code with genuinely common semantics.
- Use structured logs containing coarse event names and request identifiers only; never log finance payloads, tokens, cookies, OAuth codes, statement rows, or receipt names.

## Frontend guidance

- Use strict TypeScript, semantic HTML, accessible controls, visible focus, and reduced-motion support.
- Never persist session material or finance data in `localStorage`, IndexedDB, a service-worker cache, or client-side telemetry.
- Do not add remote fonts, third-party scripts, advertising, analytics, or client-side error recorders.
- Keep each page's orchestration in `index.tsx`, page-specific presentation in `components.tsx`, and page styles beside the page. Promote only genuinely repeated semantics to shared code.

## Infrastructure guidance

- Terraform is the sole infrastructure-as-code engine. Keep state-owning root configurations explicit and focused; child modules are reusable implementation units, not independently deployable state boundaries.
- Default to least-privilege roles, private resources, encryption, explicit throttles, and bounded log retention. Production data resources require point-in-time recovery or versioning, service-level deletion protection where supported, and `prevent_destroy` while managed.
- Before any non-bootstrap AWS resource is managed, use a private encrypted and versioned S3 backend with Block Public Access, TLS-only access, `prevent_destroy`, least-privilege permissions, distinct keys per stage and root, and `use_lockfile = true`. Deny routine deletion of the bucket and state objects while permitting deletion only of the lock objects required for normal unlocking. Never use local production state or Terraform workspaces to separate production from sandbox, and prove state restoration before the first non-bootstrap apply.
- Never use `-auto-approve`, `-lock=false`, manual state-file editing, or an unsaved automatic apply. `-target`, `-replace`, refresh-only plans, imports, state commands, and force-unlock require their specific owner gate and recovery procedure.
- Add an exact-pinned Terraform configuration security scanner when the first AWS resource is introduced. Fix findings or document a narrow reviewed reason; document unavoidable wildcard permissions and manual console actions.
- Prefer reproducible Terraform changes. Do not make an undocumented console change, upload a speculative plan, or apply before the owner reviews the exact saved plan. Replanning or changing any bound input invalidates that approval.
