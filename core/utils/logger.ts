// Logger estruturado (lightweight, sem dependencias externas)
    // Niveis: debug, info, warn, error
    
    type LogLevel = "debug" | "info" | "warn" | "error";
    
    interface LogEntry {
      level: LogLevel;
      message: string;
      timestamp: string;
      meta?: Record<string, any>;
    }
    
    const LOG_LEVELS: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    
    const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
    
    function shouldLog(level: LogLevel): boolean {
      return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
    }
    
    function formatEntry(entry: LogEntry): string {
      const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
      if (entry.meta && Object.keys(entry.meta).length > 0) {
        return `${base} ${JSON.stringify(entry.meta)}`;
      }
      return base;
    }
    
    function createEntry(level: LogLevel, message: string, meta?: Record<string, any>): LogEntry {
      return {
        level,
        message,
        timestamp: new Date().toISOString(),
        meta,
      };
    }
    
    export const logger = {
      debug(message: string, meta?: Record<string, any>) {
        if (shouldLog("debug")) {
          const entry = createEntry("debug", message, meta);
          console.debug(formatEntry(entry));
        }
      },
    
      info(message: string, meta?: Record<string, any>) {
        if (shouldLog("info")) {
          const entry = createEntry("info", message, meta);
          console.log(formatEntry(entry));
        }
      },
    
      warn(message: string, meta?: Record<string, any>) {
        if (shouldLog("warn")) {
          const entry = createEntry("warn", message, meta);
          console.warn(formatEntry(entry));
        }
      },
    
      error(message: string, meta?: Record<string, any>) {
        if (shouldLog("error")) {
          const entry = createEntry("error", message, meta);
          console.error(formatEntry(entry));
        }
      },
    };
    