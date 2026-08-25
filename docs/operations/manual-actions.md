# Manual owner actions and human gates

This checklist records actions that Terraform or automation must not perform autonomously. Completing an item authorises only that item; it does not authorise a later gate, paid feature, production deployment, or live-data connection.

Keep account numbers, profile names, domains, callback URLs, email addresses, certificates, tokens, recovery material, and financial samples out of this tracked file. Record only a date, outcome, and redacted evidence reference. Interactive credentials remain on the owner's device.

## Rules for every AWS change

- Use MFA-backed IAM Identity Center credentials. Do not create root or IAM-user access keys.
- Resolve the intended root configuration, backend key, profile, account, region, stage, variable file, Terraform version, and provider lock revision explicitly; fail closed on a missing or mismatched value.
- Run the locked checks, verify the exact target is ignored with `git check-ignore`, save the plan only under the repository-relative `private/terraform/plans/` path, and show the complete plan locally before an apply. Do not publish plan files or plan JSON.
- Bind approval to the exact plan checksum, commit, root, backend key, identity, region, stage, inputs, Terraform version, and provider lock. Replanning or changing any bound value invalidates approval.
- Apply only the exact approved saved plan. Never use an unsaved automatic apply, `-auto-approve`, or `-lock=false` with shared state.
- Obtain separate owner approval for backend work, state operations, import or adoption, replacement or deletion, certificate or DNS changes, paid features, production apply, and teardown as applicable.
- Make infrastructure changes through Terraform unless this document identifies an unavoidable console action.
- Never run `terraform destroy` or apply a destroy plan against production. A production plan that deletes or replaces a protected resource is a stop condition until its backup, retention, migration, and rollback procedure receives explicit approval.
- Treat state, backups, saved plans and their JSON forms, crash logs, variable files, and outputs as sensitive. Keep them out of source control, pull requests, CI artifacts, and logs.

## Account and billing gate

Owner actions:

- [ ] Reconfirm current AWS account-plan and CloudFront flat-rate terms in the official documentation.
- [ ] Register or select the intended AWS account on the **Paid account plan**, not the time-limited Free account plan.
- [ ] Secure root with two phishing-resistant factors where AWS permits, remove access keys, and store recovery details offline.
- [ ] Configure alternate account contacts, billing access, and billing notifications.
- [ ] Enable IAM Identity Center and create a least-privilege deployment permission set and local SSO profile.
- [ ] Create and confirm budget alerts at the approved thresholds.

Evidence required before infrastructure work: the owner confirms the account-plan choice, root and SSO controls, budget notifications, intended primary region, and local deployment context. Do not record their identifying values here.

## Domain, certificates, and Terraform state gate

Owner actions:

- [ ] Choose or register the production domain after considering the stable passkey relying-party identity.
- [ ] Approve Route 53 delegation or records and certificate validation changes in each required region.
- [ ] Approve a separate state-bootstrap root using restricted ignored local state for the exact account, region, and profile.
- [ ] Approve backend configuration only under the repository-relative `private/terraform/backend/` path after verifying each exact path is ignored.
- [ ] Approve a private S3 state bucket with encryption, Block Public Access, TLS-only access, versioning, Terraform `prevent_destroy`, least-privilege permissions, and native S3 lockfiles.
- [ ] Confirm routine roles deny bucket and state-object deletion while permitting deletion only of the `.tflock` objects required for normal unlocking.
- [ ] Approve migration of the bootstrap state into that backend, distinct keys for each stage and root, and removal of the superseded local copy only after version restoration is successfully drilled.
- [ ] Approve each sandbox or production saved plan separately; a prior approval does not cover a regenerated or changed plan.
- [ ] Approve every import, state move or removal, provider replacement, state restoration, removed-resource operation, and force-unlock separately after an encrypted backup and proof that no other writer is active.

Automation prepares commands and redacts captured output. No domain, account identifier, or profile name belongs in tracked examples.

## CloudFront plan and WAF console gate

The CloudFront flat-rate subscription and its bundled WAF association may require console actions that Terraform does not control.

Owner actions:

- [ ] Confirm that the account and distribution remain eligible for the selected flat-rate plan.
- [ ] Subscribe the intended distribution to the approved plan.
- [ ] Confirm the attached WAF rules fit within the plan and that advanced bot, account-takeover, Pro, or other paid add-ons are disabled.
- [ ] Capture a redacted plan/WAF confirmation and recheck it before production cutover.

