import * as fs from 'fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'readline';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
import type { TranscriptData, ToolEntry, AgentEntry, TodoItem, TurnCost } from './types.js';
import { getPricing } from './pricing.js';

interface TranscriptLine {
  timestamp?: string;
  type?: string;
  customTitle?: string;
  message?: {
    id?: string;
    model?: string;
    stop_reason?: string | null;
    content?: ContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  text?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
}

interface TranscriptFileState {
  mtimeMs: number;
  size: number;
}

interface SerializedToolEntry extends Omit<ToolEntry, 'startTime' | 'endTime'> {
  startTime: string;
  endTime?: string;
}

interface SerializedAgentEntry extends Omit<AgentEntry, 'startTime' | 'endTime'> {
  startTime: string;
  endTime?: string;
}

interface SerializedTranscriptData {
  tools: SerializedToolEntry[];
  agents: SerializedAgentEntry[];
  todos: TodoItem[];
  sessionStart?: string;
  sessionName?: string;
  turnCosts?: TurnCost[];
  sessionCost?: number;
  userTurnCount?: number;
  unknownPricingModels?: string[];
  thinkingBudgetExhaustedAtTurn?: number | null;
}

interface TranscriptCacheFile {
  transcriptPath: string;
  transcriptState: TranscriptFileState;
  data: SerializedTranscriptData;
}

let createReadStreamImpl: typeof fs.createReadStream = fs.createReadStream;

function getTranscriptCachePath(transcriptPath: string, homeDir: string): string {
  const hash = createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
  return path.join(getHudPluginDir(homeDir), 'transcript-cache', `${hash}.json`);
}

function readTranscriptFileState(transcriptPath: string): TranscriptFileState | null {
  try {
    const stat = fs.statSync(transcriptPath);
    if (!stat.isFile()) {
      return null;
    }
    return {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

function serializeTranscriptData(data: TranscriptData): SerializedTranscriptData {
  return {
    tools: data.tools.map((tool) => ({
      ...tool,
      startTime: tool.startTime.toISOString(),
      endTime: tool.endTime?.toISOString(),
    })),
    agents: data.agents.map((agent) => ({
      ...agent,
      startTime: agent.startTime.toISOString(),
      endTime: agent.endTime?.toISOString(),
    })),
    todos: data.todos.map((todo) => ({ ...todo })),
    sessionStart: data.sessionStart?.toISOString(),
    sessionName: data.sessionName,
    turnCosts: data.turnCosts,
    sessionCost: data.sessionCost,
    userTurnCount: data.userTurnCount,
    unknownPricingModels: data.unknownPricingModels,
    thinkingBudgetExhaustedAtTurn: data.thinkingBudgetExhaustedAtTurn,
  };
}

function deserializeTranscriptData(data: SerializedTranscriptData): TranscriptData {
  return {
    tools: data.tools.map((tool) => ({
      ...tool,
      startTime: new Date(tool.startTime),
      endTime: tool.endTime ? new Date(tool.endTime) : undefined,
    })),
    agents: data.agents.map((agent) => ({
      ...agent,
      startTime: new Date(agent.startTime),
      endTime: agent.endTime ? new Date(agent.endTime) : undefined,
    })),
    todos: data.todos.map((todo) => ({ ...todo })),
    sessionStart: data.sessionStart ? new Date(data.sessionStart) : undefined,
    sessionName: data.sessionName,
    turnCosts: data.turnCosts ?? [],
    sessionCost: data.sessionCost ?? 0,
    userTurnCount: data.userTurnCount ?? 0,
    unknownPricingModels: data.unknownPricingModels ?? [],
    thinkingBudgetExhaustedAtTurn: data.thinkingBudgetExhaustedAtTurn ?? null,
  };
}

function readTranscriptCache(transcriptPath: string, state: TranscriptFileState): TranscriptData | null {
  try {
    const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as TranscriptCacheFile;
    if (
      parsed.transcriptPath !== path.resolve(transcriptPath)
      || parsed.transcriptState?.mtimeMs !== state.mtimeMs
      || parsed.transcriptState?.size !== state.size
    ) {
      return null;
    }

    return deserializeTranscriptData(parsed.data);
  } catch {
    return null;
  }
}

function writeTranscriptCache(transcriptPath: string, state: TranscriptFileState, data: TranscriptData): void {
  try {
    const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const payload: TranscriptCacheFile = {
      transcriptPath: path.resolve(transcriptPath),
      transcriptState: state,
      data: serializeTranscriptData(data),
    };
    fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8');
  } catch {
    // Cache failures are non-fatal; fall back to fresh parsing next time.
  }
}

export async function parseTranscript(transcriptPath: string): Promise<TranscriptData> {
  const result: TranscriptData = {
    tools: [],
    agents: [],
    todos: [],
    turnCosts: [],
    sessionCost: 0,
    userTurnCount: 0,
    unknownPricingModels: [],
    thinkingBudgetExhaustedAtTurn: null,
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return result;
  }

  const transcriptState = readTranscriptFileState(transcriptPath);
  if (!transcriptState) {
    return result;
  }

  const cached = readTranscriptCache(transcriptPath, transcriptState);
  if (cached) {
    return cached;
  }

  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  let latestTodos: TodoItem[] = [];
  const taskIdToIndex = new Map<string, number>();
  let customTitle: string | undefined;

  let parsedCleanly = false;
  const parseState = { pendingUserMessage: undefined as string | undefined, seenMessageIds: new Map<string, number>() };

  try {
    const fileStream = createReadStreamImpl(transcriptPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as TranscriptLine;
        if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
          customTitle = entry.customTitle;
        }
        processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result, parseState);
      } catch {
        // Skip malformed lines
      }
    }

    parsedCleanly = true;
  } catch {
    // Return partial results on error
  }

  result.tools = Array.from(toolMap.values()).slice(-20);
  result.agents = Array.from(agentMap.values()).slice(-10);
  result.todos = latestTodos;
  result.sessionName = customTitle;
  if (parsedCleanly) {
    writeTranscriptCache(transcriptPath, transcriptState, result);
  }

  return result;
}

export function _setCreateReadStreamForTests(impl: typeof fs.createReadStream | null): void {
  createReadStreamImpl = impl ?? fs.createReadStream;
}

function processEntry(
  entry: TranscriptLine,
  toolMap: Map<string, ToolEntry>,
  agentMap: Map<string, AgentEntry>,
  taskIdToIndex: Map<string, number>,
  latestTodos: TodoItem[],
  result: TranscriptData,
  parseState: { pendingUserMessage: string | undefined; seenMessageIds: Map<string, number> }
): void {
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();

  if (!result.sessionStart && entry.timestamp) {
    result.sessionStart = timestamp;
  }

  if (entry.type === 'user') {
    const content = entry.message?.content;
    let userText: string | undefined;
    if (typeof content === 'string') {
      userText = content;
    } else if (Array.isArray(content)) {
      userText = content.find((b) => b.type === 'text')?.text;
    }
    if (userText !== undefined) {
      result.userTurnCount += 1;
      parseState.pendingUserMessage = userText.slice(0, 120);
    }
  }

  if (entry.type === 'assistant' && entry.message?.usage) {
    const u = entry.message.usage;
    const inp = u.input_tokens ?? 0;
    const out = u.output_tokens ?? 0;
    const cc = u.cache_creation_input_tokens ?? 0;
    const cr = u.cache_read_input_tokens ?? 0;
    const { pricing, isUnknown } = getPricing(entry.message.model);
    const cost = (inp * pricing.inputPerMTok + out * pricing.outputPerMTok + cc * pricing.cacheWritePerMTok + cr * pricing.cacheReadPerMTok) / 1_000_000;
    const toolNames = Array.isArray(entry.message.content)
      ? entry.message.content.filter((b) => b.type === 'tool_use' && b.name).map((b) => b.name!)
      : [];
    const msgId = entry.message.id;
    const existingIdx = msgId ? parseState.seenMessageIds.get(msgId) : undefined;
    if (existingIdx != null) {
      // 같은 mid 재등장 → detail log용으로 append (usage/cost 동일, tool_use 블록이 늘어남)
      // sessionCost는 이미 계산됨 → 추가하지 않음
      const prev = result.turnCosts[existingIdx];
      result.turnCosts.push({ model: entry.message.model, messageId: msgId, inputTokens: inp, outputTokens: out, cacheCreationTokens: cc, cacheReadTokens: cr, cost, userTurn: prev.userTurn, userMessage: prev.userMessage, tools: toolNames.length > 0 ? toolNames : undefined });
    } else {
      const idx = result.turnCosts.length;
      result.turnCosts.push({ model: entry.message.model, messageId: msgId, inputTokens: inp, outputTokens: out, cacheCreationTokens: cc, cacheReadTokens: cr, cost, userTurn: result.userTurnCount, userMessage: parseState.pendingUserMessage, tools: toolNames.length > 0 ? toolNames : undefined });
      if (msgId) parseState.seenMessageIds.set(msgId, idx);
      parseState.pendingUserMessage = undefined;
      result.sessionCost += cost;
    }
    if (isUnknown && entry.message.model && !result.unknownPricingModels.includes(entry.message.model) && entry.message.model !== '<synthetic>') {
      result.unknownPricingModels.push(entry.message.model);
    }

    // Detect thinking budget exhaustion:
    // stop_reason=max_tokens + content contains thinking block(s) but no text/tool_use response
    if (Array.isArray(entry.message.content)) {
      const blocks = entry.message.content;
      const hasThinking = blocks.some((b) => b.type === 'thinking');
      const hasTextOrTool = blocks.some((b) => b.type === 'text' || b.type === 'tool_use');
      if (entry.message.stop_reason === 'max_tokens' && hasThinking && !hasTextOrTool) {
        result.thinkingBudgetExhaustedAtTurn = result.userTurnCount;
      } else if (
        result.thinkingBudgetExhaustedAtTurn !== null &&
        result.userTurnCount > result.thinkingBudgetExhaustedAtTurn &&
        hasTextOrTool
      ) {
        // New user turn came after exhaustion and we got a real response → clear
        result.thinkingBudgetExhaustedAtTurn = null;
      }
    }
  }

  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === 'tool_use' && block.id && block.name) {
      const toolEntry: ToolEntry = {
        id: block.id,
        name: block.name,
        target: extractTarget(block.name, block.input),
        status: 'running',
        startTime: timestamp,
      };

      if (block.name === 'Task') {
        const input = block.input as Record<string, unknown>;
        const agentEntry: AgentEntry = {
          id: block.id,
          type: (input?.subagent_type as string) ?? 'unknown',
          model: (input?.model as string) ?? undefined,
          description: (input?.description as string) ?? undefined,
          status: 'running',
          startTime: timestamp,
        };
        agentMap.set(block.id, agentEntry);
      } else if (block.name === 'TodoWrite') {
        const input = block.input as { todos?: TodoItem[] };
        if (input?.todos && Array.isArray(input.todos)) {
          latestTodos.length = 0;
          taskIdToIndex.clear();
          latestTodos.push(...input.todos);
        }
      } else if (block.name === 'TaskCreate') {
        const input = block.input as Record<string, unknown>;
        const subject = typeof input?.subject === 'string' ? input.subject : '';
        const description = typeof input?.description === 'string' ? input.description : '';
        const content = subject || description || 'Untitled task';
        const status = normalizeTaskStatus(input?.status) ?? 'pending';
        latestTodos.push({ content, status });

        const rawTaskId = input?.taskId;
        const taskId = typeof rawTaskId === 'string' || typeof rawTaskId === 'number'
          ? String(rawTaskId)
          : block.id;
        if (taskId) {
          taskIdToIndex.set(taskId, latestTodos.length - 1);
        }
      } else if (block.name === 'TaskUpdate') {
        const input = block.input as Record<string, unknown>;
        const index = resolveTaskIndex(input?.taskId, taskIdToIndex, latestTodos);
        if (index !== null) {
          const status = normalizeTaskStatus(input?.status);
          if (status) {
            latestTodos[index].status = status;
          }

          const subject = typeof input?.subject === 'string' ? input.subject : '';
          const description = typeof input?.description === 'string' ? input.description : '';
          const content = subject || description;
          if (content) {
            latestTodos[index].content = content;
          }
        }
      } else {
        toolMap.set(block.id, toolEntry);
      }
    }

