import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, SLIM_PYTHON_INSTRUCTIONS } from "../constants/instructions";
    import { MODEL_TIERS } from "../config/config";
    import { pythonExecTool } from "../tools/pythonExecTool";
    import { memorySearchTool } from "../memory/memory_search";
    
    export const pythonAgent = new Agent({
        name: "PythonAgent",
        role: "Python execution specialist",
        goal: "Solve tasks using Python and return the result clearly",
        backstory: "An assistant specialized in writing and executing Python code to solve problems.",
        model: MODEL_TIERS.executor,  // flash
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseURL: "https://api.deepseek.com",
    
        // Apenas 2 tools essenciais
        tools: [pythonExecTool, memorySearchTool],
    
        functions: {
            execute_python: pythonExecTool.handler,
            memory_search: memorySearchTool.handler,
        },
    
        generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
            ${SLIM_PYTHON_INSTRUCTIONS}
            `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
        name: pythonAgent.name,
        description: "Python execution. Code, calculations, data analysis, file manipulation.",
        agent: pythonAgent,
        role: "PythonAgent",
        useWhen: ["calculations", "data analysis", "code", "scripting"],
    });
    