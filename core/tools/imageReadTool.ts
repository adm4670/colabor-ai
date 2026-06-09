/**
 * imageReadTool.ts - Tool de Leitura e Análise de Imagens via Google Gemini Vision
 *
 * CORRIGIDO em 2026-06-08 (v3):
 * - CORREÇÃO PRINCIPAL: Modelos da fallback list estavam todos deprecados!
 *   Os modelos gemini-2.0-flash, gemini-2.0-flash-001, gemini-1.5-flash e
 *   gemini-1.5-flash-001 NÃO existem mais na API Google (HTTP 404).
 *   Substituídos por: gemini-2.5-flash, gemini-2.5-flash-lite, 
 *   gemini-3.1-flash-image e gemini-2.5-flash-image.
 * - Modelo gemini-2.5-flash também retorna 503 ocasional (alta demanda),
 *   então o fallback rápido para gemini-2.5-flash-lite é essencial.
 * - Retry com exponential backoff + jitter + fallback entre modelos
 *
 * FLUXO:
 * 1. Lê binário da imagem (sem corromper)
 * 2. Converte para base64
 * 3. Chama Gemini Vision com retry + fallback de modelos
 * 4. Retorna descrição detalhada
 *
 * USO:
 *   const result = await imageReadTool.handler({
 *     imagePath: "/caminho/para/imagem.png",
 *     question: "Descreva esta imagem" (opcional)
 *   });
 */

import axios from "axios";
import { readFileSync, existsSync, statSync } from "fs";
import { extname } from "path";
import { logger } from "../utils/logger";

// ============================================================
// Constantes de configuração
// ============================================================

const SUPPORTED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
]);

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_RETRIES = 3; // Reduzido de 5 para 3 - fallback entre modelos é mais eficaz que muitas retentativas
const REQUEST_TIMEOUT = 60000; // 60s
const MAX_BACKOFF_DELAY = 30000; // Teto máximo de 30s para backoff

/**
 * Lista de modelos para tentar em ordem de fallback.
 * 
 * DIAGNÓSTICO REALIZADO EM 2026-06-08:
 * - models/gemini-2.0-flash       → 404 (deprecado/removido)
 * - models/gemini-2.0-flash-001   → 404 (deprecado/removido)
 * - models/gemini-1.5-flash       → 404 (não encontrado na v1beta)
 * - models/gemini-1.5-flash-001   → 404 (não encontrado na v1beta)
 * 
 * MODELOS FUNCIONAIS (testados com image input):
 * - models/gemini-2.5-flash        → ✅ Funciona (às vezes 503 por alta demanda)
 * - models/gemini-2.5-flash-lite   → ✅ Funciona (rápido e confiável)
 * - models/gemini-3.1-flash-image  → ✅ Funciona (modelo específico para imagem)
 * - models/gemini-2.5-flash-image  → ✅ Funciona (modelo específico para imagem)
 * - models/gemini-2.5-pro          → ✅ Funciona (mais lento)
 */
const MODEL_FALLBACK_LIST = [
  "models/gemini-2.5-flash",           // 1ª: Modelo estável mais recente (visão)
  "models/gemini-2.5-flash-lite",      // 2ª: Rápido e confiável (visão)
  "models/gemini-3.1-flash-image",     // 3ª: Modelo especializado em imagens
  "models/gemini-2.5-flash-image",     // 4ª: Outro modelo especializado em imagens
  "models/gemini-2.5-pro",             // 5ª: Pro model (mais caro, mas mais capaz)
];

/**
 * Extrai o código de erro HTTP de uma resposta da API Gemini,
 * considerando tanto o HTTP status quanto o body de erro.
 */
function extractErrorCode(data: any, status: number): number {
  if (data?.error?.code) return data.error.code;
  if (data?.error?.status === "UNAVAILABLE") return 503;
  if (data?.error?.status === "NOT_FOUND") return 404;
  if (data?.error?.status === "PERMISSION_DENIED") return 403;
  if (data?.error?.status === "RESOURCE_EXHAUSTED") return 429;
  if (data?.error?.status === "INVALID_ARGUMENT") return 400;
  return status;
}

/**
 * Extrai a mensagem de erro da resposta da API Gemini.
 */
function extractErrorMessage(data: any, status: number): string {
  if (data?.error?.message) return data.error.message;
  if (data?.error?.status) return `Status: ${data.error.status}`;
  if (typeof data === "string") return data.substring(0, 500);
  return `HTTP ${status} - resposta sem corpo de erro`;
}

