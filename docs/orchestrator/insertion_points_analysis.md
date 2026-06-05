# ============================================================
    # ANALISE DE PONTOS DE INSERCAO - orchestrator.ts
    # Modulos: MemorySummarizer, TokenGuard, Telemetria, Resilience
    # ============================================================
    
    ## ARQUIVO: core/orchestrator/orchestrator.ts (1113 linhas)
    
    ---
    
    ## 1. IMPORTS (linhas 1-171)
    
    ### Insertion Point A: Novos imports (após linha 171)
    ```typescript
    // ============================================================
    // IMPORTS - MemorySummarizer + TokenGuard + Telemetria + Resilience
    // ============================================================
    import { MemorySummarizer } from "../memory/memory-summarizer";
    import { TokenGuard } from "../token/token-guard";
    import { TelemetryCollector } from "../telemetry/telemetry-collector";
    import { ResilienceManager } from "../resilience/resilience-manager";
    ```
    
    **Linha exata:** Após `import { CORE_INSTRUCTIONS, DEFAULT_MODEL, FALLBACK_MODEL } from "../constants/instructions";` (linha 171)
    
    ---
    
    ## 2. CLASS FIELDS (linhas 244-258)
    
    ### Insertion Point B: Novos campos privados (após linha 258)
    ```typescript
    // ============================================================
    // NOVOS CAMPOS - MemorySummarizer + TokenGuard + Telemetria + Resilience
    // ============================================================
    private memorySummarizer: MemorySummarizer;
    private tokenGuard: TokenGuard;
    private telemetry: TelemetryCollector;
    private resilienceManager: ResilienceManager;
    ```
    
    **Linha exata:** Após `private permissionSystem: PermissionSystem;` (linha 258)
    
    ---
    
    ## 3. CONSTRUCTOR - INICIALIZACAO (linhas 260-346)
    
    ### Insertion Point C: Inicializar novos componentes (após linha 274)
    ```typescript
    // Inicializar MemorySummarizer + TokenGuard + Telemetria + Resilience
    this.memorySummarizer = new MemorySummarizer(this.memoryEngine);
    this.tokenGuard = new TokenGuard({ maxTokens: 4000 });
    this.telemetry = new TelemetryCollector({ sessionId: this.sessionId });
    this.resilienceManager = new ResilienceManager({ maxRetries: 3 });
    ```
    
    **Linha exata:** Após `this.permissionSystem = getPermissionSystem();` (linha 274)
    
    ### Insertion Point D: Inicializar scheduler de telemetria (após linha 305)
    ```typescript
    // Iniciar telemetria
    this.telemetry.start();
    ```
    
    **Linha exata:** Após `this.permissionSystem.setAgentLevel("task_manager", "file_write");` (linha 314)
    
    ---
    
    ## 4. CONTEXT BUILDING - TokenGuard (linhas 517-550)
    
    ### Insertion Point E: TokenGuard na montagem do contexto (após linha 537)
    ```typescript
    // === TOKEN GUARD: Limitar tamanho do contexto ===
    context = this.tokenGuard.truncate(context, {
      memoryContext: memoryContext,
      planContext: planContext,
      maxContextLength: 4000,
    });
    ```
    
    **Linha exata:** Antes de `let context = \` (linha 539), após o bloco de planContext (linha 537)
    
    ---
    
    ## 5. PLANNER DECISION - Telemetria + Resilience (linhas 629-666)
    
    ### Insertion Point F: Telemetria antes do planner (após linha 632)
    ```typescript
    // === TELEMETRIA: Iniciar metrica do planner ===
    this.telemetry.startSpan("planner_decision");
    ```
    
    **Linha exata:** Após o bloco onProgress do planner (linha 632), antes do hook before_planner
    
    ### Insertion Point G: Telemetria após planner + Resilience wrapper (após linha 647)
    Substituir linha 640:
    ```typescript
    const decision = await this.planner.run(plannerPrompt);
    ```
    Por:
    ```typescript
    // === RESILIENCE: Executar planner com retry ===
    const decision = await this.resilienceManager.withRetry(
      () => this.planner.run(plannerPrompt),
      { context: "planner", maxRetries: 2 }
    );
    ```
    
    ### Insertion Point H: Telemetria fim do planner (após linha 647)
    ```typescript
    // === TELEMETRIA: Finalizar metrica do planner ===
    this.telemetry.endSpan("planner_decision");
    ```
    
    **Linha exata:** Após o hook after_planner (linha 647)
    
    ---
    
    ## 6. AGENT EXECUTION - Telemetria + Resilience (linhas 907-978)
    
    ### Insertion Point I: Telemetria antes da execucao do agente (após linha 924)
    ```typescript
    // === TELEMETRIA: Iniciar metrica do agente ===
    this.telemetry.startSpan(`agent_${parsed.agent}`);
    ```
    
    **Linha exata:** Após o bloco onProgress de dispatch do agente (linha 924), antes do contextMessages
    
    ### Insertion Point J: Substituir agent.run com Resilience (linha 962)
    Substituir:
    ```typescript
    const result = await target.agent.run(agentPrompt, onProgress);
    ```
    Por:
    ```typescript
    // === RESILIENCE: Executar agente com retry e fallback ===
    const result = await this.resilienceManager.withRetry(
      () => target.agent.run(agentPrompt, onProgress),
      { 
        context: `agent_${parsed.agent}`,
        maxRetries: 2,
        fallback: async () => {
          log.warn(`[Resilience] Usando fallback para agente ${parsed.agent}`);
          return `[Fallback] O agente ${parsed.agent} nao respondeu. Tente novamente.`;
        }
      }
    );
    ```
    
    ### Insertion Point K: Telemetria após execucao do agente (após linha 978)
    ```typescript
    // === TELEMETRIA: Registrar metrica do agente ===
    this.telemetry.endSpan(`agent_${parsed.agent}`, {
      agentName: parsed.agent,
      success: true,
      resultLength: result.length,
    });
    ```
    
    **Linha exata:** Após o tool_call_end no eventStream (linha 978)
    
    ---
    
    ## 7. REFLECTION - Telemetria (linhas 994-1068)
    
    ### Insertion Point L: Telemetria na reflexao (após linha 1004)
    ```typescript
    this.telemetry.recordReflection({
      agentName: parsed.agent,
      success: reflection.success,
      complete: reflection.complete,
      retryDifferent: reflection.retryDifferent,
    });
    ```
    
    **Linha exata:** Após a declaracao de `reflection` (linha 1004), antes do debug
    
    ---
    
    ## 8. AFTER AGENT RESULT - MemorySummarizer (linha 1077-1083)
    
    ### Insertion Point M: MemorySummarizer apos resultado do agente (após linha 1077)
    ```typescript
    // === MEMORY SUMMARIZER: Resumir se necessario ===
    context = await this.memorySummarizer.summarizeIfNeeded(context);
    ```
    
    **Linha exata:** Após `context += \`\n\n\${parsed.agent} result:\n\${result}\`;` (linha 1077)
    
    ---
    
    ## 9. FINISH/END - Telemetria + MemorySummarizer (linhas 759-846)
    
    ### Insertion Point N: Telemetria no finish (antes de linha 842)
    ```typescript
    // === TELEMETRIA: Registrar finalizacao ===
    this.telemetry.recordCompletion({
      steps,
      reflections: this.reflectionCount,
      success: true,
    });
    ```
    
    **Linha exata:** Antes de `this.eventStream.push(createEvent("turn_end", ...))` (linha 842)
    
    ### Insertion Point O: MemorySummarizer consolidacao final (após linha 830)
    ```typescript
    // === MEMORY SUMMARIZER: Consolidacao final ===
    try {
      await this.memorySummarizer.consolidateSession(this.sessionId);
    } catch (e) {
      // Nao critico
    }
    ```
    
    **Linha exata:** Após o bloco DreamTask (linha 830), antes do bloco PlanManager complete (linha 832)
    
    ---
    
    ## 10. MAX STEPS REACHED - Telemetria (linhas 1088-1101)
    
    ### Insertion Point P: Telemetria no max steps (após linha 1090)
    ```typescript
    // === TELEMETRIA: Registrar max steps atingido ===
    this.telemetry.recordCompletion({
      steps,
      reflections: this.reflectionCount,
      success: false,
      reason: "max_steps_reached",
    });
    ```
    
    **Linha exata:** Após o log warn de max steps (linha 1090), antes do appendToTranscript
    
    ---
    
    ## 11. RUN METHOD INICIO - Telemetria (linhas 468-488)
    
    ### Insertion Point Q: Telemetria inicio do run (após linha 488)
    ```typescript
    // === TELEMETRIA: Iniciar sessao ===
    this.telemetry.startSession({
      input: input.slice(0, 200),
      sessionId: this.sessionId,
    });
    ```
    
    **Linha exata:** Após o bloco de debug log (linha 488), antes do rate limit check
    
    ---
    
    ## 12. PLANNER PROMPT - TokenGuard (linhas 586-627)
    
    ### Insertion Point R: TokenGuard no planner prompt (após linha 606, antes das Rules)
    ```typescript
    // === TOKEN GUARD: Garantir que o prompt do planner nao exceda limite ===
    const safePlannerPrompt = this.tokenGuard.guardPrompt(plannerPrompt, 3000);
    ```
    
    **Linha exata:** Após a definicao de `plannerPrompt` (apenas antes de enviar)
    
    Na pratica, usamos o contexto ja truncado no Insertion Point E, entao o planner prompt herda esse truncamento.
    
    ---
    
    ## 13. SPAWN AGENT - Telemetria (linhas 864-891)
    
    ### Insertion Point S: Telemetria no spawn agent (após linha 867)
    ```typescript
    this.telemetry.startSpan("spawn_agent");
    ```
    
    ### Insertion Point T: Telemetria fim spawn agent (após linha 877)
    ```typescript
    this.telemetry.endSpan("spawn_agent", {
      agentName: parsed.subAgent || "default",
      success: subResult.success,
    });
    ```
    
    ---
    
    ## 14. RATE LIMIT - Telemetria (linhas 490-496)
    
    ### Insertion Point U: Telemetria rate limit excedido (após linha 492)
    ```typescript
    this.telemetry.recordRateLimitExceeded(this.sessionId);
    ```
    
    **Linha exata:** Dentro do if rate limit, apos criar errorMsg
    
    ---
    
    # RESUMO DOS PONTOS DE INSERCAO
    
    | ID | Local (linha) | Modulo | Acao |
    |---|---|---|---|
    | A | 172 | Todos | Adicionar imports |
    | B | 259 | Todos | Adicionar class fields |
    | C | 275 | Todos | Inicializar no constructor |
    | D | 315 | Telemetria | start() |
    | E | 538 | TokenGuard | truncate context |
    | F | 633 | Telemetria | startSpan planner |
    | G | 640 | Resilience | withRetry planner.run |
    | H | 648 | Telemetria | endSpan planner |
    | I | 925 | Telemetria | startSpan agent |
    | J | 962 | Resilience | withRetry agent.run |
    | K | 979 | Telemetria | endSpan agent |
    | L | 1005 | Telemetria | recordReflection |
    | M | 1078 | MemorySummarizer | summarizeIfNeeded |
    | N | 841 | Telemetria | recordCompletion |
    | O | 831 | MemorySummarizer | consolidateSession |
    | P | 1091 | Telemetria | recordCompletion maxSteps |
    | Q | 489 | Telemetria | startSession |
    | S | 868 | Telemetria | startSpan spawn |
    | T | 878 | Telemetria | endSpan spawn |
    | U | 493 | Telemetria | recordRateLimitExceeded |
    
    ---
    
    # ORDEM DE INSERCAO (cronologica no codigo)
    
    1. A (172) - Imports
    2. B (259) - Fields
    3. C (275) - Init no constructor
    4. D (315) - Telemetry start
    5. Q (489) - Telemetry startSession
    6. U (493) - Telemetry rateLimit
    7. E (538) - TokenGuard truncate
    8. F (633) - Telemetry planner start
    9. G (640) - Resilience planner
    10. H (648) - Telemetry planner end
    11. I (925) - Telemetry agent start
    12. J (962) - Resilience agent
    13. K (979) - Telemetry agent end
    14. L (1005) - Telemetry reflection
    15. M (1078) - MemorySummarizer
    16. O (831) - MemorySummarizer consolidate
    17. N (841) - Telemetry completion
    18. P (1091) - Telemetry maxSteps
    19. S (868) - Telemetry spawn start
    20. T (878) - Telemetry spawn end
    
    