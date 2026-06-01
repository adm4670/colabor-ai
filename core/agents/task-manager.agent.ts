import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, SLIM_TASK_MANAGER_INSTRUCTIONS } from "../constants/instructions";
    import { MODEL_TIERS } from "../config/config";
    import { taskTools, taskFunctions } from "../tools/task.tools";
    
    export const taskManagerAgent = new Agent({
        name: "task_manager",
        role: "Activity management agent",
        goal: "Gerenciar atividades do usuario: criar, consultar e excluir tarefas.",
        backstory: "Assistente especializado em organizacao de tarefas e agenda.",
    
        model: MODEL_TIERS.executor,  // flash
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseURL: "https://api.deepseek.com",
    
        tools: taskTools,
        functions: taskFunctions,
    
        generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
            ${SLIM_TASK_MANAGER_INSTRUCTIONS}
    
            Responda em PT-BR. Nao invente atividades. Confirme acoes importantes.
            `
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
        name: taskManagerAgent.name,
        description: "Task management. Create, list, delete tasks/activities.",
        agent: taskManagerAgent,
        role: "task_manager",
        useWhen: ["tasks", "activities", "schedule"],
    });
    