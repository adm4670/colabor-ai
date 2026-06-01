import OpenAI from "openai";
    import { createLLMClient, getDefaultProvider } from "../llm/provider";
    import type { LLMProviderType } from "../types";
    import { logger } from "../utils/logger";
    import { FEATURES, MODEL_TIERS } from "../config/config";
    
    export interface AgentOptions {
      name: string;
      role: string;
      goal: string;
      backstory: string;
      model?: string;
      generalInstructions?: string;
      baseURL?: string;
      apiKey?: string;
      tools?: any[];
      functions?: Record<string, Function>;
    }
    
    type Message = {
      role: "system" | "user" | "assistant" | "tool";
      content?: string | null;
      reasoning_content?: string;
      tool_call_id?: string;
      name?: string;
      tool_calls?: any;
    };
    
    export class Agent {
      public name: string;
      public role: string;
      public goal: string;
      public backstory: string;
      public model: string;
      public generalInstructions: string;
    
      private client: OpenAI;
      private history: Message[] = [];
      private tools: any[];
      private functions: Record<string, Function>;
    
      constructor(options: AgentOptions) {
        this.name = options.name;
        this.role = options.role;
        this.goal = options.goal;
        this.backstory = options.backstory;
    
        this.model = options.model ?? MODEL_TIERS.default;
        this.generalInstructions =
          options.generalInstructions ?? "- Responda em PT-BR.\n";
    
        this.tools = options.tools ?? [];
        this.functions = options.functions ?? {};
    
        this.client = new OpenAI({
          apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
          baseURL: options.baseURL ?? "https://api.deepseek.com",
        });
    
        console.log(`[Agent] '${this.name}' inicializado | model=${this.model} | tools=${this.tools.length}`);
      }
    
      resetHistory(): void {
        this.history = [];
        console.log(`[Agent] Historico de ${this.name} resetado.`);
      }
    
      // ============================================================
      // SYSTEM PROMPT (SLIM - flash optimized)
      // ============================================================
      // v3: Lazy loading de skills, memoria, notas diarias.
      //     Apenas o essencial no system prompt (~150-250 tokens).
      //     Skills/Memoria sao buscadas via tools (memory_search).
    
      private async ensureSystemMessage(): Promise<void> {
        const systemPrompt = await this.buildSystemPrompt();
        if (this.history.length > 0 && this.history[0].role === "system") {
          this.history[0].content = systemPrompt;
        } else {
          this.history.unshift({ role: "system", content: systemPrompt });
        }
      }
    
      public async buildSystemPrompt(): Promise<string> {
        // === PARTE 1: Tools (dinamico - muda por agente) ===
        const toolsDescription = this.tools.length
          ? "\nFerramentas disponiveis:\n" +
            this.tools.map(t => "- " + t.function.name + ": " + t.function.description).join("\n") +
            "\n\nUse essas ferramentas quando precisar de dados externos ou executar acoes.\n" +
            "Se uma ferramenta for necessaria, utilize-a antes de responder ao usuario.\n"
          : "";
    
        // === PARTE 2: Skills (LAZY - so se o agente realmente precisa) ===
        let skillsInstructions = "";
        if (FEATURES.lazySkills) {
          // Skills sao carregadas sob demanda via tool, NAO injetadas no prompt
          // Deixamos apenas uma dica sutil
          const hasSkillTool = this.functions["memory_search"];
          if (hasSkillTool) {
            skillsInstructions = "\nUse memory_search para buscar contexto relevante de sessoes anteriores.\n";
          }
        } else {
          // Fallback: comportamento antigo
          try {
            const { getSkillsManager } = await import("../skills/skills-manager");
            const contextHint = this.generalInstructions.substring(0, 200);
            const relevantSkills = getSkillsManager().loadRelevantSkills(contextHint);
            if (relevantSkills.length > 0) {
              skillsInstructions = "\n\n=== SKILLS DISPONIVEIS ===\n" +
                "Voce tem acesso as seguintes habilidades especializadas:\n\n" +
                relevantSkills.join("\n\n---\n\n") +
                "\n\nCarregue estas skills quando o contexto da conversa for relevante para elas.\n";
            }
          } catch (e) {
            // Skills manager nao disponivel
          }
        }
    
        // === PARTE 3: Memory capabilities (SLIM) ===
        let memoryInstructions = "";
        if (!FEATURES.lazyMemory) {
          const hasMemorySearch = this.functions["memory_search"];
          if (hasMemorySearch) {
            memoryInstructions = "\n\n=== MEMORY ===\n" +
              "Use memory_search para buscar informacoes passadas.\n";
          }
        }
    
        // === PARTE 4: Notas diarias (LAZY - so se habilitado) ===
        let dailyContext = "";
        if (!FEATURES.lazyMemory) {
          try {
            const { getRecentDailyNotes } = await import("../memory/memory_search");
            const notes = getRecentDailyNotes(3);
            if (notes.size > 0) {
              const recentNotes: string[] = [];
              notes.forEach((content, date) => {
                recentNotes.push(`[${date}]: ${content.slice(0, 120)}`);
              });
              dailyContext = "\n\nNotas recentes:\n" +
                recentNotes.join("\n").substring(0, 400) + "\n";
            }
          } catch (e) {
            // Notas nao disponiveis
          }
        }
    
        // === MONTA PROMPT FINAL (SLIM) ===
        return (
          "Voce e o agente '" + this.name + "'.\n" +
          "Seu papel: " + this.role + "\n" +
          "Seu objetivo: " + this.goal + "\n" +
          "Contexto: " + this.backstory + "\n\n" +
          toolsDescription +
          skillsInstructions +
          memoryInstructions +
          dailyContext +
          "Instrucoes:\n" + this.generalInstructions
        );
      }
    
      /**
       * Carrega skills relevantes para um determinado contexto
       */
      public async getRelevantSkills(context: string): Promise<string[]> {
        try {
          const { getSkillsManager } = await import("../skills/skills-manager");
          return getSkillsManager().loadRelevantSkills(context);
        } catch {
          return [];
        }
      }
    
    
      /**
       * Retry wrapper com exponential backoff + jitter.
       * So retry em erros de rede ou rate limit (429/5xx).
       */
      private async retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        baseDelay: number = 1000
      ): Promise<T> {
        let lastError: any;
    
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await fn();
          } catch (error: any) {
            lastError = error;
    
            // Verificar se deve retry
            const status = error?.status || error?.response?.status;
            const shouldRetry =
              status === 429 || // rate limit
              (status && status >= 500) || // server error
              error?.code === 'ECONNRESET' ||
              error?.code === 'ETIMEDOUT' ||
              error?.code === 'ENOTFOUND' ||
              error?.message?.includes('timeout') ||
              error?.message?.includes('rate');
    
            if (!shouldRetry || attempt >= maxRetries) {
              throw error;
            }
    
            // Exponential backoff + jitter
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
            console.log(
              `[Agent] Retry ${attempt + 1}/${maxRetries} for ${this.name} in ${Math.round(delay)}ms`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
    
        throw lastError;
      }
    
      async run(userInput: string, onProgress?: (msg: string) => Promise<void>): Promise<string> {
        await this.ensureSystemMessage();
    
        this.history.push({ role: "user", content: userInput });
    
        try {
          const completion = await this.retryWithBackoff(() =>
            (this.client.chat.completions.create as any)({
              model: this.model,
              messages: this.history.map((m) => ({
                role: m.role,
                content: m.content || "",
                name: m.name || undefined,
              })),
              tools: this.tools.length > 0 ? this.tools : undefined,
              temperature: 0.2,
              max_tokens: 2048,
            })
          );
    
          const choice = (completion as any).choices?.[0];
          if (!choice) throw new Error("No completion choices returned");
          const message = choice.message;
    
          // Executar tool calls se houver
          if (message.tool_calls && message.tool_calls.length > 0) {
            // Adiciona a mensagem do assistant com tool_calls
            this.history.push({
              role: "assistant",
              content: message.content || null,
              tool_calls: message.tool_calls,
            });
    
            for (const toolCall of message.tool_calls) {
              const fn = this.functions[toolCall.function.name];
              if (fn) {
                try {
                  const args = JSON.parse(toolCall.function.arguments || "{}");
                  const result = await fn(args);
                  const resultStr =
                    typeof result === "string" ? result : JSON.stringify(result);
    
                  this.history.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: resultStr,
                    name: toolCall.function.name,
                  });
                } catch (err: any) {
                  this.history.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: `Error: ${err?.message || err}`,
                    name: toolCall.function.name,
                  });
                }
              }
            }
    
            // Segunda chamada para processar os resultados das tools
            const secondCompletion = await this.retryWithBackoff(() =>
              (this.client.chat.completions.create as any)({
                model: this.model,
                messages: this.history.map((m) => ({
                  role: m.role,
                  content: m.content || "",
                  name: m.name || undefined,
                })),
                temperature: 0.2,
                max_tokens: 4096,
              })
            );
    
            const finalContent = (secondCompletion as any).choices?.[0]?.message?.content || "";
            this.history.push({ role: "assistant", content: finalContent });
            return finalContent;
          }
    
          const content = message.content || "";
          this.history.push({ role: "assistant", content });
          return content;
        } catch (error: any) {
          console.error(`[Agent] Erro em ${this.name}:`, error?.message || error);
          throw error;
        }
      }
    }
    