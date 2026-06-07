// ============================================================
    // VectorStore - Busca semantica via PostgreSQL + pgvector
    // Substitui o JSON local e o ChromaDB
    // ============================================================
    
    import { pool } from "./models/database";
    import OpenAI from "openai";
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const EMBEDDING_MODEL = "text-embedding-3-small";
    const EMBEDDING_DIMENSIONS = 384;
    
    export async function generateEmbedding(text: string): Promise<number[]> {
      const cleaned = text.replace(/\s+/g, " ").trim().substring(0, 8000);
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleaned,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      return response.data[0].embedding;
    }
    
    export interface MemoryStoreParams {
      content: string;
      type?: string;
      source?: string;
      tags?: string[];
      sessionId?: string;
    }
    
    export interface MemorySearchParams {
      query: string;
      limit?: number;
      threshold?: number;
      typeFilter?: string[];
    }
    
    export interface MemorySearchResult {
      id: string;
      content: string;
      type: string;
      tags: string[];
      similarity: number;
      createdAt: string;
    }
    
    class VectorStore {
      async store(userId: string, params: MemoryStoreParams): Promise<string> {
        const content = params.content.trim();
        if (!content) throw new Error("Conteudo vazio");
    
        const embedding = await generateEmbedding(content);
        const id = crypto.randomUUID();
    
        await pool.query(
          `INSERT INTO memories (id, user_id, type, source, content, tags, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
          [
            id,
            userId,
            params.type || "note",
            params.source || "agent",
            content,
            params.tags || [],
            JSON.stringify(embedding),
          ]
        );
    
        return id;
      }
    
      async search(
        userId: string,
        params: MemorySearchParams
      ): Promise<MemorySearchResult[]> {
        const embedding = await generateEmbedding(params.query);
        const limit = params.limit || 5;
        const threshold = params.threshold ?? 0.4;
    
        let typeFilter = "";
        const values: any[] = [JSON.stringify(embedding), userId, threshold, limit];
    
        if (params.typeFilter && params.typeFilter.length > 0) {
          typeFilter = "AND m.type = ANY($5)";
          values.push(params.typeFilter);
        }
    
        const result = await pool.query(
          `SELECT m.id, m.content, m.type, m.tags, 
                  1 - (m.embedding <=> $1::vector) AS similarity,
                  m.created_at
           FROM memories m
           WHERE m.user_id = $2
             AND m.embedding IS NOT NULL
             AND 1 - (m.embedding <=> $1::vector) > $3
             ${typeFilter}
           ORDER BY m.embedding <=> $1::vector
           LIMIT $4`,
          values
        );
    
        return result.rows.map((row: any) => ({
          id: row.id,
          content: row.content,
          type: row.type,
          tags: row.tags || [],
          similarity: parseFloat(row.similarity) || 0,
          createdAt: row.created_at,
        }));
      }
    
      async searchByText(
        userId: string,
        query: string,
        limit = 5
      ): Promise<MemorySearchResult[]> {
        const result = await pool.query(
          `SELECT id, content, type, tags, created_at
           FROM memories
           WHERE user_id = $1
             AND (content ILIKE $2 OR array_to_string(tags, ' ') ILIKE $2)
           ORDER BY created_at DESC
           LIMIT $3`,
          [userId, `%${query}%`, limit]
        );
    
        return result.rows.map((row: any) => ({
          id: row.id,
          content: row.content,
          type: row.type,
          tags: row.tags || [],
          similarity: 1.0,
          createdAt: row.created_at,
        }));
      }
    
      async forget(userId: string, id: string): Promise<boolean> {
        const result = await pool.query(
          "DELETE FROM memories WHERE id = $1 AND user_id = $2",
          [id, userId]
        );
        return (result.rowCount ?? 0) > 0;
      }
    
      async getStats(userId: string) {
        const result = await pool.query(
          `SELECT type, COUNT(*)::int as count
           FROM memories
           WHERE user_id = $1
           GROUP BY type
           ORDER BY count DESC`,
          [userId]
        );
    
        const total = await pool.query(
          "SELECT COUNT(*)::int as total FROM memories WHERE user_id = $1",
          [userId]
        );
    
        const byType: Record<string, number> = {};
        for (const row of result.rows) {
          byType[row.type] = row.count;
        }
    
        return {
          totalEntries: total.rows[0]?.total || 0,
          byType,
        };
      }
    
      async clear(userId: string): Promise<void> {
        await pool.query("DELETE FROM memories WHERE user_id = $1", [userId]);
      }
    
      async count(userId: string): Promise<number> {
        const result = await pool.query(
          "SELECT COUNT(*)::int as count FROM memories WHERE user_id = $1",
          [userId]
        );
        return result.rows[0]?.count || 0;
      }
    }
    
    export const vectorStore = new VectorStore();
    