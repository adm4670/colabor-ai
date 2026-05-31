/**
     * ContextEngine - Gerenciamento inteligente de contexto
     *
     * Controla o orcamento de tokens do historico de conversa,
     * sumariza mensagens antigas usando LLM quando necessario e mantem
     * apenas o contexto relevante para o modelo.
     *
     * v3: Sumarizacao real com LLM + estrategia hibrida de 3 zonas.
     */
    
    import OpenAI from "openai";
    import { logger } from "../utils/logger";
    import { getMemoryEngine } from "../memory/memory-engine";
    import { createDefaultClient } from "../llm/provider";
    import { getTokenCounter } from "./token-counter";
    
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
      /** Modo de operacao: "trim" (corta) ou "summarize" (sumariza inteligente com LLM) */
      mode: "trim" | "summarize";
      /** Numero de mensagens recentes a manter intactas na zona 1 (default: 5) */
      keepRecentIntact: number;
      /** Numero maximo de mensagens na zona 2 (sumarizacao) (default: 10) */
      summarizeZoneSize: number;
      /** Modelo LLM para sumarizacao (default: usa o provider padrao) */
      summaryModel?: string;
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
      keepRecentIntact: 5,
      summarizeZoneSize: 10,
    };
    
    /**
     * Estima o numero de tokens em um texto.
     * Usa tiktoken com fallback para chars/4.
     */
    export function estimateTokens(text: string): number {
      return getTokenCounter().count(text);
    }
    
    /**
     * Estima tokens de uma mensagem
     */
    function estimateMessageTokens(msg: ContextMessage): number {
      let total = estimateTokens(msg.content || "");
      if (msg.name) total += estimateTokens(msg.name);
      if (msg.role) total += 4; // overhead do role (tiktoken account)
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
    // ContextEngine v3
    // ============================================================
    
    export class ContextEngine {
      private config: ContextEngineConfig;
      private systemPrompt: string = "";
      private rawHistory: ContextMessage[] = [];
      private compressed: ContextSummary | null = null;
      private memoryEngine = getMemoryEngine();
      private llmClient: OpenAI | null = null;
      private summaryCache: Map<string, string> = new Map();
    
      constructor(config?: Partial<ContextEngineConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // Inicializar cliente LLM para sumarizacao (lazy)
        try {
          this.llmClient = createDefaultClient();
        } catch {
          logger.warn("[ContextEngine] Nao foi possivel criar cliente LLM para sumarizacao. Usando fallback.");
        }
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
       * Se mode="summarize", usa LLM para sumarizacao inteligente
       * que preserva decisoes, preferencias e fatos importantes.
       */
      async buildContext(): Promise<ContextSummary> {
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
    
        // Modo summarize: usar LLM para compressao inteligente
        if (this.config.mode === "summarize") {
          return await this.summarizeIntelligently(history);
        }
    
        // Modo trim: compressao simples
        return this.compress(history);
      }
    
      /**
       * Formatacao rapida para prompt do planner/agente.
       * Inclui user input, history e context summary.
       */
      async formatForPrompt(userInput: string, history?: string): Promise<string> {
        const context = await this.buildContext();
    
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
       * Estrategia hibrida de 3 zonas para compressao de contexto:
       * 
       * Zona 1 (ultimas N mensagens): mantidas INTACTAS
       * Zona 2 (proximas M mensagens): SUMARIZADAS com LLM
       * Zona 3 (restante): DESCARTADAS apos sumarizacao da zona 2
       * 
       * Preserva sempre: system prompt, tool definitions, ultima interacao.
       */
      private async summarizeIntelligently(history: ContextMessage[]): Promise<ContextSummary> {
        const { keepRecentIntact, summarizeZoneSize, minMessages } = this.config;
    
        // Separar system messages (sempre preservadas)
        const systemMessages = history.filter((m) => m.role === "system");
        const nonSystemMessages = history.filter((m) => m.role !== "system");
    
        if (nonSystemMessages.length <= keepRecentIntact) {
          // Nem precisa sumarizar - muito poucas mensagens
          const tokens = estimateMessagesTokens(history);
          return {
            messages: history,
            summarizedCount: 0,
            estimatedTokens: tokens,
          };
        }
    
        // Zona 1: ultimas N mensagens intactas
        const zone1Start = Math.max(0, nonSystemMessages.length - keepRecentIntact);
        const zone1 = nonSystemMessages.slice(zone1Start);
    
        // Zona 2: proximas M mensagens para sumarizar
        const zone2Start = Math.max(0, zone1Start - summarizeZoneSize);
        const zone2 = nonSystemMessages.slice(zone2Start, zone1Start);
    
        // Zona 3: o resto (sera descartado apos sumarizacao)
        const zone3 = nonSystemMessages.slice(0, zone2Start);
    
        if (zone2.length === 0 && zone3.length === 0) {
          const result = [...systemMessages, ...zone1];
          return {
            messages: result,
            summarizedCount: 0,
            estimatedTokens: estimateMessagesTokens(result),
          };
        }
    
        // Sumarizar zonas 2 e 3 juntas usando LLM
        const allToSummarize = [...zone2, ...zone3];
        let summary = "";
    
        // Tentar sumarizacao com LLM
        if (this.llmClient) {
          summary = await this.summarizeWithLLM(allToSummarize);
        }
    
        // Fallback: sumario simples (MemoryEngine)
        if (!summary || summary.length < 20) {
          const compactMessages = allToSummarize.map((m) => ({
            role: m.role,
            content: m.content || "",
          }));
          const managed = this.memoryEngine.manageWorkingMemory(
            compactMessages,
            Math.floor(this.config.maxTokens * 0.3)
          );
          const summaryMsg = managed.find((m) => m.role === "system");
          summary = summaryMsg?.content || this.generateSimpleSummary(allToSummarize);
        }
    
        // Criar mensagem de sumario
        const totalSummarized = zone2.length + zone3.length;
        const summaryMessage: ContextMessage = {
          role: "system",
          content: `[Contexto anterior resumido - ${totalSummarized} mensagens]:
    ${summary}`,
        };
    
        // Montar resultado: system messages + summary + zona 1 (intacta)
        const result = [...systemMessages, summaryMessage, ...zone1];
        const estimatedTokens = estimateMessagesTokens(result);
    
        // Consolidar aprendizados das mensagens sumarizadas
        const toConsolidate = allToSummarize.map((m) => ({
          role: m.role,
          content: m.content || "",
        }));
        this.memoryEngine.consolidate(toConsolidate);
    
        logger.info(
          `[ContextEngine] Sumarizacao hibrida: ${zone1.length} intactas, ${totalSummarized} sumarizadas (${estimatedTokens} tokens)`
        );
    
        return {
          messages: result,
          summarizedCount: totalSummarized,
          estimatedTokens,
          summary,
        };
      }
    
      /**
       * Sumarizacao com LLM.
       * Envia mensagens antigas para o modelo pedindo um sumario
       * estruturado que preserve decisoes, contexto e fatos importantes.
       */
      private async summarizeWithLLM(messages: ContextMessage[]): Promise<string> {
        if (!this.llmClient || messages.length === 0) return "";
    
        // Construir o texto a ser sumarizado
        const transcript = messages
          .map((m) => `[${m.role}]: ${(m.content || "").slice(0, 500)}`)
          .join("\n");
    
        // Cache key simples (hash do transcript)
        const cacheKey = transcript.slice(0, 200);
        if (this.summaryCache.has(cacheKey)) {
          return this.summaryCache.get(cacheKey)!;
        }
    
        const summarizationPrompt = `You are a context compressor. Summarize the following conversation transcript.
    
    RULES:
    1. Preserve ALL decisions made, facts mentioned, and user preferences
    2. Keep important context that affects future interactions
    3. Include key questions asked and their answers
    4. Output in Portuguese (PT-BR)
    5. Be concise but complete - aim for 3-8 sentences
    6. Format as plain text, no markdown
    
    Transcript to summarize:
    ${transcript.slice(0, 6000)}
    
    Summary:`;
    
        try {
          const response = await this.llmClient.chat.completions.create({
            model: this.config.summaryModel || "deepseek-chat",
            messages: [
              { role: "system", content: "You are a precise context summarizer. Follow the rules exactly." },
              { role: "user", content: summarizationPrompt },
            ],
            max_tokens: 500,
            temperature: 0.3,
          });
    
          const summary = response.choices[0]?.message?.content?.trim() || "";
          if (summary) {
            this.summaryCache.set(cacheKey, summary);
            logger.info(`[ContextEngine] LLM summary generated (${estimateTokens(summary)} tokens)`);
          }
          return summary;
        } catch (err) {
          logger.warn(`[ContextEngine] LLM summarization failed: ${err}`);
          return "";
        }
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
          keepRecentIntact: 5,
          summarizeZoneSize: 10,
        });
      }
      return defaultEngine;
    }
    
    export function resetDefaultEngine(): void {
      defaultEngine = null;
    }
    