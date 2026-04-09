import type { HudColorOverrides } from '../config.js';
export declare const RESET = "\u001B[0m";
export declare function green(text: string): string;
export declare function yellow(text: string): string;
export declare function red(text: string): string;
export declare function cyan(text: string): string;
export declare function magenta(text: string): string;
export declare function dim(text: string): string;
/** Returns a brighter version of the given ANSI color code via HSL L +33%. */
export declare function bright(ansiColor: string): string;
/**
 * Returns dimRgb(color) if HSL L >= 0.5, otherwise brightRgb(color).
 * Ensures the time marker always visually contrasts with surrounding filled bars.
 */
export declare function dimOrBright(ansiColor: string): string;
export declare function brightBlue(text: string): string;
export declare function dimCyan(text: string): string;
export declare function dimBrightBlue(text: string): string;
export declare function dimClaudeOrange(text: string): string;
export declare function purple(text: string): string;
export declare function dimPurple(text: string): string;
export declare function dimYellow(text: string): string;
export declare function claudeOrange(text: string): string;
export declare function model(text: string, modelName?: string, colors?: Partial<HudColorOverrides>): string;
export declare function dimModel(text: string, modelName?: string, colors?: Partial<HudColorOverrides>): string;
export declare function project(text: string, colors?: Partial<HudColorOverrides>): string;
export declare function git(text: string, colors?: Partial<HudColorOverrides>): string;
export declare function gitBranch(text: string, colors?: Partial<HudColorOverrides>): string;
export declare function label(text: string, colors?: Partial<HudColorOverrides>): string;
export declare function custom(text: string, colors?: Partial<HudColorOverrides>): string;
export declare function warning(text: string, colors?: Partial<HudColorOverrides>): string;
export declare function critical(text: string, colors?: Partial<HudColorOverrides>): string;
export declare function getContextColor(percent: number, colors?: Partial<HudColorOverrides>): string;
export declare function getQuotaColor(percent: number, colors?: Partial<HudColorOverrides>): string;
export declare function quotaBar(percent: number, width?: number, colors?: Partial<HudColorOverrides>): string;
export declare function quotaBarWithTime(percent: number, timePercent: number, width?: number, colors?: Partial<HudColorOverrides>): string;
export declare function coloredBar(percent: number, width?: number, colors?: Partial<HudColorOverrides>): string;
//# sourceMappingURL=colors.d.ts.map