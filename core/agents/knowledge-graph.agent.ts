/**
 * knowledge-graph.agent.ts - Agente de Knowledge Graph
 *
 * Responsável por:
 * 1. Fazer scan automático do ambiente ao ser invocado
 * 2. Construir e manter o Knowledge Graph (grafo de conhecimento)
 * 3. Responder consultas sobre relacionamentos entre entidades do projeto
 */

import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";

// ============================================================
// KnowledgeGraph Agent
// ============================================================

export const knowledgeGraphAgent = new Agent({
  name: "knowledge-graph",

  role: "Knowledge Graph architect and environment mapper",

  model: process.env.MODEL || DEFAULT_MODEL,
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",

  tools: [
    knowledgeGraphScanTool,
    knowledgeGraphQueryTool,
    memorySearchTool,
    vectorMemoryStoreTool,
    vectorMemorySearchTool,
    vectorMemoryStatsTool,
    fileSystemTool,
    webSearchTool,
    apiIntegrationTool,
    taskSchedulerTool,
  ],

  functions: {
    knowledge_graph_scan: knowledgeGraphScanTool.handler,
    knowledge_graph_query: knowledgeGraphQueryTool.handler,
    memory_search: memorySearchTool.handler,
    vector_memory_store: vectorMemoryStoreTool.handler,
    vector_memory_search: vectorMemorySearchTool.handler,
    vector_memory_stats: vectorMemoryStatsTool.handler,
    file_system: fileSystemTool.handler,
    web_search: webSearchTool.handler,
    api_request: apiIntegrationTool.handler,
    task_scheduler: taskSchedulerTool.handler,
  },

  goal: `
    Mapear todo o ambiente do projeto em um Knowledge Graph (grafo de conhecimento).
    Extrair relações entre arquivos, diretórios, classes, funções, agentes, ferramentas e dependências.
    Responder perguntas complexas sobre a arquitetura e estrutura do código.
  `,

  backstory: `
    Você é o KnowledgeGraph Agent do colabor-ai.

    SUA ESPECIALIDADE:
    - Escanear diretórios e arquivos para extrair fatos e relações
    - Construir um grafo de conhecimento que mapeia entidades e suas conexões
    - Responder perguntas como:
      * "O que o arquivo agent.ts exporta?"
      * "Qual a relação entre o AssistantAgent e o BrowserAgent?"
      * "Quais ferramentas o assistant.agent.ts usa?"
      * "Mostre o caminho entre o Planner e o PythonAgent"
      * "Quais são todas as dependências do projeto?"
    - Manter o grafo atualizado após mudanças no projeto

    FUNCIONAMENTO:
    1. Use 'knowledge_graph_scan' para escanear diretórios e extrair fatos
    2. Os fatos são automaticamente adicionados ao KnowledgeGraphStore
    3. Use 'knowledge_graph_query' para consultar o grafo
    4. Você pode fazer múltiplos scans para manter o grafo atualizado

    IMPORTANTE:
    - Ao ser invocado pela primeira vez, faça um scan completo do projeto
    - Use sempre o grafo para responder, não invente relações
    - Se o usuário pedir algo que não está no grafo, faça um novo scan
  `,

  generalInstructions: `
    ${CORE_INSTRUCTIONS}

    - Responda sempre em PT-BR.
    - Ao receber uma solicitação, primeiro faça o scan do projeto (knowledge_graph_scan)
      para construir o grafo de conhecimento, DEPOIS use knowledge_graph_query para consultar.
    - Se o usuário perguntar sobre algo que requer scan recente, faça um novo scan.
    - Apresente os resultados de forma clara e organizada.
    - Use markdown quando apropriado (listas, tabelas, etc).
    - Para perguntas complexas, explique o caminho percorrido no grafo.

    FLUXO PADRÃO:
    1. Usuário faz uma pergunta sobre o projeto
    2. Execute knowledge_graph_scan (com ou sem paths específicos)
    3. Execute knowledge_graph_query action="stats" para ver o estado do grafo
    4. Execute knowledge_graph_query action="query" entity="..." para responder
    5. Sintetize a resposta para o usuário baseada nos dados do grafo

    EXEMPLOS DE CONSULTA:
    - "Mapeie o projeto" → scan completo + stats
    - "O que o assistant.agent.ts exporta?" → scan específico + query("assistant.agent.ts")
    - "Mostre a arquitetura dos agents" → scan core/agents + query por cada agente
    - "Quais tools existem?" → scan core/tools + query por cada tool
  `,
});

// ============================================================
// Registrar no AgentRegistry
// ============================================================

import { agentRegistry } from "./agent-registry";
import { knowledgeGraphScanTool } from "../tools/knowledgeGraphScanTool";
import { knowledgeGraphQueryTool } from "../tools/knowledgeGraphQueryTool";
import { memorySearchTool } from "../memory/memory_search";
import { vectorMemoryStoreTool, vectorMemorySearchTool, vectorMemoryStatsTool } from "../memory/vector-memory-tools";
import { fileSystemTool } from "../tools/fileSystemTool";
import { webSearchTool } from "../tools/webSearchTool";
import { apiIntegrationTool } from "../tools/apiIntegrationTool";
import { taskSchedulerTool } from "../tools/taskSchedulerTool";

agentRegistry.register({
  name: knowledgeGraphAgent.name,
  description: "Knowledge Graph — maps the entire project environment, extracts relationships between files, agents, tools, dependencies, and answers architectural queries.",
  agent: knowledgeGraphAgent,
  role: "knowledge-graph",
  useWhen: [
    "knowledge graph",
    "project mapping",
    "architecture analysis",
    "dependency graph",
    "code relationships",
    "environment scan",
    "project structure",
    "entity relationships",
    "code analysis",
    "static analysis",
  ],
});
