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
    