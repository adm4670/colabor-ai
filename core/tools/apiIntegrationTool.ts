// ============================================================
    // APIIntegration Tool - Chamar APIs REST e GraphQL externas
    // Suporta GET, POST, PUT, DELETE, PATCH com headers customizados
    // ============================================================
    
    import axios from "axios";
    
    export const apiIntegrationTool = {
      type: "function" as const,
    
      function: {
        name: "api_request",
        description: "Chama APIs REST/GraphQL externas. Suporta GET, POST, PUT, DELETE, PATCH. Permite headers customizados e corpo da requisicao. Ideal para integrar com servicos como GitHub, WeatherAPI, etc.",
        parameters: {
          type: "object",
          properties: {
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
              description: "Metodo HTTP (default: GET)"
            },
            url: {
              type: "string",
              description: "URL completa da API (obrigatorio)"
            },
            headers: {
              type: "string",
              description: "Headers customizados em formato JSON (opcional, ex: {Authorization: Bearer token})"
            },
            body: {
              type: "string",
              description: "Corpo da requisicao em formato JSON (opcional, para POST/PUT/PATCH)"
            },
            timeout: {
              type: "number",
              description: "Timeout em milissegundos (default: 15000)"
            }
          },
          required: ["url"]
        }
      },
    
      async handler({
        method,
        url,
        headers: headersStr,
        body,
        timeout
      }: {
        method?: string;
        url: string;
        headers?: string;
        body?: string;
        timeout?: number;
      }): Promise<any> {
        try {
          if (!url) {
            return { success: false, message: "URL obrigatoria." };
          }
    
          // Parse headers de string JSON para objeto
          let parsedHeaders: Record<string, string> = {};
          if (headersStr) {
            try {
              parsedHeaders = JSON.parse(headersStr);
            } catch {
              return { success: false, message: "Headers invalidos: formato JSON esperado." };
            }
          }
    
          // Parse body de string JSON
          let parsedBody: any = undefined;
          if (body) {
            try {
              parsedBody = JSON.parse(body);
            } catch {
              return { success: false, message: "Body invalido: formato JSON esperado." };
            }
          }
    
          const httpMethod = (method || "GET").toUpperCase();
          const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
          
          if (!validMethods.includes(httpMethod)) {
            return { success: false, message: "Metodo invalido: use GET, POST, PUT, DELETE ou PATCH." };
          }
    
          const config: Record<string, any> = {
            method: httpMethod,
            url,
            headers: {
              "User-Agent": "colabor-ai/1.0",
              "Accept": "application/json",
              ...parsedHeaders,
            },
            timeout: timeout || 15000,
            maxRedirects: 5,
            validateStatus: () => true, // Aceita qualquer status para retornar ao agente
          };
    
          if (parsedBody && ["POST", "PUT", "PATCH"].includes(httpMethod)) {
            config.data = parsedBody;
            if (!parsedHeaders["Content-Type"]) {
              config.headers["Content-Type"] = "application/json";
            }
          }
    
          const startTime = Date.now();
          const response = await axios(config);
          const duration = Date.now() - startTime;
    
          // Tenta parsear resposta como JSON
          let responseData: any = response.data;
          let responseStr: string;
          
          if (typeof responseData === "object") {
            responseStr = JSON.stringify(responseData, null, 2).substring(0, 5000);
          } else {
            responseStr = String(responseData).substring(0, 5000);
          }
    
          return {
            success: true,
            status: response.status,
            statusText: response.statusText,
            duration: `${duration}ms`,
            data: responseStr,
            dataTruncated: responseStr.length < JSON.stringify(response.data).length,
            headers: {
              contentType: response.headers["content-type"],
              contentLength: response.headers["content-length"],
            },
            message: `API ${httpMethod} ${url} -> ${response.status} ${response.statusText} (${duration}ms)`,
          };
        } catch (err: any) {
          const errorMsg = err.response
            ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 200)}`
            : err.code === "ECONNABORTED"
            ? "Timeout na requisicao"
            : err.message || "Erro desconhecido";
    
          return {
            success: false,
            message: `Erro na requisicao: ${errorMsg}`,
            method: method || "GET",
            url,
          };
        }
      }
    };
    