/**
     * MemorySummarizer - Compressão inteligente de conversas para memória de trabalho.
     * 
     * Substitui o dump bruto de mensagens por resumos estruturados que preservam:
     * - Decisões tomadas
     * - Fatos e informações importantes
     * - Preferências do usuário
     * - Itens de ação e TODOs
     * - Contexto crítico para continuidade
     * 
     * Integra com TokenGuard para consciência de uso de tokens.
     * Modo resiliente: fallback heurístico se o LLM falhar.
     */
    
    import OpenAI from "openai";
    import { createDefaultClient } from "../../../core/llm/provider";
    import { logger } from "../../../core/utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface TranscriptMessage {
      role: "user" | "assistant" | "system" | "tool";
      content: string;
      name?: string;
      timestamp?: number;
      tool_call_id?: string;
    }
    
    export interface SummarizerConfig {
      /** Modelo LLM a usar (default: depende do provider) */
      model?: string;
      /** Máximo de tokens para o output do sumário */
      maxOutputTokens?: number;
      /** Temperatura (0 = determinístico) */
      temperature?: number;
      /** Timeout em ms para chamada LLM */
      timeoutMs?: number;
      /** Se deve usar LLM ou apenas fallback heurístico */
      useLLM?: boolean;
      /** Callback para reportar uso de tokens ao TokenGuard */
      onTokenUsage?: (inputTokens: number, outputTokens: number) => void;
    }
    
    export interface StructuredSummary {
      /** Resumo textual compacto */
      text: string;
      /** Decisões extraídas */
      decisions: string[];
      /** Fatos relevantes */
      facts: string[];
      /** Preferências detectadas */
      preferences: string[];
      /** Ações/tarefas pendentes */
      actionItems: string[];
      /** Tópicos principais da conversa */
      topics: string[];
      /** Tokens usados (input + output) */
      tokensUsed: { input: number; output: number };
      /** Se foi usado fallback heurístico */
      usedFallback: boolean;
    }
    
    // ============================================================
    // Constantes
    // ============================================================
    
    const DEFAULT_CONFIG: Required<SummarizerConfig> = {
      model: "deepseek-chat",
      maxOutputTokens: 400,
      temperature: 0.1,
      timeoutMs: 15000,
      useLLM: true,
      onTokenUsage: () => {},
    };
    
    const SUMMARIZE_SYSTEM_PROMPT = `Você é um compressor de conversas. Sua tarefa é resumir um trecho de conversa entre usuário e assistente.
    
    REGRAS:
    1. Seja extremamente conciso. O resumo deve ter no máximo 5-6 frases curtas.
    2. Priorize: decisões tomadas, fatos importantes, preferências do usuário, ações pendentes.
    3. Ignore cumprimentos, agradecimentos, e conversa fiada.
    4. Use formato de tópicos com bullets (-).
    5. NÃO repita informação. Cada bullet deve conter algo único.
    6. Se não houver nada relevante, responda apenas "Nada relevante."
    
    Formato de saída (siga exatamente):
    
    DECISÕES:
    - decisão 1
    - decisão 2
    
    FATOS:
    - fato 1
    
    PREFERÊNCIAS:
    - preferência 1
    
    AÇÕES:
    - ação pendente 1
    
    TÓPICOS: topico1, topico2, topico3`;
    
    // ============================================================
    // MemorySummarizer
    // ============================================================
    
    export class MemorySummarizer {
      private config: Required<SummarizerConfig>;
      private llmClient: OpenAI | null = null;
    
      constructor(config: SummarizerConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
      }
    
      /**
       * Garante que o cliente LLM está inicializado.
       */
      private getLLM(): OpenAI {
        if (!this.llmClient) {
          try {
            this.llmClient = createDefaultClient();
          } catch (err) {
            logger.warn("[MemorySummarizer] Falha ao criar cliente LLM, usando fallback", err);
            this.llmClient = null as any;
          }
        }
        return this.llmClient;
      }
    
      /**
       * Resume uma lista de mensagens de conversa.
       * 
       * @param messages - Array de mensagens da conversa
       * @param existingSummary - Resumo existente para merge incremental (opcional)
       * @returns StructuredSummary com o resumo estruturado
       */
      async summarize(
        messages: TranscriptMessage[],
        existingSummary?: string
      ): Promise<StructuredSummary> {
        if (!messages || messages.length === 0) {
          return this.emptySummary();
        }
    
        // Prepara o texto para sumarização
        const conversationText = this.formatMessages(messages);
        const estimatedInputTokens = this.estimateTokens(conversationText);
    
        // Tenta via LLM primeiro
        if (this.config.useLLM) {
          try {
            const llmResult = await this.summarizeWithLLM(conversationText, existingSummary);
            this.config.onTokenUsage(llmResult.tokensUsed.input, llmResult.tokensUsed.output);
            return { ...llmResult, usedFallback: false };
          } catch (err) {
            logger.warn("[MemorySummarizer] LLM falhou, usando fallback heurístico", err);
          }
        }
    
        // Fallback: extração heurística
        const fallbackResult = this.summarizeHeuristic(messages);
        this.config.onTokenUsage(estimatedInputTokens, this.estimateTokens(fallbackResult.text));
        return { ...fallbackResult, usedFallback: true };
      }
    
      /**
       * Resume de forma síncrona usando apenas heurísticas (sem LLM).
       * Útil para contextos onde latência é crítica.
       */
      summarizeSync(messages: TranscriptMessage[]): StructuredSummary {
        if (!messages || messages.length === 0) {
          return this.emptySummary();
        }
        return { ...this.summarizeHeuristic(messages), usedFallback: true };
      }
    
      /**
       * Faz merge de um novo lote de mensagens com um resumo existente.
       */
      async mergeWithSummary(
        existingSummary: string,
        newMessages: TranscriptMessage[]
      ): Promise<StructuredSummary> {
        return this.summarize(newMessages, existingSummary);
      }
    
      // ============================================================
      // Internals
      // ============================================================
    
      private async summarizeWithLLM(
        conversationText: string,
        existingSummary?: string
      ): Promise<StructuredSummary> {
        const client = this.getLLM();
        if (!client) {
          throw new Error("LLM client not available");
        }
    
        const userPrompt = existingSummary
          ? `Resumo anterior:\n${existingSummary}\n\nNovas mensagens:\n${conversationText}\n\nAtualize o resumo acima incorporando as novas mensagens.`
          : `Conversa:\n${conversationText}\n\nResuma conforme o formato especificado.`;
    
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    
        try {
          const response = await client.chat.completions.create(
            {
              model: this.config.model,
              messages: [
                { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
                { role: "user", content: userPrompt.slice(0, 8000) },
              ],
              temperature: this.config.temperature,
              max_tokens: this.config.maxOutputTokens,
            },
            { signal: controller.signal }
          );
    
          const rawOutput = response.choices[0]?.message?.content || "";
          const parsed = this.parseStructuredOutput(rawOutput);
    
          return {
            ...parsed,
            tokensUsed: {
              input: response.usage?.prompt_tokens || this.estimateTokens(conversationText),
              output: response.usage?.completion_tokens || this.estimateTokens(rawOutput),
            },
          };
        } finally {
          clearTimeout(timeout);
        }
      }
    
      /**
       * Extração heurística: regex + regras para extrair informação sem LLM.
       * Resiliente, nunca falha.
       */
      private summarizeHeuristic(messages: TranscriptMessage[]): StructuredSummary {
        const userMsgs = messages.filter((m) => m.role === "user");
        const allContent = messages.map((m) => m.content).join("\n");
    
        // Extrai decisões (padrões: "decidi", "vamos", "definido", "OK, ", "criar", "remover")
        const decisions = this.extractPatterns(allContent, [
          /\b(decid[oiu]|defin[oiu]|resolv[ei])\s+(?:que\s+)?(.+?)(?:\.|$)/gi,
          /\b(vamos|criaremos|implementaremos)\s+(.+?)(?:\.|$)/gi,
          /\b(OK|ok|certo|feito)[,.]?\s*(.+?)(?:\.|$)/gi,
        ]);
    
        // Extrai preferências (padrões: "prefiro", "gosto", "quero que", "não gosto")
        const preferences = this.extractPatterns(allContent, [
          /\b(prefiro|preferência|gosto mais|gosto de)\s+(.+?)(?:\.|$)/gi,
          /\b(não gosto|odeio|evito)\s+(.+?)(?:\.|$)/gi,
          /\b(quero que|gostaria que)\s+(.+?)(?:\.|$)/gi,
        ]);
    
        // Extrai fatos: mensagens com informação factual (nomes, números, paths, URLs)
        const facts = this.extractFacts(messages);
    
        // Extrai ações pendentes: "preciso", "tem que", "pendente", TODO implícito
        const actionItems = this.extractPatterns(allContent, [
          /\b(preciso|precisamos|tem que|temos que|falta)\s+(.+?)(?:\.|$)/gi,
          /\b(pendente|a fazer|TODO|FIXME)\s*:?\s*(.+?)(?:\.|$)/gi,
          /\b(ainda\s+(?:precisa|falta|necessário))\s+(.+?)(?:\.|$)/gi,
        ]);
    
        // Extrai tópicos: palavras-chave frequentes
        const topics = this.extractTopics(messages);
    
        // Constrói resumo textual
        const textParts: string[] = [];
    
        if (decisions.length > 0) {
          textParts.push(`Decisões: ${decisions.slice(0, 3).join(" | ")}`);
        }
        if (preferences.length > 0) {
          textParts.push(`Preferências: ${preferences.slice(0, 2).join(" | ")}`);
        }
        if (facts.length > 0) {
          textParts.push(`Fatos: ${facts.slice(0, 4).join(" | ")}`);
        }
        if (actionItems.length > 0) {
          textParts.push(`Ações pendentes: ${actionItems.slice(0, 2).join(" | ")}`);
        }
        if (topics.length > 0) {
          textParts.push(`Tópicos: ${topics.join(", ")}`);
        }
    
        // Fallback: se nada foi extraído, pega snippets das mensagens
        if (textParts.length === 0) {
          const snippets = userMsgs
            .slice(0, 3)
            .map((m) => m.content.slice(0, 100))
            .join(" | ");
          textParts.push(`Conversa sobre: ${snippets || "tópicos variados"}`);
        }
    
        return {
          text: textParts.join(". ").slice(0, 500),
          decisions: decisions.slice(0, 5),
          facts: facts.slice(0, 8),
          preferences: preferences.slice(0, 5),
          actionItems: actionItems.slice(0, 5),
          topics: topics.slice(0, 6),
          tokensUsed: { input: this.estimateTokens(allContent), output: 0 },
          usedFallback: true,
        };
      }
    
      /**
       * Formata mensagens para envio ao LLM.
       */
      private formatMessages(messages: TranscriptMessage[]): string {
        const lines: string[] = [];
        for (const msg of messages) {
          const role = msg.name
            ? `${msg.role}(${msg.name})`
            : msg.role;
          let content = msg.content || "";
          if (msg.role === "tool" && content.length > 200) {
            content = content.slice(0, 200) + "...";
          } else if (content.length > 500) {
            content = content.slice(0, 500) + "...";
          }
          lines.push(`[${role}]: ${content}`);
        }
        return lines.join("\n");
      }
    
      /**
       * Faz parse do output estruturado do LLM.
       */
      private parseStructuredOutput(raw: string): Omit<StructuredSummary, "tokensUsed" | "usedFallback"> {
        const sections: Record<string, string[]> = {
          decisions: [],
          facts: [],
          preferences: [],
          actionItems: [],
          topics: [],
        };
    
        let currentSection: string | null = null;
    
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
    
          const sectionMatch = trimmed.match(
            /^(DECISÕES|DECISOES|DECISIONS|FATOS|FACTS|PREFERÊNCIAS|PREFERENCIAS|PREFERENCES|AÇÕES|ACOES|ACTIONS|TÓPICOS|TOPICOS|TOPICS)\s*:/i
          );
          if (sectionMatch) {
            const key = sectionMatch[1].toLowerCase();
            if (key.startsWith("decis")) currentSection = "decisions";
            else if (key.startsWith("fat")) currentSection = "facts";
            else if (key.startsWith("pref")) currentSection = "preferences";
            else if (key.startsWith("aç") || key.startsWith("aco") || key.startsWith("act"))
              currentSection = "actionItems";
            else if (key.startsWith("tóp") || key.startsWith("top"))
              currentSection = "topics";
            continue;
          }
    
          const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
          if (bulletMatch && currentSection) {
            sections[currentSection].push(bulletMatch[1].trim());
            continue;
          }
    
          if (currentSection && trimmed.length > 3 && !trimmed.startsWith("#")) {
            sections[currentSection].push(trimmed);
          }
        }
    
        if (Object.values(sections).every((s) => s.length === 0)) {
          const cleanText = raw.replace(/^[-\s]+/, "").trim();
          if (cleanText && cleanText !== "Nada relevante.") {
            sections.topics = [cleanText.slice(0, 200)];
          }
        }
    
        const textParts: string[] = [];
        if (sections.decisions.length) textParts.push(`Decisões: ${sections.decisions.join(" | ")}`);
        if (sections.preferences.length) textParts.push(`Preferências: ${sections.preferences.join(" | ")}`);
        if (sections.facts.length) textParts.push(`Fatos: ${sections.facts.join(" | ")}`);
        if (sections.actionItems.length) textParts.push(`Ações: ${sections.actionItems.join(" | ")}`);
        if (sections.topics.length) textParts.push(`Tópicos: ${sections.topics.join(", ")}`);
    
        return {
          text: textParts.join(". ") || raw.slice(0, 300),
          decisions: sections.decisions,
          facts: sections.facts,
          preferences: sections.preferences,
          actionItems: sections.actionItems,
          topics: sections.topics,
        };
      }
    
      /**
       * Extrai padrões com regex.
       */
      private extractPatterns(text: string, patterns: RegExp[]): string[] {
        const results: string[] = [];
        const seen = new Set<string>();
    
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(text)) !== null) {
            const extracted = (match[2] || match[1] || "").trim();
            const normalized = extracted.slice(0, 120).replace(/\s+/g, " ");
            if (normalized.length > 3 && !seen.has(normalized.toLowerCase())) {
              seen.add(normalized.toLowerCase());
              results.push(normalized);
            }
          }
        }
    
        return results;
      }
    
      /**
       * Extrai fatos de mensagens (paths, números, nomes próprios, etc).
       */
      private extractFacts(messages: TranscriptMessage[]): string[] {
        const facts: string[] = [];
        const seen = new Set<string>();
    
        for (const msg of messages) {
          const content = msg.content || "";
    
          // Paths absolutos e com raiz (C:\, ~/, ./, /)
          const absPaths = content.match(/(?:[A-Z]:\\|~\/|\.\/|\/)[\w\-\.\/\\]+/g);
          // Paths relativos (src/file.ts, lib/utils/helper.ts)
          const relPaths = content.match(/(?:^|\s)([\w\-]+(?:\/[\w\-\.]+)+\.\w{1,6})/g);
    
          const allPaths = [
            ...(absPaths || []),
            ...(relPaths || []).map((p: string) => p.trim()),
          ];
    
          for (let p of allPaths) {
            p = p.replace(/[.,;:!?]+$/, "");
            if (p && !seen.has(p)) {
              seen.add(p);
              facts.push(p);
            }
          }
    
          // URLs
          const urlMatches = content.match(/https?:\/\/[^\s,\)]+/g);
          if (urlMatches) {
            for (const u of urlMatches) {
              if (!seen.has(u)) {
                seen.add(u);
                facts.push(u);
              }
            }
          }
    
          // Números significativos (datas, versões, quantidades com contexto)
          const numMatches = content.match(
            /(?:versão|version|v)\s*(\d+\.\d+(?:\.\d+)?)|(\d{4}-\d{2}-\d{2})|(?:total|são|tem)\s+(\d+)/gi
          );
          if (numMatches) {
            for (const n of numMatches) {
              if (!seen.has(n)) {
                seen.add(n);
                facts.push(n);
              }
            }
          }
        }
    
        return facts.slice(0, 10);
      }
    
      /**
       * Extrai tópicos baseado em frequência de palavras.
       */
      private extractTopics(messages: TranscriptMessage[]): string[] {
        const wordFreq = new Map<string, number>();
        const stopWords = new Set([
          "que", "com", "para", "uma", "isso", "como", "mais", "mas", "porque",
          "the", "and", "for", "this", "that", "with", "from", "have", "are",
          "não", "sim", "aqui", "está", "foi", "era", "dos", "das", "ele", "ela",
          "ok", "vou", "vai", "bem", "bom", "pode", "fazer",
        ]);
    
        const allText = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => m.content.toLowerCase())
          .join(" ");
    
        const words = allText.match(/\b[a-záàâãéêíóôõúç]{4,}\b/g) || [];
    
        for (const word of words) {
          if (stopWords.has(word)) continue;
          wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }
    
        return [...wordFreq.entries()]
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([word]) => word);
      }
    
      /**
       * Estima número de tokens (heurística: ~4 chars por token).
       */
      estimateTokens(text: string): number {
        return Math.ceil((text || "").length / 4);
      }
    
      private emptySummary(): StructuredSummary {
        return {
          text: "",
          decisions: [],
          facts: [],
          preferences: [],
          actionItems: [],
          topics: [],
          tokensUsed: { input: 0, output: 0 },
          usedFallback: false,
        };
      }
    }
    
    // ============================================================
    // Factory function
    // ============================================================
    
    /**
     * Cria uma instância do MemorySummarizer com configuração padrão.
     */
    export function createSummarizer(config?: SummarizerConfig): MemorySummarizer {
      return new MemorySummarizer(config);
    }
    