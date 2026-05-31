/**
     * TaskCreateTool - Ferramenta para criar tarefas em background.
     *
     * Inspirado no TaskCreateTool do claude-code.
     * Permite ao agente principal ou usuario agendar tarefas assincronas.
     */
    
    import { ToolDefinition, ToolContext } from "./toolDefinition";
    import { getBackgroundTaskManager } from "../tasks/background-task-manager";
    import { logger } from "../utils/logger";
    
    interface TaskCreateArgs {
      /** Descricao da tarefa */
      description: string;
      /** Instrucao detalhada */
      instruction: string;
      /** Agente a ser usado (default: assistant) */
      agent?: string;
    }
    
    export const taskCreateTool: ToolDefinition<TaskCreateArgs, any> = {
      name: "create_background_task",
      description:
        "Schedule a task to run in the background. The task will execute asynchronously without blocking the main conversation. Use for: long-running operations, periodic checks, memory consolidation, or any task the user doesn't need to wait for.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Short description of what this task does",
          },
          instruction: {
            type: "string",
            description:
              "Detailed instructions for the agent that will execute this task",
          },
          agent: {
            type: "string",
            description:
              "Agent to use: assistant, python_code, browser, shell. Default: assistant",
          },
        },
        required: ["description", "instruction"],
      },
    
      execute: async (args: TaskCreateArgs, _context: ToolContext): Promise<any> => {
        try {
          const bgManager = getBackgroundTaskManager();
          const task = bgManager.enqueue({
            description: args.description,
            instruction: args.instruction,
            agentName: args.agent || "assistant",
          });
    
          logger.info(
            `[TaskCreateTool] Background task criada: ${task.id} - "${args.description}"`
          );
    
          return {
            success: true,
            taskId: task.id,
            message: `Task "${args.description}" scheduled in background. ID: ${task.id}`,
          };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || "Failed to create background task",
          };
        }
      },
    };
    
    /** Tool definition no formato OpenAI function calling */
    export const taskCreateOpenAI = {
      type: "function" as const,
      function: {
        name: taskCreateTool.name,
        description: taskCreateTool.description,
        parameters: taskCreateTool.parameters,
      },
    };
    
    /** Handler para function calling */
    export const taskCreateHandler: Function = taskCreateTool.execute;
    
    // ========================================
    // TaskListTool - Consultar status das background tasks
    // ========================================
    
    export const taskListTool: ToolDefinition<{}, any> = {
      name: "list_background_tasks",
      description: "List all background tasks and their statuses.",
      parameters: {
        type: "object",
        properties: {},
      },
    
      execute: async (_args: {}, _context: ToolContext): Promise<any> => {
        try {
          const bgManager = getBackgroundTaskManager();
          const report = bgManager.getStatusReport();
          const all = bgManager.getAll();
    
          return {
            success: true,
            report,
            tasks: all.map((t) => ({
              id: t.id,
              description: t.description,
              status: t.status,
              result: t.result?.slice(0, 200),
              error: t.error,
            })),
          };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || "Failed to list background tasks",
          };
        }
      },
    };
    
    export const taskListOpenAI = {
      type: "function" as const,
      function: {
        name: taskListTool.name,
        description: taskListTool.description,
        parameters: taskListTool.parameters,
      },
    };
    
    export const taskListHandler: Function = taskListTool.execute;
    