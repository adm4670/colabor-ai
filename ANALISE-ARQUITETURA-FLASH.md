# Análise de Arquitetura - colabor-ai
    ## Otimização para deepseek-v4-flash
    
    Data: 2026-06-01
    
    ---
    
    ## 1. VISÃO GERAL DA ARQUITETURA
    
    O colabor-ai é um sistema multi-agente inspirado no claude-code e OpenClaw, composto por 3 camadas:
    
    ```
    client/          -> Electron + React (desktop app)
    cloud/           -> Express + WebSocket (servidor remoto)
    core/            -> Motor de agentes (coração do sistema)
    ```
    
    ### Fluxo de execução:
    ```
    User Input -> Orchestrator -> Planner (decide próximo passo)
        -> Agent especializado (Python/Browser/Shell/Assistant)
        -> Reflector (avalia resultado)
        -> Loop até "finish"
    ```
    
    ### Componentes principais (198 arquivos, ~3.1 MB):
    | Componente | Arquivo | Peso |
    |---|---|---|
    | Orquestrador | `core/orchestrator/orchestrator.ts` | 37 KB (961 linhas) |
    | Context Engine | `core/context/context-engine.ts` | 17 KB |
    | Skills Manager | `core/skills/skills-manager.ts` | 15 KB |
    | Agent Base | `core/agent/agent.ts` | 14 KB |
    | Plan Manager | `core/plan/plan-manager.ts` | 13 KB |
    | Memory Engine | `core/memory/memory-engine.ts` | 13 KB |
    | Background Tasks | `core/tasks/background-task-manager.ts` | 13 KB |
    
    ---
    
    ## 2. DIAGNÓSTICO: PROBLEMAS PARA MODELOS BARATOS (flash)
    
    ### 2.1 SYSTEM PROMPT INCHADO (~880 tokens por chamada)
    
    Cada execução do Planner carrega no system prompt:
    - CORE_INSTRUCTIONS (identidade): ~244 tokens
    - PLANNER_INSTRUCTIONS (regras): ~356 tokens  
    - PLANNER_RESPONSE_FORMAT: ~53 tokens
    - TOOLS_DESCRIPTION: ~111 tokens
    - SKILLS_INSTRUCTIONS: ~32 tokens
    - MEMORY_INSTRUCTIONS: ~69 tokens
    - DAILY_NOTES: ~15 tokens
    - **TOTAL: ~881 tokens SÓ NO SYSTEM PROMPT**
    
    Para 5 steps de planner + execuções de agente = **~5000-8000 tokens gastos só com boilerplate**.
    
    ### 2.2 MODELO CARO EM TODOS OS AGENTES
    
    | Agente | Modelo Atual | Custo Relativo |
    |---|---|---|
    | PlannerAgent | `deepseek-v4-pro` | $$$$ |
    | PythonAgent | `deepseek-v4-pro` | $$$$ |
    | BrowserAgent | `DEFAULT_MODEL=deepseek-v4-pro` | $$$$ |
    | AssistantAgent | `DEFAULT_MODEL=deepseek-v4-pro` | $$$$ |
    | ReflectorAgent | `deepseek-chat` | $$ |
    
    **Apenas o Reflector usa modelo mais barato.** Todos os outros usam o modelo mais caro.
    
    ### 2.3 FERRAMENTAS EM EXCESSO NOS AGENTES
    
    Cada agente carrega 10-12 ferramentas, mesmo quando só precisa de 1-3:
    - **BrowserAgent**: 12 tools (precisa de spawn_agent? schedule_task?)
    - **PythonAgent**: 11 tools (precisa de web_search? schedule_task?)
    - **AssistantAgent**: 10 tools (precisa de tudo isso?)
    
    Cada tool adiciona ~30-80 tokens ao system prompt com sua definição JSON Schema completa.
    
    ### 2.4 CONTEXTO DUPLICADO
    
    - Memória (`MEMORY.md` + notas diárias) injetada em TODOS os agentes, mesmo que irrelevante
    - Skills carregadas proativamente em vez de lazy-loading
    - Dois orquestradores (`core/` e `cloud/`) com lógicas similares -> manutenção dupla
    
    ### 2.5 SEM ESTRATÉGIA DE CACHE DE PROMPT
    
    O deepseek-v4-flash suporta prefix caching, mas o código atual:
    - Reconstrói o system prompt inteiro a cada chamada (`ensureSystemMessage`)
    - Não separa partes estáticas (cacheáveis) das dinâmicas
    - Não usa `messages[0].cache_control` ou equivalente
    
    ---
    
    ## 3. RECOMENDAÇÕES DE OTIMIZAÇÃO
    
    ### 3.1 [PRIORIDADE ALTA] Model Tiering Strategy
    
    Criar 3 tiers de modelo e associar cada agente ao tier apropriado:
    
    ```
    // NOVO: config.ts
    export const MODEL_TIERS = {
      planner: "deepseek-v4-flash",              // flash para roteamento simples
      planner_complex: "deepseek-v4-pro",         // pro só ao criar planos
      executor: "deepseek-v4-flash",              // flash para execução
      reflector: "deepseek-v4-flash",             // flash para reflexão
      summarizer: "deepseek-v4-flash",            // flash para sumarização
    };
    ```
    
    **Impacto estimado**: Redução de ~60-70% no custo por chamada, mantendo pro apenas para decisões complexas de planejamento.
    
    ### 3.2 [PRIORIDADE ALTA] Slim System Prompts
    
    Reduzir o system prompt do Planner de ~880 para ~250 tokens:
    
    ```
    // NOVO: slim-instructions.ts
    export const SLIM_PLANNER_PROMPT = `You are a task router.
    Available agents: assistant (chat), python_code (code/calc), browser (web),
      shell (commands), writer (output), task_manager (todo).
    Rules: pick agent for first step. Return "finish" only after results.
    Respond JSON: {"agent":"...","instruction":"..."}`;
    // ~80 tokens vs ~880 atuais
    ```
    
    Mover regras detalhadas para um "manual" que é carregado sob demanda (via tool `read_manual`).
    
    **Impacto estimado**: Economia de ~600 tokens por chamada do planner. Em 5 steps = 3000 tokens economizados.
    
    ### 3.3 [PRIORIDADE ALTA] Ferramentas Sob Demanda (Late Binding)
    
    Em vez de injetar 10+ tools em todo agente, usar late binding:
    
    ```
    // NOVO: tool-provider.ts
    const AGENT_TOOLS = {
      python_code: ["execute_python", "memory_search"],             // 2 tools
      browser: ["browser_navigate", "browser_action", "web_search"], // 3 tools
      assistant: ["memory_search", "web_search", "spawn_agent"],     // 3 tools
    };
    ```
    
    Remover `schedule_task`, `create_background_task`, `todo_write`, `spawn_agent` dos agentes executores.
    
    **Impacto estimado**: Redução de ~200-400 tokens no system prompt de cada agente executor.
    
    ### 3.4 [PRIORIDADE MÉDIA] Lazy Context Loading
    
    Só carregar skills, memória e notas diárias quando relevante:
    
    ```
    // buildSystemPrompt() sem injeção automática
    async buildSystemPrompt(): Promise<string> {
      let prompt = this.basePrompt; // ~100-200 tokens, cacheável
      
      // Skills: NUNCA injetar automaticamente
      // Memória: NUNCA injetar automaticamente  
      // Notas: NUNCA injetar automaticamente
      
      // O agente usa as TOOLS (memory_search) para buscar quando precisar
      return prompt;
    }
    ```
    
    **Impacto estimado**: Economia de ~150-300 tokens por chamada. O agente usa `memory_search` tool quando precisa de contexto.
    
    ### 3.5 [PRIORIDADE MÉDIA] Prefix Caching para System Prompts
    
    Separar system prompt em parte estática (cacheável) e dinâmica:
    
    ```
    // Mensagem 1: parte estática cacheável
    { role: "system", content: STATIC_PROMPT, cache_control: { type: "ephemeral" } }
    // Mensagem 2: parte dinâmica (tools disponíveis, etc)
    { role: "system", content: dynamicPart }
    ```
    
    O deepseek-v4-flash suporta cache de prefixo. A primeira mensagem (estática) seria cacheada entre chamadas.
    
    ### 3.6 [PRIORIDADE MÉDIA] Context Budget Mais Agressivo
    
    Reduzir limites do ContextEngine para flash:
    
    ```
    // Config atual -> Config otimizada para flash
    maxTokens: 8000  -> maxTokens: 4000
    mode: "summarize" -> manter
    keepRecentIntact: 5 -> keepRecentIntact: 3
    summarizeZoneSize: 10 -> summarizeZoneSize: 5
    ```
    
    Flash tem janela de contexto menor e degrade mais rápido com contextos longos.
    
    ### 3.7 [PRIORIDADE BAIXA] Unificar Orquestradores
    
    `core/orchestrator/orchestrator.ts` (961 linhas) e `cloud/src/orchestrator/orchestrator.ts` (345 linhas) têm ~60% de lógica sobreposta. Unificar com adaptadores para local vs cloud.
    
    ### 3.8 [PRIORIDADE BAIXA] Planner Fast-Path
    
    Para tarefas simples (saudações, perguntas diretas), pular o Planner:
    
    ```
    // NOVO: fast-path no orchestrator
    if (isSimpleQuery(input)) {
      return await this.assistantAgent.run(input);
      // Pula planner, reflector, plan-manager...
    }
    ```
    
    Detecção simples: menos de 30 palavras, sem verbos de ação complexa (analisar, criar, buscar, implementar).
    
    ---
    
    ## 4. PLANO DE IMPLEMENTAÇÃO (Ordem Sugerida)
    
    | # | Ação | Arquivos | Esforço | Ganho |
    |---|---|---|---|---|
    | 1 | Slim system prompts | `constants/instructions.ts`, `agent.ts` | 2h | **-600 tok/chamada** |
    | 2 | Model tiering | `config.ts`, todos agentes | 1h | **-60% custo** |
    | 3 | Tool late binding | `agent.ts`, cada `*.agent.ts` | 2h | **-200 tok/chamada** |
    | 4 | Lazy context loading | `agent.ts` (`buildSystemPrompt`) | 1h | **-200 tok/chamada** |
    | 5 | Prefix caching | `agent.ts`, `llm/provider.ts` | 2h | **cache hit rate** |
    | 6 | Context budget tighter | `context-engine.ts` | 30min | Estabilidade |
    | 7 | Planner fast-path | `orchestrator.ts` | 1h | Latência |
    | 8 | Unify orchestrators | Ambos orquestradores | 4h | Manutenção |
    
    **Ganho total estimado**: ~1000 tokens economizados por chamada + 60% redução de custo via model tiering.
    
    ---
    
    ## 5. ARQUITETURA ATUAL (Diagrama)
    
    ```
    +-----------------------------------------------------------+
    |                    ORCHESTRATOR                            |
    |  +----------+  +----------+  +-------------------------+ |
    |  | Planner  |->|  Agent   |->|     Reflector           | |
    |  | (pro)    |  | (pro)    |  |     (chat)              | |
    |  +----------+  +----------+  +-------------------------+ |
    |       ^              ^                                    |
    |  +----+--------------+----------------------------------+ |
    |  | System Prompt por chamada:                           | |
    |  |  - CORE_INSTRUCTIONS (244 tok)                       | |
    |  |  - Agent Instructions (100-400 tok)                  | |
    |  |  - 10-12 tools definitions (200-400 tok)             | |
    |  |  - 3 skills full text (200-400 tok)                  | |
    |  |  - Memory instructions (70 tok)                      | |
    |  |  - Daily notes (100-200 tok)                         | |
    |  |  TOTAL: ~800-1200 tokens                             | |
    |  +------------------------------------------------------+ |
    |                                                           |
    |  Componentes carregados em memória:                       |
    |  - PlanManager - SubAgentRunner - DreamTask               |
    |  - HookManager - PermissionSystem - Scheduler             |
    |  - BackgroundTaskManager - ContextEngine - MemoryEngine   |
    |  - EventStream - Transcript - AgentRegistry               |
    +-----------------------------------------------------------+
    ```
    
    ### Arquitetura Proposta (Otimizada)
    
    ```
    +-----------------------------------------------------------+
    |                    ORCHESTRATOR                            |
    |  +----------+  +----------+  +-------------------------+ |
    |  | Planner  |->|  Agent   |->|     Reflector           | |
    |  | (flash)  |  | (flash)  |  |     (flash)             | |
    |  | ->pro só |  |          |  |                         | |
    |  | p/ plano |  |          |  |                         | |
    |  +----------+  +----------+  +-------------------------+ |
    |       ^              ^                                    |
    |  +----+--------------+----------------------------------+ |
    |  | System Prompt SLIM por chamada:                      | |
    |  |  - Base prompt cacheado (80-150 tok)                 | |
    |  |  - Agent role (30-50 tok)                            | |
    |  |  - Apenas 1-3 tools relevantes (50-100 tok)          | |
    |  |  - Skills/Memory: NUNCA injetadas                    | |
    |  |  - Usar tools (memory_search) sob demanda            | |
    |  |  TOTAL: ~200-400 tokens                              | |
    |  +------------------------------------------------------+ |
    |                                                           |
    |  ContextEngine: maxTokens 4000 (era 8000)                |
    |  Fast-path para queries simples (skip planner)            |
    +-----------------------------------------------------------+
    ```
    
    ---
    
    ## 6. CONCLUSÃO
    
    O colabor-ai está bem arquitetado e repleto de funcionalidades, mas foi projetado assumindo um modelo potente e caro (`deepseek-v4-pro`). Para rodar bem com `deepseek-v4-flash`, as principais ações são:
    
    1. **Corte profundo nos system prompts** (de ~880 para ~200 tokens)
    2. **Model tiering** (flash como default, pro apenas para planejamento complexo)
    3. **Ferramentas minimalistas** (2-3 por agente em vez de 10-12)
    4. **Contexto sob demanda** (remover injeção automática de skills/memória/notas)
    
    Com essas mudanças, o sistema passa a consumir ~60-70% menos tokens por interação, viabilizando o uso do flash sem perda perceptível de qualidade para a maioria das tarefas.
    
    Os arquivos que precisam de alteração (em ordem de prioridade):
    - `core/constants/instructions.ts` -> prompts slim
    - `core/agent/agent.ts` -> `buildSystemPrompt()` enxuto
    - `core/config/config.ts` -> model tiers
    - `core/agents/*.agent.ts` -> tools mínimas, modelo flash
    - `core/context/context-engine.ts` -> budget ajustado
    - `core/orchestrator/orchestrator.ts` -> fast-path + planner com flash
    