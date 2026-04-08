#!/usr/bin/env bash
npm run build 2>/dev/null

now=$(date +%s)
five_hour_window=$((5 * 60 * 60))

resets_at() {
  local time_pct=$1
  local window=$2
  echo $(( now + window * (100 - time_pct) / 100 ))
}

node -e "
const { formatUsageWindowPart } = require('./dist/render/format-utils.js');
const { loadConfig } = require('./dist/config.js');

const W = 20;
const now = Date.now();
const fiveHourMs = 5 * 60 * 60 * 1000;

const cases = [
  ['<75%   IN  filled', 30, 20],
  ['<75%   ADJ empty ', 30, 32],
  ['<75%   FAR empty ', 30, 60],
  ['75~90% IN  filled', 79, 40],
  ['75~90% ADJ empty ', 79, 75],
  ['75~90% FAR empty ', 79, 90],
  ['>90%   IN  filled', 92, 40],
  ['>90%   ADJ empty ', 92, 90],
  ['>90%   FAR empty ', 92, 97],
];

loadConfig().then(config => {
  for (const [lbl, usage, time] of cases) {
    const resetAt = new Date(now + fiveHourMs * (1 - time / 100));
    const part = formatUsageWindowPart({
      label: '5h',
      percent: usage,
      resetAt,
      timePercent: time,
      colors: config.colors,
      usageBarEnabled: true,
      barWidth: W,
    });
    process.stdout.write(lbl + '  ' + part + '\n');
  }
});
"
