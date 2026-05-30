import type { CloudMessage, ChatResponse } from "../types";
import type { ToolCallMessage, ToolResultMessage } from "../protocol/tool-protocol";
/** Callback chamado quando o orchestrator precisa executar uma tool local */
export type LocalToolCallback = (toolCall: ToolCallMessage) => Promise<ToolResultMessage>;
export interface AgentEntry {
    name: string;
    description: string;
    /** "cloud" = executa no servidor, "local" = executa via WebSocket no client */
    location: "cloud" | "local";
    handler: (instruction: string, context: string) => Promise<string>;
}
export declare class AgentOrchestrator {
    private planner;
    private agents;
    private contextEngine;
    private memoryEngine;
    private pythonAgent;
    private sessionId;
    private onLocalTool?;
    constructor(sessionId: string, onLocalTool?: LocalToolCallback);
    /** Set the callback for local tool execution */
    setLocalToolCallback(cb: LocalToolCallback): void;
    run(input: string, history?: CloudMessage[]): Promise<AsyncGenerator<ChatResponse>>;
    /**
     * Parse a planner instruction into a structured ToolCallMessage.
     * The planner's instruction contains what to do; we extract the tool name and params.
     */
    private parseLocalInstruction;
}
//# sourceMappingURL=orchestrator.d.ts.map