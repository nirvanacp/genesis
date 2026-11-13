#!/bin/sh
# Installs the Genesis git hooks. Run once per clone, from the main checkout:
#   sh tools/git-hooks/install.sh
#
# post-checkout goes into the root repository. reference-transaction and pre-push, with the
# branch name rule they share, go into the root and every nested repository at any depth. Worktrees share their repository's hooks, so they
# need no install of their own. Existing hooks of the same name are replaced.

hooks=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$hooks" rev-parse --show-toplevel) || exit 1

# Links one hook into the hooks directory of the repository at $1.
link() {
  target=$(git -C "$1" rev-parse --path-format=absolute --git-path hooks) || return
  mkdir -p "$target"
  ln -sf "$hooks/$2" "$target/$2"
  echo "installed $2 in $1"
}

# Installs the branch name hooks in the repository at $1 and in its nested repositories.
install_tree() {
  link "$1" reference-transaction
  link "$1" pre-push
  # Nested repositories are usually ignored, and the untracked listing stops at the
  # first untracked folder, so read the ignored listing too, as post-checkout does.
  {
    git -C "$1" -c core.quotePath=false ls-files --others --directory
    git -C "$1" -c core.quotePath=false ls-files --others --ignored --exclude-standard --directory
  } | sort -u | while IFS= read -r entry; do
    case "$entry" in */) ;; *) continue ;; esac
    entry=${entry%/}
    [ -e "$1/$entry/.git" ] && install_tree "$1/$entry"
  done
}

link "$root" post-checkout
install_tree "$root"
