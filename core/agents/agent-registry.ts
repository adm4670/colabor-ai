/**
     * AgentRegistry - Registro centralizado de agentes
     *
     * Substitui a listagem manual de agentes em main.ts e telegram.ts.
     * Cada agente se registra no catalogo ao ser importado.
     *
     * Inspirado no sistema de plugins do OpenClaw.
     */
    
    import type { Agent } from "../agent/agent";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface AgentRegistryEntry {
      /** Nome unico do agente (ex: "PythonAgent", "browser") */
      name: string;
      /** Descricao do que o agente faz (para o planner) */
      description: string;
      /** Instancia do agente */
      agent: Agent;
      /** Papel do agente no sistema */
      role: string;
      /** Dicas de quando usar este agente */
      useWhen?: string[];
    }
    
    // ============================================================
    // AgentRegistry
    // ============================================================
    
    export class AgentRegistry {
      private agents: Map<string, AgentRegistryEntry> = new Map();
      private plannerAgent: Agent | null = null;
    
      /**
       * Registra um agente no catalogo.
       * Chame isso no final de cada arquivo de agente.
       */
      register(entry: AgentRegistryEntry): void {
        if (this.agents.has(entry.name)) {
          console.warn(
            `[AgentRegistry] Agent '${entry.name}' ja registrado. Sobrescrevendo.`
          );
        }
        this.agents.set(entry.name, entry);
      }
    
      /**
       * Registra o planner agent (tratamento especial).
       */
      registerPlanner(agent: Agent): void {
        this.plannerAgent = agent;
      }
    
      /**
       * Retorna o planner agent registrado.
       */
      getPlanner(): Agent | null {
        return this.plannerAgent;
      }
    
      /**
       * Retorna um agente pelo nome.
       */
      get(name: string): AgentRegistryEntry | undefined {
        return this.agents.get(name);
      }
    
      /**
       * Retorna o agente que corresponde ao nome (busca flexivel).
       * Tenta match exato, depois case-insensitive, depois por alias.
       */
      find(name: string): AgentRegistryEntry | undefined {
        // Match exato
        if (this.agents.has(name)) return this.agents.get(name);
    
        // Case-insensitive
        const lower = name.toLowerCase();
        for (const [key, entry] of this.agents) {
          if (key.toLowerCase() === lower) return entry;
        }
    

        // Partial/fuzzy match: busca por substring case-insensitive
        // Ex: "shell" encontra "ShellAgent", "python" encontra "PythonAgent"
        for (const [key, entry] of this.agents) {
          const keyLower = key.toLowerCase();
          if (keyLower.includes(lower) || lower.includes(keyLower)) return entry;
        }

        // Match por prefixo (remove sufixos como "Agent")
        const stripped = lower.replace(/agent$/, "").trim();
        if (stripped !== lower) {
          for (const [key, entry] of this.agents) {
            if (key.toLowerCase().includes(stripped)) return entry;
          }
        }

        return undefined;
      }
      /**
       * Retorna todos os agentes registrados (exceto planner).
       */
      getAll(): AgentRegistryEntry[] {
        return Array.from(this.agents.values());
      }
    
      /**
       * Retorna a lista de agentes no formato esperado pelo AgentOrchestrator.
       */
      getSubAgents(): Array<{
        name: string;
        description: string;
        agent: Agent;
      }> {
        return this.getAll().map((entry) => ({
          name: entry.name,
          description: entry.description,
          agent: entry.agent,
        }));
      }
    
      /**
       * Retorna a lista de agentes formatada para o prompt do planner.
       */
      getAgentListForPrompt(): string {
        return this.getAll()
          .map((a) => {
            const useHints = a.useWhen ? `\n    Use when: ${a.useWhen.join(", ")}` : "";
            return `${a.name}: ${a.description}${useHints}`;
          })
          .join("\n");
      }
    
      /**
       * Lista os nomes de todos os agentes registrados.
       */
      listNames(): string[] {
        return this.getAll().map((a) => a.name);
      }
    
      /**
       * Remove um agente do registro.
       */
      unregister(name: string): boolean {
        return this.agents.delete(name);
      }
    
      /**
       * Verifica se um agente esta registrado.
       */
      has(name: string): boolean {
        return this.agents.has(name);
      }
    
      /**
       * Numero de agentes registrados (excluindo planner).
       */
      get size(): number {
        return this.agents.size;
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    
export const agentRegistry = new AgentRegistry();
    