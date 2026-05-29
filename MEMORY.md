# MEMORY.md - Memoria de Longo Prazo
    
    Este arquivo armazena fatos duradouros, preferencias, decisoes e
    aprendizados que devem ser preservados entre sessoes.
    
    ## Sobre o Projeto
    - Nome: colabor-ai
    - Descricao: Plataforma multi-agente com orquestrador inteligente
    - Stack: Node.js, TypeScript, OpenAI API, DeepSeek API
    - Arquitetura: Planner-Worker (orquestrador decide qual agente executar)
    
    ## Agentes Disponiveis
    - **PlannerAgent**: Decide qual agente executar (cerebro do sistema)
    - **AssistantAgent**: Conversa geral, perguntas simples
    - **PythonAgent**: Executa codigo Python
    - **BrowserAgent**: Automacao web (navegar, clicar, screenshots)
    - **ShellAgent**: Comandos shell (npm, git, fs)
    - **TaskManagerAgent**: CRUD de tarefas
    - **AnswerAgent**: Formata resposta final (WriterAgent)
    
    ## Preferencias do Usuario
    - Respostas devem ser em PT-BR
    - Seja claro e direto
    - Evite "filler phrases" como "Great question!" ou "I'd be happy to help"
    - Tenha opinioes - nao seja um robo corporativo
    
    ## Decisoes de Arquitetura
    - 2025: Adotado padrao Planner-Worker
    - 2025: Adicionado suporte a Telegram via polling
    - 2026: Iniciada migracao para session transcript em JSONL
    - 2026: Adicionado EventStream para streaming de eventos
    
    
    ## Alteracoes Realizadas (09/03/2026)
    - **Corrigido erro "Agent not found: ShellAgent"**: Adicionado `shellAgent` na lista de subAgents do `core/orchestrator/main.ts`
    - **Criado `core/constants/instructions.ts`**: Arquivo com `CORE_INSTRUCTIONS` e `FORMAT_RESPONSE_JSON` para centralizar instrucoes compartilhadas entre agentes
    - **Refatorado `planner.agent.ts`**: Substituido bloco de identidade duplicado por import de `CORE_INSTRUCTIONS`
    - **Refatorado `orchestrator/main.ts`**: Substituido bloco de identidade duplicado por import de `CORE_INSTRUCTIONS`
    - **Atualizados agentes**: Todos os agentes agora importam `CORE_INSTRUCTIONS` como prefixo em suas `generalInstructions`
    - **Removido `core/tools/cmdExecTool.ts`**: Arquivo duplicado do `shellExecTool.ts` (nao era importado por nenhum outro arquivo)
    
## Fatos
- [2026-05-29] tínhamos conversado antes, e na época eu não encontrei nenhum registro de conversas anteriores substanciais
