import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

export const shellExecTool = {
  type: "function",

  function: {
    name: "execute_shell",
    description: "Execute a shell command in the system and return stdout/stderr",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute (e.g., npm install, git status, mkdir app)"
        },
        cwd: {
          type: "string",
          description: "Optional working directory where the command should run"
        }
      },
      required: ["command"]
    }
  },

  async handler({
    command,
    cwd
  }: {
    command: string;
    cwd?: string;
  }) {

    const blockedCommands = [
      "rm -rf /",
      "shutdown",
      "reboot",
      ":(){:|:&};:"
    ];

    if (blockedCommands.some(cmd => command.includes(cmd))) {
      throw new Error(`Blocked dangerous command: ${command}`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

    } catch (error: any) {

      return {
        success: false,
        stdout: error.stdout?.toString()?.trim() || "",
        stderr: error.stderr?.toString()?.trim() || error.message
      };
    }
  }
};