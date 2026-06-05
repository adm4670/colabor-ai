/**
     * focus-inducer.ts - Indução de Foco
     * 
     * Detecta perda de objetivo ou divagação e automaticamente:
     * - Injeta o plano raiz na working memory
     * - Limpa working memory de entradas não-relacionadas
     * - Retorna um alerta de foco
     */
    
    import { WorkingMemoryEntry, AttentionContext } from "./memory-sota-types";
    
    // ============================================================
    // Focus Detection
    // ============================================================
    
    interface FocusState {
      isOffTrack: boolean;
      confidence: number; // 0-1
      reason: string;
      suggestedAction: "inject_plan" | "clear_wm" | "none";
    }
    
    interface FocusInducerOptions {
      distractionThreshold: number; // 0-1
      minEntriesForAnalysis: number;
      planRequired: boolean;
    }
    
    const DEFAULT_OPTIONS: FocusInducerOptions = {
      distractionThreshold: 0.7,
      minEntriesForAnalysis: 5,
      planRequired: true,
    };
    
    // ============================================================
    // Heuristic detectors
    // ============================================================
    
    /** Detecta se o input atual está relacionado ao plano */
    function isInputRelatedToPlan(input: string, plan: string | null): boolean {
      if (!plan) return true; // No plan = can't be off-track
    
      const planWords = new Set(
        plan
          .toLowerCase()
          .replace(/[^a-z0-9áàâãéêíóôõúç\s]/gi, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );
    
      const inputWords = new Set(
        input
          .toLowerCase()
          .replace(/[^a-z0-9áàâãéêíóôõúç\s]/gi, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );
    
      if (planWords.size === 0) return true;
    
      let overlap = 0;
      for (const word of inputWords) {
        if (planWords.has(word)) overlap++;
      }
    
      return overlap / Math.max(inputWords.size, 1) > 0.15;
    }
    
    /** Detecta se o usuário está divagando (mudança brusca de tópico) */
    function isUserDigressing(
      recentEntries: WorkingMemoryEntry[],
      plan: string | null
    ): boolean {
      if (recentEntries.length < 3) return false;
    
      const userEntries = recentEntries
        .filter((e) => e.role === "user")
        .slice(-3);
    
      if (userEntries.length < 2) return false;
    
      // Extract topics from each user message
      const topicsSeries = userEntries.map((e) =>
        new Set(
          e.content
            .toLowerCase()
            .replace(/[^a-z0-9áàâãéêíóôõúç\s]/gi, " ")
            .split(/\s+/)
            .filter((w) => w.length > 3)
        )
      );
    
      // Check overlap between consecutive messages
      let totalOverlap = 0;
      let comparisons = 0;
    
      for (let i = 1; i < topicsSeries.length; i++) {
        const prev = topicsSeries[i - 1];
        const curr = topicsSeries[i];
    
        let overlap = 0;
        for (const word of curr) {
          if (prev.has(word)) overlap++;
        }
    
        const ratio = overlap / Math.max(curr.size, 1);
        totalOverlap += ratio;
        comparisons++;
      }
    
      const avgOverlap = comparisons > 0 ? totalOverlap / comparisons : 1;
    
      // Low overlap between consecutive messages = digression
      return avgOverlap < 0.2;
    }
    
    /** Detecta sinais de confusão */
    function detectConfusion(entries: WorkingMemoryEntry[]): boolean {
      const confusionSignals = [
        "não entendi",
        "não sei",
        "esqueci",
        "como assim",
        "repetir",
        "de novo",
        "qual era",
        "o que é",
        "não lembro",
        "perdi",
      ];
    
      const lastEntries = entries.slice(-3);
      for (const entry of lastEntries) {
        const lower = entry.content.toLowerCase();
        for (const signal of confusionSignals) {
          if (lower.includes(signal)) return true;
        }
      }
    
      return false;
    }
    
    // ============================================================
    // Focus Inducer
    // ============================================================
    
    export class FocusInducer {
      private options: FocusInducerOptions;
      private offTrackCount = 0;
      private totalChecks = 0;
    
      constructor(options: Partial<FocusInducerOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
      }
    
      /**
       * Analisa o estado atual e determina se há perda de foco
       */
      analyze(
        input: string,
        attentionContext: AttentionContext,
        entries: WorkingMemoryEntry[]
      ): FocusState {
        this.totalChecks++;
    
        if (entries.length < this.options.minEntriesForAnalysis) {
          return { isOffTrack: false, confidence: 0, reason: "Poucas entradas para análise", suggestedAction: "none" };
        }
    
        const plan = attentionContext.activePlan;
        const distractionLevel = attentionContext.distractionLevel;
        const isConfused = detectConfusion(entries);
        const isDigressing = isUserDigressing(entries, plan);
        const unrelatedToPlan = !isInputRelatedToPlan(input, plan);
    
        // Calculate overall off-track score
        let offTrackScore = 0;
        const reasons: string[] = [];
    
        // Factor 1: Distraction level from attention filter
        if (distractionLevel > this.options.distractionThreshold) {
          offTrackScore += 0.4;
          reasons.push("Alto nível de distração detectado");
        }
    
        // Factor 2: Input unrelated to plan
        if (unrelatedToPlan && plan) {
          offTrackScore += 0.3;
          reasons.push("Entrada não relacionada ao plano ativo");
        }
    
        // Factor 3: User digression
        if (isDigressing) {
          offTrackScore += 0.2;
          reasons.push("Usuário mudou de tópico");
        }
    
        // Factor 4: Confusion
        if (isConfused) {
          offTrackScore += 0.3;
          reasons.push("Sinais de confusão detectados");
        }
    
        // Factor 5: Low focus score
        if (attentionContext.focusScore < 0.3) {
          offTrackScore += 0.2;
          reasons.push("Score de foco muito baixo");
        }
    
        const isOffTrack = offTrackScore >= this.options.distractionThreshold;
    
        if (isOffTrack) {
          this.offTrackCount++;
        }
    
        // Determine action
        let suggestedAction: "inject_plan" | "clear_wm" | "none" = "none";
        if (isOffTrack) {
          if (plan && unrelatedToPlan) {
            suggestedAction = "inject_plan";
          } else if (isConfused || isDigressing) {
            suggestedAction = "clear_wm";
          }
        }
    
        return {
          isOffTrack,
          confidence: Math.min(1, offTrackScore),
          reason: reasons.join("; ") || "Dentro do foco",
          suggestedAction,
        };
      }
    
      /** Aplica a ação corretiva */
      applyCorrection(
        state: FocusState,
        activePlan: string | null,
        entries: WorkingMemoryEntry[]
      ): { correctedEntries: WorkingMemoryEntry[]; alert: string | null } {
        let alert: string | null = null;
    
        switch (state.suggestedAction) {
          case "inject_plan":
            if (activePlan) {
              // Add plan re-injection entry
              entries.push({
                id: `focus-plan-${Date.now()}`,
                content: `[FOCUS] Retomada de foco: ${activePlan}`,
                role: "system",
                timestamp: Date.now(),
                step: 0,
                importance: 1.0,
                isTrivial: false,
                tags: ["plan", "focus"],
              });
              alert = `[Foco] Retornando ao plano: ${activePlan.slice(0, 100)}`;
            }
            break;
    
          case "clear_wm":
            // Keep only high importance entries and last 2 messages
            const kept = entries.filter(
              (e) => e.importance >= 0.7 || e.role === "system" || e.tags.includes("plan")
            );
            const lastTwo = entries.slice(-2);
    
            const finalEntries = [...kept];
            for (const entry of lastTwo) {
              if (!finalEntries.some((e) => e.id === entry.id)) {
                finalEntries.push(entry);
              }
            }
    
            entries.length = 0;
            entries.push(...finalEntries);
    
            alert = "[Foco] Working memory limpa para reduzir distrações.";
            break;
    
          case "none":
            break;
        }
    
        return { correctedEntries: entries, alert };
      }
    
      /** Estatísticas de foco */
      getStats(): { totalChecks: number; offTrackCount: number; focusRate: number } {
        return {
          totalChecks: this.totalChecks,
          offTrackCount: this.offTrackCount,
          focusRate: this.totalChecks > 0
            ? (this.totalChecks - this.offTrackCount) / this.totalChecks
            : 1,
        };
      }
    }
    
    export function createFocusInducer(options?: Partial<FocusInducerOptions>): FocusInducer {
      return new FocusInducer(options);
    }
    