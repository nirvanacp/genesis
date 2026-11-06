#!/usr/bin/env bash
set -euo pipefail
applet_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$applet_dir/../scripts/applet-servers.mjs" applet "$applet_dir" "$@"
