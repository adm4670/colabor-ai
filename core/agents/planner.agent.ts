import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, PLANNER_SYSTEM_PROMPT, PLANNER_RESPONSE_FORMAT, DEFAULT_MODEL } from "../constants/instructions";
    import { MODEL_TIERS } from "../config/config";
    
    export const plannerAgent = new Agent({
        name: "PlannerAgent",
        role: "AI task planner",
        goal: "Route tasks to appropriate agents. Create plans for complex multi-step tasks.",
        backstory: "Coordinates agents by selecting the best one for each step.",
        model: MODEL_TIERS.planner,  // flash para roteamento, pro para planos complexos
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseURL: "https://api.deepseek.com",
        generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
            ${PLANNER_SYSTEM_PROMPT}
    
            ${PLANNER_RESPONSE_FORMAT}
            `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.registerPlanner(plannerAgent);
    