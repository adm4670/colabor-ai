/**
     * Scheduler - Agendamento de tarefas com expressoes cron.
     *
     * Inspirado no CronCreateTool do claude-code.
     * Usa node-cron para agendamento recorrente.
     * Integrado com BackgroundTaskManager para execucao.
     */
    
    import { schedule, validate } from "node-cron";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface ScheduledTask {
      name: string;
      cronExpression: string;
      description: string;
      instruction: string;
      agentName: string;
      enabled: boolean;
      createdAt: string;
      lastRunAt?: string;
      nextRunAt?: string;
    }
    
    // ============================================================
    // Scheduler
    // ============================================================
    
    export class Scheduler {
      private tasks: Map<string, ScheduledTask> = new Map();
      private cronJobs: Map<string, ReturnType<typeof schedule>> = new Map();
      private onTaskTrigger: ((task: ScheduledTask) => void) | null = null;
    
      /** Registra callback para quando uma tarefa agendada disparar */
      onTrigger(callback: (task: ScheduledTask) => void): void {
        this.onTaskTrigger = callback;
      }
    
      /** Agenda uma nova tarefa */
      schedule(task: ScheduledTask): boolean {
        if (!validate(task.cronExpression)) {
          logger.error(
            `[Scheduler] Expressao cron invalida: "${task.cronExpression}"`
          );
          return false;
        }
    
        if (this.tasks.has(task.name)) {
          this.unschedule(task.name);
        }
    
        this.tasks.set(task.name, task);
    
        if (task.enabled) {
          this.startCronJob(task);
        }
    
        logger.info(
          `[Scheduler] Tarefa "${task.name}" agendada: ${task.cronExpression}`
        );
        return true;
      }
    
      /** Remove uma tarefa agendada */
      unschedule(name: string): boolean {
        const task = this.tasks.get(name);
        if (!task) return false;
    
        // Parar cron job
        const job = this.cronJobs.get(name);
        if (job) {
          job.stop();
          this.cronJobs.delete(name);
        }
    
        this.tasks.delete(name);
        logger.info(`[Scheduler] Tarefa "${name}" removida`);
        return true;
      }
    
      /** Ativa/desativa uma tarefa */
      setEnabled(name: string, enabled: boolean): boolean {
        const task = this.tasks.get(name);
        if (!task) return false;
    
        task.enabled = enabled;
    
        if (enabled) {
          this.startCronJob(task);
        } else {
          const job = this.cronJobs.get(name);
          if (job) {
            job.stop();
            this.cronJobs.delete(name);
          }
        }
    
        return true;
      }
    
      /** Lista todas as tarefas agendadas */
      list(): ScheduledTask[] {
        return Array.from(this.tasks.values()).map((task) => {
          const job = this.cronJobs.get(task.name);
          return {
            ...task,
            nextRunAt: job ? this.getNextRun(task.cronExpression) : undefined,
          };
        });
      }
    
      /** Para todas as tarefas */
      stopAll(): void {
        for (const [name] of this.cronJobs) {
          const job = this.cronJobs.get(name);
          if (job) job.stop();
        }
        this.cronJobs.clear();
        logger.info("[Scheduler] Todas as tarefas paradas");
      }
    
      private startCronJob(task: ScheduledTask): void {
        // Para job existente se houver
        const existing = this.cronJobs.get(task.name);
        if (existing) existing.stop();
    
        const job = schedule(task.cronExpression, () => {
          logger.info(`[Scheduler] Disparando tarefa: "${task.name}"`);
    
          // Atualizar last run
          task.lastRunAt = new Date().toISOString();
    
          // Notificar callback
          if (this.onTaskTrigger) {
            try {
              this.onTaskTrigger(task);
            } catch (err) {
              logger.error(
                `[Scheduler] Erro no callback da tarefa "${task.name}": ${err}`
              );
            }
          }
        });
    
        this.cronJobs.set(task.name, job);
      }
    
      private getNextRun(cronExpression: string): string | undefined {
        try {
          const interval = cronExpression.split(" ");
          // Estimativa simples baseada na expressao
          if (cronExpression.startsWith("0 *")) {
            // A cada hora
            const next = new Date();
            next.setHours(next.getHours() + 1, 0, 0, 0);
            return next.toISOString();
          }
          if (cronExpression.includes("* * *")) {
            // A cada minuto
            const next = new Date();
            next.setMinutes(next.getMinutes() + 1, 0, 0);
            return next.toISOString();
          }
        } catch {
          // Fallback
        }
        return undefined;
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: Scheduler | null = null;
    
    export function getScheduler(): Scheduler {
      if (!instance) {
        instance = new Scheduler();
      }
      return instance;
    }
    