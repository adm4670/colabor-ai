# 🤖 colabor-ai

> *"Varios agentes de IA trabalhando juntos, como uma equipe de formiguinhas, para resolver o que voce precisar."*

O **colabor-ai** e uma plataforma open-source que cria e orquestra **agentes de IA** especializados que colaboram entre si para resolver tarefas -- desde responder perguntas simples ate planejar seu dia ou executar codigo Python.

---

## 💡 A Ideia (em 30 segundos)

Imagine uma **equipe de mini-especialistas em IA**, cada um bom em uma coisa diferente, com um **maestro** coordenando:

| Agente | Especialidade |
|--------|--------------|
| 🧠 **PlannerAgent** | Decide o que fazer e qual agente usar |
| 💬 **AssistantAgent** | Conversar e responder perguntas |
| 🐍 **PythonAgent** | Escrever e rodar codigo Python |
| 🌐 **BrowserAgent** | Navegar na web e extrair dados |
| 🐚 **ShellAgent** | Executar comandos de sistema |
| 🔍 **ReflectorAgent** | Avaliar se o trabalho ficou bom |
| ✍️ **AnswerAgent** | Gerar respostas finais formatadas |
| 📋 **TaskManager** | Gerenciar tarefas e agendamentos |

E o que faz isso funcionar e o **Orchestrator** (Maestro), que coordena tudo com planejamento multi-step, memoria de longo prazo e streaming de eventos.

---

## 🏗️ Arquitetura

```
                    📱 CANAIS DE ENTRADA
               Telegram  |  Terminal  |  Web  |  API
                    |          |          |       |
                    +----------+----------+-------+
                               |
                               v
                    +---------------------+
                    |   ORCHESTRATOR      |
                    |   (Maestro)         |
                    |                     |
                    | Planner -> Router   |
                    |   |         |       |
                    |   v         v       |
                    | Agent Selection     |
                    |   |                 |
                    |   v                 |
                    | +---------------+   |
                    | | AGENTES       |   |
                    | | Assistant     |   |
                    | | PythonAgent   |   |
                    | | BrowserAgent  |   |
                    | | ShellAgent    |   |
                    | | Reflector     |   |
                    | +---------------+   |
                    |   |                 |
                    |   v                 |
                    | +---------------+   |
                    | | FERRAMENTAS   |   |
                    | | Python Exec   |   |
                    | | Browser Nav   |   |
                    | | Web Search    |   |
                    | | Shell Exec    |   |
                    | | Todo Write    |   |
                    | | Schedule Task |   |
                    | +---------------+   |
                    |   |                 |
                    +---|-----------------+
                        v
              +------------------+
              | LLM API          |
              | (DeepSeek/OpenAI)|
              +------------------+
                        |
          +-------------+-------------+
          |             |             |
       MEMORY        CONTEXT        PLAN
       (longo         (token        (multi-
       prazo)        budget)        step)
```

### Fluxo de execucao:

1. **Voce manda uma mensagem** pelo Telegram ou Terminal
2. O **Orchestrator** recebe e pergunta ao **Planner**: *"O que precisa ser feito?"*
3. O Planner decide qual **Agente** e o mais adequado e o que ele deve fazer
4. O Agente escolhido **raciocina** usando o LLM e, se precisar, usa **Ferramentas**
5. O **Reflector** avalia se o resultado ficou bom
6. Se nao ficou bom, o ciclo continua. Se ficou, a resposta e entregue!

---

## 📁 Estrutura do Projeto

