/**
     * long-term-memory.ts - Long-term Memory SOTA
     * 
     * Três sistemas:
     * 1. Episódica: sumários + embeddings (recuperação por similaridade)
     * 2. Semântica: grafo de conhecimento + índices vetoriais
     * 3. Procedural: snippets de planos bem-sucedidos
     */
    
    import {
      EpisodicMemory,
      SemanticMemory,
      ProceduralMemory,
      SimilarityResult,
    } from "./memory-sota-types";
    import { getEmbeddingService } from "./embedding-service";
    
    // ============================================================
    // Episodic Memory
    // ============================================================
    
    export class EpisodicMemoryStore {
      private memories: EpisodicMemory[] = [];
      private readonly MAX_MEMORIES = 1000;
    
      /** Adiciona uma memória episódica */
      add(summary: string, fullContent: string): string {
        const id = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const embService = getEmbeddingService();
        embService.addText(summary, "episodic", id);
    
        const memory: EpisodicMemory = {
          id,
          summary: summary.slice(0, 300),
          fullContent: fullContent.slice(0, 2000),
          embedding: [],
          timestamp: Date.now(),
          accessCount: 0,
          lastAccess: Date.now(),
        };
    
        this.memories.push(memory);
    
        // Prune if over limit
        if (this.memories.length > this.MAX_MEMORIES) {
          this.memories.sort((a, b) => a.lastAccess - b.lastAccess);
          this.memories = this.memories.slice(-this.MAX_MEMORIES);
        }
    
        return id;
      }
    
      /** Busca por similaridade semântica */
      search(query: string, topK: number = 5): SimilarityResult[] {
        const embService = getEmbeddingService();
        // Build if needed
        return embService.searchByText(query, topK);
      }
    
      /** Obtém o conteúdo completo de uma memória */
      get(id: string): EpisodicMemory | undefined {
        const memory = this.memories.find((m) => m.id === id);
        if (memory) {
          memory.accessCount++;
          memory.lastAccess = Date.now();
        }
        return memory;
      }
    
      /** Lista memórias por data (mais recentes primeiro) */
      getRecent(count: number = 10): EpisodicMemory[] {
        return [...this.memories]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, count);
      }
    
      get size(): number {
        return this.memories.length;
      }
    }
    
    // ============================================================
    // Semantic Memory (Knowledge Graph)
    // ============================================================
    
    export class SemanticMemoryStore {
      private facts: SemanticMemory[] = [];
    
      /** Adiciona um fato semântico (sujeito-predicado-objeto) */
      add(subject: string, predicate: string, object: string, confidence: number = 0.8): string {
        const id = `sem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const embService = getEmbeddingService();
        const factText = `${subject} ${predicate} ${object}`;
        embService.addText(factText, "semantic", id);
    
        const fact: SemanticMemory = {
          id,
          subject: subject.toLowerCase(),
          predicate: predicate.toLowerCase(),
          object,
          confidence: Math.min(1, Math.max(0, confidence)),
          embedding: [],
          timestamp: Date.now(),
        };
    
        // Deduplicate
        const existing = this.facts.findIndex(
          (f) => f.subject === fact.subject && f.predicate === fact.predicate && f.object === fact.object
        );
        if (existing >= 0) {
          this.facts[existing].confidence = Math.max(this.facts[existing].confidence, confidence);
          this.facts[existing].timestamp = Date.now();
          return this.facts[existing].id;
        }
    
        this.facts.push(fact);
        return id;
      }
    
      /** Busca fatos por sujeito */
      queryBySubject(subject: string): SemanticMemory[] {
        const lower = subject.toLowerCase();
        return this.facts.filter((f) => f.subject.includes(lower) || lower.includes(f.subject));
      }
    
      /** Busca por todos os sujeitos relacionados a um predicado */
      queryByPredicate(predicate: string): SemanticMemory[] {
        return this.facts.filter((f) => f.predicate.includes(predicate));
      }
    
      /** Busca semântica completa */
      search(query: string, topK: number = 5): SimilarityResult[] {
        const embService = getEmbeddingService();
        return embService.searchByText(query, topK);
      }
    
      /** Constrói grafo de conhecimento */
      buildGraph(): { nodes: Set<string>; edges: Map<string, Map<string, number>> } {
        const nodes = new Set<string>();
        const edges = new Map<string, Map<string, number>>();
    
        for (const fact of this.facts) {
          nodes.add(fact.subject);
          nodes.add(fact.object);
    
          if (!edges.has(fact.subject)) {
            edges.set(fact.subject, new Map());
          }
          const edgeMap = edges.get(fact.subject)!;
          edgeMap.set(fact.predicate + ":" + fact.object, fact.confidence);
        }
    
        return { nodes, edges };
      }
    
      get size(): number {
        return this.facts.length;
      }
    }
    
    // ============================================================
    // Procedural Memory
    // ============================================================
    
    export class ProceduralMemoryStore {
      private plans: ProceduralMemory[] = [];
    
      /** Adiciona um plano bem-sucedido */
      add(
        goal: string,
        plan: string[],
        success: boolean,
        outcome: string
      ): string {
        const id = `proc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const embService = getEmbeddingService();
        embService.addText(goal + " " + plan.join(" "), "procedural", id);
    
        const memory: ProceduralMemory = {
          id,
          goal,
          plan,
          steps: plan.length,
          success,
          outcome,
          timestamp: Date.now(),
        };
    
        this.plans.push(memory);
    
        // Keep only last 200 plans
        if (this.plans.length > 200) {
          this.plans = this.plans.slice(-200);
        }
    
        return id;
      }
    
      /** Busca planos similares a um objetivo */
      searchByGoal(goal: string, topK: number = 3): ProceduralMemory[] {
        const embService = getEmbeddingService();
        const results = embService.searchByText(goal, topK);
    
        return results
          .map((r) => this.plans.find((p) => p.id === r.id))
          .filter((p): p is ProceduralMemory => p !== undefined);
      }
    
      /** Obtém os planos mais bem-sucedidos */
      getBestPlans(limit: number = 5): ProceduralMemory[] {
        return [...this.plans]
          .filter((p) => p.success)
          .sort((a, b) => b.steps - a.steps)
          .slice(0, limit);
      }
    
      get size(): number {
        return this.plans.length;
      }
    }
    
    // ============================================================
    // Long-Term Memory Hub
    // ============================================================
    
    export class LongTermMemory {
      episodic: EpisodicMemoryStore;
      semantic: SemanticMemoryStore;
      procedural: ProceduralMemoryStore;
    
      constructor() {
        this.episodic = new EpisodicMemoryStore();
        this.semantic = new SemanticMemoryStore();
        this.procedural = new ProceduralMemoryStore();
      }
    
      /** Busca combinada em todos os tipos de memória */
      searchAll(query: string, topK: number = 5): {
        episodic: SimilarityResult[];
        semantic: SimilarityResult[];
        procedural: ProceduralMemory[];
      } {
        return {
          episodic: this.episodic.search(query, topK),
          semantic: this.semantic.search(query, topK),
          procedural: this.procedural.searchByGoal(query, topK),
        };
      }
    
      /** Importa memórias do sistema antigo (MEMORY.md) */
      importFromLegacy(markdownContent: string): number {
        let count = 0;
        const sections = markdownContent.split(/##\s+/);
    
        for (const section of sections) {
          const lines = section.split("\n").filter((l) => l.trim().startsWith("-"));
          const header = section.split("\n")[0].trim();
    
          for (const line of lines) {
            const content = line.replace(/^-\s*/, "").replace(/\[[^\]]+\]\s*/, "").trim();
            if (content.length > 5) {
              this.episodic.add(
                `[${header}] ${content.slice(0, 100)}`,
                content
              );
              count++;
            }
          }
        }
    
        return count;
      }
    }
    
    let instance: LongTermMemory | null = null;
    
    export function getLongTermMemory(): LongTermMemory {
      if (!instance) {
        instance = new LongTermMemory();
      }
      return instance;
    }
    
    export default LongTermMemory;
    