import type { RenderContext } from '../../types.js';
import { label, dim, claudeOrange, yellow, dimClaudeOrange, dimYellow } from '../colors.js';

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
    const fileParts = ctx.claudeMdFiles.map(file => {
      const count = file.tokens >= 1000
        ? `${(file.tokens / 1000).toFixed(1)}k`
        : `${file.tokens}`;
      return `${file.displayPath} (${count})`;
    });
    parts.push(`Mem: ${dim(fileParts.join(', '))}`);
  }

  if (ctx.rulesCount > 0) {
    let rulesLabel: string;
    if (ctx.globalRulesCount > 0 && ctx.localRulesCount > 0) {
      rulesLabel = `${claudeOrange(String(ctx.globalRulesCount))}+${yellow(String(ctx.localRulesCount))} rules`;
    } else if (ctx.globalRulesCount > 0) {
      rulesLabel = `${claudeOrange(String(ctx.rulesCount))} rules`;
    } else {
      rulesLabel = `${yellow(String(ctx.rulesCount))} rules`;
    }
    let rulesPart = rulesLabel;
    if (ctx.matchedRulesFiles.length > 0) {
      const fileLabels = ctx.matchedRulesFiles.map(f =>
        f.scope === 'global' ? dimClaudeOrange(f.name) : dimYellow(f.name)
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

  return label(parts.join(' | '), ctx.config?.colors);
}
