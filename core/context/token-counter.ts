/**
     * TokenCounter - Contagem precisa de tokens usando tiktoken.
     *
     * Substitui a estimativa chars/4 por contagem real via encoding cl100k_base.
     * Com fallback para estimativa caso tiktoken falhe.
     *
     * Inspirado no tokenCount do claude-code (baseado em API responses reais).
     */
    
    import { get_encoding, Tiktoken } from "tiktoken";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface TokenCountResult {
      tokens: number;
      method: "tiktoken" | "estimate";
    }
    
    // ============================================================
    // TokenCounter
    // ============================================================
    
    export class TokenCounter {
      private encoder: Tiktoken | null = null;
      private readonly ENCODING_NAME = "cl100k_base";
    
      constructor() {
        this.initEncoder();
      }
    
      private initEncoder(): void {
        try {
          this.encoder = get_encoding(this.ENCODING_NAME);
          logger.info(`[TokenCounter] Encoder '${this.ENCODING_NAME}' inicializado`);
        } catch (err) {
          logger.warn(
            `[TokenCounter] Falha ao inicializar tiktoken: ${err}. Usando estimativa chars/4.`
          );
          this.encoder = null;
        }
      }
    
      /** Conta tokens em um texto */
      count(text: string): number {
        if (!text) return 0;
    
        if (this.encoder) {
          try {
            return this.encoder.encode(text).length;
          } catch {
            // Fallback abaixo
          }
        }
    
        // Fallback: estimativa chars/4
        return Math.ceil(text.length / 4);
      }
    
      /** Conta tokens com metadados do metodo usado */
      countWithMethod(text: string): TokenCountResult {
        if (!text) return { tokens: 0, method: "estimate" };
    
        if (this.encoder) {
          try {
            const tokens = this.encoder.encode(text).length;
            return { tokens, method: "tiktoken" };
          } catch {
            // Fallback
          }
        }
    
        return {
          tokens: Math.ceil(text.length / 4),
          method: "estimate",
        };
      }
    
      /** Trunca texto para caber em um limite de tokens, preservando palavras */
      truncateToTokenLimit(text: string, limit: number): string {
        if (!text) return "";
        if (limit <= 0) return "";
    
        const count = this.count(text);
        if (count <= limit) return text;
    
        // Estrategia: truncar proporcionalmente e depois cortar ate caber
        // Usamos a proporcao (limit / count) para estimar o numero de caracteres
        const ratio = (limit / count) * 0.9; // 90% pra margem de seguranca
        let truncated = text.slice(0, Math.floor(text.length * ratio));
    
        // Ajuste fino: corta ate caber ou ate chegar num espaco
        while (this.count(truncated) > limit && truncated.length > 0) {
          const lastSpace = truncated.lastIndexOf(" ");
          if (lastSpace > 0) {
            truncated = truncated.slice(0, lastSpace);
          } else {
            truncated = truncated.slice(0, -1);
          }
        }
    
        return truncated;
      }
    
      /** Estima tokens em um array de mensagens (considera overhead de role) */
      countMessages(
        messages: Array<{ role: string; content?: string | null; name?: string }>
      ): number {
        let total = 0;
        for (const msg of messages) {
          // Overhead do formato de mensagem (~4 tokens por mensagem)
          total += 4;
          if (msg.content) total += this.count(msg.content);
          if (msg.name) total += this.count(msg.name);
          if (msg.role) total += this.count(msg.role);
        }
        return total;
      }
    
      /** Libera recursos do encoder */
      dispose(): void {
        if (this.encoder) {
          try {
            this.encoder.free();
          } catch {
            // ignore
          }
          this.encoder = null;
        }
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: TokenCounter | null = null;
    
    export function getTokenCounter(): TokenCounter {
      if (!instance) {
        instance = new TokenCounter();
      }
      return instance;
    }
    
    // ============================================================
    // Funcões utilitárias exportadas
    // ============================================================
    
    export function countTokens(text: string): number {
      return getTokenCounter().count(text);
    }
    
    export function truncateToTokenLimit(
      text: string,
      limit: number
    ): string {
      return getTokenCounter().truncateToTokenLimit(text, limit);
    }
    