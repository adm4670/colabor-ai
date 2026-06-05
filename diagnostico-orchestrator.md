# Relatorio de Diagnostico: Orchestrator + Memoria + Plano
    
    ---
    
    ## 1. Arquitetura Geral do Orchestrator
    
    ```
                          +------------------------------------------+
                          |          User Input / Prompt              |
                          +-----------------------+------------------+
                                                  |
                          +-----------------------v------------------+
                          |          Orchestrator.run()               |
                          |    (Analise de complexidade inicial)      |
                          +----+-----------------------+-------------+
                               |                       |
                     +---------v--+            +-------v------------+
                     |  Simples   |            |   Complexo          |
                     |  (1 passo) |            | (multi-step)        |
                     +------+-----+            +-------+------------+
                            |                          |
                   +--------v----------+       +-------v---------------------------+
                   | SupervisorAgent   |       |  PlannerAgent.createPlan()        |
                   | + ToolAgent       |       |  (analisa, cria steps)            |
                   +--------+----------+       +-------+---------------------------+
                            |                          |
                            |               +-----------v-------------------------+
                            |               |  PlanManager.save()                 |
                            |               |  (.colabor-ai/plan.md)              |
                            |               +-----------+-------------------------+
                            |                           |
                            |               +-----------v-------------------------+
                            |               |  runOrchestration()                 |
                            |               |  (executa steps com loop            |
                            |               |   de reflexao)                      |
                            |               +-----------+-------------------------+
                            |                           |
                            +--------+------------------+
                                     |
                        +------------v-------------------+
                        |   reflectOnResult()             |
                        |   (avalia success,              |
                        |    complete, learning)          |
                        +------------+-------------------+
                                     |
                        +------------v-------------------+
                        |   appendResultToMemory()        |
                        |   (sumariza e armazena)         |
                        +------------+-------------------+
                                     |
                        +------------v-------------------+
                        |      Retorna Resultado          |
                        +--------------------------------+
    ```
    
    ---
    
    ## 2. Componentes Chave
    
    ### 2.1 Agentes Disponiveis
    
    | Agente | Funcao |
    |--------|--------|
    | PlannerAgent (core/agents/planner.agent.ts) | Analisa tarefas complexas, cria planos multi-step com dependencias |
    | SupervisorAgent (core/agents/supervisor.agent.ts) | Coordena execucao, delega para ToolAgent, gerencia ferramentas |
    | ToolAgent (core/agents/tool.agent.ts) | Executa chamadas de ferramentas especificas (busca, codigo, sistema) |
    | ReflectorAgent (agente interno) | Avalia resultados de execucao (sucesso/parcial/falha) |
    
    ### 2.2 Gerenciadores (Singletons)
    
    | Gerenciador | Arquivo | Funcao Principal |
    |---|---|---|
    | MemoryManager | core/memory/MemoryManager.ts | Gerencia memoria curta/media/longa + busca semantica |
    | ConversationManager | core/memory/ConversationManager.ts | Gerencia historico de conversas por sessao |
    | PlanManager | core/plan/plan-manager.ts | Cria/salva/atualiza planos multi-step em .colabor-ai/plan.md |
    | TokenGuard | core/TokenGuard.ts | Monitora e limita uso de tokens por sessao/agente |
    
    ---
    
    ## 3. Fluxo Detalhado: Orchestrator.run()
    
    ### Passo 1: Analise de Complexidade
    
    ```typescript
    const needsPlanning = await this.analyzeComplexity(input);
    ```
    
    Criterios que disparam planejamento:
    - Input longo (>500 chars)
    - Multiplas solicitacoes (e, depois, tambem)
    - Verbos de acao (criar, modificar, analisar, implementar)
    - Menção a arquivos/pastas
    - Palavras-chave: plano, passo, multi-step
    
    ### Passo 2: Criacao do Plano (se complexo)
    
    1. PlannerAgent analisa o input e gera steps numerados
    2. Cada step tem: description, agent recomendado, dependsOn (dependencias)
    3. PlanManager salva em .colabor-ai/plan.md
    4. Plano e retornado ao usuario para aprovacao
    
    ### Passo 3: Execucao (runOrchestration)
    
    ```
    for each step in plan.steps:
        if step.status != 'pending' -> skip
        if not dependenciesMet(step) -> skip
        
        result = executeStep(step, input)
        reflection = reflectOnResult(input, step.agent, step.instruction, result)
        
        if reflection.success == 'yes':
            planManager.updateStep(step.number, status:'done', result)
        elif reflection.retryDifferent and retries < MAX_RETRIES:
            retries++  (retenta com abordagem diferente)
        else:
            planManager.updateStep(step.number, status:'failed', result)
    ```
    
    ### Passo 4: Reflexao (reflectOnResult)
    
    Apos cada execucao de agente, o ReflectorAgent avalia:
    
    ```json
    {
      "success": "yes | partial | no",
      "complete": true/false,
      "missingInfo": ["item1", "item2"],
      "retryDifferent": true/false,
      "learning": "frase em portugues sobre o aprendizado"
    }
    ```
    
    **Fallback**: Se a reflexao falhar (excecao), assume success:"partial" e complete:true.
    
    ### Passo 5: Armazenamento em Memoria (appendResultToMemory)
    
    1. Sumariza o resultado (usando agente ou truncamento)
    2. Salva na memoria de longo prazo com:
       - role: "assistant"
       - summary (resumo do resultado)
       - Timestamp e sessionId
    
    ---
    
    ## 4. Sistema de Memoria
    
    ### 4.1 Estrutura
    
    ```
    MemoryManager
    +-- Longa (MEMORY.md)          -> Persistente entre sessoes
    +-- Media (conversation)       -> Sessao atual
    +-- Curta (recent)             -> Ultimos N turns
    ```
    
    ### 4.2 Como a Memoria e Usada
    
    **Antes de executar:**
    ```typescript
    const relevantMemories = await this.memoryManager.searchRelevant(input);
    // Injeta no prompt do agente como contexto
    ```
    
    **Depois de executar:**
    ```typescript
    await this.memoryManager.appendToLongTerm(summary, sessionId);
    ```
    
    ### 4.3 Formato no MEMORY.md
    
    Cada entrada tem:
    ```
    ## YYYY-MM-DD HH:MM:SS
    **Session:** session-id
    **Summary:** resumo do que foi aprendido/feito
    ```
    
    ---
    
    ## 5. Sistema de Plano (PlanManager)
    
    ### 5.1 Estrutura do Plano (.colabor-ai/plan.md)
    
    ```markdown
    # Plan
    **Goal:** Descricao do objetivo
    **Session:** session-id
    **Created:** timestamp
    **Updated:** timestamp
    
    ## Success Criteria
    - Criterio 1
    - Criterio 2
    
    ## Steps
    ### Step 1: Descricao [DONE] (depends on: )
    - **Agent:** planner
    - **Instruction:** instrucao
    - **Result:** resultado
    
    ### Step 2: Descricao [PENDING]
    - **Agent:** browser
    - **Instruction:** ...
    ```
    
    ### 5.2 Metodos Principais do PlanManager
    
    | Metodo | Descricao |
    |--------|-----------|
    | create(goal, sessionId) | Cria novo plano vazio |
    | addSteps(steps) | Adiciona steps com status pending |
    | updateStep(number, update) | Atualiza status/result/instruction |
    | getNextSteps() | Retorna steps pendentes cujas dependencias estao concluidas |
    | getPlanForPrompt() | Formata plano para injecao em prompts |
    | isComplete() | True se todos steps estao done |
    | destroy() | Remove plano e arquivo |
    
    ### 5.3 Dependencias entre Steps
    
    Steps podem depender de outros steps:
    ```typescript
    dependsOn: [1, 2]  // Step 3 so executa apos steps 1 e 2 estarem "done"
    ```
    
    O metodo getNextSteps() filtra automaticamente:
    ```typescript
    return steps.filter(s => s.status === 'pending')
                .filter(s => s.dependsOn.every(dep => dep.status === 'done'));
    ```
    
    ---
    
    ## 6. Mecanismo de Reflexao
    
    ### 6.1 Quando e Chamado
    
    Apos CADA execucao de agente (seja supervisor+tools ou planner+orchestration).
    
    ### 6.2 Prompt do Reflector
    
    ```typescript
    const reflectionPrompt = `
      Task: ${input.slice(0, 300)}
      Agent used: ${agentName}
      Instruction: ${instruction.slice(0, 300)}
      Result: ${result.slice(0, 500)}
    
      Perguntas:
      1. O agente teve sucesso? (yes / partial / no)
      2. O resultado esta completo? (yes / no)
      3. Falta informacao? Qual?
      4. Deve tentar abordagem diferente? (yes / no)
      5. O que aprendemos? (uma frase em portugues)
    
      Responda APENAS com JSON.
    `;
    ```
    
    ### 6.3 Decisoes Pos-Reflexao
    
    | success | retryDifferent | Acao |
    |---------|----------------|------|
    | yes | qualquer | Step marcado como done |
    | partial | true | Retenta (ate MAX_RETRIES=3) |
    | partial | false | Step marcado como done (aceita parcial) |
    | no | true | Retenta com abordagem diferente |
    | no | false | Step marcado como failed |
    
    ---
    
    ## 7. Observabilidade (EventStream)
    
    O consumeEventStream() loga eventos em tempo real:
    
    | Evento | Quando |
    |--------|--------|
    | tool_call_start | Ferramenta comecou a executar |
    | tool_call_end | Ferramenta terminou |
    | turn_end | Turno do agente finalizado |
    | error | Erro durante execucao |
    | step_complete | Step do plano concluido |
    
    Usa um AsyncIterator (for-await-of) sobre this.eventStream.
    
    ---
    
    ## 8. Arquivos do Sistema
    
    ```
    core/
    +-- orchestrator/
    |   +-- orchestrator.ts          <- ORQUESTRADOR PRINCIPAL (~510 linhas)
    +-- agents/
    |   +-- planner.agent.ts         <- AGENTE PLANEJADOR
    |   +-- supervisor.agent.ts      <- AGENTE SUPERVISOR
    |   +-- tool.agent.ts            <- AGENTE DE FERRAMENTAS
    +-- memory/
    |   +-- MemoryManager.ts         <- GERENCIADOR DE MEMORIA
    |   +-- ConversationManager.ts   <- GERENCIADOR DE CONVERSAS
    +-- plan/
    |   +-- plan-manager.ts          <- GERENCIADOR DE PLANOS
    +-- utils/
    |   +-- logger.ts                <- LOGGING
    |   +-- extract.ts               <- UTILITARIOS (extractJSON)
    +-- context/
    |   +-- context-manager.ts       <- GERENCIAMENTO DE CONTEXTO
    +-- TokenGuard.ts                <- MONITOR DE TOKENS
    +-- ...
    ```
    
    ---
    
    ## 9. Fluxo Resumido (Exemplo Real)
    
    ```
    User: "Crie um servidor Express com 3 rotas e teste"
      |
      +-- Orchestrator.run()
      |   +-- analyzeComplexity() -> true (complexo)
      |
      +-- PlannerAgent.createPlan()
      |   +-- Step 1: Setup do projeto Express [agent: shell]
      |   +-- Step 2: Criar rotas GET, POST, DELETE [agent: python_code]
      |   +-- Step 3: Testar rotas com curl [agent: shell]
      |
      +-- PlanManager.save() -> .colabor-ai/plan.md
      |
      +-- runOrchestration()
      |   +-- Step 1: shell -> npm init, install express
      |   |   +-- reflectOnResult() -> success: yes
      |   |   +-- appendResultToMemory() -> "Projeto Express criado"
      |   +-- Step 2: python_code -> escreve server.ts
      |   |   +-- reflectOnResult() -> success: yes
      |   |   +-- appendResultToMemory() -> "3 rotas criadas"
      |   +-- Step 3: shell -> curl tests
      |       +-- reflectOnResult() -> success: yes
      |       +-- appendResultToMemory() -> "Testes OK"
      |
      +-- Retorna resultado consolidado ao usuario
    ```
    
    ---
    
    ## 10. Estatisticas do Orchestrator
    
    | Metrica | Valor |
    |---------|-------|
    | Linhas totais | ~510 |
    | Metodos publicos | run(), setDebug() |
    | Metodos privados | 6 (analyzeComplexity, executeWithSupervisor, runOrchestration, reflectOnResult, consumeEventStream, appendResultToMemory) |
    | Agentes internos | 4 (Planner, Supervisor, Tool, Reflector) |
    | Gerenciadores | 4 (Memory, Conversation, Plan, TokenGuard) |
    | Estado interno | debug, agentMap, memoryManager, planManager, conversationManager, eventStream, reflectionCount, MAX_RETRIES (3) |
    