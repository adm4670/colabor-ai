/**
 * ContextEngine - Gerenciamento inteligente de contexto
 *
 * Controla o orcamento de tokens do historico de conversa,
 * sumariza mensagens antigas quando necessario e mantem
 * apenas o contexto relevante para o modelo.
 *
 * Baseado no conceito de Context Engine do OpenClaw.
 */

import { logger } from "../utils/logger";

// ============================================================
// Tipos
// ============================================================

export interface ContextMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  reasoning_content?: string;
  tool_calls?: any;
}

export interface ContextEngineConfig {
  /** Token budget maximo (default: 8000 tokens) */
  maxTokens: number;
  /** Proporcao do budget reservada para mensagens recentes (default: 0.6 = 60%) */
  recentRatio: number;
  /** Numero minimo de mensagens a manter apos sumarizacao (default: 6) */
  minMessages: number;
  /** Modo de operacao: "trim" (corta) ou "summarize" (sumariza via LLM) */
  mode: "trim" | "summarize";
}

export interface ContextSummary {
  /** Mensagens processadas (prontas para enviar ao modelo) */
  messages: ContextMessage[];
  /** Quantas mensagens foram sumarizadas/removidas */
  summarizedCount: number;
  /** Estimativa de tokens no resultado final */
  estimatedTokens: number;
  /** Resumo gerado (se mode=summarize) */
  summary?: string;
}

// ============================================================
// Utilitarios de token
// ============================================================

const DEFAULT_CONFIG: ContextEngineConfig = {
  maxTokens: 8000,
  recentRatio: 0.6,
  minMessages: 6,
  mode: "trim",
};

/**
 * Estima o numero de tokens em um texto.
 * Regra pratica: ~4 caracteres por token (media para texto em portugues)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estima tokens de uma mensagem
 */
function estimateMessageTokens(msg: ContextMessage): number {
  let total = estimateTokens(msg.content || "");
  if (msg.name) total += estimateTokens(msg.name);
  if (msg.role) total += 2; // overhead do role
  return total;
}

/**
 * Estima tokens de um array de mensagens
 */
export function estimateMessagesTokens(messages: ContextMessage[]): number {
  return messages.reduce((acc, msg) => acc + estimateMessageTokens(msg), 0);
}

// ============================================================
// ContextEngine
// ============================================================

export class ContextEngine {
  private config: ContextEngineConfig;
  private systemPrompt: string = "";
  private rawHistory: ContextMessage[] = [];
  private compressed: ContextSummary | null = null;

