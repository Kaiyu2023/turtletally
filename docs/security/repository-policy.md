# Repository security policy

## Public-repository boundary

The canonical Turtle Tally repository is publicly readable and forkable. Public visibility never grants write access to the canonical repository: only the owner and explicitly invited collaborators can write. The MIT License allows others to modify their own copies.

No technical system can promise that credentials are "absolutely safe." This repository instead avoids possessing reusable AWS credentials and layers preventive, detective, and recovery controls.

## Access policy

- The repository starts with one owner and no collaborators, deploy keys, bots, or write-enabled apps.
- The default branch blocks force pushes and deletion and requires changes to pass the repository guardrail workflow.
- The Actions token is read-only by default and cannot approve or create pull requests.
- External fork workflows require owner approval.
- Private vulnerability reporting is the only channel for sensitive reports.

An invited collaborator can modify code and workflows. GitHub repository secrets must therefore never be treated as owner-only once a collaborator has write access.

## AWS credential policy

- Root and IAM-user access keys are forbidden.
- Human deployments use MFA-backed IAM Identity Center/SSO sessions from the owner's machine. AWS CLI state stays outside this repository.
- Application workloads use dedicated IAM roles and retrieve runtime secrets from AWS Secrets Manager or SSM SecureString under least-privilege policies.
- GitHub has no AWS access during the initial build.
- If deployment automation is later approved, GitHub Actions must obtain short-lived AWS credentials through OIDC. The IAM trust policy must bind the exact audience and immutable owner/repository identity claim, plus the protected deployment environment or branch. The role must not use `AdministratorAccess`.

## Data policy

Only generated synthetic finance data may enter Git history, issues, pull requests, CI logs, caches, or artifacts. A real statement remains sensitive even after obvious fields are redacted; use it only in an owner-controlled local directory, then create an artificial fixture that preserves the parser shape without preserving real values.

The local working plan is intentionally excluded from the initial public commit because it contains personal banking and detailed architecture information. Publish only a reviewed, sanitized version.

## Terraform artifact policy

Terraform state and backups, saved binary plans and their JSON rendering, crash logs, real variable files, backend configuration, state-command backups, and sensitive outputs must not enter Git history, pull requests, workflow logs, caches, or artifacts. These files can expose values even when the corresponding Terraform declaration marks them sensitive.

Commit the generated `.terraform.lock.hcl` because it records the selected provider versions and checksums. Before any non-bootstrap AWS resource is managed, store state in the approved private, encrypted, versioned, deletion-protected S3 backend with native state locking and a tested restoration path. Backend partial configuration belongs only under the repository-relative `private/terraform/backend/` path; saved plans belong only under `private/terraform/plans/`. Verify the exact target with `git check-ignore` before writing. Plans are reviewed locally and are never public review artifacts.

## Prevention and response

The tracked pre-commit hook and CI job reject common credential formats and sensitive file paths. GitHub secret scanning and push protection provide an additional server-side barrier, but neither scanner is complete and both can be bypassed by an authorized writer.

If sensitive material is exposed:

1. Revoke or rotate the credential or token immediately.
2. Review CloudTrail, GitHub audit/security logs, workflow runs, artifacts, and access grants.
3. Remove the material from the current tree and, where useful, rewrite history.
4. Assume clones, forks, caches, and logs may retain the old value.
5. Record the incident without reproducing the secret.

## Brand asset

`assets/brand/turtle-tally.png` is the original 1254×1254 RGBA icon supplied for the project. Its SHA-256 digest is `be610e4df26f8f40c7ce89822573f5354559bc2b37b593f98777f8657bbbc776`. The original contains C2PA provenance metadata identifying AI-assisted generation; keep this original unchanged when deriving web variants.
