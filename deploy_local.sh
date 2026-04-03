#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(node -p "require('$SCRIPT_DIR/package.json').version")"
CACHE_DIR="$HOME/.claude/plugins/cache/claude-hud/claude-hud/$VERSION"
CONFIG_DIR="$HOME/.claude/plugins/claude-hud"

if [ ! -d "$CACHE_DIR" ]; then
  echo "Cache dir not found: $CACHE_DIR"
  echo "Run 'claude plugin install claude-hud' first."
  exit 1
fi

npm run build --prefix "$SCRIPT_DIR"
rm -rf "$CACHE_DIR/dist"
cp -r "$SCRIPT_DIR/dist" "$CACHE_DIR/dist"
echo "Deployed v$VERSION -> $CACHE_DIR/dist/"

# Remove skills registration from cached plugin.json
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('$CACHE_DIR/.claude-plugin/plugin.json', 'utf8'));
  delete p.commands;
  fs.writeFileSync('$CACHE_DIR/.claude-plugin/plugin.json', JSON.stringify(p, null, 2) + '\n');
"
echo "Skills removed from cached plugin.json"

# Sync personal config
if [ -f "$SCRIPT_DIR/config.personal.json" ]; then
  mkdir -p "$CONFIG_DIR"
  cp "$SCRIPT_DIR/config.personal.json" "$CONFIG_DIR/config.json"
  echo "Config synced -> $CONFIG_DIR/config.json"
fi
