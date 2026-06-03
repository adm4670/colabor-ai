// =============================================================
    // Cache LRU + TTL - Armazena respostas de API para evitar chamadas
    // repetidas identicas. Usa Map para O(1) lookups e LRU ordering.
    // =============================================================
    // Uso:
    //   import { createCache } from "../utils/cache";
    //   const cache = createCache<string>({ maxSize: 100, ttlMs: 60_000 });
    //   const cached = cache.get(key);
    //   if (cached !== undefined) return cached;
    //   const result = await expensiveCall();
    //   cache.set(key, result);
    // =============================================================
    
    import { createLogger } from "./logger";
    
    const log = createLogger("CACHE");
    
    export interface CacheOptions {
      /** Numero maximo de entradas no cache (default: 50) */
      maxSize: number;
      /** Tempo de vida em milissegundos (default: 5 minutos) */
      ttlMs: number;
    }
    
    interface CacheEntry<T> {
      value: T;
      expiresAt: number;
    }
    
    export class LRUCache<T> {
      private map = new Map<string, CacheEntry<T>>();
      public readonly maxSize: number;
      private readonly ttlMs: number;
    
      // Metricas
      public hits = 0;
      public misses = 0;
      public evictions = 0;
      public expirations = 0;
    
      constructor(options?: Partial<CacheOptions>) {
        this.maxSize = options?.maxSize ?? 
          (process.env.CACHE_MAX_SIZE ? parseInt(process.env.CACHE_MAX_SIZE, 10) : 50);
        this.ttlMs = options?.ttlMs ??
          (process.env.CACHE_TTL_MS ? parseInt(process.env.CACHE_TTL_MS, 10) : 5 * 60 * 1000);
      }
    
      get(key: string): T | undefined {
        const entry = this.map.get(key);
        
        if (!entry) {
          this.misses++;
          return undefined;
        }
    
        // Verificar TTL
        if (Date.now() > entry.expiresAt) {
          this.map.delete(key);
          this.expirations++;
          this.misses++;
          log.debug("Cache expired", { key: key.slice(0, 20) });
          return undefined;
        }
    
        // LRU: mover para o final (mais recente)
        this.map.delete(key);
        this.map.set(key, entry);
        
        this.hits++;
        log.debug("Cache hit", { key: key.slice(0, 20), hits: this.hits });
        return entry.value;
      }
    
      set(key: string, value: T, customTtlMs?: number): void {
        const ttl = customTtlMs ?? this.ttlMs;
        
        // Se a chave ja existe, remover para atualizar LRU
        if (this.map.has(key)) {
          this.map.delete(key);
        }
        
        // Evitar LRU se estiver cheio (remover o mais antigo)
        while (this.map.size >= this.maxSize) {
          const oldestKey = this.map.keys().next().value;
          if (oldestKey) {
            this.map.delete(oldestKey);
            this.evictions++;
          } else {
            break; // seguranca
          }
        }
    
        this.map.set(key, {
          value,
          expiresAt: Date.now() + ttl,
        });
      }
    
      has(key: string): boolean {
        const entry = this.map.get(key);
        if (!entry) return false;
        if (Date.now() > entry.expiresAt) {
          this.map.delete(key);
          this.expirations++;
          return false;
        }
        return true;
      }
    
      delete(key: string): boolean {
        return this.map.delete(key);
      }
    
      clear(): void {
        this.map.clear();
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
        this.expirations = 0;
      }
    
      get size(): number {
        // Conta apenas entradas nao expiradas
        this.purgeExpired();
        return this.map.size;
      }
    
      get hitRate(): string {
        const total = this.hits + this.misses;
        if (total === 0) return "0.00%";
        return ((this.hits / total) * 100).toFixed(2) + "%";
      }
    
      stats(): { size: number; maxSize: number; hits: number; misses: number; evictions: number; expirations: number; hitRate: string; ttlMs: number } {
        return {
          size: this.size,
          maxSize: this.maxSize,
          hits: this.hits,
          misses: this.misses,
          evictions: this.evictions,
          expirations: this.expirations,
          hitRate: this.hitRate,
          ttlMs: this.ttlMs,
        };
      }
    
      /** Remove entradas expiradas (chamado periodicamente) */
      private purgeExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.map) {
          if (now > entry.expiresAt) {
            this.map.delete(key);
            this.expirations++;
          }
        }
      }
    }
    
    // Cache singleton para respostas LLM (usado pelo agent)
    let _llmCache: LRUCache<any> | null = null;
    
    export function getLLMCache(): LRUCache<any> {
      if (!_llmCache) {
        _llmCache = new LRUCache({
          maxSize: process.env.LLM_CACHE_MAX_SIZE 
            ? parseInt(process.env.LLM_CACHE_MAX_SIZE, 10) 
            : 100,
          ttlMs: process.env.LLM_CACHE_TTL_MS
            ? parseInt(process.env.LLM_CACHE_TTL_MS, 10)
            : 5 * 60 * 1000, // 5 minutos default
        });
        log.info("LLM Cache inicializado", _llmCache.stats());
      }
      return _llmCache;
    }
    
    export function resetLLMCache(): void {
      _llmCache = null;
    }
    