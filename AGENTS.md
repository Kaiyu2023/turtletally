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

## Required checks

- Before implementation, read `finance-app-implementation-plan.md` completely when it is present locally. It is intentionally untracked; never stage or publish it without a reviewed, sanitized replacement.
- Run `./scripts/check-repository-secrets.sh` before every commit.
- Keep dependencies and GitHub Actions pinned and review updates before merging.
- Once implementation scaffolding exists, run the repository's format, lint, test, audit, build, and `cdk synth` checks before merging.
- Keep sensitive request and response bodies out of logs and test output.

## Working practices

- Work on a feature branch and merge through a pull request. Never push directly to protected `main`.
- Make small, reviewable commits.
- Treat security controls and stop conditions as product requirements.
- Keep public documentation free of personal bank details, account IDs, domains, email addresses, and other unnecessary identifying information.
- Preserve unrelated user changes and never use destructive Git commands without explicit authorization.
