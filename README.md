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

Use `?scenario=empty` on any route to review the first-use state.

## Local development

Node.js 22.22.1, Rust 1.98.0, and Terraform 1.15.8 are pinned in the repository. Install Rust through `rustup` so `rust-toolchain.toml` can select the pinned compiler and ARM64 target. Install Terraform and the two pinned Rust security tools before running the complete check suite:

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

Vitest covers the domain contract in `apps/web/src/data` and runs on its own with `npm run test:node`. Playwright runs the browser behaviour and accessibility suite in desktop and mobile Chromium. The Rust workspace holds no code yet, so `cargo test` compiles an empty crate and asserts nothing. Visual-review captures are written to the ignored `artifacts/ui-draft` directory and can be refreshed with `npm run screenshots`.

## Security posture

- Never commit credentials, tokens, real statements, receipts, account identifiers, or live financial data.
- Local AWS access will use IAM Identity Center/SSO and temporary credentials kept outside this repository.
- Long-lived AWS access keys are forbidden, including in GitHub Actions secrets.
- Any future GitHub-to-AWS deployment must use a short-lived, least-privilege OIDC role and a protected environment.
- Terraform state, backups, saved plans, variable files, and outputs are sensitive and must not enter source control, pull requests, CI artifacts, or logs; the provider lockfile is intentionally committed.
- Only synthetic fixtures are permitted in source control.

See [SECURITY.md](SECURITY.md) for reporting and [the repository security policy](docs/security/repository-policy.md) for the full rules.

## Architecture and operations

- [Architecture decision records](docs/architecture/) explain the runtime, session, data, ingress, MCP write, and Terraform state boundaries.
- [Threat model](docs/threat-model.md) records assets, entry points, controls, and residual risks.
- [Manual owner actions](docs/operations/manual-actions.md) identifies AWS and ChatGPT steps that automation must not cross.

These documents use placeholders and synthetic examples. They do not grant deployment, billing, domain, or live-data approval.

## Ownership and contributions

This is an owner-maintained project. The canonical repository is writable only by its owner and explicitly invited collaborators. Public visibility allows others to read and fork the source, but does not grant write access to this repository.

## License

Turtle Tally is licensed under the [MIT License](LICENSE).
