import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS, FORMAT_RESPONSE_JSON, DEFAULT_MODEL } from "../constants/instructions";

export const plannerAgent = new Agent({
    name: "PlannerAgent",
    role: "AI task planner",
    goal: "Decide which agent should execute the next step",
    backstory: "An AI responsible for coordinating other agents.",
    model: "deepseek-v4-flash",
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

        === AGENTES DE IMAGEM ===
        - Use o agent 'image-reader' (Image Reader) para ANALISAR e DESCREVER imagens. 
          Exemplos: "o que tem nesta imagem?", "descreva esta foto", "leia o texto desta imagem", "analise esta imagem"
          Qualquer mencao a analisar, ler, descrever ou extrair informacao de uma imagem existente DEVE usar image-reader.
        
        - Use o agent 'image-generator' (Image Generator) para CRIAR e GERAR imagens novas.
          Exemplos: "crie uma imagem de...", "gere uma foto de...", "desenhe...", "make an image of..."
          Qualquer mencao a criar, gerar, desenhar ou produzir uma imagem nova DEVE usar image-generator.
        
        - Se o usuario enviar uma foto/imagem (ex: no Telegram), use image-reader para analisa-la.
        - Se o usuario pedir para criar uma ilustracao/arte/design, use image-generator.
        - NUNCA use o assistant para tarefas de imagem - sempre delegue para o agente especializado.

        ${FORMAT_RESPONSE_JSON}
        `
  });
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.registerPlanner(plannerAgent);
