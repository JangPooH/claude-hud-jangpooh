import * as fs from 'node:fs';
import * as path from 'node:path';
export function calcEffectiveInput(inputTokens, cacheCreationTokens, cacheReadTokens, cacheCreation5mTokens, cacheCreation1hTokens) {
    if (cacheCreation5mTokens !== undefined && cacheCreation1hTokens !== undefined && cacheCreation5mTokens + cacheCreation1hTokens > 0) {
        return inputTokens + cacheCreation5mTokens * 1.25 + cacheCreation1hTokens * 2.0 + cacheReadTokens * 0.1;
    }
    return inputTokens + cacheCreationTokens * 1.25 + cacheReadTokens * 0.1;
}
function roundCost(v) { return v.toFixed(8); }
function roundEi(v) { return v.toFixed(1); }
function historyBasePath(transcriptPath, suffix) {
    const dir = path.dirname(transcriptPath);
    const base = path.basename(transcriptPath, '.jsonl');
    return path.join(dir, `${base}.${suffix}`);
}
export function getCostHistoryPath(transcriptPath) {
    return historyBasePath(transcriptPath, 'cost_history');
}
export function getCostHistoryDetailPath(transcriptPath) {
    return historyBasePath(transcriptPath, 'cost_history_detail');
}
/** mid 기준 마지막 occurrence만 남김 (mid 없는 항목은 모두 유지) */
export function dedupTurnCosts(costs) {
    const lastIdx = new Map();
    for (let i = 0; i < costs.length; i++) {
        const mid = costs[i].messageId;
        if (mid)
            lastIdx.set(mid, i);
    }
    return costs.filter((t, i) => !t.messageId || lastIdx.get(t.messageId) === i);
}
function rateLimitFields(fiveHourPct, sevenDayPct) {
    return {
        ...(fiveHourPct != null ? { u5m: fiveHourPct } : {}),
        ...(sevenDayPct != null ? { u1w: sevenDayPct } : {}),
    };
}
/**
 * 첫 statusline 호출 시의 total_cost_usd를 baseline으로 기록.
 * 세션당 한 번만 실행 (ut:0 이미 있으면 no-op).
 *
 * 새 프로세스: total_cost_usd ≈ 0 (첫 API call 비용만큼 미세 오차)
 * /clear (같은 프로세스): total_cost_usd = 누적값 → 정확한 baseline
 */
