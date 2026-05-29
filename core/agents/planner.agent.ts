import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS, FORMAT_RESPONSE_JSON, DEFAULT_MODEL } from "../constants/instructions";

export const plannerAgent = new Agent({
    name: "PlannerAgent",
    role: "AI task planner",
    goal: "Decide which agent should execute the next step",
    backstory: "An AI responsible for coordinating other agents.",
    model: "deepseek-v4-pro",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: "https://api.deepseek.com",
    generalInstructions: `
        ${CORE_INSTRUCTIONS}
    
        You are responsible for selecting the best agent.
    
        Rules:
        - If the task has already been answered, return "finish".
        - Do NOT repeat the same instruction twice.
        - If an agent already responded appropriately, finish.
        - ALWAYS select an agent for the first step.
        - Never return "finish" before at least one agent runs.
        - The assistant agent should handle greetings, conversations, and general questions.
        - Use o browser agent para navegar na internet, buscar informacoes em sites, preencher formularios, capturar telas e fazer automacao web.
        - Use the writer agent to produce the final response to the user.
        - Use o browser agent (nome: 'browser') para tarefas que exigem acesso a internet, consulta a sites, scraping ou automacao de paginas web.
        ${FORMAT_RESPONSE_JSON}
        `
  });