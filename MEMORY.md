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
    - **PythonAgent**: Executa codigo Python E navegacao web com Playwright (preencher formularios, clicar, extrair texto, screenshots - visivel ou headless)
    - **ShellAgent**: Comandos shell (npm, git, fs)
    - **TaskManagerAgent**: CRUD de tarefas
    - **AnswerAgent**: Formata resposta final (WriterAgent)
    - ~~**BrowserAgent**~~: **REMOVED** - Funcao incorporada ao PythonAgent + Playwright
    
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
    - **2026-06-10: BrowserAgent removido.** PythonAgent agora acumula as funcoes de navegacao web usando Playwright.
    
    ## Alteracoes Realizadas
    
    ### 2026-06-10: BrowserAgent removido - PythonAgent + Playwright
    - **BrowserAgent desativado**: Navegacao web movida para PythonAgent
    - **PythonAgent atualizado**: Adicionadas capacidades de Playwright (navegar, clicar, preencher formularios, screenshots, modo visivel/headless)
    - **PlannerAgent atualizado**: Instrucoes agora direcionam tarefas web para PythonAgent
    - **Orchestrator atualizado**: browserAgent removido da lista de subAgents
    - **web-search skill atualizada**: Referencias a BrowserAgent substituidas por PythonAgent+Playwright
    - **MEMORY.md limpo**: Entradas duplicadas/garbadas removidas
    - **Motivacao**: BrowserAgent estourava limite de contexto (100k+ tokens) em paginas complexas. PythonAgent com scripts Playwright e mais enxuto (2k-5k tokens), flexivel e resiliente.
    
    ### 2026-03-09: Correcoes e refatoracoes
    - **Corrigido erro "Agent not found: ShellAgent"**: Adicionado `shellAgent` na lista de subAgents
    - **Criado `core/constants/instructions.ts`**: Instrucoes centralizadas
    - **Refatorado `planner.agent.ts`**: Substituido bloco de identidade duplicado
    - **Removido `core/tools/cmdExecTool.ts`**: Arquivo duplicado
    
    ## Aprendizados
    - [2026-06-10] Navegacao web com PythonAgent + Playwright e mais estavel que BrowserAgent separado
    - [2026-06-10] Pagina de ramais do Senac PE e publica (link "Ramais" no topo), nao precisa de login
    - [2026-06-10] Ramal do Marcio Higo (Coordenadoria Sistemas - GTI): 6680
    - [2026-05-29] Shell e mais segura pra testar, automatica e melhor para producao
    
## Preferencias
- [2026-06-11] suas entre sessões

## Decisoes
- [2026-06-12] O `orchestrator

## Preferencias
- [2026-06-12] **atualizar o código** para incluir o que está na documentação (LONG + SHORT + range + LightGBM)?

## Preferencias
- [2026-06-12] revisar mais algum detalhe? 😊

## Decisoes
- [2026-06-12] Sempre que o `run()` termina (por qualquer motivo), o planner é zerado

## Preferencias
- [2026-06-12] ver os resultados do backtest primeiro? 😊

## Fatos
- [2026-06-12] viola Jones sobre visão computacional

## Aprendizados
- [2026-06-12] que seleciona as melhores features e combina classificadores fracos em um forte
