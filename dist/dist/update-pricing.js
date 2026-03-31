#!/usr/bin/env node
/**
 * CLI to add or update a model entry in pricing.json.
 *
 * Usage:
 *   node dist/update-pricing.js <model-id> <input$/MTok> <output$/MTok> <cacheWrite$/MTok> <cacheRead$/MTok>
 *
 * Example:
 *   node dist/update-pricing.js claude-haiku-4-5 0.8 4.0 1.0 0.08
 */
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const pricingPath = join(dirname(fileURLToPath(import.meta.url)), 'pricing.json');
const args = process.argv.slice(2);
if (args.length !== 5) {
    console.error('Usage: node dist/update-pricing.js <model-id> <input$/MTok> <output$/MTok> <cacheWrite$/MTok> <cacheRead$/MTok>');
    console.error('Example: node dist/update-pricing.js claude-haiku-4-5 0.8 4.0 1.0 0.08');
    process.exit(1);
}
const [modelId, inputRaw, outputRaw, ccRaw, crRaw] = args;
const inputPerMTok = parseFloat(inputRaw);
const outputPerMTok = parseFloat(outputRaw);
const cacheWritePerMTok = parseFloat(ccRaw);
const cacheReadPerMTok = parseFloat(crRaw);
if ([inputPerMTok, outputPerMTok, cacheWritePerMTok, cacheReadPerMTok].some(isNaN)) {
    console.error('All pricing values must be valid numbers.');
    process.exit(1);
}
let table = {};
try {
    table = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
}
catch {
    // start fresh if file missing
}
const isUpdate = modelId in table;
table[modelId] = { inputPerMTok, outputPerMTok, cacheWritePerMTok, cacheReadPerMTok };
fs.writeFileSync(pricingPath, JSON.stringify(table, null, 2) + '\n', 'utf8');
console.log(`${isUpdate ? 'Updated' : 'Added'} pricing for ${modelId}:`);
console.log(`  input: $${inputPerMTok}/MTok  output: $${outputPerMTok}/MTok  cache_write: $${cacheWritePerMTok}/MTok  cache_read: $${cacheReadPerMTok}/MTok`);
console.log(`Saved to: ${pricingPath}`);
//# sourceMappingURL=update-pricing.js.map