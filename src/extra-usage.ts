import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';

export interface ExtraUsageData {
  is_enabled: boolean;
  monthly_limit: number;
  used_credits: number;
  utilization: number;
}

interface ExtraUsageCache {
  extra_usage: ExtraUsageData;
  cachedAt: number;
}

const CACHE_TTL_MS = 10_000; // 10 seconds
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Read OAuth access token from macOS Keychain using `security` command.
 * Matches the credential format that Claude Code and claude-nonstop use.
 */
function readTokenFromKeychain(configDir: string): string | null {
  const defaultServiceName = 'Claude Code-credentials';
  // For now, just try the default service name
  // TODO: Calculate hash for custom config dirs if needed

  try {
    const raw = execFileSync('security', [
      'find-generic-password',
      '-s',
      defaultServiceName,
      '-a',
      userInfo().username,
      '-w',
    ], { encoding: 'utf-8', timeout: 5000 }).trim();

    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      const token = data?.claudeAiOauth?.accessToken;
      if (token && typeof token === 'string' && token.startsWith('sk-ant-')) {
        return token;
      }
    } catch {
      // Not JSON, might be raw token in older format
      if (raw.startsWith('sk-ant-')) return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch extra_usage data from Anthropic OAuth API.
 */
async function fetchExtraUsageFromAPI(token: string): Promise<ExtraUsageData | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const data = await res.json() as {
      extra_usage?: {
        is_enabled?: boolean;
        monthly_limit?: number;
        used_credits?: number;
        utilization?: number;
      };
    };

    const extraUsage = data?.extra_usage;
    if (!extraUsage || typeof extraUsage.is_enabled !== 'boolean') {
      return null;
    }

    return {
      is_enabled: extraUsage.is_enabled,
      monthly_limit: extraUsage.monthly_limit ?? 0,
      used_credits: extraUsage.used_credits ?? 0,
      utilization: extraUsage.utilization ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Read cache file from configDir/extra-usage-cache.json
 */
function readCache(configDir: string): ExtraUsageCache | null {
  try {
    const cacheFile = join(configDir, 'extra-usage-cache.json');
    if (!existsSync(cacheFile)) {
      return null;
    }

    const raw = readFileSync(cacheFile, 'utf-8');
    const data = JSON.parse(raw) as ExtraUsageCache;
    return data;
  } catch {
    return null;
  }
}

/**
 * Write cache file to configDir/extra-usage-cache.json
 */
function writeCache(configDir: string, data: ExtraUsageCache): void {
  try {
    const cacheFile = join(configDir, 'extra-usage-cache.json');
    writeFileSync(cacheFile, JSON.stringify(data), 'utf-8');
  } catch {
    // Non-fatal: cache write failure doesn't block rendering
  }
}

/**
 * Get extra usage data with caching.
 *
 * Only fetches from API if:
 * 1. isLimitReached is true (to avoid unnecessary API calls)
 * 2. Cache is missing or expired (TTL 10 seconds)
 *
 * Returns null if:
 * - isLimitReached is false
 * - Token cannot be read
 * - API call fails
 */
export async function getExtraUsage(
  configDir: string | null,
  isLimitReached: boolean,
): Promise<ExtraUsageData | null> {
  // Only fetch if limit is reached
  if (!isLimitReached || !configDir) {
    return null;
  }

  // Check cache first
  const cache = readCache(configDir);
  if (cache) {
    const age = Date.now() - cache.cachedAt;
    if (age < CACHE_TTL_MS) {
      return cache.extra_usage;
    }
  }

  // Cache miss or expired — fetch from API
  const token = readTokenFromKeychain(configDir);
  if (!token) {
    return null;
  }

  const extraUsage = await fetchExtraUsageFromAPI(token);
  if (!extraUsage) {
    return null;
  }

  // Cache the result
  writeCache(configDir, {
    extra_usage: extraUsage,
    cachedAt: Date.now(),
  });

  return extraUsage;
}
