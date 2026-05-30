/**
 * Tool Protocol - Message types for cloud <-> client communication
 *
 * Cloud sends tool_call to client, client executes and returns tool_result.
 * The orchestrator pauses until the result arrives.
 */

export interface ToolCallMessage {
  type: "tool_call";
  /** Unique request ID for matching result */
  id: string;
  /** Agent name: file_system | shell | desktop */
  agent: string;
  /** Tool/function name to execute */
  tool: string;
  /** Parameters for the tool */
  params: Record<string, unknown>;
  /** Whether user confirmation is required before executing */
  requireConfirmation: boolean;
  /** Session ID */
  sessionId: string;
  /** Human-readable description of what will be done */
  description: string;
}

export interface ToolResultMessage {
  type: "tool_result";
  /** Matches the tool_call id */
  id: string;
  /** "ok" | "error" | "cancelled" */
  status: "ok" | "error" | "cancelled";
  /** Result data (if status=ok) */
  result?: string;
  /** Error message (if status=error) */
  error?: string;
  /** Session ID */
  sessionId: string;
}

export interface StreamChunkMessage {
  /** "text" | "tool_call" | "progress" | "end" | "error" */
  chunkType: string;
  content: string;
  agent?: string;
  sessionId: string;
}

export type WSServerMessage =
  | { type: "tool_call"; payload: ToolCallMessage }
  | { type: "stream"; payload: StreamChunkMessage }
  | { type: "connected"; payload: { sessionId: string; message: string; userId?: string } }
  | { type: "pong"; payload: { timestamp: number } }
  | { type: "error"; payload: { message: string; sessionId?: string } }
  | {
      type: "confirmation_required";
      payload: { id: string; agent: string; tool: string; description: string };
    };

export type WSClientMessage =
  | { type: "tool_result"; payload: ToolResultMessage }
  | { type: "chat"; payload: { message: string } }
  | { type: "ping"; payload?: unknown }
  | { type: "confirmation_response"; payload: { id: string; approved: boolean } };

/** Pending tool call: stored on server while waiting for client response */
export interface PendingToolCall {
  id: string;
  resolve: (result: ToolResultMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  message: ToolCallMessage;
}
