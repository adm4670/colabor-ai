import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
    import { memorySearchTool } from "../memory/memory_search";
        import { vectorMemoryStoreTool, vectorMemorySearchTool, vectorMemoryStatsTool } from "../memory/vector-memory-tools";
    
    export const assistantAgent = new Agent({
      name: "assistant",
    
      role: "General conversation agent",
    
      model: "deepseek-v4-flash",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseURL: "https://api.deepseek.com",
    
      tools: [memorySearchTool, vectorMemoryStoreTool, vectorMemorySearchTool, vectorMemoryStatsTool, fileSystemTool, webSearchTool, apiIntegrationTool, taskSchedulerTool],
    
      functions: {
        memory_search: memorySearchTool.handler,
        vector_memory_store: vectorMemoryStoreTool.handler,
        vector_memory_search: vectorMemorySearchTool.handler,
        vector_memory_stats: vectorMemoryStatsTool.handler,
              file_system: fileSystemTool.handler,
              web_search: webSearchTool.handler,
              api_request: apiIntegrationTool.handler,
              task_scheduler: taskSchedulerTool.handler,
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
    import { fileSystemTool } from "../tools/fileSystemTool";
    import { webSearchTool } from "../tools/webSearchTool";
    import { apiIntegrationTool } from "../tools/apiIntegrationTool";
    import { taskSchedulerTool } from "../tools/taskSchedulerTool";
    agentRegistry.register({
      name: assistantAgent.name,
      description: "General conversation, questions and explanations. Can search memory.",
      agent: assistantAgent,
      role: "assistant",
      useWhen: ["conversation", "greetings", "general questions"],
    });
    