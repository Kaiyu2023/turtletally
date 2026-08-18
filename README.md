<p align="center">
  <img src="assets/brand/turtle-tally.png" alt="Turtle Tally turtle marking a ledger" width="260">
</p>

# Turtle Tally

Turtle Tally is a privacy-first, single-owner personal finance application for tracking transactions, budgets, scheduled entries, receipts, and monthly summaries.

The repository currently contains a full browser-only UI draft. It uses visibly synthetic fixtures and an in-memory mock API, so every change resets when the page reloads. It is not ready for real financial data or production use.

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

Node.js 22.12 or newer and npm are required.

```sh
npm ci
npx playwright install chromium
npm run dev:web
```

Open <http://127.0.0.1:4173>. The UI makes no third-party requests and writes no finance data to browser storage.

## Checks

```sh
npm run typecheck
npm run format:check
npm run lint
npm run build
npm run test:e2e
npm run screenshots
npm audit
./scripts/check-repository-secrets.sh
```

Playwright runs the behavior and accessibility suite in desktop and mobile Chromium. Visual-review captures are written to the ignored `artifacts/ui-draft` directory.

## Security posture

- Never commit credentials, tokens, real statements, receipts, account identifiers, or live financial data.
- Local AWS access will use IAM Identity Center/SSO and temporary credentials kept outside this repository.
- Long-lived AWS access keys are forbidden, including in GitHub Actions secrets.
- Any future GitHub-to-AWS deployment must use a short-lived, least-privilege OIDC role and a protected environment.
- Only synthetic fixtures are permitted in source control.

See [SECURITY.md](SECURITY.md) for reporting and [the repository security policy](docs/security/repository-policy.md) for the full rules.

## Ownership and contributions

This is an owner-maintained project. The canonical repository is writable only by its owner and explicitly invited collaborators. Public visibility allows others to read and fork the source, but does not grant write access to this repository.

## License

Turtle Tally is licensed under the [MIT License](LICENSE).
