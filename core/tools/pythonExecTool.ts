import { exec } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import util from "util";

const execAsync = util.promisify(exec);

export const pythonExecTool = {
  type: "function",
  function: {
    name: "execute_python",
    description: "Execute Python code and return stdout/stderr",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Python code to execute"
        }
      },
      required: ["code"]
    }
  },

  async handler({ code }: { code: string }) {

    const filePath = join(tmpdir(), `agent_script_${Date.now()}.py`);

    const wrappedCode = `
import sys

try:
${code.split("\n").map(l => "    " + l).join("\n")}
except Exception as e:
    print("ERROR:", e, file=sys.stderr)
`;

    try {

      writeFileSync(filePath, wrappedCode);

      const { stdout, stderr } = await execAsync(
        `python "${filePath}"`,
        { timeout: 10000 }
      );

      unlinkSync(filePath);

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: true
      };

    } catch (error: any) {

      try { unlinkSync(filePath); } catch {}

      return {
        stdout: error.stdout?.trim(),
        stderr: error.stderr?.trim(),
        success: false
      };
    }
  }
};