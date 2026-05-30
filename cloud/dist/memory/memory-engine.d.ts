interface TranscriptMessage {
    role: string;
    content: string;
}
export declare class MemoryEngine {
    private memoryCache;
    private memoryCacheTime;
    private readonly CACHE_TTL;
    recall(query: string, context?: string, maxResults?: number): string;
    consolidate(transcript: TranscriptMessage[]): {
        type: string;
        content: string;
    }[];
    manageWorkingMemory(messages: TranscriptMessage[], maxTokens: number): TranscriptMessage[];
    private tokenize;
    private getMemoryContent;
    private ensureMemoryDir;
    private scoreAndAdd;
    private summarizeMessages;
    private appendFactsToMemory;
}
export declare function getMemoryEngine(): MemoryEngine;
export {};
//# sourceMappingURL=memory-engine.d.ts.map