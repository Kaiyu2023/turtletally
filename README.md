<p align="center">
  <img src="assets/brand/turtle-tally.png" alt="Turtle Tally turtle marking a ledger" width="260">
</p>

# Turtle Tally

Turtle Tally is a privacy-first, single-owner personal finance application for tracking transactions, budgets, scheduled entries, receipts, and monthly summaries.

The implemented product surface is currently a browser-only UI draft. It uses visibly synthetic fixtures and an in-memory mock API, so every change resets when the page reloads. The repository also contains credential-free Rust and Terraform foundations plus their security design records, but no backend or AWS resources. It is not ready for real financial data or production use.

## UI draft

The React and TypeScript draft includes:

- monthly overview, spending comparisons, budgets, and upcoming schedules;
- searchable and filterable transactions with create, edit, receipt, and void flows;
- monthly budgets and reusable defaults;
- recurring and one-time schedules;
- statement preview and deliberate, idempotent mock import;
- account and category management with deactivation instead of hard deletion;
- British English and Simplified Chinese with an API-backed user language preference;
- responsive mobile navigation, reduced-motion support, and accessible controls.

Each route keeps orchestration, presentation components, and styles together in its own folder. Repeated controls with the same semantics live in the shared component layer.

The production-oriented [user preferences API](docs/api/user-preferences.md) keeps locale ownership and persistence on the authenticated server rather than in browser storage.

## Conversational access

The MCP ingress authenticates with the protocol's own OAuth 2.1 bearer tokens and publishes the metadata a client discovers from a refusal ([ADR 0011](docs/architecture/0011-model-independent-mcp-ingress.md)), so any specification-compliant assistant can connect and nothing in the server knows which model is behind it. Each assistant gets its own registered client, its own revocation, and its own review before live data. Every change it can make is a preview the owner reads and a commit that applies exactly that proposal, once.

## Rust crates

`crates/domain` expresses the same domain in Rust for the backend, `crates/application` holds the use cases both ingresses call, `crates/storage` implements their ports against DynamoDB and S3, `crates/auth` holds the browser session and token verification, and `crates/app-api` and `crates/mcp-api` are the two deployable binaries: validation, version checks, deactivation rules, cursor-paged reads, monthly rollup maintenance, schedule runs, and receipt grants. The domain and application crates know nothing about AWS; storage, transport, and authentication are ports, and an in-memory store implements them for the tests. [ADR 0010](docs/architecture/0010-dynamodb-key-design.md) fixes the key design the storage crate builds. The TypeScript contract remains the source of truth ([ADR 0008](docs/architecture/0008-typescript-owns-the-domain-contract.md)), and conformance is proven by data rather than code generation: `npm run contract:vector` exports the mock's fixtures and its derived aggregates to `crates/domain/tests/conformance-vector.json`, and `cargo test` deserialises that vector, re-derives every figure, and asserts identical minor-unit results. A field added on one side without the other fails a test instead of reaching production.

Use `?scenario=empty` on any route to review the first-use state.

## Talking to a server

The browser talks to the deployed API when the build names one, and to the in-memory mock when it does not:

```sh
VITE_API_BASE=/ npm run build --workspace @turtle-tally/web
```

Nothing decides this at runtime, so a draft build cannot reach a real ledger by accident. Against a server the browser sends its session cookie, echoes the confirmation token from the readable cookie beside it on every mutation, and sends the owner to the sign-in route when the session ends. Statement import has no server behind it yet ([ADR 0009](docs/architecture/0009-v1-deployment-scope.md)) and refuses rather than failing obscurely.

## Local development

Node.js 22.22.1, Rust 1.98.0, and Terraform 1.15.9 are pinned in the repository. Install Rust through `rustup` so `rust-toolchain.toml` can select the pinned compiler and ARM64 target. Install Terraform and the two pinned Rust security tools before running the complete check suite:

```sh
cargo install cargo-audit --version 0.22.2 --locked
cargo install cargo-deny --version 0.20.2 --locked
npm ci --ignore-scripts
npm run hooks:install
npx playwright install chromium
npm run dev:web
```

`npm run hooks:install` points Git at the tracked `.githooks` directory. Until it is run the pre-commit secret scan does not execute, and `npm ci --ignore-scripts` means no install step can do it for you.

Open <http://127.0.0.1:4173>. The UI makes no third-party requests and writes no finance data to browser storage.

## Checks

```sh
npm run check
```

The root check covers the repository secret scan, formatting, linting, type checks, unit, browser, and Terraform tests, dependency audits, builds, and a credential-free Terraform plan that must contain no changes.

Vitest covers the domain contract in `apps/web/src/data` and runs on its own with `npm run test:node`; it also fails when the committed conformance vector no longer matches the contract. Playwright runs the browser behaviour and accessibility suite in desktop and mobile Chromium. `cargo test` covers the Rust domain crate and its conformance against that vector. Visual-review captures are written to the ignored `artifacts/ui-draft` directory and can be refreshed with `npm run screenshots`.

## Security posture

- Never commit credentials, tokens, real statements, receipts, account identifiers, or live financial data.
- Local AWS access will use IAM Identity Center/SSO and temporary credentials kept outside this repository.
- Long-lived AWS access keys are forbidden, including in GitHub Actions secrets.
- Any future GitHub-to-AWS deployment must use a short-lived, least-privilege OIDC role and a protected environment.
- Terraform state, backups, saved plans, variable files, and outputs are sensitive and must not enter source control, pull requests, CI artifacts, or logs; the provider lockfile is intentionally committed.
- Only synthetic fixtures are permitted in source control.

See [SECURITY.md](SECURITY.md) for reporting and [the repository security policy](docs/security/repository-policy.md) for the full rules.

## Infrastructure

`scripts/package-functions.sh` builds and packages the two functions for ARM64. `infra` holds the resource-free foundation, a separately gated `bootstrap` root for the state store, an `environment` root that is one deployable stack per stage, and the modules they compose. Every check runs without credentials: validation, mocked plan-only tests, and a pinned configuration scanner. [The deployment runbook](docs/operations/deployment.md) is the order a first deployment follows; nothing in it has been run, and no AWS resource exists.

## Architecture and operations

- [Architecture decision records](docs/architecture/README.md) explain the runtime, session, data, ingress, MCP write, contract, scope, and Terraform state boundaries.
- [Roadmap](docs/roadmap.md) defines the milestone vocabulary used across the repository.
- [AGENTS.md](AGENTS.md) holds the repository rules, security boundaries, and the human approval gates automation must not cross.
- [API conventions](docs/api/conventions.md) apply to every endpoint; the [user preferences API](docs/api/user-preferences.md) is the worked example.
- [Threat model](docs/threat-model.md) records assets, entry points, controls, and residual risks.
- [Manual owner actions](docs/operations/manual-actions.md) identifies the AWS and assistant-connection steps that automation must not cross.
- [Deployment runbook](docs/operations/deployment.md) sequences those steps into a first deployment.

These documents use placeholders and synthetic examples. They do not grant deployment, billing, domain, or live-data approval.

## Ownership and contributions

This is an owner-maintained project. The canonical repository is writable only by its owner and explicitly invited collaborators. Public visibility allows others to read and fork the source, but does not grant write access to this repository.

## License

Turtle Tally is licensed under the [MIT License](LICENSE).
