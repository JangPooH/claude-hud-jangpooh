export interface ClaudeMdFile {
    displayPath: string;
    tokens: number;
}
export interface PluginInfo {
    name: string;
    scopes: ('global' | 'local')[];
}
export interface RulesFileInfo {
    name: string;
    paths: string[];
    scope: 'global' | 'parent' | 'local';
    baseDir: string;
}
export interface ConfigCounts {
    claudeMdCount: number;
    claudeMdFiles: ClaudeMdFile[];
    rulesCount: number;
    globalRulesCount: number;
    parentRulesCount: number;
    localRulesCount: number;
    rulesFiles: RulesFileInfo[];
    mcpCount: number;
    hooksCount: number;
    plugins: PluginInfo[];
    thinkingBudget: number | null;
    effort: string | null;
}
export declare function countConfigs(cwd?: string): Promise<ConfigCounts>;
//# sourceMappingURL=config-reader.d.ts.map