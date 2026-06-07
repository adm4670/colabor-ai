// ============================================================
    // Planner Agent - Orquestrador de agentes
    // ============================================================
    
    import OpenAI from "openai";
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    interface ProcessInput {
      userId: string;
      message: string;
      conversationId?: string;
    }
    
    interface ProcessResult {
      response: string;
      conversationId: string;
      agentUsed: string;
      toolsCalled: number;
    }
    
    class PlannerAgent {
      async process(input: ProcessInput): Promise<ProcessResult> {
        // Decide qual agente ou tool usar baseado na mensagem
        const agent = this.routeMessage(input.message);
    
        // Por enquanto, retorna uma resposta simulada
        // Na implementacao completa, cada agente tera sua logica
        const response = await this.callLLM(input.message, agent);
    
        return {
          response,
          conversationId: input.conversationId || crypto.randomUUID(),
          agentUsed: agent,
          toolsCalled: 0,
        };
      }
    
      private routeMessage(message: string): string {
        const lower = message.toLowerCase();
    
        if (lower.includes("git") || lower.includes("github") || lower.includes("commit") || lower.includes("pr")) {
          return "GitAgent";
        }
        if (lower.includes("banco") || lower.includes("sql") || lower.includes("consulta") || lower.includes("dados")) {
          return "DBAgent";
        }
        if (lower.includes("imagem") || lower.includes("foto") || lower.includes("ocr") || lower.includes("descrever")) {
          return "ImageAgent";
        }
        if (lower.includes("notificar") || lower.includes("aviso") || lower.includes("alerta") || lower.includes("lembrete")) {
          return "NotificationAgent";
        }
        if (lower.includes("relatorio") || lower.includes("analise") || lower.includes("grafico") || lower.includes("planilha")) {
          return "DataAnalystAgent";
        }
    
        return "AssistantAgent";
      }
    
      private async callLLM(message: string, agent: string): Promise<string> {
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `Voce e o agente '${agent}'. Responda de forma clara e util em PT-BR.`,
              },
              { role: "user", content: message },
            ],
            max_tokens: 2000,
          });
    
          return response.choices[0]?.message?.content || "Nao foi possivel gerar resposta.";
        } catch (err: any) {
          console.error("[LLM] Erro:", err.message);
          return `Erro ao processar: ${err.message}`;
        }
      }
    }
    
    export const plannerAgent = new PlannerAgent();
    