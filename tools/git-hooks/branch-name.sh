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
  cat >&2 <<EOF
branch name '$1' breaks the Genesis branch rule.

Branch names are main, develop or <type>/<name>:
  <type>  feat    new features and capabilities
          fix     bug fixes
          proto   prototypes and phase work, such as proto/phase-14
          chore   tooling, configuration, guidance and maintenance
          docs    documents and records only
          backup  snapshots of another branch, such as backup/phase-8-3cc5c29
  <name>  lowercase letters, digits, '.', '_' and '-', with no further '/'

Examples: feat/website-bar, fix/session-restore, chore/branch-rules.
Maintainers can skip the rule with a name that starts with sudo/.
EOF
  return 1
}
