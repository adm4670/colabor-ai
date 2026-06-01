// Logger estruturado com cores, contexto, timers e rastreio
    // Usa picocolors para saida colorida no terminal
    // Niveis: debug, info, warn, error
    // Loga no console (colorido) E em arquivo (logs/YYYY-MM-DD.log)
    
    import picocolors from "picocolors";
    
    type LogLevel = "debug" | "info" | "warn" | "error";
    
    interface LogEntry {
      level: LogLevel;
      message: string;
      timestamp: string;
      context?: string;
      meta?: Record<string, any>;
    }
    
    interface TimerEntry {
      label: string;
      start: number;
      context?: string;
    }
    
    const LOG_LEVELS: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    
    const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
    const ENABLE_COLORS = process.env.NO_COLOR !== "1" && process.env.CI !== "true";
    
    function levelColor(level: LogLevel, text: string): string {
      if (!ENABLE_COLORS) return text;
      switch (level) {
        case "debug": return picocolors.dim(text);
        case "info":  return picocolors.blue(text);
        case "warn":  return picocolors.yellow(text);
        case "error": return picocolors.red(text);
      }
    }
    
    function contextColor(text: string): string {
      if (!ENABLE_COLORS) return text;
      return picocolors.cyan(text);
    }
    
    function timestampColor(text: string): string {
      if (!ENABLE_COLORS) return text;
      return picocolors.dim(text);
    }
    
    function formatTimestamp(): string {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const ms = String(now.getMilliseconds()).padStart(3, "0");
      return `${hh}:${mm}:${ss}.${ms}`;
    }
    
    function shouldLog(level: LogLevel): boolean {
      return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
    }
    
    function formatEntry(entry: LogEntry): string {
      const ts = timestampColor(entry.timestamp);
      const lvl = levelColor(entry.level, `[${entry.level.toUpperCase()}]`);
      const ctx = entry.context ? ` ${contextColor(`[${entry.context}]`)}` : "";
      const base = `${ts} ${lvl}${ctx} ${entry.message}`;
      if (entry.meta && Object.keys(entry.meta).length > 0) {
        const metaStr = JSON.stringify(entry.meta, null, 0);
        return `${base} ${timestampColor(metaStr)}`;
      }
      return base;
    }
    
    function createEntry(level: LogLevel, message: string, context?: string, meta?: Record<string, any>): LogEntry {
      return {
        level,
        message,
        timestamp: formatTimestamp(),
        context,
        meta,
      };
    }
    
    /** Escreve log em arquivo (transporte adicional persistente) */
    function logToFile(level: string, message: string) {
      try {
        const fs = require("fs");
        const path = require("path");
        const logDir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const date = new Date().toISOString().split("T")[0];
        const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(path.join(logDir, `${date}.log`), line, "utf8");
      } catch { /* nao-critico */ }
    }
    
    function logAndPersist(level: LogLevel, formatted: string, plainMessage: string) {
      switch (level) {
        case "error": console.error(formatted); break;
        case "warn":  console.warn(formatted);  break;
        case "info":  console.log(formatted);   break;
        case "debug": console.debug(formatted); break;
      }
      logToFile(level, plainMessage);
    }
    
    // Timers ativos para medicao de performance
    const activeTimers = new Map<string, TimerEntry>();
    
    export const logger = {
      debug(message: string, context?: string, meta?: Record<string, any>) {
        if (shouldLog("debug")) {
          const entry = createEntry("debug", message, context, meta);
          logAndPersist("debug", formatEntry(entry), `[DEBUG] ${context ? `[${context}] ` : ""}${message}`);
        }
      },
    
      info(message: string, context?: string, meta?: Record<string, any>) {
        if (shouldLog("info")) {
          const entry = createEntry("info", message, context, meta);
          logAndPersist("info", formatEntry(entry), `[INFO] ${context ? `[${context}] ` : ""}${message}`);
        }
      },
    
      warn(message: string, context?: string, meta?: Record<string, any>) {
        if (shouldLog("warn")) {
          const entry = createEntry("warn", message, context, meta);
          logAndPersist("warn", formatEntry(entry), `[WARN] ${context ? `[${context}] ` : ""}${message}`);
        }
      },
    
      error(message: string, context?: string, meta?: Record<string, any>) {
        if (shouldLog("error")) {
          const entry = createEntry("error", message, context, meta);
          logAndPersist("error", formatEntry(entry), `[ERROR] ${context ? `[${context}] ` : ""}${message}`);
        }
      },
    
      /**
       * Cria um sub-logger com contexto fixo.
       * Ex: const agentLog = logger.withContext("AGENT");
       *     agentLog.info("mensagem"); // -> "[HH:MM:SS.ms] [INFO] [AGENT] mensagem"
       */
      withContext(context: string) {
        return {
          debug: (message: string, meta?: Record<string, any>) => this.debug(message, context, meta),
          info: (message: string, meta?: Record<string, any>) => this.info(message, context, meta),
          warn: (message: string, meta?: Record<string, any>) => this.warn(message, context, meta),
          error: (message: string, meta?: Record<string, any>) => this.error(message, context, meta),
          startTimer: (label: string) => this.startTimer(label, context),
          endTimer: (label: string) => this.endTimer(label),
          withContext: (subContext: string) => this.withContext(`${context}:${subContext}`),
        };
      },
    
      /**
       * Inicia um timer para medir performance.
       * Use endTimer() para parar e logar a duracao.
       */
      startTimer(label: string, context?: string) {
        const key = `${context || "global"}:${label}`;
        activeTimers.set(key, { label, start: Date.now(), context });
      },
    
      /**
       * Finaliza um timer e loga a duracao.
       * Retorna a duracao em ms.
       */
      endTimer(label: string): number | null {
        for (const [key, timer] of activeTimers) {
          if (timer.label === label) {
            const duration = Date.now() - timer.start;
            activeTimers.delete(key);
            const ctx = timer.context || "PERF";
            const color = duration > 5000 ? picocolors.red : duration > 1000 ? picocolors.yellow : picocolors.green;
            const msg = color(`${label}: ${duration}ms`);
            if (shouldLog("info")) {
              const ts = timestampColor(formatTimestamp());
              const ctxStr = contextColor(`[${ctx}]`);
              console.log(`${ts} ${levelColor("info", "[PERF]")} ${ctxStr} ${msg}`);
            }
            logToFile("info", `[PERF] [${ctx}] ${label}: ${duration}ms`);
            return duration;
          }
        }
        return null;
      },
    
      /**
       * Loga uma linha separadora visual para marcar momentos importantes
       */
      separator(title?: string) {
        if (shouldLog("info")) {
          const line = title
            ? `${picocolors.dim("─".repeat(3))} ${picocolors.bold(title)} ${picocolors.dim("─".repeat(50))}`
            : picocolors.dim("─".repeat(60));
          console.log("");
          console.log(line);
          console.log("");
        }
      },
    };
    
    export type Logger = typeof logger;
    
    