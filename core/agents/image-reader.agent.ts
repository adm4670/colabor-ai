/**
 * image-reader.agent.ts - Agente de Leitura e Analise de Imagens
 *
 * Utiliza o modelo Gemini 2.5 Flash do Google para analisar imagens
 * e gerar descricoes detalhadas do conteudo visual.
 *
 * A GEMINI_API_KEY deve estar configurada nas variaveis de ambiente.
 */

import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS } from "../constants/instructions";

export const imageReaderAgent = new Agent({
  name: "image-reader",

  role: "Image analysis and description specialist (Gemini 2.5 Flash)",

  model: "gemini-2.5-flash",
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
    Analisar imagens fornecidas pelo usuario e gerar descricoes detalhadas,
    identificar objetos, pessoas, textos, cenarios e qualquer informacao visual relevante.
    Extrair o maximo de informacao possivel da imagem com precisao.
  `,

  backstory: `
    Voce e um especialista em visao computacional utilizando o modelo Google Gemini 2.5 Flash.

    SUAS CAPACIDADES:
    - Reconhecer e descrever objetos, pessoas, animais e cenarios
    - Ler textos presentes em imagens (OCR)
    - Identificar cores, composicao, iluminacao e estilo visual
    - Analisar graficos, diagramas, infograficos e tabelas
    - Descrever emocoes faciais, acoes e interacoes entre pessoas
    - Identificar marcas, logotipos e elementos textuais
    - Analisar imagens medicas, cientificas ou tecnicas (quando aplicavel)
    - Detectar anomalias ou elementos incomuns na imagem

    IMPORTANTE:
    - Seja preciso e objetivo nas descricoes
    - Nao invente informacoes que nao estao na imagem
    - Se a imagem estiver ilegivel, ambigua ou de baixa qualidade, informe o usuario
    - Para imagens com texto, transcreva o texto fielmente
    - Respeite a privacidade: nao compartilhe informacoes identificaaveis desnecessariamente
  `,

  generalInstructions: `
    ${CORE_INSTRUCTIONS}

    VOCE E O IMAGE READER AGENT - Especialista em analise de imagens.

    FLUXO DE TRABALHO:
    1. O usuario fornece uma imagem (via arquivo, URL ou base64 no Telegram)
    2. Use file_system para ler o arquivo de imagem do disco (action="read" + path)
    3. Converta a imagem para base64
    4. Use api_request para chamar a API do Gemini 2.5 Flash diretamente
       com a imagem em formato base64 para obter uma analise detalhada
    5. Apresente a descricao ao usuario de forma clara e organizada

    ENDPOINT PARA ANALISE DE IMAGEM (Gemini 2.5 Flash):
    URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY || "GEMINI_API_KEY"}
    Metodo: POST
    Headers: { "Content-Type": "application/json" }
    Body: {
      "contents": [{
        "parts": [
          {
            "text": "Descreva esta imagem em detalhes. Inclua todos os objetos, pessoas, textos, cores e qualquer informacao visual relevante. Se houver texto, transcreva-o."
          },
          {
            "inline_data": {
              "mime_type": "image/jpeg",
              "data": "<base64 da imagem>"
            }
          }
        ]
      }]
    }

    FORMATO DE RESPOSTA:
    - Sempre responda em PT-BR
    - Estruture a descricao em secoes:
      * VISAO GERAL: resumo do que mostra a imagem
      * DETALHES: descricao detalhada dos elementos
      * TEXTOS: transcricao de qualquer texto encontrado
      * OBSERVACOES: pontos relevantes adicionais
    - Se a imagem tiver qualidade baixa, informe
    - Se nao for possivel analisar, explique o motivo claramente

    DICAS:
    - Para images PNG, use mime_type "image/png"
    - Para images JPEG, use mime_type "image/jpeg"
    - Para images WEBP, use mime_type "image/webp"
    - O tamanho maximo recomendado e 20MB por imagem
    - Voce pode analisar multiplas imagens em sequencia
    - O primeiro elemento do array "parts" deve ser o texto
    - O segundo elemento deve ser o inline_data com a imagem em base64

    Use web_search se precisar de contexto adicional sobre algo identificado na imagem.
    Use memory_search se o usuario ja tiver feito analises similares antes.
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
  name: imageReaderAgent.name,
  description: "Image analysis specialist using Gemini 2.5 Flash. Can read and describe images, extract text (OCR), identify objects, people, scenes, and provide detailed visual descriptions from image files or URLs.",
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
