import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS } from "../constants/instructions";
    
    // ============================================================
    // FALLBACK MESSAGES
    // ============================================================
    const FALLBACK_MESSAGES: string[] = [
      "Deixa eu ver o que você precisa...",
      "Já sei por onde começar, só um instante.",
      "Estou analisando sua solicitação...",
      "Deixa comigo, vou resolver isso pra você.",
      "Processando... já já te respondo.",
      "Deixa eu consultar as informações aqui...",
      "Tô dando uma olhada nisso pra você.",
      "Só um momento, estou verificando...",
      "Tá quase pronto, só mais um segundinho.",
      "Deixa eu preparar isso com cuidado...",
    ];
    
    export function getRandomFallback(): string {
      return FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
    }
    
    // ============================================================
    // THINKING AGENT
    // ============================================================
    export const thinkingAgent = new Agent({
      name: "ThinkingAgent",
      role: "Progress translator",
      goal: "Transform technical progress updates into natural, friendly messages in PT-BR",
      backstory: `A friendly assistant that translates internal progress updates 
      into natural-sounding messages for the user. Short, warm, and never technical.`,
      model: process.env.THINKING_MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || "",
      baseURL: "https://api.deepseek.com",
      generalInstructions: `
      ${CORE_INSTRUCTIONS}
    
      You are a friendly assistant that translates internal progress messages 
      into natural, conversational updates for the user on Telegram.
    
      RULES:
      - Responda SEMPRE em português do Brasil.
      - Seja curto: máximo 150 caracteres (max 150 chars).
      - Tom amigável e natural, como se estivesse pensando alto.
      - NUNCA mencione: agentes, ferramentas, modelos, prompts, ou termos técnicos.
      - NUNCA use jargão técnico.
      - NUNCA se refira a si mesmo como "agente" ou "IA".
      - Apenas traduza o progresso em uma mensagem natural.
    
      Exemplos:
      - Input: "Agent PythonAgent executando código..." -> "Deixa eu rodar um código aqui rapidinho..."
      - Input: "Agent browserAgent acessando site..." -> "Vou dar uma olhada nesse site pra você..."
      - Input: "Agent plannerAgent planejando próximos passos..." -> "Já sei o próximo passo, só um instante..."
      - Input: "Passo 2 de 5: Analisando resultados..." -> "Tô analisando os resultados aqui..."
      `,
    });
    
    // ============================================================
    // GENERATE THINKING MESSAGE
    // ============================================================
    export interface ThinkingInfo {
      agent?: string;
      stage?: string;
      description?: string;
      step?: number;
      total?: number;
    }
    
    function buildPrompt(info: ThinkingInfo): string {
      const parts: string[] = [];
      if (info.agent) parts.push(`Agent: ${info.agent}`);
      if (info.stage) parts.push(`Stage: ${info.stage}`);
      if (info.description) parts.push(`Description: ${info.description}`);
      if (info.step !== undefined && info.total !== undefined) {
        parts.push(`Step ${info.step} of ${info.total}`);
      }
      if (parts.length === 0) return "User is waiting for a response.";
      return parts.join("\n");
    }
    
    export async function generateThinkingMessage(info: ThinkingInfo): Promise<string> {
      // Fallback imediato se nao tiver informacao util
      if (!info.description && !info.stage && !info.agent) {
        return getRandomFallback();
      }
    
      const prompt = buildPrompt(info);
    
      try {
        // Usa o metodo run() do Agent que aceita string e retorna string
        const response = await thinkingAgent.run(prompt);
        
        // Validacao: resposta precisa existir e ser curta
        if (response && response.length > 0 && response.length < 200) {
          return response.replace(/^["']|["']$/g, "").trim();
        }
    
        return getRandomFallback();
      } catch (error) {
        // Erro na chamada LLM - fallback silencioso
        return getRandomFallback();
      }
    }
    