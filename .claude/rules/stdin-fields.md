---
paths:
  - "src/stdin.ts"
---

## stdin JSON 데이터 필드 (Native, 정확)

> stdin의 전체 JSON 구조가 궁금한 경우 `./stdin-sample.json` 참고 (프로젝트 루트에 샘플 저장됨).
> 런타임에는 `{hudPluginDir}/stdin-sample.json`에도 매 실행마다 overwrite 저장됨.

- `session_id` - 세션 UUID
- `model.id` / `model.display_name` - 현재 모델
- `cost.total_cost_usd` - 세션 누적 비용 (native, 정확)
- `cost.total_duration_ms` - 세션 총 시간
- `context_window.current_usage` - 현재 턴 token counts
- `context_window.total_input_tokens` / `total_output_tokens` - 세션 누적 토큰
- `context_window.context_window_size` - max context
- `context_window.used_percentage` - 컨텍스트 사용률 (v2.1.6+)
- `transcript_path` - 세션 transcript 경로

## Rate Limits 필드

- `rate_limits.five_hour.used_percentage` - 5-hour subscriber usage percentage
- `rate_limits.five_hour.resets_at` - 5-hour reset timestamp
- `rate_limits.seven_day.used_percentage` - 7-day subscriber usage percentage
- `rate_limits.seven_day.resets_at` - 7-day reset timestamp

## 호출 동작

- Direct invocation (`node dist/index.js`): `stdin.isTTY` is true → `readStdin()` returns null → only prints "Initializing...", no HUD rendered
- Piped invocation with manual JSON: file-based data (git, transcript, config) is read fresh, but stdin-derived data (context %, usage %, model) reflects only what was manually piped
