# Deployment runbook

What it takes to put this repository into an account, in the order it has to
happen. Every step marked as a gate is an owner action that automation must not
perform; [the manual actions register](manual-actions.md) holds the checklist and
the evidence rules, and this document holds the sequence.

Nothing here has been run. No AWS resource exists, and this runbook is what a
first deployment follows rather than a record of one.

## Before anything is created

1. **Account and billing gate.** Complete the account, root protection, IAM
   Identity Center, and budget items in the manual actions register.
2. **Decide the domains.** The application domain also fixes the passkey
   relying-party identity, which cannot change later without invalidating every
   enrolled passkey. The MCP ingress uses a different name
   ([ADR 0004](../architecture/0004-separate-browser-and-mcp-ingress.md)).
3. **Record the monthly cost ceiling.** The environment root refuses a ceiling of
   zero, because a placeholder is not a control
   ([ADR 0009](../architecture/0009-v1-deployment-scope.md)).
4. **Prove the assistant gate cheaply.** [ADR 0011](../architecture/0011-model-independent-mcp-ingress.md)
   makes the MCP compatibility proof client-neutral, so it runs in a sandbox
   against a disposable domain before any irreversible spend.

## State

1. Apply the `bootstrap` root with restricted local state, under the domain,
   certificate, and state gate.
2. Migrate that state into the bucket it created, prove a version restoration,
   and remove the superseded local copy — each its own approval.
3. Write the backend partial configuration under `private/terraform/backend/`
   after `git check-ignore` confirms the exact path is ignored.

## Build what is deployed

```sh
npm run check                 # the single gate: every check this repository has
./scripts/package-functions.sh
VITE_API_BASE=/ npm run build --workspace @turtle-tally/web
```

The packaging script builds both functions for ARM64 and writes each as a ZIP
containing its binary named `bootstrap`, which is what `provided.al2023` runs. It
writes under `private/artifacts` and refuses to run if that path is not ignored.
Artifacts are inputs to a plan and are never committed.

## Apply a stage

1. `terraform -chdir=infra/environment init` with the backend configuration for
   the stage's own key.
2. `terraform -chdir=infra/environment plan -out private/terraform/plans/<stage>.tfplan`
   with the reviewed variable file, after confirming the path is ignored.
3. Read the plan locally, in full. Approval binds to that exact plan, commit,
   root, backend key, identity, region, stage, inputs, Terraform version, and
   provider lock; changing any of them invalidates it.
4. Apply only that saved plan. Never `-auto-approve`, never an unsaved plan.
5. Upload the built application to the site bucket the root outputs, and
   invalidate the distribution.
6. Point DNS at the distribution and the MCP domain target, both of which the
   root outputs.

## Turn it on

1. **Cognito gate.** Create the single owner, enrol both passkeys, store the
   recovery material offline, and test recovery and revocation with synthetic
   data.
2. **Sign in** to the deployed application and confirm the session, a mutation,
   and a sign-out end to end.
3. **Register one assistant.** Create its client with the exact callback it
   shows, run the compatibility proof against synthetic data, and record which
   client and version was proven. Repeat per assistant; each is registered,
   reviewed, and revoked on its own.
4. **Recovery and alerts gate.** Confirm the alert subscription, receive a test
   alarm, and complete the point-in-time and object-version restore drills.
5. **Production gate.** Only then does live data enter, and only after the final
   plan reports no changes and billing shows no unexpected service.

## What is not deployed by this

Statement import is a later milestone ([the roadmap](../roadmap.md)). The browser
draft's import screens run against the in-memory mock, and the deployed client
refuses those calls rather than failing obscurely.

The scheduler worker is deployed and runs daily, but it needs the owner's Cognito
subject as an input, which does not exist until the owner is created. Apply the
stage, create the owner, then set `owner_subject` and apply again.

## If something is wrong

Stop. A production plan that deletes or replaces a protected resource is a stop
condition until its backup, retention, migration, and rollback procedure is
approved. `terraform destroy` against production is never run. Rolling back is a
new reviewed plan, not an undo.
