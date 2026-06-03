/**
 * ContextEngine - Cloud edition
 * Gerencia orcamento de tokens com sumarizacao LLM e estrategia hibrida.
 */
import type OpenAI from "openai";
import { createDefaultClient } from "../llm/provider";
import { logger } from "../utils/logger";
import type { CloudMessage } from "../types";

export interface ContextEngineConfig {
  maxTokens: number;
  recentRatio: number;
  minMessages: number;
  mode: "trim" | "summarize";
  keepRecentIntact: number;
  summarizeZoneSize: number;
  summaryModel?: string;
}

export interface ContextSummary {
  messages: CloudMessage[];
  summarizedCount: number;
  estimatedTokens: number;
  summary?: string;
}

const DEFAULT_CONFIG: ContextEngineConfig = {
  maxTokens: 8000,
  recentRatio: 0.6,
  minMessages: 6,
  mode: "summarize",
  keepRecentIntact: 5,
  summarizeZoneSize: 10,
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(msg: CloudMessage): number {
  let total = estimateTokens(msg.content || "");
  if (msg.name) total += estimateTokens(msg.name);
  if (msg.role) total += 2;
  return total;
}

export function estimateMessagesTokens(messages: CloudMessage[]): number {
  return messages.reduce((acc, msg) => acc + estimateMessageTokens(msg), 0);
}


    // ============================================================
    // Safe Truncation Helper - evita tool messages orfas
    // ============================================================
    
    /**
     * Encontra um indice de truncagem seguro que nao quebra pares
     * assistant(tool_calls) -> tool.
     */
    function findSafeTruncationIndex(
      messages: CloudMessage[],
      desiredStart: number
    ): number {
      if (desiredStart <= 0) return 0;
      
      let safeStart = desiredStart;
      
      for (let i = desiredStart; i < messages.length; i++) {
        const msg = messages[i];
        
        if (msg.role === "tool" && msg.tool_call_id) {
          let foundAssistant = false;
          
          for (let j = i - 1; j >= 0; j--) {
            const candidate = messages[j];
            if (
              candidate.role === "assistant" &&
              (candidate as any).tool_calls &&
              Array.isArray((candidate as any).tool_calls)
            ) {
              const hasMatch = (candidate as any).tool_calls.some(
                (tc: any) => tc.id === msg.tool_call_id
              );
              if (hasMatch) {
                if (j < safeStart) safeStart = j;
                foundAssistant = true;
                break;
              }
            }
          }
          
          if (!foundAssistant && i >= safeStart) {
            logger.warn(
              `[ContextEngine] Tool message orfa detectada (tool_call_id=${msg.tool_call_id}). ` +
              `Pulando para evitar erro 400 da API.`
            );
            safeStart = i + 1;
          }
        }
      }
      
      return safeStart;
    }
    
    
export class ContextEngine {
  private config: ContextEngineConfig;
  private rawHistory: CloudMessage[] = [];
  private llmClient: OpenAI | null = null;
  private summaryCache: Map<string, string> = new Map();

  constructor(config?: Partial<ContextEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    try {
      this.llmClient = createDefaultClient();
    } catch {
      logger.warn("[ContextEngine] LLM client nao disponivel. Usando fallback.");
    }
  }

  setHistory(messages: CloudMessage[]): void {
    this.rawHistory = [...messages];
  }

  addMessage(message: CloudMessage): void {
    this.rawHistory.push(message);
  }

  getRawHistory(): CloudMessage[] {
    return [...this.rawHistory];
  }

  async buildContext(): Promise<ContextSummary> {
    const history = [...this.rawHistory];
    const totalTokens = estimateMessagesTokens(history);

    if (totalTokens <= this.config.maxTokens || history.length <= this.config.minMessages) {
      return { messages: history, summarizedCount: 0, estimatedTokens: totalTokens };
    }

    if (this.config.mode === "summarize") {
      return this.summarizeIntelligently(history);
    }
    return this.compress(history);
  }

  private async summarizeIntelligently(history: CloudMessage[]): Promise<ContextSummary> {
    const { keepRecentIntact, summarizeZoneSize } = this.config;

    const systemMessages = history.filter((m) => m.role === "system");
    const nonSystemMessages = history.filter((m) => m.role !== "system");

    if (nonSystemMessages.length <= keepRecentIntact) {
      return {
        messages: history,
        summarizedCount: 0,
        estimatedTokens: estimateMessagesTokens(history),
      };
    }

    // Safe truncation: garante pares assistant(tool_calls) -> tool
        const rawZone1Start = Math.max(0, nonSystemMessages.length - keepRecentIntact);
        const safeZone1Start = findSafeTruncationIndex(nonSystemMessages, rawZone1Start);
        const zone1 = nonSystemMessages.slice(safeZone1Start);
    const zone2Start = Math.max(0, safeZone1Start - summarizeZoneSize);
    const zone2 = nonSystemMessages.slice(zone2Start, safeZone1Start);
    const allToSummarize = [...nonSystemMessages.slice(0, zone2Start), ...zone2];

    if (allToSummarize.length === 0) {
      const result = [...systemMessages, ...zone1];
      return {
        messages: result,
        summarizedCount: 0,
        estimatedTokens: estimateMessagesTokens(result),
      };
    }

    let summary = "";
    if (this.llmClient) {
      summary = await this.summarizeWithLLM(allToSummarize);
    }

    if (!summary || summary.length < 20) {
      summary = this.generateSimpleSummary(allToSummarize);
    }

    const summaryMessage: CloudMessage = {
      role: "system",
      content: `[Contexto anterior resumido - ${allToSummarize.length} mensagens]:\n${summary}`,
    };

    const result = [...systemMessages, summaryMessage, ...zone1];
    logger.info(
      `[ContextEngine] Sumarizacao: ${zone1.length} intactas, ${allToSummarize.length} sumarizadas (${estimateMessagesTokens(result)} tokens)`,
    );

    return {
      messages: result,
      summarizedCount: allToSummarize.length,
      estimatedTokens: estimateMessagesTokens(result),
      summary,
    };
  }

  private async summarizeWithLLM(messages: CloudMessage[]): Promise<string> {
    if (!this.llmClient || messages.length === 0) return "";

    const transcript = messages
      .map((m) => `[${m.role}]: ${(m.content || "").slice(0, 500)}`)
      .join("\n");

    const cacheKey = transcript.slice(0, 200);
    if (this.summaryCache.has(cacheKey)) {
      return this.summaryCache.get(cacheKey)!;
    }

    const prompt = `Summarize this conversation. Preserve decisions, facts, preferences. Output in Portuguese (PT-BR), 3-8 sentences.\n\n${transcript.slice(0, 6000)}\n\nSummary:`;

    try {
      const response = await this.llmClient.chat.completions.create({
        model: this.config.summaryModel || "deepseek-v4-pro",
        messages: [
          { role: "system", content: "You are a precise context summarizer." },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.3,
      });
      const s = response.choices[0]?.message?.content?.trim() || "";
      if (s) this.summaryCache.set(cacheKey, s);
      return s;
    } catch (err) {
      logger.warn(`[ContextEngine] LLM summarization failed: ${err}`);
      return "";
    }
  }

  private compress(history: CloudMessage[]): ContextSummary {
    const { maxTokens, recentRatio, minMessages } = this.config;
    const recentBudget = Math.floor(maxTokens * recentRatio);
    let recentCount = 0;
    let recentTokens = 0;

    for (let i = history.length - 1; i >= 0; i--) {
      const t = estimateMessageTokens(history[i]);
      if (recentTokens + t > recentBudget && recentCount >= minMessages) break;
      recentTokens += t;
      recentCount++;
    }

    const rawStart = Math.max(0, history.length - recentCount);
    const safeStart = findSafeTruncationIndex(history, rawStart);
    const kept = history.slice(safeStart);
    const summarized = history.length - kept.length;
    const summary = summarized > 0 ? this.generateSimpleSummary(history.slice(0, summarized)) : "";

    return {
      messages: summary ? [{ role: "system", content: summary }, ...kept] : kept,
      summarizedCount: summarized,
      estimatedTokens: estimateMessagesTokens(kept),
      summary: summary || undefined,
    };
  }

  private generateSimpleSummary(messages: CloudMessage[]): string {
    const userMsgs = messages
      .filter((m) => m.role === "user")
      .map((m) => (m.content || "").slice(0, 100));
    const assistantMsgs = messages
      .filter((m) => m.role === "assistant")
      .map((m) => (m.content || "").slice(0, 100));
    const parts: string[] = [];
    if (userMsgs.length) parts.push(`Usuario perguntou: ${userMsgs.join(" | ")}`);
    if (assistantMsgs.length) parts.push(`Assistente respondeu: ${assistantMsgs.join(" | ")}`);
    return parts.join(". ").slice(0, 500);
  }
}

let defaultEngine: ContextEngine | null = null;

export function getDefaultEngine(): ContextEngine {
  if (!defaultEngine) defaultEngine = new ContextEngine();
  return defaultEngine;
}
