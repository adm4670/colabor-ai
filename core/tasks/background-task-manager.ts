/**
     * BackgroundTaskManager - Gerenciador de tarefas assincronas em background.
     *
     * Inspirado no Task System do claude-code (LocalAgentTask, RemoteAgentTask).
     *
     * Permite que o agente principal dispare tarefas que rodam em segundo plano
     * sem bloquear a interacao principal. O usuario pode consultar o status.
     *
     * Features:
     * - Fila de tarefas com prioridade
     * - Execucao concorrente limitada
     * - Status tracking (pending | running | done | failed)
     * - Persistencia do estado em disco
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import { Agent } from "../agent/agent";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export type BgTaskStatus = "pending" | "running" | "done" | "failed";
    
    export interface BackgroundTask {
      /** ID unico */
      id: string;
      /** Descricao da tarefa */
      description: string;
      /** Instrucao para o agente que vai executar */
      instruction: string;
      /** Nome do agente a ser usado */
      agentName: string;
      /** Status atual */
      status: BgTaskStatus;
      /** Resultado (se concluida) */
      result?: string;
      /** Erro (se falhou) */
      error?: string;
      /** Timestamp de criacao */
      createdAt: number;
            /** Timestamp agendado para execucao futura (opcional) */
            scheduledAt?: number;
            /** Delay em ms a partir do enqueue (opcional) */
            delayMs?: number;
      /** Timestamp de quando iniciou */
      startedAt?: number;
      /** Timestamp de quando terminou */
      completedAt?: number;
      /** Duracao em ms */
      durationMs?: number;
      /** Callback para quando completar */
      onComplete?: (task: BackgroundTask) => void;
    }
    
    // ============================================================
    // BackgroundTaskManager
    // ============================================================
    
    const TASKS_DIR = path.join(process.cwd(), ".colabor-ai", "background_tasks");
    
    export class BackgroundTaskManager {
      private queue: BackgroundTask[] = [];
      private running: Set<string> = new Set();
      private maxConcurrent: number;
      private pollInterval: NodeJS.Timeout | null = null;
      private agentFactory: (name: string) => Agent;
    
      constructor(
        maxConcurrent: number = 3,
        agentFactory: (name: string) => Agent
      ) {
        this.maxConcurrent = maxConcurrent;
        this.agentFactory = agentFactory;
        this.ensureDir();
        this.loadState();
      }
    
      private ensureDir(): void {
        if (!fs.existsSync(TASKS_DIR)) {
          fs.mkdirSync(TASKS_DIR, { recursive: true });
        }
      }
    
      /** Adiciona uma tarefa a fila e comeca a processar */
      enqueue(task: Omit<BackgroundTask, "id" | "status" | "createdAt">): BackgroundTask {
        const fullTask: BackgroundTask = {
          ...task,
          id: `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          status: "pending",
          createdAt: Date.now(),
        };
    
        this.queue.push(fullTask);
        this.saveState();
        this.processQueue();
    
        logger.info(
          `[BackgroundTaskManager] Task ${fullTask.id} enfileirada: "${task.description.slice(0, 80)}"`
        );
    
        // Se tem delayMs, programa para execucao futura
            if (task.delayMs && task.delayMs > 0) {
              setTimeout(() => {
                logger.info(`[BackgroundTaskManager] Task ${fullTask.id} agendada com delay de ${task.delayMs}ms`);
                this.processQueue();
              }, task.delayMs);
            }
            
            // Se tem scheduledAt, verifica se e no futuro
            if (task.scheduledAt && task.scheduledAt > Date.now()) {
              const delay = task.scheduledAt - Date.now();
              setTimeout(() => {
                logger.info(`[BackgroundTaskManager] Task ${fullTask.id} agendada para ${new Date(task.scheduledAt!).toISOString()}`);
                fullTask.status = 'pending';
                this.processQueue();
              }, delay);
              // Marca como pending mas nao processa ainda
              fullTask.status = 'pending';
              this.saveState();
              return fullTask;
            }
            
            return fullTask;
      }
    
      /** Retorna todas as tarefas (ativas e concluidas) */
      getAll(): BackgroundTask[] {
        return [...this.queue];
      }
    
      /** Retorna tarefa pelo ID */
      getById(id: string): BackgroundTask | undefined {
        return this.queue.find((t) => t.id === id);
      }
    
      /** Retorna apenas tarefas ativas (pending ou running) */
      getActive(): BackgroundTask[] {
        return this.queue.filter(
          (t) => t.status === "pending" || t.status === "running"
        );
      }
    
      /** Retorna tarefas concluidas */
      getCompleted(): BackgroundTask[] {
        return this.queue.filter(
          (t) => t.status === "done" || t.status === "failed"
        );
      }
    
      /** Cancela uma tarefa pendente */
      cancel(id: string): boolean {
        const task = this.queue.find((t) => t.id === id);
        if (task && task.status === "pending") {
          task.status = "failed";
          task.error = "Cancelled by user";
          task.completedAt = Date.now();
          this.saveState();
          return true;
        }
        return false;
      }
    
      /** Inicia o poller para tarefas recorrentes (ex: DreamTask) */
      startPoller(intervalMs: number = 60000): void {
        if (this.pollInterval) return;
        this.pollInterval = setInterval(() => {
          this.processQueue();
          this.cleanupOldTasks();
        }, intervalMs);
        logger.info(
          `[BackgroundTaskManager] Poller iniciado (intervalo: ${intervalMs}ms)`
        );
      }
    
      /** Para o poller */
      stopPoller(): void {
        if (this.pollInterval) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
        }
      }
    
      /** Processa a fila, iniciando tarefas pendentes */
      private async processQueue(): Promise<void> {
        const available = this.queue.filter((t) => t.status === "pending");
        const slots = this.maxConcurrent - this.running.size;
    
        if (available.length === 0 || slots <= 0) return;
    
        const toStart = available.slice(0, slots);
        for (const task of toStart) {
          this.executeTask(task);
        }
      }
    
      private async executeTask(task: BackgroundTask): Promise<void> {
        task.status = "running";
        task.startedAt = Date.now();
        this.running.add(task.id);
        this.saveState();
    
        logger.info(`[BackgroundTaskManager] Executando task ${task.id}`);
    
        try {
          const agent = this.agentFactory(task.agentName);
          agent.resetHistory();
          const result = await agent.run(task.instruction);
    
          task.status = "done";
          task.result = result;
          task.completedAt = Date.now();
          task.durationMs = task.completedAt - task.startedAt;
    
          logger.info(
            `[BackgroundTaskManager] Task ${task.id} concluida em ${task.durationMs}ms`
          );
        } catch (err: any) {
          task.status = "failed";
          task.error = err?.message || String(err);
          task.completedAt = Date.now();
          task.durationMs = task.completedAt - (task.startedAt || task.createdAt);
    
          logger.error(
            `[BackgroundTaskManager] Task ${task.id} falhou: ${task.error}`
          );
        }
    
        this.running.delete(task.id);
        this.saveState();
    
        // Callback
        if (task.onComplete) {
          try {
            task.onComplete(task);
          } catch {
            // ignore callback errors
          }
        }
    
        // Processa proximas
        this.processQueue();
      }
    
      /** Deleta/remove uma tarefa pelo nome (busca por description) */
          deleteByDescription(name: string): boolean {
            const index = this.queue.findIndex((t) => 
              t.description.toLowerCase().includes(name.toLowerCase())
            );
            if (index >= 0) {
              const removed = this.queue.splice(index, 1)[0];
              // Se esta rodando, remover do running set
              if (this.running.has(removed.id)) {
                this.running.delete(removed.id);
              }
              this.saveState();
              logger.info(`[BackgroundTaskManager] Task removida: "${removed.description}"`);
              return true;
            }
            return false;
          }
    
          /** Deleta/remove uma tarefa pelo ID */
          deleteById(id: string): boolean {
            const index = this.queue.findIndex((t) => t.id === id);
            if (index >= 0) {
              const removed = this.queue.splice(index, 1)[0];
              if (this.running.has(removed.id)) {
                this.running.delete(removed.id);
              }
              this.saveState();
              return true;
            }
            return false;
          }
    
          /** Enfileira uma tarefa com delay (atalho) */
          enqueueDelayed(
            task: Omit<BackgroundTask, "id" | "status" | "createdAt">,
            delayMs: number
          ): BackgroundTask {
            return this.enqueue({
              ...task,
              delayMs,
            });
          }
    
          private cleanupOldTasks(): void {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 horas
        this.queue = this.queue.filter((t) => {
          if (
            (t.status === "done" || t.status === "failed") &&
            t.completedAt &&
            now - t.completedAt > maxAge
          ) {
            return false;
          }
          return true;
        });
        this.saveState();
      }
    
      /** Retorna status formatado para o usuario */
      getStatusReport(): string {
        const active = this.getActive();
        const completed = this.getCompleted();
    
        if (active.length === 0 && completed.length === 0) {
          return "No background tasks.";
        }
    
        const lines: string[] = [];
        if (active.length > 0) {
          lines.push(`**Active tasks (${active.length}):**`);
          for (const t of active) {
            const statusIcon = t.status === "running" ? "[...]" : "[--]";
            lines.push(`  ${statusIcon} ${t.description.slice(0, 80)}`);
          }
        }
    
        if (completed.length > 0) {
          const recent = completed.slice(-5);
          lines.push(`\n**Recent completions:**`);
          for (const t of recent) {
            const statusIcon = t.status === "done" ? "[OK]" : "[XX]";
            const result = t.result ? ` - ${t.result.slice(0, 60)}` : "";
            lines.push(`  ${statusIcon} ${t.description.slice(0, 60)}${result}`);
          }
        }
    
        return lines.join("\n");
      }
    
      // ============================================================
      // Persistencia
      // ============================================================
    
      private saveState(): void {
        try {
          this.ensureDir();
          const stateFile = path.join(TASKS_DIR, "state.json");
          const data = JSON.stringify(this.queue, null, 2);
          fs.writeFileSync(stateFile, data, "utf-8");
        } catch (err) {
          logger.warn(`[BackgroundTaskManager] Erro ao salvar estado: ${err}`);
        }
      }
    
      private loadState(): void {
        try {
          const stateFile = path.join(TASKS_DIR, "state.json");
          if (fs.existsSync(stateFile)) {
            const data = fs.readFileSync(stateFile, "utf-8");
            this.queue = JSON.parse(data);
            // Resetar tasks que estavam "running" para "pending"
            for (const task of this.queue) {
              if (task.status === "running") {
                task.status = "pending";
              }
            }
            logger.info(
              `[BackgroundTaskManager] ${this.queue.length} tasks carregadas do disco`
            );
          }
        } catch (err) {
          logger.warn(`[BackgroundTaskManager] Erro ao carregar estado: ${err}`);
        }
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: BackgroundTaskManager | null = null;
    
    export function getBackgroundTaskManager(
      agentFactory?: (name: string) => Agent
    ): BackgroundTaskManager {
      if (!instance && agentFactory) {
        instance = new BackgroundTaskManager(3, agentFactory);
      }
      if (!instance) {
        throw new Error(
          "BackgroundTaskManager nao inicializado. Forneca agentFactory na primeira chamada."
        );
      }
      return instance;
    }
    