/**
     * memory-sota-types.ts - Tipos compartilhados para o sistema de memória SOTA
     */
    
    // ============================================================
    // Working Memory
    // ============================================================
    
    export interface WorkingMemoryEntry {
      id: string;
      content: string;
      role: "user" | "assistant" | "system" | "tool";
      timestamp: number;
      step: number;
      importance: number; // 0-1
      isTrivial: boolean;
      tags: string[];
    }
    
    export interface CompressedSummary {
      originalIds: string[];
      summary: string;
      compressedAt: number;
      compressionLevel: number; // 1, 2, 3 (hierarchical)
    }
    
    export interface WorkingMemoryState {
      entries: WorkingMemoryEntry[];
      compressedSummaries: CompressedSummary[];
      activePlan: string | null;
      constraints: string[];
      tokenBudget: number; // 8k-16k
      currentStep: number;
    }
    
    // ============================================================
    // Embeddings
    // ============================================================
    
    export interface EmbeddingVector {
      id: string;
      vector: number[];
      text: string;
      source: string;
      timestamp: number;
    }
    
    export interface SimilarityResult {
      id: string;
      text: string;
      score: number;
      source: string;
    }
    
    // ============================================================
    // Long-term Memory
    // ============================================================
    
    export type MemoryType = "episodic" | "semantic" | "procedural";
    
    export interface EpisodicMemory {
      id: string;
      summary: string;
      fullContent: string;
      embedding: number[];
      timestamp: number;
      accessCount: number;
      lastAccess: number;
    }
    
    export interface SemanticMemory {
      id: string;
      subject: string;
      predicate: string;
      object: string;
      confidence: number;
      embedding: number[];
      timestamp: number;
    }
    
    export interface ProceduralMemory {
      id: string;
      goal: string;
      plan: string[];
      steps: number;
      success: boolean;
      outcome: string;
      timestamp: number;
    }
    
    export interface KnowledgeGraph {
      nodes: Map<string, Set<string>>;
      edges: Map<string, Map<string, number>>;
    }
    
    // ============================================================
    // Attention & Focus
    // ============================================================
    
    export interface AttentionContext {
      workingMemory: WorkingMemoryEntry[];
      longTermMemories: SimilarityResult[];
      activePlan: string | null;
      focusScore: number; // 0-1
      distractionLevel: number; // 0-1
    }
    
    export interface RefreshRecord {
      step: number;
      timestamp: number;
      type: "periodic" | "confusion" | "error";
      memoriesRefreshed: number;
    }
    
    // ============================================================
    // Memory Engine State
    // ============================================================
    
    export interface MemoryEngineState {
      working: WorkingMemoryState;
      episodic: EpisodicMemory[];
      semantic: SemanticMemory[];
      procedural: ProceduralMemory[];
      graph: KnowledgeGraph;
      refreshHistory: RefreshRecord[];
      stepCount: number;
      lastRefreshStep: number;
    }
    