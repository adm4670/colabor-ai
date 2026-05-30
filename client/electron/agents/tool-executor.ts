/**
     * Tool Executor - Receives ToolCallMessage from cloud,
     * executes via local agents, returns ToolResultMessage.
     */
    import { fileSystemAgent } from "./file-system";
    import { shellAgent } from "./shell";
    import { desktopAgent } from "./desktop";
    import type { LocalAgent, ToolResult } from "./types";
    
    // Message types (mirrored from cloud protocol)
    export interface ToolCallMessage {
      type: "tool_call";
      id: string;
      agent: string;
      tool: string;
      params: Record<string, unknown>;
      requireConfirmation: boolean;
      sessionId: string;
      description: string;
    }
    
    export interface ToolResultMessage {
      type: "tool_result";
      id: string;
      status: "ok" | "error" | "cancelled";
      result?: string;
      error?: string;
      sessionId: string;
    }
    
    // Map agent names to agent instances
    const agentMap: Record<string, LocalAgent> = {
      file_system: fileSystemAgent,
      shell: shellAgent,
      desktop: desktopAgent,
    };
    
    /**
     * Execute a tool call from the cloud.
     * Returns a ToolResultMessage ready to send back.
     */
    export async function executeToolCall(
      toolCall: ToolCallMessage
    ): Promise<ToolResultMessage> {
      const { id, agent, tool, params, sessionId } = toolCall;
    
      console.log(`[ToolExecutor] Executing: ${agent}/${tool} id=${id}`);
    
      const localAgent = agentMap[agent];
      if (!localAgent) {
        return {
          type: "tool_result",
          id,
          status: "error",
          error: `Unknown agent: ${agent}. Available: ${Object.keys(agentMap).join(", ")}`,
          sessionId,
        };
      }
    
      if (!localAgent.tools.includes(tool)) {
        return {
          type: "tool_result",
          id,
          status: "error",
          error: `Unknown tool: ${tool} for agent ${agent}. Available: ${localAgent.tools.join(", ")}`,
          sessionId,
        };
      }
    
      try {
        const result: ToolResult = await localAgent.execute(tool, params);
    
        if (result.error) {
          console.log(`[ToolExecutor] Error from ${agent}/${tool}: ${result.error}`);
          return {
            type: "tool_result",
            id,
            status: "error",
            error: result.error,
            sessionId,
          };
        }
    
        console.log(
          `[ToolExecutor] Success: ${agent}/${tool} resultLen=${(result.result || "").length}`
        );
        return {
          type: "tool_result",
          id,
          status: "ok",
          result: result.result,
          sessionId,
        };
      } catch (err: any) {
        console.error(`[ToolExecutor] Exception in ${agent}/${tool}:`, err.message);
        return {
          type: "tool_result",
          id,
          status: "error",
          error: err.message || "Unknown execution error",
          sessionId,
        };
      }
    }
    
    /**
     * Get list of all available tools for the planner.
     */
    export function getAvailableTools(): { agent: string; tools: string[]; description: string }[] {
      return Object.entries(agentMap).map(([name, agent]) => ({
        agent: name,
        tools: agent.tools,
        description: agent.description,
      }));
    }
    