    if (block.type === 'tool_result' && block.tool_use_id) {
      const tool = toolMap.get(block.tool_use_id);
      if (tool) {
        tool.status = block.is_error ? 'error' : 'completed';
        tool.endTime = timestamp;
      }

      const agent = agentMap.get(block.tool_use_id);
      if (agent) {
        agent.status = 'completed';
        agent.endTime = timestamp;
      }
    }
  }
}

function extractTarget(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return (input.file_path as string) ?? (input.path as string);
    case 'Glob':
      return input.pattern as string;
    case 'Grep':
      return input.pattern as string;
    case 'Bash':
      const cmd = input.command as string;
      return cmd?.slice(0, 30) + (cmd?.length > 30 ? '...' : '');
  }
  return undefined;
}

function resolveTaskIndex(
  taskId: unknown,
  taskIdToIndex: Map<string, number>,
  latestTodos: TodoItem[]
): number | null {
  if (typeof taskId === 'string' || typeof taskId === 'number') {
    const key = String(taskId);
    const mapped = taskIdToIndex.get(key);
    if (typeof mapped === 'number') {
      return mapped;
    }

    if (/^\d+$/.test(key)) {
      const numericIndex = Number.parseInt(key, 10) - 1;
      if (numericIndex >= 0 && numericIndex < latestTodos.length) {
        return numericIndex;
      }
    }
  }

  return null;
}

function normalizeTaskStatus(status: unknown): TodoItem['status'] | null {
  if (typeof status !== 'string') return null;

  switch (status) {
    case 'pending':
    case 'not_started':
      return 'pending';
    case 'in_progress':
    case 'running':
      return 'in_progress';
    case 'completed':
    case 'complete':
    case 'done':
      return 'completed';
    default:
      return null;
  }
}
