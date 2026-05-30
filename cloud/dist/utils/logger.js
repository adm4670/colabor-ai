"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const currentLevel = process.env.LOG_LEVEL || "info";
function log(level, ...args) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        if (level === "error") {
            console.error(prefix, ...args);
        }
        else if (level === "warn") {
            console.warn(prefix, ...args);
        }
        else {
            console.log(prefix, ...args);
        }
    }
}
exports.logger = {
    info: (...args) => log("info", ...args),
    warn: (...args) => log("warn", ...args),
    error: (...args) => log("error", ...args),
    debug: (...args) => log("debug", ...args),
};
//# sourceMappingURL=logger.js.map