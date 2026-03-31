import { dim } from './colors.js';
import { dedupTurnCosts } from '../cost-history.js';
export function renderTurnCounterLine(ctx) {
    const raw = ctx.transcript.turnCosts;
    if (!raw || raw.length === 0) {
        return null;
    }
    const turnCosts = dedupTurnCosts(raw);
    const rawTurns = turnCosts.map((t, i) => t.userTurn ?? i + 1);
    const minUserTurn = Math.min(...rawTurns);
    const currentUserTurn = Math.max(...rawTurns);
    const normalizedTurn = currentUserTurn - minUserTurn + 1;
    const curClaudeTurns = turnCosts.filter((t, i) => (t.userTurn ?? i + 1) === currentUserTurn).length;
    const totalClaudeTurns = turnCosts.length;
    return `Turn ${normalizedTurn}-${curClaudeTurns} ${dim(`(tot ${totalClaudeTurns})`)}`;
}
//# sourceMappingURL=turn-counter-line.js.map