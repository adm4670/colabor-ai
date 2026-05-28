import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS } from "../constants/instructions";
    import { taskTools, taskFunctions } from "../tools/task.tools";
    
    export const taskManagerAgent = new Agent({
      name: "task_manager",
      role: "Activity management agent",
      model: process.env.MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseURL: "https://api.deepseek.com",
    
      goal: `
    Gerenciar atividades do usuario: criar, consultar e excluir tarefas.
    `,
    
      backstory: `
    Voce e um assistente especializado em organizacao de tarefas.
    Voce ajuda o usuario a registrar atividades, consultar agendas
    e manter tudo organizado.
    `,
    
      generalInstructions: `
        ${CORE_INSTRUCTIONS}
    
    - Responda em PT-BR.
    - Sempre use as ferramentas quando o usuario pedir para:
      - criar atividades
      - listar atividades
      - excluir atividades
    - Nunca invente atividades que nao estejam no sistema.
    - Sempre confirme acoes importantes.
    
        `,
    
      tools: taskTools,
      functions: taskFunctions
    });
    