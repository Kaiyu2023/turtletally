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
    .terraform/*|*/.terraform/*|*.tfstate|*.tfstate.*|plan|*/plan|tfplan|*/tfplan|*.tfplan|*.tfplan.*|plan.json|*/plan.json|tfplan.json|*/tfplan.json|*.plan.json|override.tf|*/override.tf|override.tf.json|*/override.tf.json|*_override.tf|*_override.tf.json|*.tfvars|*.tfvars.json|backend.hcl|*/backend.hcl|backend.*.hcl|*/backend.*.hcl|crash.log|*/crash.log|crash.*.log|*/crash.*.log|.terraformrc|*/.terraformrc|terraform.rc|*/terraform.rc)
      return 0
      ;;
  esac

  return 1
}

for forbidden_path in \
  infra/terraform.tfstate \
  infra/terraform.tfstate.backup \
  infra/plan \
  infra/tfplan \
  private-plan.tfplan \
  plan.json \
  infra/override.tf \
  infra/override.tf.json \
  infra/local_override.tf \
  infra/local_override.tf.json \
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

# UK sort code, a sort code followed by an account number, and a UK IBAN.
# Amounts and ISO dates do not match these shapes.
bank_pattern='(^|[^0-9-])[0-9]{2}-[0-9]{2}-[0-9]{2}([^0-9-]|$)|\bGB[0-9]{2}[A-Z]{4}[0-9]{14}\b|\b[A-Z]{2}[0-9]{2}([[:space:]][A-Z0-9]{4}){3,7}\b'

if matches="$(git grep --cached -I -l -E "$secret_pattern" -- . 2>/dev/null)" && [[ -n "$matches" ]]; then
  echo "Possible secret material found in tracked files:" >&2
  echo "$matches" >&2
  failure=1
fi

if matches="$(git grep --cached -I -l -E "$bank_pattern" -- . 2>/dev/null)" && [[ -n "$matches" ]]; then
  echo "Possible bank identifier found in tracked files:" >&2
  echo "$matches" >&2
  failure=1
fi

# Luhn-valid 13-19 digit runs. A regex alone flags any long number, so the
# check digit is what separates a card number from an identifier or amount.
find_card_numbers() {
  awk '
    function luhn(digits,    index_, position, digit, sum, double) {
      sum = 0
      double = 0
      for (index_ = length(digits); index_ >= 1; index_--) {
        digit = substr(digits, index_, 1) + 0
        if (double) {
          digit *= 2
          if (digit > 9) digit -= 9
        }
        sum += digit
        double = !double
      }
      return sum % 10 == 0
    }
    {
      line = $0
      gsub(/[ -]/, "", line)
      while (match(line, /[0-9]{13,19}/)) {
        candidate = substr(line, RSTART, RLENGTH)
        if (luhn(candidate)) {
          print FILENAME ": possible card number"
          nextfile
        }
        line = substr(line, RSTART + RLENGTH)
      }
    }
  ' "$@" 2>/dev/null
}

while IFS= read -r tracked_path; do
  case "$tracked_path" in
    package-lock.json|*/package-lock.json|*.lock.hcl|Cargo.lock|*.png|*.jpg|*.jpeg|*.pdf|*.ico)
      continue
      ;;
  esac
  [[ -f "$tracked_path" ]] || continue
  if card_hit="$(find_card_numbers "$tracked_path")" && [[ -n "$card_hit" ]]; then
    echo "$card_hit" >&2
    failure=1
  fi
done < <(git ls-files)

# History mode. The scans above see only the current tree, so anything
# committed and later deleted stays invisible to them.
if [[ "${1:-}" == "--history" ]]; then
  range="${2:-origin/main..HEAD}"
  if git rev-parse "$range" >/dev/null 2>&1; then
    added="$(git log -p --no-color "$range" -- . | grep -E '^\+' || true)"
    if [[ -n "$added" ]] && printf '%s\n' "$added" | grep -q -E "$secret_pattern|$bank_pattern"; then
      echo "Possible secret or bank identifier introduced in $range." >&2
      failure=1
    fi
    if [[ -n "$added" ]] && printf '%s\n' "$added" | find_card_numbers - | grep -q .; then
      echo "Possible card number introduced in $range." >&2
      failure=1
    fi
  else
    echo "History range $range is not available; skipping the history scan." >&2
  fi
fi

if [[ "$failure" -ne 0 ]]; then
  echo "Repository security check failed. Do not commit or push." >&2
  exit 1
fi

echo "Repository security check passed."
