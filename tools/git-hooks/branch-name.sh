# Genesis branch name rule, shared by the reference-transaction and pre-push hooks.
#
#   main, develop, or <type>/<name>
#   <type>  feat | fix | proto | chore | docs | backup
#   <name>  lowercase letters, digits, '.', '_' and '-', as in feat/website-bar
#
# Names that start with `sudo/` skip the rule.

# Succeeds when branch $1 may be created; otherwise prints why to stderr and fails.
branch_name_allowed() {
  case "$1" in sudo/*) return 0 ;; esac
  printf '%s\n' "$1" | grep -Eq '^(main|develop|(feat|fix|proto|chore|docs|backup)/[a-z0-9._-]+)$' && return 0
  echo "branch name '$1' breaks the Genesis branch rule." >&2
  echo "  Use <type>/<name> with type feat, fix, proto, chore, docs or backup and a name of" >&2
  echo "  lowercase letters, digits, '.', '_' or '-', for example feat/website-bar." >&2
  echo "  Maintainers can skip the rule with a name that starts with sudo/." >&2
  return 1
}
