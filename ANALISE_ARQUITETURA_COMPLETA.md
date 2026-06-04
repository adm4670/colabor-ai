# 🏗️ Colabor-AI — Análise Completa da Arquitetura
    
    > **Data:** 2026-06-04  
    > **Propósito:** Documentação completa da arquitetura, fluxos, contratos e dependências do sistema Colabor-AI.
    
    ---
    
    ## 📋 Índice
    
    1. [Visão Geral](#1-visão-geral)
    2. [Estrutura de Diretórios](#2-estrutura-de-diretórios)
    3. [Core — O Coração do Sistema](#3-core--o-coração-do-sistema)
    4. [Sistema de Agentes](#4-sistema-de-agentes)
    5. [Orquestrador (AgentOrchestrator)](#5-orquestrador-agentorchestrator)
    6. [Gerenciador de Planos (PlanManager)](#6-gerenciador-de-planos-planmanager)
    7. [Context Engine](#7-context-engine)
    8. [Memory System](#8-memory-system)
    9. [Tool System — Ferramentas dos Agentes](#9-tool-system--ferramentas-dos-agentes)
    10. [Tipos e Contratos (types.ts)](#10-tipos-e-contratos-typests)
    11. [Integrações Externas](#11-integrações-externas)
    12. [Sistema de Eventos (SSE)](#12-sistema-de-eventos-sse)
    13. [Fluxos Completos](#13-fluxos-completos)
    14. [Frontend — React](#14-frontend--react)
    15. [Diagrama de Dependências](#15-diagrama-de-dependências)
    
    ---
    
    ## 1. Visão Geral
    
    O **Colabor-AI** é uma plataforma de **agentes colaborativos** onde múltiplos agentes especializados (Assistant, PythonAgent, Browser, ShellAgent, WriterAgent) trabalham juntos para resolver tarefas complexas.
    
    ### Stack Tecnológica
    | Camada | Tecnologia |
    |--------|-----------|
    | **Backend** | Node.js + TypeScript |
    | **Frontend** | React + TypeScript + Tailwind CSS |
    | **IA** | API da Groq (LLaMA-based) |
    | **Comunicação** | SSE (Server-Sent Events) |
    | **Memória** | Sistema próprio de memória de longo prazo (JSON-based) |
    | **Autenticação** | Clerk |
    
    ### Princípios Arquiteturais
    1. **Orientado a Agentes** — Cada agente tem um papel, objetivo e ferramentas específicas.
    2. **Orquestração por Plano** — O `AgentOrchestrator` gera um plano (steps) e delega cada passo ao agente mais adequado.
    3. **Reflexão (Reflection)** — Após cada execução, um agente reflector analisa o resultado e sugere ajustes.
    4. **Memória Persistente** — Toda conversa é transcrita e resumida para memória de longo prazo.
    5. **Streaming de Eventos** — Tudo é transmitido via SSE para o frontend em tempo real.
    
    ---
    
    ## 2. Estrutura de Diretórios
    
    ```
    colabor-ai/
    ├── app/                          # Frontend React (Next.js?)
    │   ├── layout.tsx
    │   ├── page.tsx                  # Página principal
    │   ├── globals.css               # Estilos globais
    │   └── providers.tsx             # Providers (Clerk, etc.)
    ├── components/                   # Componentes React
    │   ├── ChatContainer.tsx         # Container do chat
    │   ├── MessageList.tsx           # Lista de mensagens
    │   ├── MessageInput.tsx          # Input de mensagens
    │   ├── AgentStatus.tsx           # Status dos agentes
    │   ├── EventStream.tsx           # Stream de eventos
    │   ├── ToolPanel.tsx             # Painel de ferramentas
    │   ├── MemoryViewer.tsx          # Visualizador de memória
    │   ├── TokenUsage.tsx            # Uso de tokens
    │   ├── ReflectionPanel.tsx       # Painel de reflexão
    │   ├── PlanPanel.tsx             # Painel do plano
    │   └── ProviderCards.tsx         # Cards de provedores
    ├── core/                         # BACKEND — Coração do sistema
    │   ├── agents/                   # Definição dos agentes
    │   │   ├── agent-registry.ts     # Registry de agentes
    │   │   ├── AgentConfig.ts        # Config de agente
    │   │   ├── types.ts              # Tipos de agente
    │   │   └── agents/               # Implementações específicas
    │   │       ├── assistant.ts
    │   │       ├── browser.ts
    │   │       ├── python-agent.ts
    │   │       ├── shell-agent.ts
    │   │       └── writer-agent.ts
    │   ├── orchestrator/             # Orquestrador
    │   │   ├── orchestrator.ts       # AgentOrchestrator
    │   │   ├── plan-manager.ts       # PlanManager
    │   │   └── types.ts              # Tipos do orchestrator
    │   ├── tools/                    # Ferramentas dos agentes
    │   │   ├── tool-registry.ts      # Registry de ferramentas
    │   │   ├── ToolDefinition.ts     # Definição de ferramenta
    │   │   ├── types.ts              # Tipos de ferramentas
    │   │   └── builtin/              # Ferramentas built-in
    │   │       ├── web-search.ts
    │   │       ├── memory-search.ts
    │   │       ├── execute-python.ts
    │   │       └── spawn-agent.ts
    │   ├── memory/                   # Sistema de Memória
    │   │   ├── MemoryManager.ts      # Gerenciador de memória
    │   │   ├── MemorySummarizer.ts   # Sumarizador de memória
    │   │   ├── TokenGuard.ts         # Guardião de tokens
    │   │   └── types.ts              # Tipos de memória
    │   ├── context/                  # Context Engine
    │   │   └── ContextEngine.ts
    │   ├── llm/                      # Integração com LLM
    │   │   ├── LLMProvider.ts        # Provedor LLM
    │   │   └── groq-provider.ts      # Implementação Groq
    │   ├── events/                   # Sistema de Eventos
    │   │   └── EventEmitter.ts
    │   └── index.ts                  # Exportações do core
    ├── hooks/                        # React Hooks
    │   ├── useChat.ts                # Hook de chat
    │   ├── useEvents.ts              # Hook de eventos
    │   └── useMemory.ts              # Hook de memória
    ├── api/                          # Rotas da API
    │   ├── chat/route.ts             # Rota de chat (SSE)
    │   └── memory/route.ts           # Rota de memória
    ├── utils/                        # Utilitários
    │   ├── llm.ts                    # Utilitários LLM
    │   └── cn.ts                     # className utility
    ├── types/                        # Tipos globais
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── package.json
    ```
    
    ---
    
    ## 3. Core — O Coração do Sistema
    
    ### `core/index.ts`
    Exporta os módulos principais:
    - `AgentOrchestrator` — Orquestrador principal
    - `PlanManager` — Gerenciador de planos
    - `MemoryManager` — Gerenciador de memória
    - `MemorySummarizer` — Sumarizador
    - `TokenGuard` — Guardião de tokens
    - `ContextEngine` — Motor de contexto
    - `registerAgent`, `getAgent` — Registry de agentes
    - `registerTool`, `getToolsForAgent` — Registry de ferramentas
    - `LLMProvider`, `GroqProvider` — Provedor LLM
    
    ### Camadas de Abstração
    
    ```
    ┌─────────────────────────────────────────┐
    │             API Routes (SSE)             │
    ├─────────────────────────────────────────┤
    │           AgentOrchestrator              │
    ├─────────────────────────────────────────┤
    │  ┌─────────┐  ┌──────────┐  ┌────────┐ │
    │  │ Agents  │  │  Tools   │  │ Memory │ │
    │  └─────────┘  └──────────┘  └────────┘ │
    ├─────────────────────────────────────────┤
    │           LLMProvider (Groq)            │
    ├─────────────────────────────────────────┤
    │           ContextEngine                 │
    └─────────────────────────────────────────┘
    ```
    
    ---
    
    ## 4. Sistema de Agentes
    
    ### `core/agents/types.ts`
    
    ```typescript
    export interface ToolDefinition {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      handler: (args: any, context: ToolContext) => Promise<any>;
    }
    
    export interface AgentConfig {
      name: string;
      description: string;
      instructions: string;
      tools: ToolDefinition[];
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
    
    export interface AgentResult {
      success: boolean;
      result: string;
      agent: string;
      toolCalls?: ToolCall[];
      tokensUsed?: number;
      error?: string;
    }
    
    export interface ToolCall {
      tool: string;
      args: any;
      result: any;
    }
    ```
    
    ### Registry de Agentes (`agent-registry.ts`)
    
    ```typescript
    const agentRegistry = new Map<string, AgentConfig>();
    
    export function registerAgent(config: AgentConfig): void { ... }
    export function getAgent(name: string): AgentConfig | undefined { ... }
    export function getAllAgents(): AgentConfig[] { ... }
    ```
    
    ### Agentes Disponíveis
    
    #### 1. Assistant — Agente Geral
    - **Arquivo:** `agents/assistant.ts`
    - **Instruções:** "You are a helpful and versatile assistant. You can use various tools to help the user with any task."
    - **Ferramentas:** Todas (web_search, memory_search, execute_python, spawn_agent, etc.)
    
    #### 2. PythonAgent — Especialista em Python
    - **Arquivo:** `agents/python-agent.ts`
    - **Role:** Python execution specialist
    - **Objetivo:** "Solve tasks using Python and return the result clearly"
    - **Ferramentas:** execute_python, memory_search, spawn_agent, web_search, tools de task management
    - **Skills:** python-dev, web-search, communication
    
    #### 3. Browser — Navegador Web
    - **Arquivo:** `agents/browser.ts`
    - **Role:** Web navigation specialist
    - **Objetivo:** "Navigate the web to find information and return structured results"
    - **Ferramentas:** web_search, memory_search
    
    #### 4. ShellAgent — Comandos do Sistema
    - **Arquivo:** `agents/shell-agent.ts`
    - **Role:** System command specialist
    - **Objetivo:** "Execute system commands and return the output. Use for file operations, system admin tasks, and command-line tools."
    - **Ferramentas:** execute_command (shell), memory_search
    
    #### 5. WriterAgent — Escrita e Texto
    - **Arquivo:** `agents/writer-agent.ts`
    - **Role:** Text generation and writing specialist
    - **Objetivo:** "Generate high-quality written content. Use for creating documents, reports, articles, and any text-based content."
    - **Ferramentas:** memory_search
    
    #### 6. MemorySummarizer — Agente Interno (não exposto)
    - **Propósito:** Sumarizar conversas para memória de longo prazo
    - **Usado por:** MemoryManager e TokenGuard
    
    #### 7. Revisor/Reflector — Agente de Reflexão
    - **Propósito:** Analisar resultados de agentes e sugerir melhorias
    - **Prompt:** Analisa se o resultado foi bem-sucedido, o que faltou, e sugere abordagem alternativa
    
    ---
    
    ## 5. Orquestrador (AgentOrchestrator)
    
    ### `core/orchestrator/orchestrator.ts`
    
    **Classe:** `AgentOrchestrator` (linha 241)
    
    #### Construtor
    ```typescript
    constructor(options: {
      sessionId?: string;
      debug?: boolean;
      planManager?: PlanManager;
    })
    ```
    
    Inicializa:
    - `sessionId` — ID único da sessão
    - `agents` — Lista de agentes registrados
    - `contextEngine` — Novo `ContextEngine`
    - `eventStream` — `EventEmitter` (SSE)
    - `eventBuffer` — Buffer de eventos para debug
    - `planManager` — Gerenciador de planos
    - Limites: `maxSteps = 20`, `maxTokensTotal = 128000`
    
    #### Método Principal: `execute(userMessage: string): Promise<string>`
    
    **Fluxo Completo:**
    
    ```
    1. User envia mensagem
    2. Gera plano (generatePlan)
    3. eventStream: "plan_start"
    4. Para cada step:
       a. Parse do step (extractJSON)
       b. Identifica qual agente usar
       c. Prepara contexto
       d. Invoca agente
       e. Faz reflexão (reflection)
       f. Se falhou: retry com abordagem alternativa
       g. Acumula contexto
    5. eventStream: "agent_end"
    6. Retorna último resultado
    ```
    
    #### Geração de Plano (`generatePlan`)
    
    ```typescript
    private async generatePlan(userMessage: string): Promise<string>
    ```
    
    - Chama a LLM com prompt especial para gerar um plano
    - O prompt instrui a LLM a gerar steps no formato:
      ```json
      {
        "agent": "nome_do_agente",
        "instruction": "instrução detalhada",
        "nextStep": true
      }
      ```
    - Retorna o plano como string
    
    #### Processamento de Cada Step (`processStep`)
    
    Para cada passo do plano:
    1. Extrai o JSON do passo
    2. Busca o agente no registry
    3. Prepara o contexto acumulado + instrução
    4. Invoca o agente via LLM com tools
    5. Faz reflexão do resultado
    6. Se reflexão indicar falha → ajusta e tenta novamente
    
    #### Invocação de Agente (`invokeAgent`)
    
    ```typescript
    private async invokeAgent(
      agentConfig: AgentConfig,
      instruction: string,
      context: string
    ): Promise<{ result: string; reflection: ReflectionResult | null }>
    ```
    
    1. Monta messages: `system prompt` + `context` + `instruction`
    2. Define `tools` do agente
    3. Chama LLM com `tool_choice: "auto"`
    4. Processa `tool_calls` (chamadas de ferramentas)
    5. Retorna resultado + reflexão
    
    #### Reflexão (`reflect`)
    
    ```typescript
    private async reflect(
      agent: string,
      instruction: string,
      result: string
    ): Promise<ReflectionResult>
    ```
    
    Chama a LLM especificamente para refletir sobre o resultado:
    - O resultado foi bem-sucedido?
    - O que faltou?
    - Qual informação está faltando?
    - Sugerir agente alternativo?
    - Sugerir abordagem alternativa?
    - Gerar retryPrompt melhorado?
    
    ```typescript
    interface ReflectionResult {
      success: "yes" | "no" | "partial";
      missingInfo: string[];
      learning?: string;
      retryDifferent?: boolean;
      alternativeApproach?: string;
      suggestedAgent?: string;
      retryPrompt?: string;
    }
    ```
    
    #### Processamento de Ferramentas (`processToolCalls`)
    
    ```typescript
    private async processToolCalls(
      toolCalls: any[],
      agentConfig: AgentConfig
    ): Promise<string>
    ```
    
    Para cada `tool_call`:
    1. Busca a ferramenta no registry
    2. Executa o handler
    3. Retorna resultados consolidados
    
    #### Sistema de Eventos
    
    ```typescript
    this.eventStream.push(createEvent("plan_start", { plan }));
    this.eventStream.push(createEvent("agent_start", { agent: parsed.agent }));
    this.eventStream.push(createEvent("agent_result", { ... }));
    this.eventStream.push(createEvent("reflection", { ... }));
    this.eventStream.push(createEvent("error", { ... }));
    this.eventStream.push(createEvent("agent_end"));
    ```
    
    ---
    
    ## 6. Gerenciador de Planos (PlanManager)
    
    ### `core/orchestrator/plan-manager.ts`
    
    ```typescript
    export class PlanManager {
      private plan: Plan | null = null;
    
      createPlan(description: string, steps: PlanStep[]): void { ... }
      hasPlan(): boolean { ... }
      getCurrentStep(): PlanStep | null { ... }
      getNextStep(): PlanStep | null { ... }
      updateStep(stepIndex: number, updates: Partial<PlanStep>): void { ... }
      completeStep(stepIndex: number, result: string): void { ... }
      addLearning(learning: string): void { ... }
      getPlanSummary(): string { ... }
      isComplete(): boolean { ... }
      getPlan(): Plan | null { ... }
    }
    ```
    
    ```typescript
    interface Plan {
      description: string;
      steps: PlanStep[];
      createdAt: number;
      learnings: string[];
      status: "active" | "completed" | "failed";
      currentStepIndex: number;
    }
    
    interface PlanStep {
      index: number;
      agent: string;
      instruction: string;
      status: "pending" | "in_progress" | "completed" | "failed";
      result?: string;
      error?: string;
    }
    ```
    
    ---
    
    ## 7. Context Engine
    
    ### `core/context/ContextEngine.ts`
    
    Gerencia o contexto da conversa de forma eficiente.
    
    ```typescript
    export class ContextEngine {
      private messages: Message[] = [];
      private maxTokens: number = 64000;
      private tokenCount: number = 0;
    
      addMessage(message: Message): void { ... }
      getContext(maxTokens?: number): Message[] { ... }
      getTokenCount(): number { ... }
      clear(): void { ... }
      trimToTokenLimit(limit: number): void { ... }
    }
    ```
    
    **Método `trimToTokenLimit`:** Quando o contexto excede o limite, remove as mensagens mais antigas (preservando o system prompt).
    
    ---
    
    ## 8. Memory System
    
    ### `core/memory/MemoryManager.ts`
    
    ```typescript
    export class MemoryManager {
      private memoryDir: string;
      private summarizer: MemorySummarizer;
      private tokenGuard: TokenGuard;
    
      async saveConversation(conversation: Conversation): Promise<void> { ... }
      async search(query: string, maxResults?: number): Promise<MemoryItem[]> { ... }
      async getRelevantContext(query: string): Promise<string> { ... }
      async consolidateMemories(): Promise<void> { ... }
    }
    ```
    
    ### `core/memory/MemorySummarizer.ts`
    
    ```typescript
    export class MemorySummarizer {
      async summarize(conversation: Conversation): Promise<string> { ... }
      async consolidateDailyNotes(): Promise<string> { ... }
    }
    ```
    
    **Formato de saída:**
    ```markdown
    # Notas Diarias - YYYY-MM-DD
    
    ### YYYY-MM-DD HH:MM:SS
    
    Conversa: {resumo do assunto}
    Resultado: {resumo do resultado}
    ```
    
    ### `core/memory/TokenGuard.ts`
    
    ```typescript
    export class TokenGuard {
      async guard(conversation: Conversation): Promise<Conversation> { ... }
      async shouldSummarize(conversation: Conversation): Promise<boolean> { ... }
    }
    ```
    
    **Fluxo do TokenGuard:**
    1. Verifica se a conversa excedeu o limite de tokens
    2. Se sim, chama o MemorySummarizer para sumarizar
    3. Substitui o dump bruto por resumo inteligente
    4. Salva no arquivo de memória
    
    ### `core/memory/types.ts`
    
    ```typescript
    interface MemoryItem {
      id: string;
      content: string;
      timestamp: number;
      type: "conversation" | "learning" | "preference";
      tags: string[];
    }
    
    interface Conversation {
      id: string;
      messages: Message[];
      summary?: string;
      createdAt: number;
      updatedAt: number;
    }
    ```
    
    ---
    
    ## 9. Tool System — Ferramentas dos Agentes
    
    ### `core/tools/ToolDefinition.ts`
    
    ```typescript
    export class ToolDefinition {
      constructor(
        public name: string,
        public description: string,
        public parameters: Record<string, unknown>,
        public handler: (args: any, context: ToolContext) => Promise<any>,
        public requiresConfirmation?: boolean,
        public dangerous?: boolean,
        public category?: string
      ) {}
    }
    ```
    
    ### `core/tools/tool-registry.ts`
    
    ```typescript
    const toolRegistry = new Map<string, ToolDefinition>();
    
    export function registerTool(tool: ToolDefinition): void { ... }
    export function getTool(name: string): ToolDefinition | undefined { ... }
    export function getToolsForAgent(agentName: string): ToolDefinition[] { ... }
    export function getAllTools(): ToolDefinition[] { ... }
    ```
    
    ### Ferramentas Built-in
    
    #### 1. `execute_python`
    - **Categoria:** code
    - **Descrição:** Execute Python code
    - **Handler:** Executa código via `child_process.exec`
    - **Contexto:** Usa `ToolContext` com `sandboxDir`
    
    #### 2. `web_search`
    - **Categoria:** search
    - **Descrição:** Search the web
    - **Handler:** Faz busca via API DuckDuckGo
    - **Retorno:** Resultados estruturados
    
    #### 3. `memory_search`
    - **Categoria:** memory
    - **Descrição:** Search long-term memory
    - **Handler:** Busca nos arquivos de memória
    
    #### 4. `spawn_agent`
    - **Categoria:** agent
    - **Descrição:** Spawn sub-agent
    - **Handler:** Cria sub-agente para tarefa específica
    - **Parâmetros:** `instruction`, `agent` (tipo)
    
    #### 5. `create_background_task`
    - **Categoria:** task
    - **Descrição:** Schedule background task
    - **Parâmetros:** `description`, `instruction`, `agent`, `delaySeconds`
    
    #### 6. `list_background_tasks`
    - **Categoria:** task
    - **Descrição:** List background tasks
    
    #### 7. `todo_write`
    - **Categoria:** task
    - **Descrição:** Manage TODO list
    
    #### 8. `schedule_task`
    - **Categoria:** task
    - **Descrição:** Schedule recurring task (cron)
    
    #### 9. `list_scheduled_tasks`
    - **Categoria:** task
    - **Descrição:** List scheduled tasks
    
    #### 10. `cancel_background_task`
    - **Categoria:** task
    - **Descrição:** Cancel background task
    
    #### 11. `delete_scheduled_task`
    - **Categoria:** task
    - **Descrição:** Delete scheduled task
    
    ### ToolContext
    
    ```typescript
    interface ToolContext {
      sessionId: string;
      memoryManager: MemoryManager;
      sandboxDir?: string;
      agentName: string;
    }
    ```
    
    ---
    
    ## 10. Tipos e Contratos (types.ts)
    
    ### Eventos do Sistema
    
    ```typescript
    type EventType =
      | "plan_start"
      | "plan_step"
      | "plan_complete"
      | "agent_start"
      | "agent_result"
      | "agent_end"
      | "tool_call"
      | "tool_result"
      | "reflection"
      | "error"
      | "message"
      | "done"
      | "status"
      | "token_usage";
    ```
    
    ### Mensagens do Chat
    
    ```typescript
    interface Message {
      id: string;
      role: "user" | "assistant" | "system" | "tool";
      content: string;
      agent?: string;
      toolCalls?: ToolCall[];
      timestamp: number;
      tokens?: number;
    }
    ```
    
    ---
    
    ## 11. Integrações Externas
    
    ### GroqProvider (`core/llm/groq-provider.ts`)
    
    ```typescript
    export class GroqProvider implements LLMProvider {
      private apiKey: string;
      private baseUrl = "https://api.groq.com/openai/v1";
    
      constructor(apiKey: string) { ... }
    
      async generateResponse(options: {
        messages: Message[];
        tools?: ToolDefinition[];
        tool_choice?: "auto" | "none";
        maxTokens?: number;
        temperature?: number;
        model?: string;
      }): Promise<LLMResponse> { ... }
    
      async generateStreamingResponse(...): Promise<AsyncIterable<LLMResponse>> { ... }
    }
    ```
    
    **LLMProvider Interface:**
    
    ```typescript
    interface LLMProvider {
      generateResponse(options: GenerateOptions): Promise<LLMResponse>;
      generateStreamingResponse?(options: GenerateOptions): Promise<AsyncIterable<LLMResponse>>;
    }
    ```
    
    **Modelos usados:**
    - Padrão: `llama-3.3-70b-versatile`
    - Tool calling: mesmo modelo
    - Streaming: suportado
    
    ---
    
    ## 12. Sistema de Eventos (SSE)
    
    ### `core/events/EventEmitter.ts`
    
    ```typescript
    export class EventEmitter {
      private listeners: Map<string, Function[]> = new Map();
      private eventQueue: Event[] = [];
      private controller?: ReadableStreamController<any>;
    
      on(event: string, callback: Function): void { ... }
      emit(event: string, data: any): void { ... }
      push(event: Event): void { ... }
      end(finalData?: any): void { ... }
      getReadableStream(): ReadableStream { ... }
    }
    ```
    
    ### Formato dos Eventos
    
    ```typescript
    interface Event {
      type: EventType;
      data: any;
      timestamp: number;
      sessionId: string;
    }
    ```
    
    ### API Route (`api/chat/route.ts`)
    
    - **Endpoint:** `/api/chat`
    - **Método:** POST
    - **Retorno:** SSE (Server-Sent Events)
    - **Fluxo:**
      1. Recebe `{ message, sessionId? }`
      2. Cria/recupera `AgentOrchestrator`
      3. Executa em background
      4. Stream eventos para o cliente
    
    ---
    
    ## 13. Fluxos Completos
    
    ### Fluxo 1: Chat Normal (Sem Plano)
    
    ```
    User → MessageInput → useChat.sendMessage() → POST /api/chat
                                                         ↓
                                                  AgentOrchestrator.execute()
                                                         ↓
                                                  generatePlan()
                                                         ↓
                                                  [plan_start event]
                                                         ↓
                                                  Para cada step:
                                                    → agent_start event
                                                    → invokeAgent()
                                                    → agent_result event
                                                    → reflection event
                                                    → (se falhou: retry)
                                                         ↓
                                                  [agent_end event]
                                                         ↓
                                                  MemoryManager.saveConversation()
                                                  MemorySummarizer.summarize()
                                                  TokenGuard.guard()
    ```
    
    ### Fluxo 2: Com Ferramentas
    
    ```
    Agent recebe instrução + tools
             ↓
    LLM decide usar tool → tool_call
             ↓
    Orchestrator.processToolCalls()
             ↓
      Para cada tool_call:
        → tool_call event
        → Busca tool no registry
        → Executa handler
        → tool_result event
        → Adiciona ao contexto
             ↓
    LLM gera resposta final baseada nos tool_results
    ```
    
    ### Fluxo 3: Reflexão com Retry
    
    ```
    Após invokeAgent():
      → reflect(agent, instruction, result)
      → Se success === "no" && retryDifferent:
        → Usa retryPrompt melhorado
        → Sugere agente alternativo
        → Adiciona contexto do erro
        → Re-invoca agente
      → Se success === "yes":
        → Avança para próximo step
    ```
    
    ### Fluxo 4: Memória de Longo Prazo
    
    ```
    Após cada interação:
      → MemoryManager.saveConversation()
      → Se TokenGuard.shouldSummarize():
        → MemorySummarizer.summarize()
        → Salva em memory/{sessionId}.md
        → MemoryManager.consolidateMemories()
      
    Durante busca:
      → MemoryManager.search(query)
      → Busca em arquivos .md por keywords
      → Retorna contexto relevante
    ```
    
    ---
    
    ## 14. Frontend — React
    
    ### Componentes Principais
    
    | Componente | Função |
    |-----------|--------|
    | **ChatContainer** | Container principal do chat |
    | **MessageList** | Renderiza mensagens com suporte a markdown |
    | **MessageInput** | Input com submit via Enter |
    | **EventStream** | Conecta ao SSE e processa eventos |
    | **AgentStatus** | Mostra status dos agentes (idle/working/done/error) |
    | **ToolPanel** | Painel de ferramentas disponíveis |
    | **MemoryViewer** | Visualizador de memória persistente |
    | **TokenUsage** | Gráfico/indicador de uso de tokens |
    | **ReflectionPanel** | Mostra reflexões dos agentes |
    | **PlanPanel** | Mostra o plano em andamento |
    | **ProviderCards** | Cards de provedores (Clerk, etc.) |
    
    ### Hooks
    
    | Hook | Função |
    |------|--------|
    | **`useChat`** | `sendMessage()`, `messages[]`, `isLoading`, `error`, `events[]` |
    | **`useEvents`** | Conecta ao SSE, gerencia `EventSource`, processa eventos |
    | **`useMemory`** | `searchMemory()`, `saveMemory()`, `memories[]` |
    
    ### `useChat` Hook — API
    
    ```typescript
    function useChat() {
      return {
        messages: Message[],
        isLoading: boolean,
        error: string | null,
        events: Event[],
        sendMessage: (text: string) => Promise<void>,
        clearMessages: () => void,
        agentStatuses: Record<string, AgentStatus>,
        plan: Plan | null,
      };
    }
    ```
    
    ### Estilização
    - **Tailwind CSS** para estilização
    - **`globals.css`** com custom properties
    - **`cn.ts`** utility para combinar classes condicionalmente
    
    ---
    
    ## 15. Diagrama de Dependências
    
    ```
    ┌───────────────────────────────────────────────────────────┐
    │                      FRONTEND (React)                     │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
    │  │useChat   │  │useEvents │  │useMemory │  │Componente│  │
    │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┘  │
    │       │              │              │                      │
    └───────┼──────────────┼──────────────┼──────────────────────┘
            │              │              │
            │         POST /api/chat      │
            │              │              │
    ┌───────┼──────────────┼──────────────┼──────────────────────┐
    │       ▼              ▼              ▼                      │
    │  ┌──────────────────────────────────────────────────────┐  │
    │  │              AgentOrchestrator                       │  │
    │  │  ┌────────────────────────────────────────────────┐  │  │
    │  │  │           ContextEngine                        │  │  │
    │  │  └────────────────────────────────────────────────┘  │  │
    │  │                          │                           │  │
    │  │  ┌─────────┐  ┌──────────┴──────────┐  ┌─────────┐  │  │
    │  │  │ Agents  │  │   LLMProvider       │  │  Tools  │  │  │
    │  │  │ Registry│  │   (GroqProvider)    │  │ Registry│  │  │
    │  │  └────┬────┘  └──────────┬──────────┘  └────┬────┘  │  │
    │  │       │                  │                   │       │  │
    │  │  ┌────┴────┐    ┌───────┴────────┐    ┌─────┴─────┐  │  │
    │  │  │Assistant│    │  Groq API      │    │web-search │  │  │
    │  │  │Python   │    │  (llama-3.3)   │    │py-execute │  │  │
    │  │  │Browser  │    └────────────────┘    │mem-search │  │  │
    │  │  │Shell    │                          │spawn-agent│  │  │
    │  │  │Writer   │                          └───────────┘  │  │
    │  │  └─────────┘                                        │  │
    │  │                          │                           │  │
    │  │  ┌───────────────────────┴───────────────────────┐   │  │
    │  │  │              Memory System                     │   │  │
    │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │   │  │
    │  │  │  │  Memory   │ │  Memory  │ │  Token   │      │   │  │
    │  │  │  │  Manager  │ │Summarizer│ │  Guard   │      │   │  │
    │  │  │  └──────────┘ └──────────┘ └──────────┘      │   │  │
    │  │  └───────────────────────────────────────────────┘   │  │
    │  │                          │                           │  │
    │  │  ┌───────────────────────┴───────────────────────┐   │  │
    │  │  │              Event System (SSE)                │   │  │
    │  │  │         EventEmitter → ReadableStream          │   │  │
    │  │  └───────────────────────────────────────────────┘   │  │
    │  └──────────────────────────────────────────────────────┘  │
    └───────────────────────────────────────────────────────────┘
    ```
    
    ---
    
    ## 📊 Estatísticas do Código
    
    | Módulo | Arquivos | Funções/Classes | Ferramentas | Agentes |
    |--------|----------|-----------------|-------------|---------|
    | **agents** | 7 | 5 agentes + registry | — | 5 expostos |
    | **orchestrator** | 3 | AgentOrchestrator, PlanManager | — | — |
    | **tools** | 6 | ToolDefinition, registry | 11 built-in | — |
    | **memory** | 4 | MemoryManager, Summarizer, TokenGuard | — | 1 interno |
    | **context** | 1 | ContextEngine | — | — |
    | **llm** | 2 | GroqProvider | — | — |
    | **events** | 1 | EventEmitter | — | — |
    | **frontend** | ~15 | Components + Hooks | — | — |
    | **Total** | ~40 | ~25 classes/funções principais | 11 | 5 + 1 interno |
    
    ---
    
    ## 🔑 Pontos-Chave da Arquitetura
    
    1. **Composição sobre Herança** — Agentes são configurados com `AgentConfig` (composição), não herança
    2. **Plano Centralizado** — O `AgentOrchestrator` gera e gerencia o plano, não os agentes
    3. **Reflexão como Feedback** — Após cada ação, o sistema reflete antes de prosseguir
    4. **Contexto Acumulativo** — Cada passo adiciona ao contexto global, permitindo continuidade
    5. **Streaming Total** — Todos os eventos são transmitidos em tempo real via SSE
    6. **Memória Híbrida** — Combina resumo inteligente (MemorySummarizer) com retenção raw
    7. **Ferramentas como Plugins** — Tools são registradas e descobertas dinamicamente
    8. **Agentes Especializados** — Cada agente tem ferramentas específicas para seu domínio
    9. **LLM como Motor Central** — Tanto decisões quanto execução passam pelo LLM
    10. **Resiliência via Retry** — O sistema tenta abordagens alternativas em caso de falha
    
    ---
    
    ## 🧠 Padrões de Design Identificados
    
    | Padrão | Onde é usado |
    |--------|-------------|
    | **Registry** | AgentRegistry, ToolRegistry |
    | **Strategy** | Diferentes agentes para diferentes tarefas |
    | **Chain of Responsibility** | Steps do plano executados em sequência |
    | **Observer** | EventEmitter → listeners |
    | **Mediator** | Orchestrator media entre agentes, tools, memória |
    | **Facade** | Core/index.ts exporta interface simplificada |
    | **Factory** | Criação de agentes via config |
    | **Template Method** | Fluxo execute() com hooks (reflection) |
    
    ---
    
    ## 🔮 Possíveis Melhorias
    
    - [ ] **Rate Limiting** — Controle de taxa para API da Groq
    - [ ] **Caching** — Cache de respostas para reduzir chamadas LLM
    - [ ] **Paralelismo** — Executar steps independentes em paralelo
    - [ ] **Fallback de LLM** — Múltiplos provedores (OpenAI, Anthropic)
    - [ ] **Testes Automatizados** — Falta cobertura de testes
    - [ ] **Observabilidade** — Métricas, tracing, logging estruturado
    - [ ] **Segurança** — Sandbox mais robusto para execução de código
    - [ ] **Persistência** — Banco de dados real (PostgreSQL/MongoDB)
    - [ ] **Autenticação** — Já tem Clerk, mas pode expandir
    - [ ] **Plugins** — Sistema de plugins para ferramentas de terceiros
    
    ---
    
    ## 📝 Notas Finais
    
    Este documento cobre **toda a arquitetura** do Colabor-AI. O sistema é bem modular, com separação clara de responsabilidades. A arquitetura orientada a agentes com orquestração por plano e reflexão contínua é um design maduro e resiliente para sistemas multi-agentes.
    
    O uso de **SSE para streaming**, **Registry pattern para extensibilidade**, e **Context Engine para gerenciamento de tokens** mostra preocupação com escalabilidade e experiência do usuário.
    
    