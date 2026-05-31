/**
     * ScheduleTaskTool - Tool para agendar tarefas recorrentes.
     *
     * Inspirado no CronCreateTool do claude-code.
     * Permite ao agente criar tarefas agendadas com expressoes cron.
     */
    
    import { ToolDefinition, ToolContext } from "./toolDefinition";
    import { getScheduler } from "../scheduler/scheduler";
    import { getBackgroundTaskManager } from "../tasks/background-task-manager";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    interface ScheduleTaskArgs {
      name: string;
      cronExpression: string;
      description: string;
      instruction: string;
      agent?: string;
      enabled?: boolean;
    }
    
    // ============================================================
    // Tool
    // ============================================================
    
    export const scheduleTaskTool: ToolDefinition<ScheduleTaskArgs, any> = {
      name: "schedule_task",
      description:
        "Schedule a recurring task using cron expressions. Examples: '0 * * * *' (hourly), '0 9 * * *' (daily at 9am), '0 9 * * 1' (every Monday at 9am). Use for periodic reminders, checks, or reports.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Unique name for this scheduled task",
          },
          cronExpression: {
            type: "string",
            description:
              "Cron expression: minute hour day-of-month month day-of-week. Examples: '0 * * * *' (hourly), '0 9 * * *' (daily 9am), '0 9 * * 1' (Monday 9am)",
          },
          description: {
            type: "string",
            description: "Short description of what this scheduled task does",
          },
          instruction: {
            type: "string",
            description:
              "Detailed instructions for the agent that will execute when triggered",
          },
          agent: {
            type: "string",
            description: "Agent to use (default: assistant)",
          },
          enabled: {
            type: "boolean",
            description: "Whether the task should start enabled (default: true)",
          },
        },
        required: ["name", "cronExpression", "description", "instruction"],
      },
    
      execute: async (
        args: ScheduleTaskArgs,
        _ctx: ToolContext
      ): Promise<any> => {
        try {
          const scheduler = getScheduler();
    
          // Configurar callback para enfileirar no BackgroundTaskManager
          scheduler.onTrigger((task) => {
            try {
              const bgManager = getBackgroundTaskManager();
              bgManager.enqueue({
                description: `[Scheduled] ${task.description}`,
                instruction: task.instruction,
                agentName: task.agentName,
              });
              logger.info(
                `[ScheduleTask] Tarefa "${task.name}" enfileirada no BackgroundTaskManager`
              );
            } catch (err) {
              logger.error(`[ScheduleTask] Erro ao enfileirar: ${err}`);
            }
          });
    
          const success = scheduler.schedule({
            name: args.name,
            cronExpression: args.cronExpression,
            description: args.description,
            instruction: args.instruction,
            agentName: args.agent || "assistant",
            enabled: args.enabled !== false,
            createdAt: new Date().toISOString(),
          });
    
          if (success) {
            return {
              success: true,
              message: `Task "${args.name}" scheduled with cron "${args.cronExpression}"`,
              nextRun: args.enabled !== false ? "As scheduled" : "Disabled",
            };
          } else {
            return {
              success: false,
              error: `Invalid cron expression: "${args.cronExpression}"`,
            };
          }
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || "Failed to schedule task",
          };
        }
      },
    };
    
    /** Tool para listar tarefas agendadas */
    export const listScheduledTasksTool: ToolDefinition<{}, any> = {
      name: "list_scheduled_tasks",
      description: "List all scheduled (cron) tasks.",
      parameters: {
        type: "object",
        properties: {},
      },
    
      execute: async (_args: {}, _ctx: ToolContext): Promise<any> => {
        const scheduler = getScheduler();
        const tasks = scheduler.list();
        return {
          success: true,
          count: tasks.length,
          tasks: tasks.map((t) => ({
            name: t.name,
            cron: t.cronExpression,
            description: t.description,
            enabled: t.enabled,
            lastRun: t.lastRunAt,
            nextRun: t.nextRunAt,
          })),
        };
      },
    };
    
    // OpenAI format
    export const scheduleTaskOpenAI = {
      type: "function" as const,
      function: {
        name: scheduleTaskTool.name,
        description: scheduleTaskTool.description,
        parameters: scheduleTaskTool.parameters,
      },
    };
    
    export const listScheduledOpenAI = {
      type: "function" as const,
      function: {
        name: listScheduledTasksTool.name,
        description: listScheduledTasksTool.description,
        parameters: listScheduledTasksTool.parameters,
      },
    };
    
    export const scheduleTaskHandler: Function = scheduleTaskTool.execute;
    export const listScheduledHandler: Function = listScheduledTasksTool.execute;
    