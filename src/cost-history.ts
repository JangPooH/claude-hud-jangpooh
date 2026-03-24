import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TurnCost } from './types.js';
import { getHudPluginDir } from './claude-config-dir.js';

export function calcEffectiveInput(inputTokens: number, cacheCreationTokens: number, cacheReadTokens: number): number {
  return inputTokens + cacheCreationTokens * 1.25 + cacheReadTokens * 0.1;
}

function roundCost(v: number): string { return v.toFixed(8); }
function roundEi(v: number): string { return v.toFixed(1); }

function historyBasePath(transcriptPath: string, suffix: string): string {
  const dir = path.dirname(transcriptPath);
  const base = path.basename(transcriptPath, '.jsonl');
  return path.join(dir, `${base}.${suffix}`);
}

export function getCostHistoryPath(transcriptPath: string): string {
  return historyBasePath(transcriptPath, 'cost_history');
}

export function getCostHistoryDetailPath(transcriptPath: string): string {
  return historyBasePath(transcriptPath, 'cost_history_detail');
}

function rateLimitFields(fiveHourPct?: number | null, sevenDayPct?: number | null) {
  return {
    ...(fiveHourPct != null ? { u5m: fiveHourPct } : {}),
    ...(sevenDayPct != null ? { u1w: sevenDayPct } : {}),
  };
}

