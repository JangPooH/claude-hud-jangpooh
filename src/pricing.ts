import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;     // 5m cache write (1.25x input)
  cacheWrite1hPerMTok?: number;  // 1h cache write (2x input)
  cacheReadPerMTok: number;
}

function getDistDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function loadPricingTable(): Record<string, ModelPricing> {
  try {
    const raw = fs.readFileSync(join(getDistDir(), 'pricing.json'), 'utf8');
    return JSON.parse(raw) as Record<string, ModelPricing>;
  } catch {
    return {
      'claude-sonnet-4-6': { inputPerMTok: 3.0, outputPerMTok: 15.0, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 },
    };
  }
}

const MODEL_PRICING = loadPricingTable();
const FALLBACK_MODEL = 'claude-sonnet-4-6';

export function getPricing(modelId: string | undefined): { pricing: ModelPricing; isUnknown: boolean } {
  if (!modelId) return { pricing: MODEL_PRICING[FALLBACK_MODEL], isUnknown: false };
  const pricing = MODEL_PRICING[modelId];
  if (pricing) return { pricing, isUnknown: false };
  return { pricing: MODEL_PRICING[FALLBACK_MODEL], isUnknown: true };
}

export function getUpdateScriptPath(): string {
  return join(getDistDir(), 'update-pricing.js');
}
