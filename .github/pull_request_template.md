## Summary

Describe the change and its intended effect.

## Security checklist

- [ ] Only synthetic test data is included.
- [ ] No credentials, tokens, private keys, production identifiers, statements, receipts, or sensitive logs are included.
- [ ] No Terraform state, backups, saved plans or plan JSON, real variable/backend files, crash logs, or sensitive outputs are included.
- [ ] Third-party dependencies and Actions are pinned and reviewed.
- [ ] `./scripts/check-repository-secrets.sh` passes.
- [ ] Relevant format, lint, test, audit, build, and infrastructure checks pass.
- [ ] Terraform changes include credential-free validation and security evidence; no plan or apply output containing sensitive values is attached.
- [ ] No production deployment or destructive infrastructure action is included.
