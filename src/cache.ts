/**
 * Cache management for API responses (shared with claude-nonstop).
 *
 * Two files per config directory:
 * - {configDir}/auth_usage_cache.json: { raw, cachedTimestamp }
 * - {configDir}/auth_usage_call.timestamp: last API call timestamp
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const CACHE_FILENAME = 'auth_usage_cache.json';
const CALL_TIMESTAMP_FILENAME = 'auth_usage_call.timestamp';

/**
 * Get cache interval from environment variable or use default.
 * CLAUDE_AUTH_USAGE_API_CACHE_TTL: seconds (default: 60)
 */
function getCacheIntervalMs(): number {
  const envValue = process.env.CLAUDE_AUTH_USAGE_API_CACHE_TTL;
  if (!envValue) return 60 * 1000; // 1 minute default

  const seconds = Number(envValue);
  if (isNaN(seconds) || seconds <= 0) {
    console.warn(`[cache] Invalid CLAUDE_AUTH_USAGE_API_CACHE_TTL="${envValue}", using default 60s`);
    return 60 * 1000;
  }

  return seconds * 1000;
}

const CACHE_INTERVAL_MS = getCacheIntervalMs();
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface CacheData {
  raw: any;
  cachedTimestamp: number;
}

/**
 * Read cached response from disk.
 *
 * @param {string} configDir - Config directory
 * @returns {CacheData|null} { raw, cachedTimestamp } or null if not found
 */
export function readCache(configDir: string): CacheData | null {
  try {
    const cachePath = join(configDir, CACHE_FILENAME);
    if (!existsSync(cachePath)) {
      return null;
    }
    const content = readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as CacheData;
  } catch {
    return null;
  }
}

/**
 * Read the last API call timestamp.
 *
 * @param {string} configDir - Config directory
 * @returns {number|null} Timestamp in ms or null if not found
 */
export function readLastApiCallTimestamp(configDir: string): number | null {
  try {
    const timestampPath = join(configDir, CALL_TIMESTAMP_FILENAME);
    if (!existsSync(timestampPath)) {
      return null;
    }
    const content = readFileSync(timestampPath, 'utf-8').trim();
    const ts = Number(content);
    return isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Write API call timestamp (called immediately before fetch).
 *
 * @param {string} configDir - Config directory
 * @param {number} [now] - Timestamp to write (default: Date.now())
 */
export function updateApiCallTimestamp(configDir: string, now = Date.now()): void {
  try {
    const timestampPath = join(configDir, CALL_TIMESTAMP_FILENAME);
    const dir = dirname(timestampPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(timestampPath, String(now), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

/**
 * Write cached response (called after successful fetch).
 *
 * @param {string} configDir - Config directory
 * @param {any} raw - Raw API response
 * @param {number} [now] - Timestamp to record (default: Date.now())
 */
export function writeCache(configDir: string, raw: any, now = Date.now()): void {
  try {
    const cachePath = join(configDir, CACHE_FILENAME);
    const dir = dirname(cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const cache: CacheData = { raw, cachedTimestamp: now };
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

/**
 * Decide whether to make a fresh API call.
 *
 * Returns true if max(cachedTimestamp, lastApiCallTimestamp) + 1min < now.
 *
 * @param {CacheData|null} cache - Cached data from readCache()
 * @param {number|null} lastApiCallTs - From readLastApiCallTimestamp()
 * @param {number} [now] - Current timestamp (default: Date.now())
 * @returns {boolean}
 */
export function shouldRefreshCache(
  cache: CacheData | null,
  lastApiCallTs: number | null,
  now = Date.now(),
): boolean {
  const cachedTs = cache?.cachedTimestamp ?? 0;
  const maxTs = Math.max(cachedTs, lastApiCallTs ?? 0);
  return maxTs + CACHE_INTERVAL_MS < now;
}

/**
 * Check if cached value is stale (> 5 minutes old).
 * Used to detect API limit errors or when cache hasn't been updated.
 *
 * @param {CacheData|null} cache - Cached data
 * @param {number} [now] - Current timestamp (default: Date.now())
 * @returns {boolean}
 */
export function isCacheStale(cache: CacheData | null, now = Date.now()): boolean {
  if (!cache?.cachedTimestamp) return true;
  return now - cache.cachedTimestamp > STALE_THRESHOLD_MS;
}
