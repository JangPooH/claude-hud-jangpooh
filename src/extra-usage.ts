import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { createHash } from 'node:crypto';
import { readCache, readLastApiCallTimestamp, updateApiCallTimestamp, writeCache, shouldRefreshCache } from './cache.js';

export interface ExtraUsageData {
  is_enabled: boolean;
  monthly_limit: number;
  used_credits: number;
  utilization: number;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Compute keychain service name for a given configDir.
 * Claude Code uses SHA256(configDir)[0..8] as the suffix.
 * Returns candidates in priority order: hashed name first, then default.
 */
function getKeychainServiceNames(configDir: string): string[] {
  const hash = createHash('sha256').update(configDir).digest('hex').slice(0, 8);
  return [`Claude Code-credentials-${hash}`, 'Claude Code-credentials'];
}

/**
 * Read OAuth access token from macOS Keychain using `security` command.
 * Tries the hashed service name for the given configDir first, then the default.
 */
function readTokenFromKeychain(configDir: string): string | null {
  const serviceNames = getKeychainServiceNames(configDir);
  const account = userInfo().username;

  for (const serviceName of serviceNames) {
    try {
      const raw = execFileSync('security', [
        'find-generic-password',
        '-s',
        serviceName,
        '-a',
        account,
        '-w',
      ], { encoding: 'utf-8', timeout: 5000 }).trim();

      if (!raw) continue;

      try {
        const data = JSON.parse(raw);
        const token = data?.claudeAiOauth?.accessToken;
        if (token && typeof token === 'string' && token.startsWith('sk-ant-')) {
          return token;
        }
      } catch {
        if (raw.startsWith('sk-ant-')) return raw;
      }
    } catch {
      // Try next service name
    }
  }

  return null;
}

interface FetchResult {
  data: ExtraUsageData | null;
  isRateLimited: boolean;
}

function normalizeExtraUsage(raw: any): ExtraUsageData | null {
  if (!raw || typeof raw.is_enabled !== 'boolean') return null;
  return {
    is_enabled: raw.is_enabled,
    monthly_limit: raw.monthly_limit ?? 0,
    used_credits: raw.used_credits ?? 0,
    utilization: raw.utilization ?? 0,
  };
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
    return normalizeExtraUsage(cache?.raw?.extra_usage);
  }

  // Get token
  const token = readTokenFromKeychain(configDir);
  if (!token) {
    return normalizeExtraUsage(cache?.raw?.extra_usage);
  }

  // Update API call timestamp immediately (before awaiting response)
  updateApiCallTimestamp(configDir, now);

  // Fetch from API
  const result = await fetchExtraUsageFromAPI(token);

  if (result.data) {
    // Success — merge extra_usage with existing cache to preserve five_hour/seven_day
    const existingCache = readCache(configDir);
    const mergedRaw = {
      ...(existingCache?.raw || {}),
      extra_usage: result.data,
    };
    writeCache(configDir, mergedRaw, now);
    return result.data;
  }

  // API call failed — return cached data if available
  return normalizeExtraUsage(cache?.raw?.extra_usage);
}
