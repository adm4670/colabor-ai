/**
 * PythonAgent - Executa codigo Python no servidor.
 * Cloud edition: sandboxed execution.
 */
import { execSync } from "child_process";
import { logger } from "../utils/logger";

export class PythonAgent {
  name = "python_code";
  description = "Execute Python code and return stdout/stderr";

  async run(code: string): Promise<string> {
    logger.info(`[PythonAgent] Executando codigo Python (${code.length} chars)`);

    try {
      // Write to temp file and execute
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, `colabor_ai_${Date.now()}.py`);
      fs.writeFileSync(tmpFile, code, "utf-8");

      // Timeout de 30 segundos
      const result = execSync(`python "${tmpFile}"`, {
        timeout: 30000,
        maxBuffer: 1024 * 1024, // 1MB
        encoding: "utf-8",
      });

      // Cleanup
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }

      return result || "(sem output)";
    } catch (err: any) {
      logger.error(`[PythonAgent] Erro: ${err.message}`);
      return `Error: ${err.stderr || err.message}`;
    }
  }
}
