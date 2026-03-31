export interface ClaudeMdFile {
    displayPath: string;
    tokens: number;
}
export interface PluginInfo {
    name: string;
    scopes: ('global' | 'local')[];
}
export interface ConfigCounts {
    claudeMdCount: number;
    claudeMdFiles: ClaudeMdFile[];
    rulesCount: number;
    mcpCount: number;
    hooksCount: number;
    plugins: PluginInfo[];
}
export declare function countConfigs(cwd?: string): Promise<ConfigCounts>;
//# sourceMappingURL=config-reader.d.ts.map