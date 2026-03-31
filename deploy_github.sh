#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_BRANCH="$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD)"
SOURCE_BRANCH="${1:-dev}"
DEPLOY_BRANCH="deploy"
WORKTREE_DIR="$SCRIPT_DIR/deploy"

if [ "$CURRENT_BRANCH" != "$SOURCE_BRANCH" ]; then
  echo "Error: must be on '$SOURCE_BRANCH' branch (currently on '$CURRENT_BRANCH')"
  exit 1
fi

cleanup() {
  git -C "$SCRIPT_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo "Building..."
npm run build --prefix "$SCRIPT_DIR"

echo "Setting up worktree for '$DEPLOY_BRANCH'..."
if git -C "$SCRIPT_DIR" show-ref --quiet "refs/heads/$DEPLOY_BRANCH"; then
  git -C "$SCRIPT_DIR" worktree add "$WORKTREE_DIR" "$DEPLOY_BRANCH"
else
  echo "Branch '$DEPLOY_BRANCH' not found, creating from '$SOURCE_BRANCH'..."
  git -C "$SCRIPT_DIR" worktree add -b "$DEPLOY_BRANCH" "$WORKTREE_DIR" "$SOURCE_BRANCH"
fi

echo "Merging '$SOURCE_BRANCH'..."
git -C "$WORKTREE_DIR" merge "$SOURCE_BRANCH" --no-edit

echo "Force-adding dist/..."
cp -r "$SCRIPT_DIR/dist" "$WORKTREE_DIR/dist"
git -C "$WORKTREE_DIR" add -f "$WORKTREE_DIR/dist"

if git -C "$WORKTREE_DIR" diff --cached --quiet; then
  echo "No changes in dist/ to commit."
else
  git -C "$WORKTREE_DIR" commit -m "build: sync dist from $SOURCE_BRANCH"
fi

echo "Done. '$DEPLOY_BRANCH' branch is up to date with dist/ included."
