import { Agent } from "../agent/agent";
    import { logger } from "../utils/logger";
    import { browserAgent } from "../agents/browser.agent";
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
    } from "../memory/memory_search";
    import {
      EventStream,
      createEvent,
      type StreamEvent,
} from "../stream/event-stream";
        import { ContextEngine, getDefaultEngine } from "../context/context-engine";
        import { getSkillsManager } from "../skills/skills-manager";
        import { saveDailyNote, loadRecentNotes } from "../memory/memory_search";
    
    // Rate limiting - protecao contra uso excessivo
    const MAX_MESSAGES_PER_SESSION = parseInt(process.env.MAX_MESSAGES_PER_SESSION || "100", 10);
    const messageCounts: Map<string, number> = new Map();
    
    function checkRateLimit(sessionId: string): boolean {
      const count = messageCounts.get(sessionId) || 0;
      if (count >= MAX_MESSAGES_PER_SESSION) {
        return false;
      }
      messageCounts.set(sessionId, count + 1);
      return true;
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
    };
    
    export class AgentOrchestrator {
          private sessionId: string;
          public eventStream: EventStream;
          private contextEngine: ContextEngine;
        
          constructor(
            private planner: Agent,
            private agents: SubAgent[],
            private debug = true
          ) {
            this.sessionId = generateSessionId("orchestrator");
            this.eventStream = new EventStream();
            this.contextEngine = getDefaultEngine();
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
    
      async run({ input, history = [], sessionId }: RunInput) {
        // Use provided sessionId or keep the existing one
        if (sessionId) this.sessionId = sessionId;
    
        this.eventStream.push(createEvent("agent_start"));
    
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
          this.eventStream.end(errorMsg);
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
    
        const formattedHistory = this.formatHistory(history);
    
        let context = `
    User request:
    ${input}
    
    Conversation history:
    ${formattedHistory}
    
    Recent memory context:
    ${readMemoryFile().slice(0, 1000)}
    `;
    
        let steps = 0;
        let lastResult = "";
        let lastInstruction = "";
    
        const maxSteps = 10;
    
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
          const decision = await this.planner.run(plannerPrompt);
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
            const memoryResults = await memorySearchTool.handler({
              query: input,
              maxResults: 5,
            });
            context += `\n\nMemory search results:\n${JSON.stringify(memoryResults.results)}`;
          }
    
          // Stop condition
          if (parsed.agent === "finish") {
            if (this.debug) {
              console.log("\nORCHESTRATION FINISHED");
            }
    
            // Save assistant response to transcript
            appendToTranscript(this.sessionId, {
              role: "assistant",
              content: lastResult || parsed.instruction || "Concluido.",
              timestamp: Date.now(),
            });
                // Salvar nota diaria automaticamente ao finalizar
                try {
                  const noteContent = "Conversa: " + (input || "").substring(0, 200) + "\n" +
                    "Resultado: " + ((lastResult || parsed.instruction || "Concluido.")).substring(0, 300);
                  saveDailyNote(noteContent);
                } catch (e) {
                  // Nota diaria nao e critica
                }
        
    
            this.eventStream.push(createEvent("turn_end", { content: lastResult }));
            this.eventStream.push(createEvent("agent_end"));
            this.eventStream.end(lastResult);
            return lastResult || parsed.instruction || "Concluido.";
          }
    
          // Protection against instruction loop
          if (parsed.instruction === lastInstruction) {
            if (this.debug) {
              console.warn("Repeated instruction detected. Stopping loop.");
            }
            this.eventStream.push(createEvent("agent_end"));
            this.eventStream.end(lastResult || context);
            return lastResult || context;
          }
    
          lastInstruction = parsed.instruction;
    
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
    
          const agentPrompt = `
    User request:
    ${input}
    
    Conversation history:
    ${formattedHistory}
    
    Instruction:
    ${parsed.instruction}
    
    Context so far:
    ${context}
    `;
    
          const result = await target.agent.run(agentPrompt);
    
          this.eventStream.push(
            createEvent("tool_call_end", {
              toolName: parsed.agent,
              content: result,
            })
          );
    
          lastResult = result;
    
          if (this.debug) {
            console.log(`Result from ${parsed.agent}:`);
            console.log(result);
          }
    
          context += `\n\n${parsed.agent} result:\n${result}`;
    
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
        this.eventStream.end(lastResult);
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
    