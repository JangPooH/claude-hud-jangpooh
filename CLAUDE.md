# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.
> This is a personal fork of claude-hud, customized by jangpooh.

## Project Overview

Claude HUD is a Claude Code plugin that displays a real-time multi-line statusline. It shows context health, tool activity, agent status, and todo progress.

## Build Commands

```bash
npm ci               # Install dependencies
npm run build        # Build TypeScript to dist/

# Test with sample stdin data
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000}}' | node dist/index.js
```

## Architecture

### Data Flow

```
Claude Code → stdin JSON → parse → render lines → stdout → Claude Code displays
           ↘ transcript_path → parse JSONL → tools/agents/todos
```

**Key insight**: The statusline is invoked by Claude Code **only while Claude is actively processing a request** (not while the user is idle at the prompt). Each invocation:
1. Receives JSON via stdin (model, context, tokens - native accurate data)
2. Parses the transcript JSONL file for tools, agents, and todos
3. Renders multi-line output to stdout
4. Claude Code displays all lines

**Update timing**:
- While Claude is active: invoked ~every 300ms with fresh stdin data → all values up to date
- While user is idle (typing at prompt): not invoked → display frozen at last render
- Direct invocation (`node dist/index.js`): `stdin.isTTY` is true → `readStdin()` returns null → only prints "Initializing...", no HUD rendered
- Piped invocation with manual JSON: file-based data (git, transcript, config) is read fresh, but stdin-derived data (context %, usage %, model) reflects only what was manually piped

### Data Sources

- **stdin JSON**: model, cost, context window, rate limits → `src/stdin.ts` 참고
- **transcript JSONL**: tool_use/tool_result blocks, TodoWrite, Task → `src/transcript.ts` 참고
- **config files**: MCP count, hooks count (`~/.claude/settings.json`), rules count (CLAUDE.md files)

### File Structure

```
src/
├── index.ts           # Entry point
├── stdin.ts           # Parse Claude's JSON input
├── transcript.ts      # Parse transcript JSONL
├── config-reader.ts   # Read MCP/rules configs
├── config.ts          # Load/validate user config
├── git.ts             # Git status (branch, dirty, ahead/behind)
├── types.ts           # TypeScript interfaces
└── render/
    ├── index.ts       # Main render coordinator
    ├── session-line.ts   # Compact mode: single line with all info
    ├── tools-line.ts     # Tool activity (opt-in)
    ├── agents-line.ts    # Agent status (opt-in)
    ├── todos-line.ts     # Todo progress (opt-in)
    ├── colors.ts         # ANSI color helpers
    └── lines/
        ├── index.ts      # Barrel export
        ├── project.ts    # Line 1: model bracket + project + git
        ├── identity.ts   # Line 2a: context bar
        ├── usage.ts      # Line 2b: usage bar (combined with identity)
        └── environment.ts # Config counts (opt-in)
```

### Output Format & Context Thresholds

→ `src/render/**/*.ts` 참고 (출력 포맷, 컬러 임계값 상세)

## Plugin Configuration

The plugin manifest is in `.claude-plugin/plugin.json` (metadata only).

**StatusLine configuration** must be added to `~/.claude/settings.json` via `/claude-hud:setup`.

Note: `statusLine` is NOT a valid plugin.json field. → `.claude-plugin/` 참고

## Dependencies

- **Runtime**: Node.js 18+ or Bun
- **Build**: TypeScript 5, ES2022 target, NodeNext modules
