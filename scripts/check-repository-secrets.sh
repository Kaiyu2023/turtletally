#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

failure=0

while IFS= read -r tracked_path; do
  case "$tracked_path" in
    .env.example|*/.env.example)
      ;;
    .env|*/.env|.env.*|*/.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|id_rsa*|*/id_rsa*|id_ed25519*|*/id_ed25519*|*/credentials|credentials)
      echo "Forbidden sensitive path is tracked: $tracked_path" >&2
      failure=1
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
