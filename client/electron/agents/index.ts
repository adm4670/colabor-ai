/**
     * Local Agents Registry
     * Register all local agents and their IPC handlers.
     */
    import { IpcMain } from "electron";
    import { fileSystemAgent } from "./file-system";
    import { shellAgent } from "./shell";
    import { desktopAgent } from "./desktop";
    import type { LocalAgent } from "./types";
    
    const agents: LocalAgent[] = [fileSystemAgent, shellAgent, desktopAgent];
    
    export function registerLocalAgents(ipcMain: IpcMain): void {
      // Run a tool on a specific agent
      ipcMain.handle("agent:runTool", async (_event, tool: string, args: Record<string, unknown>) => {
        for (const agent of agents) {
          if (agent.tools.includes(tool)) {
            return agent.execute(tool, args);
          }
        }
        return { result: "", error: `Tool not found: ${tool}` };
      });
    
      // Get list of available tools
      ipcMain.handle("agent:getAvailableTools", async () => {
        const tools: { tool: string; agent: string; description: string }[] = [];
        for (const agent of agents) {
          for (const tool of agent.tools) {
            tools.push({ tool, agent: agent.name, description: agent.description });
          }
        }
        return tools;
      });
    
      console.log(`[LocalAgents] Registered ${agents.length} agents with ${agents.reduce((acc, a) => acc + a.tools.length, 0)} tools`);
    }
    
    export { agents };
    