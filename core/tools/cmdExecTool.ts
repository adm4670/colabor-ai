import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

export const cmdExecTool = {
  name: "execute_cmd",
  description: "Execute a command in the system terminal (CMD, PowerShell or Bash).",

  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute in the terminal"
      }
    },
    required: ["command"]
  },

  handler: async ({ command }: { command: string }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024
      });

      return {
        success: true,
        stdout,
        stderr
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr
      };
    }
  }
};