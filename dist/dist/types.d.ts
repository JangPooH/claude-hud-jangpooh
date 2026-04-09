import type { HudConfig } from './config.js';
import type { GitStatus } from './git.js';
import type { NonstopInfo } from './nonstop.js';
import type { ClaudeMdFile, PluginInfo, RulesFileInfo } from './config-reader.js';
export interface StdinData {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    version?: string;
    model?: {
        id?: string;
        display_name?: string;
    };
    cost?: {
        total_cost_usd?: number;
        total_duration_ms?: number;
        total_api_duration_ms?: number;
        total_lines_added?: number;
        total_lines_removed?: number;
    };
    context_window?: {
        total_input_tokens?: number;
        total_output_tokens?: number;
        context_window_size?: number;
        current_usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        } | null;
        used_percentage?: number | null;
        remaining_percentage?: number | null;
    };
    rate_limits?: {
        five_hour?: {
            used_percentage?: number | null;
            resets_at?: number | null;
        } | null;
        seven_day?: {
            used_percentage?: number | null;
            resets_at?: number | null;
        } | null;
    } | null;
}
export interface ToolEntry {
    id: string;
    name: string;
    target?: string;
    status: 'running' | 'completed' | 'error';
    startTime: Date;
    endTime?: Date;
}
export interface AgentEntry {
    id: string;
    type: string;
    model?: string;
    description?: string;
    status: 'running' | 'completed';
    startTime: Date;
    endTime?: Date;
}
export interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}
export interface UsageData {
    fiveHour: number | null;
    sevenDay: number | null;
    fiveHourResetAt: Date | null;
    sevenDayResetAt: Date | null;
}
export interface MemoryInfo {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
}
/** Check if usage limit is reached (either window at 100%) */
export declare function isLimitReached(data: UsageData): boolean;
export interface TurnCost {
    model?: string;
    messageId?: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheCreation5mTokens?: number;
    cacheCreation1hTokens?: number;
    cacheReadTokens: number;
    cost: number;
    userTurn?: number;
    userMessage?: string;
    tools?: string[];
}
export interface TranscriptData {
    tools: ToolEntry[];
    agents: AgentEntry[];
    todos: TodoItem[];
    sessionStart?: Date;
    sessionName?: string;
    turnCosts: TurnCost[];
    sessionCost: number;
    userTurnCount: number;
    unknownPricingModels: string[];
    thinkingBudgetExhaustedAtTurn: number | null;
    cacheCreation5mTokens: number;
    cacheCreation1hTokens: number;
}
export interface RenderContext {
    stdin: StdinData;
    transcript: TranscriptData;
    claudeMdCount: number;
    claudeMdFiles: ClaudeMdFile[];
    rulesCount: number;
    globalRulesCount: number;
    parentRulesCount: number;
    localRulesCount: number;
    rulesFiles: RulesFileInfo[];
    matchedRulesFiles: {
        name: string;
        scope: 'global' | 'parent' | 'local';
    }[];
    mcpCount: number;
    hooksCount: number;
    plugins: PluginInfo[];
    thinkingBudget: number | null;
    effort: string | null;
    sessionDuration: string;
    gitStatus: GitStatus | null;
    usageData: UsageData | null;
    memoryUsage: MemoryInfo | null;
    config: HudConfig;
    extraLabel: string | null;
    claudeCodeVersion?: string;
    nonstopInfo: NonstopInfo | null;
}
//# sourceMappingURL=types.d.ts.map