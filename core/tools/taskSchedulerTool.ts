// ============================================================
    // TaskScheduler Tool - Agendar tarefas para execucao futura
    // Usa setTimeout para agendamento simples (em memoria)
    // ============================================================
    
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Task types
    // ============================================================
    
    interface ScheduledTask {
      id: string;
      description: string;
      createdAt: number;
      scheduledAt: number;
      status: "pending" | "executing" | "completed" | "failed";
      result?: string;
      error?: string;
    }
    
    // ============================================================
    // In-memory task store
    // ============================================================
    
    const tasks: Map<string, ScheduledTask> = new Map();
    let taskCounter = 0;
    
    function generateTaskId(): string {
      taskCounter++;
      return `task_${Date.now().toString(36)}_${taskCounter}`;
    }
    
    export const taskSchedulerTool = {
      type: "function" as const,
    
      function: {
        name: "task_scheduler",
        description: "Agenda tarefas para execucao futura ou lista/gerencia tarefas agendadas. Acoes: schedule (agendar lembrente/tarefa), list (listar tarefas), cancel (cancelar), status (ver status). NOTA: O agendamento e simples e baseado em timeout, nao persiste entre reinicializacoes.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["schedule", "list", "cancel", "status"],
              description: "Acao: schedule (agendar), list (listar tarefas), cancel (cancelar), status (ver status de uma)"
            },
            description: {
              type: "string",
              description: "Descricao da tarefa/lembrete (obrigatorio em 'schedule')"
            },
            delayMs: {
              type: "number",
              description: "Tempo em milissegundos para executar (obrigatorio em 'schedule', default: 60000 = 1 min)"
            },
            taskId: {
              type: "string",
              description: "ID da tarefa (obrigatorio em 'cancel' e 'status')"
            }
          },
          required: ["action"]
        }
      },
    
      async handler({
        action,
        description,
        delayMs,
        taskId
      }: {
        action: string;
        description?: string;
        delayMs?: number;
        taskId?: string;
      }): Promise<any> {
    
        switch (action) {
    
          case "schedule": {
            if (!description) {
              return { success: false, message: "Descricao obrigatoria para agendar." };
            }
    
            const delay = delayMs || 60000; // default 1 minuto
            const id = generateTaskId();
            const scheduledAt = Date.now() + delay;
    
            const task: ScheduledTask = {
              id,
              description,
              createdAt: Date.now(),
              scheduledAt,
              status: "pending",
            };
    
            tasks.set(id, task);
    
            // Agenda a execucao (simples, em memoria)
            setTimeout(() => {
              const t = tasks.get(id);
              if (t && t.status === "pending") {
                t.status = "completed";
                t.result = `Tarefa executada: ${description}`;
                tasks.set(id, t);
                logger.info(`[TaskScheduler] Tarefa concluida: ${id} - ${description}`);
              }
            }, delay);
    
            const scheduledTime = new Date(scheduledAt).toLocaleTimeString("pt-BR");
            return {
              success: true,
              taskId: id,
              description,
              scheduledAt: new Date(scheduledAt).toISOString(),
              delay: `${Math.round(delay / 1000)}s`,
              message: `Tarefa agendada: "${description}" em ${Math.round(delay / 1000)}s (${scheduledTime})`,
            };
          }
    
          case "list": {
            const allTasks = Array.from(tasks.values())
              .sort((a, b) => a.createdAt - b.createdAt)
              .map(t => ({
                id: t.id.substring(0, 12) + "...",
                description: t.description.substring(0, 80),
                status: t.status,
                scheduledAt: new Date(t.scheduledAt).toISOString(),
              }));
    
            const pending = allTasks.filter(t => t.status === "pending").length;
    
            return {
              success: true,
              tasks: allTasks,
              total: allTasks.length,
              pending,
              message: `${allTasks.length} tarefa(s) no total, ${pending} pendente(s)`,
            };
          }
    
          case "cancel": {
            if (!taskId) {
              return { success: false, message: "taskId obrigatorio para cancelar." };
            }
    
            const task = tasks.get(taskId);
            if (!task) {
              return { success: false, message: `Tarefa nao encontrada: ${taskId.substring(0, 12)}...` };
            }
    
            if (task.status !== "pending") {
              return { success: false, message: `Tarefa ja ${task.status}: ${taskId.substring(0, 12)}...` };
            }
    
            task.status = "failed";
            task.error = "Cancelada pelo usuario";
            tasks.set(taskId, task);
    
            return {
              success: true,
              message: `Tarefa cancelada: ${task.description.substring(0, 60)}`,
            };
          }
    
          case "status": {
            if (!taskId) {
              return { success: false, message: "taskId obrigatorio." };
            }
    
            const task = tasks.get(taskId);
            if (!task) {
              return { success: false, message: `Tarefa nao encontrada: ${taskId}` };
            }
    
            return {
              success: true,
              taskId: task.id,
              description: task.description,
              status: task.status,
              createdAt: new Date(task.createdAt).toISOString(),
              scheduledAt: new Date(task.scheduledAt).toISOString(),
              result: task.result || null,
              error: task.error || null,
            };
          }
    
          default:
            return {
              success: false,
              message: `Acao desconhecida: '${action}'. Use: schedule, list, cancel, status`,
            };
        }
      }
    };
    