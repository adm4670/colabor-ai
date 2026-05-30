/**
 * PlannerAgent - Decide qual agente usar e com qual instrucao.
 * Cloud edition: roda no servidor.
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
    this.model = model || "deepseek-chat";
    logger.info(`[PlannerAgent] Inicializado com modelo ${this.model}`);
  }

  async decide(
    input: string,
    history: string,
    context: string,
    agents: SubAgentInfo[],
  ): Promise<PlannerDecision> {
    const agentList = agents.map((a) => `${a.name}: ${a.description}`).join("\n");

    const prompt = `
    User request:
    ${input}
    
    Conversation history:
    ${history}
    
    Current context:
    ${context}
    
    Available agents:
    ${agentList}
    
    Rules:
    1. ALWAYS select an agent for the first step.
    2. Never return "finish" before an agent has produced a result.
    3. Do NOT repeat the same instruction twice.
    4. Use assistant for conversation and general questions.
    5. Use python_code for calculations or code.
    
    Respond ONLY with JSON:
    {
      "agent": "agent_name | finish",
      "instruction": "what the agent should do"
    }`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      });

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
}
