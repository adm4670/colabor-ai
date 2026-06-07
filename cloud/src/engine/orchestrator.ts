// ============================================================
    // Orchestrator - Fluxo principal de processamento
    // Gerencia o ciclo: mensagem -> planner -> tools -> resposta
    // ============================================================
    
    import { plannerAgent } from "../agents/planner";
    import { toolRouter } from "./toolRouter";
    
    export interface OrchestratorInput {
      userId: string;
      message: string;
      conversationId?: string;
      sessionId: string;
    }
    
    export interface OrchestratorResult {
      response: string;
      conversationId: string;
      steps: OrchestratorStep[];
    }
    
    export interface OrchestratorStep {
      agent: string;
      action: string;
      result: string;
      duration: number;
    }
    
    class Orchestrator {
      async process(input: OrchestratorInput): Promise<OrchestratorResult> {
        const steps: OrchestratorStep[] = [];
        const startTime = Date.now();
    
        // Step 1: Planner decide o que fazer
        const planResult = await plannerAgent.process({
          userId: input.userId,
          message: input.message,
          conversationId: input.conversationId,
        });
    
        steps.push({
          agent: planResult.agentUsed,
          action: "process_message",
          result: planResult.response.substring(0, 200),
          duration: Date.now() - startTime,
        });
    
        // Step 2: Se precisar de tools, roteia
        if (this.needsTool(input.message)) {
          const toolResult = await toolRouter.route({
            userId: input.userId,
            message: input.message,
            sessionId: input.sessionId,
          });
    
          if (toolResult) {
            steps.push({
              agent: "ToolRouter",
              action: toolResult.toolName,
              result: toolResult.result.substring(0, 200),
              duration: Date.now() - startTime,
            });
          }
        }
    
        return {
          response: planResult.response,
          conversationId: planResult.conversationId,
          steps,
        };
      }
    
      private needsTool(message: string): boolean {
        const toolKeywords = [
          "arquivo", "pasta", "ler", "escrever", "criar", "deletar",
          "buscar", "pesquisar", "internet", "google",
          "api", "github", "notificar",
        ];
        const lower = message.toLowerCase();
        return toolKeywords.some((kw) => lower.includes(kw));
      }
    }
    
    export const orchestrator = new Orchestrator();
    