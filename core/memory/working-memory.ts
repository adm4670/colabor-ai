/**
     * working-memory.ts - Working Memory SOTA
     * 
     * - 8-16k token budget com FIFO
     * - Pruning seletivo (remove triviais, mantém plano ativo + restrições)
     * - Compressão hierárquica a cada 5 passos
     * - Token counting aproximado (1 token ≈ 4 chars)
     */
    
    import {
      WorkingMemoryEntry,
      WorkingMemoryState,
      CompressedSummary,
    } from "./memory-sota-types";
    
    // ============================================================
    // Constants
    // ============================================================
    
    const CHARS_PER_TOKEN = 4;
    const DEFAULT_TOKEN_BUDGET = 12_000; // 12k tokens (meio do range 8-16k)
    const COMPRESSION_INTERVAL = 5; // A cada 5 passos
    const MAX_COMPRESSION_LEVELS = 3;
    const TRIVIAL_THRESHOLD = 0.2; // Importância abaixo disso é trivial
    
    // ============================================================
    // Token counter
    // ============================================================
    
    function estimateTokens(text: string): number {
      return Math.ceil(text.length / CHARS_PER_TOKEN);
    }
    
    function estimateTokensForEntries(entries: WorkingMemoryEntry[]): number {
      return entries.reduce((sum, e) => sum + estimateTokens(e.content), 0);
    }
    
    // ============================================================
    // Importance scoring (heuristic)
    // ============================================================
    
    const IMPORTANCE_KEYWORDS: Record<string, number> = {
      // Plan/Goal related
      "plano": 0.9,
      "objetivo": 0.9,
      "meta": 0.9,
      "missão": 0.9,
      "tarefa": 0.8,
      "passo": 0.7,
      "etapa": 0.7,
      // Decision related
      "decidi": 0.8,
      "decidimos": 0.8,
      "escolha": 0.7,
      // Constraint related
      "restrição": 0.9,
      "limite": 0.8,
      "não pode": 0.7,
      "evitar": 0.7,
      // Memory/learn related
      "lembre": 0.9,
      "anote": 0.9,
      "aprendi": 0.8,
      "importante": 0.8,
      "grave": 0.8,
      // User preference
      "prefiro": 0.7,
      "gosto": 0.6,
      // Negative signals (trivial)
      "ok": 0.1,
      "tudo bem": 0.1,
      "sim": 0.1,
      "não": 0.1,
      "talvez": 0.2,
    };
    
    function scoreImportance(text: string): number {
      const lower = text.toLowerCase();
      let maxScore = 0.3; // base score
    
      for (const [keyword, score] of Object.entries(IMPORTANCE_KEYWORDS)) {
        if (lower.includes(keyword)) {
          maxScore = Math.max(maxScore, score);
        }
      }
    
      // Longer messages tend to be more important
      if (text.length > 200) maxScore += 0.1;
      if (text.length > 500) maxScore += 0.1;
    
      // Messages with code blocks tend to be important
      if (text.includes("```")) maxScore += 0.15;
    
      return Math.min(maxScore, 1.0);
    }
    
    function isTrivial(text: string): boolean {
      return scoreImportance(text) < TRIVIAL_THRESHOLD;
    }
    
    // ============================================================
    // Working Memory Class
    // ============================================================
    
    export class WorkingMemory {
      private state: WorkingMemoryState;
      private entryCounter = 0;
    
      constructor(tokenBudget: number = DEFAULT_TOKEN_BUDGET) {
        this.state = {
          entries: [],
          compressedSummaries: [],
          activePlan: null,
          constraints: [],
          tokenBudget,
          currentStep: 0,
        };
      }
    
      // --- Public API ---
    
      getState(): WorkingMemoryState {
        return this.state;
      }
    
      getEntries(): WorkingMemoryEntry[] {
        return this.state.entries;
      }
    
      getTokenCount(): number {
        return estimateTokensForEntries(this.state.entries);
      }
    
      getTokenBudget(): number {
        return this.state.tokenBudget;
      }
    
      setActivePlan(plan: string): void {
        this.state.activePlan = plan;
      }
    
      addConstraint(constraint: string): void {
        if (!this.state.constraints.includes(constraint)) {
          this.state.constraints.push(constraint);
        }
      }
    
      /** Adiciona uma entrada com pruning automático */
      addEntry(
        content: string,
        role: "user" | "assistant" | "system" | "tool",
        tags: string[] = []
      ): WorkingMemoryEntry {
        this.state.currentStep++;
    
        const entry: WorkingMemoryEntry = {
          id: `wm-${this.state.currentStep}-${this.entryCounter++}`,
          content,
          role,
          timestamp: Date.now(),
          step: this.state.currentStep,
          importance: scoreImportance(content),
          isTrivial: isTrivial(content),
          tags,
        };
    
        this.state.entries.push(entry);
    
        // Apply pruning if over budget
        this.pruneToBudget();
    
        // Hierarchical compression check
        if (this.state.currentStep % COMPRESSION_INTERVAL === 0) {
          this.compressOldest();
        }
    
        return entry;
      }
    
      /** Remove o plano ativo da working memory (usado pelo Focus Inducer) */
      clearWorkingMemory(): void {
        // Keep only active plan and constraints
        const planContent = this.state.activePlan;
        const constraints = [...this.state.constraints];
    
        this.state.entries = this.state.entries.filter(
          (e) => e.importance >= 0.7 || e.role === "system"
        );
    
        // Re-add plan if it was there
        if (planContent && !this.state.entries.some((e) => e.content === planContent)) {
          this.addEntry(planContent, "system", ["plan"]);
        }
      }
    
      /** Retorna contexto formatado para o LLM */
      getContextForLLM(maxTokens?: number): string {
        const budget = maxTokens || this.state.tokenBudget;
        let context = "";
    
        // 1. Active plan (always first)
        if (this.state.activePlan) {
          context += `[Plano Ativo]: ${this.state.activePlan}\n`;
        }
    
        // 2. Constraints
        if (this.state.constraints.length > 0) {
          context += `[Restrições]: ${this.state.constraints.join("; ")}\n`;
        }
    
        // 3. Compressed summaries (recent context)
        const recentSummaries = this.state.compressedSummaries.slice(-3);
        for (const summary of recentSummaries) {
          context += `[Resumo]: ${summary.summary}\n`;
        }
    
        // 4. Recent entries (trim to budget)
        const headerTokens = estimateTokens(context);
        const remainingBudget = budget - headerTokens;
        let entryTokens = 0;
    
        // Take from most recent first
        const reversedEntries = [...this.state.entries].reverse();
        const includedEntries: WorkingMemoryEntry[] = [];
    
        for (const entry of reversedEntries) {
          const entryTokens_needed = estimateTokens(entry.content) + 20; // overhead
          if (entryTokens + entryTokens_needed <= remainingBudget) {
            includedEntries.push(entry);
            entryTokens += entryTokens_needed;
          } else {
            break;
          }
        }
    
        // Re-reverse to chronological order
        includedEntries.reverse();
    
        for (const entry of includedEntries) {
          const prefix = entry.role === "user" ? "Usuário" : entry.role === "assistant" ? "Assistente" : "Sistema";
          context += `[${prefix}]: ${entry.content}\n`;
        }
    
        return context;
      }
    
      // --- Private ---
    
      private pruneToBudget(): void {
        const currentTokens = this.getTokenCount();
        if (currentTokens <= this.state.tokenBudget) return;
    
        // Sort by importance (ascending), then by age (oldest first)
        const sorted = [...this.state.entries]
          .map((e, i) => ({ entry: e, index: i }))
          .sort((a, b) => {
            // First: keep non-trivial high-importance items
            const aScore = a.entry.importance;
            const bScore = b.entry.importance;
            if (aScore !== bScore) return aScore - bScore;
            // Then: prefer newest
            return a.entry.timestamp - b.entry.timestamp;
          });
    
        // Remove from lowest importance until under budget
        const toRemove = new Set<number>();
        let tokensAfterRemoval = currentTokens;
    
        for (const { entry, index } of sorted) {
          if (tokensAfterRemoval <= this.state.tokenBudget) break;
          // Never remove plan-related entries
          if (entry.importance >= 0.8) continue;
          // Never remove system messages with constraints
          if (entry.role === "system" && entry.importance >= 0.7) continue;
    
          toRemove.add(index);
          tokensAfterRemoval -= estimateTokens(entry.content);
        }
    
        this.state.entries = this.state.entries.filter(
          (_, i) => !toRemove.has(i)
        );
      }
    
      private compressOldest(): void {
        const entries = this.state.entries;
        if (entries.length < 4) return;
    
        // Take oldest 50% of entries (but at most 10)
        const compressCount = Math.min(Math.floor(entries.length * 0.4), 10);
        if (compressCount < 3) return;
    
        const toCompress = entries.slice(0, compressCount);
        const ids = toCompress.map((e) => e.id);
    
        // Create a summary string (heuristic, not LLM-based for performance)
        const userParts = toCompress
          .filter((e) => e.role === "user")
          .map((e) => e.content.slice(0, 100));
        const assistantParts = toCompress
          .filter((e) => e.role === "assistant")
          .map((e) => e.content.slice(0, 100));
        const highImpParts = toCompress
          .filter((e) => e.importance >= 0.6)
          .map((e) => e.content.slice(0, 150));
    
        let summary = `[${compressCount} msgs]: `;
        if (userParts.length > 0) summary += `Usuário: ${userParts.slice(0, 3).join("; ")}. `;
        if (assistantParts.length > 0) summary += `Assistente: ${assistantParts.slice(0, 3).join("; ")}. `;
        if (highImpParts.length > 0) summary += `Pontos-chave: ${highImpParts.slice(0, 2).join("; ")}.`;
    
        if (summary.length > 800) summary = summary.slice(0, 800) + "...";
    
        const compressed: CompressedSummary = {
          originalIds: ids,
          summary,
          compressedAt: Date.now(),
          compressionLevel: 1,
        };
    
        this.state.compressedSummaries.push(compressed);
    
        // Remove the compressed entries, but keep last one for continuity
        const keepLast = toCompress[toCompress.length - 1];
        this.state.entries = this.state.entries.filter(
          (e) => !ids.includes(e.id) || e.id === keepLast.id
        );
      }
    }
    
    export function createWorkingMemory(tokenBudget?: number): WorkingMemory {
      return new WorkingMemory(tokenBudget);
    }
    