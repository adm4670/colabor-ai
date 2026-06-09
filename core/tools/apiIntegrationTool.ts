// ============================================================
// APIIntegration Tool - Chamar APIs REST e GraphQL externas
// Suporta GET, POST, PUT, DELETE, PATCH com headers customizados
//
// Melhorias:
// - Retry automatico com exponential backoff para 429 (rate limit) e 5xx
// - Jitter de ±10% para evitar thundering herd
// - Max 5 tentativas para rate limit, 5 para outros erros
// - Timeout configuravel (default: 15000ms, mas para imagens maiores usar 60000+)
// ============================================================

import axios from "axios";

// Configuracoes de backoff
const MAX_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY = 4000;   // 4s inicial para 429
const RATE_LIMIT_FACTOR = 4;           // 4x: 4s, 16s, 64s, 256s...
const OTHER_BASE_DELAY = 2000;         // 2s inicial para outros erros
const OTHER_FACTOR = 2;                // 2x: 2s, 4s, 8s, 16s...

/**
 * Retry wrapper com exponential backoff + jitter para chamadas HTTP.
 * - Rate limit (429): backoff agressivo (fator 4x)
 * - Server errors (5xx): backoff padrao (fator 2x)
 * - Jitter de ±10% para evitar thundering herd
 */
async function executeWithRetry(
  config: Record<string, any>,
  maxRetries: number = MAX_RETRIES
): Promise<any> {
  let lastResponse: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios(config);

      const status = response.status;
      const isRetryable =
        status === 429 ||                          // rate limit
        (status >= 500 && status !== 501);          // server error (exceto 501 - Not Implemented)

      if (!isRetryable) {
        // Resposta bem-sucedida ou erro nao-retentavel (4xx, 3xx, etc)
        return response;
      }

      // Status retentavel (429 ou 5xx)
      lastResponse = response;

      if (attempt === maxRetries - 1) {
        // Ultima tentativa - retorna a resposta mesmo com erro
        return response;
      }

      // Calcula delay com exponential backoff
      const isRateLimit = status === 429;
      const delay = isRateLimit
        ? RATE_LIMIT_BASE_DELAY * Math.pow(RATE_LIMIT_FACTOR, attempt)
        : OTHER_BASE_DELAY * Math.pow(OTHER_FACTOR, attempt);

      // Jitter de ±10% para evitar thundering herd
      const jitter = delay * 0.1 * (Math.random() * 2 - 1);
      const waitMs = Math.floor(delay + jitter);

      console.log(
        `[apiIntegrationTool] Retry ${attempt + 1}/${maxRetries - 1} em ${waitMs}ms`,
        JSON.stringify({
          error: `${status} status code${response.statusText ? ` (${response.statusText})` : ''}`,
          status,
          isRateLimit,
          attempt,
          url: (config.url || '').substring(0, 100),
        })
      );

      await new Promise(resolve => setTimeout(resolve, waitMs));
    } catch (err: any) {
      // Erro de rede, timeout, etc (axios jogou excecao)
      lastError = err;

      const isRetryable =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ECONNABORTED' ||
        err.message?.includes('timeout') ||
        err.message?.includes('rate') ||
        err.message?.includes('socket') ||
        err.message?.includes('network');

      if (!isRetryable || attempt === maxRetries - 1) {
        throw err; // Nao retentavel ou acabaram as tentativas
      }

      // Delay padrao para erros de rede
      const delay = OTHER_BASE_DELAY * Math.pow(OTHER_FACTOR, attempt);
      const jitter = delay * 0.1 * (Math.random() * 2 - 1);
      const waitMs = Math.floor(delay + jitter);

      console.log(
        `[apiIntegrationTool] Retry ${attempt + 1}/${maxRetries - 1} em ${waitMs}ms`,
        JSON.stringify({
          error: err.message,
          code: err.code,
          attempt,
          url: (config.url || '').substring(0, 100),
        })
      );

      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  // Fallback: retorna ultima resposta ou lanca ultimo erro
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Max retries exceeded");
}

