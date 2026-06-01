"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
/**
 * AgentOrchestrator - Cloud edition v3
 *
 * v3: Adicionado suporte a sub-agentes, planejamento persistente e background tasks.
 *
 * Coordena o fluxo: Planner -> Agent -> Reflection -> Response.
 * Suporta agentes CLOUD (executados no servidor) e agentes LOCAIS
 * (executados no client via WebSocket tool_call/tool_result).
 */
const uuid_1 = require("uuid");
const planner_1 = require("../agents/planner");
const python_1 = require("../agents/python");
const context_engine_1 = require("../context/context-engine");
const memory_engine_1 = require("../memory/memory-engine");
const logger_1 = require("../utils/logger");
class AgentOrchestrator {
    planner;
    agents;
    contextEngine;
    memoryEngine;
    pythonAgent;
    sessionId;
    onLocalTool;
    constructor(sessionId, onLocalTool) {
        this.sessionId = sessionId;
        this.onLocalTool = onLocalTool;
        this.planner = new planner_1.PlannerAgent();
        this.contextEngine = new context_engine_1.ContextEngine();
        this.memoryEngine = (0, memory_engine_1.getMemoryEngine)();
        this.pythonAgent = new python_1.PythonAgent();
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
    setLocalToolCallback(cb) {
        this.onLocalTool = cb;
    }
    async run(input, history = []) {
        const self = this;
        const memoryContext = this.memoryEngine.recall(input);
        this.contextEngine.addMessage({ role: "user", content: input });
        for (const msg of history) {
            this.contextEngine.addMessage(msg);
        }
        const formattedHistory = history
            .map((m) => `${m.role}: ${(m.content || "").slice(0, 200)}`)
            .join("\n");
        let context = "";
        let lastResult = "";
        const maxSteps = 10;
        async function* runSteps() {
            for (let step = 0; step < maxSteps; step++) {
                yield {
                    type: "progress",
                    content: `Step ${step + 1}/${maxSteps}`,
                    sessionId: self.sessionId,
                };
                const agentInfos = self.agents.map((a) => ({
                    name: a.name,
                    description: a.description,
                }));
                const decision = await self.planner.decide(input, formattedHistory, context, agentInfos);
                logger_1.logger.info(`[Orchestrator] Step ${step + 1}: planner chose "${decision.agent}"`);
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
                        context += `\n\nError: Local agent ${decision.agent} not available`;
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
                    logger_1.logger.info(`[Orchestrator] Dispatching local tool: ${toolCall.tool} via ${toolCall.agent}`);
                    try {
                        const toolResult = await self.onLocalTool(toolCall);
                        if (toolResult.status === "cancelled") {
                            yield {
                                type: "text",
                                content: "Operacao cancelada pelo usuario.",
                                agent: decision.agent,
                                sessionId: self.sessionId,
                            };
                            context += `\n\n${decision.agent} result: Cancelled by user`;
                            continue;
                        }
                        if (toolResult.status === "error") {
                            yield {
                                type: "error",
                                content: `Erro em ${decision.agent}: ${toolResult.error}`,
                                sessionId: self.sessionId,
                            };
                            context += `\n\n${decision.agent} error: ${toolResult.error}`;
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
                        context += `\n\n${decision.agent} result:\n${lastResult}`;
                    }
                    catch (err) {
                        yield {
                            type: "error",
                            content: `Timeout/Falha em ${decision.agent}: ${err.message}`,
                            sessionId: self.sessionId,
                        };
                        context += `\n\n${decision.agent} error: ${err.message}`;
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
                const result = await target.handler(decision.instruction, context);
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
                context += `\n\n${decision.agent} result:\n${result}`;
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
    parseLocalInstruction(agent, instruction, userInput) {
        // Map agent to default tool and parse params from instruction
        const defaultTools = {
            file_system: "read_file",
            shell: "run_cmd",
            desktop: "screenshot",
        };
        // Try to extract a specific tool name from the instruction
        const toolPatterns = {
            file_system: /(read_file|write_file|list_dir|create_dir|delete_file|file_info)/i,
            shell: /(run_cmd|run_powershell|get_env|which)/i,
            desktop: /(screenshot|clipboard_get|clipboard_set|list_processes|list_windows)/i,
        };
        let tool = defaultTools[agent] || "run_cmd";
        const pattern = toolPatterns[agent];
        if (pattern) {
            const match = instruction.match(pattern);
            if (match)
                tool = match[1].toLowerCase();
        }
        // Build params based on agent type
        const params = {};
        switch (agent) {
            case "file_system": {
                // Extract path from instruction or use user input
                const pathMatch = instruction.match(/(?:path|arquivo|pasta|file|dir)\s*[:=]\s*["']?([^\s"',]+)["']?/i);
                params.path = pathMatch?.[1] || userInput;
                if (tool === "write_file") {
                    const contentMatch = instruction.match(/content\s*[:=]\s*["']?(.+?)["']?\s*(?:$|,)/is);
                    params.content = contentMatch?.[1] || "";
                }
                break;
            }
            case "shell": {
                const cmdMatch = instruction.match(/(?:command|comando|cmd)\s*[:=]\s*["']?(.+?)["']?\s*(?:$|,)/is);
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
            id: (0, uuid_1.v4)(),
            agent,
            tool,
            params,
            requireConfirmation,
            sessionId: this.sessionId,
            description: `${agent}/${tool}: ${instruction.slice(0, 150)}`,
        };
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=orchestrator.js.map