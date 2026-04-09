import { readStdin, getUsageFromStdin } from './stdin.js';
import { parseTranscript } from './transcript.js';
import { render } from './render/index.js';
import { countConfigs } from './config-reader.js';
import type { RulesFileInfo } from './config-reader.js';
import { getGitStatus } from './git.js';
import { loadConfig } from './config.js';
import { parseExtraCmdArg, runExtraCmd } from './extra-cmd.js';
import { getClaudeCodeVersion } from './version.js';
import { getMemoryUsage } from './memory.js';
import { getNonstopInfo } from './nonstop.js';
import { writeCostHistory, writeBaseline } from './cost-history.js';
import type { RenderContext, ToolEntry } from './types.js';
import { fileURLToPath } from 'node:url';
import { realpathSync, writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import * as nodePath from 'node:path';
import { homedir } from 'node:os';
import { getHudPluginDir } from './claude-config-dir.js';

function globToRegex(pattern: string): RegExp {
  let result = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      result += '[\\s\\S]*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (c === '*') {
      result += '[^/]*';
      i++;
    } else if ('\\.+^${}()|[]'.includes(c)) {
      result += '\\' + c;
      i++;
    } else {
      result += c;
      i++;
    }
  }
  return new RegExp(result + '$');
}

function matchesPattern(filePath: string, pattern: string, baseDir: string, cwd: string, home: string): boolean {
  const expanded = pattern.startsWith('~/') ? nodePath.join(home, pattern.slice(2)) : pattern;
  const resolvedPattern = isAbsolute(expanded) ? expanded : nodePath.join(baseDir, expanded);
  const resolvedFile = isAbsolute(filePath) ? filePath : nodePath.join(cwd, filePath);
  try {
    return globToRegex(resolvedPattern).test(resolvedFile);
  } catch {
    return false;
  }
}

function computeMatchedRulesFiles(tools: ToolEntry[], rulesFiles: RulesFileInfo[], cwd: string, home: string): { name: string; scope: 'global' | 'parent' | 'local' }[] {
  if (!cwd || !rulesFiles.length) return [];
  const filePaths = tools
    .filter(t => (t.name === 'Read' || t.name === 'Write' || t.name === 'Edit') && t.target)
    .map(t => t.target!);
  if (!filePaths.length) return [];
  const matched: { name: string; scope: 'global' | 'parent' | 'local' }[] = [];
  for (const rf of rulesFiles) {
    if (!rf.paths.length) continue;
    if (filePaths.some(fp => rf.paths.some(p => matchesPattern(fp, p, rf.baseDir, cwd, home)))) {
      matched.push({ name: rf.name, scope: rf.scope });
    }
  }
  return matched;
}

export type MainDeps = {
  readStdin: typeof readStdin;
  getUsageFromStdin: typeof getUsageFromStdin;
  parseTranscript: typeof parseTranscript;
  countConfigs: typeof countConfigs;
  getGitStatus: typeof getGitStatus;
  loadConfig: typeof loadConfig;
  parseExtraCmdArg: typeof parseExtraCmdArg;
  runExtraCmd: typeof runExtraCmd;
  getClaudeCodeVersion: typeof getClaudeCodeVersion;
  getMemoryUsage: typeof getMemoryUsage;
  getNonstopInfo: typeof getNonstopInfo;
  render: typeof render;
  now: () => number;
  log: (...args: unknown[]) => void;
};

export async function main(overrides: Partial<MainDeps> = {}): Promise<void> {
  const deps: MainDeps = {
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
    } catch { /* non-fatal */ }

const transcriptPath = stdin.transcript_path ?? '';
    const transcript = await deps.parseTranscript(transcriptPath);

    const { claudeMdCount, claudeMdFiles, rulesCount, globalRulesCount, parentRulesCount, localRulesCount, rulesFiles, mcpCount, hooksCount, plugins, thinkingBudget, effort } = await deps.countConfigs(stdin.cwd);

    const config = await deps.loadConfig();
    const gitStatus = config.gitStatus.enabled
      ? await deps.getGitStatus(stdin.cwd)
      : null;

    // Usage comes only from Claude Code's official stdin rate_limits fields.
    let usageData: RenderContext['usageData'] = null;
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
      writeCostHistory(
        transcriptPath,
        transcript.turnCosts,
        transcript.userTurnCount,
        stdin.cost?.total_cost_usd ?? null,
        deps.now(),
        stdin.rate_limits?.five_hour?.used_percentage ?? null,
        stdin.rate_limits?.seven_day?.used_percentage ?? null,
        nonstopInfo?.currentAccount ?? null,
        nonstopInfo?.currentAccountType ?? null,
        stdin.cost?.total_api_duration_ms ?? null,
      );
    }

    const matchedRulesFiles = computeMatchedRulesFiles(
      transcript.tools,
      rulesFiles,
      stdin.cwd ?? '',
      homedir(),
    );

    const ctx: RenderContext = {
      stdin,
      transcript,
      claudeMdCount,
      claudeMdFiles,
      rulesCount,
      globalRulesCount,
      parentRulesCount,
      localRulesCount,
      rulesFiles,
      matchedRulesFiles,
      mcpCount,
      hooksCount,
      plugins,
      thinkingBudget,
      effort,
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
  } catch (error) {
    deps.log('[claude-hud] Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

export function formatSessionDuration(sessionStart?: Date, now: () => number = () => Date.now()): string {
  if (!sessionStart) {
    return '';
  }

  const ms = now() - sessionStart.getTime();
  const mins = Math.floor(ms / 60000);

  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
  void main();
}
