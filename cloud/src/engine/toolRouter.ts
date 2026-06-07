// ============================================================
    // ToolRouter - Decide se a tool roda no Edge ou na Cloud
    // Encaminha comandos para o Edge via WebSocket ou executa localmente
    // ============================================================
    
    import { edgeGateway } from "../websocket/edgeGateway";
    import { vectorStore } from "../db/vectorStore";
    
    interface ToolRouteInput {
      userId: string;
      message: string;
      sessionId: string;
    }
    
    interface ToolRouteResult {
      toolName: string;
      result: string;
      executedIn: "edge" | "cloud";
    }
    
    // Tools que rodam no Edge (maquina do usuario)
    const EDGE_TOOLS = [
      "file_system",
      "web_search",
      "shell_exec",
      "python_exec",
      "browser",
      "image_analysis",
    ];
    
    // Tools que rodam na Cloud (diretamente no servidor)
    const CLOUD_TOOLS = [
      "memory_search",
      "memory_store",
      "api_request",
      "task_scheduler",
    ];
    
    class ToolRouter {
      async route(input: ToolRouteInput): Promise<ToolRouteResult | null> {
        const toolName = this.detectTool(input.message);
        if (!toolName) return null;
    
        if (EDGE_TOOLS.includes(toolName)) {
          // Encaminha para o Edge via WebSocket
          const result = await edgeGateway.sendToolCall({
            userId: input.userId,
            sessionId: input.sessionId,
            toolName,
            params: { message: input.message },
          });
    
          return {
            toolName,
            result: result || "Tool executada no Edge",
            executedIn: "edge",
          };
        }
    
        if (CLOUD_TOOLS.includes(toolName)) {
          // Executa diretamente na Cloud
          const result = await this.executeCloudTool(toolName, input);
          return {
            toolName,
            result,
            executedIn: "cloud",
          };
        }
    
        return null;
      }
    
      private detectTool(message: string): string | null {
        const lower = message.toLowerCase();
    
        if (lower.includes("arquivo") || lower.includes("pasta") || lower.includes("ler arquivo")) {
          return "file_system";
        }
        if (lower.includes("buscar") || lower.includes("pesquisar") || lower.includes("internet")) {
          return "web_search";
        }
        if (lower.includes("memoria") || lower.includes("lembrar") || lower.includes("esquecer")) {
          return "memory_search";
        }
        if (lower.includes("api") || lower.includes("github") || lower.includes("clima")) {
          return "api_request";
        }
        if (lower.includes("agendar") || lower.includes("lembrete") || lower.includes("notificar")) {
          return "task_scheduler";
        }
    
        return null;
      }
    
      private async executeCloudTool(
        toolName: string,
        input: ToolRouteInput
      ): Promise<string> {
        switch (toolName) {
          case "memory_search":
            return "Funcao de memoria disponivel via API";
          case "api_request":
            return "Chamada de API processada na Cloud";
          case "task_scheduler":
            return "Tarefa agendada na Cloud";
          default:
            return "Tool executada na Cloud";
        }
      }
    }
    
    export const toolRouter = new ToolRouter();
    