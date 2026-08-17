<p align="center">
  <img src="assets/brand/turtle-tally.png" alt="Turtle Tally turtle marking a ledger" width="260">
</p>

# Turtle Tally

Turtle Tally is a privacy-first, single-owner personal finance application for tracking transactions, budgets, scheduled entries, receipts, and monthly summaries.

The project is in its initial planning and security-bootstrap phase. It is not ready for real financial data or production use.

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
