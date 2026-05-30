export interface SubAgentInfo {
    name: string;
    description: string;
}
export interface PlannerDecision {
    agent: string;
    instruction: string;
}
export declare class PlannerAgent {
    private client;
    private model;
    constructor(model?: string);
    decide(input: string, history: string, context: string, agents: SubAgentInfo[]): Promise<PlannerDecision>;
}
//# sourceMappingURL=planner.d.ts.map