// =============================================================
    // Logger Centralizado - Cores ANSI, Timestamps, Niveis, Prefixo
    // =============================================================
    // Uso direto:
    //   import { logger } from "../utils/logger";
    //   logger.info("mensagem");
    //   logger.warn("aviso", { meta: "dado" });
    //
    // Uso com prefixo de modulo:
    //   import { createLogger } from "../utils/logger";
    //   const log = createLogger("HTTP");
    //   log.info("Servidor iniciado");
    // =============================================================
    
    type LogLevel = "debug" | "info" | "warn" | "error";
    
    const COLORS: Record<LogLevel, string> = {
      debug: "\x1b[90m",  // Cinza
      info:  "\x1b[36m",  // Ciano
      warn:  "\x1b[33m",  // Amarelo
      error: "\x1b[31m",  // Vermelho
    };
    
    const RESET = "\x1b[0m";
    const BOLD = "\x1b[1m";
    const DIM = "\x1b[2m";
    
    const LEVEL_ORDER: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    
    const currentLevel: LogLevel =
      (process.env.LOG_LEVEL as LogLevel) || "info";
    
    function shouldLog(level: LogLevel): boolean {
      return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
    }
    
    function formatTimestamp(): string {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const ms = String(now.getMilliseconds()).padStart(3, "0");
      return `${hh}:${mm}:${ss}.${ms}`;
    }
    
    function buildLine(
      level: LogLevel,
      prefix: string,
      message: string,
      meta?: Record<string, unknown>
    ): string {
      const timestamp = formatTimestamp();
      const color = COLORS[level];
      const levelLabel = level.toUpperCase().padEnd(5);
    
      let line = `${DIM}${timestamp}${RESET}  ${color}${BOLD}${levelLabel}${RESET}  ${color}${prefix}${RESET} ${message}`;
    
      if (meta && Object.keys(meta).length > 0) {
        try {
          line += `  ${DIM}${JSON.stringify(meta)}${RESET}`;
        } catch {
          line += `  ${DIM}[unserializable]${RESET}`;
        }
      }
    
      return line;
    }
    
    function logToFile(level: string, line: string) {
      try {
        const fs = require("fs");
        const path = require("path");
        const logDir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const date = new Date().toISOString().split("T")[0];
        const plainLine = line.replace(/\x1b\[[0-9;]*m/g, "") + "\n";
        fs.appendFileSync(path.join(logDir, date + ".log"), plainLine, "utf8");
      } catch { /* nao-critico */ }
    }
    
    // Logger sem prefixo (padrao) - para manter compatibilidade
    export const logger = {
      debug(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("debug")) return;
        const line = buildLine("debug", "[APP]", message, meta);
        console.debug(line);
        logToFile("debug", line);
      },
      info(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("info")) return;
        const line = buildLine("info", "[APP]", message, meta);
        console.log(line);
        logToFile("info", line);
      },
      warn(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("warn")) return;
        const line = buildLine("warn", "[APP]", message, meta);
        console.warn(line);
        logToFile("warn", line);
      },
      error(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("error")) return;
        const line = buildLine("error", "[APP]", message, meta);
        console.error(line);
        logToFile("error", line);
      },
    };
    
    // Logger com prefixo de modulo (factory)
    export function createLogger(moduleName: string) {
      const prefix = `[${moduleName}]`;
    
      return {
        debug(message: string, meta?: Record<string, unknown>) {
          if (!shouldLog("debug")) return;
          const line = buildLine("debug", prefix, message, meta);
          console.debug(line);
          logToFile("debug", line);
        },
        info(message: string, meta?: Record<string, unknown>) {
          if (!shouldLog("info")) return;
          const line = buildLine("info", prefix, message, meta);
          console.log(line);
          logToFile("info", line);
        },
        warn(message: string, meta?: Record<string, unknown>) {
          if (!shouldLog("warn")) return;
          const line = buildLine("warn", prefix, message, meta);
          console.warn(line);
          logToFile("warn", line);
        },
        error(message: string, meta?: Record<string, unknown>) {
          if (!shouldLog("error")) return;
          const line = buildLine("error", prefix, message, meta);
          console.error(line);
          logToFile("error", line);
        },
      };
    }
    