/**
     * Shell Agent
     * Executa comandos PowerShell e CMD no Windows.
     */
    import { execSync } from "child_process";
    import type { ToolResult } from "./types";
    
    export const shellAgent = {
      name: "shell",
      description: "Executar comandos PowerShell, CMD e scripts no sistema Windows",
      tools: ["run_cmd", "run_powershell", "get_env", "which"],
    
      async execute(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
        try {
          const command = args.command as string;
          const timeout = (args.timeout as number) || 30000;
    
          switch (tool) {
            case "run_cmd": {
              if (!command) return { result: "", error: "command required" };
              const output = execSync(command, {
                timeout,
                maxBuffer: 1024 * 1024,
                encoding: "utf-8",
                shell: "cmd.exe",
              });
              return { result: output || "(no output)" };
            }
            case "run_powershell": {
              if (!command) return { result: "", error: "command required" };
              const output = execSync(`powershell -Command "${command.replace(/"/g, '\\"')}"`, {
                timeout,
                maxBuffer: 1024 * 1024,
                encoding: "utf-8",
              });
              return { result: output || "(no output)" };
            }
            case "get_env": {
              const varName = args.name as string;
              if (varName) {
                return { result: process.env[varName] || `(not set: ${varName})` };
              }
              // Return common env vars
              const common = ["PATH", "USERPROFILE", "TEMP", "COMPUTERNAME", "USERNAME", "OS"];
              const envs = common.map((k) => `${k}=${process.env[k] || ""}`);
              return { result: envs.join("\n") };
            }
            case "which": {
              const prog = args.program as string;
              if (!prog) return { result: "", error: "program name required" };
              try {
                const output = execSync(`where ${prog}`, { encoding: "utf-8", timeout: 5000 });
                return { result: output.trim() };
              } catch {
                return { result: `Program not found: ${prog}` };
              }
            }
            default:
              return { result: "", error: `Unknown tool: ${tool}` };
          }
        } catch (err: any) {
          return { result: "", error: err.stderr || err.message };
        }
      },
    };
    