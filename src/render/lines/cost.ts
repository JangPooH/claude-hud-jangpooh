import * as fs from 'node:fs';
import type { RenderContext } from '../../types.js';
import { label, dim, brightBlue, cyan, RESET } from '../colors.js';
import { getCostHistoryPath, getCostHistoryDetailPath } from '../../cost-history.js';

function formatCost(cost: number): string {
  if (cost < 0.0001) return '$0.00';
  if (cost < 0.001) return `$${cost.toFixed(5)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface CostHistoryState {
  baselineCumNcst: number | null;
  prevTurnCumNcst: number | null;
}

// cost_history의 cum_ncst는 매 render마다 현재 stdin 값으로 덮어써지므로 차이가 항상 0.
// append-only인 cost_history_detail에서 ut < currentUserTurn인 마지막 항목을 읽어야 정확한 이전 턴 값을 얻을 수 있음.
function readCostHistoryState(transcriptPath: string, currentUserTurn: number): CostHistoryState {
  let baselineCumNcst: number | null = null;
  let prevTurnCumNcst: number | null = null;

  try {
    const detailContent = fs.readFileSync(getCostHistoryDetailPath(transcriptPath), 'utf8');
    for (const line of detailContent.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const ut = entry['ut'];
        const cumNcst = entry['cum_ncst'];
        if (ut === 0 && typeof cumNcst === 'number') {
          baselineCumNcst = cumNcst;
        }
        // 마지막으로 덮어쓰면 해당 ut의 마지막(최신) 항목이 남음
        if (typeof ut === 'number' && ut > 0 && ut < currentUserTurn && typeof cumNcst === 'number') {
          prevTurnCumNcst = cumNcst;
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* non-fatal */ }

  // 이전 userTurn이 없으면 baseline을 기준으로 사용
  if (prevTurnCumNcst === null) {
    prevTurnCumNcst = baselineCumNcst;
  }

  return { baselineCumNcst, prevTurnCumNcst };
}

export function renderCostLine(ctx: RenderContext): string | null {
  const display = ctx.config?.display;
  if (display?.showCost === false) {
    return null;
  }

  const turnCosts = ctx.transcript.turnCosts;
  if (!turnCosts || turnCosts.length === 0) {
    return null;
  }

  const colors = ctx.config?.colors;
  const costLabel = label('💰', colors);

  // Current user turn aggregate
  const currentUserTurn = Math.max(...turnCosts.map((t, i) => t.userTurn ?? i + 1));
  const currentTurnCosts = turnCosts.filter((t, i) => (t.userTurn ?? i + 1) === currentUserTurn);
  const turnCcst = currentTurnCosts.reduce((s, t) => s + t.cost, 0);
  const turnEi = currentTurnCosts.reduce((s, t) => s + t.inputTokens + t.cacheCreationTokens * 1.25 + t.cacheReadTokens * 0.1, 0);
  const turnOut = currentTurnCosts.reduce((s, t) => s + t.outputTokens, 0);

  // Session aggregate
  const sessCcst = turnCosts.reduce((s, t) => s + t.cost, 0);
  const sessEi = turnCosts.reduce((s, t) => s + t.inputTokens + t.cacheCreationTokens * 1.25 + t.cacheReadTokens * 0.1, 0);
  const sessOut = turnCosts.reduce((s, t) => s + t.outputTokens, 0);

  // Native cost: NET = session total from baseline, [+] = this turn's increment
  let netPart = '';
  const currentCumNcst = ctx.stdin.cost?.total_cost_usd ?? null;
  const transcriptPath = ctx.stdin.transcript_path;
  if (currentCumNcst != null && transcriptPath) {
    const { baselineCumNcst, prevTurnCumNcst } = readCostHistoryState(transcriptPath, currentUserTurn);
    const netCost = baselineCumNcst != null ? currentCumNcst - baselineCumNcst : null;
    const turnDiff = prevTurnCumNcst != null ? currentCumNcst - prevTurnCumNcst : null;
    const netStr = netCost != null ? brightBlue(formatCost(netCost)) : '';
    const diffStr = turnDiff != null ? cyan(`[+${formatCost(turnDiff)}]`) : '';
    if (netStr || diffStr) {
      netPart = ` / NET ${netStr}${diffStr ? ` ${diffStr}` : ''}`;
    }
  }

  const turnPart = `Turn ${cyan(formatCost(turnCcst))} ${dim(cyan(`(↑${formatTokens(Math.round(turnEi))}, ↓${formatTokens(turnOut)})`))}`;
  const userTurns = ctx.transcript.userTurnCount;
  const sessPart = `Session ${brightBlue(formatCost(sessCcst))} ${dim(brightBlue(`(${userTurns} turns, ↑${formatTokens(Math.round(sessEi))}, ↓${formatTokens(sessOut)})`))}`;

  return `${costLabel} ${turnPart} / ${sessPart}${netPart}`;
}
