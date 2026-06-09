/**
 * image-reader.agent.ts - Agente de Leitura e Análise de Imagens
 *
 * CORRIGIDO em 2026-06-08 (v3):
 * - CORREÇÃO PRINCIPAL: Modelos da imageReadTool estavam todos deprecados!
 *   gemini-2.0-flash, gemini-1.5-flash etc não existem mais na API.
 *   Agora usa: gemini-2.5-flash → gemini-2.5-flash-lite → gemini-3.1-flash-image
 * - Não usa mais Gemini como modelo de conversação (evita 429 duplicado)
 * - Usa DeepSeek como modelo base e chama Gemini Vision via imageReadTool
 * - Retry com exponential backoff + jitter + fallback entre 5 modelos
 *
 * FLUXO CORRIGIDO:
 * 1. Usuário envia caminho de imagem
 * 2. Agent chama read_image(imagePath) → tool lê binário, converte base64, chama Gemini Vision
 * 3. Tool retorna descrição detalhada (com fallback automático se modelo falhar)
 * 4. Agent apresenta ao usuário
 *
 * NÃO causa mais 503 porque:
 * - Fallback automático entre 5 modelos funcionais testados
 * - gemini-2.5-flash-lite é rápido e raramente retorna 503
 * - Modelos especializados em imagem (flash-image) como última alternativa
 */

import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS } from "../constants/instructions";

export const imageReaderAgent = new Agent({
  name: "image-reader",

  role: "Image analysis and description specialist (Gemini Vision via read_image tool)",

  // Usa DeepSeek como modelo de conversação para evitar rate limit 429
  // A chamada à API Gemini Vision é feita exclusivamente via imageReadTool
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",

  tools: [
    fileSystemTool,
    webSearchTool,
    apiIntegrationTool,
    memorySearchTool,
    vectorMemoryStoreTool,
    vectorMemorySearchTool,
    vectorMemoryStatsTool,
    taskSchedulerTool,
    imageReadTool, // ← TOOL de leitura e análise de imagens
  ],

  functions: {
    file_system: fileSystemTool.handler,
    web_search: webSearchTool.handler,
    api_request: apiIntegrationTool.handler,
    memory_search: memorySearchTool.handler,
    vector_memory_store: vectorMemoryStoreTool.handler,
    vector_memory_search: vectorMemorySearchTool.handler,
    vector_memory_stats: vectorMemoryStatsTool.handler,
    task_scheduler: taskSchedulerTool.handler,
    read_image: imageReadTool.handler, // ← FUNCTION de leitura de imagens
  },

  goal: `
    Analisar imagens fornecidas pelo usuário e gerar descrições detalhadas,
    identificar objetos, pessoas, textos, cenários e qualquer informação visual relevante.
    Extrair o máximo de informação possível da imagem com precisão.
  `,

  backstory: `
    Você é um especialista em visão computacional utilizando o Google Gemini Vision.

    SUAS CAPACIDADES:
    - Reconhecer e descrever objetos, pessoas, animais e cenários
    - Ler textos presentes em imagens (OCR)
    - Identificar cores, composição, iluminação e estilo visual
    - Analisar gráficos, diagramas, infográficos e tabelas
    - Descrever emoções faciais, ações e interações entre pessoas
    - Identificar marcas, logotipos e elementos textuais
    - Analisar imagens médicas, científicas ou técnicas (quando aplicável)
    - Detectar anomalias ou elementos incomuns na imagem

    IMPORTANTE:
    - Seja preciso e objetivo nas descrições
    - Não invente informações que não estão na imagem
    - Se a imagem estiver ilegível, ambígua ou de baixa qualidade, informe o usuário
    - Para imagens com texto, transcreva o texto fielmente
    - Respeite a privacidade: não compartilhe informações identificáveis desnecessariamente
  `,

  generalInstructions: `
    ${CORE_INSTRUCTIONS}

    VOCÊ É O IMAGE READER AGENT - Especialista em análise de imagens.

    FLUXO DE TRABALHO:
    1. O usuário fornece o caminho de uma imagem (ex: "C:/fotos/logo.png" ou "./imagens/foto.jpg")
    2. Use a ferramenta read_image com o parâmetro imagePath contendo o caminho da imagem
    3. Opcionalmente, você pode passar uma question específica para guiar a análise
    4. A tool retornará a descrição da imagem já processada pelo Gemini Vision
    5. Apresente a descrição ao usuário de forma clara e organizada

    EXEMPLO DE USO DA TOOL:
    {
      "imagePath": "C:/Developer/colabor-ai/logo.png",
      "question": "Descreva esta imagem em detalhes, incluindo cores, formas e textos"
    }

    A ferramenta read_image:
    - Lê o arquivo binário CORRETAMENTE (sem corromper como UTF-8)
    - Converte para base64 automaticamente
    - Chama a API Gemini Vision com retry automático + fallback de modelos
    - Modelos testados em ordem: gemini-2.5-flash → gemini-2.5-flash-lite → gemini-3.1-flash-image → gemini-2.5-flash-image → gemini-2.5-pro
    - Retorna a análise já processada
    - Suporta: PNG, JPEG, WEBP, GIF, BMP (máx 20MB)

    NÃO USE file_system para ler imagens - ele lê como UTF-8 e corrompe os dados!
    NÃO USE api_request para chamar o Gemini - a tool read_image já faz isso.

    Se o usuário fornecer uma URL de imagem em vez de caminho:
    1. Use web_search para baixar a URL ou
    2. Peça para o usuário fornecer o caminho local do arquivo

    FORMATO DE RESPOSTA:
    - Sempre responda em PT-BR
    - Estruture a descrição em seções:
      * VISÃO GERAL: resumo do que mostra a imagem
      * DETALHES: descrição detalhada dos elementos
      * TEXTOS: transcrição de qualquer texto encontrado
      * OBSERVAÇÕES: pontos relevantes adicionais
    - Se a imagem tiver qualidade baixa, informe
    - Se não for possível analisar, explique o motivo claramente

    Use web_search se precisar de contexto adicional sobre algo identificado na imagem.
    Use memory_search se o usuário já tiver feito análises similares antes.
  `,
});

// ============================================================
// Registrar no AgentRegistry
// ============================================================

import { agentRegistry } from "./agent-registry";
import { fileSystemTool } from "../tools/fileSystemTool";
import { webSearchTool } from "../tools/webSearchTool";
import { apiIntegrationTool } from "../tools/apiIntegrationTool";
import { imageReadTool } from "../tools/imageReadTool"; // ← TOOL de leitura de imagens
import { memorySearchTool } from "../memory/memory_search";
import { vectorMemoryStoreTool, vectorMemorySearchTool, vectorMemoryStatsTool } from "../memory/vector-memory-tools";
import { taskSchedulerTool } from "../tools/taskSchedulerTool";

agentRegistry.register({
  name: imageReaderAgent.name,
  description: "Image analysis specialist using Gemini Vision (gemini-2.5-flash). Can read and describe images, extract text (OCR), identify objects, people, scenes, and provide detailed visual descriptions from image files. Uses dedicated read_image tool with automatic model fallback (gemini-2.5-flash-lite, gemini-3.1-flash-image, gemini-2.5-flash-image, gemini-2.5-pro) for reliability.",
  agent: imageReaderAgent,
  role: "image-reader",
  useWhen: [
    "image",
    "photo",
    "picture",
    "visual",
    "analyze image",
    "describe image",
    "OCR",
    "read image",
    "what's in this image",
    "imagem",
    "foto",
    "analisar imagem",
    "ler imagem",
    "descrever imagem",
  ],
});
