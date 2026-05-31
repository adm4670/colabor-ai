/**
     * PermissionSystem - Controle granular de permissoes para tools.
     *
     * Inspirado no Permission System do claude-code.
     *
     * Niveis:
     * - read_only: apenas leitura de arquivos e busca
     * - file_write: leitura + escrita de arquivos
     * - network: + acesso a rede (HTTP, APIs)
     * - shell: + execucao de comandos
     * - full: todas as operacoes (inclui delete, git push, npm publish)
     *
     * Tools criticas exigem confirmacao do usuario.
     */
    
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export type PermissionLevel =
      | "read_only"
      | "file_write"
      | "network"
      | "shell"
      | "full";
    
    export interface PermissionCheck {
      allowed: boolean;
      reason?: string;
      requiresConfirmation?: boolean;
    }
    
    export type PermissionCallback = (
      toolName: string,
      args: unknown,
      level: PermissionLevel,
    ) => Promise<boolean>; // retorna true se permitido
    
    // ============================================================
    // Tool permission mapping
    // ============================================================
    
    const CRITICAL_TOOLS = new Set([
      "delete_file",
      "delete_activity",
      "execute_command",
      "browser_action",
      "schedule_task",
    ]);
    
    const TOOL_LEVELS: Record<string, PermissionLevel> = {
      // read_only tools
      memory_search: "read_only",
      get_activities_by_day: "read_only",
      list_background_tasks: "read_only",
      todo_write: "read_only",
      web_search: "read_only",
    
      // file_write tools
      create_activity: "file_write",
      execute_python: "file_write",
    
      // network tools
      spawn_agent: "network",
      create_background_task: "network",
      browser_action: "network",
    
      // shell tools
      execute_command: "shell",
    
      // full tools
      delete_activity: "full",
      schedule_task: "full",
    };
    
    const LEVEL_HIERARCHY: PermissionLevel[] = [
      "read_only",
      "file_write",
      "network",
      "shell",
      "full",
    ];
    
    // ============================================================
    // PermissionSystem
    // ============================================================
    
    export class PermissionSystem {
      private agentLevels: Map<string, PermissionLevel> = new Map();
      private confirmationCallback: PermissionCallback | null = null;
    
      /** Define o nivel de permissao de um agente */
      setAgentLevel(agentName: string, level: PermissionLevel): void {
        this.agentLevels.set(agentName, level);
        logger.info(`[Permissions] Agent "${agentName}" level set to ${level}`);
      }
    
      /** Retorna o nivel de permissao de um agente */
      getAgentLevel(agentName: string): PermissionLevel {
        return this.agentLevels.get(agentName) || "read_only";
      }
    
      /** Registra callback para confirmacao de operacoes criticas */
      onPermissionRequired(callback: PermissionCallback): void {
        this.confirmationCallback = callback;
      }
    
      /** Verifica se um agente pode executar uma tool */
      check(
        agentName: string,
        toolName: string,
        args?: unknown
      ): PermissionCheck {
        const agentLevel = this.getAgentLevel(agentName);
        const requiredLevel = TOOL_LEVELS[toolName] || "read_only";
    
        const agentIdx = LEVEL_HIERARCHY.indexOf(agentLevel);
        const requiredIdx = LEVEL_HIERARCHY.indexOf(requiredLevel);
    
        if (agentIdx < requiredIdx) {
          return {
            allowed: false,
            reason: `Agent "${agentName}" has level "${agentLevel}" but tool "${toolName}" requires "${requiredLevel}"`,
          };
        }
    
        // Check if critical tool requires confirmation
        if (CRITICAL_TOOLS.has(toolName)) {
          return {
            allowed: true,
            requiresConfirmation: true,
          };
        }
    
        return { allowed: true };
      }
    
      /** Pede confirmacao para operacao critica (chama o callback) */
      async requestConfirmation(
        agentName: string,
        toolName: string,
        args: unknown
      ): Promise<boolean> {
        if (!this.confirmationCallback) {
          logger.warn(
            `[Permissions] No confirmation callback set. Auto-allowing critical tool "${toolName}"`
          );
          return true;
        }
    
        const level = this.getAgentLevel(agentName);
        try {
          return await this.confirmationCallback(toolName, args, level);
        } catch (err) {
          logger.error(`[Permissions] Confirmation callback error: ${err}`);
          return false;
        }
      }
    
      /** Verifica e pede confirmacao se necessario (pipeline completo) */
      async checkAndConfirm(
        agentName: string,
        toolName: string,
        args?: unknown
      ): Promise<PermissionCheck> {
        const check = this.check(agentName, toolName, args);
    
        if (!check.allowed) return check;
    
        if (check.requiresConfirmation) {
          const confirmed = await this.requestConfirmation(
            agentName,
            toolName,
            args
          );
          if (!confirmed) {
            return {
              allowed: false,
              reason: `User denied permission for critical tool "${toolName}"`,
            };
          }
        }
    
        return { allowed: true };
      }
    
      /** Lista permissoes de todos os agentes */
      listAgentPermissions(): Record<string, PermissionLevel> {
        const result: Record<string, PermissionLevel> = {};
        for (const [name, level] of this.agentLevels) {
          result[name] = level;
        }
        return result;
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: PermissionSystem | null = null;
    
    export function getPermissionSystem(): PermissionSystem {
      if (!instance) {
        instance = new PermissionSystem();
      }
      return instance;
    }
    