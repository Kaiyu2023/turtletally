#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

failure=0

is_forbidden_terraform_artifact() {
  local tracked_path="$1"

  case "$tracked_path" in
    .terraform.lock.hcl|*/.terraform.lock.hcl|*.tfvars.example|*.tfvars.json.example|backend.example.hcl|*/backend.example.hcl|backend.*.example.hcl|*/backend.*.example.hcl)
      return 1
      ;;
    .terraform/*|*/.terraform/*|*.tfstate|*.tfstate.*|*.tfplan|*.tfplan.*|plan.json|*/plan.json|tfplan.json|*/tfplan.json|*.plan.json|*.tfvars|*.tfvars.json|backend.hcl|*/backend.hcl|backend.*.hcl|*/backend.*.hcl|crash.log|*/crash.log|crash.*.log|*/crash.*.log|.terraformrc|*/.terraformrc|terraform.rc|*/terraform.rc)
      return 0
      ;;
  esac

  return 1
}

for forbidden_path in \
  infra/terraform.tfstate \
  infra/terraform.tfstate.backup \
  private-plan.tfplan \
  plan.json \
  infra/production.tfvars \
  infra/backend.production.hcl \
  infra/.terraform/providers/example \
  infra/crash.1.log; do
  if ! is_forbidden_terraform_artifact "$forbidden_path"; then
    echo "Repository security guard failed its Terraform-path self-test: $forbidden_path" >&2
    exit 1
  fi
done

for allowed_path in \
  infra/.terraform.lock.hcl \
  infra/sandbox.tfvars.example \
  infra/backend.production.example.hcl; do
  if is_forbidden_terraform_artifact "$allowed_path"; then
    echo "Repository security guard rejected an allowed Terraform example: $allowed_path" >&2
    exit 1
  fi
done

while IFS= read -r tracked_path; do
  if is_forbidden_terraform_artifact "$tracked_path"; then
    echo "Forbidden Terraform artifact is tracked: $tracked_path" >&2
    failure=1
    continue
  fi

  case "$tracked_path" in
    .env.example|*/.env.example)
      ;;
    .env|*/.env|.env.*|*/.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|id_rsa*|*/id_rsa*|id_ed25519*|*/id_ed25519*|*/credentials|credentials)
      echo "Forbidden sensitive path is tracked: $tracked_path" >&2
      failure=1
      ;;
    apps/web/src/pages/imports/*.ts|apps/web/src/pages/imports/*.tsx|apps/web/src/pages/imports/*.css)
      ;;
    private/*|*/private/*|local-data/*|*/local-data/*|receipts/*|*/receipts/*|imports/*|*/imports/*|statements/*|*/statements/*|*/fixtures/private/*)
      echo "Private-data path is tracked: $tracked_path" >&2
      failure=1
      ;;
  esac
done < <(git ls-files)

secret_pattern='(AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN ([A-Z0-9]+ )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|aws_secret_access_key[[:space:]]*=[[:space:]]*[^[:space:]<][^[:space:]]{15,}'

if matches="$(git grep --cached -I -l -E "$secret_pattern" -- . 2>/dev/null)" && [[ -n "$matches" ]]; then
  echo "Possible secret material found in tracked files:" >&2
  echo "$matches" >&2
  failure=1
fi

if ! git diff --cached --check; then
  failure=1
fi

if [[ "$failure" -ne 0 ]]; then
  echo "Repository security check failed. Do not commit or push." >&2
  exit 1
fi

echo "Repository security check passed."
