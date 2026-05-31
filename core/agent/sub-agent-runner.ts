/**
     * SubAgentRunner - Gerenciador de execucao de sub-agentes.
     *
     * Inspirado no AgentTool do claude-code.
     * Permite que o agente principal spawne sub-agentes para delegar tarefas.
     *
     * Suporta:
     * - Fresh sub-agents: contexto limpo, instrucao propria
     * - Parallel execution: multiplos sub-agentes rodando simultaneamente
     * - Agent selection: escolhe o agente especializado ou usa default
     */
    
    import { Agent } from "../agent/agent";
    import { agentRegistry } from "../agents/agent-registry";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface SubAgentTask {
      /** Instrucao para o sub-agente */
      instruction: string;
      /** Nome do agente especializado (opcional, usa assistant como default) */
      agentName?: string;
      /** ID unico para tracking */
      taskId: string;
    }
    
    export interface SubAgentResult {
      taskId: string;
      agentName: string;
      result: string;
      success: boolean;
      error?: string;
      durationMs: number;
    }
    
    // ============================================================
    // SubAgentRunner
    // ============================================================
    
    export class SubAgentRunner {
      private maxParallel: number;
      private defaultAgentName: string;
    
      constructor(maxParallel: number = 5, defaultAgentName: string = "assistant") {
        this.maxParallel = maxParallel;
        this.defaultAgentName = defaultAgentName;
      }
    
      /** Executa uma lista de tarefas em paralelo (limitado por maxParallel) */
      async runBatch(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
        const results: SubAgentResult[] = [];
    
        // Processa em chunks para respeitar maxParallel
        for (let i = 0; i < tasks.length; i += this.maxParallel) {
          const chunk = tasks.slice(i, i + this.maxParallel);
          const chunkResults = await Promise.all(
            chunk.map((task) => this.runSingle(task))
          );
          results.push(...chunkResults);
        }
    
        return results;
      }
    
      /** Executa uma unica tarefa */
      async runSingle(task: SubAgentTask): Promise<SubAgentResult> {
        const startTime = Date.now();
        const agentName = task.agentName || this.defaultAgentName;
    
        try {
          // Buscar agente especializado no registro
          let agent: Agent;
          const entry = agentRegistry.find(agentName);
    
          if (entry) {
            agent = entry.agent;
            // Resetar historico do agente para contexto fresco
            agent.resetHistory();
            logger.info(
              `[SubAgentRunner] Usando agente "${entry.name}" para task ${task.taskId}`
            );
          } else {
            // Fallback: usar o assistant agent ou criar um generico
            const assistantEntry = agentRegistry.find("assistant");
            if (assistantEntry) {
              agent = assistantEntry.agent;
              agent.resetHistory();
            } else {
              // Criar agente temporario
              agent = new Agent({
                name: `subagent_${task.taskId}`,
                role: "General purpose sub-agent",
                goal: task.instruction.slice(0, 100),
                backstory:
                  "A sub-agent spawned to handle a specific delegated task.",
                model: process.env.MODEL || "deepseek-chat",
              });
            }
            logger.info(
              `[SubAgentRunner] Agente "${agentName}" nao encontrado, usando ${agent.name}`
            );
          }
    
          const result = await agent.run(task.instruction);
          const durationMs = Date.now() - startTime;
    
          logger.info(
            `[SubAgentRunner] Task ${task.taskId} concluida em ${durationMs}ms via ${agent.name}`
          );
    
          return {
            taskId: task.taskId,
            agentName: agent.name,
            result,
            success: true,
            durationMs,
          };
        } catch (err: any) {
          const durationMs = Date.now() - startTime;
          logger.error(
            `[SubAgentRunner] Task ${task.taskId} falhou: ${err?.message || err}`
          );
          return {
            taskId: task.taskId,
            agentName,
            result: "",
            success: false,
            error: err?.message || String(err),
            durationMs,
          };
        }
      }
    
      /** Formata resultados para o contexto do agente principal */
      formatResultsForContext(results: SubAgentResult[]): string {
        if (results.length === 0) return "No sub-agent results.";
    
        const lines: string[] = ["=== SUB-AGENT RESULTS ==="];
        for (const r of results) {
          const status = r.success ? "OK" : "FAIL";
          lines.push(
            `[${status}] Task ${r.taskId} (${r.agentName}, ${r.durationMs}ms):`
          );
          if (r.success) {
            lines.push(`  ${r.result.slice(0, 500)}`);
          } else {
            lines.push(`  ERROR: ${r.error}`);
          }
          lines.push("");
        }
        return lines.join("\n");
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: SubAgentRunner | null = null;
    
    export function getSubAgentRunner(): SubAgentRunner {
      if (!instance) {
        instance = new SubAgentRunner();
      }
      return instance;
    }
    