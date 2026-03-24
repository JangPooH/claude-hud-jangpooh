import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TurnCost } from './types.js';

export function getCostHistoryPath(transcriptPath: string): string {
  const dir = path.dirname(transcriptPath);
  const base = path.basename(transcriptPath, '.jsonl');
  return path.join(dir, `${base}.cost_history`);
}

export function getCostHistoryDetailPath(transcriptPath: string): string {
  const dir = path.dirname(transcriptPath);
  const base = path.basename(transcriptPath, '.jsonl');
  return path.join(dir, `${base}.cost_history_detail`);
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
    fs.writeFileSync(detailPath, JSON.stringify({ ut: 0, ct: 0, i: 0, o: 0, cc: 0, cr: 0, ccst: 0, cum_ncst: cumNativeCost }) + '\n', 'utf8');
  } catch {
    // non-fatal
  }
}

export function writeCostHistory(
  transcriptPath: string,
  turnCosts: TurnCost[],
  userTurnCount: number,
  cumNativeCost: number | null,
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

  // cost_history: per user turn aggregate, rewrite each time
  try {
    const historyPath = getCostHistoryPath(transcriptPath);
    const turnLines = sortedEntries.map(([userTurn, costs]) => {
      const i = costs.reduce((s, t) => s + t.inputTokens, 0);
      const cc = costs.reduce((s, t) => s + t.cacheCreationTokens, 0);
      const cr = costs.reduce((s, t) => s + t.cacheReadTokens, 0);
      return JSON.stringify({
        ut: userTurn,
        ct: costs.length,
        i,
        o: costs.reduce((s, t) => s + t.outputTokens, 0),
        cc,
        cr,
        ei: i + cc * 1.25 + cr * 0.1,
        ccst: costs.reduce((s, t) => s + t.cost, 0),
        ...(cumNativeCost != null ? { cum_ncst: cumNativeCost } : {}),
      });
    });
    fs.writeFileSync(historyPath, turnLines.join('\n') + '\n', 'utf8');
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
          ut: userTurn,
          ct: j + 1,
          m: t.model ?? 'unknown',
          ...(t.userMessage != null ? { req: `UserReq-${t.userMessage.slice(0, 50)}` } : {}),
          ...(t.tools != null ? { tools: t.tools } : {}),
          i: t.inputTokens,
          o: t.outputTokens,
          cc: t.cacheCreationTokens,
          cr: t.cacheReadTokens,
          ei: t.inputTokens + t.cacheCreationTokens * 1.25 + t.cacheReadTokens * 0.1,
          ccst: t.cost,
          ...(cumNativeCost != null ? { cum_ncst: cumNativeCost } : {}),
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
