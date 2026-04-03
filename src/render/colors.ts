import type { HudColorName, HudColorValue, HudColorOverrides } from '../config.js';

export const RESET = '\x1b[0m';
const DEFAULT_TEXT = RESET;

const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[34m';
const BRIGHT_RED = '\x1b[91m';
const BRIGHT_BLUE = '\x1b[94m';
const BRIGHT_MAGENTA = '\x1b[95m';
const CLAUDE_ORANGE = '\x1b[38;5;208m';
const PURPLE = '\x1b[38;5;135m';

const ANSI_BY_NAME: Record<HudColorName, string> = {
  dim: DIM,
  red: RED,
  green: GREEN,
  yellow: YELLOW,
  magenta: MAGENTA,
  cyan: CYAN,
  brightRed: BRIGHT_RED,
  brightBlue: BRIGHT_BLUE,
  brightMagenta: BRIGHT_MAGENTA,
  claudeOrange: CLAUDE_ORANGE,
};

/** Convert a hex color string (#rrggbb) to a truecolor ANSI escape sequence. */
function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Resolve a color value to an ANSI escape sequence.
 * Accepts named presets, 256-color indices (0-255), or hex strings (#rrggbb).
 */
function resolveAnsi(value: HudColorValue | undefined, fallback: string): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'number') {
    return `\x1b[38;5;${value}m`;
  }
  if (typeof value === 'string' && value.startsWith('#') && value.length === 7) {
    return hexToAnsi(value);
  }
  return ANSI_BY_NAME[value as HudColorName] ?? fallback;
}

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

function withOverride(text: string, value: HudColorValue | undefined, fallback: string): string {
  return colorize(text, resolveAnsi(value, fallback));
}

export function green(text: string): string {
  return colorize(text, GREEN);
}

export function yellow(text: string): string {
  return colorize(text, YELLOW);
}

export function red(text: string): string {
  return colorize(text, RED);
}

export function cyan(text: string): string {
  return colorize(text, CYAN);
}

export function magenta(text: string): string {
  return colorize(text, MAGENTA);
}

export function dim(text: string): string {
  return colorize(text, DIM);
}

// --- color brightening ---

