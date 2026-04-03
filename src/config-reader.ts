import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createDebug } from './debug.js';
import { getClaudeConfigDir, getClaudeConfigJsonPath } from './claude-config-dir.js';

const debug = createDebug('config');

export interface ClaudeMdFile {
  displayPath: string;
  tokens: number;
}

export interface PluginInfo {
  name: string;
  scopes: ('global' | 'local')[];
}

export interface RulesFileInfo {
  name: string;   // basename (e.g. "stdin-fields.md")
  paths: string[]; // patterns from frontmatter `paths:` field
  scope: 'global' | 'parent' | 'local';
  baseDir: string; // directory containing .claude/ (for resolving relative paths)
}

export interface ConfigCounts {
  claudeMdCount: number;
  claudeMdFiles: ClaudeMdFile[];
  rulesCount: number;
  globalRulesCount: number;
  parentRulesCount: number;
  localRulesCount: number;
  rulesFiles: RulesFileInfo[];
  mcpCount: number;
  hooksCount: number;
  plugins: PluginInfo[];
  thinkingBudget: number | null;
  effort: string | null;
}

// Valid keys for disabled MCP arrays in config files
type DisabledMcpKey = 'disabledMcpServers' | 'disabledMcpjsonServers';

function getMcpServerNames(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      return new Set(Object.keys(config.mcpServers));
    }
  } catch (error) {
    debug(`Failed to read MCP servers from ${filePath}:`, error);
  }
  return new Set();
}

function getDisabledMcpServers(filePath: string, key: DisabledMcpKey): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    if (Array.isArray(config[key])) {
      const validNames = config[key].filter((s: unknown) => typeof s === 'string');
      if (validNames.length !== config[key].length) {
        debug(`${key} in ${filePath} contains non-string values, ignoring them`);
      }
      return new Set(validNames);
    }
  } catch (error) {
    debug(`Failed to read ${key} from ${filePath}:`, error);
  }
  return new Set();
}

function countMcpServersInFile(filePath: string, excludeFrom?: string): number {
  const servers = getMcpServerNames(filePath);
  if (excludeFrom) {
    const exclude = getMcpServerNames(excludeFrom);
    for (const name of exclude) {
      servers.delete(name);
    }
  }
  return servers.size;
}

function countHooksInFile(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    if (config.hooks && typeof config.hooks === 'object') {
      return Object.keys(config.hooks).length;
    }
  } catch (error) {
    debug(`Failed to read hooks from ${filePath}:`, error);
  }
  return 0;
}

function parsePathsFromFrontmatter(content: string): string[] {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];
  const yaml = match[1];
  const pathsBlock = yaml.match(/^paths:\s*\n((?:[ \t]+-[ \t]+.+\n?)*)/m);
  if (!pathsBlock) return [];
  const result: string[] = [];
  for (const line of pathsBlock[1].split('\n')) {
    const m = line.match(/^[ \t]+-[ \t]+"?([^"]+?)"?\s*$/);
    if (m) result.push(m[1]);
  }
  return result;
}

function collectRulesFilesInDir(rulesDir: string, scope: 'global' | 'parent' | 'local', baseDir: string): RulesFileInfo[] {
  if (!fs.existsSync(rulesDir)) return [];
  const result: RulesFileInfo[] = [];
  try {
    const entries = fs.readdirSync(rulesDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rulesDir, entry.name);
      if (entry.isDirectory()) {
        result.push(...collectRulesFilesInDir(fullPath, scope, baseDir));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        let paths: string[] = [];
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          paths = parsePathsFromFrontmatter(content);
        } catch { /* non-fatal */ }
        result.push({ name: entry.name, paths, scope, baseDir });
      }
    }
  } catch (error) {
    debug(`Failed to read rules from ${rulesDir}:`, error);
  }
  return result;
}

function normalizePathForComparison(inputPath: string): string {
  let normalized = path.normalize(path.resolve(inputPath));
  const root = path.parse(normalized).root;
  while (normalized.length > root.length && normalized.endsWith(path.sep)) {
    normalized = normalized.slice(0, -1);
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathsReferToSameLocation(pathA: string, pathB: string): boolean {
  if (normalizePathForComparison(pathA) === normalizePathForComparison(pathB)) {
    return true;
  }

  if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
    return false;
  }

  try {
    const realPathA = fs.realpathSync.native(pathA);
    const realPathB = fs.realpathSync.native(pathB);
    return normalizePathForComparison(realPathA) === normalizePathForComparison(realPathB);
  } catch {
    return false;
  }
}

function getFileTokens(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return Math.round(stat.size / 4);
  } catch {
    return 0;
  }
}

function addClaudeMd(files: ClaudeMdFile[], filePath: string, homeDir: string, cwd?: string): void {
  const tokens = getFileTokens(filePath);
  let displayPath = filePath;
  if (cwd && filePath.startsWith(cwd + path.sep)) {
    displayPath = '.' + filePath.slice(cwd.length);
  } else if (filePath.startsWith(homeDir + path.sep)) {
    displayPath = '~' + filePath.slice(homeDir.length);
  }
  files.push({ displayPath, tokens });
}

