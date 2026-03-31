export const RESET = '\x1b[0m';
const DEFAULT_TEXT = RESET;
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const BRIGHT_BLUE = '\x1b[94m';
const BRIGHT_MAGENTA = '\x1b[95m';
const CLAUDE_ORANGE = '\x1b[38;5;208m';
const ANSI_BY_NAME = {
    dim: DIM,
    red: RED,
    green: GREEN,
    yellow: YELLOW,
    magenta: MAGENTA,
    cyan: CYAN,
    brightBlue: BRIGHT_BLUE,
    brightMagenta: BRIGHT_MAGENTA,
};
/** Convert a hex color string (#rrggbb) to a truecolor ANSI escape sequence. */
function hexToAnsi(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `\x1b[38;2;${r};${g};${b}m`;
}
/**
 * Resolve a color value to an ANSI escape sequence.
 * Accepts named presets, 256-color indices (0-255), or hex strings (#rrggbb).
 */
function resolveAnsi(value, fallback) {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value === 'number') {
        return `\x1b[38;5;${value}m`;
    }
    if (typeof value === 'string' && value.startsWith('#') && value.length === 7) {
        return hexToAnsi(value);
    }
    return ANSI_BY_NAME[value] ?? fallback;
}
function colorize(text, color) {
    return `${color}${text}${RESET}`;
}
function withOverride(text, value, fallback) {
    return colorize(text, resolveAnsi(value, fallback));
}
export function green(text) {
    return colorize(text, GREEN);
}
export function yellow(text) {
    return colorize(text, YELLOW);
}
export function red(text) {
    return colorize(text, RED);
}
export function cyan(text) {
    return colorize(text, CYAN);
}
export function magenta(text) {
    return colorize(text, MAGENTA);
}
export function dim(text) {
    return colorize(text, DIM);
}
export function brightBlue(text) {
    return colorize(text, BRIGHT_BLUE);
}
export function dimCyan(text) {
    return `${DIM}${CYAN}${text}${RESET}`;
}
export function dimBrightBlue(text) {
    return `${DIM}${BRIGHT_BLUE}${text}${RESET}`;
}
export function dimClaudeOrange(text) {
    return `${DIM}${CLAUDE_ORANGE}${text}${RESET}`;
}
export function dimYellow(text) {
    return `${DIM}${YELLOW}${text}${RESET}`;
}
export function claudeOrange(text) {
    return colorize(text, CLAUDE_ORANGE);
}
export function model(text, colors) {
    return withOverride(text, colors?.model, CYAN);
}
export function project(text, colors) {
    return withOverride(text, colors?.project, YELLOW);
}
export function git(text, colors) {
    return withOverride(text, colors?.git, MAGENTA);
}
export function gitBranch(text, colors) {
    return withOverride(text, colors?.gitBranch, CYAN);
}
export function label(text, colors) {
    return withOverride(text, colors?.label, DEFAULT_TEXT);
}
export function custom(text, colors) {
    return withOverride(text, colors?.custom, CLAUDE_ORANGE);
}
export function warning(text, colors) {
    return colorize(text, resolveAnsi(colors?.warning, YELLOW));
}
export function critical(text, colors) {
    return colorize(text, resolveAnsi(colors?.critical, RED));
}
export function getContextColor(percent, colors) {
    if (percent >= 85)
        return resolveAnsi(colors?.critical, RED);
    if (percent >= 70)
        return resolveAnsi(colors?.warning, YELLOW);
    return resolveAnsi(colors?.context, GREEN);
}
export function getQuotaColor(percent, colors) {
    if (percent >= 90)
        return resolveAnsi(colors?.critical, RED);
    if (percent >= 75)
        return resolveAnsi(colors?.usageWarning, '\x1b[38;5;208m');
    return resolveAnsi(colors?.usage, BLUE);
}
const PARTIAL_CHARS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
function buildBar(percent, width) {
    const exact = (percent / 100) * width;
    const full = Math.floor(exact);
    const partialIdx = Math.round((exact - full) * 8);
    if (partialIdx === 0) {
        return '█'.repeat(full) + DIM + '░'.repeat(width - full);
    }
    if (partialIdx === 8) {
        return '█'.repeat(full + 1) + DIM + '░'.repeat(width - full - 1);
    }
    return '█'.repeat(full) + PARTIAL_CHARS[partialIdx] + DIM + '░'.repeat(width - full - 1);
}
export function quotaBar(percent, width = 10, colors) {
    const safeWidth = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
    const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    const color = getQuotaColor(safePercent, colors);
    return `${color}${buildBar(safePercent, safeWidth)}${RESET}`;
}
function getTimeMarkerColor(percent, colors) {
    // Use a visually adjacent/contrasting color derived from the quota color at this usage level
    if (percent >= 90)
        return resolveAnsi(colors?.critical, '\x1b[91m'); // bright red (quota: red)
    if (percent >= 75)
        return resolveAnsi(colors?.usageWarning, '\x1b[38;5;214m'); // bright orange (quota: orange)
    return resolveAnsi(colors?.usage, CYAN); // cyan (quota: blue)
}
export function quotaBarWithTime(percent, timePercent, width = 10, colors) {
    const safeWidth = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
    const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    const safeTime = Number.isFinite(timePercent) ? Math.min(100, Math.max(0, timePercent)) : 0;
    const usageBlocks = Math.floor((safePercent / 100) * safeWidth);
    // timePos < 0 means no marker (window already expired)
    const timePos = safeTime < 100 ? Math.min(safeWidth - 1, Math.floor((safeTime / 100) * safeWidth)) : -1;
    const color = getQuotaColor(safePercent, colors);
    const markerColor = getTimeMarkerColor(safePercent, colors);
    let result = '';
    for (let i = 0; i < safeWidth; i++) {
        if (i === timePos) {
            if (i < usageBlocks) {
                result += `${markerColor}█${RESET}`;
            }
            else {
                result += `${markerColor}░${RESET}`;
            }
        }
        else if (i < usageBlocks) {
            result += `${color}█${RESET}`;
        }
        else {
            result += `${DIM}░${RESET}`;
        }
    }
    return result;
}
export function coloredBar(percent, width = 10, colors) {
    const safeWidth = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
    const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    const color = getContextColor(safePercent, colors);
    return `${color}${buildBar(safePercent, safeWidth)}${RESET}`;
}
//# sourceMappingURL=colors.js.map