  constructor(config?: Partial<ContextEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Define o system prompt (nao conta no budget de mensagens)
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Atualiza o historico bruto
   */
  setHistory(messages: ContextMessage[]): void {
    this.rawHistory = [...messages];
    this.compressed = null; // invalida cache
  }

  /**
   * Adiciona uma mensagem ao historico
   */
  addMessage(message: ContextMessage): void {
    this.rawHistory.push(message);
    this.compressed = null;
  }

  /**
   * Retorna o historico bruto atual
   */
  getRawHistory(): ContextMessage[] {
    return [...this.rawHistory];
  }

  /**
   * Processa o contexto: aplica compressao se necessario
   */
  buildContext(): ContextSummary {
    // Sempre separar system prompt das mensagens
    const history = [...this.rawHistory];

    // Calcular tokens atuais
    const totalTokens = estimateMessagesTokens(history);

    // Se esta dentro do budget, retorna como esta
    if (totalTokens <= this.config.maxTokens || history.length <= this.config.minMessages) {
      const result: ContextSummary = {
        messages: history,
        summarizedCount: 0,
        estimatedTokens: totalTokens,
      };
      this.compressed = result;
      return result;
    }

    // Precisa comprimir
    return this.compress(history);
  }

  /**
   * Comprime o historico mantendo as mensagens recentes e
   * resumindo/removendo as antigas
   */
  private compress(history: ContextMessage[]): ContextSummary {
    const { maxTokens, recentRatio, minMessages, mode } = this.config;

    // Quantidade de mensagens recentes a preservar integralmente
    // Pelo menos minMessages, mas respeitando o orcamento
    const recentBudget = Math.floor(maxTokens * recentRatio);
    let recentCount = 0;
    let recentTokens = 0;

    // Contar de tras pra frente quantas mensagens recentes cabem no orcamento
    for (let i = history.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessageTokens(history[i]);
      if (recentTokens + msgTokens > recentBudget && recentCount >= minMessages) {
        break;
      }
      recentTokens += msgTokens;
      recentCount++;
    }

    // Garantir pelo menos minMessages recentes
    if (recentCount < minMessages) {
      recentCount = Math.min(minMessages, history.length);
      // Recalcular tokens
      recentTokens = 0;
      for (let i = history.length - recentCount; i < history.length; i++) {
        recentTokens += estimateMessageTokens(history[i]);
      }
    }

    const splitPoint = history.length - recentCount;
    const oldMessages = history.slice(0, splitPoint);
    const recentMessages = history.slice(splitPoint);

    // Se mode = trim, simplesmente descarta as antigas
    if (mode === "trim") {
      const summary = `[Contexto comprimido: ${oldMessages.length} mensagens foram removidas para economizar tokens. As mensagens mais antigas foram descartadas.]`;

      // Adicionar um resumo sintetico como mensagem de sistema
      const result: ContextSummary = {
        messages: [
          {
            role: "system",
            content: `Resumo do historico removido: ${summary}`,
          },
          ...recentMessages,
        ],
        summarizedCount: oldMessages.length,
        estimatedTokens: estimateMessagesTokens(recentMessages) + estimateTokens(summary),
        summary,
      };

      this.compressed = result;
      logger.info(`[ContextEngine] Comprimido: ${oldMessages.length} mensagens antigas removidas, ${recentMessages.length} mantidas`);
      return result;
    }

    // Se mode = summarize, tentaria usar a LLM (implementacao futura)
    // Por enquanto, usa trim como fallback
    const summaryFallback = `[Contexto antigo descartado: ${oldMessages.length} mensagens]`;
    const result: ContextSummary = {
      messages: [
        {
          role: "system",
          content: `Resumo do historico: ${summaryFallback}`,
        },
        ...recentMessages,
      ],
      summarizedCount: oldMessages.length,
      estimatedTokens: estimateMessagesTokens(recentMessages) + estimateTokens(summaryFallback),
      summary: summaryFallback,
    };

    this.compressed = result;
    logger.info(`[ContextEngine] ${oldMessages.length} mensagens antigas resumidas, ${recentMessages.length} recentes mantidas`);
    return result;
  }

  /**
   * Formata o contexto para uso no prompt do planner
   */
  formatForPrompt(input: string, formattedHistory: string): string {
    const ctx = this.buildContext();

    let contextStr = `
User request:
${input}

Conversation history:
${formattedHistory}
`;

    // Se houve compressao, adicionar aviso
    if (ctx.summarizedCount > 0) {
      contextStr += `
[Nota: ${ctx.summarizedCount} mensagens antigas foram comprimidas para caber no limite de tokens.]
`;
    }

    return contextStr;
  }

  /**
   * Retorna estatisticas do engine
   */
  getStats(): { rawMessages: number; compressed: boolean; estimatedTokens: number } {
    const ctx = this.compressed || this.buildContext();
    return {
      rawMessages: this.rawHistory.length,
      compressed: ctx.summarizedCount > 0,
      estimatedTokens: ctx.estimatedTokens,
    };
  }
}

// Singleton padrao
let defaultEngine: ContextEngine | null = null;

export function getDefaultEngine(): ContextEngine {
  if (!defaultEngine) {
    defaultEngine = new ContextEngine({
      maxTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || "8000", 10),
      mode: (process.env.CONTEXT_MODE as "trim" | "summarize") || "trim",
    });
  }
  return defaultEngine;
}

export function resetDefaultEngine(): void {
  defaultEngine = null;
}