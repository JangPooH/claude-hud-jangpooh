import type { RenderContext } from '../../types.js';
import { label, dim, RESET } from '../colors.js';

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

  const last = turnCosts[turnCosts.length - 1];
  const turnCostStr = formatCost(last.cost);
  const turnIn = formatTokens(last.inputTokens + last.cacheReadTokens + last.cacheCreationTokens);
  const turnOut = formatTokens(last.outputTokens);

  const sessionCost = ctx.transcript.sessionCost;
  const userTurns = ctx.transcript.userTurnCount;
  const sessionIn = formatTokens(turnCosts.reduce((s, t) => s + t.inputTokens + t.cacheReadTokens + t.cacheCreationTokens, 0));
  const sessionOut = formatTokens(turnCosts.reduce((s, t) => s + t.outputTokens, 0));

  const turnPart = `Turn ${turnCostStr} ${dim(`(↑${turnIn}, ↓${turnOut})`)}`;
  const sessionPart = `Session ${formatCost(sessionCost)} ${dim(`(${userTurns} turns, ↑${sessionIn}, ↓${sessionOut})`)}`;

  return `${costLabel} ${turnPart} / ${sessionPart}`;
}
