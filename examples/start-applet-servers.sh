#!/usr/bin/env bash
set -euo pipefail
examples_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$examples_dir/scripts/applet-servers.mjs" all "$@"
