import { logger } from "../utils/logger";
/**
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
        .replace(/[^a-z0-9áàâãéêíóôõúç\s]/gi, " ")
        .split(/\s+/)
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
        const vectorId = id || `emb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
        logger.info(`[EmbeddingService] Built ${this.dimension}-dim vocabulary for ${this.vectors.length} texts`);
      }
    
      /** Busca os top-K textos mais similares */
      search(query: string, topK: number = 5): SimilarityResult[] {
        // Auto-build on first search
        if (!this.isBuilt && this.vectors.length > 0) {
          this.build();
        }
        if (this.vectors.length === 0) {
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
    