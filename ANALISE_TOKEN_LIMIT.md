
    =============================================================================
     ANÁLISE COMPLETA: ERRO DE LIMITE DE TOKENS NO COLABOR-AI
    =============================================================================
    
    ## 1. O ERRO
    
    BadRequestError: 400 This model's maximum context length is 1048565 tokens.
    However, you requested 1109739 tokens (1109739 in the messages, 0 in the completion).
    
    O modelo suporta no máximo 1.048.565 tokens, mas a requisição enviou 1.109.739 tokens
    (um excesso de ~61.174 tokens, cerca de 5,8% acima do limite).
    
    O log mostra: "[Agent] Historico atual: 191 mensagens" — são 191 mensagens acumuladas
    no histórico do planner.
    
    =============================================================================
    
    ## 2. CAUSA RAIZ
    
    ### 2.1. O histórico do Agent NUNCA é truncado
    
    Arquivo: C:\Developer\colabor-ai\core\agent\agent.ts
    
    A classe Agent mantém um array `private history: Message[] = []` que cresce
    indefinidamente. No método `run()`:
    
       async run(userMessage: string) {
         await this.ensureSystemMessage();      // adiciona system (1x)
         this.history.push({ role: "user", ... });  // adiciona user
         while (true) {
           const response = await this.client.chat.completions.create({
             messages: this.history as any,      // <--- ENVIA O HISTÓRICO INTEIRO!
             ...
           });
           this.history.push(assistantEntry);    // adiciona assistant
           for (const toolCall of msg.tool_calls) {
             this.history.push({ role: "tool", ... }); // adiciona tool result
           }
         }
       }
    
    Cada chamada ao run() adiciona MÚLTIPLAS mensagens ao histórico.
    NUNCA remove mensagens antigas.
    
    ### 2.2. O método resetHistory() existe mas nunca é chamado
    
    O método `resetHistory()` está implementado:
       resetHistory(): void {
         this.history = [];
       }
    
    Mas NENHUMA parte do sistema o invoca. Nem o orchestrator, nem o telegram.
    
    ### 2.3. O planner é o mesmo objeto (singleton) reutilizado para sempre
    
    Arquivo: C:\Developer\colabor-ai\core\orchestrator\telegram.ts
    
       const planner = agentRegistry.getPlanner();  // singleton
       const orchestrator = new AgentOrchestrator(planner, agents);
    
    O mesmo planner atende TODAS as requisições do usuário. Seu histórico interno
    acumula TODOS os prompts de TODAS as interações anteriores.
    
    ### 2.4. Cada requisição do usuário gera MÚLTIPLAS chamadas ao planner
    
    Arquivo: C:\Developer\colabor-ai\core\orchestrator\orchestrator.ts
    
    Dentro do método run(), há um loop while (steps < maxSteps) (max 10 passos):
    
       while (steps < maxSteps) {
         let decision = await this.planner.run(plannerPrompt);  // 1 chamada
         
         // Se JSON inválido: retry
         while (parseAttempts <= maxParseAttempts) {
           decision = await this.planner.run(retryPrompt);       // +1 a +2 chamadas
         }
         
         // Depois executa o sub-agent
         const result = await target.agent.run(agentPrompt);     // sub-agent acumula
         
         // Opcional: reflection
         // (mais chamadas ao planner)
       }
    
    Em uma única requisição do usuário, o planner pode ser chamado de 1 a 15+ vezes,
    cada vez adicionando mais mensagens ao seu histórico.
    
    ### 2.5. Cada prompt do planner é GRANDE
    
    O plannerPrompt contém:
    - User request (input do usuário)
    - Conversation history (histórico formatado - até 20 mensagens do Telegram)
    - Current context (memórias recentes carregadas)
    - Available agents (lista de agentes)
    - Regras e instruções
    
    Cada prompt tem facilmente 2.000-5.000+ tokens.
    
    =============================================================================
    
    ## 3. POR QUE O LIMITE FOI ULTRAPASSADO
    
    Após várias interações do usuário:
    - Planner foi chamado dezenas de vezes
    - Cada chamada adicionou 2-4 mensagens ao histórico (user + assistant + tools)
    - Total acumulado: 191 mensagens
    - Cada mensagem individual pode ter milhares de tokens
    - Total: 1.109.739 tokens → excede o limite de 1.048.565
    
    =============================================================================
    
    ## 4. PROBLEMAS ADICIONAIS
    
    a) Sub-agents (assistant, python_code, writer, etc.) também acumulam
       histórico sem limite, cada um na sua própria instância.
    
    b) O ContextEngine tem um sistema de sumarização (maxTokens: 8000) mas
       ELE NÃO É USADO para limitar o history do Agent. O Agent envia
       this.history diretamente para a API.
    
    c) O transcript.ts já tem funções de compactação (compactTranscript)
       que mantém apenas as últimas 30 mensagens, mas isso é para o
       TRANSCRIPT, não para o Agent.history.
    
    d) Não há contagem de tokens ANTES de enviar a requisição. O erro
       só aparece quando a API rejeita.
    
    =============================================================================
    
    ## 5. SOLUÇÕES
    
    ### SOLUÇÃO 1 (MAIS SIMPLES E IMEDIATA): Resetar histórico do planner
    No orchestrator, após cada chamada a run(), resetar o planner:
    
       // No final do orchestrator.run(), antes de retornar:
       this.planner.resetHistory();
    
    Afeta: apenas orchestrator.ts (inserir 1 linha)
    Risco: baixo - planner é stateless, ele decide o próximo passo baseado
           no input atual, não no histórico.
    
    ### SOLUÇÃO 2: Truncamento por número de mensagens no Agent.run()
    No agent.ts, antes de enviar a requisição:
    
       const MAX_HISTORY_MESSAGES = 30;
       if (this.history.length > MAX_HISTORY_MESSAGES) {
         // Manter system + últimas N mensagens
         const systemMsg = this.history[0];
         this.history = [
           systemMsg,
           ...this.history.slice(-(MAX_HISTORY_MESSAGES - 1))
         ];
       }
    
    Afeta: agent.ts
    Risco: baixo-médio - perde contexto antigo, mas evita estouro
    
    ### SOLUÇÃO 3: Contagem de tokens antes de enviar
    No agent.ts, estimar tokens e truncar se necessário:
    
       const MAX_TOKENS = 1000000; // abaixo do limite do modelo
       while (estimateTokens(this.history) > MAX_TOKENS) {
         // Remover mensagens mais antigas (exceto system)
         if (this.history.length > 2) {
           this.history.splice(1, 1); // remove 2a mensagem (mais antiga não-system)
         } else break;
       }
    
    ### SOLUÇÃO 4 (RECOMENDADA): Combinar 1 + 2
    - Resetar planner após cada ciclo (solução 1) → elimina o acúmulo principal
    - Adicionar truncamento de segurança no Agent.run() (solução 2) → proteção contra bugs
    
    =============================================================================
    