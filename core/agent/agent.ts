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

  /**
   * Sanitiza uma string para evitar escapes hex malformados no JSON.
   * Corrige barras invertidas seguidas de 'u' ou 'x' com digitos hex incompletos.
   */
  private sanitizeContent(content: string): string {
    // Protege contra \\u incompleto (ex: "voc\\u" sem 4 digitos hex)
    // e contra \\x incompleto (ex: "\\x" sem 2 digitos hex)
    let sanitized = content.replace(
      /\\([ux])([0-9a-fA-F]{0,3})($|[^0-9a-fA-F])/g,
      (match, escapeChar, hexDigits, nextChar) => {
        const expectedLen = escapeChar === 'u' ? 4 : 2;
        if (hexDigits.length < expectedLen) {
          // Escape incompleto - escapa a barra invertida
          return '\\\\' + match;
        }
        return match;
      }
    );

    // CORRECAO: Remove caracteres de controle que quebram JSON
    // (exceto \t, \n, \r que sao validos em strings)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // CORRECAO: Corrige aspas simples dentro de strings que podem quebrar JSON
    // Se encontrar uma aspa simples dentro de um contexto onde deveria ser dupla
    sanitized = sanitized.replace(/'([^']*?)'/g, (match) => {
      // So substitui se a string contem caracteres que indicam que deveria ser JSON
      if (match.includes('\\"') || match.includes('\\\\')) {
        return match;
      }
      return match;
    });

    return sanitized;
  }

  /**
   * CORRECAO: Sanitiza tool results para garantir que nao quebrem o JSON da API.
   * Diferente do sanitizeContent, este metodo lida com grandes blocos de JSON
   * que podem conter caracteres problematicos apos serializacao aninhada.
   */
    /**
       * CORRECAO: Sanitiza todo o historico de mensagens antes de enviar para a API.
       * Percorre cada mensagem no historico e aplica sanitizacao em todos os campos
       * de conteudo para garantir que nao haja caracteres ou escapes que possam
       * quebrar o JSON da requisicao.
       */
      private sanitizeHistory(): void {
        for (const msg of this.history) {
          if (typeof msg.content === 'string') {
            msg.content = this.sanitizeContent(msg.content);
          }
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              if (tc.function && typeof tc.function.arguments === 'string') {
                tc.function.arguments = tc.function.arguments.replace(
                  /\\([ux])([0-9a-fA-F]{0,3})($|[^0-9a-fA-F])/g,
                  (match: string, escapeChar: string, hexDigits: string, nextChar: string) => {
                    const expectedLen = escapeChar === 'u' ? 4 : 2;
                    if (hexDigits.length < expectedLen) {
                      return '\\\\' + match;
                    }
                    return match;
                  }
                );
              }
            }
          }
        }
      }
    
        private sanitizeToolResult(toolResult: string): string {
        // Limitar tamanho para evitar payloads gigantes (100KB max)
        const MAX_TOOL_RESULT_LENGTH = 100 * 1024;
        if (toolResult.length > MAX_TOOL_RESULT_LENGTH) {
          toolResult = toolResult.substring(0, MAX_TOOL_RESULT_LENGTH) +
            `\n\n[... TRUNCADO: resultado muito grande (${toolResult.length} bytes)]`;
        }
    
        // CORRECAO: Remover caracteres de controle que quebram JSON
        toolResult = toolResult.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
        // CORRECAO: Escapar sequencias de escape incompletas que quebram JSON
        // Ex: "\u" sem 4 hex digits, "\x" sem 2 hex digits
        toolResult = toolResult.replace(
          /\\([ux])([0-9a-fA-F]{0,3})($|[^0-9a-fA-F])/g,
          (match, escapeChar, hexDigits, nextChar) => {
            const expectedLen = escapeChar === 'u' ? 4 : 2;
            if (hexDigits.length < expectedLen) {
              // Escape incompleto - escapa a barra invertida adicionando outra
              return '\\\\' + match.substring(1);
            }
            return match;
          }
        );
    
        // CORRECAO: Escapar barras invertidas solitarias no final de strings truncadas
        // Quando uma string e cortada exatamente apos uma barra invertida,
        // isso forma um escape invalido no JSON
        toolResult = toolResult.replace(/\\$/gm, '\\\\ ');
    
        return toolResult;
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

    // Memory capabilities
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
   * Retry wrapper com exponential backoff + jitter aprimorado.
   *
   * - Para rate limit (429): delay inicial 4s, fator 4x (4s, 16s, 64s, 256s...)
   * - Para erros de rede/5xx: delay inicial baseDelay (2s), fator 2x
   * - Jitter de ±10% para evitar thundering herd
   * - Max 6 tentativas para rate limit, 5 para outros erros
   *
   * CORRECAO: Agora tambem retenta em erro 400 se a mensagem de erro
   * indicar problema de parse JSON (escape malformado), com backoff
   * para dar tempo do buffer de contexto ser limpo.
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5,
    baseDelay: number = 2000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Extrair status HTTP
        const status = error?.status || error?.response?.status;
        const isRateLimit = status === 429;

        // CORRECAO: Detectar erro 400 com problema de JSON malformado
        const isJsonParseError =
          error?.message?.includes('JSON') &&
          (error?.message?.includes('unterminated') ||
           error?.message?.includes('unexpected') ||
           error?.message?.includes('parse') ||
           error?.message?.includes('hex escape'));

        // CORRECAO: Retentar erro 400 quando for problema de JSON (escape malformado)
        const isRetryable400 = status === 400 && isJsonParseError;

        const shouldRetry =
          isRateLimit ||
          isRetryable400 ||
          (status && status >= 500) ||
          error?.code === 'ECONNRESET' ||
          error?.code === 'ETIMEDOUT' ||
          error?.code === 'ENOTFOUND' ||
          error?.message?.includes('timeout') ||
          error?.message?.includes('rate');

        // Erro 400 nao retentavel (sem ser JSON parse)
        if (status === 400 && !isRetryable400) {
          logger.error(`[Agent] Erro 400 (Bad Request) NAO RETENTAVEL: ${error.message}`);
          throw lastError;
        }

        if (!shouldRetry || attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff aprimorado
        let delay: number;
        if (isRateLimit) {
          // 429: backoff agressivo - 4s, 16s, 64s, 256s...
          delay = 4000 * Math.pow(4, attempt);
        } else if (isRetryable400) {
          // JSON parse error: backoff rapido - 1s, 2s, 4s, 8s...
          delay = 1000 * Math.pow(2, attempt);
        } else {
          // Outros erros: backoff padrao - 2s, 4s, 8s, 16s...
          delay = baseDelay * Math.pow(2, attempt);
        }

        // Jitter de ±10% para evitar thundering herd
        const jitter = delay * 0.1 * (Math.random() * 2 - 1);
        const waitMs = Math.floor(delay + jitter);

        logger.warn(`[Agent] Retry ${attempt + 1}/${maxRetries} em ${waitMs}ms`, {
          error: error.message,
          status,
          isRateLimit,
          isRetryable400,
          attempt
        });

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

    // ================================================================
    // FIX: Resetar historico entre chamadas para evitar acumulo infinito
    // ================================================================
    // O historico acumulado entre chamadas run() causa:
    // 1. Contexto gigante (centenas de mensagens)
    // 2. Conteudo obsoleto de sessoes anteriores
    // 3. Erro 400 da API com "unexpected end of hex escape" em mensagens antigas
    // ================================================================
    this.history = [];

    await this.ensureSystemMessage();

    this.history.push({
      role: "user",
      content: this.sanitizeContent(userMessage),
    });

    try {
      while (true) {
        logger.info(`[Agent] Enviando requisicao para o modelo (historico: ${this.history.length} msgs)`);
    
            // CORRECAO: Sanitizar TODO o historico antes de enviar para a API
            // Isso evita que tool results com escapes malformados quebrem o JSON
            this.sanitizeHistory();

        const response = await this.retryWithBackoff(
          () => this.client.chat.completions.create({
            model: this.model,
            messages: this.history as any,
            tools: this.tools.length ? this.tools : undefined,
            tool_choice: this.tools.length ? "auto" : undefined,
          } as any),
          5,  // maxRetries
          2000  // baseDelay
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

          // ============================================================
          // CORRECAO: JSON.parse seguro com try-catch para tool call args
          // ============================================================
          let args: any = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch (e: any) {
            logger.error(`[Agent] Erro ao fazer parse dos argumentos da tool '${toolName}': ${e.message}`);
            logger.error(`[Agent] Argumentos brutos (primeiros 500 chars): ${(toolCall.function.arguments || "").slice(0, 500)}`);

            // CORRECAO: Tentar reparar o JSON malformado
            const repaired = this.tryRepairJson(toolCall.function.arguments || "");
            if (repaired !== null) {
              try {
                args = JSON.parse(repaired);
                logger.info(`[Agent] JSON reparado com sucesso para tool '${toolName}'`);
              } catch {
                args = {};
              }
            } else {
              args = {};
            }
          }

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
          })();

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

          // ============================================================
          // CORRECAO: Sanitizar tool result antes de adicionar ao historico
          // ============================================================
          const sanitizedResult = this.sanitizeToolResult(toolResult);

          this.history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: sanitizedResult,
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

      // Se for erro 400 (Bad Request), logar detalhes do historico para debug
      if (e?.status === 400 || e?.response?.status === 400) {
        logger.error("[Agent] ERRO 400 - Conteudo do historico pode conter escapes invalidos", {
          historySize: this.history.length,
          lastMessageRole: this.history[this.history.length - 1]?.role,
          lastMessagePreview: (this.history[this.history.length - 1]?.content || "").slice(0, 200),
          errorMessage: e.message,
        });
      }

      return `[Erro no processamento: ${e.message}]`;
    }
  }

  /**
   * CORRECAO: Tenta reparar um JSON malformado.
   * Corrige problemas comuns como:
   * - Strings nao terminadas
   * - Caracteres de controle nao escapados
   * - Aspas simples no lugar de duplas
   * - Trailing commas
   */
  private tryRepairJson(input: string): string | null {
        if (!input || input.trim() === '') return null;
    
        let repaired = input;
    
        // 1. Remover caracteres de controle
        repaired = repaired.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
        // 2. Tentar parse direto primeiro (se ja for valido)
        try {
          JSON.parse(repaired);
          return repaired;
        } catch {}
    
        // 3. CORRECAO: Escapar sequencias de escape incompletas (\u, \x)
        // Isso evita que "\\u" ou "\\x" sem hex digits suficientes quebrem o JSON
        repaired = repaired.replace(
          /\\([ux])([0-9a-fA-F]{0,3})($|[^0-9a-fA-F])/g,
          (match, escapeChar, hexDigits, nextChar) => {
            const expectedLen = escapeChar === 'u' ? 4 : 2;
            if (hexDigits.length < expectedLen) {
              return '\\\\' + match;
            }
            return match;
          }
        );
    
        try {
          JSON.parse(repaired);
          return repaired;
        } catch {}
    
        // 4. Tentar fechar strings nao terminadas (no final do texto)
        repaired = repaired.replace(
          /(["'])(?:(?!\1|\\)\.|\\.)*$/,
          (match) => {
            if (!match.endsWith('"') && !match.endsWith("'")) {
              return match + '"';
            }
            return match;
          }
        );
    
        try {
          JSON.parse(repaired);
          return repaired;
        } catch {}
    
        // 5. CORRECAO: Tentar fechar strings nao terminadas no MEIO do JSON
        // Conta aspas e ve se alguma string ficou aberta
        let quoteBalanced = repaired;
        let inString = false;
        let stringChar = '';
        let result = '';
        for (let i = 0; i < quoteBalanced.length; i++) {
          const ch = quoteBalanced[i];
          const prev = i > 0 ? quoteBalanced[i-1] : '';
          if (!inString) {
            if ((ch === '"' || ch === "'") && prev !== '\\') {
              inString = true;
              stringChar = ch;
            }
            result += ch;
          } else {
            if (ch === '\\') {
              result += ch;
              i++; // skip next char
              if (i < quoteBalanced.length) {
                result += quoteBalanced[i];
              }
            } else if (ch === stringChar) {
              inString = false;
              result += ch;
            } else {
              result += ch;
            }
          }
        }
        // Se ainda estamos dentro de uma string no final, fechar a string
        if (inString) {
          result += stringChar;
          quoteBalanced = result;
        }
    
        try {
          JSON.parse(quoteBalanced);
          return quoteBalanced;
        } catch {}
    
        // 6. Remover trailing commas
        repaired = repaired.replace(/,\s*([}\]])/g, '$1');
    
        try {
          JSON.parse(repaired);
          return repaired;
        } catch {}
    
        // 7. Ultimo recurso: extrair objeto JSON valido do meio do texto
        const jsonMatch = repaired.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            JSON.parse(jsonMatch[0]);
            return jsonMatch[0];
          } catch {}
        }
    
        return null;
      }
}