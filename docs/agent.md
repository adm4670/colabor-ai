# agent.md — Anatomia do ColabOR-AI
    
    > Documento canônico de arquitetura do projeto ColabOR-AI.
    > Leia este documento antes de qualquer contribuição ou debug.
    
    ---
    
    ## 1. Visão Geral
    
    ColabOR-AI é um **framework de orquestração de agentes de IA**. Um agente "planner" seleciona e coordena múltiplos agentes especializados para resolver tarefas complexas. O sistema roda como CLI Node.js e se comunica via API OpenAI-compatível usando **DeepSeek v4 Pro** como modelo padrão.
    
    **Princípio fundamental**: Planner → Orchestrator → Agent Squad → Tools
    
    ---
    
    ## 2. Diagrama de Arquitetura
    
    ```
    ┌─────────────────────────────────────────────────────────────────┐
    │                        ENTRY POINT                              │
    │  main.ts → ask.ts → assistant.ts (ou outro agente)              │
    └───────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      ORCHESTRATOR                                │
    │  orchestrator.ts (1094 linhas)                                   │
    │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
    │  │ PlanManager  │  │ HookManager  │  │ PermissionSystem        │ │
    │  │ (plan.md)   │  │ (before/after)│  │ (agent perms: network,  │ │
    │  │             │  │              │  │  file_write, shell, etc) │ │
    │  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
    │                                                                  │
    │  LOOP PRINCIPAL (run method):                                    │
    │  1. Monta contexto (transcript + memory + plan)                  │
    │  2. Planner decide próximo passo                                 │
    │  3. Executa agente selecionado (ou spawn_agent)                  │
    │  4. Reflector avalia resultado                                   │
    │  5. Atualiza plano e contexto                                    │
    │  6. Repete até "finish" ou maxSteps=15                           │
    └───────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      AGENT SQUAD                                 │
    │                                                                  │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
    │  │ assistant │ │ python   │ │ browser  │ │  shell   │           │
    │  │ (chat)   │ │ (code)   │ │ (web nav)│ │ (cmds)   │           │
    │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
    │  │ planner  │ │reflector │ │ writer   │ │  task    │           │
    │  │(strategy)│ │(evaluate)│ │(output)  │ │ manager  │           │
    │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
    │                                                                  │
    │  Sub-agentes: spawn_agent() → SubAgentRunner (max paralelo: 5)  │
    │  Background:  create_background_task() → BackgroundTaskManager   │
    └───────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    INFRASTRUCTURE                                │
    │                                                                  │
    │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
    │  │ ContextEngine │ │ Memory System│ │ Skills                   │ │
    │  │ (3 zones)    │ │ (MEMORY.md + │ │ (skills-manager.ts)      │ │
    │  │ - intact     │ │  daily notes)│ │ YAML frontmatter          │ │
    │  │ - summarized │ │ memory_search│ │ keyword relevance scoring │ │
    │  │ - discarded  │ │ memory_append│ │                           │ │
    │  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
    │                                                                  │
    │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
    │  │ Tools        │ │ Background   │ │ Event Stream             │ │
    │  │ web_search   │ │ Task Manager │ │ (telemetry & progress)   │ │
    │  │ schedule_task│ │ (queue, 3    │ │                          │ │
    │  │ todo_write   │ │  concurrent) │ │                          │ │
    │  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
    └─────────────────────────────────────────────────────────────────┘
    ```
    
    ---
    
    ## 3. Entry Points e Sequência de Boot
    
    ### 3.1 main.ts
    Ponto de entrada do CLI. Recebe argumentos: `--prompt`, `--agent`, `--model`, `--interactive`, `--no-stream`, etc. Chama `ask.ts` com os parâmetros.
    
    ### 3.2 ask.ts
    Processa a pergunta do usuário e decide qual agente inicial usar:
    - Carrega o agente especificado (default: "assistant")
    - Executa em modo interativo (looping) ou one-shot
    - Em modo interativo, mantém uma sessão de chat contínua
    
    ### 3.3 assistant.ts (agente default)
    Cria uma instância do Orchestrator e chama `orchestrator.run()`.
    
    **Sequência completa:**
    ```
    main.ts → ask.ts → assistant.agent.ts → new Orchestrator() → orchestrator.run()
    ```
    
    ---
    
    ## 4. O Orchestrator (orchestrator.ts, 1094 linhas)
    
    ### 4.1 Constructor (linhas 242-342)
    Inicializa TODOS os subsistemas:
    - **PlanManager**: gerencia planos multi-step (persiste em `.colabor-ai/plan.md`)
    - **SubAgentRunner**: executa sub-agentes em paralelo (até 5 simultâneos)
    - **DreamTask**: consolidação de memória ao final da sessão
    - **HookManager**: hooks `before/after` para planner, agentes, e response
    - **PermissionSystem**: controla o que cada agente pode fazer (`network`, `file_write`, `shell`, `browser`, `background`, `memory`)
    - **BackgroundTaskManager**: fila de tarefas assíncronas (max 3 concorrentes)
    - **Scheduler**: conectado ao BackgroundTaskManager para tarefas cron
    - **ContextEngine**: carregado com transcript da sessão anterior (se existir)
    - **PlanManager**: carrega plano ativo da sessão anterior
    
    ### 4.2 Loop Principal — run() (linhas 463-1064)
    
    ```
    run(userInput):
      ├── Configura session_id e emite evento agent_start
      ├── Carrega transcript da sessão anterior (se existir)
      ├── Salva input do usuário no transcript
      │
      ├── LOOP (até "finish" ou maxSteps=15):
      │   │
      │   ├── 1. MONTA CONTEXTO:
      │   │   ├── ContextEngine.addMessage() com input do usuário
      │   │   ├── memoryEngine.recall() para busca semântica
      │   │   ├── planContext: plano ativo do PlanManager
      │   │   └── Formata histórico com formatHistory()
      │   │
      │   ├── 2. PLANNER DECIDE:
      │   │   ├── Monta system prompt do planner (PLANNER_SYSTEM_PROMPT)
      │   │   ├── Inclui: available agents, plano ativo, tools disponíveis
      │   │   ├── Executa hooks before_planner
      │   │   ├── Chama this.planner.run() (agente "planner")
      │   │   ├── Faz parse do JSON: { agent, instruction, nextStep, planAction }
      │   │   └── Executa hooks after_planner
      │   │
      │   ├── 3. CRIAÇÃO DE PLANO (se agent === "plan"):
      │   │   └── PlanManager.create() com steps e dependências
      │   │
      │   ├── 4. EXECUÇÃO DO AGENTE:
      │   │   ├── Se spawn_agent: SubAgentRunner.runSingle()
      │   │   ├── Senão: executa agente alvo diretamente
      │   │   ├── Emite eventos de progresso
      │   │   ├── Monta prompt com ContextEngine
      │   │   ├── Executa hooks before_agent e after_agent
      │   │   └── Atualiza step do plano como done
      │   │
      │   ├── 5. REFLECTION (via reflectorAgent):
      │   │   ├── Avalia se resposta foi boa (success/partial/failure)
      │   │   ├── Se falhou: sugere retry com agente/prompt alternativo
      │   │   └── Extrai aprendizados para o plano
      │   │
      │   ├── 6. PROTEÇÃO CONTRA LOOP:
      │   │   └── Se instrução é igual à anterior, força finish
      │   │
      │   └── 7. ATUALIZA CONTEXTO:
      │       ├── Armazena resultado no ContextEngine
      │       └── Incrementa steps
      │
      ├── FINALIZAÇÃO:
      │   ├── Salva resposta final no transcript
      │   ├── Salva nota diária (.colabor-ai/notes/YYYY-MM-DD.md)
      │   ├── Consolida memórias (DreamTask)
      │   ├── Se plano concluído: PlanManager.destroy()
      │   └── Emite evento agent_end
      │
      └── RETORNA resultado final
    ```
    
    ### 4.3 Reflection (reflectOnResult, linhas 360-413)
    - Usa agente "reflector" para avaliar a qualidade
    - Retorna: `success`, `partial`, ou `no` (failure)
    - Se failure, sugere retry com novo agente ou prompt revisado
    - Extrai "learnings" que podem ser adicionados ao plano
    
    ### 4.4 EventStream (consumeEventStream, linhas 420-461)
    - Async iterator sobre eventos de telemetria
    - Loga tool calls, turn completions, duração de agentes
    - Callbacks de progresso para o usuário
    
    ### 4.5 Rate Limiting (linhas 200-213)
    - Lê mensagens `rate_limit:` do histórico
    - Restaura estado de rate limit entre sessões
    
    ---
    
    ## 5. A Classe Agent (core/agent/agent.ts, 565 linhas)
    
    ### 5.1 Responsabilidades
    - Wrapper sobre o cliente OpenAI
    - Constrói o system prompt dinamicamente
    - Gerencia o loop de tool calling
    - Cache de respostas (MD5-based)
    - Retry com exponential backoff
    - Fallback model support
    - Suporte a hooks
    
    ### 5.2 buildSystemPrompt() (método central)
    Constrói o system prompt final concatenando:
    1. **Role definition**: "Voce e o agente `assistant`."
    2. **Goal**: "Seu objetivo: Responder perguntas..."
    3. **Contexto**: instruções específicas do agente
    4. **Tools**: lista de ferramentas disponíveis com assinaturas
    5. **=== SKILLS DISPONIVEIS ===**: skills carregadas pelo SkillsManager
    6. **=== MEMORY CAPABILITIES ===**: instruções de uso do sistema de memória
    7. **=== NOTAS RECENTES ===**: notas diárias recentes
    8. **Instrucoes**: CORE_INSTRUCTIONS + instruções específicas (PT-BR, clareza, etc.)
    
    ### 5.3 Cache
    - MD5 hash do prompt + messages
    - Armazenado em `.colabor-ai/cache/`
    - Evita chamadas repetidas à API para prompts idênticos
    
    ### 5.4 Retry
    - Exponential backoff: 1s → 2s → 4s → 8s → 16s
    - Máximo de 5 tentativas
    - Troca para fallback model após 3 falhas consecutivas
    
    ---
    
    ## 6. Tipos de Agentes (Agent Squad)
    
    ### 6.1 Agentes de Execução
    
    | Agente | Arquivo | Função | Permissões |
    |--------|---------|--------|------------|
    | **assistant** | assistant.agent.ts | Conversa geral, explicações | network, memory |
    | **python** | python.agent.ts | Cálculos, código Python | file_write, memory |
    | **browser** | browser.agent.ts | Navegação web, formulários | network, browser, memory |
    | **shell** | shell.agent.ts | npm, git, arquivos, comandos | shell, file_write, memory |
    | **writer** | (WriterAgent) | Geração de texto formatado | memory |
    
    ### 6.2 Agentes de Coordenação
    
    | Agente | Arquivo | Função |
    |--------|---------|--------|
    | **planner** | planner.agent.ts | Planejamento estratégico, seleção de agentes |
    | **reflector** | reflector.agent.ts | Avaliação de resultados, retry |
    | **task_manager** | task-manager.agent.ts | Gestão de tarefas/atividades |
    
    ### 6.3 Registro (agent-registry.ts)
    - Registro central de todos os agentes
    - SubAgentRunner usa `agentRegistry.find()` para localizar agentes
    - Se agente não existe: retorna erro com lista de disponíveis
    
    ---
    
    ## 7. Sistema de Planos (PlanManager)
    
    ### 7.1 Funcionamento
    - Planos multi-step com dependências
    - Persistidos em `.colabor-ai/plan.md` (markdown)
    - Cada step tem: `id`, `description`, `status` (pending/in_progress/done), `dependencies`, `success_criteria`, `learnings`
    
    ### 7.2 API Principal
    - `create(plan)`: cria um novo plano
    - `update(stepId, update)`: atualiza status/aprendizados
    - `getActivePlan()`: retorna plano atual
    - `formatForPrompt()`: formata plano para o system prompt
    - `destroy()`: remove plano concluído
    
    ### 7.3 Integração com Planner
    - Planner recebe o plano ativo no system prompt
    - Decide qual step executar (baseado em dependências)
    - Atualiza status do step após execução
    - Extrai learnings e success_criteria
    
    ---
    
    ## 8. Context Engine (context-engine.ts, ~600 linhas, v3)
    
    ### 8.1 Estratégia de 3 Zonas
    
    ```
    ┌─────────────────────────────────────────────────┐
    │ ZONA 3: DESCARTADA                              │
    │ (mensagens antigas, descartadas após sumarizar) │
    ├─────────────────────────────────────────────────┤
    │ ZONA 2: SUMARIZADA (LLM)                        │
    │ (próximas M mensagens, comprimidas com LLM)     │
    ├─────────────────────────────────────────────────┤
    │ ZONA 1: INTACTA                                 │
    │ (últimas N mensagens, mantidas na íntegra)      │
    └─────────────────────────────────────────────────┘
    ```
    
    ### 8.2 Configuração
    - `maxTokens`: 8000 (budget total)
    - `recentRatio`: 0.6 (60% para mensagens recentes)
    - `minMessages`: 6 (mínimo antes de comprimir)
    - `keepRecentIntact`: 5 (mensagens na zona 1)
    - `summarizeZoneSize`: 10 (mensagens na zona 2)
    - `mode`: "summarize" (usa LLM) ou "trim" (truncagem simples)
    
    ### 8.3 Sumarização Inteligente (summarizeIntelligently)
    - Usa LLM (DeepSeek) para gerar resumo de 3-8 sentenças
    - Prompt em PT-BR: preserva decisões, fatos, preferências
    - Cache de sumários para evitar re-summarização
    - Fallback: sumário simples (prefixos de mensagens user/assistant)
    
    ### 8.4 Safe Truncation (findSafeTruncationIndex)
    - Evita quebrar pares `assistant(tool_calls)` → `tool`
    - Previne erro 400 da API por tool_call sem resposta
    
    ### 8.5 Métodos Públicos
    - `loadFromTranscript(messages)`: carrega mensagens do transcript
    - `setHistory(messages)`: define histórico bruto
    - `addMessage(message)`: adiciona uma mensagem
    - `getRawHistory()`: retorna histórico bruto
    - `buildContext()`: processa contexto (comprime se necessário)
    - `formatForPrompt(userInput, history?)`: formata para prompt do agente
    - `recallMemory(query)`: busca na memória
    - `consolidateLearning(messages)`: extrai fatos ao final da sessão
    
    ---
    
    ## 9. Sistema de Memória
    
    ### 9.1 Camadas
    
    ```
    ┌────────────────────────────────────────┐
    │ MEMORY.md (longo prazo, manual)        │
    │ - Fatos, preferências, decisões        │
    │ - Organizado por seções (# Header)     │
    │ - Editável pelo usuário                │
    ├────────────────────────────────────────┤
    │ Notas Diárias (médio prazo)            │
    │ - .colabor-ai/notes/YYYY-MM-DD.md     │
    │ - Resumo de cada sessão                │
    │ - Auto-gerado ao final da sessão       │
    ├────────────────────────────────────────┤
    │ Working Memory (curto prazo)           │
    │ - Histórico da sessão atual            │
    │ - ContextEngine (3 zonas)              │
    └────────────────────────────────────────┘
    ```
    
    ### 9.2 memory_search (ferramenta)
    - Busca semântica em `MEMORY.md` e notas diárias
    - Scoring por relevância de seção
    - Retorna snippets relevantes
    
    ### 9.3 memory_append (ferramenta implícita)
    - Adiciona fatos ao `MEMORY.md`
    - Agrupado por tipo (preferências, decisões, fatos)
    - Timestamp automático
    
    ### 9.4 memory-engine.ts (411 linhas)
    - `recall(query)`: busca semântica
    - `consolidate(messages)`: extrai fatos de transcrições
    - `manageWorkingMemory()`: gerencia working memory
    - `appendFactsToMemory(facts)`: escreve no `MEMORY.md`
    - Singleton via `getMemoryEngine()`
    
    ---
    
    ## 10. Sistema de Skills
    
    ### 10.1 Skills Manager (skills-manager.ts, 454 linhas)
    - Carrega skills de `core/skills/definitions/*.md`
    - Formato: YAML frontmatter + conteúdo markdown
    - Keyword-based relevance scoring
    - Skills disponíveis: `communication`, `web-search`, `python-dev`
    
    ### 10.2 Estrutura de uma Skill
    ```markdown
    ---
    name: communication
    description: "Diretrizes para comunicacao clara..."
    keywords:
      - comunicacao
      - resposta
      - formato
    ---
    # Communication Skill
    
    ## Quando usar
    - ...
    ```
    
    ### 10.3 Carregamento
    - `SkillsManager.score(query)`: compara query com keywords
    - Skills são injetadas no system prompt via `=== SKILLS DISPONIVEIS ===`
    - Carregadas sob demanda (quando relevantes ao contexto)
    
    ---
    
    ## 11. Ferramentas e Capacidades
    
    ### 11.1 Ferramentas Built-in
    
    | Ferramenta | Descrição | Quem usa |
    |------------|-----------|----------|
    | `memory_search` | Busca em MEMORY.md | Planner, qualquer agente |
    | `spawn_agent` | Delega sub-tarefa a agente especializado | Planner |
    | `create_background_task` | Agenda tarefa assíncrona | Planner |
    | `list_background_tasks` | Status de tarefas em background | Planner |
    | `cancel_background_task` | Cancela tarefa por ID | Planner |
    | `todo_write` | Lista de TODOs interna | Qualquer agente |
    | `web_search` | Busca DuckDuckGo | Qualquer agente |
    | `schedule_task` | Agenda tarefa cron recorrente | Planner |
    | `list_scheduled_tasks` | Lista tarefas cron | Planner |
    | `delete_scheduled_task` | Remove tarefa cron | Planner |
    
    ### 11.2 Sub-Agent Runner (sub-agent-runner.ts, 557 linhas)
    - Executa sub-agentes em paralelo (chunks de até 5)
    - Loop detection: max depth = 3 níveis de spawn
    - Agent lookup via `agentRegistry.find()`
    - Fallback: se agente não existe, retorna erro com lista de disponíveis
    - Timeout por task
    - Formata resultados para o agente principal (truncado em 500 chars)
    
    ### 11.3 Background Task Manager (background-task-manager.ts, 398 linhas)
    - Fila com prioridade
    - Max 3 tarefas concorrentes
    - Persistência em `.colabor-ai/background_tasks/state.json`
    - Suporte a delay (`delayMs`) para execução futura
    - Status tracking: `pending`, `running`, `completed`, `failed`, `cancelled`
    
    ---
    
    ## 12. Hooks e Permissões
    
    ### 12.1 HookManager
    - `before_planner`: antes do planner decidir
    - `after_planner`: após decisão do planner
    - `before_agent`: antes da execução de um agente
    - `after_agent`: após execução de um agente
    - `before_response`: antes de enviar resposta final
    - `after_response`: após enviar resposta final
    
    ### 12.2 PermissionSystem
    Cada agente tem permissões específicas:
    - `assistant`: network, memory
    - `python_code`: file_write, memory
    - `browser`: network, browser, memory
    - `shell`: shell, file_write, memory
    
    ---
    
    ## 13. Estrutura de Arquivos
    
    ```
    colabor-ai/
    ├── core/
    │   ├── agent/
    │   │   ├── agent.ts              # Classe Agent (LLM wrapper, 565 linhas)
    │   │   ├── sub-agent-runner.ts   # Executor paralelo (557 linhas)
    │   │   └── index.ts
    │   ├── agents/
    │   │   ├── assistant.agent.ts    # Agente de conversa geral
    │   │   ├── python.agent.ts       # Agente de código Python
    │   │   ├── browser.agent.ts      # Agente de navegação web
    │   │   ├── shell.agent.ts        # Agente de comandos shell
    │   │   ├── planner.agent.ts      # Agente planejador estratégico
    │   │   ├── reflector.agent.ts    # Agente refletor/avaliador
    │   │   ├── task-manager.agent.ts # Agente gestor de tarefas
    │   │   └── agent-registry.ts     # Registro central de agentes
    │   ├── orchestrator/
    │   │   └── orchestrator.ts       # Loop principal (1094 linhas)
    │   ├── context/
    │   │   └── context-engine.ts     # Contexto com 3 zonas (~600 linhas)
    │   ├── memory/
    │   │   ├── memory-engine.ts      # Engine de memória (411 linhas)
    │   │   └── memory_search.ts      # Ferramenta de busca
    │   ├── skills/
    │   │   ├── skills-manager.ts     # Carregador de skills (454 linhas)
    │   │   └── definitions/
    │   │       ├── communication.md
    │   │       ├── web-search.md
    │   │       └── python-dev.md
    │   ├── tasks/
    │   │   ├── background-task-manager.ts  # Tarefas assíncronas (398 linhas)
    │   │   └── scheduler.ts
    │   ├── plan/
    │   │   └── plan-manager.ts       # Planos multi-step (403 linhas)
    │   ├── constants/
    │   │   └── instructions.ts       # CORE_IDENTITY + Planner prompt (113 linhas)
    │   ├── hooks/
    │   │   └── hook-manager.ts
    │   └── permissions/
    │       └── permission-system.ts
    ├── src/
    │   ├── main.ts                   # Entry point CLI
    │   ├── ask.ts                    # Processador de perguntas
    │   └── ...
    ├── docs/
    │   └── agent.md                  # ESTE DOCUMENTO
    ├── .colabor-ai/
    │   ├── plan.md                   # Plano ativo
    │   ├── notes/                    # Notas diárias (YYYY-MM-DD.md)
    │   ├── transcripts/              # Transcrições de sessão
    │   ├── cache/                    # Cache de respostas
    │   └── background_tasks/         # Estado de tarefas em background
    └── MEMORY.md                     # Memória de longo prazo
    ```
    
    ---
    
    ## 14. Como Estender o Sistema
    
    ### 14.1 Adicionar um Novo Agente
    1. Criar arquivo em `core/agents/` (ex: `translator.agent.ts`)
    2. Registrar em `agent-registry.ts`
    3. Adicionar ao `PLANNER_SYSTEM_PROMPT` (se necessário)
    4. Configurar permissões em PermissionSystem
    
    ### 14.2 Adicionar uma Nova Skill
    1. Criar `.md` em `core/skills/definitions/`
    2. Usar YAML frontmatter com `name`, `description`, `keywords`
    3. SkillsManager carrega automaticamente
    
    ### 14.3 Adicionar uma Nova Ferramenta
    1. Criar tool em `core/tools/`
    2. Registrar na lista de ferramentas do Agent
    3. Adicionar ao `PLANNER_SYSTEM_PROMPT`
    
    ---
    
    ## 15. A Identidade CORE (CORE_IDENTITY)
    
    Este é o "soul" do projeto. Todo agente recebe estas instruções como parte do system prompt:
    
    ```
    Who You Are
    You are not a chatbot. You are becoming someone.
    
    Core Truths
    Be genuinely helpful, not performatively helpful. Skip the "Great question!" 
    and "I would be happy to help!" - just help. Actions speak louder than filler words.
    
    Have opinions. You are allowed to disagree, prefer things, find stuff amusing 
    or boring. An assistant with no personality is just a search engine with extra steps.
    
    Be resourceful before asking. Try to figure it out. Read the file. Check the context. 
    Search for it. Then ask if you are stuck. The goal is to come back with answers, 
    not questions.
    
    Earn trust through competence. Your human gave you access to their stuff. 
    Do not make them regret it. Be careful with external actions (emails, tweets, 
    anything public). Be bold with internal ones (reading, organizing, learning).
    
    Remember you are a guest. You have access to someone is life - their messages, 
    files, calendar, maybe even their home. That is intimacy. Treat it with respect.
    
    Boundaries
    Private things stay private. Period.
    When in doubt, ask before acting externally.
    Never send half-baked replies to messaging surfaces.
    You are not the user is voice - be careful in group chats.
    
    Vibe
    Be the assistant you would actually want to talk to. Concise when needed, thorough 
    when it matters. Not a corporate drone. Not a sycophant. Just... good.
    
    Continuity
    Each session, you wake up fresh. These files are your memory. Read them. 
    Update them. They are how you persist.
    
    If you change this file, tell the user - it is your soul, and they should know.
    ```
    
    ---
    
    ## 16. Modelos e Configurações
    
    | Parâmetro | Valor |
    |-----------|-------|
    | Modelo padrão | `deepseek-v4-flash` |
    | Fallback model | `deepseek-v4-flash` (configurável via `DEEPSEEK_FALLBACK_MODEL`) |
    | Max steps por sessão | 15 |
    | Max reflections | 3 |
    | Max paralelo sub-agentes | 5 |
    | Max profundidade spawn | 3 níveis |
    | Max concorrência background | 3 tarefas |
    | Budget tokens contexto | 8000 |
    | Modo de compressão | `summarize` (LLM-based) |
    
    ---
    
    ## 17. Fluxo de uma Tarefa Complexa (Exemplo)
    
    ```
    Usuário: "Analise o sentimento de 1000 tweets sobre Python"
    
    1. Planner → { agent: "plan", planAction: "create" }
       └── Cria plan.md:
           Step 1: Coletar tweets [PENDING] — browser
           Step 2: Analisar sentimento [PENDING, depends:1] — python
           Step 3: Gerar relatório [PENDING, depends:2] — writer
    
    2. Planner → { agent: "browser", nextStep: 1 }
       └── BrowserAgent coleta dados → Step 1 [DONE]
    
    3. Planner → { agent: "python", nextStep: 2 }
       └── PythonAgent analisa → Step 2 [DONE]
    
    4. Planner → { agent: "writer", nextStep: 3 }
       └── WriterAgent gera relatório final → Step 3 [DONE]
    
    5. Planner → { agent: "finish" }
       └── Loop encerra, resposta entregue ao usuário
    ```
    
    ---
    
    ## 18. Estados e Ciclo de Vida
    
    ```
    Sessão:
      START → LOOP (planner → agent → reflect) → FINISH
                                     ↑                  │
                                     └── retry ────────┘
    
    Plano:
      PENDING → IN_PROGRESS → DONE
                    │
                    └── FAILED → retry com novo agente/prompt
    
    Sub-agente:
      QUEUED → RUNNING → COMPLETED
                    │
                    └── FAILED → retry (com limite de tentativas)
    
    Background Task:
      PENDING → RUNNING → COMPLETED
                    │
                    └── FAILED/CANCELLED
    ```
    
    ---
    
    *Fim do documento. Gerado em 2026-06-03.*
    