#!/usr/bin/env bash
set -euo pipefail

# ADR 0006 requires a configuration security scanner once the first AWS resource
# exists. Findings are fixed, or narrowed and explained in `.trivyignore`; they
# are never silenced by lowering the threshold.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! command -v trivy >/dev/null 2>&1; then
  echo "trivy is not installed. See infra/README.md for the pinned version." >&2
  exit 1
fi

trivy config \
  --severity MEDIUM,HIGH,CRITICAL \
  --exit-code 1 \
  --ignorefile .trivyignore \
  --tf-exclude-downloaded-modules \
  infra
