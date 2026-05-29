/**
     * ContextEngine - Gerenciamento inteligente de contexto
     *
     * Controla o orcamento de tokens do historico de conversa,
     * sumariza mensagens antigas quando necessario e mantem
     * apenas o contexto relevante para o modelo.
     *
     * v2: Integrado com MemoryEngine para compactacao inteligente.
     */
    
    import { logger } from "../utils/logger";
    import { getMemoryEngine } from "../memory/memory-engine";
    
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
      /** Modo de operacao: "trim" (corta) ou "summarize" (sumariza inteligente) */
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
      mode: "summarize",
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
      if (msg.reasoning_content) total += estimateTokens(msg.reasoning_content);
      return total;
    }
    
    /**
     * Estima tokens de um array de mensagens
     */
    export function estimateMessagesTokens(messages: ContextMessage[]): number {
      return messages.reduce((acc, msg) => acc + estimateMessageTokens(msg), 0);
    }
    
    // ============================================================
    // ContextEngine v2
    // ============================================================
    
    export class ContextEngine {
      private config: ContextEngineConfig;
      private systemPrompt: string = "";
      private rawHistory: ContextMessage[] = [];
      private compressed: ContextSummary | null = null;
      private memoryEngine = getMemoryEngine();
    
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
    
      /**
       * Carrega mensagens do transcript da sessao.
       * Util para restaurar contexto entre sessoes.
       */
      loadFromTranscript(messages: ContextMessage[]): void {
        this.rawHistory = [...messages];
        this.compressed = null;
        if (messages.length > 0) {
          logger.info(
            `[ContextEngine] Carregadas ${messages.length} mensagens do transcript`
          );
        }
      }
    
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
       * Processa o contexto: aplica compressao se necessario.
       * 
       * Se mode="summarize", usa MemoryEngine para sumarizacao inteligente
       * que preserva decisoes, preferencias e fatos importantes.
       */
      buildContext(): ContextSummary {
        const history = [...this.rawHistory];
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
    
        // Modo summarize: usar MemoryEngine para compressao inteligente
        if (this.config.mode === "summarize") {
          return this.summarizeIntelligently(history);
        }
    
        // Modo trim: compressao simples
        return this.compress(history);
      }
    
      /**
       * Formatacao rapida para prompt do planner/agente.
       * Inclui user input, history e context summary.
       */
      formatForPrompt(userInput: string, history?: string): string {
        const context = this.buildContext();
    
        let result = `User request:
${userInput}
`;
    
        if (history) {
          result += `
Conversation history:
${history}
`;
        }
    
        if (context.summary) {
          result += `
Summary of earlier context:
${context.summary}
`;
        }
    
        if (context.summarizedCount > 0) {
          result += `
[${context.summarizedCount} mensagens anteriores foram compactadas]
`;
        }
    
        result += `
Estimated tokens: ${context.estimatedTokens}
`;
    
        return result;
      }
    
      /**
       * Busca na memoria por contexto relevante ao input atual
       */
      recallMemory(query: string): string {
        return this.memoryEngine.recall(query);
      }
    
      /**
       * Consolida aprendizado apos finalizar uma sessao
       */
      async consolidateLearning(messages: ContextMessage[]): Promise<void> {
        const facts = this.memoryEngine.consolidate(
          messages.map((m) => ({ role: m.role, content: m.content || "" }))
        );
        if (facts.length > 0) {
          logger.info(
            `[ContextEngine] Consolidou ${facts.length} fatos na memoria`
          );
        }
      }
    
      // ============================================================
      // Metodos privados
      // ============================================================
    
      /**
       * Sumarizacao inteligente usando MemoryEngine.
       * Preserva informacoes semanticamente importantes.
       */
      private summarizeIntelligently(history: ContextMessage[]): ContextSummary {
        const { minMessages } = this.config;
        const recentCount = Math.max(minMessages, Math.floor(history.length * 0.4));
        const toKeep = history.slice(-recentCount);
        const toSummarize = history.slice(0, -recentCount);
    
        if (toSummarize.length === 0) {
          const tokens = estimateMessagesTokens(toKeep);
          return {
            messages: toKeep,
            summarizedCount: 0,
            estimatedTokens: tokens,
          };
        }
    
        // Usar MemoryEngine para compactar as mensagens antigas
        const compactMessages = toSummarize.map((m) => ({
          role: m.role,
          content: m.content || "",
        }));
    
        const managed = this.memoryEngine.manageWorkingMemory(
          compactMessages,
          Math.floor(this.config.maxTokens * 0.3)
        );
    
        // Extrair o resumo das mensagens compactadas
        const summaryMsg = managed.find((m) => m.role === "system");
        const summary = summaryMsg?.content || this.generateSimpleSummary(toSummarize);
    
        // Mensagem de resumo como contexto
        const summaryMessage: ContextMessage = {
          role: "system",
          content: `[Contexto anterior resumido - ${toSummarize.length} mensagens]:
${summary}`,
        };
    
        const result = [summaryMessage, ...toKeep];
        const estimatedTokens = estimateMessagesTokens(result);
    
        // Tambem consolidar aprendizados das mensagens sumarizadas
        this.memoryEngine.consolidate(compactMessages);
    
        return {
          messages: result,
          summarizedCount: toSummarize.length,
          estimatedTokens,
          summary,
        };
      }
    
      /**
       * Comprime o historico mantendo as mensagens recentes
       */
      private compress(history: ContextMessage[]): ContextSummary {
        const { maxTokens, recentRatio, minMessages } = this.config;
    
        const recentBudget = Math.floor(maxTokens * recentRatio);
        let recentCount = 0;
        let recentTokens = 0;
    
        for (let i = history.length - 1; i >= 0; i--) {
          const msgTokens = estimateMessageTokens(history[i]);
          if (recentTokens + msgTokens > recentBudget && recentCount >= minMessages) {
            break;
          }
          recentTokens += msgTokens;
          recentCount++;
        }
    
        const kept = history.slice(-recentCount);
        const summarized = history.length - recentCount;
    
        let summary = "";
        if (summarized > 0) {
          summary = this.generateSimpleSummary(history.slice(0, summarized));
        }
    
        return {
          messages: summary
            ? [{ role: "system" as const, content: summary }, ...kept]
            : kept,
          summarizedCount: summarized,
          estimatedTokens: estimateMessagesTokens(kept),
          summary: summary || undefined,
        };
      }
    
      private generateSimpleSummary(messages: ContextMessage[]): string {
        const userMsgs = messages
          .filter((m) => m.role === "user")
          .map((m) => (m.content || "").slice(0, 100));
        const assistantMsgs = messages
          .filter((m) => m.role === "assistant")
          .map((m) => (m.content || "").slice(0, 100));
    
        const parts: string[] = [];
        if (userMsgs.length > 0) {
          parts.push(`Usuario perguntou: ${userMsgs.join(" | ")}`);
        }
        if (assistantMsgs.length > 0) {
          parts.push(`Assistente respondeu: ${assistantMsgs.join(" | ")}`);
        }
    
        return parts.join(". ").slice(0, 500);
      }
    }
    
    // Singleton
    let defaultEngine: ContextEngine | null = null;
    
    export function getDefaultEngine(): ContextEngine {
      if (!defaultEngine) {
        defaultEngine = new ContextEngine({
          mode: "summarize",
          maxTokens: 8000,
        });
      }
      return defaultEngine;
    }
    
    export function resetDefaultEngine(): void {
      defaultEngine = null;
    }
    