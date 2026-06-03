# Documentação da Orquestração — Colabor-AI
    
    ## 1. Visão Geral da Arquitetura
    
    ```
    ┌─────────────────────────────────────────────────────────────────┐
    │                       USER INPUT                                │
    │  (chat, Telegram, webhook, via sub-agente, etc.)                │
    └───────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    ENTRY POINTS                                 │
    │                                                                 │
    │  webhook.ts ─────────────► agent.run(input)                     │
    │  telegram.ts ────────────► manager.sendMessage() ─► agent.run() │
    │  sub-agent-runner.ts ────► agent.run(instruction)               │
    │  background-task-runner ─► agent.run(instruction)               │
    │  cron-runner ────────────► agent.run(instruction)               │
    └───────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                     AGENT (core/agent/agent.ts)                 │
    │                                                                 │
    │  agent.run(userMessage):                                        │
    │    ┌──────────────────────────────────────────────────────┐     │
    │    │ 1. Monta system prompt (personalidade + tools +      │     │
    │    │    skills + memory)                                  │     │
    │    │ 2. Loop de turnos LLM ←→ Tools                      │     │
    │    │    ├─ buildMessages() → [{role, content}, ...]       │     │
    │    │    ├─ llmService.chat(messages) → AssistantMessage   │     │
    │    │    ├─ text → acumula no buffer de resposta           │     │
    │    │    ├─ tool_use → DispatchService.dispatch(tool)      │     │
    │    │    ├─ tool_result → insere no histórico              │     │
    │    │    └─ nextAssistantMessage → volta ao LLM            │     │
    │    │ 3. Fim de loop: retorna buffer de texto              │     │
    │    └──────────────────────────────────────────────────────┘     │
    └───────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │              DISPATCH SERVICE (core/dispatch/)                   │
    │                                                                 │
    │  dispatch(toolUse):                                             │
    │    ├─ execute_python → PythonTool.execute(code)                 │
    │    ├─ memory_search → MemoryTool.search(query)                  │
    │    ├─ spawn_agent   → SubAgentRunner.runSingle(task)            │
    │    ├─ web_search    → WebSearchTool.search(query)               │
    │    ├─ create_background_task → BackgroundTaskManager.add()      │
    │    ├─ list_background_tasks → BackgroundTaskManager.list()      │
    │    ├─ cancel_background_task → BackgroundTaskManager.cancel()   │
    │    ├─ schedule_task → CronScheduler.add()                       │
    │    ├─ list_scheduled_tasks → CronScheduler.list()               │
    │    ├─ delete_scheduled_task → CronScheduler.delete()            │
    │    └─ todo_write → TodoManager.execute()                        │
    │                                                                 │
    │  SubAgentRunner.runSingle(task):                                │
    │    ├─ Busca agente no agentRegistry                             │
    │    ├─ agent.resetHistory()  ← HISTÓRICO LIMPO                  │
    │    ├─ agent.run(task.instruction)                               │
    │    │    └─ Sub-agente tem seu PRÓPRIO loop LLM↔Tools            │
    │    └─ Retorna resultado ao agente pai                           │
    │                                                                 │
    │  Loop detection: profundidade máxima = 3 níveis                │
    └─────────────────────────────────────────────────────────────────┘
    ```
    
    ## 2. Diferença Entre `agent.run()` E Orquestração
    
    **NÃO há um "orquestrador" separado no fluxo normal.** O arquivo `core/orchestrator/orchestrator.ts` é um **orquestrador multi-agente experimental** (`AgentOrchestrator`) que usa um modelo planner + workers. Ele foi testado mas **não está conectado ao fluxo principal do chat.**
    
    O fluxo real de "orquestração" que acontece quando o usuário manda uma mensagem é este:
    
    ### Fluxo Real (agent.run)
    
    ```
    Usuário: "Cria um script que analisa vendas.csv"
    
    agent.run("Cria um script que analisa vendas.csv")
      │
      ├─ Turno 1:
      │   LLM → tool_use: execute_python("import os; print(os.listdir())")
      │   Dispatch → PythonTool → tool_result: "['vendas.csv', ...]"
      │
      ├─ Turno 2:
      │   LLM → tool_use: execute_python("import pandas; df = pandas.read_csv...")
      │   Dispatch → PythonTool → tool_result: "colunas: data, valor, ..."
      │
      ├─ Turno 3:
      │   LLM → tool_use: execute_python("... script completo ...")
      │   Dispatch → PythonTool → tool_result: "Análise concluída..."
      │
      ├─ Turno 4:
      │   LLM → text: "Criei o script! Aqui está o resultado..."
      │
      └─ Retorna: "Criei o script! Aqui está o resultado..."
    ```
    
    O agente decide **sozinho** quais ferramentas chamar e em que ordem. Não há planner externo decidindo por ele.
    
    ### Fluxo com spawn_agent
    
    ```
    Usuário: "Pesquisa o preço do Bitcoin e analisa o CSV em paralelo"
    
    agent.run("Pesquisa o preço do Bitcoin e analisa o CSV em paralelo")
      │
      ├─ Turno 1:
      │   LLM → tool_use: spawn_agent(agent="browser", instruction="Busca preço BTC")
      │   LLM → tool_use: spawn_agent(agent="PythonAgent", instruction="Analisa vendas.csv")
      │
      │   SubAgentRunner.runSingle("browser", "Busca preço BTC")
      │     └─ browserAgent.resetHistory()
      │     └─ browserAgent.run("Busca preço BTC")
      │         └─ (loop LLM↔Tools próprio do browserAgent)
      │         └─ retorna: "BTC: $67,000"
      │
      │   SubAgentRunner.runSingle("PythonAgent", "Analisa vendas.csv")
      │     └─ pythonAgent.resetHistory()
      │     └─ pythonAgent.run("Analisa vendas.csv")
      │         └─ (loop LLM↔Tools próprio do pythonAgent)
      │         └─ retorna: "Receita total: R$50.000"
      │
      │   tool_result (spawn_agent): "=== SUB-AGENT RESULTS === ..."
      │
      ├─ Turno 2:
      │   LLM → text: "Bitcoin está a $67,000. A receita total é R$50.000."
      │
      └─ Retorna: "Bitcoin está a $67,000..."
    ```
    
    ## 3. O AgentOrchestrator Experimental
    
    Arquivo: `core/orchestrator/orchestrator.ts`
    
    ```
    ╔═══════════════════════════════════════════════════════════╗
    ║              AgentOrchestrator                            ║
    ║                                                           ║
    ║  ┌──────────┐     ┌──────────┐     ┌──────────┐          ║
    ║  │ PLANNER  │────▶│ CONTEXT  │────▶│ PLANNER  │ (loop)   ║
    ║  │ Agent    │     │ Builder  │     │ Agent    │          ║
    ║  └──────────┘     └──────────┘     └──────────┘          ║
    ║       │                                  │               ║
    ║       │ "Qual worker?"                   │               ║
    ║       ▼                                  │               ║
    ║  ┌──────────────────────────────────────┐│               ║
    ║  │ Workers: [                            │               ║
    ║  │   { name: "codeAgent", agent, desc },  │               ║
    ║  │   { name: "browserAgent", agent, desc }│               ║
    ║  │ ]                                     │               ║
    ║  └──────────────────────────────────────┘│               ║
    ║                                          │               ║
    ║  Planner decide:                         │               ║
    ║  - {"agent": "codeAgent", "instruction": "..."}          ║
    ║  - {"agent": "finish", "instruction": "resumo"}          ║
    ║                                                           ║
    ║  Loop para quando planner retorna agent="finish"          ║
    ║  ou atinge maxSteps (default: 10)                         ║
    ╚═══════════════════════════════════════════════════════════╝
    ```
    
    **IMPORTANTE**: Este orquestrador **não está ativo** no fluxo de chat. Ele foi testado (ver `orchestrator.test.ts` e `orchestrator.spec.ts`) mas não há código que o instancie e use nas rotas de chat. É um experimento/alternativa.
    
    ## 4. Sub-Agent Runner (spawn_agent)
    
    Arquivo: `core/agent/sub-agent-runner.ts`
    
    ### Como funciona:
    
    1. O agente principal chama `spawn_agent(agent="PythonAgent", instruction="...")`
    2. O `DispatchService` cria um `SubAgentTask` com ID único
    3. O `SubAgentRunner.runSingle(task)`:
       - Busca o agente no `agentRegistry` pelo nome
       - Se encontrado: `agent.resetHistory()` (histórico LIMPO)
       - Chama `agent.run(task.instruction)` → o sub-agente tem seu próprio loop LLM↔Tools
       - Retorna o resultado formatado
       - Se não encontrado: retorna erro
    4. Detecção de loops: profundidade máxima de 3 níveis de spawn
    5. Execução paralela: `runBatch()` processa chunks de `maxParallel=5`
    
    ### Agentes disponíveis:
    - `assistant` (default)
    - `PythonAgent`
    - `browser`
    - `ShellAgent`
    - `WriterAgent`
    
    ## 5. Fluxos de Entrada Possíveis
    
    ### 5.1 Chat via Telegram
    ```
    Telegram API → manager.onMessage() → agent.run(texto) → resposta → manager.sendMessage()
    ```
    
    ### 5.2 Webhook HTTP
    ```
    POST /api/chat → webhookHandler → agent.run(body.message) → JSON response
    ```
    
    ### 5.3 Background Task
    ```
    create_background_task → BackgroundTaskManager.add() → (async) agent.run(instruction)
    ```
    
    ### 5.4 Cron Job
    ```
    schedule_task → CronScheduler.add() → (no horário) agent.run(instruction)
    ```
    
    ### 5.5 Sub-agente (spawn_agent)
    ```
    Agente pai chama spawn_agent → SubAgentRunner → agent.run(instruction)
    ```
    
    **Todos convergem para `agent.run()`.** Não há orquestrador intermediário.
    
    ## 6. Estrutura de Diretórios Relevante
    
    ```
    core/
    ├── agent/
    │   ├── agent.ts              ← Coração: classe Agent, loop LLM↔Tools
    │   ├── agent-registry.ts     ← Registro global de agentes
    │   └── sub-agent-runner.ts   ← spawn_agent: cria sub-agentes
    │
    ├── orchestrator/
    │   ├── orchestrator.ts       ← AgentOrchestrator experimental (não ativo)
    │   ├── orchestrator.test.ts
    │   ├── orchestrator.spec.ts
    │   └── telegram.ts           ← Integração Telegram
    │
    ├── dispatch/
    │   └── dispatch-service.ts   ← Roteador de tool_use → implementação
    │
    ├── tools/
    │   ├── python-tool.ts        ← execute_python
    │   ├── memory-tool.ts        ← memory_search
    │   ├── web-search-tool.ts    ← web_search
    │   ├── spawn-agent-tool.ts   ← spawn_agent (chama SubAgentRunner)
    │   ├── background-task-tool.ts
    │   ├── cron-tool.ts
    │   └── todo-tool.ts
    │
    ├── agents/
    │   ├── python.agent.ts       ← PythonAgent
    │   ├── browser.agent.ts      ← browser
    │   ├── shell.agent.ts        ← ShellAgent
    │   ├── writer.agent.ts       ← WriterAgent
    │   └── default.agent.ts      ← assistant (default)
    │
    ├── skills/
    │   ├── communication.md
    │   ├── web-search.md
    │   └── python-dev.md
    │
    └── memory/
        └── (notas diarias, MEMORY.md)
    ```
    
    ## 7. Resumo: Quem Orquestra Quem?
    
    | Situação | Quem decide os passos? |
    |---|---|
    | Chat normal | O próprio agente (`agent.run`), via loop LLM↔Tools |
    | spawn_agent | O agente pai decide spawnar; o sub-agente decide seus passos |
    | AgentOrchestrator (experimental) | Um planner agent decide qual worker chamar a cada passo |
    | Background task | O agente executor decide seus passos |
    | Cron job | O agente executor decide seus passos |
    
    **Conclusão**: O projeto segue o padrão de **agente autônomo com ferramentas**, não um orquestrador centralizado. O agente decide tudo sozinho via raciocínio do LLM.
    
    ---
    
    *Gerado em: 2026-06-04. Versão 2.0 — Completa e Definitiva.*
    