export function writeBaseline(transcriptPath, cumNativeCost, cumApiMs) {
    const detailPath = getCostHistoryDetailPath(transcriptPath);
    try {
        if (fs.existsSync(detailPath)) {
            const content = fs.readFileSync(detailPath, 'utf8');
            const hasBaseline = content.split('\n').some((line) => {
                if (!line.trim())
                    return false;
                try {
                    return JSON.parse(line)['ut'] === 0;
                }
                catch {
                    return false;
                }
            });
            if (hasBaseline)
                return;
        }
        fs.writeFileSync(detailPath, JSON.stringify({ ut: 0, ct: 0, ccst: 0, cum_ncst: cumNativeCost, cum_api_ms: cumApiMs, o: 0, i: 0, cc: 0, cc5m: 0, cc1h: 0, cr: 0 }) + '\n', 'utf8');
    }
    catch {
        // non-fatal
    }
}
export function writeCostHistory(transcriptPath, turnCosts, userTurnCount, cumNativeCost, timestamp, fiveHourPct, sevenDayPct, account, accountType, cumApiMs) {
    if (!transcriptPath || turnCosts.length === 0)
        return;
    // Group turnCosts by userTurn (preserving order)
    const byUserTurn = new Map();
    for (const [i, t] of turnCosts.entries()) {
        const ut = t.userTurn ?? i + 1;
        if (!byUserTurn.has(ut))
            byUserTurn.set(ut, []);
        byUserTurn.get(ut).push(t);
    }
    const sortedEntries = Array.from(byUserTurn.entries()).sort(([a], [b]) => a - b);
    const ts = timestamp != null ? new Date(timestamp).toISOString() : undefined;
    const cumNcst = cumNativeCost != null ? { cum_ncst: roundCost(cumNativeCost) } : {};
    const cumApiMsField = cumApiMs != null ? { cum_api_ms: Math.round(cumApiMs) } : {};
    const rateLimits = rateLimitFields(fiveHourPct, sevenDayPct);
    const accountFields = {
        ...(account != null ? { acct: account } : {}),
        ...(accountType != null ? { acct_t: accountType } : {}),
    };
    // cost_history: per user turn aggregate, rewrite each time
    try {
        const turnLines = sortedEntries.map(([userTurn, costs]) => {
            const deduped = dedupTurnCosts(costs);
            const i = deduped.reduce((s, t) => s + t.inputTokens, 0);
            const cc = deduped.reduce((s, t) => s + t.cacheCreationTokens, 0);
            const cr = deduped.reduce((s, t) => s + t.cacheReadTokens, 0);
            const cc5mTotal = deduped.reduce((s, t) => s + (t.cacheCreation5mTokens ?? 0), 0);
            const cc1hTotal = deduped.reduce((s, t) => s + (t.cacheCreation1hTokens ?? 0), 0);
            const hasCacheBreakdown = deduped.some((t) => t.cacheCreation5mTokens !== undefined);
            const cacheBreakdownFields = hasCacheBreakdown ? { cc5m: cc5mTotal, cc1h: cc1hTotal } : {};
            return JSON.stringify({
                ...(ts != null ? { ts } : {}),
                ut: userTurn,
                ct: deduped.length,
                ccst: roundCost(deduped.reduce((s, t) => s + t.cost, 0)),
                ...cumNcst,
                ...cumApiMsField,
                ei: roundEi(calcEffectiveInput(i, cc, cr, hasCacheBreakdown ? cc5mTotal : undefined, hasCacheBreakdown ? cc1hTotal : undefined)),
                o: deduped.reduce((s, t) => s + t.outputTokens, 0),
                i,
                cc,
                ...cacheBreakdownFields,
                cr,
                ...rateLimits,
                ...accountFields,
            });
        });
        fs.writeFileSync(getCostHistoryPath(transcriptPath), turnLines.join('\n') + '\n', 'utf8');
    }
    catch {
        // non-fatal
    }
    // cost_history_detail: per system turn, append-only
    // rct(raw count): 무조건 증가, dedup 키로 사용
    // ct: mid가 새로울 때만 증가 (unique API call 수)
    try {
        const detailPath = getCostHistoryDetailPath(transcriptPath);
        // 이미 기록된 max(rct), max(ct), seenMids per ut
        const writtenRct = new Map();
        const writtenCt = new Map();
        const writtenMids = new Map();
        try {
            for (const line of fs.readFileSync(detailPath, 'utf8').split('\n')) {
                if (!line.trim())
                    continue;
                try {
                    const e = JSON.parse(line);
                    const ut = e['ut'];
                    if (typeof ut !== 'number' || ut === 0)
                        continue;
                    const rct = e['rct'], ct = e['ct'], mid = e['mid'];
                    if (typeof rct === 'number')
                        writtenRct.set(ut, Math.max(writtenRct.get(ut) ?? 0, rct));
                    if (typeof ct === 'number')
                        writtenCt.set(ut, Math.max(writtenCt.get(ut) ?? 0, ct));
                    if (typeof mid === 'string') {
                        if (!writtenMids.has(ut))
                            writtenMids.set(ut, new Set());
                        writtenMids.get(ut).add(mid);
                    }
                }
                catch { /* skip malformed */ }
            }
        }
        catch { /* file doesn't exist yet */ }
        const newLines = [];
        for (const [userTurn, costs] of sortedEntries) {
            const maxWrittenRct = writtenRct.get(userTurn) ?? 0;
            const seenMids = writtenMids.get(userTurn) ?? new Set();
            let rctCounter = 0;
            let ctCounter = writtenCt.get(userTurn) ?? 0;
            for (const t of costs) {
                rctCounter += 1;
                const mid = t.messageId;
                const isNewMid = !mid || !seenMids.has(mid);
                if (isNewMid) {
                    ctCounter += 1;
                    if (mid)
                        seenMids.add(mid);
                }
                if (rctCounter <= maxWrittenRct)
                    continue; // 이미 기록됨 → skip
                const tCacheBreakdown = t.cacheCreation5mTokens !== undefined
                    ? { cc5m: t.cacheCreation5mTokens, cc1h: t.cacheCreation1hTokens ?? 0 }
                    : {};
                newLines.push(JSON.stringify({
                    ...(ts != null ? { ts } : {}),
                    ut: userTurn,
                    ct: ctCounter,
                    rct: rctCounter,
                    ...(mid != null ? { mid } : {}),
                    m: t.model ?? 'unknown',
                    ccst: roundCost(t.cost),
                    ...cumNcst,
                    ...cumApiMsField,
                    ei: roundEi(calcEffectiveInput(t.inputTokens, t.cacheCreationTokens, t.cacheReadTokens, t.cacheCreation5mTokens, t.cacheCreation1hTokens)),
                    o: t.outputTokens,
                    i: t.inputTokens,
                    cc: t.cacheCreationTokens,
                    ...tCacheBreakdown,
                    cr: t.cacheReadTokens,
                    ...rateLimits,
                    ...accountFields,
                    ...(t.userMessage != null ? { req: `UserReq-${t.userMessage.slice(0, 50)}` } : {}),
                    ...(t.tools != null ? { tools: t.tools } : {}),
                }));
            }
        }
        if (newLines.length > 0) {
            fs.appendFileSync(detailPath, newLines.join('\n') + '\n', 'utf8');
        }
    }
    catch {
        // non-fatal
    }
}
//# sourceMappingURL=cost-history.js.map