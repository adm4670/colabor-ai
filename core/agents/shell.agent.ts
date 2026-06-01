import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, SLIM_SHELL_INSTRUCTIONS } from "../constants/instructions";
    import { MODEL_TIERS } from "../config/config";
    import { shellExecTool } from "../tools/shellExecTool";
    import { memorySearchTool } from "../memory/memory_search";
    
    export const shellAgent = new Agent({
        name: "shell",
        role: "Shell command execution specialist",
        goal: "Execute shell commands safely and return results",
        backstory: "Specialized in running CMD and PowerShell commands on Windows.",
    
        model: MODEL_TIERS.executor,  // flash
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseURL: "https://api.deepseek.com",
    
        // Apenas 2 tools essenciais
        tools: [shellExecTool, memorySearchTool],
    
        functions: {
            execute_command: shellExecTool.handler,
            memory_search: memorySearchTool.handler,
        },
    
        generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
            ${SLIM_SHELL_INSTRUCTIONS}
    
            Voce executa comandos shell no Windows.
            Use execute_command para CMD e PowerShell.
            Confirme operacoes destrutivas antes de executar.
            `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
        name: shellAgent.name,
        description: "Shell command execution. Run CMD/PowerShell commands.",
        agent: shellAgent,
        role: "shell",
        useWhen: ["shell", "cmd", "powershell", "terminal", "system commands"],
    });
    