function color256ToRgb(n: number): [number, number, number] {
  if (n >= 232) { const v = 8 + (n - 232) * 10; return [v, v, v]; }
  const i = n - 16;
  const toV = (x: number) => x === 0 ? 0 : 55 + x * 40;
  return [toV(Math.floor(i / 36)), toV(Math.floor((i % 36) / 6)), toV(i % 6)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return [Math.round(hue2rgb(h + 1/3) * 255), Math.round(hue2rgb(h) * 255), Math.round(hue2rgb(h - 1/3) * 255)];
}

function brightenRgb(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  const [br, bg, bb] = hslToRgb(h, s, l + (1 - l) * 0.33);
  return `\x1b[38;2;${br};${bg};${bb}m`;
}

// xterm standard RGB values for basic 8-color and bright 16-color
const BASIC8_RGB: Record<number, [number, number, number]> = {
  0: [0,   0,   0],    // black
  1: [170, 0,   0],    // red
  2: [0,   170, 0],    // green
  3: [170, 85,  0],    // yellow
  4: [0,   0,   170],  // blue
  5: [170, 0,   170],  // magenta
  6: [0,   170, 170],  // cyan
  7: [170, 170, 170],  // white
};

const BRIGHT16_RGB: Record<number, [number, number, number]> = {
  8:  [85,  85,  85],   // bright black
  9:  [255, 85,  85],   // bright red
  10: [85,  255, 85],   // bright green
  11: [255, 255, 85],   // bright yellow
  12: [85,  85,  255],  // bright blue
  13: [255, 85,  255],  // bright magenta
  14: [85,  255, 255],  // bright cyan
  15: [255, 255, 255],  // bright white
};

/** Returns a brighter version of the given ANSI color code.
 *  Basic 8-color (\x1b[3Xm): maps to bright variant (\x1b[9Xm).
 *  Bright 16-color (\x1b[9Xm): converts via xterm RGB then HSL +33%.
 *  256-color / truecolor: increases HSL lightness by 33%.
 */
export function bright(ansiColor: string): string {
  const basic = ansiColor.match(/^\x1b\[3([0-7])m$/);
  if (basic) {
    const rgb = BASIC8_RGB[+basic[1]];
    return rgb ? brightenRgb(...rgb) : ansiColor;
  }

  const bright16 = ansiColor.match(/^\x1b\[9([0-7])m$/);
  if (bright16) {
    const rgb = BRIGHT16_RGB[8 + +bright16[1]];
    return rgb ? brightenRgb(...rgb) : ansiColor;
  }

  const c256 = ansiColor.match(/^\x1b\[38;5;(\d+)m$/);
  if (c256) {
    const n = +c256[1];
    if (n < 16) return ansiColor; // terminal-defined, can't reliably brighten
    return brightenRgb(...color256ToRgb(n));
  }

  const tc = ansiColor.match(/^\x1b\[38;2;(\d+);(\d+);(\d+)m$/);
  if (tc) return brightenRgb(+tc[1], +tc[2], +tc[3]);

  return ansiColor; // unknown format, return as-is
}

export function brightBlue(text: string): string {
  return colorize(text, BRIGHT_BLUE);
}

export function dimCyan(text: string): string {
  return `${DIM}${CYAN}${text}${RESET}`;
}

export function dimBrightBlue(text: string): string {
  return `${DIM}${BRIGHT_BLUE}${text}${RESET}`;
}

export function dimClaudeOrange(text: string): string {
  return `${DIM}${CLAUDE_ORANGE}${text}${RESET}`;
}

export function purple(text: string): string {
  return colorize(text, PURPLE);
}

export function dimPurple(text: string): string {
  return `${DIM}${PURPLE}${text}${RESET}`;
}

export function dimYellow(text: string): string {
  return `${DIM}${YELLOW}${text}${RESET}`;
}

export function claudeOrange(text: string): string {
  return colorize(text, CLAUDE_ORANGE);
}

function getModelFamilyColor(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.includes('haiku')) return GREEN;
  if (lower.includes('opus')) return CLAUDE_ORANGE;
  return CYAN;
}

export function model(text: string, modelName?: string, colors?: Partial<HudColorOverrides>): string {
  return withOverride(text, colors?.model, getModelFamilyColor(modelName ?? ''));
}

export function dimModel(text: string, modelName?: string, colors?: Partial<HudColorOverrides>): string {
  return `${DIM}${resolveAnsi(colors?.model, getModelFamilyColor(modelName ?? ''))}${text}${RESET}`;
}

export function project(text: string, colors?: Partial<HudColorOverrides>): string {
  return withOverride(text, colors?.project, YELLOW);
}

export function git(text: string, colors?: Partial<HudColorOverrides>): string {
  return withOverride(text, colors?.git, MAGENTA);
}

export function gitBranch(text: string, colors?: Partial<HudColorOverrides>): string {
  return withOverride(text, colors?.gitBranch, CYAN);
}

export function label(text: string, colors?: Partial<HudColorOverrides>): string {
  return withOverride(text, colors?.label, DEFAULT_TEXT);
}

export function custom(text: string, colors?: Partial<HudColorOverrides>): string {
  return withOverride(text, colors?.custom, CLAUDE_ORANGE);
}

export function warning(text: string, colors?: Partial<HudColorOverrides>): string {
  return colorize(text, resolveAnsi(colors?.warning, YELLOW));
}

export function critical(text: string, colors?: Partial<HudColorOverrides>): string {
  return colorize(text, resolveAnsi(colors?.critical, RED));
}

export function getContextColor(percent: number, colors?: Partial<HudColorOverrides>): string {
  if (percent >= 85) return resolveAnsi(colors?.critical, RED);
  if (percent >= 70) return resolveAnsi(colors?.warning, YELLOW);
  return resolveAnsi(colors?.context, GREEN);
}

export function getQuotaColor(percent: number, colors?: Partial<HudColorOverrides>): string {
  if (percent >= 90) return resolveAnsi(colors?.critical, RED);
  if (percent >= 75) return resolveAnsi(colors?.usageWarning, CLAUDE_ORANGE);
  return resolveAnsi(colors?.usage, BLUE);
}

const PARTIAL_CHARS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

function buildBar(percent: number, width: number): string {
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

export function quotaBar(percent: number, width: number = 10, colors?: Partial<HudColorOverrides>): string {
  const safeWidth = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const color = getQuotaColor(safePercent, colors);
  return `${color}${buildBar(safePercent, safeWidth)}${RESET}`;
}

function getTimeMarkerColor(percent: number, colors?: Partial<HudColorOverrides>): string {
  return bright(getQuotaColor(percent, colors));
}

export function quotaBarWithTime(percent: number, timePercent: number, width: number = 10, colors?: Partial<HudColorOverrides>): string {
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
      } else {
        result += `${markerColor}░${RESET}`;
      }
    } else if (i < usageBlocks) {
      result += `${color}█${RESET}`;
    } else {
      result += `${DIM}░${RESET}`;
    }
  }
  return result;
}

export function coloredBar(percent: number, width: number = 10, colors?: Partial<HudColorOverrides>): string {
  const safeWidth = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const color = getContextColor(safePercent, colors);
  return `${color}${buildBar(safePercent, safeWidth)}${RESET}`;
}
