import { ToolDefinition } from "../core/tools/toolDefinition";

export const getCurrentDateTimeTool: ToolDefinition<{}, { datetime: string }> = {
  name: "getCurrentDateTime",
  description: "Retorna a data e hora atual do sistema",
  parameters: {
    type: "object",
    properties: {},
    required: []
  },
  execute: async () => {
    return {
      datetime: new Date().toISOString()
    }
  }
}