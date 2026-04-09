import { label, dim, claudeOrange, yellow, purple, dimClaudeOrange, dimYellow, dimPurple } from '../colors.js';
export function renderEnvironmentLine(ctx) {
    const display = ctx.config?.display;
    if (display?.showConfigCounts === false) {
        return null;
    }
    const totalCounts = ctx.claudeMdCount + ctx.rulesCount + ctx.mcpCount + ctx.hooksCount + ctx.plugins.length;
    const threshold = display?.environmentThreshold ?? 0;
    if (totalCounts === 0 || totalCounts < threshold) {
        return null;
    }
    const parts = [];
    if (ctx.claudeMdFiles.length > 0) {
        const fileParts = ctx.claudeMdFiles.filter(file => file.tokens > 0).map(file => {
            const count = file.tokens >= 1000
                ? `${(file.tokens / 1000).toFixed(1)}k`
                : `${file.tokens}`;
            return `${file.displayPath} (${count})`;
        });
        if (fileParts.length > 0)
            parts.push(`Mem: ${dim(fileParts.join(', '))}`);
    }
    if (ctx.rulesCount > 0) {
        const g = ctx.globalRulesCount;
        const p = ctx.parentRulesCount;
        const l = ctx.localRulesCount;
        const segments = [];
        if (g > 0)
            segments.push(claudeOrange(String(g)));
        if (p > 0)
            segments.push(purple(String(p)));
        if (l > 0)
            segments.push(yellow(String(l)));
        const rulesLabel = segments.length > 0
            ? `${segments.join('+')} rules`
            : `${ctx.rulesCount} rules`;
        let rulesPart = rulesLabel;
        if (ctx.matchedRulesFiles.length > 0) {
            const fileLabels = ctx.matchedRulesFiles.map(f => f.scope === 'global' ? dimClaudeOrange(f.name)
                : f.scope === 'parent' ? dimPurple(f.name)
                    : dimYellow(f.name));
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
//# sourceMappingURL=environment.js.map