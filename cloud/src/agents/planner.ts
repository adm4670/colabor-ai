/**
     * PlannerAgent - Decide qual agente usar e com qual instrucao.
     * Cloud edition: roda no servidor.
     * 
     * v2: Interface simplificada — recebe contexto unificado do ContextEngine
     *     em vez de history + context separados.
     */
    import type OpenAI from "openai";
    import { createDefaultClient } from "../llm/provider";
    import { logger } from "../utils/logger";
    
    export interface SubAgentInfo {
      name: string;
      description: string;
    }
    
    export interface PlannerDecision {
      agent: string;
      instruction: string;
    }
    
    export class PlannerAgent {
      private client: OpenAI;
      private model: string;
    
      constructor(model?: string) {
        this.client = createDefaultClient();
        this.model = model || "deepseek-v4-pro";
        logger.info(`[PlannerAgent] Inicializado com modelo ${this.model}`);
      }
    
      async decide(
        input: string,
        context: string,
        agents: SubAgentInfo[],
      ): Promise<PlannerDecision> {
        const agentList = agents.map((a) => `${a.name}: ${a.description}`).join("\n");
    
        const prompt = `You are a planner that decides the next agent to call.
    
    User request:
    ${input}
    
    Context (conversation history + previous agent results):
    ${context}
    
    Available agents:
    ${agentList}
    
    Rules:
        1. ALWAYS select an agent for the first step.
        2. Never return "finish" before an agent has produced a result.
        3. Do NOT repeat the same instruction twice.
        4. Use assistant for conversation and general questions.
        5. Use python_code for calculations or code.
        6. For complex multi-step tasks, create a plan first.
        7. Use spawn_agent to delegate independent sub-tasks in parallel.
        8. Use create_background_task for long-running async tasks.
        9. Return "finish" when the user's request has been fully satisfied.
    
    Respond ONLY with JSON:
        {
          "agent": "agent_name | finish",
          "instruction": "what the agent should do OR final answer"
        }`;
    
        try {
          const response = await this.retryCreate(
            { role: "user", content: prompt },
            3
          );
    
          const raw = response.choices[0]?.message?.content?.trim() || "{}";
          // Extract JSON from possible markdown wrapper
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          const json = jsonMatch ? jsonMatch[0] : raw;
          const parsed = JSON.parse(json);
          return {
            agent: parsed.agent || "assistant",
            instruction: parsed.instruction || input,
          };
        } catch (err) {
          logger.error(`[PlannerAgent] Erro: ${err}`);
          return { agent: "assistant", instruction: input };
        }
      }

      private async retryCreate(
        message: { role: string; content: string },
        maxRetries: number,
        attempt = 0,
      ): Promise<any> {
        try {
          return await this.client.chat.completions.create({
            model: this.model,
            messages: [message],
            max_tokens: 500,
            temperature: 0.3,
          });
        } catch (err: any) {
          const isRateLimit = err?.status === 429 || err?.status === 503 || err?.status === 502;
          if (!isRateLimit || attempt >= maxRetries) throw err;
          const retryAfterHeader = err?.response?.headers?.['retry-after'];
          const waitMs = retryAfterHeader
            ? parseInt(retryAfterHeader, 10) * 1000
            : Math.min(1000 * Math.pow(2, attempt), 8000);
          logger.warn(
            `[PlannerAgent] Retry ${attempt + 1}/${maxRetries} apos ${waitMs}ms`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          return this.retryCreate(message, maxRetries, attempt + 1);
        }
      }
    }
    