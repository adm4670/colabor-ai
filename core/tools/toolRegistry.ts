import { ToolDefinition } from "./toolDefinition";
import { ChatCompletionTool } from "openai/resources/chat/completions";

export class ToolRegistry {

  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition) {

    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' já registrada`)
    }

    this.tools.set(tool.name, tool)

  }

  get(name: string) {

    return this.tools.get(name)

  }

  list() {

    return Array.from(this.tools.values())

  }

  getOpenAITools(): ChatCompletionTool[] {

    return this.list().map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? {
          type: "object",
          properties: {}
        }
      }
    }))

  }

}