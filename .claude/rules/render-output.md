---
paths:
  - "src/render/**/*.ts"
---

## 출력 포맷 (default expanded layout)

```
[Opus] │ my-project git:(main*)
Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
```

Lines 1-2 always shown. Additional lines are opt-in via config:
- Tools line (`showTools`): ◐ Edit: auth.ts | ✓ Read ×3
- Agents line (`showAgents`): ◐ explore [haiku]: Finding auth code
- Todos line (`showTodos`): ▸ Fix authentication bug (2/5)
- Environment line (`showConfigCounts`): 2 CLAUDE.md | 4 rules

## Context 임계값

| Threshold | Color | Action |
|-----------|-------|--------|
| <30% | Green | Normal |
| 30-49% | Yellow | Warning |
| 50-74% | Orange | Warning |
| >=75% | Red | Show token breakdown |
