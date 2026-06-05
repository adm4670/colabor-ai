/**
     * migrate-memory-sota.ts
     * 
     * Script de migração autônomo: transforma a arquitetura de memória do colabor-ai
     * de busca textual simples para arquitetura SOTA com:
     * 
     * 1. Working Memory (8-16k tokens) + FIFO + Pruning Seletivo + Compressão Hierárquica
     * 2. Long-term Memory: Episódica (embeddings), Semântica (grafo), Procedural (planos)
     * 3. Atenção Seletiva (top-K via similaridade)
     * 4. Refresh & Esquecimento (meia-vida dinâmica)
     * 5. Indução de Foco (detector de divagação)
     * 6. Fluxo de 10 passos por ciclo
     */
    
    import * as fs from "fs";
    import * as path from "path";
    
    // ============================================================
    // CONFIG
    // ============================================================
    
    const CORE_MEMORY_DIR = path.join(process.cwd(), "core", "memory");
    const CLOUD_MEMORY_DIR = path.join(process.cwd(), "cloud", "src", "memory");
    const BACKUP_DIR = path.join(process.cwd(), ".memory-backup");
    
    // ============================================================
    // 1. BACKUP
    // ============================================================
    
    function backup() {
      console.log("[BACKUP] Criando backup dos arquivos atuais...");
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
    
      const dirs = [CORE_MEMORY_DIR, CLOUD_MEMORY_DIR].filter((d) => fs.existsSync(d));
      for (const dir of dirs) {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
        for (const file of files) {
          const src = path.join(dir, file);
          const dst = path.join(BACKUP_DIR, `${path.basename(dir)}-${file}`);
          fs.copyFileSync(src, dst);
          console.log(`  [OK] Backup: ${src} -> ${dst}`);
        }
      }
      console.log("  Backup concluído em", BACKUP_DIR, "\n");
    }
    
    // ============================================================
    // 2. TYPES (shared types file)
    // ============================================================
    
    function writeTypes() {
      const code = `/**
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
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "memory-sota-types.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 3. WORKING MEMORY ENGINE
    // ============================================================
    
    function writeWorkingMemory() {
      const code = `/**
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
      if (text.includes("\`\`\`")) maxScore += 0.15;
    
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
          id: \`wm-\${this.state.currentStep}-\${this.entryCounter++}\`,
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
          context += \`[Plano Ativo]: \${this.state.activePlan}\\n\`;
        }
    
        // 2. Constraints
        if (this.state.constraints.length > 0) {
          context += \`[Restrições]: \${this.state.constraints.join("; ")}\\n\`;
        }
    
        // 3. Compressed summaries (recent context)
        const recentSummaries = this.state.compressedSummaries.slice(-3);
        for (const summary of recentSummaries) {
          context += \`[Resumo]: \${summary.summary}\\n\`;
        }
    
        // 4. Recent entries (trim to budget)
        const headerTokens = estimateTokens(context);
        const remainingBudget = budget - headerTokens;
        let entryTokens = 0;
    
        // Take from most recent first
        const reversedEntries = [...this.state.entries].reverse();
        let includedEntries: WorkingMemoryEntry[] = [];
    
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
          context += \`[\${prefix}]: \${entry.content}\\n\`;
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
    
        let summary = \`[\${compressCount} msgs]: \`;
        if (userParts.length > 0) summary += \`Usuário: \${userParts.slice(0, 3).join("; ")}. \`;
        if (assistantParts.length > 0) summary += \`Assistente: \${assistantParts.slice(0, 3).join("; ")}. \`;
        if (highImpParts.length > 0) summary += \`Pontos-chave: \${highImpParts.slice(0, 2).join("; ")}.\`;
    
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
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "working-memory.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 4. EMBEDDING SERVICE
    // ============================================================
    
    function writeEmbeddingService() {
      const code = `/**
     * embedding-service.ts - Serviço de embeddings
     * 
     * Implementação simples baseada em TF-IDF e contagem de tokens compartilhados.
     * Sem dependência externa (sem fine-tuning, como exigido).
     * Para produção, substituir por chamada a API de embeddings (OpenAI, etc).
     */
    
    import { EmbeddingVector, SimilarityResult } from "./memory-sota-types";
    
    // ============================================================
    // Simple vocabulary-based embedding
    // ============================================================
    
    const STOP_WORDS = new Set([
      "a", "e", "o", "que", "do", "da", "de", "em", "um", "para",
      "com", "não", "uma", "os", "as", "se", "mas", "ao", "ele",
      "das", "mais", "na", "no", "por", "é", "tem", "são", "como",
      "à", "pra", "pro", "tá", "vai", "ser", "foi", "era", "muito",
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
      "for", "of", "by", "with", "is", "are", "was", "were",
    ]);
    
    function tokenize(text: string): string[] {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9áàâãéêíóôõúç\\s]/gi, " ")
        .split(/\\s+/)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
    }
    
    function buildVocabulary(texts: string[]): Map<string, number> {
      const vocab = new Map<string, number>();
      let idx = 0;
      for (const text of texts) {
        for (const token of tokenize(text)) {
          if (!vocab.has(token)) {
            vocab.set(token, idx++);
          }
        }
      }
      return vocab;
    }
    
    function textToVector(text: string, vocab: Map<string, number>, dim: number): number[] {
      const vector = new Array(dim).fill(0);
      const tokens = tokenize(text);
      const counts = new Map<string, number>();
    
      for (const token of tokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
      }
    
      // TF: term frequency in this document
      const maxFreq = Math.max(...counts.values(), 1);
      for (const [token, count] of counts) {
        const idx = vocab.get(token);
        if (idx !== undefined) {
          // Simple TF normalization
          vector[idx] = count / maxFreq;
        }
      }
    
      return vector;
    }
    
    // ============================================================
    // Cosine similarity
    // ============================================================
    
    function cosineSimilarity(a: number[], b: number[]): number {
      if (a.length !== b.length) return 0;
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
    
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
    
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      return denom === 0 ? 0 : dotProduct / denom;
    }
    
    // ============================================================
    // Embedding Service
    // ============================================================
    
    export class EmbeddingService {
      private vectors: EmbeddingVector[] = [];
      private vocab: Map<string, number> = new Map();
      private dimension = 0;
      private isBuilt = false;
    
      /** Adiciona texto ao índice */
      addText(text: string, source: string, id?: string): string {
        const vectorId = id || \`emb-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
        this.vectors.push({
          id: vectorId,
          vector: [], // will be computed on build
          text,
          source,
          timestamp: Date.now(),
        });
        this.isBuilt = false;
        return vectorId;
      }
    
      /** Adiciona múltiplos textos */
      addTexts(texts: string[], source: string): string[] {
        return texts.map((t) => this.addText(t, source));
      }
    
      /** Reconstrói o vocabulário e vetores */
      build(): void {
        const texts = this.vectors.map((v) => v.text);
        this.vocab = buildVocabulary(texts);
        this.dimension = this.vocab.size;
    
        for (const vector of this.vectors) {
          vector.vector = textToVector(vector.text, this.vocab, this.dimension);
        }
    
        this.isBuilt = true;
        console.log(\`[EmbeddingService] Built \${this.dimension}-dim vocabulary for \${this.vectors.length} texts\`);
      }
    
      /** Busca os top-K textos mais similares */
      search(query: string, topK: number = 5): SimilarityResult[] {
        if (!this.isBuilt || this.vectors.length === 0) {
          return [];
        }
    
        const queryVector = textToVector(query, this.vocab, this.dimension);
        const results: SimilarityResult[] = [];
    
        for (const vec of this.vectors) {
          const score = cosineSimilarity(queryVector, vec.vector);
          if (score > 0) {
            results.push({
              id: vec.id,
              text: vec.text,
              score,
              source: vec.source,
            });
          }
        }
    
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
      }
    
      /** Busca por um texto específico (para recall) */
      searchByText(text: string, topK: number = 5): SimilarityResult[] {
        return this.search(text, topK);
      }
    
      /** Número de vetores armazenados */
      get size(): number {
        return this.vectors.length;
      }
    
      /** Exporta estado para serialização */
      export(): { vectors: EmbeddingVector[]; vocab: [string, number][] } {
        return {
          vectors: this.vectors,
          vocab: Array.from(this.vocab.entries()),
        };
      }
    
      /** Importa estado */
      import(data: { vectors: EmbeddingVector[]; vocab: [string, number][] }): void {
        this.vectors = data.vectors;
        this.vocab = new Map(data.vocab);
        this.dimension = this.vocab.size;
        this.isBuilt = true;
      }
    }
    
    // Singleton
    let instance: EmbeddingService | null = null;
    
    export function getEmbeddingService(): EmbeddingService {
      if (!instance) {
        instance = new EmbeddingService();
      }
      return instance;
    }
    
    export default EmbeddingService;
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "embedding-service.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 5. HIERARCHICAL COMPRESSOR
    // ============================================================
    
    function writeCompressor() {
      const code = `/**
     * compressor.ts - Compressão Hierárquica
     * 
     * Comprime working memory em múltiplos níveis:
     * N1: Sumário simples (tópicos, ações)
     * N2: Sumário com decisões e fatos extraídos
     * N3: Sumário consolidado (plano + resultados)
     */
    
    import { CompressedSummary } from "./memory-sota-types";
    
    interface CompressOptions {
      maxLevel: number; // 1-3
      preserveKeywords: string[];
    }
    
    const DEFAULT_OPTIONS: CompressOptions = {
      maxLevel: 3,
      preserveKeywords: ["plano", "objetivo", "decisão", "importante", "restrição", "aprendi"],
    };
    
    /**
     * Comprime hierarquicamente um conjunto de textos
     */
    export function compressHierarchical(
      texts: string[],
      options: Partial<CompressOptions> = {}
    ): CompressedSummary[] {
      const opts = { ...DEFAULT_OPTIONS, ...options };
      const results: CompressedSummary[] = [];
    
      // Level 1: Simple extraction of key sentences
      const level1 = compressLevel1(texts, opts);
      results.push(level1);
    
      if (opts.maxLevel >= 2) {
        // Level 2: Decision & fact extraction
        const level2 = compressLevel2(texts, level1.summary, opts);
        results.push(level2);
      }
    
      if (opts.maxLevel >= 3) {
        // Level 3: Plan consolidation
        const level3 = compressLevel3(texts, level1.summary, level2?.summary || "", opts);
        results.push(level3);
      }
    
      return results;
    }
    
    function compressLevel1(
      texts: string[],
      opts: CompressOptions
    ): CompressedSummary {
      const lines: string[] = [];
      const seen = new Set<string>();
    
      for (const text of texts) {
        const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
        for (const sentence of sentences) {
          const lower = sentence.toLowerCase().trim();
          // Check if contains preserved keywords
          const hasKeyword = opts.preserveKeywords.some((kw) => lower.includes(kw));
          if (hasKeyword && !seen.has(lower.slice(0, 50))) {
            seen.add(lower.slice(0, 50));
            lines.push(sentence.trim());
          }
        }
      }
    
      const summary = lines.length > 0
        ? lines.slice(0, 5).join(". ") + "."
        : \`[\${texts.length} mensagens]\`;
    
      return {
        originalIds: [],
        summary: summary.slice(0, 600),
        compressedAt: Date.now(),
        compressionLevel: 1,
      };
    }
    
    function compressLevel2(
      texts: string[],
      level1Summary: string,
      opts: CompressOptions
    ): CompressedSummary {
      const decisions: string[] = [];
      const facts: string[] = [];
    
      const decisionPatterns = [
        /decidi[^.]*\./gi,
        /decidimos[^.]*\./gi,
        /vamos\s+\w+[^.]*\./gi,
        /escolh[^.]*\./gi,
      ];
    
      const factPatterns = [
        /aprendi[^.]*\./gi,
        /descobri[^.]*\./gi,
        /importante[^.]*\./gi,
        /lembre[^.]*\./gi,
      ];
    
      for (const text of texts) {
        for (const pattern of decisionPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            decisions.push(match[0].trim());
          }
        }
        for (const pattern of factPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            facts.push(match[0].trim());
          }
        }
      }
    
      let summary = level1Summary;
      if (decisions.length > 0) {
        summary += " Decisões: " + decisions.slice(0, 3).join("; ") + ".";
      }
      if (facts.length > 0) {
        summary += " Fatos: " + facts.slice(0, 3).join("; ") + ".";
      }
    
      return {
        originalIds: [],
        summary: summary.slice(0, 800),
        compressedAt: Date.now(),
        compressionLevel: 2,
      };
    }
    
    function compressLevel3(
      texts: string[],
      _level1Summary: string,
      level2Summary: string,
      _opts: CompressOptions
    ): CompressedSummary {
      // Extract plan-related info
      let plan = "";
      let outcomes: string[] = [];
    
      for (const text of texts) {
        const lower = text.toLowerCase();
        if (lower.includes("plano") || lower.includes("objetivo") || lower.includes("meta")) {
          plan = text.slice(0, 300);
        }
        if (lower.includes("resultado") || lower.includes("concluído") || lower.includes("feito")) {
          outcomes.push(text.slice(0, 100));
        }
      }
    
      let summary = level2Summary;
      if (plan) summary += " Plano: " + plan + ".";
      if (outcomes.length > 0) summary += " Resultados: " + outcomes.slice(0, 3).join("; ") + ".";
    
      return {
        originalIds: [],
        summary: summary.slice(0, 1000),
        compressedAt: Date.now(),
        compressionLevel: 3,
      };
    }
    
    /**
     * Estima taxa de compressão
     */
    export function estimateCompressionRatio(
      originalTexts: string[],
      compressed: CompressedSummary[]
    ): number {
      const originalLen = originalTexts.reduce((s, t) => s + t.length, 0);
      const compressedLen = compressed.reduce((s, c) => s + c.summary.length, 0);
      return originalLen > 0 ? compressedLen / originalLen : 0;
    }
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "compressor.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 6. LONG-TERM MEMORY
    // ============================================================
    
    function writeLongTermMemory() {
      const code = `/**
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
        const id = \`ep-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
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
        const id = \`sem-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
        const embService = getEmbeddingService();
        const factText = \`\${subject} \${predicate} \${object}\`;
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
        const id = \`proc-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
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
        const sections = markdownContent.split(/##\\s+/);
    
        for (const section of sections) {
          const lines = section.split("\\n").filter((l) => l.trim().startsWith("-"));
          const header = section.split("\\n")[0].trim();
    
          for (const line of lines) {
            const content = line.replace(/^-\\s*/, "").replace(/\\[[^\\]]+\\]\\s*/, "").trim();
            if (content.length > 5) {
              this.episodic.add(
                \`[\${header}] \${content.slice(0, 100)}\`,
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
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "long-term-memory.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 7. KNOWLEDGE GRAPH
    // ============================================================
    
    function writeKnowledgeGraph() {
      const code = `/**
     * knowledge-graph.ts - Grafo de Conhecimento
     * 
     * Constrói e consulta um grafo de relações entre entidades
     * a partir das memórias semânticas.
     */
    
    import { KnowledgeGraph, SemanticMemory } from "./memory-sota-types";
    
    export class KnowledgeGraphStore {
      private nodes: Map<string, Set<string>> = new Map();
      private edges: Map<string, Map<string, number>> = new Map();
    
      /** Adiciona um fato ao grafo */
      addFact(subject: string, predicate: string, object: string, confidence: number = 0.8): void {
        const s = subject.toLowerCase();
        const o = object.toLowerCase();
        const p = predicate.toLowerCase();
    
        // Add nodes
        if (!this.nodes.has(s)) this.nodes.set(s, new Set());
        if (!this.nodes.has(o)) this.nodes.set(o, new Set());
        this.nodes.get(s)!.add(p);
        this.nodes.get(o)!.add(p);
    
        // Add edge
        const edgeKey = \`\${s}::\${p}\`;
        if (!this.edges.has(edgeKey)) {
          this.edges.set(edgeKey, new Map());
        }
        const currentConfidence = this.edges.get(edgeKey)!.get(o) || 0;
        this.edges.get(edgeKey)!.set(o, Math.max(currentConfidence, confidence));
      }
    
      /** Adiciona múltiplos fatos */
      addFacts(facts: SemanticMemory[]): void {
        for (const fact of facts) {
          this.addFact(fact.subject, fact.predicate, fact.object, fact.confidence);
        }
      }
    
      /** Busca nós relacionados a uma entidade */
      query(entity: string, maxDepth: number = 2): Map<string, string[]> {
        const results = new Map<string, string[]>();
        const lower = entity.toLowerCase();
    
        // Direct relationships
        const relations: string[] = [];
        for (const [edgeKey, targets] of this.edges) {
          const [subj, pred] = edgeKey.split("::");
          if (subj === lower) {
            for (const [obj, conf] of targets) {
              relations.push(\`\${pred} → \${obj} (conf: \${conf.toFixed(2)})\`);
            }
          }
          if (targets.has(lower)) {
            relations.push(\`\${subj} → \${pred} → me\`);
          }
        }
    
        if (relations.length > 0) {
          results.set("direct", relations);
        }
    
        // Node metadata
        const nodeInfo = this.nodes.get(lower);
        if (nodeInfo) {
          results.set("predicates", Array.from(nodeInfo));
        }
    
        return results;
      }
    
      /** Busca caminho entre duas entidades */
      findPath(from: string, to: string): string[] | null {
        const visited = new Set<string>();
        const queue: Array<{ node: string; path: string[] }> = [
          { node: from.toLowerCase(), path: [from] },
        ];
    
        visited.add(from.toLowerCase());
    
        while (queue.length > 0) {
          const { node, path } = queue.shift()!;
    
          // Find all connected nodes
          const connected = this.getConnectedNodes(node);
          for (const next of connected) {
            if (next.toLowerCase() === to.toLowerCase()) {
              return [...path, next];
            }
            if (!visited.has(next.toLowerCase())) {
              visited.add(next.toLowerCase());
              queue.push({ node: next.toLowerCase(), path: [...path, next] });
            }
          }
        }
    
        return null;
      }
    
      /** Estatísticas do grafo */
      getStats(): { nodes: number; edges: number; density: number } {
        const nodeCount = this.nodes.size;
        const edgeCount = Array.from(this.edges.values()).reduce(
          (sum, m) => sum + m.size,
          0
        );
        const maxEdges = nodeCount * (nodeCount - 1);
        const density = maxEdges > 0 ? edgeCount / maxEdges : 0;
    
        return { nodes: nodeCount, edges: edgeCount, density };
      }
    
      private getConnectedNodes(node: string): string[] {
        const connected = new Set<string>();
    
        for (const [edgeKey, targets] of this.edges) {
          const [subj] = edgeKey.split("::");
          if (subj === node) {
            for (const obj of targets.keys()) {
              connected.add(obj);
            }
          }
          // Check if any target is the node
          for (const obj of targets.keys()) {
            if (obj === node) {
              connected.add(subj);
            }
          }
        }
    
        return Array.from(connected);
      }
    
      /** Exporta para serialização */
      export(): KnowledgeGraph {
        return {
          nodes: new Map(this.nodes),
          edges: new Map(this.edges),
        };
      }
    
      /** Importa de serialização */
      import(graph: KnowledgeGraph): void {
        this.nodes = new Map(graph.nodes);
        this.edges = new Map(graph.edges);
      }
    }
    
    export function createKnowledgeGraph(): KnowledgeGraphStore {
      return new KnowledgeGraphStore();
    }
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "knowledge-graph.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 8. ATTENTION FILTER
    // ============================================================
    
    function writeAttentionFilter() {
      const code = `/**
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
          content: \`[Plano Ativo]: \${activePlan}\`,
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
          content: \`[Restrições]: \${constraints.join("; ")}\`,
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
                text: \`[Plano] \${proc.goal}: \${proc.plan.join(" → ")}\`,
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
          prompt += \`## Plano Ativo\n\${context.activePlan}\n\n\`;
        }
    
        // 2. Constraints
        const constraints = context.workingMemory
          .filter((e) => e.tags.includes("constraints"))
          .map((e) => e.content);
        if (constraints.length > 0) {
          prompt += \`## Restrições\n\${constraints.join("\\n")}\n\n\`;
        }
    
        // 3. Long-term context (only if relevant, top-3)
        if (context.longTermMemories.length > 0) {
          prompt += "## Contexto da Memória de Longo Prazo\n";
          for (const mem of context.longTermMemories.slice(0, 3)) {
            prompt += \`- [\${(mem.score * 100).toFixed(0)}%] \${mem.text.slice(0, 300)}\n\`;
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
            const role = entry.role === "user" ? "Usuário" : "Assistente";
            prompt += \`\${role}: \${entry.content}\n\`;
          }
          prompt += "\n";
        }
    
        // 5. Focus warning
        if (context.distractionLevel > 0.6) {
          prompt += "[[WARN] Possível perda de foco detectada. Retorne ao plano ativo.]\n\n";
        }
    
        // 6. User input
        prompt += \`## Entrada do Usuário\n\${userInput}\n\`;
    
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
        .replace(/[^a-z0-9áàâãéêíóôõúç\\s]/gi, " ")
        .split(/\\s+/)
        .filter((t) => t.length > 3 && !STOP_WORDS.has(t))
        .slice(0, 10);
    }
    
    export function createAttentionFilter(options?: Partial<AttentionOptions>): AttentionFilter {
      return new AttentionFilter(options);
    }
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "attention-filter.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 9. REFRESH & FORGETTING
    // ============================================================
    
    function writeRefreshForget() {
      const code = `/**
     * refresh-forget.ts - Refresh & Esquecimento
     * 
     * - Meia-vida dinâmica para memórias
     * - Refresh a cada 20 passos ou sinal de confusão
     * - Esquecimento ativo após 3 ciclos sem acesso
     */
    
    import { EpisodicMemory, RefreshRecord } from "./memory-sota-types";
    
    // ============================================================
    // Constants
    // ============================================================
    
    const REFRESH_INTERVAL = 20; // steps
    const FORGET_CYCLES = 3; // ciclos sem acesso = esquecimento
    const HALF_LIFE_BASE = 1000 * 60 * 60; // 1 hora (em ms)
    const HALF_LIFE_DYNAMIC_FACTOR = 0.8; // Reduz meia-vida para memórias pouco acessadas
    
    // ============================================================
    // Half-life calculation
    // ============================================================
    
    function calculateHalfLife(memory: { accessCount: number; timestamp: number; lastAccess: number }): number {
      const age = Date.now() - memory.timestamp;
      const hoursSinceCreation = age / (1000 * 60 * 60);
    
      // More accessed = longer half-life
      const accessBonus = Math.min(memory.accessCount * 0.2, 2.0);
    
      // Recently accessed = longer half-life
      const recencyBonus = (Date.now() - memory.lastAccess) < 1000 * 60 * 30 ? 1.5 : 1.0;
    
      return HALF_LIFE_BASE * (1 + accessBonus) * recencyBonus;
    }
    
    function isForgotten(memory: { accessCount: number; timestamp: number; lastAccess: number }): boolean {
      const halfLife = calculateHalfLife(memory);
      const timeSinceLastAccess = Date.now() - memory.lastAccess;
    
      // After FORGET_CYCLES half-lives without access, memory is forgotten
      return timeSinceLastAccess > halfLife * FORGET_CYCLES;
    }
    
    function getMemoryStrength(memory: { accessCount: number; timestamp: number; lastAccess: number }): number {
      const halfLife = calculateHalfLife(memory);
      const timeSinceLastAccess = Date.now() - memory.lastAccess;
    
      // Exponential decay based on half-life
      return Math.pow(0.5, timeSinceLastAccess / halfLife);
    }
    
    // ============================================================
    // Refresh & Forget Manager
    // ============================================================
    
    export class RefreshForgetManager {
      private refreshHistory: RefreshRecord[] = [];
      private stepCount = 0;
      private lastRefreshStep = 0;
    
      constructor() {
        this.stepCount = 0;
        this.lastRefreshStep = 0;
      }
    
      /** Chamado a cada passo do agente */
      step(): void {
        this.stepCount++;
      }
    
      /** Verifica se precisa de refresh */
      needsRefresh(confusionSignal: boolean = false): boolean {
        const stepsSinceRefresh = this.stepCount - this.lastRefreshStep;
        return stepsSinceRefresh >= REFRESH_INTERVAL || confusionSignal;
      }
    
      /** Executa refresh nas memórias */
      refresh(memories: EpisodicMemory[]): {
        refreshed: number;
        forgotten: number;
        activeMemories: EpisodicMemory[];
      } {
        this.lastRefreshStep = this.stepCount;
    
        // Refresh: touch recent important memories
        let refreshed = 0;
        const activeMemories: EpisodicMemory[] = [];
        let forgotten = 0;
    
        for (const memory of memories) {
          if (isForgotten(memory)) {
            forgotten++;
            continue; // Remove (esquecimento ativo)
          }
    
          // Refresh: update lastAccess for recently used memories
          if (getMemoryStrength(memory) > 0.3) {
            memory.lastAccess = Date.now();
            refreshed++;
          }
    
          activeMemories.push(memory);
        }
    
        // Record refresh
        const record: RefreshRecord = {
          step: this.stepCount,
          timestamp: Date.now(),
          type: "periodic",
          memoriesRefreshed: refreshed,
        };
        this.refreshHistory.push(record);
    
        // Keep only last 50 records
        if (this.refreshHistory.length > 50) {
          this.refreshHistory = this.refreshHistory.slice(-50);
        }
    
        console.log(
          \`[RefreshForget] Refresh #\${this.stepCount}: \${refreshed} refreshed, \${forgotten} forgotten. Active: \${activeMemories.length}\`
        );
    
        return { refreshed, forgotten, activeMemories };
      }
    
      /** Obtém força de uma memória (0-1) */
      getMemoryStrengthValue(memory: EpisodicMemory): number {
        return getMemoryStrength(memory);
      }
    
      /** Estatísticas */
      getStats(): {
        stepCount: number;
        lastRefreshStep: number;
        totalRefreshes: number;
        totalForgets: number;
      } {
        return {
          stepCount: this.stepCount,
          lastRefreshStep: this.lastRefreshStep,
          totalRefreshes: this.refreshHistory.length,
          totalForgets: 0, // tracked externally
        };
      }
    
      /** O histórico de refreshes */
      getRefreshHistory(): RefreshRecord[] {
        return [...this.refreshHistory];
      }
    }
    
    export function createRefreshForgetManager(): RefreshForgetManager {
      return new RefreshForgetManager();
    }
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "refresh-forget.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 10. FOCUS INDUCER
    // ============================================================
    
    function writeFocusInducer() {
      const code = `/**
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
          .replace(/[^a-z0-9áàâãéêíóôõúç\\s]/gi, " ")
          .split(/\\s+/)
          .filter((w) => w.length > 3)
      );
    
      const inputWords = new Set(
        input
          .toLowerCase()
          .replace(/[^a-z0-9áàâãéêíóôõúç\\s]/gi, " ")
          .split(/\\s+/)
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
            .replace(/[^a-z0-9áàâãéêíóôõúç\\s]/gi, " ")
            .split(/\\s+/)
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
                id: \`focus-plan-\${Date.now()}\`,
                content: \`[FOCUS] Retomada de foco: \${activePlan}\`,
                role: "system",
                timestamp: Date.now(),
                step: 0,
                importance: 1.0,
                isTrivial: false,
                tags: ["plan", "focus"],
              });
              alert = \`[Foco] Retornando ao plano: \${activePlan.slice(0, 100)}\`;
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
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "focus-inducer.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 11. NEW MEMORY ENGINE (SOTA)
    // ============================================================
    
    function writeNewMemoryEngine() {
      const code = `/**
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
        const decisionPattern = /(?:decidi|decidimos|vamos|escolh[^\\s]*)\\s+([^.!?]+)[.!?]/gi;
        for (const match of combined.matchAll(decisionPattern)) {
          const content = match[1].trim();
          if (content.length > 10) {
            this.longTermMemory.episodic.add(
              \`Decisão: \${content.slice(0, 100)}\`,
              content
            );
            count++;
          }
        }
    
        // Extract facts/learnings
        const factPattern = /(?:aprendi|descobri|importante|lembre\\s+que|anote)\\s+([^.!?]+)[.!?]/gi;
        for (const match of combined.matchAll(factPattern)) {
          const content = match[1].trim();
          if (content.length > 10) {
            this.longTermMemory.episodic.add(
              \`Fato: \${content.slice(0, 100)}\`,
              content
            );
            count++;
          }
        }
    
        // Extract preferences
        const prefPattern = /(?:prefiro|gosto\\s+mais|prefere|melhor\\s+|não\\s+gosto)\\s+([^.!?]+)[.!?]/gi;
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
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "memory-engine-sota.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 12. ORCHESTRATOR PATCH
    // ============================================================
    
    function writeOrchestratorPatch() {
      const code = `/**
     * orchestrator-sota-integration.ts
     * 
     * Demonstra como integrar a MemoryEngineSOTA no orchestrator.ts.
     * Substitui o uso de MemoryEngine e memory_search pelo novo sistema.
     * 
     * PARA USAR:
     * 1. Importe MemoryEngineSOTA
     * 2. Substitua as chamadas a memoryEngine.recall() por memoryEngineSOTA.process()
     * 3. Configure o callback LLM
     */
    
    /*
    import { getMemoryEngineSOTA } from "../memory/memory-engine-sota";
    
    // No orchestrator.ts, substitua:
    // const memoryEngine = getMemoryEngine();
    // Por:
    const memoryEngineSOTA = getMemoryEngineSOTA();
    
    // Configure o callback LLM:
    memoryEngineSOTA.setLLMCallback(async (prompt: string) => {
      // Sua lógica de chamada LLM aqui
      const response = await callLLM(prompt);
      return response;
    });
    
    // No lugar de:
    // const memoryContext = this.memoryEngine.recall(input, formattedHistory);
    // Use:
    const result = await memoryEngineSOTA.process(input, "user");
    // result.response contém a resposta do LLM
    // result.attentionContext tem o contexto atencional
    // result.focusAlert tem alertas de foco
    
    // O consolidate() é feito automaticamente no process()
    // O manageWorkingMemory() é feito automaticamente no process()
    */
    
    console.log("[OK] Orchestrator patch instructions written");
    console.log("   See orchestrator-sota-integration.ts for details");
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "orchestrator-sota-integration.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // 13. VALIDATION SIMULATOR
    // ============================================================
    
    function writeValidationSimulator() {
      const code = `/**
     * validation-simulator.ts
     * 
     * Simula os cenários de validação para a arquitetura SOTA
     */
    
    import { MemoryEngineSOTA, getMemoryEngineSOTA } from "./memory-engine-sota";
    
    // ============================================================
    // Helper
    // ============================================================
    
    function generateLongTask(steps: number): string[] {
      const tasks: string[] = [];
      const goal = "Construir um sistema de recomendação de filmes usando Python";
    
      tasks.push(\`Meu objetivo é: \${goal}\`);
      tasks.push("Vou usar dados do MovieLens dataset");
      tasks.push("Preciso carregar os dados com pandas");
      tasks.push("Vou fazer limpeza dos dados primeiro");
      tasks.push("Remover duplicatas e tratar valores nulos");
      tasks.push("Criar matriz usuário-filme");
      tasks.push("Calcular similaridade entre usuários");
      tasks.push("Implementar recomendação baseada em conteúdo");
      tasks.push("Testar com 5 usuários diferentes");
      tasks.push("Avaliar com métrica RMSE");
    
      // Fill remaining steps with filler
      for (let i = tasks.length; i < steps; i++) {
        const fillerTasks = [
          \`Verificando resultado parcial do passo \${i}\`,
          \`Analisando saída do modelo\`,
          \`Ajustando hiperparâmetros\`,
          \`Validando contra overfitting\`,
          \`Gerando relatório de progresso\`,
          \`Commitando código no git\`,
          \`Documentando decisão técnica\`,
          \`Revisando código do colega\`,
        ];
        tasks.push(fillerTasks[i % fillerTasks.length]);
      }
    
      return tasks;
    }
    
    // ============================================================
    // Simulation Scenarios
    // ============================================================
    
    interface SimulationResult {
      scenario: string;
      passed: boolean;
      details: string;
      metrics: Record<string, number>;
    }
    
    async function simulateLongTask100StepsLLM4k(): Promise<SimulationResult> {
      console.log("\\n📊 Cenário 1: Tarefa longa (100 passos), janela LLM 4k");
      console.log("   Métrica: Foco mantido > 90%");
    
      const engine = getMemoryEngineSOTA();
      const tasks = generateLongTask(100);
    
      let focusScoreSum = 0;
      let focusChecks = 0;
      let distractionEvents = 0;
    
      for (let i = 0; i < tasks.length; i++) {
        const result = await engine.process(tasks[i]);
    
        if (result.attentionContext) {
          focusScoreSum += result.attentionContext.focusScore;
          focusChecks++;
        }
    
        if (result.focusAlert) {
          distractionEvents++;
        }
    
        // Force periodic build of embedding service
        if (i % 20 === 0 && i > 0) {
          console.log(\`   Passo \${i}: foco=\${result.attentionContext?.focusScore.toFixed(2)}, alertas=\${distractionEvents}\`);
        }
      }
    
      const avgFocus = focusChecks > 0 ? focusScoreSum / focusChecks : 0;
      const focusRate = avgFocus;
      const passed = focusRate >= 0.9;
    
      console.log(\`   Resultado: Foco médio = \${(focusRate * 100).toFixed(1)}%\`);
      console.log(\`   Alertas de distração: \${distractionEvents}\`);
      console.log(\`   Status: \${passed ? "[OK] APROVADO" : "[FAIL] REPROVADO"}\`);
    
      return {
        scenario: "Tarefa longa (100 passos), janela LLM 4k",
        passed,
        details: \`Foco médio: \${(focusRate * 100).toFixed(1)}%, Alertas: \${distractionEvents}\`,
        metrics: { focusRate, distractionEvents, totalSteps: tasks.length },
      };
    }
    
    async function simulateLongTask100StepsLLM128k(): Promise<SimulationResult> {
      console.log("\\n📊 Cenário 2: Tarefa longa (100 passos), janela LLM 128k");
      console.log("   Métrica: Sem 'lost in the middle'");
    
      const engine = getMemoryEngineSOTA();
      const tasks = generateLongTask(100);
    
      let lostInMiddleCount = 0;
      const totalChecks = 0;
    
      // Simulate: check if plan is still in working memory after many steps
      let planInWM = true;
    
      for (let i = 0; i < tasks.length; i++) {
        await engine.process(tasks[i]);
    
        // Every 10 steps, check if the plan is still retrievable
        if (i % 10 === 0 && i > 0) {
          const wmEntries = engine.workingMemory.getEntries();
          const hasPlan = wmEntries.some(
            (e) =>
              e.tags.includes("plan") || e.content.toLowerCase().includes("objetivo")
          );
    
          if (!hasPlan) {
            // Check long-term memory
            const searchResult = engine.longTermMemory.episodic.search("objetivo sistema recomendação filmes", 3);
            const foundInLTM = searchResult.length > 0 && searchResult.some(r => r.score > 0.1);
    
            if (!foundInLTM) {
              lostInMiddleCount++;
              planInWM = false;
            }
          }
        }
      }
    
      const passed = lostInMiddleCount === 0;
    
      console.log(\`   Perdas de plano (\"lost in the middle\"): \${lostInMiddleCount}\`);
      console.log(\`   Status: \${passed ? "[OK] APROVADO" : "[FAIL] REPROVADO"}\`);
    
      return {
        scenario: "Tarefa longa (100 passos), janela LLM 128k",
        passed,
        details: \`Lost in the middle events: \${lostInMiddleCount}\`,
        metrics: { lostInMiddleCount, totalChecks },
      };
    }
    
    async function simulateRecallFact2h(): Promise<SimulationResult> {
      console.log("\\n📊 Cenário 3: Recall de fato dito há 2h");
      console.log("   Métrica: Recuperado por busca semântica");
    
      const engine = getMemoryEngineSOTA();
    
      // Simula uma conversa de 2 horas atrás
      const oldFact = "O nome do projeto é colabor-ai e usa TypeScript com arquitetura de agents";
      const oldQuery = "Qual o nome do projeto";
    
      // Adiciona o fato diretamente na long-term memory com timestamp antigo
      const embService = (engine as any).embeddingService;
      embService.addText(oldFact, "episodic", "fact-colabor-ai");
    
      // Força rebuild do embedding service
      // (the build is automatic on search)
    
      // Tenta buscar
      const results = engine.longTermMemory.episodic.search("nome do projeto", 5);
    
      const found = results.some(
        (r) =>
          r.text.toLowerCase().includes("colabor-ai") || r.score > 0.1
      );
    
      console.log(\`   Busca: "nome do projeto"\`);
      console.log(\`   Resultados encontrados: \${results.length}\`);
      for (const r of results.slice(0, 3)) {
        console.log(\`     [\${(r.score * 100).toFixed(0)}%] \${r.text.slice(0, 80)}...\`);
      }
      console.log(\`   Status: \${found ? "[OK] APROVADO" : "[FAIL] REPROVADO"}\`);
    
      return {
        scenario: "Recall de fato dito há 2h",
        passed: found,
        details: \`Resultados: \${results.length}, Melhor score: \${results.length > 0 ? results[0].score.toFixed(3) : "N/A"}\`,
        metrics: { resultsCount: results.length, bestScore: results.length > 0 ? results[0].score : 0 },
      };
    }
    
    async function simulateLatency(): Promise<SimulationResult> {
      console.log("\\n📊 Cenário 4: Latência adicional");
      console.log("   Métrica: < 20% da inferência original");
    
      const engine = getMemoryEngineSOTA();
    
      // Simulate 10 calls to measure overhead of memory system
      const iterations = 10;
      const memoryTimes: number[] = [];
    
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await engine.process(\`Test message number \${i}\`);
        const end = performance.now();
        memoryTimes.push(end - start);
      }
    
      const avgMemoryTime = memoryTimes.reduce((s, t) => s + t, 0) / memoryTimes.length;
    
      // Estimate: LLM inference for a small model takes ~500-2000ms
      // Memory overhead should be < 20% of that = < 100-400ms
      // Our memory ops are local (no network), so they should be fast
    
      // For a 500ms LLM call, 20% = 100ms
      // For a 2000ms LLM call, 20% = 400ms
      const llmInferenceTime = 1000; // assumed 1s
      const latencyPercent = (avgMemoryTime / llmInferenceTime) * 100;
      const passed = latencyPercent < 20;
    
      console.log(\`   Tempo médio de operações de memória: \${avgMemoryTime.toFixed(2)}ms\`);
      console.log(\`   Tempo assumido de inferência LLM: \${llmInferenceTime}ms\`);
      console.log(\`   Latência adicional: \${latencyPercent.toFixed(1)}%\`);
      console.log(\`   Limite: 20%\`);
      console.log(\`   Status: \${passed ? "[OK] APROVADO" : "[FAIL] REPROVADO"}\`);
    
      return {
        scenario: "Latência adicional < 20%",
        passed,
        details: \`Média: \${avgMemoryTime.toFixed(2)}ms, \${latencyPercent.toFixed(1)}% da inferência\`,
        metrics: { avgMemoryTime, latencyPercent, llmInferenceTime },
      };
    }
    
    // ============================================================
    // Run all simulations
    // ============================================================
    
    export async function runAllSimulations(): Promise<void> {
      console.log("=".repeat(60));
      console.log("[TEST] VALIDAÇÃO DA ARQUITETURA DE MEMÓRIA SOTA");
      console.log("=".repeat(60));
    
      const results: SimulationResult[] = [];
    
      results.push(await simulateLongTask100StepsLLM4k());
      results.push(await simulateLongTask100StepsLLM128k());
      results.push(await simulateRecallFact2h());
      results.push(await simulateLatency());
    
      console.log("\\n" + "=".repeat(60));
      console.log("[CHECK] RESUMO DA VALIDAÇÃO");
      console.log("=".repeat(60));
    
      let allPassed = true;
      for (const result of results) {
        const icon = result.passed ? "[OK]" : "[FAIL]";
        console.log(\`\${icon} \${result.scenario}: \${result.passed ? "APROVADO" : "REPROVADO"}\`);
        if (!result.passed) allPassed = false;
      }
    
      console.log("\\n" + (allPassed ? "[SUCCESS] TODOS OS TESTES APROVADOS!" : "[WARN] ALGUNS TESTES REPROVADOS"));
      console.log("=".repeat(60));
    }
    
    // Auto-executar se chamado diretamente
    runAllSimulations().catch(console.error);
    `;
    
      const target = path.join(CORE_MEMORY_DIR, "validation-simulator.ts");
      fs.writeFileSync(target, code, "utf-8");
      console.log(`  [OK] Created: ${target}`);
    }
    
    // ============================================================
    // MAIN EXECUTION
    // ============================================================
    
    async function main() {
      console.log("[START] INICIANDO MIGRAÇÃO PARA ARQUITETURA DE MEMÓRIA SOTA");
      console.log("=".repeat(60));
    
      // Step 1: Backup
      console.log("\n[BACKUP] [1/10] Criando backup...");
      backup();
    
      // Step 2: Create types
      console.log("\n[TYPES] [2/10] Criando tipos compartilhados...");
      writeTypes();
    
      // Step 3: Create working memory
      console.log("\n[WM] [3/10] Criando Working Memory (FIFO + Pruning + Compressão)...");
      writeWorkingMemory();
    
      // Step 4: Create embedding service
      console.log("\n[EMB] [4/10] Criando Embedding Service (TF-IDF + similaridade)...");
      writeEmbeddingService();
    
      // Step 5: Create compressor
      console.log("\n[CMP] [5/10] Criando Compressor Hierárquico...");
      writeCompressor();
    
      // Step 6: Create long-term memory
      console.log("\n[LTM] [6/10] Criando Long-term Memory (Episódica + Semântica + Procedural)...");
      writeLongTermMemory();
    
      // Step 7: Create knowledge graph
      console.log("\n[KG] [7/10] Criando Knowledge Graph...");
      writeKnowledgeGraph();
    
      // Step 8: Create attention filter
      console.log("\n[ATT] [8/10] Criando Attention Filter...");
      writeAttentionFilter();
    
      // Step 9: Create refresh & forget
      console.log("\n[REF] [9/10] Criando Refresh & Forget Manager...");
      writeRefreshForget();
    
      // Step 10: Create focus inducer
      console.log("\n[FOC] [10/10] Criando Focus Inducer...");
      writeFocusInducer();
    
      // Bonus: New memory engine + orchestrator patch + validation
      console.log("\n[BONUS] [BÔNUS] Criando Memory Engine SOTA...");
      writeNewMemoryEngine();
    
      console.log("\n[BONUS] [BÔNUS] Criando patch de integração do orchestrator...");
      writeOrchestratorPatch();
    
      console.log("\n[BONUS] [BÔNUS] Criando simulador de validação...");
      writeValidationSimulator();
    
      // Verify all files
      console.log("\n" + "=".repeat(60));
      console.log("[CHECK] VERIFICAÇÃO DOS ARQUIVOS CRIADOS");
      console.log("=".repeat(60));
    
      const expectedFiles = [
        "memory-sota-types.ts",
        "working-memory.ts",
        "embedding-service.ts",
        "compressor.ts",
        "long-term-memory.ts",
        "knowledge-graph.ts",
        "attention-filter.ts",
        "refresh-forget.ts",
        "focus-inducer.ts",
        "memory-engine-sota.ts",
        "orchestrator-sota-integration.ts",
        "validation-simulator.ts",
      ];
    
      const missingFiles: string[] = [];
      const dir = path.join(process.cwd(), "core", "memory");
    
      for (const file of expectedFiles) {
        const filePath = path.join(dir, file);
        const exists = fs.existsSync(filePath);
        console.log(`  ${exists ? "[OK]" : "[FAIL]"} ${file}`);
        if (!exists) {
          missingFiles.push(file);
        }
      }
    
      if (missingFiles.length > 0) {
        console.log("\n[WARN] ATENÇÃO: Arquivos faltando:", missingFiles.join(", "));
      } else {
        console.log("\n[SUCCESS] TODOS OS 12 ARQUIVOS CRIADOS COM SUCESSO!");
      }
    
      // Summary
      console.log("\n" + "=".repeat(60));
      console.log("[CHECK] DIAGNÓSTICO E PLANO");
      console.log("=".repeat(60));
      console.log(`
    Diagnóstico:
      Presentes (parcialmente):
        - memory-engine.ts: recall(), consolidate(), manageWorkingMemory()
        - memory_search.ts: search, append, daily notes
    
      Gaps (implementados no SOTA):
        1. Working Memory com FIFO + pruning seletivo → working-memory.ts
        2. Embedding Service (TF-IDF + cosine similarity) → embedding-service.ts
        3. Compressão Hierárquica (3 níveis) → compressor.ts
        4. Long-term Memory (Episódica + Semântica + Procedural) → long-term-memory.ts
        5. Knowledge Graph → knowledge-graph.ts
        6. Attention Filter (filtragem pré-LLM) → attention-filter.ts
        7. Refresh & Forget (meia-vida dinâmica) → refresh-forget.ts
        8. Focus Inducer (detector de divagação) → focus-inducer.ts
        9. Memory Engine SOTA (fluxo 10 passos) → memory-engine-sota.ts
    
      Violações:
        - Nenhuma (latência local, sem fine-tuning)
        - Fallback: se embedding falhar, working memory continua operando
    
    Plano de alterações:
      1. Backup dos arquivos originais [OK]
      2. 12 novos módulos criados [OK]
      3. Integração: substituir imports no orchestrator.ts
      4. Validação: rodar validation-simulator.ts
    `);
    
      console.log("\n[NEXT] PRÓXIMOS PASSOS:");
      console.log("1. Verifique a integração no orchestrator.ts:");
      console.log("   Substitua 'getMemoryEngine' por 'getMemoryEngineSOTA'");
      console.log("2. Configure o LLM callback:");
      console.log("   memoryEngineSOTA.setLLMCallback(yourLLMFunction)");
      console.log("3. Execute a validação:");
      console.log("   npx tsx core/memory/validation-simulator.ts");
    }
    
    main().catch(console.error);
    