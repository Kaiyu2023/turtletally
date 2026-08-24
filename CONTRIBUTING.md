# Contributing

Turtle Tally is currently maintained by its owner. Unsolicited feature pull requests are not being accepted during the initial build. Explicitly invited collaborators may work through protected branches and pull requests.

Public forks are permitted by the MIT License, but they do not grant write access to the canonical repository.

Never include real financial information, statements, receipts, credentials, tokens, private keys, account identifiers, production configuration, or sensitive logs in an issue, discussion, commit, pull request, or Actions artifact. Use synthetic data only.

## Working on a change

Run `npm run hooks:install` once after cloning so the pre-commit secret scan executes. Work on a feature branch and merge through a pull request; `main` is protected and is never pushed to directly. Run `npm run check` before opening a pull request, and keep commits small and reviewable.

[AGENTS.md](AGENTS.md) holds the full repository rules, including the security boundaries and the human approval gates that automation must not cross.

Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
