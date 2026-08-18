# Security policy

## Reporting a vulnerability

Do not open a public issue or pull request for a suspected vulnerability, credential exposure, or sensitive-data leak.

Use [GitHub private vulnerability reporting](https://github.com/Kaiyu2023/turtletally/security/advisories/new). Include only the minimum reproduction details and replace any real financial or credential material with synthetic placeholders.

If a credential may have been exposed, revoke or rotate it immediately before attempting history cleanup. Removing a value from Git does not invalidate copies in clones, forks, caches, logs, or artifacts.

## Supported versions

Turtle Tally is pre-release software and must not be used with live financial data yet. Security fixes currently apply only to the latest commit on the default branch.

## Design documentation

See the [threat model](docs/threat-model.md) for application trust boundaries and residual risks, and the [repository security policy](docs/security/repository-policy.md) for source-control, credential, and incident-response rules.
