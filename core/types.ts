export type MessageRole = "system" | "user" | "assistant" | "tool";
export interface Message { role: MessageRole; content: string; name?: string; tool_call_id?: string; reasoning_content?: string; tool_calls?: any; }
export interface TranscriptMessage { role: MessageRole; content: string; name?: string; timestamp: number; tool_call_id?: string; }
export interface RunInput { input: string; history?: Message[]; sessionId?: string; }
export interface ReflectionResult { success: "yes"|"partial"|"no"; complete: boolean; missingInfo: string[]; retryDifferent: boolean; learning: string; }
export type LLMProviderType = "openai" | "deepseek";
export interface LLMProviderConfig { type: LLMProviderType; apiKey: string; baseURL: string; }
