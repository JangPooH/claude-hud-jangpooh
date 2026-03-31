export interface NonstopInfo {
    currentAccount: string | null;
    currentAccountType: string | null;
    otherCount: number;
}
export declare function getNonstopInfo(transcriptPath?: string): Promise<NonstopInfo | null>;
//# sourceMappingURL=nonstop.d.ts.map