import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, SLIM_REFLECTOR_INSTRUCTIONS } from "../constants/instructions";
    import { MODEL_TIERS } from "../config/config";
    
    export const reflectorAgent = new Agent({
        name: "ReflectorAgent",
        role: "Result evaluator",
        goal: "Evaluate agent execution results and decide if retry is needed",
        backstory: "AI specialized in evaluating task completion. Identifies missing info and suggests alternative approaches.",
    
        model: MODEL_TIERS.reflector,  // flash
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseURL: "https://api.deepseek.com",
    
        generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
            ${SLIM_REFLECTOR_INSTRUCTIONS}
    
            Evaluate the result of an agent's work.
            Receive: original task, agent used, instruction given, result produced.
    
            Evaluate honestly:
            1. Did the agent succeed? (yes / partial / no)
            2. Is the result complete? (true/false)
            3. Missing information? (list)
            4. Try different approach? (true/false)
            5. What did we learn? (one sentence in portuguese)
    
            Respond ONLY with JSON:
            {
                "success": "yes | partial | no",
                "complete": true/false,
                "missingInfo": ["item1"],
                "retryDifferent": true/false,
                "learning": "one sentence"
            }
            `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
        name: reflectorAgent.name,
        description: "Result evaluator. Assesses agent success, missing info, suggests retry.",
        agent: reflectorAgent,
        role: "reflector",
        useWhen: ["evaluation", "result analysis", "quality check"],
    });
    