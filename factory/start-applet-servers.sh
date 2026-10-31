#!/usr/bin/env bash
set -euo pipefail
factory_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$factory_dir/scripts/applet-servers.mjs" all "$@"
