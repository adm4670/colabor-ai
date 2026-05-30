"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonAgent = void 0;
/**
 * PythonAgent - Executa codigo Python no servidor.
 * Cloud edition: sandboxed execution.
 */
const child_process_1 = require("child_process");
const logger_1 = require("../utils/logger");
class PythonAgent {
    name = "python_code";
    description = "Execute Python code and return stdout/stderr";
    async run(code) {
        logger_1.logger.info(`[PythonAgent] Executando codigo Python (${code.length} chars)`);
        try {
            // Write to temp file and execute
            const fs = await Promise.resolve().then(() => __importStar(require("fs")));
            const path = await Promise.resolve().then(() => __importStar(require("path")));
            const os = await Promise.resolve().then(() => __importStar(require("os")));
            const tmpDir = os.tmpdir();
            const tmpFile = path.join(tmpDir, `colabor_ai_${Date.now()}.py`);
            fs.writeFileSync(tmpFile, code, "utf-8");
            // Timeout de 30 segundos
            const result = (0, child_process_1.execSync)(`python "${tmpFile}"`, {
                timeout: 30000,
                maxBuffer: 1024 * 1024, // 1MB
                encoding: "utf-8",
            });
            // Cleanup
            try {
                fs.unlinkSync(tmpFile);
            }
            catch {
                /* ignore */
            }
            return result || "(sem output)";
        }
        catch (err) {
            logger_1.logger.error(`[PythonAgent] Erro: ${err.message}`);
            return `Error: ${err.stderr || err.message}`;
        }
    }
}
exports.PythonAgent = PythonAgent;
//# sourceMappingURL=python.js.map