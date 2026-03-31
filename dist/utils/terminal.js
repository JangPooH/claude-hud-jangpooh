// Returns a bar width scaled to terminal width, relative to fullWidth arg (min 5).
// >=100 cols: fullWidth, 60-99: floor(60%), <60: floor(40%).
export function getAdaptiveBarWidth(fullWidth = 10) {
    const safeWidth = Math.max(5, fullWidth);
    const stdoutCols = process.stdout?.columns;
    const cols = (typeof stdoutCols === 'number' && Number.isFinite(stdoutCols) && stdoutCols > 0)
        ? Math.floor(stdoutCols)
        : Number.parseInt(process.env.COLUMNS ?? '', 10);
    if (Number.isFinite(cols) && cols > 0) {
        if (cols >= 100)
            return safeWidth;
        if (cols >= 60)
            return Math.floor(safeWidth * 0.6);
        return Math.floor(safeWidth * 0.4);
    }
    return safeWidth;
}
//# sourceMappingURL=terminal.js.map