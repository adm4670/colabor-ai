// =============================================================
    // Logger Centralizado - Cloud Server
    // Cores ANSI, Timestamps HH:MM:SS.mmm, Niveis, Prefixo
    // =============================================================
    
    type LogLevel = "debug" | "info" | "warn" | "error";
    
    const COLORS: Record<LogLevel, string> = {
      debug: "\x1b[90m",
      info:  "\x1b[36m",
      warn:  "\x1b[33m",
      error: "\x1b[31m",
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
    
    // Logger sem prefixo (padrao)
    export const logger = {
      debug(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("debug")) return;
        const line = buildLine("debug", "[CLOUD]", message, meta);
        console.debug(line);
      },
      info(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("info")) return;
        const line = buildLine("info", "[CLOUD]", message, meta);
        console.log(line);
      },
      warn(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("warn")) return;
        const line = buildLine("warn", "[CLOUD]", message, meta);
        console.warn(line);
      },
      error(message: string, meta?: Record<string, unknown>) {
        if (!shouldLog("error")) return;
        const line = buildLine("error", "[CLOUD]", message, meta);
        console.error(line);
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
        },
        info(message: string, meta?: Record<string, unknown>) {
          if (!shouldLog("info")) return;
          const line = buildLine("info", prefix, message, meta);
          console.log(line);
        },
        warn(message: string, meta?: Record<string, unknown>) {
          if (!shouldLog("warn")) return;
          const line = buildLine("warn", prefix, message, meta);
          console.warn(line);
        },
        error(message: string, meta?: Record<string, unknown>) {
          if (!shouldLog("error")) return;
          const line = buildLine("error", prefix, message, meta);
          console.error(line);
        },
      };
    }
    