function readWrittenDetailCount(detailPath: string): Map<number, number> {
  const writtenSystemCounts = new Map<number, number>();
  try {
    const content = fs.readFileSync(detailPath, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (typeof entry['ut'] === 'number' && typeof entry['ct'] === 'number') {
          const prev = writtenSystemCounts.get(entry['ut']) ?? 0;
          writtenSystemCounts.set(entry['ut'], Math.max(prev, entry['ct']));
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file doesn't exist yet
  }
  return writtenSystemCounts;
}

interface SessionState {
  last_transcript_path: string;
  last_total_cost_usd: number;
}

function getSessionStatePath(homeDir: string): string {
  return path.join(getHudPluginDir(homeDir), 'session_state.json');
}

/**
 * Determines the correct baseline cost for the current session and updates the session state.
 *
 * - New session (transcript_path changed or no prior state): baseline = last known cost before this session started.
 * - Same session: baseline is already written; returns currentCostUsd (ignored by writeBaseline's hasBaseline guard).
 *
 * Session state is updated on every invocation so that last_total_cost_usd always reflects
 * the most recent cost seen before a potential /clear.
 */
export function resolveBaseline(
  transcriptPath: string,
  currentCostUsd: number | null,
  homeDir: string,
): number {
  const statePath = getSessionStatePath(homeDir);
  let baseline = 0;

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as SessionState;
    if (state.last_transcript_path !== transcriptPath) {
      // /clear or new session: last known cost before this session is the correct baseline
      baseline = state.last_total_cost_usd ?? 0;
    } else {
      // Same session: writeBaseline will be a no-op (hasBaseline guard), value doesn't matter
      baseline = currentCostUsd ?? 0;
    }
  } catch {
    // No state file yet: first ever session, baseline = 0
    baseline = 0;
  }

  try {
    const newState: SessionState = {
      last_transcript_path: transcriptPath,
      last_total_cost_usd: currentCostUsd ?? 0,
    };
    fs.writeFileSync(statePath, JSON.stringify(newState), 'utf8');
  } catch { /* non-fatal */ }

  return baseline;
}

export function writeBaseline(transcriptPath: string, cumNativeCost: number | null): void {
  const detailPath = getCostHistoryDetailPath(transcriptPath);
  // Check if ut:0 baseline entry already exists (file existence is not enough —
  // writeCostHistory may have created the file before writeBaseline had a chance to run)
  try {
    if (fs.existsSync(detailPath)) {
      const content = fs.readFileSync(detailPath, 'utf8');
      const hasBaseline = content.split('\n').some((line) => {
        if (!line.trim()) return false;
        try { return (JSON.parse(line) as Record<string, unknown>)['ut'] === 0; } catch { return false; }
      });
      if (hasBaseline) return;
    }
    fs.writeFileSync(detailPath, JSON.stringify({ ut: 0, ct: 0, ccst: 0, cum_ncst: cumNativeCost, o: 0, i: 0, cc: 0, cr: 0 }) + '\n', 'utf8');
  } catch {
    // non-fatal
  }
}

export function writeCostHistory(
  transcriptPath: string,
  turnCosts: TurnCost[],
  userTurnCount: number,
  cumNativeCost: number | null,
  timestamp?: number,
  fiveHourPct?: number | null,
  sevenDayPct?: number | null,
): void {
  if (!transcriptPath || turnCosts.length === 0) return;

  // Group turnCosts by userTurn (preserving order)
  const byUserTurn = new Map<number, TurnCost[]>();
  for (const [i, t] of turnCosts.entries()) {
    const ut = t.userTurn ?? i + 1;
    if (!byUserTurn.has(ut)) byUserTurn.set(ut, []);
    byUserTurn.get(ut)!.push(t);
  }

  const sortedEntries = Array.from(byUserTurn.entries()).sort(([a], [b]) => a - b);
  const ts = timestamp != null ? new Date(timestamp).toISOString() : undefined;
  const cumNcst = cumNativeCost != null ? { cum_ncst: roundCost(cumNativeCost) } : {};
  const rateLimits = rateLimitFields(fiveHourPct, sevenDayPct);

  // cost_history: per user turn aggregate, rewrite each time
  try {
    const turnLines = sortedEntries.map(([userTurn, costs]) => {
      const i = costs.reduce((s, t) => s + t.inputTokens, 0);
      const cc = costs.reduce((s, t) => s + t.cacheCreationTokens, 0);
      const cr = costs.reduce((s, t) => s + t.cacheReadTokens, 0);
      return JSON.stringify({
        ...(ts != null ? { ts } : {}),
        ut: userTurn,
        ct: costs.length,
        ccst: roundCost(costs.reduce((s, t) => s + t.cost, 0)),
        ...cumNcst,
        ei: roundEi(calcEffectiveInput(i, cc, cr)),
        o: costs.reduce((s, t) => s + t.outputTokens, 0),
        i,
        cc,
        cr,
        ...rateLimits,
      });
    });
    fs.writeFileSync(getCostHistoryPath(transcriptPath), turnLines.join('\n') + '\n', 'utf8');
  } catch {
    // non-fatal
  }

  // cost_history_detail: per system turn, append-only
  try {
    const detailPath = getCostHistoryDetailPath(transcriptPath);
    const writtenSystemCounts = readWrittenDetailCount(detailPath);
    const newLines: string[] = [];

    for (const [userTurn, costs] of sortedEntries) {
      const writtenCount = writtenSystemCounts.get(userTurn) ?? 0;
      for (let j = writtenCount; j < costs.length; j++) {
        const t = costs[j];
        newLines.push(JSON.stringify({
          ...(ts != null ? { ts } : {}),
          ut: userTurn,
          ct: j + 1,
          m: t.model ?? 'unknown',
          ccst: roundCost(t.cost),
          ...cumNcst,
          ei: roundEi(calcEffectiveInput(t.inputTokens, t.cacheCreationTokens, t.cacheReadTokens)),
          o: t.outputTokens,
          i: t.inputTokens,
          cc: t.cacheCreationTokens,
          cr: t.cacheReadTokens,
          ...rateLimits,
          ...(t.userMessage != null ? { req: `UserReq-${t.userMessage.slice(0, 50)}` } : {}),
          ...(t.tools != null ? { tools: t.tools } : {}),
        }));
      }
    }

    if (newLines.length > 0) {
      fs.appendFileSync(detailPath, newLines.join('\n') + '\n', 'utf8');
    }
  } catch {
    // non-fatal
  }
}
