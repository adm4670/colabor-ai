/**
 * imageAuditTool.ts - Ferramenta de Auditoria de Geração de Imagens
 *
 * Permite que os agents registrem auditoria de geração de imagens
 * de forma programática, sem depender de instruções manuais via file_system.
 *
 * O arquivo de auditoria fica em: <projeto>/logs/image-generation-audit.log
 */

import { logImageAudit, type ImageAuditEntry } from "../agents/image-audit";
import { logger } from "../utils/logger";

export const imageAuditTool = {
  type: "function",
  function: {
    name: "image_audit",
    description: "REGISTRA AUDITORIA de uma tentativa de geração de imagem. Use APÓS chamar a API de imagem, tanto em caso de sucesso quanto de erro.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["success", "error", "fallback"],
          description: "Status da chamada: success (imagem gerada), error (falha na API), fallback (usou fallback)"
        },
        prompt: {
          type: "string",
          description: "Prompt completo enviado para a API de geração de imagem"
        },
        outputPath: {
          type: "string",
          description: "Caminho do arquivo de imagem gerado (opcional, apenas em caso de success)"
        },
        httpStatus: {
          type: "number",
          description: "Código HTTP da resposta da API (opcional)"
        },
        errorMessage: {
          type: "string",
          description: "Mensagem de erro (opcional, apenas em caso de error)"
        },
        responseSummary: {
          type: "string",
          description: "Resumo da resposta da API (opcional, primeiros 500 caracteres)"
        }
      },
      required: ["status", "prompt"]
    }
  },

  async handler(args: {
    status: "success" | "error" | "fallback";
    prompt: string;
    outputPath?: string;
    httpStatus?: number;
    errorMessage?: string;
    responseSummary?: string;
  }): Promise<string> {
    try {
      const entry: ImageAuditEntry = {
        timestamp: new Date().toISOString(),
        model: "models/gemini-3.1-flash-image",
        prompt: args.prompt,
        status: args.status,
        outputPath: args.outputPath,
        httpStatus: args.httpStatus,
        errorMessage: args.errorMessage,
        responseSummary: args.responseSummary,
        generatedBy: "image-generator",
      };

      logImageAudit(entry);

      return `Auditoria registrada com sucesso: ${args.status.toUpperCase()}`;
    } catch (e: any) {
      logger.error("[ImageAuditTool] Erro ao registrar auditoria:", e);
      return `Auditoria falhou (nao critico): ${e.message}`;
    }
  }
};
