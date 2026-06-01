/**
     * Config - Model tiering para otimizacao flash
     * 
     * v2: Suporte a MODEL_TIERS para usar modelos baratos como default
     * e reservar modelos caros apenas para tarefas complexas.
     */
    
    // ============================================================
    // Model Tiers
    // ============================================================
    
    export const MODEL_TIERS = {
      /** Default: flash para 90% das operacoes */
      default: process.env.MODEL || "deepseek-v4-flash",
      
      /** Planner: flash para roteamento simples, pro para planos */
      planner: process.env.PLANNER_MODEL || "deepseek-v4-flash",
      planner_complex: process.env.PLANNER_COMPLEX_MODEL || "deepseek-v4-pro",
      
      /** Execucao: flash para todos os agentes especializados */
      executor: process.env.EXECUTOR_MODEL || "deepseek-v4-flash",
      
      /** Reflexao: flash (tarefa simples de avaliacao) */
      reflector: process.env.REFLECTOR_MODEL || "deepseek-v4-flash",
      
      /** Sumarizacao: flash (tarefa de compressao) */
      summarizer: process.env.SUMMARIZER_MODEL || "deepseek-v4-flash",
      
      /** Legacy: para compatibilidade */
      pro: process.env.PRO_MODEL || "deepseek-v4-pro",
      chat: process.env.CHAT_MODEL || "deepseek-chat",
    } as const;
    
    // ============================================================
    // Context Budget (flash-optimized)
    // ============================================================
    
    export const CONTEXT_BUDGET = {
      /** Token budget maximo (flash tem janela menor) */
      maxTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || "4000", 10),
      
      /** Proporcao para mensagens recentes */
      recentRatio: 0.7,
      
      /** Minimo de mensagens antes de sumarizar */
      minMessages: 4,
      
      /** Mensagens intactas na zona 1 */
      keepRecentIntact: 3,
      
      /** Tamanho da zona de sumarizacao */
      summarizeZoneSize: 5,
    } as const;
    
    // ============================================================
    // Rate Limiting
    // ============================================================
    
    export const RATE_LIMIT = {
      maxMessagesPerSession: parseInt(process.env.MAX_MESSAGES_PER_SESSION || "50", 10),
      maxSteps: parseInt(process.env.MAX_STEPS || "10", 10),
      maxReflections: parseInt(process.env.MAX_REFLECTIONS || "2", 10),
    } as const;
    
    // ============================================================
    // Feature Flags
    // ============================================================
    
    export const FEATURES = {
      /** Habilita lazy loading de skills (so carrega quando relevante) */
      lazySkills: process.env.LAZY_SKILLS !== "false",
      
      /** Habilita lazy loading de memoria (usa tool memory_search) */
      lazyMemory: process.env.LAZY_MEMORY !== "false",
      
      /** Habilita prefix caching nos system prompts */
      prefixCaching: process.env.PREFIX_CACHING !== "false",
      
      /** Habilita fast-path para queries simples (pula planner) */
      fastPath: process.env.FAST_PATH !== "false",
    } as const;
    
    // ============================================================
    // Helper: decide qual modelo usar baseado em complexidade
    // ============================================================
    
    export function getModelForTask(complexity: "simple" | "complex" = "simple"): string {
      return complexity === "complex" ? MODEL_TIERS.planner_complex : MODEL_TIERS.default;
    }
    
    export function getPlannerModel(isComplex: boolean = false): string {
      return isComplex ? MODEL_TIERS.planner_complex : MODEL_TIERS.planner;
    }
    