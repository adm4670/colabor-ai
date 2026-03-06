export interface ToolContext {
  agentName: string
  userId: number
}

export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string
  description: string

  parameters?: {
    type: "object"
    properties?: Record<string, any>
    required?: string[]
  }

  execute: (
    args: TArgs,
    context: ToolContext
  ) => Promise<TResult> | TResult
}