---
paths:
  - "src/transcript.ts"
---

## transcript JSONL 파싱 데이터

- `tool_use` blocks → tool name, input, start time
- `tool_result` blocks → completion, duration
- Running tools = `tool_use` without matching `tool_result`
- `TodoWrite` calls → todo list
- `Task` calls → agent info
