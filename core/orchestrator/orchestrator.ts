import { Agent } from "../agent/agent";
    import { logger } from "../utils/logger";
    import { browserAgent } from "../agents/browser.agent";
import { reflectorAgent } from "../agents/reflector.agent";
    import {
      appendToTranscript,
      loadSessionTranscript,
      generateSessionId,
      getRecentMessages,
      type TranscriptMessage,
    } from "../session/transcript";
    import {
      memorySearchTool,
      readMemoryFile,
      appendToMemory,
      saveDailyNote,
      loadRecentNotes,
    } from "../memory/memory_search";
    import { getMemoryEngine } from "../memory/memory-engine";
    import {
      EventStream,
      createEvent,
      type StreamEvent,
    } from "../stream/event-stream";
    import { ContextEngine, getDefaultEngine } from "../context/context-engine";
    import { getSkillsManager } from "../skills/skills-manager";
import { getTelemetry } from "../telemetry/telemetry";
    
    // Rate limiting - protecao contra uso excessivo (persistente)
    const MAX_MESSAGES_PER_SESSION = parseInt(process.env.MAX_MESSAGES_PER_SESSION || "100", 10);
    const messageCounts: Map<string, number> = new Map();
    
    function checkRateLimit(sessionId: string): boolean {
      const count = messageCounts.get(sessionId) || 0;
      if (count >= MAX_MESSAGES_PER_SESSION) {
        return false;
      }
      messageCounts.set(sessionId, count + 1);
      
      // Persistir no transcript
      try {
        appendToTranscript(sessionId, {
          role: "system" as const,
          content: `rate_limit:${count + 1}`,
          timestamp: Date.now(),
        });
      } catch {
        // Persistencia nao-critica
      }
      return true;
    }
    
    function restoreRateLimit(sessionId: string): void {
      try {
        const messages = loadSessionTranscript(sessionId);
        let maxCount = 0;
        for (const msg of messages) {
          if (msg.content && msg.content.startsWith("rate_limit:")) {
            const count = parseInt(msg.content.split(":")[1], 10);
            if (count > maxCount) maxCount = count;
          }
        }
        if (maxCount > 0) {
          messageCounts.set(sessionId, maxCount);
        }
      } catch {
        // Fallback: comeca do zero
      }
    }
    
    type SubAgent = {
      name: string;
      description: string;
      agent: Agent;
    };
    
    export type Message = {
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      name?: string;
    };
    
    type RunInput = {
      input: string;
      history?: Message[];
      sessionId?: string;
      /** Callback para feedback de progresso ao usuario */
      onProgress?: (message: string) => Promise<void>;
    };
    interface ReflectionResult {
      success: "yes" | "partial" | "no";
      complete: boolean;
      missingInfo: string[];
      retryDifferent: boolean;
      learning: string;
    }
    
    export class AgentOrchestrator {
      private sessionId: string;
      public eventStream: EventStream;
      private contextEngine: ContextEngine;
      private memoryEngine = getMemoryEngine();
      private reflectionCount: number = 0;
    
      constructor(
        private planner: Agent,
        private agents: SubAgent[],
        private debug = true
      ) {
        this.sessionId = generateSessionId("orchestrator");
        this.eventStream = new EventStream();
        this.contextEngine = getDefaultEngine();
        
        // Carregar transcript da sessao anterior se existir
        try {
          const existingMessages = loadSessionTranscript(this.sessionId);
          if (existingMessages.length > 0) {
            this.contextEngine.loadFromTranscript(
              existingMessages.map((m) => ({
                role: m.role as "system" | "user" | "assistant" | "tool",
                content: m.content,
                name: m.name,
                tool_call_id: m.tool_call_id,
              }))
            );
            // Restaurar rate limit
            restoreRateLimit(this.sessionId);
          }
        } catch {
          // Transcript nao disponivel - sessao nova
        }
      }
    
      private formatHistory(history: Message[] = []) {
        if (!history.length) return "No conversation history.";
        return history
          .map((m) => {
            if (m.role === "tool") {
              return `tool(${m.name}): ${m.content}`;
            }
            return `${m.role}: ${m.content}`;
          })
          .join("\n");
      }
    
      /**
       * Reflection step: avalia o resultado da execucao do agente.
       * Usa ReflectorAgent (agente separado) para avaliar resultados.
       */
      private async reflectOnResult(
        input: string,
        agentName: string,
        instruction: string,
        result: string
      ): Promise<ReflectionResult> {
        this.reflectionCount++;
    
        const reflectionPrompt = `
    Evaluate the agent execution result honestly.
    
    Task: ${input.slice(0, 300)}
    Agent used: ${agentName}
    Instruction given: ${instruction.slice(0, 300)}
    Result produced: ${result.slice(0, 500)}
    
    Answer these questions:
    1. Did the agent succeed? (yes / partial / no)
    2. Is the result complete for the user's request? (yes / no)
    3. Is there missing information? If so, what?
    4. Should we try a different approach? (yes / no)
    5. What did we learn from this execution? (one sentence in portuguese)
    
    Respond ONLY with JSON:
    {
      "success": "yes | partial | no",
      "complete": true/false,
      "missingInfo": ["item1", "item2"],
      "retryDifferent": true/false,
      "learning": "one sentence in portuguese"
    }
    `;
    
        try {
          const reflectionRaw = await reflectorAgent.run(reflectionPrompt);
          const parsed = JSON.parse(reflectionRaw);
          return {
            success: parsed.success || "partial",
            complete: parsed.complete ?? true,
            missingInfo: parsed.missingInfo || [],
            retryDifferent: parsed.retryDifferent ?? false,
            learning: parsed.learning || "",
          };
        } catch {
          // Fallback: assume success if we can't reflect
          return {
            success: "partial",
            complete: true,
            missingInfo: [],
            retryDifferent: false,
            learning: "",
          };
        }
      }
    
    
      /**
       * Consome o EventStream para telemetria e logging.
       * Loga tool calls, erros, e steps completados.
       */
      private consumeEventStream(onProgress?: (msg: string) => Promise<void>): void {
        const startTime = Date.now();
        let currentTool = "";
        
        (async () => {
          for await (const event of this.eventStream) {
            switch (event.type) {
              case "tool_call_start":
                currentTool = event.toolName || "";
                // Progresso de tool delegado ao agent.ts (reasoning_content + tool args)
                if (this.debug) {
                  console.log(`  [EVENT] Tool call start: ${currentTool}`);
                }
                break;
                
              case "tool_call_end":
                if (this.debug) {
                  console.log(`  [EVENT] Tool call end: ${event.toolName || currentTool}`);
                }
                break;
                
              case "turn_end":
                if (this.debug) {
                  console.log(`  [EVENT] Turn completed`);
                }
                break;
                
              case "agent_end":
                const duration = Date.now() - startTime;
                if (this.debug) {
                  console.log(`  [EVENT] Agent finished. Duration: ${duration}ms`);
                }
                break;
              case "progress":
                onProgress?.(event.content || "");
                break;

              default:
                break;
            }
          }
        })().catch(() => {});
      }
    
  async run(runInput: RunInput) {
    
        const { input, history = [], sessionId, onProgress } = runInput;
        // Iniciar sessao de telemetria
        const _tel = getTelemetry();
        const _orchestratorStartTime = Date.now();
        _tel.startSession(this.sessionId, input);
        if (sessionId) this.sessionId = sessionId;
    
        this.eventStream.push(createEvent("agent_start"));
    
            // Feedback inicial para o usuario
            if (onProgress) {
              onProgress("\u{1F4A1} Entendendo: \"" + input.slice(0, 70) + (input.length > 70 ? "\u2026" : "") + "\"").catch(() => {});
            }
    
        // === EventStream consumer (telemetria) ===
        this.consumeEventStream(onProgress);
        this.reflectionCount = 0;
    
        if (this.debug) {
          console.log("\n==============================");
          console.log("ORCHESTRATOR START");
          console.log("User input:", input);
          console.log("Session ID:", this.sessionId);
        }
    
        // Check rate limit
        if (!checkRateLimit(this.sessionId)) {
          const errorMsg = "Limite de mensagens excedido para esta sessao.";
          this.eventStream.push(createEvent("agent_end", { content: errorMsg }));
          this.eventStream.end(errorMsg as any);
          return errorMsg;
        }
    
        // Load persisted transcript
        const persistedMessages = loadSessionTranscript(this.sessionId);
        if (persistedMessages.length > 0 && this.debug) {
          console.log(`Loaded ${persistedMessages.length} messages from transcript`);
        }
    
        // Save user message to transcript
        appendToTranscript(this.sessionId, {
          role: "user",
          content: input,
          timestamp: Date.now(),
        });

        // Alimentar ContextEngine com input do usuario
        this.contextEngine.addMessage({
          role: "user",
          content: input,
        });
    
        const formattedHistory = this.formatHistory(history);
    
        // Buscar memoria relevante ao contexto atual (NOVO)
        const memoryContext = this.memoryEngine.recall(input, formattedHistory);
        if (this.debug && memoryContext.length > 50) {
          console.log("Memory context loaded:", memoryContext.slice(0, 100) + "...");
        }

        await onProgress?.("\u{1F4DA} Recuperando memorias relevantes...");
    
        let context = `
    User request:
    ${input}
    
    Conversation history:
    ${formattedHistory}
    
    Recent memory context:
    ${memoryContext.slice(0, 1500)}
    `;
    
        let steps = 0;
        let lastResult = "";
        let lastInstruction = "";
        let lastAgentName = "";
    
        const maxSteps = 10;
        const maxReflections = 3; // Limite de reflexoes para evitar loops infinitos
    
        while (steps < maxSteps) {
          this.eventStream.push(createEvent("turn_start", { content: `Step ${steps + 1}/${maxSteps}` }));
    
          if (this.debug) {
            console.log(`\nStep ${steps + 1}/${maxSteps}`);
          }
    
          const agentList = this.agents
            .map((a) => `${a.name}: ${a.description}`)
            .join("\n");
    
          const plannerPrompt = `
    User request:
    ${input}
    
    Conversation history:
    ${formattedHistory}
    
    Current context:
    ${context}
    
    Available agents:
    ${agentList}
    
    Rules:
    
    1. ALWAYS select an agent for the first step.
    2. Never return "finish" before an agent has produced a result.
    3. Do NOT repeat the same instruction twice.
    4. Use assistant for conversation and general questions.
    5. Use python_code for calculations or code.
    6. Use writer to produce the final response shown to the user.
    
    You also have access to:
    - memory_search: search long-term memory for facts, preferences, decisions
    - Use memory_search when you need to remember something from past conversations
    
    Respond ONLY with JSON:
    
    {
      "agent": "agent_name | finish",
      "instruction": "what the agent should do"
    }
    `;
    
          this.eventStream.push(createEvent("text_start", { content: "Consultando planner..." }));
              if (onProgress) {
                onProgress("\u{1F5FA}\uFE0F Decidindo a melhor abordagem...").catch(() => {});
              }
          const decision = await this.planner.run(plannerPrompt);
          this.eventStream.push(createEvent("text_delta", { content: "Planner respondeu." }));
    
          if (this.debug) {
            console.log("Planner raw decision:");
            console.log(decision);
          }
    
          let parsed: any;
    
          try {
            parsed = JSON.parse(decision);
                    _tel.trackPlannerDecision({
                      instruction: parsed.instruction?.slice(0, 200) || "",
                      chosenAgent: parsed.agent || "unknown",
                      step: steps + 1,
                      timestamp: Date.now(),
                    });
          } catch {
            console.warn("Planner returned invalid JSON");
            this.eventStream.push(createEvent("turn_end", { content: lastResult || "Erro ao interpretar resposta do planner." }));
            this.eventStream.push(createEvent("agent_end"));
            this.eventStream.end();
            return lastResult || "Erro ao interpretar resposta do planner.";
          }
    
          if (this.debug) {
            console.log("Parsed decision:", parsed);
          }
    
          // Prevent finish before any agent ran
          if (parsed.agent === "finish" && !lastResult) {
            if (this.debug) {
              console.warn("Planner tried to finish before any agent ran.");
            }
            parsed.agent = this.agents[0].name;
            parsed.instruction = input;
          }
    
          // Check for memory_search requests embedded in instruction
          if (parsed.instruction && parsed.instruction.toLowerCase().includes("memory_search")) {
            const memoryResults = this.memoryEngine.recall(input, context);
            context += `\n\nMemory search results:\n${memoryResults}`;
          }
    
          // Stop condition
              if (parsed.agent === "finish") {
                if (onProgress) {
                  onProgress("\u{1F4DD} Preparando a resposta final...").catch(() => {});
                }
            if (this.debug) {
              console.log("\nORCHESTRATION FINISHED");
            }
    
            // Save assistant response to transcript
            _tel.endSession();
        _tel.saveToFile();
        appendToTranscript(this.sessionId, {
              role: "assistant",
              content: lastResult || parsed.instruction || "Concluido.",
              timestamp: Date.now(),
            });

            // Registrar resposta final no ContextEngine
            this.contextEngine.addMessage({
              role: "assistant",
              content: lastResult || parsed.instruction || "Concluido.",
            });
    
            // Salvar nota diaria automaticamente ao finalizar
            try {
              const noteContent = "Conversa: " + (input || "").substring(0, 200) + "\n" +
                "Resultado: " + ((lastResult || parsed.instruction || "Concluido.")).substring(0, 300);
              saveDailyNote(noteContent);
            } catch (e) {
              // Nota diaria nao e critica
            }
    
            // Consolidar aprendizado (NOVO)
            try {
              const allMessages = [
                { role: "user" as const, content: input },
                { role: "assistant" as const, content: lastResult || parsed.instruction || "" },
              ];
              this.memoryEngine.consolidate(allMessages);
            } catch (e) {
              // Consolidacao nao e critica
            }
    
            this.eventStream.push(createEvent("turn_end", { content: lastResult }));
            this.eventStream.push(createEvent("agent_end"));
            this.eventStream.end(lastResult as any);
            return lastResult || parsed.instruction || "Concluido.";
          }
    
          // Protection against instruction loop
          if (parsed.instruction === lastInstruction) {
            if (this.debug) {
              console.warn("Repeated instruction detected. Stopping loop.");
            }
            this.eventStream.push(createEvent("agent_end"));
            this.eventStream.end((lastResult || context) as any);
            return lastResult || context;
          }
    
          lastInstruction = parsed.instruction;
          lastAgentName = parsed.agent;
    
          const target = this.agents.find((a) => a.name === parsed.agent);
    
          if (!target) {
            console.warn(`Agent not found: ${parsed.agent}`);
            this.eventStream.push(createEvent("agent_end"));
            this.eventStream.end();
            _tel.endSession();
          _tel.saveToFile();
          return lastResult || `Erro: agente '${parsed.agent}' nao encontrado.`;
          }
    
          if (this.debug) {
            console.log(`Executing agent: ${parsed.agent}`);
            console.log("Instruction:", parsed.instruction);
          }
    
          this.eventStream.push(
                createEvent("tool_call_start", {
                  toolName: parsed.agent,
                  content: parsed.instruction,
                })
              );
    
              if (onProgress) {
                (() => {
                    const instructionPreview = parsed.instruction
                      ? parsed.instruction.slice(0, 80)
                      : '';
                    const dispatchMsg = instructionPreview
                      ? '\u{1F9E0} ' + parsed.agent + ' \u2192 "' + instructionPreview + (parsed.instruction && parsed.instruction.length > 80 ? '\u2026' : '') + '"'
                      : '\u{1F9E0} Acionando ' + parsed.agent + '...';
                    onProgress(dispatchMsg).catch(() => {});
                  })();
              }
    
          // Usar ContextEngine para gerenciar o prompt do agente (NOVO)
          const contextMessages = context
            .split("\n")
            .filter(Boolean)
            .map((line) => ({
              role: "system" as const,
              content: line,
            }));
    
          this.contextEngine.setHistory(contextMessages);
    
          const agentPrompt = `
    User request:
    ${input}
    
    Conversation history:
    ${formattedHistory}
    
    Instruction:
    ${parsed.instruction}
    
    Context so far:
    ${(await this.contextEngine.buildContext()).summary || context.slice(0, 3000)}
    
    Recent memory:
    ${memoryContext.slice(0, 1000)}
    `;
    
          const result = await target.agent.run(agentPrompt, onProgress);
    
          this.eventStream.push(
            createEvent("tool_call_end", {
              toolName: parsed.agent,
              content: result,
            })
          );
    
          // === REFLECTION STEP (NOVO) ===
              if (onProgress && this.reflectionCount < maxReflections) {
                onProgress("\u{1F50E} Revisando se a resposta ficou boa...").catch(() => {});
              }
          if (this.reflectionCount < maxReflections) {
            const reflection = await this.reflectOnResult(
              input,
              parsed.agent,
              parsed.instruction,
              result
            );
    
            if (this.debug) {
              console.log(`\n[Reflection #${this.reflectionCount}]`);
              console.log(`  Success: ${reflection.success}`);
              console.log(`  Complete: ${reflection.complete}`);
              console.log(`  Learning: ${reflection.learning}`);
            }
    
            // Se aprendeu algo, adicionar ao contexto
            if (reflection.learning) {
              context += `\n\n[Learning from ${parsed.agent}]: ${reflection.learning}`;
            }
    
            // Se falhou e deve tentar abordagem diferente
            if (reflection.success === "no" && reflection.retryDifferent) {
              delete parsed.instruction; // Forca nova instrucao
              context += `\n\nPrevious attempt with ${parsed.agent} failed: ${result.slice(0, 300)}`;
              context += `\nMissing: ${reflection.missingInfo.join(", ")}`;
              if (this.debug) {
                console.log("Reflection suggests retry with different approach");
              }
            }
          }
    
          lastResult = result;
    
          if (this.debug) {
            console.log(`Result from ${parsed.agent}:`);
            console.log(result);
          }
    
          context += `\n\n${parsed.agent} result:\n${result}`;
          
          // Alimentar o ContextEngine com o resultado do agente
          this.contextEngine.addMessage({
            role: "assistant",
            content: `[${parsed.agent}]: ${result.slice(0, 2000)}`,
          });
          
          steps++;
        }
    
        if (this.debug) {
          console.warn("\nMax steps reached. Returning last result.");
        }
    
        appendToTranscript(this.sessionId, {
          role: "assistant",
          content: lastResult || "Nao foi possivel concluir a tarefa.",
          timestamp: Date.now(),
        });
    
        this.eventStream.push(createEvent("agent_end"));
        this.eventStream.end(lastResult as any);
        return lastResult || "Nao foi possivel concluir a tarefa.";
      }
    
      /** Get current session ID */
      getSessionId(): string {
        return this.sessionId;
      }
    
      /** Reset session with a new ID */
      resetSession(): void {
        this.sessionId = generateSessionId("orchestrator");
      }
    }
    