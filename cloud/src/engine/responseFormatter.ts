// ============================================================
    // ResponseFormatter - Formata respostas dos agentes
    // ============================================================
    
    export class ResponseFormatter {
      static formatSuccess(data: any, message?: string) {
        return {
          success: true,
          data,
          message: message || "Operacao concluida com sucesso",
          timestamp: new Date().toISOString(),
        };
      }
    
      static formatError(error: string, code = "INTERNAL_ERROR") {
        return {
          success: false,
          error,
          code,
          timestamp: new Date().toISOString(),
        };
      }
    
      static formatAgentResponse(
        response: string,
        agentName: string,
        conversationId: string
      ) {
        return {
          success: true,
          response,
          agent: agentName,
          conversationId,
          timestamp: new Date().toISOString(),
        };
      }
    
      static formatToolResult(
        toolName: string,
        result: any,
        executedIn: "edge" | "cloud"
      ) {
        return {
          success: true,
          tool: toolName,
          result,
          executedIn,
          timestamp: new Date().toISOString(),
        };
      }
    }
    