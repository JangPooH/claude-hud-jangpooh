import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
function getDistDir() {
    return dirname(fileURLToPath(import.meta.url));
}
function loadPricingTable() {
    try {
        const raw = fs.readFileSync(join(getDistDir(), 'pricing.json'), 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return {
            'claude-sonnet-4-6': { inputPerMTok: 3.0, outputPerMTok: 15.0, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 },
        };
    }
}
const MODEL_PRICING = loadPricingTable();
const FALLBACK_MODEL = 'claude-sonnet-4-6';
export function getPricing(modelId) {
    if (!modelId)
        return { pricing: MODEL_PRICING[FALLBACK_MODEL], isUnknown: false };
    const pricing = MODEL_PRICING[modelId];
    if (pricing)
        return { pricing, isUnknown: false };
    return { pricing: MODEL_PRICING[FALLBACK_MODEL], isUnknown: true };
}
export function getUpdateScriptPath() {
    return join(getDistDir(), 'update-pricing.js');
}
//# sourceMappingURL=pricing.js.map