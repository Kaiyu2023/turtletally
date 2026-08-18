# Repository instructions

These rules apply to the entire Turtle Tally repository.

## Safety boundaries

- Never commit secrets, credentials, tokens, cookies, OAuth codes, real financial data, statements, receipts, production identifiers, or unredacted logs.
- Use synthetic fixtures only. Convert any locally supplied bank sample into a synthetic fixture before committing it.
- Never create long-lived AWS access keys. Human AWS access uses IAM Identity Center/SSO outside this repository.
- Do not add AWS credentials to GitHub Secrets. A future deployment workflow must use short-lived GitHub OIDC credentials, least privilege, and a protected environment.
- Never run `cdk destroy` against production. Production data resources require retention and deletion protection.
- Do not deploy, change billing, select a domain, or cross a documented human gate without the owner's explicit approval.
- Show and review `cdk diff` before every deployment. Every deployment command must name its profile, account, region, stage, and stack.
- Stop if the Cognito, OAuth resource binding, OpenAI mTLS, or ChatGPT Work compatibility proof fails. Do not add a custom OAuth adapter without explicit owner approval.
- Do not weaken passkey recovery, enable a paid AWS add-on, or connect live financial data to ChatGPT without the corresponding documented owner approval.

## Required checks

- Before implementation, read `finance-app-implementation-plan.md` completely when it is present locally. Append dated evidence to its Progress, Surprises and discoveries, Decision log, and Outcomes sections as work progresses. It is intentionally untracked; never stage or publish it without a reviewed, sanitized replacement.
- Run `./scripts/check-repository-secrets.sh` before every commit.
- Keep dependencies and GitHub Actions pinned and review updates before merging.
- Run the applicable checks below before merging. A check becomes mandatory when its component exists:
  - `npm run format:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm audit`
  - `cargo fmt --all -- --check`
  - `cargo clippy --workspace --all-targets --all-features -- -D warnings`
  - `cargo test --workspace`
  - `cargo audit`
  - `cargo deny check`
  - `npm run test:node`
  - `npm run cdk:synth`
- Keep sensitive request and response bodies out of logs and test output.

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

- Keep independently deployable stacks focused on account guardrails, edge/DNS, identity, data, application, MCP, and scheduling concerns.
- Default to least-privilege roles, private resources, encryption, explicit throttles, and bounded log retention. Production data resources require `RETAIN`, point-in-time recovery or versioning, and deletion protection where supported.
- Resolve profile, account, region, stage, and stack explicitly before each diff or deployment. Fail closed on missing or mismatched deployment context.
- Fix `cdk-nag` findings or document a narrow technical reason. Document unavoidable wildcard permissions and manual console actions.
- Prefer reproducible CDK changes. Do not make an undocumented console change or deploy before the owner reviews the exact `cdk diff`.
