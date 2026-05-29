# colabor-ai-core

Motor principal e runtime de orquestracao do **colabor.ai** — uma plataforma para criar e executar **agentes de IA que colaboram para resolver tarefas**.

---

## Arquitetura (Planner-Worker)

```
Usuario -> CLI / Telegram -> AgentOrchestrator
  -> PlannerAgent (decide agente)
  -> Agente Especializado (executa)
  -> ReflectorAgent (avalia)
  -> WriterAgent (formata resposta)
```

---

## Estrutura do Projeto

```
core/
  agent/          # Classe Agent (LLM + tools)
  agents/         # Agentes especializados
    agent-registry.ts     # Catalogo centralizado
    planner.agent.ts      # Decide agente
    assistant.agent.ts    # Conversa geral
    answer.agent.ts       # Resposta final (WriterAgent)
    python.agent.ts       # Execucao Python
    shell.agent.ts        # Comandos shell
    browser.agent.ts      # Navegacao web (Puppeteer)
    reflector.agent.ts    # Avaliacao de resultados
    task-manager.agent.ts # CRUD tarefas
  config/         # Configuracao centralizada
  constants/      # Instrucoes compartilhadas
  context/        # ContextEngine (tokens, sumarizacao)
  llm/            # Provider Factory (OpenAI/DeepSeek)
  memory/         # MemoryEngine (busca, consolidacao)
  orchestrator/   # AgentOrchestrator + entry points
  session/        # Persistencia JSONL
  skills/         # SkillsManager
  stream/         # EventStream
  tools/          # shell, python, browser tools
  types.ts        # Tipos centralizados
  utils/          # Logger
skills/           # Skills markdown
memory/           # Notas diarias
MEMORY.md         # Memoria de longo prazo
```

---

## Agentes

| Agente | Funcao |
|--------|--------|
| PlannerAgent | Decide qual agente executar |
| assistant | Conversa geral e explicacoes |
| PythonAgent | Executa codigo Python |
| ShellAgent | Comandos shell (npm, git, fs) |
| browser | Navegacao web (Puppeteer) |
| WriterAgent | Formata resposta final |
| ReflectorAgent | Avalia qualidade dos resultados |
| task_manager | CRUD de tarefas |

---

## Instalacao

```bash
git clone https://github.com/colabor-ai/colabor-ai-core.git
cd colabor-ai-core
npm install
cp .env.example .env
```

## Scripts

| Script | Descricao |
|--------|-----------|
| npm test | Rodar testes |
| npm run start:dev | Orquestrador CLI |
| npm run start:dev:orchestrator:telegram | Bot Telegram |
| npm run build | Compilar TypeScript |
| npm run lint | Lint + fix |
| npm run format | Prettier |

---

## Canais

- CLI: npm run start:dev
- Telegram: npm run start:dev:orchestrator:telegram
- REST API (planejado)
- WhatsApp (planejado)

---

## Licenca

MIT
