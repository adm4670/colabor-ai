# 🤖 colabor-ai
    
    > *"Vários agentes de IA trabalhando juntos, como uma equipe de formiguinhas, para resolver o que você precisar."*
    
    O **colabor-ai** é uma plataforma open-source que permite criar e orquestrar **agentes de IA** especializados que colaboram entre si para resolver tarefas — desde responder perguntas simples até planejar seu dia ou executar código Python.
    
    ---
    
    ## 🧠 A Ideia (em 30 segundos)
    
    Imagine que você tem **uma equipe de mini-especialistas em IA**, cada um bom em uma coisa diferente:
    
    | Agente | Especialidade |
    |--------|--------------|
    | 🗣️ **ChatAgent** | Conversar e responder perguntas |
    | 📋 **DailyPlanner** | Organizar tarefas e planejar o dia |
    | 🔍 **ResearchAgent** | Pesquisar e explicar assuntos |
    | ⚙️ **ExecutorAgent** | Executar tarefas práticas |
    | ✍️ **FormatterAgent** | Deixar respostas bonitas e organizadas |
    | 📝 **SummarizerAgent** | Resumir textos longos |
    | 🐍 **PythonAgent** | Escrever e rodar código Python |
    | 🧐 **CriticAgent** | Avaliar se o trabalho ficou bom |
    
    Sozinho, cada um resolve coisas pontuais. Mas juntos, com um **maestro** coordenando, eles viram uma potência.
    
    É exatamente isso que o `colabor-ai` faz: **orquestra agentes como uma orquestra toca música** 🎻
    
    ---
    
    ## 🏗️ Arquitetura Geral
    
    ```
    ┌──────────────────────────────────────────────────────────┐
    │                     🌐 CANAIS DE ENTRADA                 │
    │                                                          │
    │   💬 Telegram    ⌨️ Terminal    🌍 Web Chat    🔌 API    │
    │        │              │              │            │       │
    └────────┼──────────────┼──────────────┼────────────┼──────┘
             │              │              │            │
             └──────────────┴──────────────┴────────────┘
                                │
                                ▼
    ┌──────────────────────────────────────────────────────────┐
    │                  🎼 ORCHESTRATOR (Maestro)                │
    │                                                          │
    │   ┌──────────────┐   ┌──────────┐   ┌───────────────┐   │
    │   │   Planner    │──▶│   Router  │──▶│    Critic     │   │
    │   │ "O que fazer?│   │"Quem faz?"│   │"Ficou bom?"   │   │
    │   └──────────────┘   └──────────┘   └───────────────┘   │
    │           │                  │               │           │
    │           └──────────────────┴───────────────┘           │
    │                              │                           │
    └──────────────────────────────┼───────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
       ┌─────────────┐     ┌─────────────┐      ┌─────────────┐
       │  🤖 AGENTE 1 │     │  🤖 AGENTE 2 │      │  🤖 AGENTE 3 │
       │  (ChatAgent) │     │ (PythonAgent)│      │ (WriterAgent)│
       └─────────────┘     └─────────────┘      └─────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                                   ▼
                        ┌─────────────────┐
                        │   🧠 OpenAI LLM  │
                        │  (gpt-5-nano,    │
                        │   gpt-4o-mini)   │
                        └─────────────────┘
    ```
    
    ### O fluxo, passo a passo:
    
    1. **Você manda uma mensagem** pelo Telegram ou Terminal
    2. O **Orchestrator** recebe e pergunta ao **Planner**: *"O que precisa ser feito?"*
    3. O Planner decide qual **Agente** é o mais adequado e o que ele deve fazer
    4. O Agente escolhido **raciocina** usando o LLM (OpenAI) e, se precisar, usa **Ferramentas** (como executar Python)
    5. O **Critic** avalia se o resultado ficou bom
    6. Se não ficou bom, o ciclo continua com outro agente. Se ficou, a resposta é entregue ao usuário!
    
    ---
    
    ## 📁 Estrutura do Projeto
    
    ```
    colabor-ai/
    │
    ├── core/                          # 🔧 Núcleo da engine
    │   ├── agent/
    │   │   ├── agent.ts               #    Classe base do Agente (LLM + tools + memória)
    │   │   ├── main.ts                #    Exemplo: agente único via terminal
    │   │   └── orchestrator/          #    Versão 1 do orquestrador (Router + Critic)
    │   │       ├── orchestrator.ts    #       Orquestra agentes com memória compartilhada
    │   │       └── sharedMemory.ts    #       Estado compartilhado entre agentes
    │   │
    │   ├── orchestrator/              # 🎼 Versão 2 do orquestrador (Planner + JSON)
    │   │   ├── orchestrator.ts        #    Engine principal de orquestração
    │   │   ├── main.ts                #    Exemplo via terminal
    │   │   └── telegram.ts            #    Exemplo via Telegram
    │   │
    │   └── tools/                     # 🛠️ Sistema de ferramentas
    │       ├── toolDefinition.ts      #    Interface para definir ferramentas
    │       ├── toolRegistry.ts        #    Registro de ferramentas disponíveis
    │       └── pythonExecTool.ts      #    Ferramenta: executa código Python
    │
    ├── cloud/                         # ☁️ Backend (servidor)
    │   ├── src/
    │   │   ├── server.ts              #    Express + WebSocket server
    │   │   ├── agents/                #    Agentes cloud (planner, python)
    │   │   ├── orchestrator/          #    Orchestrator cloud edition
    │   │   ├── context/               #    Context engine (token budget)
    │   │   ├── memory/                #    Memory engine (longo prazo)
    │   │   ├── protocol/              #    Tool protocol (cloud <-> client)
    │   │   ├── routes/                #    Auth + Chat endpoints
    │   │   ├── llm/                   #    LLM providers (DeepSeek/OpenAI)
    │   │   └── types/                 #    Tipos compartilhados
    │   └── __tests__/                 #    42 testes automatizados
    │
    ├── client/                        # 🖥️ Desktop app (Electron + React)
    │   ├── package.json               #    Dependências (React, Vite, Electron)
    │   └── README.md                  #    Documentação do client
    │
    ├── package.json                   # 📦 Dependências e scripts
    ├── tsconfig.json                  # 🔧 Configuração TypeScript
    ├── jest.config.ts                 # 🧪 Configuração de testes
    └── babel.config.js                # 🔄 Transpilação TypeScript
    ```
    
    ---
    
    ## 🔬 Os Componentes em Detalhe
    
    ### 1. Agent (`core/agent/agent.ts`)
    
    > **O "funcionário" inteligente.**
    
    Cada agente é um wrapper sobre um modelo de linguagem (OpenAI) que tem:
    - **Nome, papel, objetivo e backstory** — uma "personalidade" definida
    - **Histórico de conversa** — lembra do que foi dito
    - **Tools (ferramentas)** — pode executar ações como rodar Python
    - **System prompt** — instruções de comportamento
    
    ```typescript
    const agente = new Agent({
      name: "MathAgent",
      role: "Math expert",
      goal: "Solve mathematical problems",
      backstory: "An AI specialized in calculations.",
      model: "gpt-5-nano",
      tools: [pythonExecTool],
      functions: { execute_python: pythonExecTool.handler }
    })
    
    const resposta = await agente.run("Quanto é 352 × 127?")
    ```
    
    ### 2. AgentOrchestrator (`core/orchestrator/orchestrator.ts`)
    
    > **O maestro da orquestra.**
    
    Coordena múltiplos agentes seguindo um loop inteligente:
    
    ```
    ┌──────────────────────────────────┐
    │         ORCHESTRATOR LOOP        │
    │                                  │
    │  1. Planner decide o que fazer   │
    │  2. Planner escolhe um agente    │
    │  3. Agente executa a tarefa      │
    │  4. Resultado é registrado       │
    │  5. Planner decide: continuar    │
    │     ou "finish"?                 │
    │  6. Se finish → responde!        │
    │     Se não → volta ao passo 1    │
    │                                  │
    │  (máx. 10 iterações, proteção   │
    │   contra loops infinitos 🔒)     │
    └──────────────────────────────────┘
    ```
    
    O Planner recebe a tarefa + lista de agentes disponíveis e responde em JSON:
    
    ```json
    {
      "agent": "python_code",
      "instruction": "Calcule 352 × 127 usando Python e retorne o resultado"
    }
    ```
    
    Ou, quando a tarefa está resolvida:
    
    ```json
    {
      "agent": "finish",
      "instruction": "O resultado é **44.704**"
    }
    ```
    
    ### 3. ToolRegistry + Tools (`core/tools/`)
    
    > **A caixa de ferramentas que todo agente pode usar.**
    
    | Ferramenta | O que faz |
    |-----------|-----------|
    | 🔢 `execute_python` | Executa código Python e retorna o resultado |
    | 🕐 `getCurrentDateTime` | Retorna a data/hora atual |
    
    Novas ferramentas podem ser adicionadas facilmente — é só registrar no `ToolRegistry`!
    
    ### 4. Canais de Entrada
    
    | Canal | Arquivo | Descrição |
    |-------|---------|-----------|
    | 💬 **Telegram** | `core/orchestrator/telegram.ts` | Bot do Telegram com polling |
    | ⌨️ **Terminal** | `core/orchestrator/main.ts` | Interface via linha de comando |
    
    ---
    
    ## 🌩️ Cloud & 🖥️ Client
    
    ### ☁️ Cloud (Servidor)
    
    O **Cloud** é o cérebro central do sistema:
    - **API HTTP** (Express) para receber requisições
    - **WebSocket** para comunicação em tempo real com o Client
    - **Orchestrator** que coordena agentes cloud (assistant, python) e locais (file_system, shell, desktop)
    - **Memory Engine** com busca e consolidação de memórias
    - **Context Engine** com sumarização inteligente para não estourar tokens
    - **Autenticação JWT** para segurança
    
    ### 🖥️ Client (Desktop)
    
    O **Client** é o aplicativo Windows (Electron + React + Vite) que:
    - Mostra a interface de chat para o usuário
    - Executa **13 ferramentas locais** no PC (arquivos, shell, screenshot, clipboard, processos)
    - Comunica-se com o Cloud via **WebSocket + tool protocol**
    
    ```
    ┌──────────┐      WebSocket       ┌──────────┐      API        ┌──────────┐
    │  CLIENT  │ ◀──────────────────▶ │  CLOUD   │ ◀─────────────▶ │   LLM    │
    │ (Windows)│   tool_call/result   │ (Server) │                 │(DeepSeek/│
    │          │   stream/progress    │          │                 │ OpenAI)  │
    └──────────┘                      └──────────┘                 └──────────┘
    ```
    
    ---
    
    ## 🚀 Começando
    
    ### Pré-requisitos
    - **Node.js** 18+
    - **Python** 3.x (para a ferramenta `execute_python`)
    - Uma **API Key da OpenAI ou DeepSeek**
    - Um **Bot Token do Telegram** (opcional)
    
    ### Instalação
    
    ```bash
    git clone https://github.com/adm4670/colabor-ai.git
    cd colabor-ai
    npm install
    cd cloud && npm install && cd ..
    cd client && npm install && cd ..
    ```
    
    ### Configuração
    
    Crie um arquivo `.env` na raiz:
    
    ```env
    OPENAI_API_KEY=sk-...
    OPENAI_MODEL_NAME=gpt-5-nano
    TELEGRAM_TOKEN=123456:ABC...
    ```
    
    ### Rodando
    
    ```bash
    # Agente único no terminal
    npm run start:dev:agent
    
    # Multi-agente no terminal
    npm run start:dev:orchestrator
    
    # Multi-agente via Telegram
    npm run start:dev:orchestrator:telegram
    
    # Cloud: servidor backend
    cd cloud && npm run dev
    
    # Client: app Electron (modo dev)
    cd client && npm run dev
    ```
    
    ### Build & Testes
    
    ```bash
    npm run build    # Compila TypeScript
    npm test         # Roda testes com Jest
    ```
    
    ---
    
    ## 🛣️ Roadmap
    
    ### ✅ Já implementado
    - Agent único com tools e memória de conversa
    - Orquestrador multi-agente (Planner + Router + Critic)
    - Ferramenta de execução Python (`execute_python`)
    - Canal Telegram com polling + Canal Terminal interativo
    - Servidor Express + WebSocket + JWT (Cloud)
    - Memory Engine + Context Engine (Cloud)
    - Tool Protocol (tool_call/tool_result)
    - Scaffold Electron + React + Vite (Client)
    - 42 testes automatizados no Cloud
    
    ### 🔮 Planejado
    - [ ] Implementar UI React do Client
    - [ ] Implementar ferramentas locais do Client (file_system, shell, desktop)
    - [ ] Dashboard Web para gerenciamento de agentes
    - [ ] Suporte multi-usuário com isolamento de sessões
    - [ ] Persistência em banco de dados
    - [ ] Novos canais: WhatsApp, Slack, Discord
    - [ ] Tool marketplace (catálogo plug-and-play)
    - [ ] No-code agent builder
    - [ ] Observabilidade (logs, métricas, tracing)
    - [ ] Workflow engine com branches e condições
    
    ---
    
    ## 🧪 Stack Tecnológica
    
    | Camada | Core | Cloud | Client |
    |--------|------|-------|--------|
    | Linguagem | TypeScript | TypeScript | TypeScript |
    | Runtime | Node.js + tsx | Node.js + ts-node | Electron + Vite |
    | Framework | — | Express | React 18 |
    | Comunicação | — | WebSocket (ws) | WebSocket (ws) |
    | LLM | OpenAI SDK | OpenAI + DeepSeek | — |
    | Auth | — | JWT | — |
    | Testes | Jest + Babel | Jest + ts-jest | — |
    | Linting | ESLint + Prettier | ESLint + Prettier | ESLint + Prettier |
    
    ---
    
    ## 🤝 Contribuindo
    
    1. Faça um fork
    2. Crie uma branch: `git checkout -b minha-feature`
    3. Commit: `git commit -m 'feat: minha feature'`
    4. Push: `git push origin minha-feature`
    5. Abra um Pull Request
    
    ---
    
    ## 📄 Licença
    
    MIT License
    
    ---
    
    <p align="center">
      <b>colabor-ai</b> — Feito com ❤️ para tornar agentes de IA acessíveis a todos.
    </p>
    
