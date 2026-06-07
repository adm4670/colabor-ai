// ============================================================
    // Geracao de embeddings via OpenAI text-embedding-3-small
    // ============================================================
    
    import OpenAI from "openai";
    import { logger } from "../utils/logger";
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const EMBEDDING_MODEL = "text-embedding-3-small";
    const EMBEDDING_DIMENSIONS = 384;
    
    /**
     * Gera embedding para um unico texto
     */
    export async function generateEmbedding(text: string): Promise<number[]> {
      const cleaned = text
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 8000);
    
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleaned,
        dimensions: EMBEDDING_DIMENSIONS
      });
    
      return response.data[0].embedding;
    }
    
    /**
     * Gera embeddings para multiplos textos (batch)
     */
    export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
      const cleaned = texts.map(t =>
        t.replace(/\s+/g, " ").trim().substring(0, 8000)
      );
    
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleaned,
        dimensions: EMBEDDING_DIMENSIONS
      });
    
      return response.data.map(d => d.embedding);
    }
    
    /**
     * Calcula similaridade de cosseno entre dois vetores
     */
    export function cosineSimilarity(a: number[], b: number[]): number {
      if (a.length !== b.length || a.length === 0) return 0;
    
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
    