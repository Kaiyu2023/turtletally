#!/usr/bin/env bash
set -euo pipefail

# Every root and module is validated and tested the same way: credential-free,
# with a mocked provider, and plan-only. AGENTS.md forbids a default check that
# could apply anything.

mode="${1:-all}"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

directories=(
  infra
  infra/bootstrap
  infra/environment
  infra/modules/application
  infra/modules/data
  infra/modules/edge
  infra/modules/identity
  infra/modules/mcp
  infra/modules/observability
)

for directory in "${directories[@]}"; do
  echo "==> $directory"
  terraform -chdir="$directory" init -backend=false -input=false -lockfile=readonly >/dev/null

  if [[ "$mode" != "test" ]]; then
    terraform -chdir="$directory" validate
  fi

  if [[ "$mode" != "validate" ]] && compgen -G "$directory/tests/*.tftest.hcl" >/dev/null; then
    terraform -chdir="$directory" test
  fi
done
