import type { RenderContext } from '../types.js';
export declare function formatTokens(n: number): string;
export declare function formatResetTime(resetAt: Date | null): string;
export declare function formatUsagePercent(percent: number | null, colors?: RenderContext['config']['colors']): string;
export declare function formatUsageWindowPart({ label: windowLabel, percent, resetAt, timePercent, colors, usageBarEnabled, barWidth, forceLabel, }: {
    label: '5h' | '7d';
    percent: number | null;
    resetAt: Date | null;
    timePercent?: number | null;
    colors?: RenderContext['config']['colors'];
    usageBarEnabled: boolean;
    barWidth: number;
    forceLabel?: boolean;
}): string;
//# sourceMappingURL=format-utils.d.ts.map