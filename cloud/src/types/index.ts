// ============================================================
// Tipos compartilhados do colabor-ai cloud
// ============================================================

export interface CloudMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  timestamp?: number;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  token?: string;
}

export interface ChatResponse {
  type: "text" | "tool_call" | "error" | "end" | "progress";
  content: string;
  agent?: string;
  sessionId: string;
}

export interface AuthPayload {
  userId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface ToolCallRequest {
  tool: string;
  args: Record<string, unknown>;
  requestId: string;
}

export interface ToolCallResponse {
  requestId: string;
  result: string;
  error?: string;
}

export interface WSMessage {
  type: "chat" | "auth" | "tool_result" | "ping";
  payload: unknown;
}

export type LLMProviderType = "deepseek" | "openai";

export interface LLMProviderConfig {
  type: LLMProviderType;
  apiKey: string;
  baseURL: string;
}
