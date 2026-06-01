import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, SLIM_BROWSER_INSTRUCTIONS } from "../constants/instructions";
    import { MODEL_TIERS } from "../config/config";
    import { browserExecTool, ensureBrowserAlive } from "../tools/browserExecTool";
    import { browserNavigateOpenAI } from "../tools/browserNavigateTool";
    import { webSearchOpenAI } from "../tools/WebSearchTool";
    import { memorySearchTool } from "../memory/memory_search";
    import { browserNavigateHandler } from "../tools/browserNavigateTool";
    import { webSearchHandler } from "../tools/WebSearchTool";
    
    export const browserAgent = new Agent({
        name: "browser",
        role: "Web navigation and browser automation specialist",
        goal: "Navigate web pages, search the internet, fill forms, extract information",
        backstory: "Specialized in browser automation: opening sites, clicking elements, filling forms, extracting text and screenshots.",
    
        model: MODEL_TIERS.executor,  // flash
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseURL: "https://api.deepseek.com",
    
        // Apenas 4 tools essenciais (antes 12)
        tools: [browserExecTool, browserNavigateOpenAI, webSearchOpenAI, memorySearchTool],
    
        functions: {
            browser_action: browserExecTool.handler,
            browser_navigate: browserNavigateHandler,
            web_search: webSearchHandler,
            memory_search: memorySearchTool.handler,
        },
    
        generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
            ${SLIM_BROWSER_INSTRUCTIONS}
    
            Voce e um agente especializado em navegacao web.
    
            Use browser_navigate para tarefas complexas com MULTIPLOS passos:
              { url: "https://site.com", steps: [
                { type: "fill", selector: "#email", value: "user@email.com" },
                { type: "click", selector: "button[type=submit]" },
                { type: "extract", selector: ".result" }
              ]}
    
            Use browser_action para acoes simples: navigate, click, fill, extractText, screenshot, scroll, close.
            Use web_search para buscas no DuckDuckGo.
            `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
        name: browserAgent.name,
        description: "Web navigation specialist. Open sites, click, fill forms, extract text, search web.",
        agent: browserAgent,
        role: "browser",
        useWhen: ["web navigation", "internet search", "form filling", "screenshot"],
    });
    