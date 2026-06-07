// ============================================================
    // VectorStore - Armazenamento vetorial persistente em JSON
    // Zero dependencias externas
    // ============================================================
    
    import * as fs from "fs";
    import * as path from "path";
    import { logger } from "../utils/logger";
    import { generateEmbedding, cosineSimilarity } from "./embeddings";
    import {
      StoredEntry,
      MemoryStoreFile,
      MemorySearchResult,
      MemorySearchParams,
      MemoryStoreParams
    } from "./types";
    
    const MEMORY_DIR = path.resolve(process.cwd(), "data", "memory");
    const MEMORY_FILE = path.join(MEMORY_DIR, "vector-store.json");
    
    function generateId(): string {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      return `mem_${timestamp}_${random}`;
    }
    
    class VectorStore {
      private entries: StoredEntry[] = [];
      private initialized = false;
    
      async init(): Promise<void> {
        if (this.initialized) return;
    
        if (!fs.existsSync(MEMORY_DIR)) {
          fs.mkdirSync(MEMORY_DIR, { recursive: true });
        }
    
        if (fs.existsSync(MEMORY_FILE)) {
          try {
            const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
            const data: MemoryStoreFile = JSON.parse(raw);
            this.entries = data.entries || [];
            logger.info(`[VectorStore] Memoria carregada: ${this.entries.length} entradas`);
          } catch (err) {
            logger.warn("[VectorStore] Erro ao carregar memoria, iniciando do zero");
            this.entries = [];
          }
        }
    
        this.initialized = true;
      }
    
      private persist(): void {
        const data: MemoryStoreFile = {
          version: 1,
          entries: this.entries
        };
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), "utf-8");
      }
    
      async store(params: MemoryStoreParams): Promise<string> {
        if (!this.initialized) await this.init();
    
        const content = params.content.trim();
        if (!content) throw new Error("Conteudo vazio");
    
        const embedding = await generateEmbedding(content);
    
        const entry: StoredEntry = {
          id: generateId(),
          content,
          metadata: {
            type: params.type || "note",
            source: params.source || "agent",
            timestamp: Date.now(),
            tags: params.tags || [],
            sessionId: params.sessionId
          },
          embedding,
          createdAt: Date.now()
        };
    
        this.entries.push(entry);
        this.persist();
    
        return entry.id;
      }
    
      async search(params: MemorySearchParams): Promise<MemorySearchResult[]> {
        if (!this.initialized) await this.init();
        if (this.entries.length === 0) return [];
    
        const queryEmbedding = await generateEmbedding(params.query);
        const limit = params.limit || 5;
        const threshold = params.threshold ?? 0.4;
    
        const scored = this.entries
          .filter(entry => {
            if (params.typeFilter && params.typeFilter.length > 0) {
              return params.typeFilter.includes(entry.metadata.type);
            }
            return true;
          })
          .map(entry => ({
            ...entry,
            similarity: cosineSimilarity(queryEmbedding, entry.embedding)
          }))
          .filter(entry => entry.similarity >= threshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);
    
        return scored.map(e => ({
          id: e.id,
          content: e.content,
          metadata: e.metadata,
          similarity: e.similarity,
          createdAt: e.createdAt
        }));
      }
    
      searchByText(query: string, limit = 5): MemorySearchResult[] {
        const lower = query.toLowerCase();
    
        return this.entries
          .filter(entry =>
            entry.content.toLowerCase().includes(lower) ||
            entry.metadata.tags.some(t => t.toLowerCase().includes(lower))
          )
          .slice(0, limit)
          .map(e => ({
            id: e.id,
            content: e.content,
            metadata: e.metadata,
            similarity: 1.0,
            createdAt: e.createdAt
          }));
      }
    
      forget(id: string): boolean {
        const before = this.entries.length;
        this.entries = this.entries.filter(e => e.id !== id);
    
        if (this.entries.length !== before) {
          this.persist();
          return true;
        }
        return false;
      }
    
      getStats() {
        const byType: Record<string, number> = {};
        for (const e of this.entries) {
          byType[e.metadata.type] = (byType[e.metadata.type] || 0) + 1;
        }
    
        return {
          totalEntries: this.entries.length,
          byType,
          storagePath: MEMORY_FILE
        };
      }
    
      clear(): void {
        this.entries = [];
        this.persist();
      }
    
      count(): number {
        return this.entries.length;
      }
    }
    
    export const vectorStore = new VectorStore();
    