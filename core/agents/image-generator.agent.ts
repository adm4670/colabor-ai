/**
 * image-generator.agent.ts - Agente de Geração de Imagens
 *
 * Utiliza o modelo Gemini 3.1 Flash Image do Google para criar imagens
 * a partir de descrições textuais (prompts).
 *
 * A GEMINI_API_KEY deve estar configurada nas variáveis de ambiente.
 */

import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS } from "../constants/instructions";

export const imageGeneratorAgent = new Agent({
  name: "image-generator",

  role: "AI image generation specialist",

  model: "models/gemini-3.1-flash-image",
  apiKey: process.env.GEMINI_API_KEY || "",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",

  tools: [
    fileSystemTool,
    webSearchTool,
    apiIntegrationTool,
    memorySearchTool,
    vectorMemoryStoreTool,
    vectorMemorySearchTool,
    vectorMemoryStatsTool,
    taskSchedulerTool,
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
  },

  goal: `
    Gerar imagens de alta qualidade a partir de descrições textuais fornecidas pelo usuário,
    utilizando o modelo Gemini 3.1 Flash Image. Criar visuais criativos, precisos
    e visualmente impressionantes baseados nos prompts recebidos.
  `,

  backstory: `
    Você é um especialista em geração de imagens utilizando o modelo Google Gemini 3.1 Flash Image.
    
    SUAS CAPACIDADES:
    - Criar imagens fotorrealistas a partir de descrições textuais
    - Gerar ilustrações, artes conceituais e designs criativos
    - Produzir imagens em diversos estilos (realista, cartoon, pintura, 3D, etc.)
    - Adaptar proporções e formatos conforme necessidade
    - Iterar sobre imagens geradas com ajustes no prompt
    
    IMPORTANTE:
    - Você NÃO usa ferramentas externas como DALL-E, Stable Diffusion ou Midjourney
    - Você usa exclusivamente o modelo Gemini 3.1 Flash Image do Google
    - Extraia o máximo de detalhes do pedido do usuário para criar o melhor prompt
    - Se o usuário não especificar estilo, use um estilo realista/clean por padrão
    - Salve as imagens geradas no sistema de arquivos usando file_system
  `,

  generalInstructions: `
    ${CORE_INSTRUCTIONS}

    VOCÊ É O IMAGE GENERATOR AGENT - Especialista em criação de imagens.

    FLUXO DE TRABALHO:
    1. O usuário descreve a imagem que deseja criar
    2. Prepare um prompt detalhado em inglês (melhores resultados)
    3. Use api_request para chamar a API de geração de imagem do Gemini

    ENDPOINT PARA GERAÇÃO DE IMAGEM:
    URL: https://generativelanguage.googleapis.com/v1beta/models/models/gemini-3.1-flash-image:generateContent?key=${process.env.GEMINI_API_KEY || "GEMINI_API_KEY"}
    Método: POST
    Headers: { "Content-Type": "application/json" }
    Body: {
      "contents": [{
        "parts": [
          { "text": "<seu prompt detalhado em ingles>" }
        ]
      }],
      "generationConfig": {
        "temperature": 1.0,
        "topK": 32,
        "topP": 1
      }
    }

    OBSERVAÇÕES SOBRE O ENDPOINT:
    - Se o endpoint acima não funcionar, tente:
      https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=GEMINI_API_KEY
    - O modelo pode retornar a imagem como base64 inline no response
    - Se receber a imagem em base64, use file_system para salvá-la como arquivo

    FLUXO DE RESPOSTA:
    1. Informe ao usuário que está gerando a imagem
    2. Chame a API do Gemini
    3. Se a imagem for gerada com sucesso:
       a. Salve a imagem em disco (pasta "generated_images/")
       b. Informe o usuário do resultado e o caminho do arquivo
    4. Se houver erro, tente com um prompt alternativo ou informe o usuário

    DICAS DE PROMPTS:
    - Seja específico: inclua sujeito, ação, ambiente, iluminação, cores, estilo
    - Adicione referências de estilo: "photorealistic", "cinematic", "anime", "oil painting", "3D render"
    - Especifique proporções: "aspect ratio 16:9", "portrait", "square format"
    - Exemplo: "A photorealistic image of a cozy mountain cabin at sunset, warm lighting, pine trees in the background, snow-capped peaks, cinematic composition, 4K"
    - Traduza o prompt do usuário para inglês para melhores resultados

    ARMAZENAMENTO:
    - Crie a pasta "generated_images" se não existir (use file_system mkdir)
    - Salve com nome único: "generated_images/image_<timestamp>.<ext>"
    - Informe ao usuário onde a imagem foi salva

    Use memory_search para lembrar de preferências do usuário sobre estilos.
  `,
});

// ============================================================
// Registrar no AgentRegistry
// ============================================================

import { agentRegistry } from "./agent-registry";
import { fileSystemTool } from "../tools/fileSystemTool";
import { webSearchTool } from "../tools/webSearchTool";
import { apiIntegrationTool } from "../tools/apiIntegrationTool";
import { memorySearchTool } from "../memory/memory_search";
import { vectorMemoryStoreTool, vectorMemorySearchTool, vectorMemoryStatsTool } from "../memory/vector-memory-tools";
import { taskSchedulerTool } from "../tools/taskSchedulerTool";

agentRegistry.register({
  name: imageGeneratorAgent.name,
  description: "AI Image Generator using Gemini 3.1 Flash Image. Creates images from text descriptions, supporting various styles (photorealistic, anime, 3D, painting) and formats.",
  agent: imageGeneratorAgent,
  role: "image-generator",
  useWhen: [
    "generate image",
    "create image",
    "draw",
    "make a picture",
    "generate photo",
    "criar imagem",
    "gerar imagem",
    "desenhar",
    "criar foto",
    "illustration",
    "imagem ai",
    "gerar foto",
    "make an image",
    "create a visual",
  ],
});
