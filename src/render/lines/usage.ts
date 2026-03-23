import type { RenderContext } from '../../types.js';
import type { NonstopAccountUsage } from '../../nonstop.js';
import { isLimitReached } from '../../types.js';
import { getProviderLabel } from '../../stdin.js';
import { critical, label, custom, getQuotaColor, quotaBar, formatPct, RESET } from '../colors.js';
import { getAdaptiveBarWidth } from '../../utils/terminal.js';

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

  if (ctx.nonstopInfo?.expanded) {
    return renderExpandedUsage(ctx);
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
  const barWidth = getAdaptiveBarWidth();

  if (fiveHour === null && sevenDay !== null) {
    const weeklyOnlyPart = formatUsageWindowPart({
      label: '7d',
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
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
    colors,
    usageBarEnabled,
    barWidth,
  });

  if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
    const sevenDayPart = formatUsageWindowPart({
      label: '7d',
      percent: sevenDay,
      resetAt: ctx.usageData.sevenDayResetAt,
      colors,
      usageBarEnabled,
      barWidth,
    });
    return `${accountPrefix}${usageLabel} ${fiveHourPart} | ${sevenDayPart}`;
  }

  return `${accountPrefix}${usageLabel} ${fiveHourPart}`;
}

function renderExpandedUsage(ctx: RenderContext): string | null {
  const display = ctx.config?.display;
  const colors = ctx.config?.colors;
  const usageLabel = label('Usage', colors);
  const usageBarEnabled = display?.usageBarEnabled ?? true;
  const barWidth = getAdaptiveBarWidth();

  const lines: string[] = [];

  // Current account from stdin
  const currentName = ctx.nonstopInfo!.currentAccount ?? '?';
  const currentPrefix = `${custom(currentName, colors)} `;

  if (isLimitReached(ctx.usageData!)) {
    const resetTime = ctx.usageData!.fiveHour === 100
      ? formatResetTime(ctx.usageData!.fiveHourResetAt)
      : formatResetTime(ctx.usageData!.sevenDayResetAt);
    lines.push(`${currentPrefix}${usageLabel} ${critical(`⚠ Limit reached${resetTime ? ` (resets ${resetTime})` : ''}`, colors)}`);
  } else {
    lines.push(formatAccountUsageLine(
      currentPrefix,
      usageLabel,
      ctx.usageData!.fiveHour,
      ctx.usageData!.sevenDay,
      ctx.usageData!.fiveHourResetAt,
      ctx.usageData!.sevenDayResetAt,
      { colors, usageBarEnabled, barWidth },
    ));
  }

  // Other accounts from cache
  for (const account of ctx.nonstopInfo!.otherAccounts) {
    const prefix = `${custom(account.name, colors)} `;
    if (account.fiveHour === null && account.sevenDay === null) {
      lines.push(`${prefix}${usageLabel} ${label('--', colors)}`);
      continue;
    }
    lines.push(formatAccountUsageLine(
      prefix,
      usageLabel,
      account.fiveHour,
      account.sevenDay,
      account.fiveHourResetAt,
      account.sevenDayResetAt,
      { colors, usageBarEnabled, barWidth },
    ));
  }

  return lines.join('\n');
}

function formatAccountUsageLine(
  prefix: string,
  usageLabel: string,
  fiveHour: number | null,
  sevenDay: number | null,
  fiveHourResetAt: Date | null,
  sevenDayResetAt: Date | null,
  opts: { colors: RenderContext['config']['colors']; usageBarEnabled: boolean; barWidth: number },
): string {
  const { colors, usageBarEnabled, barWidth } = opts;

  const fiveHourPart = formatUsageWindowPart({
    label: '5h',
    percent: fiveHour,
    resetAt: fiveHourResetAt,
    colors,
    usageBarEnabled,
    barWidth,
  });

  if (sevenDay !== null) {
    const sevenDayPart = formatUsageWindowPart({
      label: '7d',
      percent: sevenDay,
      resetAt: sevenDayResetAt,
      colors,
      usageBarEnabled,
      barWidth,
    });
    return `${prefix}${usageLabel} ${fiveHourPart} | ${sevenDayPart}`;
  }

  return `${prefix}${usageLabel} ${fiveHourPart}`;
}

function formatAccountPrefix(ctx: RenderContext): string {
  const info = ctx.nonstopInfo;
  if (!info) return '';

  const colors = ctx.config?.colors;
  const name = info.currentAccount ?? '?';
  const others = info.otherCount > 0 ? ` ${custom(`+${info.otherCount}`, colors)}` : '';
  return `${custom(name, colors)}${others} `;
}

function formatUsagePercent(percent: number | null, colors?: RenderContext['config']['colors']): string {
  if (percent === null) {
    return label('--', colors);
  }
  const color = getQuotaColor(percent, colors);
  return `${color}${formatPct(percent)}${RESET}`;
}

function formatUsageWindowPart({
  label,
  percent,
  resetAt,
  colors,
  usageBarEnabled,
  barWidth,
  forceLabel = false,
}: {
  label: '5h' | '7d';
  percent: number | null;
  resetAt: Date | null;
  colors?: RenderContext['config']['colors'];
  usageBarEnabled: boolean;
  barWidth: number;
  forceLabel?: boolean;
}): string {
  const usageDisplay = formatUsagePercent(percent, colors);
  const reset = formatResetTime(resetAt);

  if (usageBarEnabled) {
    const body = reset
      ? `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay} (resets in ${reset})`
      : `${quotaBar(percent ?? 0, barWidth, colors)} ${usageDisplay}`;
    return forceLabel ? `${label}: ${body}` : body;
  }

  return reset
    ? `${label}: ${usageDisplay} (resets in ${reset})`
    : `${label}: ${usageDisplay}`;
}

function formatResetTime(resetAt: Date | null): string {
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
