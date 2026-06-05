/**
     * memory-engine-sota.ts - Memory Engine SOTA
     * 
     * Implementa o fluxo completo de 10 passos:
     * 1. Recebe entrada
     * 2. Consulta working memory
     * 3. Busca long-term
     * 4. Atenção seletiva
     * 5. Chama LLM (callback)
     * 6. Extrai novas memórias
     * 7. Atualiza working memory
     * 8. Salva em long-term (se importância > limiar)
     * 9. Refresh periódico
     * 10. Esquecimento
     */
    
    import { WorkingMemoryEntry, SimilarityResult, AttentionContext } from "./memory-sota-types";
    import { WorkingMemory, createWorkingMemory } from "./working-memory";
    import { LongTermMemory, getLongTermMemory } from "./long-term-memory";
    import { EmbeddingService, getEmbeddingService } from "./embedding-service";
    import { AttentionFilter, createAttentionFilter } from "./attention-filter";
    import { RefreshForgetManager, createRefreshForgetManager } from "./refresh-forget";
    import { FocusInducer, createFocusInducer } from "./focus-inducer";
    import { KnowledgeGraphStore, createKnowledgeGraph } from "./knowledge-graph";
    
    // ============================================================
    // Constants
    // ============================================================
    
    const IMPORTANCE_THRESHOLD = 0.5; // Salva em long-term se > 0.5
    const CONFUSION_KEYWORDS = [
      "não entendi", "esqueci", "confuso", "perdi", "repetir",
      "como assim", "o que era", "não lembro",
    ];
    
    // ============================================================
    // LLM Callback type
    // ============================================================
    
    export type LLMCallback = (prompt: string) => Promise<string>;
    
    // ============================================================
    // Memory Engine SOTA
    // ============================================================
    
    export class MemoryEngineSOTA {
      workingMemory: WorkingMemory;
      longTermMemory: LongTermMemory;
      embeddingService: EmbeddingService;
      attentionFilter: AttentionFilter;
      refreshForget: RefreshForgetManager;
      focusInducer: FocusInducer;
      knowledgeGraph: KnowledgeGraphStore;
    
      private stepCount = 0;
      private llmCallback: LLMCallback | null = null;
    
      constructor(tokenBudget?: number) {
        this.workingMemory = createWorkingMemory(tokenBudget);
        this.longTermMemory = getLongTermMemory();
        this.embeddingService = getEmbeddingService();
        this.attentionFilter = createAttentionFilter();
        this.refreshForget = createRefreshForgetManager();
        this.focusInducer = createFocusInducer();
        this.knowledgeGraph = createKnowledgeGraph();
      }
    
      /** Define o callback LLM */
      setLLMCallback(callback: LLMCallback): void {
        this.llmCallback = callback;
      }
    
      /**
       * Processa uma entrada do usuário (fluxo completo de 10 passos)
       */
      async process(input: string, role: "user" | "system" = "user"): Promise<{
        response: string | null;
        attentionContext: AttentionContext;
        memoriesExtracted: number;
        focusAlert: string | null;
      }> {
        this.stepCount++;
        this.refreshForget.step();
    
        // === PASSO 1: Recebe entrada ===
        // (already done - input parameter)
    
        // === PASSO 2: Consulta working memory ===
        const wmState = this.workingMemory.getState();
        const activePlan = wmState.activePlan;
        const constraints = wmState.constraints;
    
        // === PASSO 3: Busca long-term memory ===
        // (done inside attention filter)
    
        // === PASSO 4: Atenção seletiva ===
        const attentionContext = this.attentionFilter.prepareContext(
          input,
          this.workingMemory.getEntries(),
          activePlan,
          constraints
        );
    
        // === PASSO 4.5: Indução de foco (antes do LLM) ===
        const focusState = this.focusInducer.analyze(
          input,
          attentionContext,
          this.workingMemory.getEntries()
        );
    
        let focusAlert: string | null = null;
        if (focusState.isOffTrack) {
          const correction = this.focusInducer.applyCorrection(
            focusState,
            activePlan,
            this.workingMemory.getEntries()
          );
          focusAlert = correction.alert;
    
          // Re-prepare context after correction
          if (focusState.suggestedAction !== "none") {
            // Refresh attention context after correction
            const freshContext = this.attentionFilter.prepareContext(
              input,
              this.workingMemory.getEntries(),
              activePlan,
              constraints
            );
            Object.assign(attentionContext, freshContext);
          }
        }
    
        // === PASSO 5: Chama LLM ===
        const prompt = this.attentionFilter.buildPrompt(attentionContext, input);
        let response: string | null = null;
    
        if (this.llmCallback) {
          response = await this.llmCallback(prompt);
        }
    
        // === PASSO 6: Extrai novas memórias ===
        const memoriesExtracted = this.extractMemories(input, response || "");
    
        // === PASSO 7: Atualiza working memory ===
        this.workingMemory.addEntry(input, role);
    
        if (response) {
          this.workingMemory.addEntry(response, "assistant");
        }
    
        // === PASSO 8: Salva em long-term (se importância > limiar) ===
        this.saveToLongTerm(input, role === "user" ? "user" : "system");
        if (response) {
          this.saveToLongTerm(response, "assistant");
        }
    
        // === PASSO 9: Refresh periódico ===
        const isConfused = CONFUSION_KEYWORDS.some((kw) =>
          input.toLowerCase().includes(kw)
        );
        if (this.refreshForget.needsRefresh(isConfused)) {
          const episodicMemories = this.longTermMemory.episodic.getRecent(100);
          const mappedMemories = episodicMemories.map((em) => ({
            ...em,
            accessCount: em.accessCount,
            timestamp: em.timestamp,
            lastAccess: em.lastAccess,
          }));
          this.refreshForget.refresh(mappedMemories);
        }
    
        // === PASSO 10: Esquecimento automático ===
        // (built into refresh)
    
        return {
          response,
          attentionContext,
          memoriesExtracted,
          focusAlert,
        };
      }
    
      /**
       * Extrai memórias de uma interação
       */
      private extractMemories(input: string, response: string): number {
        let count = 0;
        const combined = input + " " + response;
    
        // Extract decisions
        const decisionPattern = /(?:decidi|decidimos|vamos|escolh[^\s]*)\s+([^.!?]+)[.!?]/gi;
        for (const match of combined.matchAll(decisionPattern)) {
          const content = match[1].trim();
          if (content.length > 10) {
            this.longTermMemory.episodic.add(
              `Decisão: ${content.slice(0, 100)}`,
              content
            );
            count++;
          }
        }
    
        // Extract facts/learnings
        const factPattern = /(?:aprendi|descobri|importante|lembre\s+que|anote)\s+([^.!?]+)[.!?]/gi;
        for (const match of combined.matchAll(factPattern)) {
          const content = match[1].trim();
          if (content.length > 10) {
            this.longTermMemory.episodic.add(
              `Fato: ${content.slice(0, 100)}`,
              content
            );
            count++;
          }
        }
    
        // Extract preferences
        const prefPattern = /(?:prefiro|gosto\s+mais|prefere|melhor\s+|não\s+gosto)\s+([^.!?]+)[.!?]/gi;
        for (const match of combined.matchAll(prefPattern)) {
          const content = match[1].trim();
          if (content.length > 10) {
            this.longTermMemory.semantic.add(
              "usuário",
              "prefere",
              content,
              0.7
            );
            count++;
          }
        }
    
        return count;
      }
    
      /**
       * Salva conteúdo em long-term memory se for importante
       */
      private saveToLongTerm(content: string, source: string): void {
        // Simple importance heuristic based on length and keywords
        let importance = 0.3;
    
        if (content.length > 200) importance += 0.2;
        if (content.includes("importante")) importance += 0.3;
        if (content.includes("decidi") || content.includes("aprendi")) importance += 0.3;
        if (content.includes("prefiro") || content.includes("gosto")) importance += 0.2;
        if (content.includes("lembre")) importance += 0.3;
    
        if (importance >= IMPORTANCE_THRESHOLD) {
          const summary = content.slice(0, 200);
          this.longTermMemory.episodic.add(summary, content);
    
          // Also add to embedding service for semantic search
          this.embeddingService.addText(summary, source);
    
          // Add to knowledge graph if it contains structured info
          if (content.includes(" é ") || content.includes(" está ")) {
            const parts = content.split(/ é | está /);
            if (parts.length >= 2) {
              this.knowledgeGraph.addFact(
                parts[0].trim().slice(0, 50),
                content.includes(" é ") ? "é" : "está",
                parts[1].trim().slice(0, 50),
                importance
              );
            }
          }
        }
      }
    
      /** Obtém estatísticas completas do sistema de memória */
      getStats(): Record<string, unknown> {
        const focusStats = this.focusInducer.getStats();
        const refreshStats = this.refreshForget.getStats();
        const graphStats = this.knowledgeGraph.getStats();
    
        return {
          stepCount: this.stepCount,
          workingMemory: {
            entries: this.workingMemory.getEntries().length,
            tokens: this.workingMemory.getTokenCount(),
            budget: this.workingMemory.getTokenBudget(),
          },
          longTermMemory: {
            episodic: this.longTermMemory.episodic.size,
            semantic: this.longTermMemory.semantic.size,
            procedural: this.longTermMemory.procedural.size,
          },
          embeddings: this.embeddingService.size,
          knowledgeGraph: graphStats,
          focus: focusStats,
          refresh: refreshStats,
        };
      }
    
      /** Importa do sistema legado */
      importLegacy(memoryMdContent: string): number {
        return this.longTermMemory.importFromLegacy(memoryMdContent);
      }
    }
    
    // Singleton
    let instance: MemoryEngineSOTA | null = null;
    
    export function getMemoryEngineSOTA(): MemoryEngineSOTA {
      if (!instance) {
        instance = new MemoryEngineSOTA();
      }
      return instance;
    }
    
    export default MemoryEngineSOTA;
    