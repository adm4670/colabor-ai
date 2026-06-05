/**
     * attention-filter.ts - Atenção Seletiva
     * 
     * Antes de cada chamada LLM:
     * 1. Filtra working memory (remove triviais, prioriza plano + restrições)
     * 2. Busca top-K (3-5) na long-term memory via similaridade
     * 3. Monta contexto atencional otimizado
     */
    
    import { WorkingMemoryEntry, SimilarityResult, AttentionContext } from "./memory-sota-types";
    import { getLongTermMemory } from "./long-term-memory";
    
    interface AttentionOptions {
      workingMemoryMaxTokens: number;
      longTermTopK: number;
      includeEpisodic: boolean;
      includeSemantic: boolean;
      includeProcedural: boolean;
    }
    
    const DEFAULT_OPTIONS: AttentionOptions = {
      workingMemoryMaxTokens: 4000,
      longTermTopK: 5,
      includeEpisodic: true,
      includeSemantic: true,
      includeProcedural: true,
    };
    
    // ============================================================
    // Working Memory Filter
    // ============================================================
    
    function filterWorkingMemory(
      entries: WorkingMemoryEntry[],
      activePlan: string | null,
      constraints: string[],
      maxTokens: number
    ): WorkingMemoryEntry[] {
      const CHARS_PER_TOKEN = 4;
      const maxChars = maxTokens * CHARS_PER_TOKEN;
    
      // Always keep plan and constraints
      const mustKeep: WorkingMemoryEntry[] = [];
      let planChars = 0;
    
      if (activePlan) {
        mustKeep.push({
          id: "__plan__",
          content: `[Plano Ativo]: ${activePlan}`,
          role: "system",
          timestamp: Date.now(),
          step: 0,
          importance: 1.0,
          isTrivial: false,
          tags: ["plan"],
        });
        planChars += activePlan.length;
      }
    
      if (constraints.length > 0) {
        mustKeep.push({
          id: "__constraints__",
          content: `[Restrições]: ${constraints.join("; ")}`,
          role: "system",
          timestamp: Date.now(),
          step: 0,
          importance: 0.95,
          isTrivial: false,
          tags: ["constraints"],
        });
        planChars += constraints.join("; ").length;
      }
    
      // Sort remaining by importance (desc), take from recent
      const candidateEntries = entries
        .filter((e) => e.importance >= 0.3) // Remove very trivial
        .sort((a, b) => {
          // Priority: importance, then recency
          if (Math.abs(a.importance - b.importance) > 0.2) {
            return b.importance - a.importance;
          }
          return b.timestamp - a.timestamp;
        });
    
      // Fill remaining budget
      const remaining = maxChars - planChars;
      let used = 0;
      const selected: WorkingMemoryEntry[] = [...mustKeep];
    
      for (const entry of candidateEntries) {
        const entryChars = entry.content.length + 20; // overhead
        if (used + entryChars <= remaining) {
          selected.push(entry);
          used += entryChars;
        } else {
          break;
        }
      }
    
      // Sort back to chronological order
      return selected.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // ============================================================
    // Attention Filter
    // ============================================================
    
    export class AttentionFilter {
      private options: AttentionOptions;
    
      constructor(options: Partial<AttentionOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
      }
    
      /**
       * Prepara o contexto atencional para o LLM
       * Fluxo: entrada → working memory → busca long-term → montagem
       */
      prepareContext(
        input: string,
        workingEntries: WorkingMemoryEntry[],
        activePlan: string | null,
        constraints: string[]
      ): AttentionContext {
        // 1. Filter working memory
        const filteredWM = filterWorkingMemory(
          workingEntries,
          activePlan,
          constraints,
          this.options.workingMemoryMaxTokens
        );
    
        // 2. Search long-term memory
        const ltm = getLongTermMemory();
        let longTermMemories: SimilarityResult[] = [];
    
        if (this.options.includeEpisodic || this.options.includeSemantic) {
          const searchQuery = [
            input,
            activePlan || "",
            ...constraints,
            ...workingEntries.slice(-3).map((e) => e.content),
          ]
            .filter(Boolean)
            .join(" ")
            .slice(0, 500);
    
          const allResults = ltm.searchAll(searchQuery, this.options.longTermTopK);
    
          if (this.options.includeEpisodic) {
            longTermMemories.push(...allResults.episodic);
          }
          if (this.options.includeSemantic) {
            longTermMemories.push(...allResults.semantic);
          }
          if (this.options.includeProcedural) {
            // Add procedural as text
            for (const proc of allResults.procedural) {
              longTermMemories.push({
                id: proc.id,
                text: `[Plano] ${proc.goal}: ${proc.plan.join(" → ")}`,
                score: 0.7,
                source: "procedural",
              });
            }
          }
    
          // Deduplicate and sort
          const seen = new Set<string>();
          longTermMemories = longTermMemories
            .filter((m) => {
              const key = m.text.slice(0, 50);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, this.options.longTermTopK);
        }
    
        // 3. Calculate focus score
        // Heuristic: ratio of high-importance entries vs total
        const highImpCount = workingEntries.filter((e) => e.importance >= 0.6).length;
        const totalCount = workingEntries.length || 1;
        const focusScore = Math.min(1, highImpCount / Math.max(totalCount * 0.3, 1));
    
        // Detection of distraction: sudden shift in topics
        const distractionLevel = detectDistraction(input, workingEntries);
    
        return {
          workingMemory: filteredWM,
          longTermMemories,
          activePlan,
          focusScore,
          distractionLevel,
        };
      }
    
      /** Monta o prompt final para o LLM */
      buildPrompt(context: AttentionContext, userInput: string): string {
        let prompt = "";
    
        // 1. Active plan
        if (context.activePlan) {
          prompt += "## Plano Ativo\n" + context.activePlan + "\n\n";
        }
    
        // 2. Constraints
        const constraints = context.workingMemory
          .filter((e) => e.tags.includes("constraints"))
          .map((e) => e.content);
        if (constraints.length > 0) {
          prompt += "## Restricoes\n" + constraints.join("\n") + "\n\n";
        }
    
        // 3. Long-term context (only if relevant, top-3)
        if (context.longTermMemories.length > 0) {
          prompt += "## Contexto da Memoria de Longo Prazo\n";
          for (const mem of context.longTermMemories.slice(0, 3)) {
            const scorePct = (mem.score * 100).toFixed(0);
            prompt += "- [" + scorePct + "%] " + mem.text.slice(0, 300) + "\n";
          }
          prompt += "\n";
        }
    
        // 4. Recent conversation (from working memory)
        const conversationEntries = context.workingMemory.filter(
          (e) => e.role !== "system" || e.importance < 0.8
        );
        if (conversationEntries.length > 0) {
          prompt += "## Conversa Recente\n";
          for (const entry of conversationEntries.slice(-10)) {
            const role = entry.role === "user" ? "Usuario" : "Assistente";
            prompt += role + ": " + entry.content + "\n";
          }
          prompt += "\n";
        }
    
        // 5. Focus warning
        if (context.distractionLevel > 0.6) {
          prompt += "[ATENCAO] Possivel perda de foco detectada. Retorne ao plano ativo.\n\n";
        }
    
        // 6. User input
        prompt += "## Entrada do Usuario\n" + userInput + "\n";
    
        return prompt;
      }
      }

    // ============================================================
    // Distraction Detection (heuristic)
    // ============================================================
    
    function detectDistraction(input: string, recentEntries: WorkingMemoryEntry[]): number {
      if (recentEntries.length < 3) return 0;
    
      // Get topics from recent entries
      const recentTopics = recentEntries
        .slice(-5)
        .map((e) => extractTopics(e.content));
    
      const inputTopics = extractTopics(input);
    
      if (recentTopics.length === 0 || inputTopics.length === 0) return 0;
    
      // Check topic overlap
      const allRecentWords = new Set(recentTopics.flat());
      const inputWordSet = new Set(inputTopics);
    
      let overlap = 0;
      for (const word of inputWordSet) {
        if (allRecentWords.has(word)) overlap++;
      }
    
      const overlapRatio = overlap / Math.max(inputWordSet.size, 1);
    
      // Low overlap = possible distraction
      return Math.max(0, 1 - overlapRatio * 2);
    }
    
    function extractTopics(text: string): string[] {
      const STOP_WORDS = new Set([
        "que", "para", "com", "uma", "por", "como", "mais", "mas",
        "foi", "tem", "ser", "ter", "seu", "sua", "isso", "ele",
      ]);
    
      return text
        .toLowerCase()
        .replace(/[^a-z0-9áàâãéêíóôõúç\s]/gi, " ")
        .split(/\s+/)
        .filter((t) => t.length > 3 && !STOP_WORDS.has(t))
        .slice(0, 10);
    }
    
    export function createAttentionFilter(options?: Partial<AttentionOptions>): AttentionFilter {
      return new AttentionFilter(options);
    }
    