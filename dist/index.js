import { readStdin, getUsageFromStdin } from './stdin.js';
import { parseTranscript } from './transcript.js';
import { render } from './render/index.js';
import { countConfigs } from './config-reader.js';
import { getGitStatus } from './git.js';
import { loadConfig } from './config.js';
import { parseExtraCmdArg, runExtraCmd } from './extra-cmd.js';
import { getClaudeCodeVersion } from './version.js';
import { getMemoryUsage } from './memory.js';
import { getNonstopInfo } from './nonstop.js';
import { writeCostHistory, writeBaseline } from './cost-history.js';
import { fileURLToPath } from 'node:url';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getHudPluginDir } from './claude-config-dir.js';
export async function main(overrides = {}) {
    const deps = {
        readStdin,
        getUsageFromStdin,
        parseTranscript,
        countConfigs,
        getGitStatus,
        loadConfig,
        parseExtraCmdArg,
        runExtraCmd,
        getClaudeCodeVersion,
        getMemoryUsage,
        getNonstopInfo,
        render,
        now: () => Date.now(),
        log: console.log,
        ...overrides,
    };
    try {
        const stdin = await deps.readStdin();
        if (!stdin) {
            // Running without stdin - this happens during setup verification
            const isMacOS = process.platform === 'darwin';
            deps.log('[claude-hud] Initializing...');
            if (isMacOS) {
                deps.log('[claude-hud] Note: On macOS, you may need to restart Claude Code for the HUD to appear.');
            }
            return;
        }
        // Save raw stdin sample for inspection (overwrite each time)
        try {
            const samplePath = join(getHudPluginDir(homedir()), 'stdin-sample.json');
            writeFileSync(samplePath, JSON.stringify(stdin, null, 2), 'utf8');
        }
        catch { /* non-fatal */ }
        const transcriptPath = stdin.transcript_path ?? '';
        const transcript = await deps.parseTranscript(transcriptPath);
        const { claudeMdCount, claudeMdFiles, rulesCount, mcpCount, hooksCount, plugins } = await deps.countConfigs(stdin.cwd);
        const config = await deps.loadConfig();
        const gitStatus = config.gitStatus.enabled
            ? await deps.getGitStatus(stdin.cwd)
            : null;
        // Usage comes only from Claude Code's official stdin rate_limits fields.
        let usageData = null;
        if (config.display.showUsage !== false) {
            usageData = deps.getUsageFromStdin(stdin);
        }
        const extraCmd = deps.parseExtraCmdArg();
        const extraLabel = extraCmd ? await deps.runExtraCmd(extraCmd) : null;
        const sessionDuration = formatSessionDuration(transcript.sessionStart, deps.now);
        const claudeCodeVersion = config.display.showClaudeCodeVersion
            ? await deps.getClaudeCodeVersion()
            : undefined;
        const memoryUsage = config.display.showMemoryUsage && config.lineLayout === 'expanded'
            ? await deps.getMemoryUsage()
            : null;
        const nonstopInfo = await deps.getNonstopInfo(stdin.transcript_path);
        if (transcriptPath) {
            writeBaseline(transcriptPath, stdin.cost?.total_cost_usd ?? null, stdin.cost?.total_api_duration_ms ?? null);
        }
        if (transcriptPath && transcript.turnCosts.length > 0) {
            writeCostHistory(transcriptPath, transcript.turnCosts, transcript.userTurnCount, stdin.cost?.total_cost_usd ?? null, deps.now(), stdin.rate_limits?.five_hour?.used_percentage ?? null, stdin.rate_limits?.seven_day?.used_percentage ?? null, nonstopInfo?.currentAccount ?? null, nonstopInfo?.currentAccountType ?? null, stdin.cost?.total_api_duration_ms ?? null);
        }
        const ctx = {
            stdin,
            transcript,
            claudeMdCount,
            claudeMdFiles,
            rulesCount,
            mcpCount,
            hooksCount,
            plugins,
            sessionDuration,
            gitStatus,
            usageData,
            memoryUsage,
            config,
            extraLabel,
            claudeCodeVersion,
            nonstopInfo,
        };
        deps.render(ctx);
    }
    catch (error) {
        deps.log('[claude-hud] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
}
export function formatSessionDuration(sessionStart, now = () => Date.now()) {
    if (!sessionStart) {
        return '';
    }
    const ms = now() - sessionStart.getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1)
        return '<1m';
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
}
const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a, b) => {
    try {
        return realpathSync(a) === realpathSync(b);
    }
    catch {
        return a === b;
    }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
    void main();
}
//# sourceMappingURL=index.js.map