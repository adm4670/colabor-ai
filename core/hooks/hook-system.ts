/**
     * HookSystem - Sistema de hooks extensivel para o orquestrador.
     *
     * Inspirado no Hook System do claude-code (pre/post tool, session hooks).
     *
     * Permite injetar comportamento customizado em pontos-chave do pipeline:
     * - before_planner / after_planner
     * - before_agent / after_agent
     * - before_response / after_response
     * - on_error
     *
     * Hooks podem modificar o contexto e sao executados em ordem de prioridade.
     */
    
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export type HookEvent =
      | "before_planner"
      | "after_planner"
      | "before_agent"
      | "after_agent"
      | "before_response"
      | "after_response"
      | "on_error";
    
    export interface HookContext {
      /** Input original do usuario */
      input: string;
      /** Historico da conversa */
      history?: string;
      /** Contexto acumulado ate o momento */
      context?: string;
      /** Nome do agente sendo executado (before_agent/after_agent) */
      agentName?: string;
      /** Instrucao dada ao agente (before_agent/after_agent) */
      instruction?: string;
      /** Resultado produzido (after_agent/after_planner) */
      result?: string;
      /** Resposta final (before_response/after_response) */
      response?: string;
      /** Erro ocorrido (on_error) */
      error?: Error;
      /** Dados arbitrarios para hooks customizados */
      metadata?: Record<string, unknown>;
    }
    
    export interface Hook {
      /** Nome unico do hook */
      name: string;
      /** Prioridade (menor = executa primeiro). Default: 100 */
      priority?: number;
      /** Eventos que este hook escuta */
      events?: HookEvent[];
      /** Handler chamado quando o evento dispara. Pode modificar e retornar o contexto. */
      handler: (event: HookEvent, context: HookContext) => Promise<HookContext> | HookContext;
    }
    
    // ============================================================
    // HookManager
    // ============================================================
    
    export class HookManager {
      private hooks: Map<string, Hook> = new Map();
    
      /** Registra um hook */
      register(hook: Hook): void {
        if (this.hooks.has(hook.name)) {
          logger.warn(`[HookManager] Hook "${hook.name}" ja registrado. Sobrescrevendo.`);
        }
        this.hooks.set(hook.name, hook);
        logger.info(`[HookManager] Hook "${hook.name}" registrado`);
      }
    
      /** Remove um hook */
      unregister(name: string): boolean {
        const removed = this.hooks.delete(name);
        if (removed) {
          logger.info(`[HookManager] Hook "${name}" removido`);
        }
        return removed;
      }
    
      /** Lista hooks registrados */
      list(): Hook[] {
        return Array.from(this.hooks.values()).sort(
          (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
        );
      }
    
      /** Executa todos os hooks registrados para um evento, em ordem de prioridade */
      async execute(event: HookEvent, context: HookContext): Promise<HookContext> {
        const matching = this.list().filter(
          (h) => !h.events || h.events.length === 0 || h.events.includes(event)
        );
    
        if (matching.length === 0) return context;
    
        let currentContext = { ...context };
    
        for (const hook of matching) {
          try {
            const result = await hook.handler(event, currentContext);
            currentContext = { ...currentContext, ...result };
          } catch (err) {
            logger.error(
              `[HookManager] Erro no hook "${hook.name}" para evento "${event}": ${err}`
            );
            // Continua executando outros hooks mesmo se um falhar
          }
        }
    
        return currentContext;
      }
    
      /** Verifica se existem hooks para um evento */
      hasHooksFor(event: HookEvent): boolean {
        return this.list().some(
          (h) => !h.events || h.events.length === 0 || h.events.includes(event)
        );
      }
    
      /** Remove todos os hooks */
      clear(): void {
        this.hooks.clear();
        logger.info("[HookManager] Todos os hooks removidos");
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: HookManager | null = null;
    
    export function getHookManager(): HookManager {
      if (!instance) {
        instance = new HookManager();
      }
      return instance;
    }
    