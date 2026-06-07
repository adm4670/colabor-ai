import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS } from "../constants/instructions";
    
    // ============================================================
    // FALLBACK MESSAGES
    // ============================================================
    const FALLBACK_MESSAGES: string[] = [
      "Deixa eu ver o que voc\u00ea precisa...",
      "J\u00e1 sei por onde come\u00e7ar, s\u00f3 um instante.",
      "Estou analisando sua solicita\u00e7\u00e3o...",
      "Deixa comigo, vou resolver isso pra voc\u00ea.",
      "Processando... j\u00e1 j\u00e1 te respondo.",
      "Deixa eu consultar as informa\u00e7\u00f5es aqui...",
      "T\u00f4 dando uma olhada nisso pra voc\u00ea.",
      "S\u00f3 um momento, estou verificando...",
      "T\u00e1 quase pronto, s\u00f3 mais um segundinho.",
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
      - Responda SEMPRE em portugu\u00eas do Brasil.
      - Seja curto: m\u00e1ximo 150 caracteres (max 150 chars).
      - Tom amig\u00e1vel e natural, como se estivesse pensando alto.
      - NUNCA mencione: agentes, ferramentas, modelos, prompts, ou termos t\u00e9cnicos.
      - NUNCA use jarg\u00e3o t\u00e9cnico.
      - NUNCA se refira a si mesmo como "agente" ou "IA".
      - Apenas traduza o progresso em uma mensagem natural.
    
      Exemplos:
      - Input: "Agent PythonAgent executando c\u00f3digo..." -> "Deixa eu rodar um c\u00f3digo aqui rapidinho..."
      - Input: "Agent browserAgent acessando site..." -> "Vou dar uma olhada nesse site pra voc\u00ea..."
      - Input: "Agent plannerAgent planejando pr\u00f3ximos passos..." -> "J\u00e1 sei o pr\u00f3ximo passo, s\u00f3 um instante..."
      - Input: "Passo 2 de 5: Analisando resultados..." -> "T\u00f4 analisando os resultados aqui..."
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
    