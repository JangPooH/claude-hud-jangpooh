import type { RenderContext } from '../../types.js';
import { isLimitReached } from '../../types.js';
import { getProviderLabel } from '../../stdin.js';
import { critical, label, custom } from '../colors.js';
import { getAdaptiveBarWidth } from '../../utils/terminal.js';
import { formatResetTime, formatUsagePercent, formatUsageWindowPart } from '../format-utils.js';

export function renderUsageLine(ctx: RenderContext): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;

  if (display?.showUsage === false) {
    return null;
  }

  if (!ctx.usageData) {
    return null;
  }

  if (getProviderLabel(ctx.stdin)) {
    return null;
  }

  const accountPrefix = formatAccountPrefix(ctx);
  const usageLabel = label('Usage', colors);

  if (isLimitReached(ctx.usageData)) {
    const resetTime = ctx.usageData.fiveHour === 100
      ? formatResetTime(ctx.usageData.fiveHourResetAt)
      : formatResetTime(ctx.usageData.sevenDayResetAt);
    return `${accountPrefix}${usageLabel} ${critical(`⚠ Limit reached${resetTime ? ` (resets ${resetTime})` : ''}`, colors)}`;
  }

  const threshold = display?.usageThreshold ?? 0;
  const fiveHour = ctx.usageData.fiveHour;
  const sevenDay = ctx.usageData.sevenDay;

  const effectiveUsage = Math.max(fiveHour ?? 0, sevenDay ?? 0);
  if (effectiveUsage < threshold) {
    return null;
  }

  const usageBarEnabled = display?.usageBarEnabled ?? true;
  const sevenDayThreshold = display?.sevenDayThreshold ?? 80;
  const barWidth = getAdaptiveBarWidth(20);

  const fiveHourWindowMs = 5 * 60 * 60 * 1000;
  const sevenDayWindowMs = 7 * 24 * 60 * 60 * 1000;

  if (fiveHour === null && sevenDay !== null) {
    const weeklyOnlyPart = formatUsageWindowPart({
      label: '7d',
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      timePercent: calcTimePercent(ctx.usageData.sevenDayResetAt, sevenDayWindowMs),
      colors,
      usageBarEnabled,
      barWidth,
      forceLabel: true,
    });
    return `${accountPrefix}${usageLabel} ${weeklyOnlyPart}`;
  }

  const fiveHourPart = formatUsageWindowPart({
    label: '5h',
    percent: fiveHour,
    resetAt: ctx.usageData.fiveHourResetAt,
    timePercent: calcTimePercent(ctx.usageData.fiveHourResetAt, fiveHourWindowMs),
    colors,
    usageBarEnabled,
    barWidth,
  });

  if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
    const sevenDayPart = formatUsageWindowPart({
      label: '7d',
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      timePercent: calcTimePercent(ctx.usageData.sevenDayResetAt, sevenDayWindowMs),
      colors,
      usageBarEnabled,
      barWidth,
    });
    return `${accountPrefix}${usageLabel} ${fiveHourPart} | ${sevenDayPart}`;
  }

  return `${accountPrefix}${usageLabel} ${fiveHourPart}`;
}

function formatAccountPrefix(ctx: RenderContext): string {
  const info = ctx.nonstopInfo;
  if (!info) return '';

  const colors = ctx.config?.colors;
  const name = info.currentAccount ?? '?';
  const others = info.otherCount > 0 ? ` ${custom(`+${info.otherCount}`, colors)}` : '';
  return `${custom(name, colors)}${others} `;
}

function calcTimePercent(resetAt: Date | null, windowMs: number): number | null {
  if (!resetAt) return null;
  const elapsed = windowMs - (resetAt.getTime() - Date.now());
  return Math.min(100, Math.max(0, (elapsed / windowMs) * 100));
}