// ============================================================
// Image Read Tool
// ============================================================

export const imageReadTool = {
  type: "function" as const,

  function: {
    name: "read_image",
    description: `Lê e analisa uma imagem usando Google Gemini Vision (modelo gemini-2.5-flash).
    Forneça o caminho do arquivo. A tool:
    - Lê o arquivo binário corretamente (sem corromper como UTF-8)
    - Converte para base64
    - Envia para API Gemini Vision com fallback automático de modelos
    - Retorna análise detalhada da imagem
    Suporta PNG, JPEG, WEBP, GIF, BMP. Máximo 20MB.`,
    parameters: {
      type: "object",
      properties: {
        imagePath: {
          type: "string",
          description: "Caminho completo do arquivo de imagem no disco (obrigatorio). Ex: 'C:/fotos/minha-imagem.png' ou './imagens/foto.jpg'"
        },
        question: {
          type: "string",
          description: "Pergunta ou instrução específica sobre a imagem (opcional). Ex: 'Descreva esta imagem em detalhes', 'Que texto aparece na imagem?', 'Identifique os objetos presentes'"
        }
      },
      required: ["imagePath"]
    }
  },

  async handler(args: {
    imagePath: string;
    question?: string;
  }): Promise<{
    success: boolean;
    description?: string;
    mimeType?: string;
    fileName?: string;
    fileSizeKB?: number;
    message: string;
    error?: string;
    attempts?: number;
    modelUsed?: string;
    diagnostics?: string;
  }> {
    try {
      // ==========================================================
      // VALIDAÇÕES INICIAIS
      // ==========================================================

      // 1. API Key
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return {
          success: false,
          message: "GEMINI_API_KEY não configurada nas variáveis de ambiente.",
          error: "GEMINI_API_KEY ausente"
        };
      }

      // 2. Arquivo existe?
      if (!existsSync(args.imagePath)) {
        return {
          success: false,
          message: `Arquivo não encontrado: ${args.imagePath}`,
          error: "Arquivo inexistente"
        };
      }

      // 3. Extensão suportada?
      const ext = extname(args.imagePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return {
          success: false,
          message: `Formato não suportado: '${ext}'. Use: PNG, JPEG, WEBP, GIF ou BMP.`,
          error: `Formato '${ext}' não suportado`
        };
      }

      // 4. Tamanho do arquivo
      const stats = statSync(args.imagePath);
      if (stats.size > MAX_FILE_SIZE_BYTES) {
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        return {
          success: false,
          message: `Arquivo muito grande: ${sizeMB}MB. Limite máximo: 20MB.`,
          error: "Arquivo excede limite de 20MB"
        };
      }

      // ==========================================================
      // LEITURA BINÁRIA CORRETA DA IMAGEM
      // ==========================================================
      const imageBuffer = readFileSync(args.imagePath);
      const base64Data = imageBuffer.toString("base64");
      const mimeType = MIME_TYPES[ext] || "image/png";
      const fileSizeKB = Math.round(stats.size / 1024);

      logger.info(`[ImageReadTool] Imagem lida: ${args.imagePath} (${fileSizeKB}KB, ${mimeType})`);

      // ==========================================================
      // MONTA PROMPT
      // ==========================================================
      const defaultQuestion = "Descreva esta imagem em detalhes. Inclua todos os objetos, pessoas, textos, cores, composição e qualquer informação visual relevante. Se houver texto, transcreva-o fielmente. Responda em português (PT-BR).";
      const prompt = args.question || defaultQuestion;

      // ==========================================================
      // CHAMADA À API GEMINI VISION COM RETRY + FALLBACK DE MODELOS
      // ==========================================================

      let lastError: string = "";
      let attempts = 0;
      let diagnostics: string[] = [];
      let modelUsed: string = MODEL_FALLBACK_LIST[0];
      let modelAttempts: Record<string, number> = {}; // contagem de tentativas por modelo

      // Estratégia: Para cada modelo, tenta até MAX_RETRIES vezes.
      // Se um modelo falha consistentemente, pula para o próximo.
      // Modelos deprecados (404) são pulados imediatamente sem retry.
      // Erros 503 (alta demanda) fazem retry com backoff.
      
      for (let modelIndex = 0; modelIndex < MODEL_FALLBACK_LIST.length; modelIndex++) {
        const currentModel = MODEL_FALLBACK_LIST[modelIndex];
        const url = `https://generativelanguage.googleapis.com/v1beta/${currentModel}:generateContent?key=${GEMINI_API_KEY}`;

        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
            topP: 0.95,
          }
        };

        diagnostics.push(`Tentando modelo: ${currentModel}`);
        modelAttempts[currentModel] = 0;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          attempts++;
          modelAttempts[currentModel]++;

          try {
            const response = await axios.post(url, payload, {
              timeout: REQUEST_TIMEOUT,
              validateStatus: () => true,
              headers: {
                "Content-Type": "application/json",
              },
            });

            const data = response.data;
            const status = response.status;

            // ==========================================================
            // TRATAMENTO DE ERROS DA API
            // ==========================================================

            const hasErrorBody = !!(data?.error);
            const isHttpError = status >= 400;

            if (hasErrorBody || isHttpError) {
              const errorCode = extractErrorCode(data, status);
              const errorMessage = extractErrorMessage(data, status);

              lastError = `API error ${errorCode} (HTTP ${status}): ${errorMessage} [model: ${currentModel}]`;

              diagnostics.push(
                `  Tentativa ${modelAttempts[currentModel]}/${MAX_RETRIES}: HTTP ${status}, código ${errorCode} - "${errorMessage.substring(0, 120)}"`
              );

              // --- Erros NÃO retentáveis (pula imediatamente para próximo modelo) ---
              // 400 = Bad Request, 403 = Permission Denied, 404 = Modelo não encontrado/deprecado
              if (errorCode === 400 || errorCode === 403 || errorCode === 404) {
                diagnostics.push(`  ⛔ Modelo ${currentModel} não disponível (erro ${errorCode}), pulando para próximo modelo`);
                break; // Sai do loop de retry, tenta próximo modelo
              }

              // --- Rate limit (429) - retry com backoff agressivo ---
              if (errorCode === 429 || status === 429) {
                if (attempt < MAX_RETRIES - 1) {
                  const delay = Math.min(
                    4000 * Math.pow(4, attempt),
                    MAX_BACKOFF_DELAY
                  );
                  const jitter = Math.random() * delay;
                  const waitMs = Math.floor(jitter);

                  logger.warn(
                    `[ImageReadTool] Rate limit (429) na tentativa ${modelAttempts[currentModel]}/${MAX_RETRIES} [${currentModel}]. Aguardando ${waitMs}ms`
                  );
                  await new Promise(resolve => setTimeout(resolve, waitMs));
                  continue;
                }
                break; // Última tentativa: tenta próximo modelo
              }

              // --- Erros 5xx (503 alta demanda, 504 timeout, etc) - retry com backoff ---
              if (errorCode >= 500) {
                if (attempt < MAX_RETRIES - 1) {
                  // Backoff exponencial: 2s, 4s, 8s... com full jitter
                  const delay = Math.min(
                    2000 * Math.pow(2, attempt),
                    MAX_BACKOFF_DELAY
                  );
                  const jitter = Math.random() * delay;
                  const waitMs = Math.floor(jitter);

                  logger.warn(
                    `[ImageReadTool] Erro ${errorCode} (HTTP ${status}) na tentativa ${modelAttempts[currentModel]}/${MAX_RETRIES} [${currentModel}]. Aguardando ${waitMs}ms`
                  );
                  await new Promise(resolve => setTimeout(resolve, waitMs));
                  continue;
                }
                break; // Última tentativa: tenta próximo modelo
              }

              // --- Outros erros (inesperados) ---
              if (attempt < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
              }
              break;
            }

            // ==========================================================
            // SUCESSO: Extrair resposta do modelo
            // ==========================================================

            let description = "";

            if (data.candidates && data.candidates.length > 0) {
              const candidate = data.candidates[0];

              // Verificar se foi bloqueado por safety
              const finishReason = candidate.finishReason;
              if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
                lastError = `Conteúdo bloqueado pelo safety filter: ${finishReason}`;
                if (candidate.safetyRatings) {
                  const blocked = candidate.safetyRatings
                    .filter((r: any) => r.probability !== "NEGLIGIBLE")
                    .map((r: any) => `${r.category}=${r.probability}`);
                  if (blocked.length > 0) {
                    lastError += ` | Safety: ${JSON.stringify(blocked)}`;
                  }
                }
                diagnostics.push(`  ⛔ Bloqueado por safety: ${finishReason}`);
                break; // Erro não retentável, tenta próximo modelo
              }

              // Mesmo com MAX_TOKENS, o texto parcial é útil
              if (candidate.content && candidate.content.parts) {
                description = candidate.content.parts
                  .map((part: any) => part.text || "")
                  .filter(Boolean)
                  .join("\n");
              }
            }

            if (!description) {
              lastError = `API retornou resposta vazia ou sem texto [model: ${currentModel}]`;
              diagnostics.push(`  ⚠️ Resposta vazia, tentativa ${modelAttempts[currentModel]}/${MAX_RETRIES}`);
              if (attempt < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
              }
              break;
            }

            // ==========================================================
            // ✅ SUCESSO
            // ==========================================================

            modelUsed = currentModel;

            logger.info(
              `[ImageReadTool] Análise concluída: ${args.imagePath} (${attempts} tentativa(s), modelo: ${currentModel})`
            );

            return {
              success: true,
              description: description.trim(),
              mimeType,
              fileName: args.imagePath.split(/[/\\]/).pop() || args.imagePath,
              fileSizeKB,
              modelUsed: currentModel,
              message: `Imagem analisada com sucesso usando ${currentModel} (${fileSizeKB}KB, ${attempts} tentativa(s))`,
              attempts,
            };

          } catch (e: any) {
            // Erro de rede, timeout, etc. (axios exception)
            lastError = `Erro de requisição: ${e.message || "Erro desconhecido"}`;

            const isRetryable =
              e.code === 'ECONNRESET' ||
              e.code === 'ETIMEDOUT' ||
              e.code === 'ECONNABORTED' ||
              e.code === 'ENOTFOUND' ||
              e.code === 'ECONNREFUSED' ||
              e.message?.includes('timeout') ||
              e.message?.includes('socket') ||
              e.message?.includes('network') ||
              e.message?.includes('connect');

            diagnostics.push(
              `  Tentativa ${modelAttempts[currentModel]}/${MAX_RETRIES}: ${isRetryable ? "🔄 retryável" : "⛔ não retryável"} - ${(e.message || "erro").substring(0, 120)}`
            );

            if (isRetryable && attempt < MAX_RETRIES - 1) {
              const delay = Math.min(
                2000 * Math.pow(2, attempt),
                MAX_BACKOFF_DELAY
              );
              const jitter = Math.random() * delay;
              const waitMs = Math.floor(jitter);

              logger.warn(
                `[ImageReadTool] Erro de rede na tentativa ${modelAttempts[currentModel]}/${MAX_RETRIES} [${currentModel}]. Aguardando ${waitMs}ms: ${e.message}`
              );
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue;
            }

            // Se não for retentável, interrompe este modelo
            break;
          }
        }

        diagnostics.push(`  Modelo ${currentModel} esgotou tentativas após ${modelAttempts[currentModel]} tentativa(s). lastError: ${lastError.substring(0, 100)}`);

        if (modelIndex < MODEL_FALLBACK_LIST.length - 1) {
          const nextModel = MODEL_FALLBACK_LIST[modelIndex + 1];
          logger.warn(
            `[ImageReadTool] Modelo ${currentModel} falhou (${modelAttempts[currentModel]} tentativas). Tentando fallback: ${nextModel}. Erro: ${lastError}`
          );
        }
      }

      // ==========================================================
      // ❌ FALHA APÓS TODOS OS MODELOS E TODAS AS TENTATIVAS
      // ==========================================================

      const diagnosticsStr = diagnostics.join("\n");

      logger.error(`[ImageReadTool] Falha após ${attempts} tentativas em ${MODEL_FALLBACK_LIST.length} modelos: ${lastError}`);

      return {
        success: false,
        message: `Não foi possível analisar a imagem após ${attempts} tentativas em ${MODEL_FALLBACK_LIST.length} modelos. ${lastError}`,
        error: lastError,
        attempts,
        modelUsed: MODEL_FALLBACK_LIST[0],
        mimeType,
        fileName: args.imagePath.split(/[/\\]/).pop() || args.imagePath,
        fileSizeKB: Math.round(stats.size / 1024),
        diagnostics: diagnosticsStr,
      };

    } catch (e: any) {
      // Erro catastrófico (fora dos loops)
      logger.error(`[ImageReadTool] Erro catastrófico:`, e);
      return {
        success: false,
        message: `Erro ao processar imagem: ${e.message || e}`,
        error: e.message || "Erro desconhecido",
      };
    }
  }
};
