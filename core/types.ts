export type MessageRole = "system" | "user" | "assistant" | "tool";
    export interface Message { role: MessageRole; content: string; name?: string; tool_call_id?: string; reasoning_content?: string; tool_calls?: any; }
    export interface TranscriptMessage { role: MessageRole; content: string; name?: string; timestamp: number; tool_call_id?: string; }
    export interface RunInput { input: string; history?: Message[]; sessionId?: string; }
    export interface ReflectionResult { success: "yes"|"partial"|"no"; complete: boolean; missingInfo: string[]; retryDifferent: boolean; learning: string; }
    export type LLMProviderType = "openai" | "deepseek";
    export interface LLMProviderConfig { type: LLMProviderType; apiKey: string; baseURL: string; }
    
    // ============================================================
    // Novos tipos para melhorias agenticas
    // ============================================================
    
    /** Status de um step no plano */
    export type StepStatus = "pending" | "in_progress" | "done" | "failed";
    
    /** Um passo do plano */
    export interface PlanStep {
      number: number;
      description: string;
      status: StepStatus;
      agent?: string;
      dependsOn: number[];
      result?: string;
      instruction?: string;
    }
    
    /** Plano multi-step */
    export interface Plan {
      goal: string;
      steps: PlanStep[];
      successCriteria: string[];
      createdAt: string;
      updatedAt: string;
      sessionId: string;
      learnings: string[];
    }
    
    /** Status de background task */
    export type BgTaskStatus = "pending" | "running" | "done" | "failed";
    
    /** Background task */
    export interface BackgroundTask {
      id: string;
      description: string;
      instruction: string;
      agentName: string;
      status: BgTaskStatus;
      result?: string;
      error?: string;
      createdAt: number;
      startedAt?: number;
      completedAt?: number;
      durationMs?: number;
    }
    
    /** Resultado de sub-agente */
    export interface SubAgentResult {
      taskId: string;
      agentName: string;
      result: string;
      success: boolean;
      error?: string;
      durationMs: number;
    }
    
    
    // ============================================================
    // Nivel 2 - Hook System types
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
      input: string;
      history?: string;
      context?: string;
      agentName?: string;
      instruction?: string;
      result?: string;
      response?: string;
      error?: Error;
      metadata?: Record<string, unknown>;
    }
    
    export interface Hook {
      name: string;
      priority?: number;
      events?: HookEvent[];
      handler: (event: HookEvent, context: HookContext) => Promise<HookContext> | HookContext;
    }
    
    // ============================================================
    // Nivel 2 - Memory Extraction types
    // ============================================================
    
    export type MemoryType = "fact" | "decision" | "preference" | "learning";
    
    export interface FrontmatterMetadata {
      title?: string;
      type?: MemoryType;
      tags?: string[];
      date?: string;
      context?: string;
      [key: string]: unknown;
    }
    
    export interface MemoryExtraction {
      type: MemoryType;
      content: string;
      tags: string[];
      sourceDate: string;
      sourceFile: string;
      confidence: number;
    }
    
    
    // ============================================================
    // Nivel 3 - TodoWrite types
    // ============================================================
    
    export type TodoStatus = "pending" | "in_progress" | "done";
    
    export interface TodoItem {
      id: string;
      title: string;
      status: TodoStatus;
      createdAt: string;
      updatedAt: string;
    }
    
    export interface TodoList {
      todos: TodoItem[];
      total: number;
      pending: number;
      done: number;
    }
    
    // ============================================================
    // Nivel 3 - ToolSearch types
    // ============================================================
    
    export interface ToolIndexEntry {
      name: string;
      description: string;
      keywords: string[];
      category: string;
    }
    
    export interface ToolSearchResult {
      name: string;
      description: string;
      score: number;
      category: string;
    }
    
    // ============================================================
    // Nivel 3 - Permission types
    // ============================================================
    
    export type PermissionLevel = "read_only" | "file_write" | "network" | "shell" | "full";
    
    export interface PermissionCheck {
      allowed: boolean;
      reason?: string;
      requiresConfirmation?: boolean;
    }
    
    // ============================================================
    // Nivel 3 - WebSearch types
    // ============================================================
    
    export interface SearchResult {
      title: string;
      snippet: string;
      url: string;
      source: string;
    }
    
    // ============================================================
    // Nivel 3 - Scheduling types
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
    // Nivel 3 - Improved Reflection types
    // ============================================================
    
    export interface ImprovedReflectionResult {
      success: "yes" | "partial" | "no";
      complete: boolean;
      missingInfo: string[];
      retryDifferent: boolean;
      learning: string;
      confidence: number;           // 0-1 confidence score
      retryPrompt?: string;         // Sugestao de prompt modificado para retry
      alternativeApproach?: string; // Outra forma de resolver
      suggestedAgent?: string;      // Agente alternativo sugerido
    }
    