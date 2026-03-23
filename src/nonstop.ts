import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface NonstopInfo {
  currentAccount: string | null;
  otherCount: number;
}

interface NonstopAccount {
  name: string;
  configDir: string;
}

interface NonstopConfig {
  accounts?: NonstopAccount[];
}

const NONSTOP_CONFIG_PATH = join(homedir(), '.claude-nonstop', 'config.json');

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

  // Sort by configDir length descending so more specific paths match first
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

export async function getNonstopInfo(transcriptPath?: string): Promise<NonstopInfo | null> {
  const config = await readNonstopConfig();
  if (!config?.accounts || config.accounts.length === 0) {
    return null;
  }

  const accounts = config.accounts;
  const current = transcriptPath ? matchAccount(transcriptPath, accounts) : null;
  const otherCount = accounts.length - 1;

  return { currentAccount: current, otherCount };
}
