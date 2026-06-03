// =============================================================
    // Rate Limiter - Limita chamadas concorrentes a API LLM
    // Usa fila FIFO com controle de concorrencia e delay opcional.
    // =============================================================
    // Uso:
    //   import { rateLimiter } from "../utils/rateLimiter";
    //   const result = await rateLimiter.run(() => apiCall());
    // =============================================================
    
    import { createLogger } from "./logger";
    
    const log = createLogger("RATELIMIT");
    
    export interface RateLimiterOptions {
      /** Maximo de chamadas concorrentes (default: 3) */
      maxConcurrent: number;
      /** Delay minimo entre chamadas em ms (default: 0, sem delay) */
      minDelayMs: number;
      /** Timeout maximo de espera na fila em ms (default: 30000 = 30s) */
      queueTimeoutMs: number;
    }
    
    interface QueueItem<T> {
      fn: () => Promise<T>;
      resolve: (value: T) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
      enqueuedAt: number;
    }
    
    export class RateLimiter {
      private queue: QueueItem<any>[] = [];
      private activeCount = 0;
      private lastCallTime = 0;
      
      public readonly maxConcurrent: number;
      private readonly minDelayMs: number;
      private readonly queueTimeoutMs: number;
    
      // Metricas
      public totalProcessed = 0;
      public totalQueued = 0;
      public totalTimeouts = 0;
      public totalWaitTime = 0;
    
      constructor(options?: Partial<RateLimiterOptions>) {
        this.maxConcurrent = options?.maxConcurrent ??
          (process.env.RATE_LIMIT_MAX_CONCURRENT 
            ? parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT, 10) 
            : 3);
        this.minDelayMs = options?.minDelayMs ??
          (process.env.RATE_LIMIT_MIN_DELAY_MS
            ? parseInt(process.env.RATE_LIMIT_MIN_DELAY_MS, 10)
            : 0);
        this.queueTimeoutMs = options?.queueTimeoutMs ??
          (process.env.RATE_LIMIT_QUEUE_TIMEOUT_MS
            ? parseInt(process.env.RATE_LIMIT_QUEUE_TIMEOUT_MS, 10)
            : 30_000);
      }
    
      /**
       * Executa funcao com controle de concorrencia.
       * Se houver vagas, executa imediatamente.
       * Se nao, entra na fila.
       */
      async run<T>(fn: () => Promise<T>): Promise<T> {
        // Se abaixo do limite, executa direto
        if (this.activeCount < this.maxConcurrent) {
          return this.executeWithDelay(fn);
        }
    
        // Entrar na fila
        this.totalQueued++;
        
        return new Promise<T>((resolve, reject) => {
          const enqueuedAt = Date.now();
          
          const timeout = setTimeout(() => {
            // Timeout: remover da fila
            const idx = this.queue.findIndex(item => item.timeout === timeout);
            if (idx >= 0) {
              this.queue.splice(idx, 1);
              this.totalTimeouts++;
              log.warn("Rate limiter timeout", { 
                waitedMs: Date.now() - enqueuedAt,
                queueSize: this.queue.length 
              });
            }
            reject(new Error(`Rate limiter timeout: esperou ${Date.now() - enqueuedAt}ms na fila`));
          }, this.queueTimeoutMs);
    
          this.queue.push({ fn, resolve, reject, timeout, enqueuedAt });
          
          log.debug("Enfileirado no rate limiter", { 
            queueSize: this.queue.length,
            active: this.activeCount 
          });
        });
      }
    
      /**
       * Executa com delay minimo entre chamadas
       */
      private async executeWithDelay<T>(fn: () => Promise<T>): Promise<T> {
        this.activeCount++;
        
        // Delay minimo entre chamadas
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        if (this.minDelayMs > 0 && timeSinceLastCall < this.minDelayMs) {
          const waitMs = this.minDelayMs - timeSinceLastCall;
          await new Promise(r => setTimeout(r, waitMs));
        }
        
        this.lastCallTime = Date.now();
        
        try {
          const result = await fn();
          this.totalProcessed++;
          return result;
        } finally {
          this.activeCount--;
          this.processQueue();
        }
      }
    
      /**
       * Processa proximo item da fila
       */
      private processQueue(): void {
        if (this.queue.length === 0) return;
        if (this.activeCount >= this.maxConcurrent) return;
    
        const item = this.queue.shift()!;
        clearTimeout(item.timeout);
        
        const waitTime = Date.now() - item.enqueuedAt;
        this.totalWaitTime += waitTime;
        
        log.debug("Processando item da fila", { 
          waitTimeMs: waitTime,
          remaining: this.queue.length 
        });
    
        this.executeWithDelay(item.fn)
          .then(item.resolve)
          .catch(item.reject);
      }
    
      stats(): {
        maxConcurrent: number;
        activeCount: number;
        queueSize: number;
        totalProcessed: number;
        totalQueued: number;
        totalTimeouts: number;
        avgWaitMs: number;
        minDelayMs: number;
      } {
        return {
          maxConcurrent: this.maxConcurrent,
          activeCount: this.activeCount,
          queueSize: this.queue.length,
          totalProcessed: this.totalProcessed,
          totalQueued: this.totalQueued,
          totalTimeouts: this.totalTimeouts,
          avgWaitMs: this.totalProcessed > 0 
            ? Math.round(this.totalWaitTime / this.totalProcessed) 
            : 0,
          minDelayMs: this.minDelayMs,
        };
      }
    }
    
    // Singleton
    let _rateLimiter: RateLimiter | null = null;
    
    export function getRateLimiter(): RateLimiter {
      if (!_rateLimiter) {
        _rateLimiter = new RateLimiter();
        log.info("Rate Limiter inicializado", _rateLimiter.stats());
      }
      return _rateLimiter;
    }
    
    export function resetRateLimiter(): void {
      _rateLimiter = null;
    }
    