export async function countConfigs(cwd?: string): Promise<ConfigCounts> {
  const claudeMdFiles: ClaudeMdFile[] = [];
  const globalRulesFiles: RulesFileInfo[] = [];
  const parentRulesFiles: RulesFileInfo[] = [];
  const localRulesFiles: RulesFileInfo[] = [];
  let hooksCount = 0;

  const homeDir = os.homedir();
  const claudeDir = getClaudeConfigDir(homeDir);

  // Collect all MCP servers across scopes, then subtract disabled ones
  const userMcpServers = new Set<string>();
  const projectMcpServers = new Set<string>();

  // === USER SCOPE ===

  // ~/.claude/CLAUDE.md
  const userClaudeMd = path.join(claudeDir, 'CLAUDE.md');
  if (fs.existsSync(userClaudeMd)) {
    addClaudeMd(claudeMdFiles, userClaudeMd, homeDir, cwd);
  }

  // ~/.claude/rules/*.md  (baseDir = homeDir, i.e. parent of ~/.claude)
  globalRulesFiles.push(...collectRulesFilesInDir(path.join(claudeDir, 'rules'), 'global', homeDir));

  // ~/.claude/settings.json (MCPs, hooks, thinking, effort)
  const userSettings = path.join(claudeDir, 'settings.json');
  for (const name of getMcpServerNames(userSettings)) {
    userMcpServers.add(name);
  }
  hooksCount += countHooksInFile(userSettings);

  let thinkingBudget: number | null = null;
  let effort: string | null = null;
  try {
    const settingsContent = fs.readFileSync(userSettings, 'utf8');
    const settingsJson = JSON.parse(settingsContent);
    if (settingsJson.thinking?.enabled === true) {
      if (typeof settingsJson.thinking.budget_tokens === 'number') thinkingBudget = settingsJson.thinking.budget_tokens;
    }
    if (typeof settingsJson.effort === 'string') effort = settingsJson.effort;
  } catch { /* non-fatal */ }

  // {CLAUDE_CONFIG_DIR}.json (additional user-scope MCPs)
  const userClaudeJson = getClaudeConfigJsonPath(homeDir);
  for (const name of getMcpServerNames(userClaudeJson)) {
    userMcpServers.add(name);
  }

  // Get disabled user-scope MCPs from ~/.claude.json
  const disabledUserMcps = getDisabledMcpServers(userClaudeJson, 'disabledMcpServers');
  for (const name of disabledUserMcps) {
    userMcpServers.delete(name);
  }

  // === PROJECT SCOPE ===

  // Avoid double-counting when project .claude directory is the same location as user scope.
  const projectClaudeDir = cwd ? path.join(cwd, '.claude') : null;
  const projectClaudeOverlapsUserScope = projectClaudeDir
    ? pathsReferToSameLocation(projectClaudeDir, claudeDir)
    : false;

  if (cwd) {
    // {cwd}/CLAUDE.md
    const cwdClaudeMd = path.join(cwd, 'CLAUDE.md');
    if (fs.existsSync(cwdClaudeMd)) {
      addClaudeMd(claudeMdFiles, cwdClaudeMd, homeDir, cwd);
    }

    // {cwd}/CLAUDE.local.md
    const cwdClaudeLocalMd = path.join(cwd, 'CLAUDE.local.md');
    if (fs.existsSync(cwdClaudeLocalMd)) {
      addClaudeMd(claudeMdFiles, cwdClaudeLocalMd, homeDir, cwd);
    }

    // {cwd}/.claude/CLAUDE.md (alternative location, skip when it is user scope)
    const dotClaudeMd = path.join(cwd, '.claude', 'CLAUDE.md');
    if (!projectClaudeOverlapsUserScope && fs.existsSync(dotClaudeMd)) {
      addClaudeMd(claudeMdFiles, dotClaudeMd, homeDir, cwd);
    }

    // {cwd}/.claude/CLAUDE.local.md
    const dotClaudeLocalMd = path.join(cwd, '.claude', 'CLAUDE.local.md');
    if (fs.existsSync(dotClaudeLocalMd)) {
      addClaudeMd(claudeMdFiles, dotClaudeLocalMd, homeDir, cwd);
    }

    // {cwd}/.claude/rules/*.md (recursive)
    // Skip when it overlaps with user-scope rules.
    if (!projectClaudeOverlapsUserScope) {
      localRulesFiles.push(...collectRulesFilesInDir(path.join(cwd, '.claude', 'rules'), 'local', cwd));
    }

    // {cwd}/.mcp.json (project MCP config) - tracked separately for disabled filtering
    const mcpJsonServers = getMcpServerNames(path.join(cwd, '.mcp.json'));

    // {cwd}/.claude/settings.json (project settings)
    // Skip when it overlaps with user-scope settings.
    const projectSettings = path.join(cwd, '.claude', 'settings.json');
    if (!projectClaudeOverlapsUserScope) {
      for (const name of getMcpServerNames(projectSettings)) {
        projectMcpServers.add(name);
      }
      hooksCount += countHooksInFile(projectSettings);
    }

    // {cwd}/.claude/settings.local.json (local project settings)
    const localSettings = path.join(cwd, '.claude', 'settings.local.json');
    for (const name of getMcpServerNames(localSettings)) {
      projectMcpServers.add(name);
    }
    hooksCount += countHooksInFile(localSettings);

    // Get disabled .mcp.json servers from settings.local.json
    const disabledMcpJsonServers = getDisabledMcpServers(localSettings, 'disabledMcpjsonServers');
    for (const name of disabledMcpJsonServers) {
      mcpJsonServers.delete(name);
    }

    // Add remaining .mcp.json servers to project set
    for (const name of mcpJsonServers) {
      projectMcpServers.add(name);
    }

    // === PARENT DIRS (cwd → root, exclusive of cwd itself) ===
    let parentDir = path.dirname(cwd);
    const fsRoot = path.parse(parentDir).root;
    while (parentDir !== fsRoot) {
      const parentClaudeDir = path.join(parentDir, '.claude');
      const overlapsUser = pathsReferToSameLocation(parentClaudeDir, claudeDir);

      // CLAUDE.md files → add to claudeMdFiles
      const parentClaudeMd = path.join(parentDir, 'CLAUDE.md');
      if (fs.existsSync(parentClaudeMd)) {
        addClaudeMd(claudeMdFiles, parentClaudeMd, homeDir, cwd);
      }
      const parentClaudeLocalMd = path.join(parentDir, 'CLAUDE.local.md');
      if (fs.existsSync(parentClaudeLocalMd)) {
        addClaudeMd(claudeMdFiles, parentClaudeLocalMd, homeDir, cwd);
      }
      if (!overlapsUser) {
        const parentDotClaudeMd = path.join(parentDir, '.claude', 'CLAUDE.md');
        if (fs.existsSync(parentDotClaudeMd)) {
          addClaudeMd(claudeMdFiles, parentDotClaudeMd, homeDir, cwd);
        }
        // .claude/rules → scope: 'parent', baseDir = parentDir
        parentRulesFiles.push(...collectRulesFilesInDir(path.join(parentDir, '.claude', 'rules'), 'parent', parentDir));
      }

      const next = path.dirname(parentDir);
      if (next === parentDir) break;
      parentDir = next;
    }
  }

  // Total MCP count = user servers + project servers
  // Note: Deduplication only occurs within each scope, not across scopes.
  // A server with the same name in both user and project scope counts as 2 (separate configs).
  const mcpCount = userMcpServers.size + projectMcpServers.size;

  const plugins = getInstalledPlugins(cwd);
  const allRulesFiles = [...globalRulesFiles, ...parentRulesFiles, ...localRulesFiles];

  return { claudeMdCount: claudeMdFiles.length, claudeMdFiles, rulesCount: allRulesFiles.length, globalRulesCount: globalRulesFiles.length, parentRulesCount: parentRulesFiles.length, localRulesCount: localRulesFiles.length, rulesFiles: allRulesFiles, mcpCount, hooksCount, plugins, thinkingBudget, effort };
}

