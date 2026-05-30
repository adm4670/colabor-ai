/**
     * Local Agent Types
     */
    export interface ToolResult {
      result: string;
      error?: string;
    }
    
    export interface LocalAgent {
      name: string;
      description: string;
      tools: string[];
      execute: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>;
    }
    