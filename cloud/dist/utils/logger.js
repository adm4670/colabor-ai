"use strict";
// =============================================================
// Logger Centralizado - Cloud Server
// Cores ANSI, Timestamps HH:MM:SS.mmm, Niveis, Prefixo
// =============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
const COLORS = {
    debug: "\x1b[90m",
    info: "\x1b[36m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const currentLevel = process.env.LOG_LEVEL || "info";
function shouldLog(level) {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}
function formatTimestamp() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
}
function buildLine(level, prefix, message, meta) {
    const timestamp = formatTimestamp();
    const color = COLORS[level];
    const levelLabel = level.toUpperCase().padEnd(5);
    let line = `${DIM}${timestamp}${RESET}  ${color}${BOLD}${levelLabel}${RESET}  ${color}${prefix}${RESET} ${message}`;
    if (meta && Object.keys(meta).length > 0) {
        try {
            line += `  ${DIM}${JSON.stringify(meta)}${RESET}`;
        }
        catch {
            line += `  ${DIM}[unserializable]${RESET}`;
        }
    }
    return line;
}
// Logger sem prefixo (padrao)
exports.logger = {
    debug(message, meta) {
        if (!shouldLog("debug"))
            return;
        const line = buildLine("debug", "[CLOUD]", message, meta);
        console.debug(line);
    },
    info(message, meta) {
        if (!shouldLog("info"))
            return;
        const line = buildLine("info", "[CLOUD]", message, meta);
        console.log(line);
    },
    warn(message, meta) {
        if (!shouldLog("warn"))
            return;
        const line = buildLine("warn", "[CLOUD]", message, meta);
        console.warn(line);
    },
    error(message, meta) {
        if (!shouldLog("error"))
            return;
        const line = buildLine("error", "[CLOUD]", message, meta);
        console.error(line);
    },
};
// Logger com prefixo de modulo (factory)
function createLogger(moduleName) {
    const prefix = `[${moduleName}]`;
    return {
        debug(message, meta) {
            if (!shouldLog("debug"))
                return;
            const line = buildLine("debug", prefix, message, meta);
            console.debug(line);
        },
        info(message, meta) {
            if (!shouldLog("info"))
                return;
            const line = buildLine("info", prefix, message, meta);
            console.log(line);
        },
        warn(message, meta) {
            if (!shouldLog("warn"))
                return;
            const line = buildLine("warn", prefix, message, meta);
            console.warn(line);
        },
        error(message, meta) {
            if (!shouldLog("error"))
                return;
            const line = buildLine("error", prefix, message, meta);
            console.error(line);
        },
    };
}
//# sourceMappingURL=logger.js.map