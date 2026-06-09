/**
 * imageGenerationTool.ts - Tool de Geração de Imagens via Google Gemini
 *
 * Encapsula a chamada à API Google Gemini (modelo gemini-3.1-flash-image)
 * com lógica inspirada em gerar_video_enem_v3.py:
 * - Retry com exponential backoff + jitter
 * - Auditoria automática (imageAudit)
 * - Suporte a estilos visuais (photorealistic, illustration, anime, etc.)
 * - Aspect ratio configurável (square, landscape, portrait)
 * - Salvamento em disco com diretório automático
 * - Timeout de 90s para geração de imagens
 */

import axios from "axios";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { logger } from "../utils/logger";

// ============================================================
// Image Generation Tool
// ============================================================

export const imageGenerationTool = {
  type: "function" as const,

  function: {
    name: "generate_image",
    description: "Gera uma imagem usando o Google Gemini (modelo gemini-3.1-flash-image) a partir de uma descricao textual. Suporta retry automatico com backoff, auditoria integrada e salvamento em disco. Ideal para ilustracoes didaticas, fotorealismo, arte conceitual e mais.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Descricao detalhada da imagem a ser gerada. Para melhores resultados, use ingles com detalhes de sujeito, acao, ambiente, iluminacao, cores e estilo."
        },
        outputPath: {
          type: "string",
          description: "Caminho onde salvar a imagem (opcional). Ex: 'generated_images/minha_imagem.png'. Se nao informado, salva em 'generated_images/image_<timestamp>.png'"
        },
        style: {
          type: "string",
          enum: ["auto", "photorealistic", "illustration", "flat", "anime", "cinematic", "painting"],
          description: "Estilo visual da imagem (opcional, default: 'auto'). 'auto' usa descricao natural, 'illustration' para ilustracoes didaticas flat, 'photorealistic' para imagens realistas."
        },
        aspectRatio: {
          type: "string",
          enum: ["square", "landscape", "portrait"],
          description: "Proporcao da imagem (opcional, default: 'landscape'). 'square'=1:1, 'landscape'=16:9, 'portrait'=9:16"
        }
      },
      required: ["prompt"]
    }
  },

  async handler(args: {
    prompt: string;
    outputPath?: string;
    style?: string;
    aspectRatio?: string;
  }): Promise<{
    success: boolean;
    imagePath?: string;
    mimeType?: string;
    sizeKB?: number;
    message: string;
    error?: string;
    attempts?: number;
  }> {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return {
        success: false,
        message: "GEMINI_API_KEY nao configurada nas variaveis de ambiente.",
        error: "GEMINI_API_KEY ausente"
      };
    }

    // --- Build enhanced prompt with style hints ---
    let fullPrompt = args.prompt;

    const styleHints: Record<string, string> = {
      photorealistic: "Photorealistic, highly detailed, 8K, realistic textures, natural lighting, depth of field",
      illustration: "Educational illustration, flat design style, soft colors, friendly vector art, clean minimalistic, textbook style didatico",
      flat: "Flat illustration, vector style, solid colors, minimalist, modern design, crisp shapes",
      anime: "Anime style, cel-shaded, vibrant colors, Japanese animation aesthetic, expressive",
      cinematic: "Cinematic composition, dramatic lighting, film grain, movie poster quality, depth of field, anamorphic",
      painting: "Oil painting style, textured brush strokes, artistic, canvas texture, impressionist, rich colors",
    };

    if (args.style && args.style !== "auto") {
      fullPrompt = `${fullPrompt}. ${styleHints[args.style] || ""}`;
    } else {
      fullPrompt = `${fullPrompt}. High quality, detailed, vibrant colors.`;
    }

    const aspectHints: Record<string, string> = {
      square: "aspect ratio 1:1, square format",
      landscape: "aspect ratio 16:9, widescreen, horizontal",
      portrait: "aspect ratio 9:16, vertical, portrait",
    };

    fullPrompt = `${fullPrompt}. ${aspectHints[args.aspectRatio || "landscape"]}`;

    // --- Prepare output path ---
    const timestamp = Date.now();
    const defaultDir = join(process.cwd(), "generated_images");
    let outputPath = args.outputPath || join(defaultDir, `image_${timestamp}.png`);

    try {
      mkdirSync(dirname(outputPath), { recursive: true });
    } catch {
      // Diretório pode já existir
    }

    // --- Gemini API endpoint ---
    const MODEL = "models/gemini-3.1-flash-image";
    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const maxRetries = 3;
    let lastError: string = "";
    let attempts = 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      attempts = attempt + 1;
      try {
        const response = await axios.post(url, {
          contents: [{
            parts: [
              { text: fullPrompt }
            ]
          }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 4096,
          }
        }, {
          timeout: 90000, // 90s para geracao de imagem
          validateStatus: () => true,
        });

        const data = response.data;

        // Check for API errors
        if (data.error) {
          lastError = `API error ${data.error.code}: ${data.error.message}`;

          if (data.error.code === 429) {
            // Rate limit - retry com backoff
            const delay = 3000 * Math.pow(2, attempt) + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          // Non-retryable errors (403=permission, 404=not found)
          if (data.error.code === 403 || data.error.code === 404) {
            break;
          }

          continue;
        }

        // Extract image data from candidates
        let imageData: string | null = null;
        let mimeType: string = "image/png";

        if (data.candidates && data.candidates.length > 0) {
          const candidate = data.candidates[0];
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.data) {
                imageData = part.inlineData.data;
                mimeType = part.inlineData.mimeType || "image/png";
                break;
              }
            }
          }
        }

        if (!imageData) {
          lastError = "API response did not contain inline image data.";

          if (data.promptFeedback?.blockReason) {
            lastError = `Prompt blocked: ${data.promptFeedback.blockReason}`;
            break; // Don't retry blocked prompts
          }

          continue;
        }

        // Ensure correct extension
        const ext = mimeType.split("/")[1] || "png";
        if (!outputPath.endsWith(`.${ext}`)) {
          outputPath = outputPath.replace(/\.[^.]+$/, "") + `.${ext}`;
        }

        // Decode base64 and save to disk
        const buffer = Buffer.from(imageData, "base64");
        writeFileSync(outputPath, buffer);

        const sizeKB = Math.round(buffer.length / 1024);

        // --- Register audit (non-critical) ---
        try {
          const { logImageAudit } = await import("../agents/image-audit");
          logImageAudit({
            timestamp: new Date().toISOString(),
            model: MODEL,
            prompt: fullPrompt,
            status: "success",
            outputPath,
            imageSize: buffer.length,
            generatedBy: "image-generator",
          });
        } catch {
          // Audit is non-critical
        }

        logger.info(`[ImageGenerationTool] Imagem gerada: ${outputPath} (${sizeKB}KB, ${attempts} tentativa(s))`);

        return {
          success: true,
          imagePath: outputPath,
          mimeType,
          sizeKB,
          message: `Imagem gerada com sucesso: ${outputPath} (${sizeKB}KB)`,
          attempts,
        };

      } catch (e: any) {
        lastError = e.message || "Unknown request error";

        if (attempt < maxRetries - 1) {
          const delay = 3000 * Math.pow(2, attempt) + Math.random() * 1000;
          logger.warn(`[ImageGenerationTool] Attempt ${attempt + 1}/${maxRetries} failed. Retry in ${Math.round(delay)}ms: ${lastError}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted - register failure audit
    try {
      const { logImageAudit } = await import("../agents/image-audit");
      logImageAudit({
        timestamp: new Date().toISOString(),
        model: MODEL,
        prompt: fullPrompt,
        status: "error",
        errorMessage: lastError,
        generatedBy: "image-generator",
      });
    } catch {
      // Non-critical
    }

    logger.error(`[ImageGenerationTool] Failed after ${attempts} attempts: ${lastError}`);

    return {
      success: false,
      message: `Falha na geracao de imagem apos ${attempts} tentativas: ${lastError}`,
      error: lastError,
      attempts,
    };
  }
};
