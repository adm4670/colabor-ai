# colabor-ai Cloud
    
    Backend do colabor-ai — orquestrador de agentes com sumarização inteligente
    de contexto, execução local remota via WebSocket e memória de longo prazo.
    
    ## Arquitetura
    
    ```
    Cliente (Electron/React)
      │  WebSocket + REST (JWT)
      ▼
    Server (Express + ws)
      ├── /auth          → JWT login/verify/refresh
      ├── /chat          → REST chat endpoint
      └── /ws            → WebSocket streaming + tool protocol
           │
           ▼
      AgentOrchestrator
      ├── PlannerAgent    → Decide qual agente usar (via LLM)
      ├── ContextEngine   → Sumarização LLM com 3 zonas (intacta/sumarizada/descartada)
      ├── MemoryEngine    → Busca semântica em MEMORY.md + notas diárias
      └── Agents
           ├── assistant      → cloud
           ├── python_code    → cloud
           ├── file_system    → local (via WS tool_call)
           ├── shell          → local (via WS tool_call)
           └── desktop        → local (via WS tool_call)
    ```
    
    ## API Endpoints
    
    ### Auth
    | Método | Rota | Descrição |
    |--------|------|-----------|
    | POST | `/auth/login` | Login com API key, retorna JWT |
    | POST | `/auth/verify` | Verifica validade do token |
    | POST | `/auth/refresh` | Renova token |
    
    ### Chat
    | Método | Rota | Descrição |
    |--------|------|-----------|
    | POST | `/chat/message` | Envia mensagem (autenticado) |
    | GET | `/chat/stream/:sessionId` | Info do stream WS |
    | GET | `/chat/sessions` | Lista sessões ativas |
    
    ### WebSocket
    | Endpoint | Descrição |
    |----------|-----------|
    | `ws://host:3001/ws?token=JWT&sessionId=ID` | Conexão persistente |
    
    **Mensagens do servidor:**
    - `{ type: "stream", payload: { chunkType, content, agent } }` — Streaming de resposta
    - `{ type: "tool_call", payload: { id, agent, tool, params, requireConfirmation } }` — Executar ferramenta local
    
    **Mensagens do cliente:**
    - `{ type: "chat", payload: { message } }` — Enviar mensagem
    - `{ type: "tool_result", payload: { id, status, result } }` — Resultado da ferramenta
    - `{ type: "ping" }` — Keepalive
    
    ## Como rodar
    
    ```bash
    # Instalar dependências
    npm install
    
    # Configurar variáveis de ambiente
    cp .env.example .env
    # Edite .env com sua DEEPSEEK_API_KEY
    
    # Desenvolvimento
    npm run dev
    
    # Build
    npm run build
    
    # Produção
    npm start
    ```
    
    ## Scripts
    
    | Script | Descrição |
    |--------|-----------|
    | `npm run build` | Compila TypeScript |
    | `npm run dev` | Roda com ts-node |
    | `npm start` | Roda compilado (dist/) |
    | `npm test` | Executa testes unitários |
    | `npm run lint` | Verifica código com ESLint |
    | `npm run lint:fix` | Corrige problemas de lint |
    | `npm run format` | Formata com Prettier |
    | `npm run docs` | Gera documentação com TypeDoc |
    
    ## Variáveis de Ambiente
    
    | Variável | Padrão | Descrição |
    |----------|--------|-----------|
    | `PORT` | `3001` | Porta do servidor |
    | `NODE_ENV` | `development` | Ambiente |
    | `JWT_SECRET` | `dev-secret-change-me` | Chave JWT |
    | `JWT_EXPIRES_IN` | `24h` | Expiração do token |
    | `LLM_PROVIDER` | `deepseek` | Provedor LLM |
    | `DEEPSEEK_API_KEY` | — | API key DeepSeek |
    | `OPENAI_API_KEY` | — | API key OpenAI |
    | `TOOL_TIMEOUT_MS` | `60000` | Timeout tool calls |
    | `MEMORY_DIR` | `./memory` | Diretório de memória |
    
    ## Estrutura de Diretórios
    
    ```
    cloud/
    ├── src/
    │   ├── server.ts              # Entrypoint Express + WS
    │   ├── routes/
    │   │   ├── auth.ts            # JWT endpoints
    │   │   └── chat.ts            # Chat endpoints
    │   ├── orchestrator/
    │   │   └── orchestrator.ts    # Fluxo Planner → Agent → Reflection
    │   ├── agents/
    │   │   ├── planner.ts         # Decide agente via LLM
    │   │   └── python.ts          # Executor Python
    │   ├── context/
    │   │   └── context-engine.ts  # Sumarização LLM (3 zonas)
    │   ├── memory/
    │   │   └── memory-engine.ts   # Busca semântica
    │   ├── protocol/
    │   │   └── tool-protocol.ts   # Tipos WS (tool_call/tool_result)
    │   ├── llm/
    │   │   └── provider.ts        # Cliente OpenAI/DeepSeek
    │   ├── utils/
    │   │   └── logger.ts          # Logger
    │   └── types/
    │       └── index.ts           # Tipos compartilhados
    ├── __tests__/                 # Testes unitários
    ├── docs/                      # Documentação gerada
    ├── eslint.config.js
    ├── jest.config.js
    ├── tsconfig.json
    ├── package.json
    └── .env.example
    ```
    
    ## Licença
    
    Propietário. Todos os direitos reservados.
    