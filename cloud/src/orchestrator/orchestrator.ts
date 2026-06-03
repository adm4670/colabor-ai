/**
     * AgentOrchestrator - Cloud edition v3
     * 
     * v3: Adicionado suporte a sub-agentes, planejamento persistente e background tasks.
     * v3.1: Integracao com ContextEngine.buildContext() para gerenciamento de token budget.
     *
     * Coordena o fluxo: Planner -> Agent -> Reflection -> Response.
     * Suporta agentes CLOUD (executados no servidor) e agentes LOCAIS
     * (executados no client via WebSocket tool_call/tool_result).
     */
    import { v4 as uuidv4 } from "uuid";
    import { PlannerAgent, type SubAgentInfo } from "../agents/planner";
    import { PythonAgent } from "../agents/python";
    import { ContextEngine } from "../context/context-engine";
    import { getMemoryEngine, type MemoryEngine } from "../memory/memory-engine";
    import { logger } from "../utils/logger";
    import type { CloudMessage, ChatResponse } from "../types";
    import type { ToolCallMessage, ToolResultMessage } from "../protocol/tool-protocol";
    
    /** Callback chamado quando o orchestrator precisa executar uma tool local */
    export type LocalToolCallback = (toolCall: ToolCallMessage) => Promise<ToolResultMessage>;
    
    export interface AgentEntry {
      name: string;
      description: string;
      /** "cloud" = executa no servidor, "local" = executa via WebSocket no client */
      location: "cloud" | "local";
      handler: (instruction: string, context: string) => Promise<string>;
    }
    
    export class AgentOrchestrator {
      private planner: PlannerAgent;
      private agents: AgentEntry[];
      private contextEngine: ContextEngine;
      private memoryEngine: MemoryEngine;
      private pythonAgent: PythonAgent;
      private sessionId: string;
      private onLocalTool?: LocalToolCallback;
    
      constructor(sessionId: string, onLocalTool?: LocalToolCallback) {
        this.sessionId = sessionId;
        this.onLocalTool = onLocalTool;
        this.planner = new PlannerAgent();
        this.contextEngine = new ContextEngine();
        this.memoryEngine = getMemoryEngine();
        this.pythonAgent = new PythonAgent();
    
        // Register agents: cloud + local
        this.agents = [
          {
            name: "assistant",
            description: "General conversation, questions, explanations",
            location: "cloud",
            handler: async (instruction) => instruction,
          },
          {
            name: "python_code",
            description: "Execute Python code for calculations and data analysis",
            location: "cloud",
            handler: async (instruction) => {
              const code = instruction.includes("```")
                ? instruction.split("```")[1]?.replace(/^python\n?/, "") || instruction
                : instruction;
              return this.pythonAgent.run(code);
            },
          },
          {
            name: "file_system",
            description: "Read, write, list, create files and folders on user's Windows PC",
            location: "local",
            handler: async () => "", // handled via tool protocol
          },
          {
            name: "shell",
            description: "Execute CMD and PowerShell commands on user's Windows PC",
            location: "local",
            handler: async () => "", // handled via tool protocol
          },
          {
            name: "desktop",
            description: "Screenshot, clipboard, process list on user's Windows desktop",
            location: "local",
            handler: async () => "", // handled via tool protocol
          },
        ];
      }
    
      /** Set the callback for local tool execution */
      setLocalToolCallback(cb: LocalToolCallback): void {
        this.onLocalTool = cb;
      }
    
      async run(input: string, history: CloudMessage[] = []): Promise<AsyncGenerator<ChatResponse>> {
        const self = this;
        const memoryContext = this.memoryEngine.recall(input);
    
        // --- ContextEngine: add all messages ---
        // Add conversation history (past turns)
        for (const msg of history) {
          this.contextEngine.addMessage(msg);
        }
        // Add current user message
        this.contextEngine.addMessage({ role: "user", content: input });
    
        let lastResult = "";
        const maxSteps = 10;
    
        async function* runSteps(): AsyncGenerator<ChatResponse> {
          for (let step = 0; step < maxSteps; step++) {
            yield {
              type: "progress",
              content: `Step ${step + 1}/${maxSteps}`,
              sessionId: self.sessionId,
            };
    
            // --- Build context from ContextEngine (token-budget compliant) ---
            const engineContext = self.contextEngine.buildContext();
    
            const agentInfos: SubAgentInfo[] = self.agents.map((a) => ({
              name: a.name,
              description: a.description,
            }));
    
            const decision = await self.planner.decide(input, engineContext, agentInfos);
    
            logger.info(`[Orchestrator] Step ${step + 1}: planner chose "${decision.agent}"`);
    
            if (decision.agent === "finish") {
              yield {
                type: "end",
                content: lastResult || "Tarefa concluida.",
                agent: "orchestrator",
                sessionId: self.sessionId,
              };
              return;
            }
    
            const target = self.agents.find((a) => a.name === decision.agent);
            if (!target) {
              yield {
                type: "error",
                content: `Agente '${decision.agent}' nao encontrado`,
                sessionId: self.sessionId,
              };
              return;
            }
    
            // ---- LOCAL AGENT: dispatch via WebSocket tool_call ----
            if (target.location === "local") {
              if (!self.onLocalTool) {
                yield {
                  type: "error",
                  content: `Agente local '${decision.agent}' nao disponivel (client nao conectado)`,
                  sessionId: self.sessionId,
                };
                // Still record in context engine so the planner knows it failed
                self.contextEngine.addMessage({
                  role: "assistant",
                  content: `[${decision.agent}]: Error: client not connected`,
                });
                continue;
              }
    
              // Parse instruction to extract tool and params
              const toolCall = self.parseLocalInstruction(decision.agent, decision.instruction, input);
    
              yield {
                type: "tool_call",
                content: `[Local] ${decision.agent}: ${toolCall.description}`,
                agent: decision.agent,
                sessionId: self.sessionId,
              };
    
              logger.info(
                `[Orchestrator] Dispatching local tool: ${toolCall.tool} via ${toolCall.agent}`,
              );
    
              try {
                const toolResult = await self.onLocalTool(toolCall);
    
                if (toolResult.status === "cancelled") {
                  yield {
                    type: "text",
                    content: "Operacao cancelada pelo usuario.",
                    agent: decision.agent,
                    sessionId: self.sessionId,
                  };
                  self.contextEngine.addMessage({
                    role: "assistant",
                    content: `[${decision.agent}]: Cancelled by user`,
                  });
                  continue;
                }
    
                if (toolResult.status === "error") {
                  yield {
                    type: "error",
                    content: `Erro em ${decision.agent}: ${toolResult.error}`,
                    sessionId: self.sessionId,
                  };
                  self.contextEngine.addMessage({
                    role: "assistant",
                    content: `[${decision.agent}]: Error: ${toolResult.error}`,
                  });
                  continue;
                }
    
                lastResult = toolResult.result || "(sem output)";
    
                self.contextEngine.addMessage({
                  role: "assistant",
                  content: `[${decision.agent}]: ${lastResult.slice(0, 2000)}`,
                });
    
                yield {
                  type: "text",
                  content: lastResult,
                  agent: decision.agent,
                  sessionId: self.sessionId,
                };
              } catch (err: any) {
                yield {
                  type: "error",
                  content: `Timeout/Falha em ${decision.agent}: ${err.message}`,
                  sessionId: self.sessionId,
                };
                self.contextEngine.addMessage({
                  role: "assistant",
                  content: `[${decision.agent}]: Error: ${err.message}`,
                });
              }
              continue;
            }
    
            // ---- CLOUD AGENT: execute directly ----
            yield {
              type: "tool_call",
              content: decision.instruction,
              agent: decision.agent,
              sessionId: self.sessionId,
            };
    
            const result = await target.handler(decision.instruction, engineContext);
            lastResult = result;
    
            self.contextEngine.addMessage({
              role: "assistant",
              content: `[${decision.agent}]: ${result.slice(0, 2000)}`,
            });
    
            yield {
              type: "text",
              content: result,
              agent: decision.agent,
              sessionId: self.sessionId,
            };
          }
    
          yield {
            type: "end",
            content: lastResult || "Max steps reached.",
            sessionId: self.sessionId,
          };
        }
    
        return runSteps();
      }
    
      /**
       * Parse a planner instruction into a structured ToolCallMessage.
       * The planner's instruction contains what to do; we extract the tool name and params.
       */
      private parseLocalInstruction(
        agent: string,
        instruction: string,
        userInput: string,
      ): ToolCallMessage {
        // Map agent to default tool and parse params from instruction
        const defaultTools: Record<string, string> = {
          file_system: "read_file",
          shell: "run_cmd",
          desktop: "screenshot",
        };
    
        // Try to extract a specific tool name from the instruction
        const toolPatterns: Record<string, RegExp> = {
          file_system: /(read_file|write_file|list_dir|create_dir|delete_file|file_info)/i,
          shell: /(run_cmd|run_powershell|get_env|which)/i,
          desktop: /(screenshot|clipboard_get|clipboard_set|list_processes|list_windows)/i,
        };
    
        let tool = defaultTools[agent] || "run_cmd";
        const pattern = toolPatterns[agent];
        if (pattern) {
          const match = instruction.match(pattern);
          if (match) tool = match[1].toLowerCase();
        }
    
        // Build params based on agent type
        const params: Record<string, unknown> = {};
        switch (agent) {
          case "file_system": {
            // Extract path from instruction or use user input
            const pathMatch = instruction.match(
              /(?:path|arquivo|pasta|file|dir)\s*[:=]\s*["']?([^\s"',]+)["']?/i,
            );
            params.path = pathMatch?.[1] || userInput;
            if (tool === "write_file") {
              const contentMatch = instruction.match(/content\s*[:=]\s*["']?(.+?)["']?\s*(?:$|,)/is);
              params.content = contentMatch?.[1] || "";
            }
            break;
          }
          case "shell": {
            const cmdMatch = instruction.match(
              /(?:command|comando|cmd)\s*[:=]\s*["']?(.+?)["']?\s*(?:$|,)/is,
            );
            params.command = cmdMatch?.[1] || instruction.slice(0, 500);
            break;
          }
          case "desktop": {
            if (tool === "screenshot") {
              const pathMatch = instruction.match(/(?:path|save)\s*[:=]\s*["']?([^\s"',]+)["']?/i);
              params.path = pathMatch?.[1] || undefined;
            }
            if (tool === "clipboard_set") {
              const textMatch = instruction.match(/text\s*[:=]\s*["']?(.+?)["']?\s*(?:$|,)/is);
              params.text = textMatch?.[1] || "";
            }
            break;
          }
        }
    
        // Determine if confirmation is required
        const dangerousTools = [
          "delete_file",
          "run_cmd",
          "run_powershell",
          "write_file",
          "clipboard_set",
        ];
        const requireConfirmation = dangerousTools.includes(tool);
    
        return {
          type: "tool_call",
          id: uuidv4(),
          agent,
          tool,
          params,
          requireConfirmation,
          sessionId: this.sessionId,
          description: `${agent}/${tool}: ${instruction.slice(0, 150)}`,
        };
      }
    }
    