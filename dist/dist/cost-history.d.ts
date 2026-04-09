import type { TurnCost } from './types.js';
export declare function calcEffectiveInput(inputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, cacheCreation5mTokens?: number, cacheCreation1hTokens?: number): number;
export declare function getCostHistoryPath(transcriptPath: string): string;
export declare function getCostHistoryDetailPath(transcriptPath: string): string;
/** mid 기준 마지막 occurrence만 남김 (mid 없는 항목은 모두 유지) */
export declare function dedupTurnCosts(costs: TurnCost[]): TurnCost[];
/**
 * 첫 statusline 호출 시의 total_cost_usd를 baseline으로 기록.
 * 세션당 한 번만 실행 (ut:0 이미 있으면 no-op).
 *
 * 새 프로세스: total_cost_usd ≈ 0 (첫 API call 비용만큼 미세 오차)
 * /clear (같은 프로세스): total_cost_usd = 누적값 → 정확한 baseline
 */
export declare function writeBaseline(transcriptPath: string, cumNativeCost: number | null, cumApiMs: number | null): void;
export declare function writeCostHistory(transcriptPath: string, turnCosts: TurnCost[], userTurnCount: number, cumNativeCost: number | null, timestamp?: number, fiveHourPct?: number | null, sevenDayPct?: number | null, account?: string | null, accountType?: string | null, cumApiMs?: number | null): void;
//# sourceMappingURL=cost-history.d.ts.map