```
colabor-ai/
├── core/                     # 🔧 Nucleo da engine
│   ├── agent/                #   Classe base Agent + SubAgentRunner
│   ├── agents/               #   Agentes concretos + AgentRegistry
│   │   ├── planner.agent.ts      Planner (estrategia)
│   │   ├── assistant.agent.ts    Assistant (conversa geral)
│   │   ├── python.agent.ts       PythonAgent (codigo)
│   │   ├── browser.agent.ts      BrowserAgent (web)
│   │   ├── reflector.agent.ts    Reflector (qualidade)
│   │   ├── shell.agent.ts        ShellAgent (comandos)
│   │   ├── answer.agent.ts       AnswerAgent (respostas)
│   │   └── task-manager.agent.ts TaskManager (tarefas)
│   ├── orchestrator/         #   Loop principal + Telegram bot
│   ├── tools/                #   Sistema de ferramentas (12 tools)
│   ├── context/              #   ContextEngine (token budget)
│   ├── memory/               #   MemoryEngine (longo prazo)
│   ├── plan/                 #   PlanManager (multi-step)
│   ├── skills/               #   SkillsManager (skills .md)
│   ├── stream/               #   EventStream (async iterable)
│   ├── hooks/                #   HookSystem (7 pontos pipeline)
│   ├── permissions/          #   PermissionSystem (5 niveis)
│   ├── scheduler/            #   Scheduler (cron)
│   ├── tasks/                #   Background tasks + DreamTask
│   ├── session/              #   Transcript (JSONL)
│   ├── llm/                  #   LLM providers (DeepSeek/OpenAI)
│   ├── config/               #   Configuracao centralizada
│   ├── constants/            #   Instrucoes compartilhadas
│   └── utils/                #   Logger
├── cloud/                    # ☁️ Backend REST API
│   ├── src/
│   │   ├── server.ts             Express + WebSocket
│   │   ├── agents/               Agentes cloud
│   │   ├── orchestrator/         Orchestrator cloud
│   │   ├── context/              Context engine
│   │   ├── memory/               Memory engine
│   │   ├── protocol/             Tool protocol
│   │   └── routes/               Auth + Chat endpoints
│   └── __tests__/            #   Testes Jest
├── client/                   # 🖥️ Desktop app (Electron + React)
│   ├── electron/             #   Electron main/preload
│   └── src/                  #   React + Vite + TSX
├── skills/                   # 📚 Skills em Markdown
│   ├── communication.md
│   ├── python-dev.md
│   └── web-search.md
├── memory/                   # 🧠 Notas diarias
├── docs/                     # 📖 Documentacao
│   └── DOCUMENTACAO.html     #   Doc completa da arquitetura
├── MEMORY.md                 #   Memoria de longo prazo
├── package.json
└── tsconfig.json
```

---

## 🛠️ Tecnologias

| Stack | Tecnologias |
|-------|------------|
| **Linguagem** | TypeScript (ES2020, CommonJS) |
| **Runtime** | Node.js (tsx) |
| **LLM** | DeepSeek (deepseek-v4-flash) / OpenAI |
| **Canais** | Telegram Bot, Terminal, REST API |
| **Desktop** | Electron + React + Vite |
| **Testes** | Jest (30.x) |
| **Browser** | Puppeteer (Chromium headless) |
| **Agendamento** | node-cron |

---

## 🚀 Quick Start

### Pre-requisitos
- Node.js 18+
- .env configurado (veja `.env.example`)
- Token Telegram (para bot)

### Instalacao

```bash
git clone `<repo-url>`
cd colabor-ai
npm install
cp .env.example .env
# Edite .env com suas chaves
```

### Rodando

```bash
# Modo desenvolvimento (Telegram Bot)
npm run dev

# Build TypeScript
npm run build

# Testes
npm test
```

---

## 🔧 Ferramentas Disponiveis

| Ferramenta | Descricao |
|-----------|-----------|
| `execute_python` | Executa codigo Python e retorna stdout/stderr |
| `execute_shell` | Executa comandos shell do sistema |
| `browser_navigate` | Sequencia de acoes no browser (12 tipos) |
| `browser_action` | Acao unica no browser |
| `web_search` | Busca na web via DuckDuckGo |
| `spawn_agent` | Spawna sub-agentes especializados |
| `create_background_task` | Tarefa assincrona em background |
| `list_background_tasks` | Status das tarefas em background |
| `todo_write` | Gerenciamento de TODOs |
| `schedule_task` | Agendamento cron |
| `list_scheduled_tasks` | Lista tarefas agendadas |
| `memory_search` | Busca na memoria de longo prazo |

---

## 📚 Documentacao Completa

Veja a [documentacao completa da arquitetura](docs/DOCUMENTACAO.html) com detalhes de cada componente, fluxo de execucao, APIs e muito mais.

---

## 🤝 Contribuindo

Projeto open-source. Pull requests bem-vindos!

---

**Build Status:** ✅ Passando (ultimo build: 31/05/2026)
