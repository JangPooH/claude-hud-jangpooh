import type { RenderContext } from '../types.js';
import type { ExtraUsageData } from '../extra-usage.js';
import { label, getQuotaColor, quotaBar, quotaBarWithTime, RESET } from './colors.js';

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatResetTime(resetAt: Date | null): string {
  if (!resetAt) return '';
  const now = new Date();
  const diffMs = resetAt.getTime() - now.getTime();
  if (diffMs <= 0) return '';

  const diffMins = Math.ceil(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (remHours > 0) return `${days}d ${remHours}h`;
    return `${days}d`;
  }

  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatUsagePercent(percent: number | null, colors?: RenderContext['config']['colors']): string {
  if (percent === null) {
    return label('--', colors);
  }
  const color = getQuotaColor(percent, colors);
  return `${color}${percent}%${RESET}`;
}

export function formatUsageWindowPart({
  label: windowLabel,
  percent,
  resetAt,
  timePercent = null,
  colors,
  usageBarEnabled,
  barWidth,
  forceLabel = false,
}: {
  label: '5h' | '7d';
  percent: number | null;
  resetAt: Date | null;
  timePercent?: number | null;
  colors?: RenderContext['config']['colors'];
  usageBarEnabled: boolean;
  barWidth: number;
  forceLabel?: boolean;
}): string {
  const usageDisplay = formatUsagePercent(percent, colors);
  const reset = formatResetTime(resetAt);
  const dimColor = reset ? `\x1b[2m${getQuotaColor(percent ?? 0, colors)}` : '';

  if (usageBarEnabled) {
    const bar = timePercent !== null
      ? quotaBarWithTime(percent ?? 0, timePercent, barWidth, colors)
      : quotaBar(percent ?? 0, barWidth, colors);
    const body = reset
      ? `${bar} ${usageDisplay} ${dimColor}(~${reset})${RESET}`
      : `${bar} ${usageDisplay}`;
    return forceLabel ? `${windowLabel}: ${body}` : body;
  }

  return reset
    ? `${windowLabel}: ${usageDisplay} ${dimColor}(${reset})${RESET}`
    : `${windowLabel}: ${usageDisplay}`;
}

export function formatExtraUsageBar(
  extraUsage: ExtraUsageData | null,
  colors?: RenderContext['config']['colors'],
  barWidth: number = 15,
): string {
  // Extra credit disabled
  if (!extraUsage || !extraUsage.is_enabled) {
    const dimColor = '\x1b[2m'; // dim
    return `${label('Extra', colors)} ${dimColor}(disabled)${RESET}`;
  }

  // Extra credit enabled with monthly reset timemarker
  const percent = extraUsage.utilization;

  // Calculate days remaining in month for time marker
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const currentDay = now.getDate();
  const daysElapsed = currentDay - 1;
  const timePercent = Math.min(100, (daysElapsed / daysInMonth) * 100);

  const bar = quotaBarWithTime(percent, timePercent, barWidth, colors);
  const percentDisplay = `${percent.toFixed(2)}%`;

  // Format dollar amounts (API returns cents)
  const usedDollars = (extraUsage.used_credits / 100).toFixed(2);
  const limitDollars = (extraUsage.monthly_limit / 100).toFixed(2);
  const moneyDisplay = `($${usedDollars}/$${limitDollars})`;

  return `${label('Extra', colors)} ${bar} ${percentDisplay} ${moneyDisplay}`;
}