function getEnabledPluginKeys(settingsPath: string): Set<string> {
  if (!fs.existsSync(settingsPath)) return new Set();
  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
    const config = JSON.parse(content);
    if (!config.enabledPlugins || typeof config.enabledPlugins !== 'object') return new Set();
    return new Set(
      Object.entries(config.enabledPlugins)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
    );
  } catch (error) {
    debug('Failed to read enabledPlugins:', error);
    return new Set();
  }
}

function getInstalledPlugins(cwd?: string): PluginInfo[] {
  const homeDir = os.homedir();
  const claudeDir = getClaudeConfigDir(homeDir);
  const installedPluginsPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');

  if (!fs.existsSync(installedPluginsPath)) return [];

  // Collect enabled plugin keys from user settings (and optionally project settings)
  const enabledKeys = getEnabledPluginKeys(path.join(claudeDir, 'settings.json'));
  if (cwd) {
    for (const key of getEnabledPluginKeys(path.join(cwd, '.claude', 'settings.json'))) {
      enabledKeys.add(key);
    }
    for (const key of getEnabledPluginKeys(path.join(cwd, '.claude', 'settings.local.json'))) {
      enabledKeys.add(key);
    }
  }

  try {
    const content = fs.readFileSync(installedPluginsPath, 'utf8');
    const data = JSON.parse(content);
    if (!data.plugins || typeof data.plugins !== 'object') return [];

    const result: PluginInfo[] = [];
    for (const [key, entries] of Object.entries(data.plugins)) {
      if (!enabledKeys.has(key)) continue;

      const name = key.split('@')[0];
      const scopes = new Set<'global' | 'local'>();

      for (const entry of entries as Array<{ scope: string; projectPath?: string }>) {
        if (entry.scope === 'user') {
          scopes.add('global');
        } else if (entry.scope === 'local' && cwd && entry.projectPath === cwd) {
          scopes.add('local');
        }
      }

      if (scopes.size > 0) {
        result.push({ name, scopes: [...scopes] });
      }
    }
    return result;
  } catch (error) {
    debug('Failed to read installed plugins:', error);
    return [];
  }
}
