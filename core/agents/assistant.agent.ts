import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
    import { memorySearchTool } from "../memory/memory_search";
            import { agentToolOpenAI } from "../tools/agentTool";
            import { taskCreateOpenAI, taskListOpenAI } from "../tools/taskCreateTool";
    import { todoWriteOpenAI } from "../tools/TodoWriteTool";
    import { webSearchOpenAI } from "../tools/WebSearchTool";
    import { scheduleTaskOpenAI, listScheduledOpenAI } from "../tools/ScheduleTaskTool";
            import { agentToolHandler } from "../tools/agentTool";
            import { taskCreateHandler, taskListHandler } from "../tools/taskCreateTool";
    import { todoWriteHandler } from "../tools/TodoWriteTool";
    import { webSearchHandler } from "../tools/WebSearchTool";
    import { scheduleTaskHandler, listScheduledHandler } from "../tools/ScheduleTaskTool";
    
    export const assistantAgent = new Agent({
      name: "assistant",
    
      role: "General conversation agent",
    
      model: "deepseek-v4-pro",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseURL: "https://api.deepseek.com",
    
      tools: [memorySearchTool, agentToolOpenAI, taskCreateOpenAI, taskListOpenAI, todoWriteOpenAI, webSearchOpenAI, scheduleTaskOpenAI, listScheduledOpenAI],
    
      functions: {
        memory_search: memorySearchTool.handler,
      },
    
      goal: `
    Responder perguntas do usuario de forma clara, util e natural.
    Explicar conceitos, tirar duvidas e manter uma conversa produtiva.
    `,
    
      backstory: `
    Voce e um assistente geral altamente inteligente.
    Voce ajuda usuarios respondendo perguntas, explicando conceitos
    e mantendo conversas uteis.
    
    Voce tambem pode consultar a memoria de longo prazo (MEMORY.md)
    para lembrar de informacoes importantes sobre o usuario e o projeto.
    
    Voce nao executa tarefas complexas de programacao ou calculos pesados,
    a menos que seja algo simples.
    Seu foco e comunicacao clara e ajuda geral.
    `,
    
      generalInstructions: `
        ${CORE_INSTRUCTIONS}
    
    - Responda sempre em PT-BR.
    - Seja claro e direto.
    - Explique conceitos quando necessario.
    - Se a pergunta for simples, responda de forma curta.
    - Se a pergunta exigir explicacao, responda de forma didatica.
    - Nunca invente informacoes.
    - Se nao souber algo, diga que nao sabe.
    - Use memory_search para consultar a memoria de longo prazo quando relevante.
    
        `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
      name: assistantAgent.name,
      description: "General conversation, questions and explanations. Can search memory.",
      agent: assistantAgent,
      role: "assistant",
      useWhen: ["conversation", "greetings", "general questions"],
    });
    