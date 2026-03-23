import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir, userInfo } from 'node:os';
import { join, normalize, resolve } from 'node:path';

export interface NonstopAccountUsage {
  name: string;
  configDir: string;
  fiveHour: number | null;
  sevenDay: number | null;
  fiveHourResetAt: Date | null;
  sevenDayResetAt: Date | null;
  error?: string;
}

export interface NonstopInfo {
  currentAccount: string | null;
  otherCount: number;
  expanded: boolean;
  otherAccounts: NonstopAccountUsage[];
}

interface NonstopAccount {
  name: string;
  configDir: string;
}

interface NonstopConfig {
  accounts?: NonstopAccount[];
}

interface UsageCache {
  updatedAt: number;
  accounts: Array<{
    name: string;
    configDir: string;
    fiveHour: number | null;
    sevenDay: number | null;
    fiveHourResetAt: string | null;
    sevenDayResetAt: string | null;
    error?: string;
  }>;
}

const NONSTOP_DIR = join(homedir(), '.claude-nonstop');
const NONSTOP_CONFIG_PATH = join(NONSTOP_DIR, 'config.json');
const HUD_EXPANDED_PATH = join(NONSTOP_DIR, '.hud-expanded');
const HUD_CACHE_PATH = join(NONSTOP_DIR, '.hud-usage-cache.json');
const CACHE_TTL_MS = 10_000;
const FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_CLAUDE_DIR = normalize(join(homedir(), '.claude'));

async function readNonstopConfig(): Promise<NonstopConfig | null> {
  try {
    const raw = await readFile(NONSTOP_CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as NonstopConfig;
  } catch {
    return null;
  }
}

function matchAccount(transcriptPath: string, accounts: NonstopAccount[]): string | null {
  if (!transcriptPath) return null;
  const sorted = [...accounts].sort((a, b) => b.configDir.length - a.configDir.length);
  for (const account of sorted) {
    const dir = resolve(account.configDir);
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    if (transcriptPath.startsWith(prefix)) {
      return account.name;
    }
  }
  return null;
}

function getServiceName(configDir: string): string {
  const expanded = configDir.startsWith('~') ? configDir.replace(/^~/, homedir()) : configDir;
  const normalized = normalize(expanded);
  if (normalized === DEFAULT_CLAUDE_DIR) {
    return 'Claude Code-credentials';
  }
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 8);
  return `Claude Code-credentials-${hash}`;
}

function readToken(configDir: string): string | null {
  const serviceName = getServiceName(configDir);
  try {
    const raw = execFileSync('security', [
      'find-generic-password',
      '-s', serviceName,
      '-a', userInfo().username,
      '-w',
    ], { encoding: 'utf-8', timeout: 5000 }).trim();
    const data = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    return data?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

function normalizePercent(value: unknown): number | null {
  if (typeof value !== 'number' || isNaN(value)) return null;
  if (value >= 0 && value <= 1.0) return Math.round(value * 100);
  return Math.round(value);
}

async function fetchUsage(token: string): Promise<{
  fiveHour: number | null;
  sevenDay: number | null;
  fiveHourResetAt: string | null;
  sevenDayResetAt: string | null;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { fiveHour: null, sevenDay: null, fiveHourResetAt: null, sevenDayResetAt: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as Record<string, unknown>;
    const fh = data.five_hour as Record<string, unknown> | undefined;
    const sd = data.seven_day as Record<string, unknown> | undefined;
    return {
      fiveHour: normalizePercent(fh?.utilization ?? data.five_hour_utilization),
      sevenDay: normalizePercent(sd?.utilization ?? data.seven_day_utilization),
      fiveHourResetAt: (fh?.resets_at as string | null) ?? (data.five_hour_reset_at as string | null) ?? null,
      sevenDayResetAt: (sd?.resets_at as string | null) ?? (data.seven_day_reset_at as string | null) ?? null,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      fiveHour: null,
      sevenDay: null,
      fiveHourResetAt: null,
      sevenDayResetAt: null,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

async function readCache(): Promise<UsageCache | null> {
  try {
    const raw = await readFile(HUD_CACHE_PATH, 'utf8');
    return JSON.parse(raw) as UsageCache;
  } catch {
    return null;
  }
}

async function writeCache(cache: UsageCache): Promise<void> {
  try {
    await writeFile(HUD_CACHE_PATH, JSON.stringify(cache), 'utf8');
  } catch {
    // ignore write errors
  }
}

async function fetchOtherAccountsUsage(
  accounts: NonstopAccount[],
  currentAccount: string | null,
): Promise<NonstopAccountUsage[]> {
  const others = accounts.filter(a => a.name !== currentAccount);
  return Promise.all(
    others.map(async (account) => {
      const token = readToken(account.configDir);
      if (!token) {
        return {
          name: account.name,
          configDir: account.configDir,
          fiveHour: null,
          sevenDay: null,
          fiveHourResetAt: null,
          sevenDayResetAt: null,
          error: 'no_token',
        };
      }
      const usage = await fetchUsage(token);
      return {
        name: account.name,
        configDir: account.configDir,
        fiveHour: usage.fiveHour,
        sevenDay: usage.sevenDay,
        fiveHourResetAt: usage.fiveHourResetAt ? new Date(usage.fiveHourResetAt) : null,
        sevenDayResetAt: usage.sevenDayResetAt ? new Date(usage.sevenDayResetAt) : null,
        error: usage.error,
      };
    }),
  );
}

export async function getNonstopInfo(transcriptPath?: string): Promise<NonstopInfo | null> {
  const config = await readNonstopConfig();
  if (!config?.accounts || config.accounts.length === 0) {
    return null;
  }

  const accounts = config.accounts;
  const current = transcriptPath ? matchAccount(transcriptPath, accounts) : null;
  const otherCount = accounts.length - 1;
  const expanded = existsSync(HUD_EXPANDED_PATH);

  if (!expanded) {
    return { currentAccount: current, otherCount, expanded: false, otherAccounts: [] };
  }

  // Expanded: load other accounts' usage with 10s cache
  const cache = await readCache();
  const now = Date.now();
  const cacheAge = cache ? now - cache.updatedAt : Infinity;

  let otherAccounts: NonstopAccountUsage[];

  if (cacheAge < CACHE_TTL_MS && cache) {
    otherAccounts = cache.accounts
      .filter(a => a.name !== current)
      .map(a => ({
        ...a,
        fiveHourResetAt: a.fiveHourResetAt ? new Date(a.fiveHourResetAt) : null,
        sevenDayResetAt: a.sevenDayResetAt ? new Date(a.sevenDayResetAt) : null,
      }));
  } else {
    otherAccounts = await fetchOtherAccountsUsage(accounts, current);
    await writeCache({
      updatedAt: now,
      accounts: otherAccounts.map(a => ({
        name: a.name,
        configDir: a.configDir,
        fiveHour: a.fiveHour,
        sevenDay: a.sevenDay,
        fiveHourResetAt: a.fiveHourResetAt ? a.fiveHourResetAt.toISOString() : null,
        sevenDayResetAt: a.sevenDayResetAt ? a.sevenDayResetAt.toISOString() : null,
        error: a.error,
      })),
    });
  }

  return { currentAccount: current, otherCount, expanded: true, otherAccounts };
}
