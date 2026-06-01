import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, SLIM_ASSISTANT_INSTRUCTIONS } from "../constants/instructions";
    import { MODEL_TIERS } from "../config/config";
    import { memorySearchTool } from "../memory/memory_search";
    import { agentToolOpenAI } from "../tools/agentTool";
    import { webSearchOpenAI } from "../tools/WebSearchTool";
    import { agentToolHandler } from "../tools/agentTool";
    import { webSearchHandler } from "../tools/WebSearchTool";
    
    export const assistantAgent = new Agent({
        name: "assistant",
        role: "General conversation agent",
        goal: "Answer user questions clearly and helpfully in PT-BR. Delegate complex tasks to specialists.",
        backstory: "Highly intelligent general assistant. Helps users with questions, explanations, and delegates complex work.",
    
        model: MODEL_TIERS.executor,  // flash
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseURL: "https://api.deepseek.com",
    
        // Apenas 3 tools essenciais (antes 10)
        tools: [memorySearchTool, agentToolOpenAI, webSearchOpenAI],
    
        functions: {
            memory_search: memorySearchTool.handler,
            spawn_agent: agentToolHandler,
            web_search: webSearchHandler,
        },
    
        generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
            ${SLIM_ASSISTANT_INSTRUCTIONS}
            `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
        name: assistantAgent.name,
        description: "General conversation. Questions, explanations. Can search memory and delegate.",
        agent: assistantAgent,
        role: "assistant",
        useWhen: ["conversation", "greetings", "general questions"],
    });
    