#!/usr/bin/env bash
set -euo pipefail

# Package each function as the ZIP `provided.al2023` expects: one file named
# `bootstrap`. Artifacts are inputs to a plan and are never committed, so they
# are written under the ignored `private/` path.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

target="aarch64-unknown-linux-gnu"
output_dir="private/artifacts"

if ! git check-ignore --quiet "$output_dir"; then
  echo "$output_dir is not ignored. Refusing to write build output into source control." >&2
  exit 1
fi

cargo build --workspace --release --target "$target" --locked
mkdir -p "$output_dir"

for function_name in app-api mcp-api scheduler-worker; do
  staging="$(mktemp -d)"
  cp "target/$target/release/$function_name" "$staging/bootstrap"
  chmod +x "$staging/bootstrap"
  (cd "$staging" && zip --quiet -X - bootstrap) > "$output_dir/$function_name.zip"
  rm -rf "$staging"
  echo "packaged $output_dir/$function_name.zip"
done
