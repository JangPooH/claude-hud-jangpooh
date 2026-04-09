export interface ModelPricing {
    inputPerMTok: number;
    outputPerMTok: number;
    cacheWritePerMTok: number;
    cacheWrite1hPerMTok?: number;
    cacheReadPerMTok: number;
}
export declare function getPricing(modelId: string | undefined): {
    pricing: ModelPricing;
    isUnknown: boolean;
};
export declare function getUpdateScriptPath(): string;
//# sourceMappingURL=pricing.d.ts.map