Stop if eligibility, included protections, logging limitations, or price differ from the approved design.

## Cognito and browser-authentication gate

Owner actions:

- [ ] Approve the Cognito domain, exact browser redirect and logout URLs, no-public-signup settings, and administrator-only recovery design.
- [ ] Enrol a synced platform passkey and an independent hardware passkey.
- [ ] Store the long random recovery password and TOTP seed separately and offline.
- [ ] Test both passkeys, password-plus-TOTP recovery, session revocation, and catastrophic administrator recovery with synthetic data.
- [ ] Revoke the recovery test session and confirm no factor or token appears in logs or tracked evidence.

Do not weaken passkey or recovery settings merely to satisfy a managed-login default.

## MCP client compatibility gate

The proof is client-neutral (ADR 0011). Run it with whichever assistant is to be
connected first, and run it again for each additional one; registration and
revocation are per client.

Owner or workspace-administrator actions, for each assistant:

- [ ] Confirm the assistant's workspace or account permits a private connector.
- [ ] Review retention, training, sharing, connector, and administrator settings before any connection.
- [ ] Supply the exact callback URL the assistant shows through an approved local channel and register only that value on that assistant's own Cognito client.
- [ ] Perform interactive Cognito login and consent.
- [ ] Approve a connection to synthetic data only for the compatibility proof.

The proof must demonstrate all of the following before MCP work continues:

1. The client discovers the protected-resource metadata from an unauthenticated response.
2. The client uses its own pre-registered client and exact callback.
3. Cognito accepts authorization and token requests, including the OAuth resource value.
4. The access token carries the expected audience and scope claims, and the ingress refuses a token that carries neither.
5. The ingress refuses a request with no token at all, and answers it with the address of the metadata document.
6. A minimal read-only synthetic summary tool succeeds.
7. A mutation requires a preview and a commit, and a replayed commit is refused.

Record which client and version was proven. Stop on any failure. Preserve only a redacted protocol shape. A custom OAuth adapter, reused browser client, or weakened token binding requires a new design and explicit owner approval.

## Imports and live-data gates

Owner actions:

- [ ] For a supported bank parser, provide a locally controlled redacted sample and confirm column and debit/credit interpretation.
- [ ] Before live MCP access, review every exposed field, scope, tool description, limit, annotation, and preview/commit confirmation.
- [ ] Confirm each assistant's workspace policy again and explicitly authorise the live-data connection, one assistant at a time.

A real statement must not enter source control, issues, pull requests, logs, or CI. Create a wholly synthetic fixture before committing parser tests. No assistant receives raw statement objects or receipt binaries in version 1.

## Recovery, alerts, and security-review gate

Owner actions:

- [ ] Confirm alert-topic subscriptions and receive a test alarm.
- [ ] Complete browser-session and MCP-client revocation drills.
- [ ] Complete DynamoDB point-in-time and S3 object-version restore drills, then remove temporary restored data safely.
- [ ] Complete hardware-key loss and offline recovery drills.
- [ ] Review IAM findings, dependency reports, the finished threat model, one week of estimated or actual cost, and remaining residual risks.

Do not proceed while a recovery path is untested, an alert is unconfirmed, or a high or critical security finding remains unresolved.

## Production deployment and assistant connection gate

Owner actions:

- [ ] Review and approve the final production saved plan locally, including its checksum, root, backend key, named account, profile, region, stage, inputs, dependency order, DNS cutover, and rollback procedure.
- [ ] Authorise production deployment and CloudFront plan association as separate actions.
- [ ] Perform the final passkey login and production smoke checks.
- [ ] Review each assistant's consent and explicitly authorise its production MCP connection after the web application is stable.
- [ ] Run a fresh detailed-exit-code plan and confirm it reports no changes; confirm billing contains no unexpected paid service.

Production approval does not authorise destructive cleanup. Any later infrastructure, scope, callback, workspace-policy, or live-data change returns to the corresponding gate.

## Evidence record

For each completed gate, add a dated, redacted entry to the private living plan containing:

- the gate and approved scope;
- the checks or drill performed and their outcome;
- the saved-plan checksum and configuration version reviewed;
- remaining risks or follow-up date.

Never include credentials, account or resource identifiers, domains, callback URLs, financial values, statement rows, receipt details, or raw request and response bodies.
