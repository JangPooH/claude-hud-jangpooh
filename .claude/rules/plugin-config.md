---
paths:
  - ".claude-plugin/**"
---

## 플러그인 설정 규칙

- `.claude-plugin/plugin.json`은 metadata only (name, description, version, author)
- `statusLine`은 plugin.json의 유효한 필드가 **아님** — 반드시 `~/.claude/settings.json`에 설정해야 함
- StatusLine 설정은 `/claude-hud:setup`으로 추가
- 업데이트는 자동 — setup 재실행 불필요
