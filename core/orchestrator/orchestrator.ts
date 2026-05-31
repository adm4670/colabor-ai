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
    
        // ============================================================
        // NOVOS IMPORTS - Melhorias Agenticas
        // ============================================================
        import { getPlanManager, PlanManager } from "../plan/plan-manager";
        import { getSubAgentRunner, SubAgentRunner } from "../agent/sub-agent-runner";
        import { getDreamTask, DreamTask } from "../tasks/dream-task";
    import { getHookManager, HookManager } from "../hooks/hook-system";
    import { getPermissionSystem, PermissionSystem } from "../permissions/permission-system";
    
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
    
          // ============================================================
          // NOVOS CAMPOS - Melhorias Agenticas
          // ============================================================
          private planManager: PlanManager;
          private subAgentRunner: SubAgentRunner;
          private dreamTask: DreamTask;
      private hookManager: HookManager;
      private permissionSystem: PermissionSystem;
    
          constructor(
            private planner: Agent,
            private agents: SubAgent[],
            private debug = true
          ) {
            this.sessionId = generateSessionId("orchestrator");
            this.eventStream = new EventStream();
            this.contextEngine = getDefaultEngine();
    
            // Inicializar novos componentes
            this.planManager = getPlanManager();
            this.subAgentRunner = getSubAgentRunner();
            this.dreamTask = getDreamTask();
        this.hookManager = getHookManager();
        this.permissionSystem = getPermissionSystem();
        
        // Configure agent permission levels
        this.permissionSystem.setAgentLevel("assistant", "network");
        this.permissionSystem.setAgentLevel("python_code", "file_write");
        this.permissionSystem.setAgentLevel("browser", "network");
        this.permissionSystem.setAgentLevel("shell", "shell");
        this.permissionSystem.setAgentLevel("writer", "file_write");
        this.permissionSystem.setAgentLevel("task_manager", "file_write");
    
            // Tentar carregar plano existente da sessao anterior
            try {
              const existingPlan = this.planManager.load();
              if (existingPlan && this.debug) {
                console.log(`[Orchestrator] Plano carregado: ${existingPlan.steps.length} steps`);
              }
            } catch {
              // Plano nao disponivel - sessao nova
            }
    
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
    
            // Buscar memoria relevante ao contexto atual
            const memoryContext = this.memoryEngine.recall(input, formattedHistory);
            if (this.debug && memoryContext.length > 50) {
              console.log("Memory context loaded:", memoryContext.slice(0, 100) + "...");
            }
    
            await onProgress?.("\u{1F4DA} Recuperando memorias relevantes...");
    
            // ============================================================
            // PLAN-BASED CONTEXT (NOVO)
            // ============================================================
            let planContext = "";
            if (this.planManager.hasPlan()) {
              planContext = this.planManager.getPlanForPrompt();
              if (this.debug) {
                console.log("Plan loaded for context");
              }
            }
    
            let context = `
        User request:
        ${input}
    
        Conversation history:
        ${formattedHistory}
    
        ${planContext}
    
        Recent memory context:
        ${memoryContext.slice(0, 1500)}
        `;
    
            let steps = 0;
            let lastResult = "";
            let lastInstruction = "";
            let lastAgentName = "";
    
            const maxSteps = 15; // Aumentado para suportar planos maiores
            const maxReflections = 3;
    
            while (steps < maxSteps) {
              this.eventStream.push(createEvent("turn_start", { content: `Step ${steps + 1}/${maxSteps}` }));
    
              if (this.debug) {
                console.log(`\nStep ${steps + 1}/${maxSteps}`);
              }
    
              const agentList = this.agents
                .map((a) => `${a.name}: ${a.description}`)
                .join("\n");
    
              // ============================================================
              // PLAN-AWARE PLANNER PROMPT (MODIFICADO)
              // ============================================================
              const planGuide = this.planManager.hasPlan()
                ? `
        ACTIVE PLAN:
        ${this.planManager.getPlanForPrompt()}
    
        Follow the plan above. Execute the next pending step, or update step status.
        `
                : `
        If this task is complex (multiple steps), consider creating a plan first
        by setting agent: "plan" with instruction describing the overall goal.
        `;
    
              const plannerPrompt = `
        User request:
        ${input}
    
        Conversation history:
        ${formattedHistory}
    
        Current context:
        ${context}
    
        ${planGuide}
    
        Available agents:
        ${agentList}
    
        You can also use:
        - spawn_agent: delegate a sub-task to a specialized agent
        - create_background_task: schedule async background work
        - list_background_tasks: check status of background tasks
    
        Rules:
    
        1. ALWAYS select an agent for the first step.
        2. Never return "finish" before an agent has produced a result.
        3. Do NOT repeat the same instruction twice.
        4. Use assistant for conversation and general questions.
        5. Use python_code for calculations or code.
        6. Use writer to produce the final response shown to the user.
    
        For complex tasks:
        - Use "plan" agent to create a multi-step plan first
        - Use spawn_agent to run independent sub-tasks in parallel
        - Follow the active plan if one exists
    
        Respond ONLY with JSON:
    
        {
          "agent": "agent_name | finish | plan",
          "instruction": "what the agent should do",
          "nextStep": 1
        }
        `;
    
              this.eventStream.push(createEvent("text_start", { content: "Consultando planner..." }));
                  if (onProgress) {
                    onProgress("\u{1F5FA}\uFE0F Decidindo a melhor abordagem...").catch(() => {});
                  }
              // === HOOK: before_planner ===
              const hookContext = await this.hookManager.execute("before_planner", {
                input,
                history: formattedHistory,
                context,
              });
    
              const decision = await this.planner.run(plannerPrompt);
    
              // === HOOK: after_planner ===
              await this.hookManager.execute("after_planner", {
                input,
                result: decision,
                context,
              });
              this.eventStream.push(createEvent("text_delta", { content: "Planner respondeu." }));
    
              if (this.debug) {
                console.log("Planner raw decision:");
                console.log(decision);
              }
    
              let parsed: any;
    
              try {
                parsed = JSON.parse(decision);
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
    
              // ============================================================
              // PLAN CREATION (NOVO)
              // ============================================================
              if (parsed.agent === "plan") {
                if (onProgress) {
                  onProgress("\u{1F4CB} Criando plano de acao...").catch(() => {});
                }
    
                // Criar um plano multi-step
                this.planManager.create(
                  parsed.instruction || input,
                  this.sessionId
                );
    
                // Usar o planner para gerar os steps do plano
                const planGenerationPrompt = `
        Create a multi-step plan for this task:
        ${parsed.instruction || input}
    
        Available agents: ${this.agents.map(a => a.name).join(", ")}
    
        For each step, specify:
        - Step number
        - Description
        - Which agent should execute it
        - Dependencies on other steps (if any)
    
        Respond ONLY with JSON array:
        [
          {
            "number": 1,
            "description": "...",
            "agent": "agent_name",
            "dependsOn": []
          },
          ...
        ]
        `;
    
                try {
                  const planRaw = await this.planner.run(planGenerationPrompt);
                  const planSteps = JSON.parse(planRaw);
                  if (Array.isArray(planSteps) && planSteps.length > 0) {
                    this.planManager.addSteps(planSteps);
                    if (this.debug) {
                      console.log(`Plan created with ${planSteps.length} steps`);
                    }
                  }
                } catch (err) {
                  logger.warn(`[Orchestrator] Erro ao gerar steps do plano: ${err}`);
                }
    
                // Atualizar contexto com o plano
                planContext = this.planManager.getPlanForPrompt();
                context += `\n\n${planContext}`;
                steps++;
                continue;
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
    
                // === HOOK: before_response ===
                const hookResponse = await this.hookManager.execute("before_response", {
                  input,
                  response: lastResult || parsed.instruction || "Concluido.",
                  context,
                });
    
                // Usar resposta modificada pelo hook se existir
                if (hookResponse.response && hookResponse.response !== (lastResult || parsed.instruction || "Concluido.")) {
                  lastResult = hookResponse.response;
                }
    
                // === HOOK: after_response ===
                await this.hookManager.execute("after_response", {
                  input,
                  response: lastResult,
                  context,
                });
    
                // Salvar nota diaria automaticamente ao finalizar
                try {
                  const noteContent = "Conversa: " + (input || "").substring(0, 200) + "\n" +
                    "Resultado: " + ((lastResult || parsed.instruction || "Concluido.")).substring(0, 300);
                  saveDailyNote(noteContent);
                } catch (e) {
                  // Nota diaria nao e critica
                }
    
                // Consolidar aprendizado
                try {
                  const allMessages = [
                    { role: "user" as const, content: input },
                    { role: "assistant" as const, content: lastResult || parsed.instruction || "" },
                  ];
                  this.memoryEngine.consolidate(allMessages);
                } catch (e) {
                  // Consolidacao nao e critica
                }
    
                // ============================================================
                // DREAM CONSOLIDATION (NOVO)
                // ============================================================
                try {
                  this.dreamTask.registerSession();
                  const dreamResult = await this.dreamTask.maybeConsolidate();
                  if (dreamResult && this.debug) {
                    console.log(`[DreamTask] ${dreamResult}`);
                  }
                } catch (e) {
                  // Dream nao e critico
                }
    
                // ============================================================
                // PLAN MANAGER: Marcar plano como completo (NOVO)
                // ============================================================
                if (this.planManager.hasPlan() && this.planManager.isComplete()) {
                  if (this.debug) {
                    console.log("Plan completed successfully!");
                  }
                  this.planManager.destroy();
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
    
              // ============================================================
              // HANDLE SPAWN_AGENT (NOVO)
              // ============================================================
              if (parsed.agent === "spawn_agent") {
                if (onProgress) {
                  onProgress("\u{1F465} Delegando para sub-agente...").catch(() => {});
                }
    
                const subResult = await this.subAgentRunner.runSingle({
                  instruction: parsed.instruction,
                  agentName: parsed.subAgent, // optional specialized agent
                  taskId: `step_${steps}_${Date.now()}`,
                });
    
                lastResult = subResult.success
                  ? subResult.result
                  : `Sub-agent failed: ${subResult.error}`;
    
                context += `\n\nSub-agent (${subResult.agentName}) result:\n${lastResult}`;
    
                // Update plan step if applicable
                if (parsed.nextStep && this.planManager.hasPlan()) {
                  this.planManager.updateStep(parsed.nextStep, {
                    status: subResult.success ? "done" : "failed",
                    result: lastResult.slice(0, 500),
                  });
                }
    
                steps++;
                continue;
              }
    
              const target = this.agents.find((a) => a.name === parsed.agent);
    
              if (!target) {
                console.warn(`Agent not found: ${parsed.agent}`);
                this.eventStream.push(createEvent("agent_end"));
                this.eventStream.end();
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
    
              // Usar ContextEngine para gerenciar o prompt do agente
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
    
              // === HOOK: before_agent ===
              await this.hookManager.execute("before_agent", {
                input,
                agentName: parsed.agent,
                instruction: parsed.instruction,
                context,
              });
    
              const result = await target.agent.run(agentPrompt, onProgress);
    
              // === HOOK: after_agent ===
              await this.hookManager.execute("after_agent", {
                input,
                agentName: parsed.agent,
                instruction: parsed.instruction,
                result,
                context,
              });
    
              this.eventStream.push(
                createEvent("tool_call_end", {
                  toolName: parsed.agent,
                  content: result,
                })
              );
    
              // ============================================================
              // PLAN STEP UPDATE (NOVO)
              // ============================================================
              if (parsed.nextStep && this.planManager.hasPlan()) {
                this.planManager.updateStep(parsed.nextStep, {
                  status: "done",
                  result: result.slice(0, 500),
                  instruction: parsed.instruction,
                });
                if (this.debug) {
                  console.log(`Plan step ${parsed.nextStep} marked as done`);
                }
              }
    
              // === REFLECTION STEP ===
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
                  // Tambem adicionar ao plano se existir
                  if (this.planManager.hasPlan()) {
                    this.planManager.addLearning(
                      `[${parsed.agent}]: ${reflection.learning}`
                    );
                  }
                }
    
                // Se falhou e deve tentar abordagem diferente
                if (reflection.success === "no" && reflection.retryDifferent) {
                  // Usar retryPrompt sugerido pelo reflector se existir
                  const retryPrompt = (reflection as any).retryPrompt;
                  const suggestedAgent = (reflection as any).suggestedAgent;
                  
                  if (retryPrompt) {
                    // Usar o prompt melhorado sugerido pelo reflector
                    parsed.instruction = retryPrompt;
                    if (this.debug) {
                      console.log(`Reflection suggested retry prompt: "${retryPrompt.slice(0, 100)}"`);
                    }
                  } else {
                    delete parsed.instruction; // Forca nova instrucao
                  }
    
                  // Se sugeriu agente alternativo, usar ele
                  if (suggestedAgent && this.agents.find(a => a.name === suggestedAgent)) {
                    parsed.agent = suggestedAgent;
                    if (this.debug) {
                      console.log(`Reflection suggests alternative agent: ${suggestedAgent}`);
                    }
                  }
    
                  context += `\n\nPrevious attempt with ${parsed.agent} failed: ${result.slice(0, 300)}`;
                  context += `\nMissing: ${reflection.missingInfo.join(", ")}`;
                  
                  const altApproach = (reflection as any).alternativeApproach;
                  if (altApproach) {
                    context += `\nAlternative approach: ${altApproach}`;
                  }
    
                  // Update plan step as failed
                  if (parsed.nextStep && this.planManager.hasPlan()) {
                    this.planManager.updateStep(parsed.nextStep, {
                      status: "failed",
                      result: result.slice(0, 500),
                    });
                  }
    
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
    