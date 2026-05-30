import type { CloudMessage } from "../types";
export interface ContextEngineConfig {
    maxTokens: number;
    recentRatio: number;
    minMessages: number;
    mode: "trim" | "summarize";
    keepRecentIntact: number;
    summarizeZoneSize: number;
    summaryModel?: string;
}
export interface ContextSummary {
    messages: CloudMessage[];
    summarizedCount: number;
    estimatedTokens: number;
    summary?: string;
}
export declare function estimateTokens(text: string): number;
export declare function estimateMessagesTokens(messages: CloudMessage[]): number;
export declare class ContextEngine {
    private config;
    private rawHistory;
    private llmClient;
    private summaryCache;
    constructor(config?: Partial<ContextEngineConfig>);
    setHistory(messages: CloudMessage[]): void;
    addMessage(message: CloudMessage): void;
    getRawHistory(): CloudMessage[];
    buildContext(): Promise<ContextSummary>;
    private summarizeIntelligently;
    private summarizeWithLLM;
    private compress;
    private generateSimpleSummary;
}
export declare function getDefaultEngine(): ContextEngine;
//# sourceMappingURL=context-engine.d.ts.map