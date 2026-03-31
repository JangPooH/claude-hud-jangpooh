import * as fs from 'node:fs';
import { label, dim, brightBlue, cyan } from '../colors.js';
import { getCostHistoryDetailPath, calcEffectiveInput, dedupTurnCosts } from '../../cost-history.js';
import { formatTokens } from '../format-utils.js';
function formatCost(cost) {
    if (cost < 0.0001)
        return '$0.00';
    if (cost < 0.001)
        return `$${cost.toFixed(5)}`;
    if (cost < 0.01)
        return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
}
// cost_history의 cum_ncst/cum_api_ms는 매 render마다 현재 stdin 값으로 덮어써지므로 차이가 항상 0.
// append-only인 cost_history_detail에서 ut < currentUserTurn인 마지막 항목을 읽어야 정확한 이전 턴 값을 얻을 수 있음.
function readCostHistoryState(transcriptPath, currentUserTurn) {
    let baselineCumNcst = null;
    let prevTurnCumNcst = null;
    let baselineCumApiMs = null;
    let prevTurnCumApiMs = null;
    try {
        const detailContent = fs.readFileSync(getCostHistoryDetailPath(transcriptPath), 'utf8');
        for (const line of detailContent.split('\n')) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const ut = entry['ut'];
                const rawNcst = entry['cum_ncst'];
                const rawApiMs = entry['cum_api_ms'];
                // cum_ncst는 writeBaseline(숫자)과 writeCostHistory(roundCost→문자열) 두 경로로 저장됨
                const cumNcst = typeof rawNcst === 'number' ? rawNcst : typeof rawNcst === 'string' ? parseFloat(rawNcst) : NaN;
                const cumApiMs = typeof rawApiMs === 'number' ? rawApiMs : typeof rawApiMs === 'string' ? parseFloat(rawApiMs) : NaN;
                if (ut === 0) {
                    if (!isNaN(cumNcst))
                        baselineCumNcst = cumNcst;
                    if (!isNaN(cumApiMs))
                        baselineCumApiMs = cumApiMs;
                }
                // 마지막으로 덮어쓰면 해당 ut의 마지막(최신) 항목이 남음
                if (typeof ut === 'number' && ut > 0 && ut < currentUserTurn) {
                    if (!isNaN(cumNcst))
                        prevTurnCumNcst = cumNcst;
                    if (!isNaN(cumApiMs))
                        prevTurnCumApiMs = cumApiMs;
                }
            }
            catch { /* skip malformed */ }
        }
    }
    catch { /* non-fatal */ }
    // 이전 userTurn이 없으면 baseline을 기준으로 사용
    if (prevTurnCumNcst === null)
        prevTurnCumNcst = baselineCumNcst;
    if (prevTurnCumApiMs === null)
        prevTurnCumApiMs = baselineCumApiMs;
    return { baselineCumNcst, prevTurnCumNcst, baselineCumApiMs, prevTurnCumApiMs };
}
function formatApiDuration(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}
export function renderCostLine(ctx) {
    const display = ctx.config?.display;
    if (display?.showCost === false) {
        return null;
    }
    const rawTurnCosts = ctx.transcript.turnCosts;
    if (!rawTurnCosts || rawTurnCosts.length === 0) {
        return null;
    }
    const turnCosts = dedupTurnCosts(rawTurnCosts);
    const colors = ctx.config?.colors;
    const costLabel = label('💰', colors);
    // Current user turn aggregate
    const currentUserTurn = Math.max(...turnCosts.map((t, i) => t.userTurn ?? i + 1));
    const currentTurnCosts = turnCosts.filter((t, i) => (t.userTurn ?? i + 1) === currentUserTurn);
    const turnCcst = currentTurnCosts.reduce((s, t) => s + t.cost, 0);
    const turnEi = currentTurnCosts.reduce((s, t) => s + calcEffectiveInput(t.inputTokens, t.cacheCreationTokens, t.cacheReadTokens), 0);
    const turnOut = currentTurnCosts.reduce((s, t) => s + t.outputTokens, 0);
    // Session aggregate
    const sessCcst = turnCosts.reduce((s, t) => s + t.cost, 0);
    const sessEi = turnCosts.reduce((s, t) => s + calcEffectiveInput(t.inputTokens, t.cacheCreationTokens, t.cacheReadTokens), 0);
    const sessOut = turnCosts.reduce((s, t) => s + t.outputTokens, 0);
    // Native cost: NET = session total from baseline, [+] = this turn's increment
    let netPart = '';
    let turnApiDuration = '';
    let sessApiDuration = '';
    const currentCumNcst = ctx.stdin.cost?.total_cost_usd ?? null;
    const currentCumApiMs = ctx.stdin.cost?.total_api_duration_ms ?? null;
    const transcriptPath = ctx.stdin.transcript_path;
    if (transcriptPath && (currentCumNcst != null || currentCumApiMs != null)) {
        const { baselineCumNcst, prevTurnCumNcst, baselineCumApiMs, prevTurnCumApiMs } = readCostHistoryState(transcriptPath, currentUserTurn);
        if (currentCumNcst != null) {
            const netCost = baselineCumNcst != null ? currentCumNcst - baselineCumNcst : null;
            const turnDiff = prevTurnCumNcst != null ? currentCumNcst - prevTurnCumNcst : null;
            const netStr = netCost != null ? brightBlue(formatCost(netCost)) : '';
            const diffStr = turnDiff != null ? cyan(`[+${formatCost(turnDiff)}]`) : '';
            if (netStr || diffStr) {
                netPart = ` / NET ${netStr}${diffStr ? ` ${diffStr}` : ''}`;
            }
        }
        if (currentCumApiMs != null) {
            const turnMs = prevTurnCumApiMs != null ? currentCumApiMs - prevTurnCumApiMs : currentCumApiMs;
            const sessMs = baselineCumApiMs != null ? currentCumApiMs - baselineCumApiMs : currentCumApiMs;
            if (turnMs >= 0)
                turnApiDuration = `, ${formatApiDuration(turnMs)}`;
            if (sessMs >= 0)
                sessApiDuration = `, ${formatApiDuration(sessMs)}`;
        }
    }
    const userTurns = ctx.transcript.userTurnCount;
    const curClaudeTurns = currentTurnCosts.length;
    const totalClaudeTurns = turnCosts.length;
    const turnPrefix = `#${userTurns}${dim(`:${curClaudeTurns}(~${totalClaudeTurns})`)}`;
    const turnPart = `Turn ${cyan(formatCost(turnCcst))} ${dim(cyan(`(↑${formatTokens(Math.round(turnEi))}, ↓${formatTokens(turnOut)}${turnApiDuration})`))}`;
    const sessPart = `Session ${brightBlue(formatCost(sessCcst))} ${dim(brightBlue(`(${userTurns} turns, ↑${formatTokens(Math.round(sessEi))}, ↓${formatTokens(sessOut)}${sessApiDuration})`))}`;
    return `${costLabel} ${turnPart} / ${sessPart}${netPart}`;
}
//# sourceMappingURL=cost.js.map