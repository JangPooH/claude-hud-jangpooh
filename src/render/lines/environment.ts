import type { RenderContext } from '../../types.js';
import { label, dim, claudeOrange, yellow, purple, dimClaudeOrange, dimYellow, dimPurple } from '../colors.js';

const ANSI_STRIP_RE = /\x1b\[[0-9;]*m/g;
const ENV_MAX_WIDTH = 120;

function stripAnsi(s: string): string {
  return s.replace(ANSI_STRIP_RE, '');
}

// Word-wrap a single part (which may contain ANSI codes) at word boundaries.
function wordWrapPart(part: string, maxWidth: number): string[] {
  if (stripAnsi(part).length <= maxWidth) return [part];

  const words = part.split(' ');
  const result: string[] = [];
  let current = '';
  let currentPlain = '';

  for (const word of words) {
    const wordPlain = stripAnsi(word);
    const candidate = current ? `${current} ${word}` : word;
    const candidatePlain = currentPlain ? `${currentPlain} ${wordPlain}` : wordPlain;

    if (candidatePlain.length > maxWidth && current) {
      result.push(current);
      current = word;
      currentPlain = wordPlain;
    } else {
      current = candidate;
      currentPlain = candidatePlain;
    }
  }
  if (current) result.push(current);
  return result;
}

export function renderEnvironmentLine(ctx: RenderContext): string | null {
  const display = ctx.config?.display;

  if (display?.showConfigCounts === false) {
    return null;
  }

  const totalCounts = ctx.claudeMdCount + ctx.rulesCount + ctx.mcpCount + ctx.hooksCount + ctx.plugins.length;
  const threshold = display?.environmentThreshold ?? 0;

  if (totalCounts === 0 || totalCounts < threshold) {
    return null;
  }

  const parts: string[] = [];

  if (ctx.claudeMdFiles.length > 0) {
    const fileParts = ctx.claudeMdFiles.filter(file => file.tokens > 0).map(file => {
      const count = file.tokens >= 1000
        ? `${(file.tokens / 1000).toFixed(1)}k`
        : `${file.tokens}`;
      return `${file.displayPath} (${count})`;
    });
    if (fileParts.length > 0) parts.push(`Mem: ${dim(fileParts.join(', '))}`);
  }

  if (ctx.rulesCount > 0) {
    const g = ctx.globalRulesCount;
    const p = ctx.parentRulesCount;
    const l = ctx.localRulesCount;
    const segments: string[] = [];
    if (g > 0) segments.push(claudeOrange(String(g)));
    if (p > 0) segments.push(purple(String(p)));
    if (l > 0) segments.push(yellow(String(l)));
    const rulesLabel = segments.length > 0
      ? `${segments.join('+')} rules`
      : `${ctx.rulesCount} rules`;
    let rulesPart = rulesLabel;
    if (ctx.matchedRulesFiles.length > 0) {
      const fileLabels = ctx.matchedRulesFiles.map(f =>
        f.scope === 'global' ? dimClaudeOrange(f.name)
        : f.scope === 'parent' ? dimPurple(f.name)
        : dimYellow(f.name)
      );
      rulesPart += ` ${fileLabels.join(' ')}`;
    }
    parts.push(rulesPart);
  }

  if (ctx.mcpCount > 0) {
    parts.push(`${ctx.mcpCount} MCPs`);
  }

  if (ctx.hooksCount > 0) {
    parts.push(`${ctx.hooksCount} hooks`);
  }

  if (ctx.plugins.length > 0) {
    const list = ctx.plugins.map(p => `${p.name}(${p.scopes.join(', ')})`).join(', ');
    parts.push(`Plugins: ${dim(list)}`);
  }

  if (parts.length === 0) {
    return null;
  }

  const colors = ctx.config?.colors;
  const outputLines: string[] = [];
  let currentGroup: string[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      outputLines.push(label(currentGroup.join(' | '), colors));
      currentGroup = [];
    }
  };

  for (const part of parts) {
    // If this part alone exceeds the limit, word-wrap it independently
    if (stripAnsi(part).length > ENV_MAX_WIDTH) {
      flushGroup();
      for (const wrapped of wordWrapPart(part, ENV_MAX_WIDTH)) {
        outputLines.push(label(wrapped, colors));
      }
      continue;
    }

    // Try adding to current group
    const candidate = [...currentGroup, part].join(' | ');
    if (stripAnsi(label(candidate, colors)).length > ENV_MAX_WIDTH && currentGroup.length > 0) {
      flushGroup();
      currentGroup = [part];
    } else {
      currentGroup.push(part);
    }
  }

  flushGroup();

  return outputLines.length > 0 ? outputLines.join('\n') : null;
}
