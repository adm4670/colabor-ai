// =============================================================
    // Logger Centralizado — Cores ANSI, Timestamps, Niveis, Prefixo
    // =============================================================
    // Uso:
    //   import { logger } from "../src/core/logger";
    //   const log = logger("HTTP");
    //   log.info("Servidor iniciado na porta 3000");
    //   log.error("Falha na conexao", { err: e.message });
    //   log.debug("Payload recebido", { body });
    // =============================================================
    
    type LogLevel = "debug" | "info" | "warn" | "error";
    
    // Cores ANSI para terminal
    const COLORS: Record<LogLevel, string> = {
      debug: "\x1b[90m",  // Cinza
      info:  "\x1b[36m",  // Ciano
      warn:  "\x1b[33m",  // Amarelo
      error: "\x1b[31m",  // Vermelho
    };
    
    const RESET = "\x1b[0m";
    const BOLD = "\x1b[1m";
    const DIM = "\x1b[2m";
    
    // Niveis de log (numero maior = mais critico)
    const LEVEL_ORDER: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    
    // Nivel atual via environment ou default "info"
    const currentLevel: LogLevel =
      (process.env.LOG_LEVEL as LogLevel) || "info";
    
    function shouldLog(level: LogLevel): boolean {
      return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
    }
    
    /**
     * Formata timestamp no formato HH:MM:SS.mmm
     * Exemplo: 14:32:01.456
     */
    function formatTimestamp(): string {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const ms = String(now.getMilliseconds()).padStart(3, "0");
      return `${hh}:${mm}:${ss}.${ms}`;
    }
    
    /**
     * Logger factory — retorna um logger com prefixo fixo do modulo
     *
     * @param moduleName Nome do modulo (ex: "HTTP", "ORCH", "AGENT")
     * @returns Objeto com .info(), .warn(), .error(), .debug()
     */
    export function logger(moduleName: string) {
      // Prefixo fixo do modulo, ex: "[HTTP]"
      const prefix = `[${moduleName}]`;
    
      function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
        if (!shouldLog(level)) return;
    
        const timestamp = formatTimestamp();
        const color = COLORS[level];
        const levelLabel = level.toUpperCase().padEnd(5); // "INFO ", "WARN ", etc.
    
        // Monta a linha:  14:32:01.456  INFO  [HTTP] Mensagem
        let line = `${DIM}${timestamp}${RESET}  ${color}${BOLD}${levelLabel}${RESET}  ${color}${prefix}${RESET} ${message}`;
    
        if (meta && Object.keys(meta).length > 0) {
          try {
            const metaStr = JSON.stringify(meta, null, 0);
            line += `  ${DIM}${metaStr}${RESET}`;
          } catch {
            line += `  ${DIM}[unserializable meta]${RESET}`;
          }
        }
    
        switch (level) {
          case "error":
            console.error(line);
            break;
          case "warn":
            console.warn(line);
            break;
          case "debug":
            console.debug(line);
            break;
          default:
            console.log(line);
        }
      }
    
      return {
        info(message: string, meta?: Record<string, unknown>) {
          log("info", message, meta);
        },
        warn(message: string, meta?: Record<string, unknown>) {
          log("warn", message, meta);
        },
        error(message: string, meta?: Record<string, unknown>) {
          log("error", message, meta);
        },
        debug(message: string, meta?: Record<string, unknown>) {
          log("debug", message, meta);
        },
      };
    }
    
    // Logger generico sem prefixo (fallback)
    export const defaultLogger = logger("APP");