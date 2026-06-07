import OpenAI from "openai";


import { createLLMClient, getDefaultProvider } from "../llm/provider";


import type { LLMProviderType } from "../types";


    import { logger } from "../utils/logger";

import { getTelemetry } from "../telemetry/telemetry";


    


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


    


        this.model = options.model ?? "deepseek-chat";


        this.generalInstructions =


          options.generalInstructions ?? "- Responda em PT-BR.\n";


    


        this.tools = options.tools ?? [];


        this.functions = options.functions ?? {};


    


        this.client = new OpenAI({


          apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,


          baseURL: options.baseURL ?? "https://api.deepseek.com",


        });


    


        logger.info(`[Agent] Agent '${this.name}' inicializado`, { model: this.model, tools: this.tools.length });


      }


    


      resetHistory(): void {


        this.history = [];


        logger.info(`[Agent] Historico de ${this.name} resetado.`);


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


    


        // === MEMORY CAPABILITIES (NOVO) ===


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


    


        // Notas diarias recentes - usa modulo seguro


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


          // Notas nao disponiveis - nao critico


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


            


            if (!shouldRetry || attempt === maxRetries) {


              throw lastError;


            }


            


            // Exponential backoff com �10% jitter


            const delay = baseDelay * Math.pow(2, attempt);


            const jitter = delay * 0.1 * (Math.random() * 2 - 1);


            const waitMs = Math.floor(delay + jitter);


            


            logger.warn(`[Agent] Retry ${attempt + 1}/${maxRetries} em ${waitMs}ms`, { error: error.message });


            await new Promise(resolve => setTimeout(resolve, waitMs));


          }


        }


        


        throw lastError;


      }


    


  async run(userMessage: string, onProgress?: (msg: string) => Promise<void>): Promise<string> {


        logger.info(`[Agent] [${this.name}] User input recebido`);
            const _agentStartTime = Date.now();
            let _turnIndex = 0;
            getTelemetry().onAgentStart(this.name);


    


        await this.ensureSystemMessage();


    


        this.history.push({


          role: "user",


          content: userMessage,


        });


    


        try {


          while (true) {


            logger.info(`[Agent] Enviando requisicao para o modelo (historico: ${this.history.length} msgs)`);


    


            const response = await this.retryWithBackoff(


              () => this.client.chat.completions.create({


                model: this.model,


                messages: this.history as any,


                tools: this.tools.length ? this.tools : undefined,


                tool_choice: this.tools.length ? "auto" : undefined,


              } as any),


              3 // maxRetries


            );


    


            const msg = (response as any).choices[0].message;
                const _usage = (response as any).usage;
                getTelemetry().trackLLMCall({
                  agentName: this.name,
                  model: this.model,
                  startTime: _agentStartTime,
                  duration: Date.now() - _agentStartTime,
                  promptTokens: _usage?.prompt_tokens ?? 0,
                  completionTokens: _usage?.completion_tokens ?? 0,
                  totalTokens: _usage?.total_tokens ?? 0,
                  historyLength: this.history.length,
                  hadToolCalls: !!(msg as any).tool_calls,
                  toolCallCount: (msg as any).tool_calls?.length ?? 0,
                  turnIndex: _turnIndex++,
                });


    


            logger.info("[Agent] Resposta do modelo recebida");


    


            if (msg.content) {


              logger.debug("[Agent] Conteudo da resposta processado");


            }


            if ((msg as any).reasoning_content) {


              logger.debug("[Agent] Conteudo do raciocinio recebido (sera preservado).");


            }


    


            const assistantEntry: Message = {


              role: "assistant",


              content: msg.content,


            };


    


            if ((msg as any).reasoning_content) {


                  assistantEntry.reasoning_content = (msg as any).reasoning_content;


                  


                  // Forward reasoning as dynamic progress messages (like DeepSeek thinking)


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


              logger.info(`[Agent] Tool calls detectadas: ${msg.tool_calls.length}`);


              assistantEntry.tool_calls = msg.tool_calls;


            }


    


            this.history.push(assistantEntry);


    


            if (!msg.tool_calls) {


              logger.info("[Agent] Resposta final retornada ao usuario");
                  getTelemetry().trackAgentCall({
                    agentName: this.name,
                    instruction: userMessage.slice(0, 200),
                    startTime: _agentStartTime,
                    duration: Date.now() - _agentStartTime,
                    success: true,
                    responseLength: (msg.content ?? "").length,
                  });


              return msg.content ?? "";


            }


    


            for (const toolCall of msg.tool_calls) {


              if (toolCall.type !== "function") continue;


    


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


              


    


              logger.info(`[Agent] Executando tool: ${toolName}`, { args });


    


              const fn = this.functions[toolName];


    


              let toolResult = "";


    


              try {


                if (fn) {


                  const result = await fn(args);


                  toolResult = JSON.stringify(result, null, 2);


                  logger.debug("[Agent] Resultado da tool processado");


                } else {


                  toolResult = "Erro: Funcao nao encontrada.";


                  logger.warn("[Agent] Tool nao encontrada");


                }


              } catch (e: any) {


                toolResult = `Erro na execucao: ${e.message}`;


                logger.error("[Agent] Erro na execucao da tool", { error: e.message });


              }


    


              this.history.push({


                role: "tool",


                tool_call_id: toolCall.id,


                name: toolName,


                content: toolResult,


              });


    


              logger.debug("[Agent] Resultado adicionado ao historico");
                  getTelemetry().trackToolCall({
                    toolName: toolName,
                    agentName: this.name,
                    timestamp: Date.now(),
                    hasError: toolResult.startsWith("Erro"),
                    errorMessage: toolResult.startsWith("Erro") ? toolResult : undefined,
                    duration: Date.now() - _agentStartTime,
                  });


            }


          }


        } catch (e: any) {


          logger.error("[Agent] Erro no Agent:", { error: e });


    


          return `[Erro no processamento: ${e.message}]`;


        }


      }


    }


    