# 📐 Documento de Integração: Pluggable Memory Architecture
    ## colabor-ai – Sistema Modular de Memória, Planejamento e Resiliência
    
    ---
    
    ## Índice
    
    1. [Visão Geral](#1-visão-geral)
    2. [Arquitetura](#2-arquitetura)
    3. [Componente 1: MemorySummarizer (resumo automático)](#3-componente-1-memorysummarizer)
    4. [Componente 2: ConversationalGuard (validação de LLM)](#4-componente-2-conversationalguard)
    5. [Componente 3: TokenGuard (limite de tokens)](#5-componente-3-tokenguard)
    6. [Componente 4: Background Resilience Layer](#6-componente-4-background-resilience-layer)
    7. [Plano de Implementação](#7-plano-de-implementação)
    8. [Métricas e Observabilidade](#8-métricas-e-observabilidade)
    
    ---
    
    ## 1. Visão Geral
    
    **Propósito:** Substituir o dump bruto de conversas inteiras na MEMORY.md por um sistema modular que:
    - Resume automaticamente conversas para armazenamento compacto e reutilizável
    - Valida respostas do LLM antes de enviá-las ao usuário
    - Gerencia limites de tokens no contexto proativamente
    - Mantém resiliência operacional mesmo quando componentes individuais falham
    
    **Inspiração:** Claude Code + Agno + LangChain (melhores práticas)
    
    ---
    
    ## 2. Arquitetura
    
    ### Diagrama de Fluxo
    
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │                     AgentOrchestrator                        │
    │                                                              │
    │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
    │  │   Planner    │  │   Agents     │  │   HookManager     │  │
    │  │  (LLM)       │  │  [pool]      │  │  [before/after]   │  │
    │  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
    │         │                 │                    │              │
    │         ▼                 ▼                    ▼              │
    │  ┌───────────────────────────────────────────────────────┐   │
    │  │               Integration Layer (NOVO)                │   │
    │  │                                                       │   │
    │  │  ┌─────────────────┐  ┌─────────────────────────┐    │   │
    │  │  │ MemorySummarizer│  │   ConversationalGuard   │    │   │
    │  │  │ (hook: finish)  │  │  (hook: before_response)│    │   │
    │  │  └────────┬────────┘  └───────────┬─────────────┘    │   │
    │  │           │                       │                   │   │
    │  │  ┌────────▼───────────────────────▼─────────────┐    │   │
    │  │  │            TokenGuard                        │    │   │
    │  │  │  (before_planner + after_agent)              │    │   │
    │  │  └────────────────────┬─────────────────────────┘    │   │
    │  │                       │                              │   │
    │  │  ┌────────────────────▼─────────────────────────┐    │   │
    │  │  │     Background Resilience Layer              │    │   │
    │  │  │  (try/catch + fallback + degrade gracefully) │    │   │
    │  │  └──────────────────────────────────────────────┘    │   │
    │  └───────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────┘
            │
            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │         Storage Layer (file system / .colabor-ai)            │
    │                                                              │
    │  MEMORY.md ← resumos consolidados (não mais dump bruto)     │
    │  Transcripts ← conversation logs completos (não mudou)      │
    │  Daily Notes ← MD files by date                             │
    │  Dream State ← JSON state file                              │
    └─────────────────────────────────────────────────────────────┘
    ```
    
    ### Estrutura de Diretórios (afetados)
    
    ```
    colabor-ai/
    ├── core/
    │   ├── memory/
    │   │   ├── memory_search.ts        ← ❗ MODIFICAR (add summarizer hook call)
    │   │   ├── memory-engine.ts        ← já existe
    │   │   ├── memory-extractor.ts     ← já existe
    │   │   └── memory-summarizer.ts    ← 🆕 NOVO
    │   │
    │   ├── hooks/
    │   │   ├── hook-system.ts          ← já existe (não precisa modificar)
    │   │   ├── conversational-guard.ts ← 🆕 NOVO
    │   │   └── token-guard.ts          ← 🆕 NOVO
    │   │
    │   ├── orchestrator/
    │   │   └── orchestrator.ts         ← ❗ MODIFICAR (registrar hooks)
    │   │
    │   ├── resilience/
    │   │   └── resilience-layer.ts     ← 🆕 NOVO
    │   │
    │   └── types/
    │       └── index.ts                ← ❗ MODIFICAR (add novas interfaces)
    │
    └── tests/
        ├── memory-summarizer.test.ts   ← 🆕 NOVO
        ├── conversational-guard.test.ts← 🆕 NOVO
        ├── token-guard.test.ts         ← 🆕 NOVO
        └── resilience-layer.test.ts    ← 🆕 NOVO
    ```
    
    ---
    
    ## 3. Componente 1: MemorySummarizer
    
    ### O que faz
    
    Resume automaticamente o resultado **final** de uma sessão de agente multi-step e armazena como entrada compacta na MEMORY.md. Substitui o dump bruto de conversas.
    
    ### Por que é necessário
    
    **Problema atual:** `appendToMemory()` salva o texto completo do resultado final (`lastResult`) na MEMORY.md. Conversas longas geram entradas enormes e poluídas.
    
    **Solução:** Extrair apenas fatos, decisões, preferências e aprendizados.
    
    ### Onde se conecta
    
    - **Hook:** `after_response` no HookManager
    - **Trigger:** Após o orquestrador finalizar o loop principal, antes do `appendToTranscript`
    - **Condição:** `parsed.agent === "finish"` e há `lastResult`
    
    ### Algoritmo
    
    ```
    1. Receber lastResult (string) e metadados da sessão
    2. Se lastResult < 200 chars → salvar raw (resumo desnecessário)
    3. Se lastResult > 200 chars:
       a. Chamar LLM com prompt específico de sumarização
       b. Prompt pede: fatos, decisões, preferências, código relevante (se houver)
       c. Extrair JSON estruturado
    4. Salvar no formato:
       [YYYY-MM-DD HH:MM] [Agent: <name>] T: <task_tag> | Resumo: <summary>
    ```
    
    ### Interface TypeScript
    
    ```typescript
    interface MemorySummary {
      timestamp: string;
      agentName: string;
      taskType: string;       // "code", "analysis", "search", "general"
      summary: string;        // 1-3 frases do que foi feito
      keyFacts: string[];     // fatos descobertos
      decisions: string[];    // decisões tomadas
      preferences?: string[]; // preferências do usuário (se detectadas)
      codeSnipets?: string[]; // códigos relevantes (máx 3)
      tokens: number;         // total de tokens da conversa (do TokenGuard)
    }
    
    function generateMemorySummary(
      lastResult: string,
      agentName: string,
      sessionId: string
    ): Promise<MemorySummary>;
    ```
    
    ### Código de Implementação
    
    Fonte: `core/memory/memory-summarizer.ts`
    
    ```typescript
    import { logger } from "../utils/logger";
    import { extractJSON } from "../orchestrator/orchestrator";
    import { appendToMemory } from "./memory_search";
    
    export interface MemorySummary {
      timestamp: string;
      agentName: string;
      taskType: string;
      summary: string;
      keyFacts: string[];
      decisions: string[];
      preferences?: string[];
      codeSnipets?: string[];
    }
    
    const SUMMARY_PROMPT = `You are a memory summarizer. Given an agent's execution result,
    extract ONLY the essential information for long-term memory.
    
    Rules:
    - Keep summary under 3 sentences
    - Extract concrete facts and decisions, not fluff
    - Ignore errors/retries unless they reveal a preference
    - If code was produced, include max 3 key snippets (up to 5 lines each)
    
    Respond in JSON:
    {
      "taskType": "code | analysis | search | general",
      "summary": "what was accomplished",
      "keyFacts": ["fact1", "fact2"],
      "decisions": ["decision1"],
      "preferences": ["pref1"],
      "codeSnipets": ["snippet1"]
    }`;
    
    export class MemorySummarizer {
      private summarizer: Agent; // LLM agent for summarization
    
      constructor(summarizerAgent: Agent) {
        this.summarizer = summarizerAgent;
      }
    
      async summarize(
        raw: string,
        agentName: string
      ): Promise<MemorySummary> {
        if (raw.length < 200) {
          return {
            timestamp: new Date().toISOString(),
            agentName,
            taskType: "general",
            summary: raw.slice(0, 200),
            keyFacts: [],
            decisions: [],
          };
        }
    
        const prompt = `${SUMMARY_PROMPT}

Agent: ${agentName}
Result:
${raw.slice(0, 6000)}`;
        const response = await this.summarizer.run(prompt);
        const parsed = extractJSON(response, "memory-summary");
    
        if (!parsed || !parsed.summary) {
          logger.warn("[MemorySummarizer] Invalid LLM response, using fallback");
          return this.fallback(raw, agentName);
        }
    
        return {
          timestamp: new Date().toISOString(),
          agentName,
          taskType: parsed.taskType || "general",
          summary: parsed.summary,
          keyFacts: parsed.keyFacts || [],
          decisions: parsed.decisions || [],
          preferences: parsed.preferences,
          codeSnipets: parsed.codeSnipets,
        };
      }
    
      async persist(summary: MemorySummary): Promise<void> {
        const { timestamp, agentName, taskType, summary: text } = summary;
        const tag = `[${taskType.toUpperCase()}]`;
        const formatted = `[${timestamp}] [${agentName}] ${tag} ${text}`;
    
        if (summary.keyFacts.length > 0) {
          const facts = summary.keyFacts.map(f => `  → ${f}`).join("\n");
          await appendToMemory(formatted + "\n" + facts);
        } else {
          await appendToMemory(formatted);
        }
    
        logger.info(`[MemorySummarizer] Saved: ${formatted.slice(0, 100)}...`);
      }
    
      private fallback(raw: string, agentName: string): MemorySummary {
        const firstLine = raw.split("\n")[0].slice(0, 200);
        return {
          timestamp: new Date().toISOString(),
          agentName,
          taskType: "general",
          summary: firstLine || raw.slice(0, 200),
          keyFacts: [],
          decisions: [],
        };
      }
    }
    ```
    
    ### Testes
    
    ```typescript
    // tests/memory-summarizer.test.ts
    describe("MemorySummarizer", () => {
      it("should summarize long text", async () => {
        const summarizer = new MemorySummarizer(mockAgent);
        const result = await summarizer.summarize(LONG_TEXT, "python_code");
        expect(result.summary.length).toBeLessThan(300);
        expect(result.keyFacts.length).toBeGreaterThan(0);
      });
    
      it("should skip summarization for short text", async () => {
        const result = await summarizer.summarize("OK", "assistant");
        expect(result.summary).toBe("OK");
        expect(result.keyFacts).toEqual([]);
      });
    
      it("should handle LLM failure gracefully", async () => {
        mockAgent.run = () => throw new Error("LLM down");
        const result = await summarizer.summarize(LONG_TEXT, "python_code");
        expect(result.taskType).toBe("general"); // fallback
      });
    
      it("should format entry correctly for MEMORY.md", async () => {
        const summary = await summarizer.summarize(CODE_TEXT, "python_code");
        await summarizer.persist(summary); // Should write: [2026-06-05] [python_code] [CODE] ...
      });
    });
    ```
    
    ---
    
    ## 4. Componente 2: ConversationalGuard
    
    ### O que faz
    
    Valida a resposta do LLM **antes** de retorná-la ao usuário. Verifica:
    1. **Conteúdo útil:** resposta tem substância ou é vaga?
    2. **Alucinação:** resposta contém afirmações factualmente questionáveis?
    3. **Coerência:** resposta é coerente com o contexto e input do usuário?
    4. **Formato:** se era esperado JSON/código, o formato está correto?
    
    ### Por que é necessário
    
    **Problema atual:** O orquestrador confia cegamente na resposta do planner + agentes. LLMs ocasionalmente produzem respostas vazias, contraditórias ou alucinadas.
    
    **Solução:** Um guard leve que avalia a resposta antes do `turn_end`.
    
    ### Onde se conecta
    
    - **Hook:** `before_response` no HookManager
    - **Trigger:** Imediatamente antes de retornar `lastResult` ao usuário
    - **Ação:** Se a resposta falhar na validação, regenera ou aplica fallback
    
    ### Algoritmo
    
    ```
    1. Receber response (string) + HookContext (input, history, context, agentName)
    2. Heurísticas rápidas (sem LLM):
       a. Length check: response < 10 chars → flag "demasiado curta"
       b. Repetition check: response contém repetição excessiva → flag "repetitiva"
       c. Placeholder check: contém [inserir...] ou "como um assistente IA" → flag "genérica"
       d. JSON check: se agente era code/python, response.parse() funciona?
    3. Se alguma flag acionar:
       a. Tentar regenerar com contexto adicional (max 1 retry)
       b. Se regeneração falhar, retornar fallback
    4. Se passar, retornar response original
    ```
    
    ### Interface TypeScript
    
    ```typescript
    interface GuardResult {
      approved: boolean;
      response: string;         // original ou corrigida
      flags: string[];          // flags que acionaram
      retries: number;          // quantas vezes regenerou
      latency: number;          // ms gastos na validação
    }
    
    function validateResponse(
      context: HookContext
    ): Promise<GuardResult>;
    ```
    
    ### Código de Implementação
    
    Fonte: `core/hooks/conversational-guard.ts`
    
    ```typescript
    import { logger } from "../utils/logger";
    import type { HookContext } from "./hook-system";
    
    interface GuardResult {
      approved: boolean;
      response: string;
      flags: string[];
      retries: number;
      latency: number;
    }
    
    const SUSPICIOUS_PATTERNS = [
      /^.{0,10}$/,                                     // muito curta
      /como (um|uma) (assistente|IA|inteligência)/i,   // genérica
      /\[inserir|\[exemplo|\[seu/i,                    // placeholder
      /não ?(posso|consigo|tenho informação)/i,        // recusa genérica
    ];
    
    const REPETITION_THRESHOLD = 0.4; // 40% de repetição de bigramas
    
    export class ConversationalGuard {
      private regenerateFn: (
        prompt: string,
        context: string
      ) => Promise<string>;
    
      constructor(regenerateFn: (p: string, c: string) => Promise<string>) {
        this.regenerateFn = regenerateFn;
      }
    
      async validate(ctx: HookContext): Promise<GuardResult> {
        const start = Date.now();
        const response = ctx.response || "";
        const flags: string[] = [];
    
        // === Heurísticas rápidas (custo zero de LLM) ===
        if (SUSPICIOUS_PATTERNS.some(p => p.test(response.trim()))) {
          flags.push("generic_or_empty");
        }
    
        if (this.hasRepetition(response)) {
          flags.push("repetitive");
        }
    
        // Se agente era code/python, validar JSON
        if (ctx.agentName === "python_code" || ctx.agentName === "code") {
          if (!this.isValidCode(response)) {
            flags.push("invalid_code_format");
          }
        }
    
        // === Se passou, retornar aprovado ===
        if (flags.length === 0) {
          return {
            approved: true,
            response,
            flags: [],
            retries: 0,
            latency: Date.now() - start,
          };
        }
    
        // === Tentar regeneração (1 retry apenas) ===
        logger.warn(`[Guard] Flags acionadas: ${flags.join(", ")}. Regenerando...`);
    
        const retryPrompt = `The previous response was flagged as: ${flags.join(", ")}
    Please provide a more detailed, specific response.
    
    Original input: ${ctx.input.slice(0, 500)}
    Context: ${(ctx.context || "").slice(0, 1000)}
    
    Original response was: ${response.slice(0, 300)}
    
    Provide a BETTER response now. Be specific and helpful.`;
    
        try {
          const newResponse = await this.regenerateFn(retryPrompt, ctx.context || "");
          return {
            approved: true,
            response: newResponse,
            flags,
            retries: 1,
            latency: Date.now() - start,
          };
        } catch (err) {
          logger.error(`[Guard] Regeneração falhou: ${err}`);
          return {
            approved: false,
            response, // retorna original mesmo com falha
            flags,
            retries: 1,
            latency: Date.now() - start,
          };
        }
      }
    
      private hasRepetition(text: string): boolean {
        const words = text.toLowerCase().split(/\s+/);
        if (words.length < 10) return false;
    
        const bigrams = new Map<string, number>();
        for (let i = 0; i < words.length - 1; i++) {
          const bg = words[i] + " " + words[i + 1];
          bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
        }
    
        let repeatedCount = 0;
        for (const count of bigrams.values()) {
          if (count > 1) repeatedCount += count;
        }
    
        return repeatedCount / words.length > REPETITION_THRESHOLD;
      }
    
      private isValidCode(text: string): boolean {
        // Checa se tem ao menos um bloco de código ou estrutura recognizável
        return /```[\s\S]*```|function |class |import |const |let |var |def |async|await/.test(text);
      }
    }
    ```
    
    ### Testes
    
    ```typescript
    describe("ConversationalGuard", () => {
      it("should approve good responses", async () => {
        const guard = new ConversationalGuard(mockRegenerate);
        const result = await guard.validate({
          input: "what is 2+2?",
          response: "2 + 2 = 4",
          context: "",
        } as HookContext);
        expect(result.approved).toBe(true);
        expect(result.flags.length).toBe(0);
      });
    
      it("should flag empty responses", async () => {
        const result = await guard.validate({
          input: "hello",
          response: "Oi",
          context: "",
        } as HookContext);
        expect(result.flags).toContain("generic_or_empty");
      });
    
      it("should flag generic responses", async () => {
        const result = await guard.validate({
          input: "explain quantum computing",
          response: "Como um assistente IA, posso ajudar com isso...",
          context: "",
        } as HookContext);
        expect(result.flags).toContain("generic_or_empty");
      });
    
      it("should regenerate on failure", async () => {
        let regenerated = false;
        const guard = new ConversationalGuard(async () => {
          regenerated = true;
          return "better response";
        });
        const result = await guard.validate({
          input: "hello",
          response: "Oi",
          context: "",
        } as HookContext);
        expect(regenerated).toBe(true);
        expect(result.retries).toBe(1);
      });
    });
    ```
    
    ---
    
    ## 5. Componente 3: TokenGuard
    
    ### O que faz
    
    Gerencia proativamente o número de tokens no contexto para evitar:
    - Estouro do limite de contexto do LLM
    - Degradação de performance em conversas longas
    - Perda de informações relevantes por corte abrupto
    
    ### Por que é necessário
    
    **Problema atual:** O sliding window de 15 interações (30 mensagens) é fixo e não considera:
    - Tamanho real das mensagens em tokens
    - Importância de mensagens específicas (tudo é cortado igual)
    - Mensagens de sistema vs. usuário vs. agente
    
    **Solução:** Contagem real de tokens + política de poda inteligente.
    
    ### Onde se conecta
    
    - **Hook:** `before_planner` (avaliar contexto antes de planejar)
    - **Hook:** `after_agent` (atualizar contagem após cada execução)
    - **Interação:** Fornece `tokenCount` ao `MemorySummarizer`
    
    ### Algoritmo
    
    ```
    1. A cada before_planner:
       a. Estimar tokens do contexto formatado (history + memoryContext + planContext)
       b. Se > 80% do limite (ex: 100k de 128k):
          - Identificar mensagens menos relevantes (baseado em idade + score de importância)
          - Podar até voltar para 60% do limite
    2. A cada after_agent:
       a. Adicionar tokens gastos ao contador total da sessão
       b. Atualizar metadados no ContextEngine
    3. Expor getTokenUsage() para MemorySummarizer
    ```
    
    ### Interface TypeScript
    
    ```typescript
    interface TokenUsage {
      totalInput: number;       // tokens consumidos como input
      totalOutput: number;      // tokens produzidos como output
      currentContext: number;   // tokens no contexto atual
      contextLimit: number;     // limite máximo (ex: 128000)
      utilization: number;      // porcentagem (0-1)
      pruningCount: number;     // quantas vezes podou
    }
    
    interface PruneResult {
      prunedMessages: number;
      tokensFreed: number;
      survivingMessages: FormattedMessage[];
    }
    
    class TokenGuard {
      private limit: number;
      private usage: TokenUsage;
      private pruneHistory: PruneResult[];
    
      constructor(contextLimit: number = 128000);
    
      // Avaliar contexto e podar se necessário
      async pruneIfNeeded(messages: FormattedMessage[]): Promise<PruneResult>;
    
      // Atualizar contagem após execução de agente
      recordUsage(input: string, output: string): void;
    
      // Obter relatório atual
      getUsage(): TokenUsage;
    
      // Estimar tokens (fallback: charCount / 3.5)
      private estimateTokens(text: string): number;
    
      // Identificar mensagens candidatas a poda
      private rankMessages(messages: FormattedMessage[]): RankedMessage[];
    }
    ```
    
    ### Código de Implementação
    
    Fonte: `core/hooks/token-guard.ts`
    
    ```typescript
    import { logger } from "../utils/logger";
    import type { HookContext } from "./hook-system";
    
    interface TokenUsage {
      totalInput: number;
      totalOutput: number;
      currentContext: number;
      contextLimit: number;
      utilization: number;
      pruningCount: number;
    }
    
    interface PruneResult {
      prunedMessages: number;
      tokensFreed: number;
      survivingMessages: FormattedMessage[];
    }
    
    interface RankedMessage {
      index: number;
      message: FormattedMessage;
      score: number; // menor = mais candidato a poda
    }
    
    interface FormattedMessage {
      role: "user" | "assistant" | "system" | "agent";
      content: string;
      timestamp: number;
      metadata?: {
        agentName?: string;
        importance?: number; // 0-1, default 0.5
      };
    }
    
    export class TokenGuard {
      private limit: number;
      private warningThreshold: number; // 0.8 = 80%
      private targetThreshold: number;  // 0.6 = 60%
      private usage: TokenUsage;
      private pruneHistory: PruneResult[] = [];
    
      constructor(
        contextLimit: number = 128000,
        warningThreshold: number = 0.8,
        targetThreshold: number = 0.6
      ) {
        this.limit = contextLimit;
        this.warningThreshold = warningThreshold;
        this.targetThreshold = targetThreshold;
        this.usage = {
          totalInput: 0,
          totalOutput: 0,
          currentContext: 0,
          contextLimit,
          utilization: 0,
          pruningCount: 0,
        };
      }
    
      async pruneIfNeeded(
        messages: FormattedMessage[]
      ): Promise<PruneResult | null> {
        const currentTokens = this.estimateTokenArray(messages);
        this.usage.currentContext = currentTokens;
        this.usage.utilization = currentTokens / this.limit;
    
        if (this.usage.utilization < this.warningThreshold) {
          return null; // não precisa podar
        }
    
        logger.info(
          `[TokenGuard] Context at ${(this.usage.utilization * 100).toFixed(1)}%. Podando...`
        );
    
        const targetTokens = Math.floor(this.limit * this.targetThreshold);
        const tokensToFree = currentTokens - targetTokens;
        const ranked = this.rankMessages(messages);
    
        const surviving: FormattedMessage[] = [];
        const pruned: FormattedMessage[] = [];
        let tokensFreed = 0;
    
        for (const item of ranked) {
          if (tokensFreed >= tokensToFree) {
            surviving.push(item.message);
          } else {
            const msgTokens = this.estimateTokens(item.message.content);
            // Não podar mensagens de sistema
            if (item.message.role === "system") {
              surviving.push(item.message);
            } else {
              pruned.push(item.message);
              tokensFreed += msgTokens;
            }
          }
        }
    
        // Ordenar surviving de volta à ordem original
        surviving.sort((a, b) => a.timestamp - b.timestamp);
    
        const result: PruneResult = {
          prunedMessages: pruned.length,
          tokensFreed,
          survivingMessages: surviving,
        };
    
        this.pruneHistory.push(result);
        this.usage.pruningCount++;
    
        logger.info(
          `[TokenGuard] Podadas ${pruned.length} mensagens, liberados ${tokensFreed} tokens`
        );
    
        return result;
      }
    
      recordUsage(input: string, output: string): void {
        this.usage.totalInput += this.estimateTokens(input);
        this.usage.totalOutput += this.estimateTokens(output);
      }
    
      getUsage(): TokenUsage {
        return { ...this.usage };
      }
    
      getHistory(): PruneResult[] {
        return [...this.pruneHistory];
      }
    
      // ============================================================
      // Heurísticas de Estimativa
      // ============================================================
    
      private estimateTokens(text: string): number {
        if (!text) return 0;
        // Aproximação: 1 token ≈ 3.5 caracteres para texto em português/inglês
        // Mas também considerar que código é mais denso (~2.5 chars/token)
        const codeRatio = (text.match(/[{}();\[\]<>]/g) || []).length / text.length;
        const ratio = codeRatio > 0.05 ? 2.5 : 3.5;
        return Math.ceil(text.length / ratio);
      }
    
      private estimateTokenArray(messages: FormattedMessage[]): number {
        return messages.reduce(
          (sum, msg) => sum + this.estimateTokens(msg.content),
          0
        );
      }
    
      private rankMessages(messages: FormattedMessage[]): RankedMessage[] {
        const now = Date.now();
    
        return messages
          .map((msg, index) => {
            // Score base: idade da mensagem (mais antiga = menor score)
            const ageHours = (now - msg.timestamp) / (1000 * 60 * 60);
            const ageScore = Math.max(0, 1 - ageHours / 48); // 48h = score 0
    
            // Importance metadata (se disponível)
            const importanceScore = msg.metadata?.importance ?? 0.5;
    
            // Role bonus: user messages são mais importantes que agent/assistant
            const roleBonus = msg.role === "user" ? 0.2 : 0;
    
            // Score final (menor = mais candidato a poda)
            const score = ageScore * 0.4 + importanceScore * 0.4 + roleBonus;
    
            return { index, message: msg, score };
          })
          .sort((a, b) => a.score - b.score); // crescente: piores primeiro
      }
    }
    ```
    
    ### Testes
    
    ```typescript
    describe("TokenGuard", () => {
      it("should not prune when under threshold", async () => {
        const guard = new TokenGuard(1000, 0.8, 0.6);
        const messages = [
          { role: "user", content: "hi", timestamp: Date.now() },
        ];
        const result = await guard.pruneIfNeeded(messages as any);
        expect(result).toBeNull();
      });
    
      it("should prune when over threshold", async () => {
        const guard = new TokenGuard(200, 0.5, 0.3);
        const longMsg = "x".repeat(400); // ~114 tokens
        const messages = Array.from({ length: 5 }, (_, i) => ({
          role: i === 0 ? "system" : "user",
          content: longMsg,
          timestamp: Date.now() - i * 3600000,
        }));
        const result = await guard.pruneIfNeeded(messages as any);
        expect(result).not.toBeNull();
        expect(result!.prunedMessages).toBeGreaterThan(0);
        expect(result!.tokensFreed).toBeGreaterThan(0);
      });
    
      it("should never prune system messages", async () => {
        const guard = new TokenGuard(100, 0.3, 0.1);
        const messages = [
          { role: "system", content: "x".repeat(200), timestamp: Date.now() },
          { role: "user", content: "x".repeat(200), timestamp: Date.now() },
        ];
        const result = await guard.pruneIfNeeded(messages as any);
        expect(result!.survivingMessages.some(m => m.role === "system")).toBe(true);
      });
    
      it("should track usage statistics", () => {
        const guard = new TokenGuard();
        guard.recordUsage("hello world", "hi there");
        const usage = guard.getUsage();
        expect(usage.totalInput).toBeGreaterThan(0);
        expect(usage.totalOutput).toBeGreaterThan(0);
      });
    });
    ```
    
    ---
    
    ## 6. Componente 4: Background Resilience Layer
    
    ### O que faz
    
    Garante que falhas em componentes não-críticos nunca derrubem o fluxo principal. É uma camada de **degradação graciosa** que envolve operações opcionais em `try/catch` com fallbacks inteligentes.
    
    ### Por que é necessário
    
    **Problema atual:** O orquestrador já usa `try/catch` para operações não-críticas, mas de forma ad-hoc. Não há:
    - Política consistente de fallback
    - Limite de retentativas
    - Logging estruturado de falhas não-críticas
    - Métricas de taxa de falha por componente
    
    **Solução:** Um wrapper reutilizável que padroniza o tratamento de falhas.
    
    ### Onde se conecta
    
    - **Transversal:** Envolve todas as operações do orquestrador que são opcionais
    - **Uso:** `Resilience.wrap(operation, options)` em vez de `try/catch` manual
    
    ### Algoritmo
    
    ```
    1. Wrapper recebe função assíncrona + opções
    2. Executa com retentativa configurável (default: 1 retry)
    3. Se falhar:
       a. Se fallbackFn definido → executa fallback
       b. Se não → retorna valor default
    4. Log estruturado com: operation, duration, error, fallback used
    5. Atualiza métricas internas (total calls, failures, p95 latency)
    ```
    
    ### Interface TypeScript
    
    ```typescript
    interface ResilienceOptions<T> {
      operation: string;            // nome para logging
      maxRetries?: number;          // default: 1
      retryDelay?: number;          // ms entre retries, default: 100
      fallback?: () => Promise<T>;  // fallback opcional
      fallbackValue?: T;            // valor default se fallback falhar
      timeout?: number;             // ms timeout, default: 10000
      silent?: boolean;             // suprimir logs de warning
    }
    
    interface ResilienceMetrics {
      totalCalls: number;
      successCalls: number;
      failedCalls: number;
      fallbackCalls: number;
      p95Latency: number;
      operations: Map<string, {
        calls: number;
        failures: number;
        totalLatency: number;
      }>;
    }
    
    class Resilience {
      private metrics: ResilienceMetrics;
      
      static async wrap<T>(
        fn: () => Promise<T>,
        options: ResilienceOptions<T>
      ): Promise<T>;
    
      static getMetrics(): ResilienceMetrics;
      static resetMetrics(): void;
    }
    ```
    
    ### Código de Implementação
    
    Fonte: `core/resilience/resilience-layer.ts`
    
    ```typescript
    import { logger } from "../utils/logger";
    
    interface ResilienceOptions<T> {
      operation: string;
      maxRetries?: number;
      retryDelay?: number;
      fallback?: () => Promise<T>;
      fallbackValue?: T;
      timeout?: number;
      silent?: boolean;
    }
    
    interface OperationStats {
      calls: number;
      failures: number;
      totalLatency: number;
      fallbacks: number;
    }
    
    interface ResilienceMetrics {
      totalCalls: number;
      successCalls: number;
      failedCalls: number;
      fallbackCalls: number;
      p95Latency: number;
      operations: Map<string, OperationStats>;
    }
    
    export class Resilience {
      private static metrics: ResilienceMetrics = {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        fallbackCalls: 0,
        p95Latency: 0,
        operations: new Map(),
      };
    
      private static latencies: number[] = [];
    
      static async wrap<T>(
        fn: () => Promise<T>,
        options: ResilienceOptions<T>
      ): Promise<T> {
        const {
          operation,
          maxRetries = 1,
          retryDelay = 100,
          fallback,
          fallbackValue,
          timeout = 10000,
          silent = false,
        } = options;
    
        const start = Date.now();
        this.metrics.totalCalls++;
        this.recordOperation(operation, "call");
    
        let lastError: Error | null = null;
    
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await this.withTimeout(fn, timeout, operation);
    
            // Sucesso
            const latency = Date.now() - start;
            this.latencies.push(latency);
            this.metrics.successCalls++;
            this.recordOperation(operation, "success", latency);
    
            if (!silent && attempt > 0) {
              logger.info(
                `[Resilience] "${operation}" succeeded after ${attempt} retries (${latency}ms)`
              );
            }
    
            return result;
          } catch (err) {
            lastError = err as Error;
    
            if (!silent) {
              logger.warn(
                `[Resilience] "${operation}" failed (attempt ${attempt + 1}/${maxRetries + 1}): ${(err as Error).message}`
              );
            }
    
            if (attempt < maxRetries) {
              await this.sleep(retryDelay * (attempt + 1)); // exponential backoff leve
            }
          }
        }
    
        // Falha após todas as retentativas
        const latency = Date.now() - start;
        this.metrics.failedCalls++;
        this.recordOperation(operation, "failure", latency);
    
        // Tentar fallback
        if (fallback) {
          try {
            if (!silent) {
              logger.info(`[Resilience] "${operation}" executing fallback...`);
            }
            const fallbackResult = await fallback();
            this.metrics.fallbackCalls++;
            this.recordOperation(operation, "fallback");
            return fallbackResult;
          } catch (fbErr) {
            if (!silent) {
              logger.warn(
                `[Resilience] "${operation}" fallback also failed: ${(fbErr as Error).message}`
              );
            }
          }
        }
    
        // Fallback value
        if (fallbackValue !== undefined) {
          this.metrics.fallbackCalls++;
          this.recordOperation(operation, "fallback_value");
          if (!silent) {
            logger.info(`[Resilience] "${operation}" using fallback value`);
          }
          return fallbackValue;
        }
    
        // Sem fallback: propaga o erro
        throw lastError;
      }
    
      static getMetrics(): ResilienceMetrics {
        // Calcular p95
        const sorted = [...this.latencies].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        this.metrics.p95Latency = sorted[p95Index] || 0;
    
        return {
          totalCalls: this.metrics.totalCalls,
          successCalls: this.metrics.successCalls,
          failedCalls: this.metrics.failedCalls,
          fallbackCalls: this.metrics.fallbackCalls,
          p95Latency: this.metrics.p95Latency,
          operations: new Map(this.metrics.operations),
        };
      }
    
      static resetMetrics(): void {
        this.metrics = {
          totalCalls: 0,
          successCalls: 0,
          failedCalls: 0,
          fallbackCalls: 0,
          p95Latency: 0,
          operations: new Map(),
        };
        this.latencies = [];
      }
    
      // ============================================================
      // Helpers Privados
      // ============================================================
    
      private static async withTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number,
        operation: string
      ): Promise<T> {
        return Promise.race([
          fn(),
          new Promise<T>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout after ${timeoutMs}ms: "${operation}"`)),
              timeoutMs
            )
          ),
        ]);
      }
    
      private static recordOperation(
        operation: string,
        event: "call" | "success" | "failure" | "fallback" | "fallback_value",
        latency?: number
      ): void {
        if (!this.metrics.operations.has(operation)) {
          this.metrics.operations.set(operation, {
            calls: 0,
            failures: 0,
            totalLatency: 0,
            fallbacks: 0,
          });
        }
    
        const stats = this.metrics.operations.get(operation)!;
    
        switch (event) {
          case "call":
            stats.calls++;
            break;
          case "success":
            stats.totalLatency += latency || 0;
            break;
          case "failure":
            stats.failures++;
            break;
          case "fallback":
          case "fallback_value":
            stats.fallbacks++;
            break;
        }
      }
    
      private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    }
    ```
    
    ### Testes
    
    ```typescript
    describe("Resilience", () => {
      beforeEach(() => Resilience.resetMetrics());
    
      it("should return successful result directly", async () => {
        const result = await Resilience.wrap(
          () => Promise.resolve(42),
          { operation: "test" }
        );
        expect(result).toBe(42);
      });
    
      it("should retry on failure", async () => {
        let attempts = 0;
        const result = await Resilience.wrap(
          () => {
            attempts++;
            if (attempts < 2) throw new Error("fail");
            return Promise.resolve("ok");
          },
          { operation: "retry-test", maxRetries: 2 }
        );
        expect(result).toBe("ok");
        expect(attempts).toBe(2);
      });
    
      it("should use fallback value after exhausting retries", async () => {
        const result = await Resilience.wrap(
          () => Promise.reject(new Error("always fails")),
          { operation: "fallback-test", maxRetries: 1, fallbackValue: "default" }
        );
        expect(result).toBe("default");
      });
    
      it("should use fallback function", async () => {
        const result = await Resilience.wrap(
          () => Promise.reject(new Error("fail")),
          {
            operation: "fb-fn",
            maxRetries: 0,
            fallback: () => Promise.resolve("from fallback"),
          }
        );
        expect(result).toBe("from fallback");
      });
    
      it("should throw if no fallback available", async () => {
        await expect(
          Resilience.wrap(
            () => Promise.reject(new Error("fail")),
            { operation: "throw-test", maxRetries: 0 }
          )
        ).rejects.toThrow("fail");
      });
    
      it("should track metrics", async () => {
        await Resilience.wrap(() => Promise.resolve(1), { operation: "a" });
        await Resilience.wrap(() => Promise.reject(new Error("x")), {
          operation: "b",
          maxRetries: 0,
          fallbackValue: 0,
        });
    
        const metrics = Resilience.getMetrics();
        expect(metrics.totalCalls).toBe(2);
        expect(metrics.successCalls).toBe(1);
        expect(metrics.failedCalls).toBe(1);
        expect(metrics.fallbackCalls).toBe(1);
      });
    
      it("should timeout slow operations", async () => {
        await expect(
          Resilience.wrap(
            () => new Promise(resolve => setTimeout(resolve, 2000)),
            { operation: "timeout-test", timeout: 100, maxRetries: 0 }
          )
        ).rejects.toThrow("Timeout");
      });
    });
    ```
    
    ---
    
    ## 7. Plano de Implementação
    
    ### Fase 1: Fundação (Dia 1)
    
    | Step | Componente | Ação | Arquivos |
    |------|-----------|------|----------|
    | 1.1 | Resilience Layer | Criar `core/resilience/resilience-layer.ts` | NOVO |
    | 1.2 | TokenGuard | Criar `core/hooks/token-guard.ts` | NOVO |
    | 1.3 | Testes | Escrever testes unitários para ambos | NOVO |
    
    **Critério de sucesso:** Resilience.wrap() funciona e TokenGuard consegue estimar/podar tokens.
    
    ### Fase 2: Hooks de Validação (Dia 2)
    
    | Step | Componente | Ação | Arquivos |
    |------|-----------|------|----------|
    | 2.1 | ConversationalGuard | Criar `core/hooks/conversational-guard.ts` | NOVO |
    | 2.2 | Testes | Escrever testes unitários | NOVO |
    | 2.3 | Integração | Conectar ao HookManager no orchestrator.ts | MODIFICAR |
    
    **Critério de sucesso:** Respostas vazias/genéricas são detectadas e regeneradas.
    
    ### Fase 3: Memória Inteligente (Dia 3)
    
    | Step | Componente | Ação | Arquivos |
    |------|-----------|------|----------|
    | 3.1 | MemorySummarizer | Criar `core/memory/memory-summarizer.ts` | NOVO |
    | 3.2 | Integração | Conectar ao after_response no orchestrator | MODIFICAR |
    | 3.3 | Substituição | Alterar `appendToMemory(lastResult)` para usar MemorySummarizer | MODIFICAR |
    
    **Critério de sucesso:** MEMORY.md contém apenas entradas resumidas, não dumps brutos.
    
    ### Fase 4: Pontos de Integração no Orchestrator
    
    ```typescript
    // NO orchestrator.ts - MODIFICAÇÕES NECESSÁRIAS
    
    // 1. Imports
    import { MemorySummarizer } from "../memory/memory-summarizer";
    import { ConversationalGuard } from "../hooks/conversational-guard";
    import { TokenGuard } from "../hooks/token-guard";
    import { Resilience } from "../resilience/resilience-layer";
    
    // 2. Novos campos na classe
    private memorySummarizer: MemorySummarizer;
    private conversationalGuard: ConversationalGuard;
    private tokenGuard: TokenGuard;
    
    // 3. Inicialização no constructor
    constructor() {
      // ... existing initialization ...
    
      this.memorySummarizer = new MemorySummarizer(this.planner);
      this.conversationalGuard = new ConversationalGuard(
        (prompt, ctx) => this.planner.run(prompt)
      );
      this.tokenGuard = new TokenGuard(128000, 0.8, 0.6);
    
      // Registrar hooks
      this.hookManager.register({
        name: "token-guard-before-planner",
        priority: 10,
        events: ["before_planner"],
        handler: async (event, ctx) => {
          await Resilience.wrap(
            () => this.tokenGuard.pruneIfNeeded(ctx.history as any),
            { operation: "token-guard.prune", silent: true, fallbackValue: null }
          );
          return ctx;
        },
      });
    
      this.hookManager.register({
        name: "conversational-guard",
        priority: 50,
        events: ["before_response"],
        handler: async (event, ctx) => {
          const result = await Resilience.wrap(
            () => this.conversationalGuard.validate(ctx),
            { operation: "conversational-guard.validate", fallbackValue: { approved: true, response: ctx.response, flags: [], retries: 0, latency: 0 } }
          );
          return { ...ctx, response: result.response };
        },
      });
    
      this.hookManager.register({
        name: "memory-summarizer",
        priority: 90,
        events: ["after_response"],
        handler: async (event, ctx) => {
          await Resilience.wrap(
            async () => {
              const summary = await this.memorySummarizer.summarize(
                ctx.response || "",
                ctx.agentName || "unknown"
              );
              await this.memorySummarizer.persist(summary);
            },
            { operation: "memory-summarizer", silent: true, fallbackValue: undefined }
          );
          return ctx;
        },
      });
    }
    
    // 4. Substituir o dump bruto
    // ANTES:
    // appendToMemory(lastResult);
    
    // DEPOIS:
    // (feito pelo hook memory-summarizer no after_response)
    ```
    
    ### Fase 5: Observabilidade (Dia 4)
    
    | Step | Ação | Resultado |
    |------|------|-----------|
    | 5.1 | Adicionar endpoint `/metrics/resilience` | Dashboard de falhas/sucessos |
    | 5.2 | Adicionar endpoint `/metrics/tokens` | Visualização de uso de tokens |
    | 5.3 | Logging dos flags do ConversationalGuard | Identificar padrões de resposta ruim |
    
    ---
    
    ## 8. Métricas e Observabilidade
    
    ### Métricas do Resilience Layer
    
    ```typescript
    interface ResilienceReport {
      totalCalls: number;
      successRate: string;        // "98.5%"
      failureRate: string;        // "1.5%"
      fallbackRate: string;       // "0.8%"
      p95Latency: number;         // ms
      topFailingOperations: {     // top 5
        operation: string;
        failures: number;
        calls: number;
      }[];
    }
    ```
    
    ### Métricas do TokenGuard
    
    ```typescript
    interface TokenReport {
      currentUtilization: string;   // "72.3%"
      totalPruningCount: number;
      tokensFreedTotal: number;
      averageTokensPerSession: number;
      pruningEvents: {              // últimas 5
        timestamp: string;
        messagesPruned: number;
        tokensFreed: number;
      }[];
    }
    ```
    
    ### Métricas do ConversationalGuard
    
    ```typescript
    interface GuardReport {
      totalValidations: number;
      approvedRate: string;         // "95.2%"
      regenerationRate: string;     // "4.8%"
      topFlags: {                   // top 3 flags
        flag: string;
        count: number;
      }[];
      averageLatency: number;       // ms
    }
    ```
    
    ---
    
    ## Apêndices
    
    ### A. Fluxo Completo de uma Sessão com Todos os Componentes
    
    ```
    1. Usuário envia mensagem
    2. before_planner hook → TokenGuard.pruneIfNeeded() (se necessário)
    3. Planner decide qual agente executar
    4. after_planner hook → (vazio, reservado)
    5. Agente executa (ex: python_code)
    6. after_agent hook → TokenGuard.recordUsage()
    7. Loop até finish
    8. before_response hook → ConversationalGuard.validate()
       ├── Aprovado → segue
       └── Rejeitado → regenera (1 retry)
    9. after_response hook → MemorySummarizer.summarize() + persist()
    10. Resposta é retornada ao usuário
    11. Resilience.wrap() protege TODAS as operações opcionais acima
    ```
    
    ### B. Tratamento de Erros por Componente
    
    | Componente | Falha | Comportamento |
    |-----------|-------|---------------|
    | MemorySummarizer | LLM offline | Fallback: salva primeiros 200 chars |
    | ConversationalGuard | LLM offline | Fallback: passa resposta original |
    | TokenGuard | Erro de estimativa | Fallback: não poda (safe) |
    | Resilience | Falha total | Propaga erro original |
    
    ### C. Checklist de Qualidade
    
    - [ ] Todos os componentes têm testes unitários com cobertura > 80%
    - [ ] Todos os componentes têm fallback definido para cada operação
    - [ ] Nenhum componente não-crítico pode causar crash no orquestrador
    - [ ] Hooks são registrados com prioridades apropriadas (execução em ordem)
    - [ ] MemorySummarizer não bloqueia resposta ao usuário
    - [ ] ConversationalGuard não adiciona mais de 500ms de latência (com fallback)
    - [ ] TokenGuard considera mensagens de sistema como imutáveis
    - [ ] Resilience metrics são resetáveis entre sessões de teste
    