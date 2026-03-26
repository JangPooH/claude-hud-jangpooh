import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface NonstopInfo {
  currentAccount: string | null;
  currentAccountType: string | null;
  otherCount: number;
}

interface NonstopAccount {
  name: string;
  configDir: string;
}

interface NonstopConfig {
  accounts?: NonstopAccount[];
}

interface ClaudeJson {
  oauthAccount?: {
    hasExtraUsageEnabled?: boolean | null;
  } | null;
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

async function readAccountType(configDir: string): Promise<string> {
  try {
    const raw = await readFile(join(resolve(configDir), '.claude.json'), 'utf8');
    const data = JSON.parse(raw) as ClaudeJson;
    if (!data.oauthAccount) return 'api';
    return data.oauthAccount.hasExtraUsageEnabled ? 'max' : 'pro';
  } catch {
    return 'api';
  }
}

function matchAccount(transcriptPath: string, accounts: NonstopAccount[]): NonstopAccount | null {
  if (!transcriptPath) return null;

  // Sort by configDir length descending so more specific paths match first
  const sorted = [...accounts].sort((a, b) => b.configDir.length - a.configDir.length);

  for (const account of sorted) {
    const dir = resolve(account.configDir);
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    if (transcriptPath.startsWith(prefix)) {
      return account;
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
  const currentAccountType = current ? await readAccountType(current.configDir) : null;
  const otherCount = accounts.length - 1;

  return { currentAccount: current?.name ?? null, currentAccountType, otherCount };
}
