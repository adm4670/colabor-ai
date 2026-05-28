# MEMORY_AGENT.md - Memoria do Projeto
    
    ## Data do Ultimo Acesso
    2025
    
    ## Visao Geral do Projeto
    Este e o **colabor-ai-core** - Motor principal e runtime de orquestracao do **colabor.ai**,
    uma plataforma para criar e executar **agentes de IA que colaboram para resolver tarefas**.
    
    ## Stack Tecnologica
    - **Node.js** (v23.1.0)
    - **TypeScript** (^5.3.3) - Strict mode + ES2020 target
    - **OpenAI API** (GPT-4o-mini, GPT-5-nano)
    - **DeepSeek API** (deepseek-v4-flash)
    - **Telegram Bot API** (node-telegram-bot-api)
    - **MongoDB** (opcional)
    - **Jest** + Babel para testes
    - **ESLint** + **Prettier** para qualidade de codigo
    
    ## Estrutura do Projeto
    
    ```
    colabor-ai/
    ├── .env                          # Variaveis de ambiente
    ├── .env.example                  # Template de variaveis
    ├── .eslintrc.json                # Config ESLint
    ├── .prettierrc                   # Config Prettier
    ├── .github/workflows/ci.yml      # CI/CD GitHub Actions
    ├── tsconfig.json                 # Config TypeScript strict
    ├── Dockerfile                    # Build multi-estagio
    ├── package.json                  # Dependencias e scripts
    ├── jest.config.ts                # Config Jest
    ├── babel.config.js               # Config Babel
    ├── src/
    │   └── memory.json               # Memoria persistente (conversas)
    ├── core/
    │   ├── utils/
    │   │   └── logger.ts             # Logger estruturado (pino-like)
    │   ├── agent/
    │   │   ├── agent.ts              # Classe Agent principal (LLM + Tools)
    │   │   ├── agent.spec.ts         # Testes unitarios
    │   │   ├── agent.test.ts         # Testes de integracao
    │   │   └── main.ts               # CLI agente unico
    │   ├── agents/
    │   │   ├── assistant.agent.ts    # Agente conversacao geral
    │   │   ├── answer.agent.ts       # Agente escritor (formatacao)
    │   │   ├── planner.agent.ts      # Agente planner (orquestrador)
    │   │   ├── python.agent.ts       # Agente Python
    │   │   ├── shell.agent.ts        # Agente Shell
    │   │   └── task-manager.agent.ts # Agente tarefas (CRUD real)
    │   ├── orchestrator/
    │   │   ├── orchestrator.ts       # Orquestrador + Rate Limiting
    │   │   ├── orchestrator.spec.ts  # Testes unitarios
    │   │   ├── orchestrator.test.ts  # Testes de integracao
    │   │   ├── main.ts               # CLI multi-agente
    │   │   └── telegram.ts           # Bot Telegram com retry/backoff
    │   └── tools/
    │       ├── pythonExecTool.ts     # Tool Python (timeout configuravel)
    │       ├── shellExecTool.ts      # Tool Shell
    │       ├── cmdExecTool.ts        # Tool CMD
    │       └── task.tools.ts         # Tool Tarefas (handlers reais)
    └── tasks.json                    # Dados persistentes de tarefas
    ```
    
    ## Scripts Disponiveis
    | Script | Comando | Descricao |
    |--------|---------|-----------|
    | `npm test` | `dotenv -e .env -- jest --runInBand` | Rodar testes |
    | `npm run build` | `tsc` | Compilar TypeScript |
    | `npm run lint` | `eslint 'core/**/*.ts' --fix` | Lint + auto-fix |
    | `npm run format` | `prettier --write 'core/**/*.ts'` | Formatacao |
    | `npm run start:dev` | `tsx ./core/orchestrator/main.ts` | Dev (orquestrador) |
    | `npm run start:dev:agent` | `tsx ./core/agent/main.ts` | Dev (agente unico) |
    | `npm run start:dev:orchestrator:telegram` | `tsx ./core/orchestrator/telegram.ts` | Dev (Telegram) |
    | `npm run start:prod` | `node dist/core/orchestrator/main.js` | Producao |
    
    ## Funcionalidades State-of-the-Art
    
    ### Agentes
    - **Agent class**: LLM agnostic (OpenAI/DeepSeek), suporte a function calling, historico
    - **Planner**: Orquestrador inteligente que decide qual agente executar
    - **Assistant**: Conversacao geral
    - **Python Agent**: Executa codigo Python com timeout configuravel (PYTHON_TIMEOUT)
    - **Shell Agent**: Executa comandos shell com protecao contra comandos perigosos
    - **Task Manager**: CRUD real de tarefas persistido em tasks.json
    - **Answer Agent**: Formata respostas para WhatsApp/Telegram
    
    ### Orquestracao
    - **AgentOrchestrator**: Loop de execucao multi-agente com planner
    - **Rate Limiting**: Protecao contra uso excessivo (MAX_MESSAGES_PER_SESSION)
    - **Max Steps**: Limite de 10 passos por execucao
    - **Detecao de Loop**: Prevencao contra instrucoes repetidas
    
    ### Telegram
    - **Retry/Backoff**: 3 tentativas com delay exponencial (1s, 2s, 4s)
    - **Transcricao de Audio**: Suporte a mensagens de voz via Whisper (GPT-4o-transcribe)
    - **Historico**: 20 ultimas mensagens por chat
    
    ### Qualidade de Codigo
    - **Logger estruturado**: Niveis (debug, info, warn, error), timestamp ISO, metadados
    - **ESLint**: Regras TypeScript, 'any' warning, unused vars
    - **Prettier**: Formatacao consistente
    - **CI/CD**: GitHub Actions com matrix Node (20, 22, 23)
    
    ### DevOps
    - **Docker**: Build multi-estagio (Node 23 Alpine + Python)
    - **TSConfig**: Strict mode, ES2020, source maps
    
    ## Melhorias Aplicadas (State-of-the-Art)
    1. tsconfig.json com strict mode
    2. Memoria persistente (src/memory.json)
    3. Task manager com handlers reais (tasks.json)
    4. Renomeacao awnser -> answer
    5. Rate limiting no orquestrador
    6. Retry/backoff no Telegram
    7. Timeout Python configuravel
    8. .env.example completo
    9. Logger estruturado (core/utils/logger.ts)
    10. Dockerfile multi-estagio
    11. CI/CD GitHub Actions
    12. ESLint + Prettier
    13. Scripts build, lint, format
    14. Remocao de dependencias nao usadas (express)
    