export const apiIntegrationTool = {
  type: "function" as const,

  function: {
    name: "api_request",
    description: "Chama APIs REST/GraphQL externas. Suporta GET, POST, PUT, DELETE, PATCH. Permite headers customizados e corpo da requisicao. Ideal para integrar com servicos como GitHub, WeatherAPI, etc. Possui retry automatico com exponential backoff para rate limit (429) e erros de servidor (5xx).",
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
          description: "Timeout em milissegundos (default: 15000, recomendado 60000+ para chamadas com imagens grandes)"
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
        validateStatus: () => true, // Aceita qualquer status para tratar retry manualmente
      };

      if (parsedBody && ["POST", "PUT", "PATCH"].includes(httpMethod)) {
        config.data = parsedBody;
        if (!parsedHeaders["Content-Type"]) {
          config.headers["Content-Type"] = "application/json";
        }
      }

      const startTime = Date.now();

      // ============================================================
      // EXECUTA COM RETRY AUTOMATICO (exponential backoff + jitter)
      // ============================================================
      // - 429 (rate limit): backoff 4s, 16s, 64s, 256s... (fator 4x)
      // - 5xx (server error): backoff 2s, 4s, 8s, 16s... (fator 2x)
      // - Erros de rede: backoff 2s, 4s, 8s, 16s... (fator 2x)
      // - Jitter de ±10% para evitar thundering herd
      // - Max 5 tentativas
      // ============================================================
      const response = await executeWithRetry(config, MAX_RETRIES);

      const duration = Date.now() - startTime;

      // Tenta parsear resposta como JSON
      let responseData: any = response.data;
      let responseStr: string;

      // ============================================================
      // CORRECAO: Aumenta o limite de truncamento de 5000 para 100000000
      // para não truncar base64 de imagens (que podem ter varios MB)
      // ============================================================
      if (typeof responseData === "object") {
        responseStr = JSON.stringify(responseData, null, 2).substring(0, 100000000);
      } else {
        responseStr = String(responseData).substring(0, 100000000);
      }

      const totalLen = typeof responseData === "object"
        ? JSON.stringify(responseData).length
        : String(responseData).length;

      // Se ainda for 429/5xx apos todas as tentativas, retorna como erro
      const status = response.status;
      if (status === 429) {
        return {
          success: false,
          status,
          statusText: response.statusText,
          duration: `${duration}ms`,
          message: `Rate limit excedido apos ${MAX_RETRIES} tentativas. A API esta sobrecarregada, aguarde alguns minutos e tente novamente. (${httpMethod} ${url} -> ${status})`,
          retriesAttempted: MAX_RETRIES,
          data: responseStr?.substring(0, 1000),
        };
      }

      if (status >= 500) {
        return {
          success: false,
          status,
          statusText: response.statusText,
          duration: `${duration}ms`,
          message: `Erro no servidor da API apos ${MAX_RETRIES} tentativas. (${httpMethod} ${url} -> ${status})`,
          retriesAttempted: MAX_RETRIES,
          data: responseStr?.substring(0, 1000),
        };
      }

      return {
        success: status >= 200 && status < 300,
        status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        data: responseStr,
        dataTruncated: responseStr.length < totalLen,
        headers: {
          contentType: response.headers?.["content-type"],
          contentLength: response.headers?.["content-length"],
        },
        message: `API ${httpMethod} ${url} -> ${status} ${response.statusText || ''} (${duration}ms)`,
      };
    } catch (err: any) {
      const errorMsg = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 200)}`
        : err.code === "ECONNABORTED"
        ? "Timeout na requisicao"
        : err.message || "Erro desconhecido";

      return {
        success: false,
        message: `Erro na requisicao apos ${MAX_RETRIES} tentativas: ${errorMsg}`,
        method: method || "GET",
        url,
        retriesAttempted: MAX_RETRIES,
      };
    }
  }
};
