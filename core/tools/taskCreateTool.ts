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
          /** Delay em segundos antes de executar (opcional) */
          delaySeconds?: number;
        }
        
        export const taskCreateTool: ToolDefinition<TaskCreateArgs, any> = {
          name: "create_background_task",
          description:
            "Schedule a task to run in the background. The task will execute asynchronously without blocking the main conversation. Use for: long-running operations, periodic checks, memory consolidation, or any task the user doesn't need to wait for. You can also use delaySeconds to schedule a one-time future execution.",
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
              delaySeconds: {
                type: "number",
                description:
                  "Delay in seconds before executing the task. Use for one-time scheduled execution. Example: 3600 = 1 hour from now.",
              },
            },
            required: ["description", "instruction"],
          },
        
          execute: async (args: TaskCreateArgs, _context: ToolContext): Promise<any> => {
            try {
              const bgManager = getBackgroundTaskManager();
              const delayMs = args.delaySeconds ? args.delaySeconds * 1000 : 0;
              
              const task = bgManager.enqueue({
                description: args.description,
                instruction: args.instruction,
                agentName: args.agent || "assistant",
                delayMs: delayMs > 0 ? delayMs : undefined,
              });
        
              logger.info(
                `[TaskCreateTool] Background task criada: ${task.id} - "${args.description}"${delayMs > 0 ? ` (delay: ${args.delaySeconds}s)` : ""}`
              );
        
              return {
                success: true,
                taskId: task.id,
                message: delayMs > 0
                  ? `Task "${args.description}" scheduled to run in ${args.delaySeconds} seconds. ID: ${task.id}`
                  : `Task "${args.description}" scheduled in background. ID: ${task.id}`,
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
        
        // ========================================
        // CancelBackgroundTaskTool - Cancelar tarefa pendente
        // ========================================
        
        interface CancelBgTaskArgs {
          id: string;
        }
        
        export const cancelBgTaskTool: ToolDefinition<CancelBgTaskArgs, any> = {
          name: "cancel_background_task",
          description: "Cancel/remove a pending or running background task by its ID.",
          parameters: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID of the background task to cancel (get it from list_background_tasks)",
              },
            },
            required: ["id"],
          },
        
          execute: async (args: CancelBgTaskArgs, _context: ToolContext): Promise<any> => {
            try {
              const bgManager = getBackgroundTaskManager();
              const cancelled = bgManager.deleteById(args.id);
        
              if (cancelled) {
                return {
                  success: true,
                  message: `Background task ${args.id} cancelled successfully.`,
                };
              } else {
                return {
                  success: false,
                  error: `Task ${args.id} not found or already completed.`,
                };
              }
            } catch (err: any) {
              return {
                success: false,
                error: err?.message || "Failed to cancel background task",
              };
            }
          },
        };
        
        export const cancelBgTaskOpenAI = {
          type: "function" as const,
          function: {
            name: cancelBgTaskTool.name,
            description: cancelBgTaskTool.description,
            parameters: cancelBgTaskTool.parameters,
          },
        };
        
        export const cancelBgTaskHandler: Function = cancelBgTaskTool.execute;
    