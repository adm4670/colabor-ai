/**
     * AgentTool - Ferramenta que permite ao agente spawnar sub-agentes.
     *
     * Inspirado no AgentTool do claude-code.
     *
     * Permite ao agente principal delegar tarefas para agentes especializados.
     * Suporta execucao paralela quando multiplas chamadas sao feitas na mesma mensagem.
     */
    
    import { ToolDefinition, ToolContext } from "./toolDefinition";
    import { getSubAgentRunner, SubAgentResult } from "../agent/sub-agent-runner";
    import { agentRegistry } from "../agents/agent-registry";
    import { logger } from "../utils/logger";
    
    interface AgentToolArgs {
      /** Instrucao para o sub-agente */
      instruction: string;
      /** Nome do agente especializado (opcional) */
      agent?: string;
    }
    
    export const agentTool: ToolDefinition<AgentToolArgs, string> = {
      name: "spawn_agent",
      description:
        "Spawn a sub-agent to handle a specific task. Use for delegating complex sub-tasks to specialized agents. Available agents: assistant (general), python_code (code/calculations), browser (web navigation), shell (system commands), writer (text generation).",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description:
              "Clear instruction for the sub-agent. Be specific about what you need.",
          },
          agent: {
            type: "string",
            description:
              "Name of the specialized agent to use: assistant, python_code, browser, shell, writer. Defaults to assistant.",
          },
        },
        required: ["instruction"],
      },
    
      execute: async (
        args: AgentToolArgs,
        _context: ToolContext
      ): Promise<string> => {
        const runner = getSubAgentRunner();
        const taskId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
        logger.info(
          `[AgentTool] Spawnando sub-agente "${args.agent || "assistant"}" para task ${taskId}`
        );
    
        const result: SubAgentResult = await runner.runSingle({
          instruction: args.instruction,
          agentName: args.agent,
          taskId,
        });
    
        if (result.success) {
          return result.result;
        } else {
          return `ERROR: Sub-agent failed - ${result.error}`;
        }
      },
    };
    
    /** Tool definition no formato OpenAI function calling */
    export const agentToolOpenAI = {
      type: "function" as const,
      function: {
        name: agentTool.name,
        description: agentTool.description,
        parameters: agentTool.parameters,
      },
    };
    
    /** Handler para function calling */
    export const agentToolHandler: Function = agentTool.execute;
    