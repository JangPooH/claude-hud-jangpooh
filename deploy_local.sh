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

# Remove skills (commands dirs + plugin.json commands field)
MARKETPLACE_DIR="$HOME/.claude/plugins/marketplaces/claude-hud"
for dir in "$CACHE_DIR" "$MARKETPLACE_DIR"; do
  [ -d "$dir/commands" ] && rm -rf "$dir/commands" && echo "Removed $dir/commands"
  plugin_json="$dir/.claude-plugin/plugin.json"
  if [ -f "$plugin_json" ]; then
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$plugin_json', 'utf8'));
      delete p.commands;
      fs.writeFileSync('$plugin_json', JSON.stringify(p, null, 2) + '\n');
    "
    echo "commands removed from $plugin_json"
  fi
done

# Sync personal config
if [ -f "$SCRIPT_DIR/config.personal.json" ]; then
  mkdir -p "$CONFIG_DIR"
  cp "$SCRIPT_DIR/config.personal.json" "$CONFIG_DIR/config.json"
  echo "Config synced -> $CONFIG_DIR/config.json"
fi
