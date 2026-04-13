import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { readCache, readLastApiCallTimestamp, updateApiCallTimestamp, writeCache, shouldRefreshCache } from './cache.js';

export interface ExtraUsageData {
  is_enabled: boolean;
  monthly_limit: number;
  used_credits: number;
  utilization: number;
}

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

interface FetchResult {
  data: ExtraUsageData | null;
  isRateLimited: boolean;
}

/**
 * Fetch extra_usage data from Anthropic OAuth API.
 * Returns { data, isRateLimited } to distinguish 429 errors from other failures.
 */
async function fetchExtraUsageFromAPI(token: string): Promise<FetchResult> {
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

    if (res.status === 429) {
      return { data: null, isRateLimited: true };
    }

    if (!res.ok) {
      return { data: null, isRateLimited: false };
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
      return { data: null, isRateLimited: false };
    }

    return {
      data: {
        is_enabled: extraUsage.is_enabled,
        monthly_limit: extraUsage.monthly_limit ?? 0,
        used_credits: extraUsage.used_credits ?? 0,
        utilization: extraUsage.utilization ?? 0,
      },
      isRateLimited: false,
    };
  } catch {
    return { data: null, isRateLimited: false };
  }
}


/**
 * Get extra usage data with caching (shared with claude-nonstop).
 *
 * Cache strategy:
 * - Two timestamp files: cachedTimestamp (response received) and lastApiCallTimestamp (request sent)
 * - Only fetches if max(cachedTimestamp, lastApiCallTimestamp) + 1min < now
 * - Updates lastApiCallTimestamp immediately before API call (guards against concurrent calls)
 * - On success, updates both cache file and cachedTimestamp
 * - Returns cached data (even if stale) to avoid blocking on failed API calls
 */
export async function getExtraUsage(
  configDir: string | null,
  isLimitReached: boolean,
): Promise<ExtraUsageData | null> {
  // Only fetch if limit is reached
  if (!isLimitReached || !configDir) {
    return null;
  }

  const now = Date.now();

  // Check cache and last API call timestamp
  const cache = readCache(configDir);
  const lastApiCallTs = readLastApiCallTimestamp(configDir);

  // Decide if we should refresh
  if (!shouldRefreshCache(cache, lastApiCallTs, now)) {
    // Cache is fresh enough, return cached data
    if (cache?.raw?.extra_usage) {
      return cache.raw.extra_usage;
    }
    return null;
  }

  // Get token
  const token = readTokenFromKeychain(configDir);
  if (!token) {
    // Return cached data if available
    if (cache?.raw?.extra_usage) {
      return cache.raw.extra_usage;
    }
    return null;
  }

  // Update API call timestamp immediately (before awaiting response)
  updateApiCallTimestamp(configDir, now);

  // Fetch from API
  const result = await fetchExtraUsageFromAPI(token);

  if (result.data) {
    // Success — cache the full API response with timestamp
    writeCache(configDir, { extra_usage: result.data }, now);
    return result.data;
  }

  // API call failed — return cached data if available
  if (cache?.raw?.extra_usage) {
    return cache.raw.extra_usage;
  }

  return null;
}
