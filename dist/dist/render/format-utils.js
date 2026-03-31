import { label, getQuotaColor, quotaBar, quotaBarWithTime, RESET } from './colors.js';
export function formatTokens(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}
export function formatResetTime(resetAt) {
    if (!resetAt)
        return '';
    const now = new Date();
    const diffMs = resetAt.getTime() - now.getTime();
    if (diffMs <= 0)
        return '';
    const diffMins = Math.ceil(diffMs / 60000);
    if (diffMins < 60)
        return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        if (remHours > 0)
            return `${days}d ${remHours}h`;
        return `${days}d`;
    }
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
export function formatUsagePercent(percent, colors) {
    if (percent === null) {
        return label('--', colors);
    }
    const color = getQuotaColor(percent, colors);
    return `${color}${percent}%${RESET}`;
}
export function formatUsageWindowPart({ label: windowLabel, percent, resetAt, timePercent = null, colors, usageBarEnabled, barWidth, forceLabel = false, }) {
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
//# sourceMappingURL=format-utils.js.map