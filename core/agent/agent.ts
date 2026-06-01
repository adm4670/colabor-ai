import OpenAI from "openai";
    import { createLLMClient, getDefaultProvider } from "../llm/provider";
    import type { LLMProviderType } from "../types";
    import { logger } from "../utils/logger";
    
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
      private log: ReturnType<typeof logger.withContext>;
    
      constructor(options: AgentOptions) {
        this.name = options.name;
        this.role = options.role;
        this.goal = options.goal;
        this.backstory = options.backstory;
    
        this.model = options.model ?? "deepseek-chat";
        this.generalInstructions =
          options.generalInstructions ?? "- Responda em PT-BR.\n";
    
        this.tools = options.tools ?? [];
        this.functions = options.functions ?? {};
    
        this.client = new OpenAI({
          apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
          baseURL: options.baseURL ?? "https://api.deepseek.com",
        });
    
        // Logger com contexto fixo do agente
        this.log = logger.withContext(this.name);
    
        this.log.info("Agente inicializado");
        this.log.info("Modelo: " + this.model, { tools: this.tools.length });
      }
    
      resetHistory(): void {
        this.history = [];
        this.log.info("Historico resetado");
      }
    
      private async ensureSystemMessage(): Promise<void> {
        const systemPrompt = await this.buildSystemPrompt();
        if (this.history.length > 0 && this.history[0].role === "system") {
          this.history[0].content = systemPrompt;
        } else {
          this.history.unshift({ role: "system", content: systemPrompt });
        }
      }
    
      public async buildSystemPrompt(): Promise<string> {
        const toolsDescription = this.tools.length
          ? "\n      Ferramentas disponiveis:\n      " +
            this.tools.map(t => "- " + t.function.name + ": " + t.function.description).join("\n") +
            "\n\n      Use essas ferramentas quando precisar de dados externos ou executar acoes.\n      Se uma ferramenta for necessaria, utilize-a antes de responder ao usuario.\n      "
          : "";
    
        // Carregar skills relevantes (import dinamico evita crash se o modulo nao existir)
        let skillsInstructions = "";
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
    
        // === MEMORY CAPABILITIES ===
        let memoryInstructions = "";
        const hasMemorySearch = this.functions["memory_search"];
        const hasMemoryAppend = this.functions["memory_append"];
        
        if (hasMemorySearch || hasMemoryAppend) {
          memoryInstructions = "\n\n=== MEMORY CAPABILITIES ===\n";
          memoryInstructions += "You have access to a persistent memory system. Use it proactively:\n\n";
          
          if (hasMemorySearch) {
            memoryInstructions += "BEFORE responding to the user:\n";
            memoryInstructions += "- Use memory_search to recall relevant past conversations, preferences, and decisions\n";
            memoryInstructions += "- If the user mentions something you should remember, search for it\n\n";
          }
          
          if (hasMemoryAppend) {
            memoryInstructions += "AFTER completing a task:\n";
            memoryInstructions += "- If you learned something new about the user, use memory_append to save it\n";
            memoryInstructions += "- If the user expressed a preference, record it\n";
            memoryInstructions += "- If you made a decision, document the reasoning\n\n";
          }
          
          memoryInstructions += "EXAMPLES:\n";
          memoryInstructions += '- User: "Remember I prefer dark mode"\n';
          memoryInstructions += '  -> memory_append("User prefers dark mode", "Preferencias")\n';
          memoryInstructions += '- User: "Analyze this project"\n';
          memoryInstructions += '  -> memory_search("project architecture decisions")\n';
          memoryInstructions += "  -> [use results in analysis]\n";
        }
    
        // Notas diarias recentes
        let dailyContext = "";
        try {
          const { getRecentDailyNotes } = await import("../memory/memory_search");
          const notes = getRecentDailyNotes(3);
          if (notes.size > 0) {
            const recentNotes: string[] = [];
            notes.forEach((content, date) => {
              recentNotes.push(`[${date}]: ${content.slice(0, 200)}`);
            });
            dailyContext = "\n\n=== NOTAS RECENTES ===\n" +
              "Aqui estao anotacoes de sessoes anteriores que podem ser uteis:\n" +
              recentNotes.join("\n").substring(0, 800) +
              "\n";
          }
        } catch (e) {
          // Notas nao disponiveis
        }
    
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
            
            const status = error?.status || error?.response?.status;
            const shouldRetry = 
              status === 429 ||
              (status && status >= 500) ||
              error?.code === 'ECONNRESET' ||
              error?.code === 'ETIMEDOUT' ||
              error?.code === 'ENOTFOUND' ||
              error?.message?.includes('timeout') ||
              error?.message?.includes('rate');
            
            if (!shouldRetry || attempt === maxRetries) {
              throw lastError;
            }
            
            const delay = baseDelay * Math.pow(2, attempt);
            const jitter = delay * 0.1 * (Math.random() * 2 - 1);
            const waitMs = Math.floor(delay + jitter);
            
            this.log.warn("Retry " + (attempt + 1) + "/" + maxRetries + " em " + waitMs + "ms: " + error.message);
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
        }
        
        throw lastError;
      }
    
      async run(userMessage: string, onProgress?: (msg: string) => Promise<void>): Promise<string> {
        logger.separator(this.name);
    
        const truncatedMsg = userMessage.length > 120
          ? userMessage.substring(0, 120) + "..."
          : userMessage;
        this.log.info("Input: " + truncatedMsg);
        this.log.debug("Input completo", { length: userMessage.length });
    
        logger.startTimer("execucao." + this.name, this.name);
        await this.ensureSystemMessage();
    
        this.history.push({
          role: "user",
          content: userMessage,
        });
    
        try {
          while (true) {
            this.log.info("Enviando requisicao para o modelo...", { historico: this.history.length + " mensagens" });
    
            const response = await this.retryWithBackoff(
              () => this.client.chat.completions.create({
                model: this.model,
                messages: this.history as any,
                tools: this.tools.length ? this.tools : undefined,
                tool_choice: this.tools.length ? "auto" : undefined,
              } as any),
              3
            );
    
            const msg = (response as any).choices[0].message;
    
            this.log.info("Resposta do modelo recebida");
    
            if (msg.content) {
              const preview = msg.content.length > 200
                ? msg.content.substring(0, 200) + "..."
                : msg.content;
              this.log.debug("Conteudo: " + preview);
            }
            if ((msg as any).reasoning_content) {
              const preview = (msg as any).reasoning_content.substring(0, 100);
              this.log.debug("Raciocinio recebido: " + preview + "...");
            }
    
            const assistantEntry: Message = {
              role: "assistant",
              content: msg.content,
            };
    
            if ((msg as any).reasoning_content) {
                  assistantEntry.reasoning_content = (msg as any).reasoning_content;
                  
                  // Forward reasoning as dynamic progress messages
                  const reasoning = (msg as any).reasoning_content as string;
                  if (reasoning && onProgress) {
                    const thoughts = reasoning
                      .replace(/\n+/g, ' ')
                      .split(/(?<=[.!?])\s+/)
                      .filter((t: string) => t.trim().length > 10)
                      .slice(0, 2);
                    for (const thought of thoughts) {
                      await onProgress('\u{1F4AD} ' + thought.trim().slice(0, 120));
                    }
                  }
                }
    
            if (msg.tool_calls) {
              this.log.info("Tool calls detectadas: " + msg.tool_calls.length);
              const functionCalls = msg.tool_calls.filter((tc: any) => tc.type === "function");
              assistantEntry.tool_calls = functionCalls.length > 0 ? functionCalls : undefined;
            }
    
            this.history.push(assistantEntry);
    
            if (!assistantEntry.tool_calls) {
              const duration = logger.endTimer("execucao." + this.name);
              this.log.info("Resposta final retornada. Duracao: " + (duration ?? "?") + "ms");
              return msg.content ?? "";
            }
    
            for (const toolCall of assistantEntry.tool_calls) {
    
              const toolName = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments || "{}");
              (() => {
                    const argsDesc = args && typeof args === 'object'
                      ? Object.entries(args as Record<string,unknown>)
                          .filter(([,v]) => v !== undefined && v !== null)
                          .map(([k, v]) => typeof v === 'string' ? v.slice(0, 40) : '')
                          .filter(Boolean)
                          .join(', ')
                      : '';
                    const msg = argsDesc
                      ? '\u{1F527} ' + toolName + ': "' + argsDesc + '"'
                      : '\u{1F527} ' + toolName + '...';
                    onProgress?.(msg);
                  })()
              
    
              this.log.info("Executando tool: " + toolName);
              this.log.debug("Args: " + JSON.stringify(args));
    
              logger.startTimer("tool." + toolName, this.name + ":tool");
              const fn = this.functions[toolName];
    
              let toolResult = "";
    
              try {
                if (fn) {
                  const result = await fn(args);
                  toolResult = JSON.stringify(result, null, 2);
                  const duration = logger.endTimer("tool." + toolName);
                  const preview = toolResult.length > 200
                    ? toolResult.substring(0, 200) + "..."
                    : toolResult;
                  this.log.info("Tool " + toolName + " concluida (" + (duration ?? "?") + "ms)");
                  this.log.debug("Resultado: " + preview);
                } else {
                  toolResult = "Erro: Funcao nao encontrada.";
                  logger.endTimer("tool." + toolName);
                  this.log.error("Tool nao encontrada: " + toolName);
                }
              } catch (e: any) {
                toolResult = "Erro na execucao: " + e.message;
                logger.endTimer("tool." + toolName);
                this.log.error("Erro na execucao da tool " + toolName + ": " + e.message);
              }
    
              this.history.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: toolName,
                content: toolResult,
              });
    
              this.log.debug("Resultado adicionado ao historico");
            }
          }
        } catch (e: any) {
          logger.endTimer("execucao." + this.name);
          this.log.error("Erro no processamento: " + e.message);
          this.log.debug("Stack: " + (e.stack || ""));
    
          return "[Erro no processamento: " + e.message + "]";
        }
      }
    }
    