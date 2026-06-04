# MEMORY.md - Memória de Longo Prazo

Este arquivo armazena fatos duradouros, preferências, decisões e aprendizados que devem ser preservados entre sessões.

---

## Sobre o Projeto
- **Nome:** colabor-ai
- **Descrição:** Plataforma multi-agente com orquestrador inteligente
- **Stack:** Node.js, TypeScript, OpenAI API, DeepSeek API
- **Arquitetura:** Planner-Worker (orquestrador decide qual agente executar)
- **Repositório:** `C:\Developer\colabor-ai\`

## Agentes Disponíveis
| Agente | Função |
|---|---|
| **PlannerAgent** | Decide qual agente executar (cérebro do sistema) |
| **AssistantAgent** | Conversa geral, perguntas simples |
| **PythonAgent** | Executa código Python |
| **BrowserAgent** | Automação web (Playwright — navegar, clicar, screenshots) |
| **ShellAgent** | Comandos shell (npm, git, fs) |
| **TaskManagerAgent** | CRUD de tarefas |
| **AnswerAgent** | Formata resposta final (WriterAgent) |

## Preferências do Usuário
- Respostas em **PT-BR**
- Seja claro, direto
- Evite "filler phrases" corporativas ("Great question!", "I'd be happy to help")
- Tenha opiniões — não seja um robô corporativo

---

## Decisões de Arquitetura
- **2025:** Adotado padrão Planner-Worker
- **2025:** Adicionado suporte a Telegram via polling
- **2026:** Iniciada migração para session transcript em JSONL
- **2026:** Adicionado EventStream para streaming de eventos
- **2026-05-31:** Criada branch `lightweight` para simplificação do projeto
- **2026-05-30:** Sistema de **fallback/retry inteligente** implementado (`src/agents/model-fallback.ts`)
- **2026-05-29:** Criado `core/agents/reflector.agent.ts` (novo agente)
- **2026-05-28:** Context Engine implementado, mas **incompleto** (sumarização com LLM via compaction)

---

## Correções

### 2026-06-01 — Bug: Background tasks com erro 400 (tool_calls mismatch)
- **Problema:** Tarefas agendadas falhavam com `BadRequestError: 400 — assistant message with 'tool_calls' must be followed by tool messages...`
- **Causa:** `agent.ts` adicionava todos os `tool_calls` ao histórico, mas pulava os que tinham `type !== "function"` sem adicionar tool messages
- **Solução:** Filtrar apenas `function` calls antes de adicionar ao histórico e remover `continue` desnecessário
- **Arquivo:** `core/agent/agent.ts`

### 2026-06-02 — Bugs diversos corrigidos
- Diagnóstico e correção do erro `Erro ao interpretar resposta do planner`
- Limpeza de 19 arquivos + 1 diretório removidos da raiz do projeto

---

## Alterações Realizadas (09/03/2026)
- Corrigido erro **"Agent not found: ShellAgent"**: adicionado `shellAgent` na lista de subAgents do `core/orchestrator/main.ts`
- Criado `core/constants/instructions.ts`: centraliza `CORE_INSTRUCTIONS` e `FORMAT_RESPONSE_JSON`
- Refatorados `planner.agent.ts` e `orchestrator/main.ts` para importar `CORE_INSTRUCTIONS`
- Todos agentes agora usam `CORE_INSTRUCTIONS` como prefixo em suas `generalInstructions`
- Removido `core/tools/cmdExecTool.ts` (duplicado do `shellExecTool.ts`, não importado por ninguém)

---

## Fatos
- O dataset de provas (ENEM) vai crescer naturalmente — não precisa gerar dados sintéticos
- Context Engine está implementado mas **incompleto** (sumarização automática com LLM funciona mas falta integração completa)
- Sistema de fallback/retry com DeepSeek + Gemini está funcional
- Branch `lightweight` existe para experimentos de simplificação

## Aprendizados
- `claude-code` tem arquitetura muito mais modular e robusta para ferramentas, interface de terminal e gerenciamento de permissões — serve como referência
- Se algo der errado, revisar o plano dinamicamente é melhor que travar (padrão de replanning do Claude)
- Tarefas agendadas em background precisam de tratamento cuidadoso

## Arquitetura de Sub-Agentes

### SubAgentRunner (`core/agent/sub-agent-runner.ts`)

**Proposito:** Permite que o agente principal dispare sub-agentes para delegar tarefas, inspirado no AgentTool do claude-code.

### Caracteristicas principais

1. **Sub-agentes limpos** — cada sub-agente recebe um contexto novo com sua propria instrucao
2. **Execucao paralela** — multiplos sub-agentes podem rodar simultaneamente (max. 5)
3. **Selecao de agente** — escolhe o agente especializado ou usa o padrao "assistant"

### Arquitetura

- **Classe:** `SubAgentRunner` com `maxParallel` (padrao 5) e `defaultAgentName` (padrao "assistant") no construtor
- **Singleton:** acessado via `getSubAgentRunner()`

### Metodos

| Metodo | Descricao |
|--------|-----------|
| `runSingle(task)` | Executa uma tarefa em um sub-agente. Recebe `{ instruction, agentName?, taskId }`. Retorna `{ taskId, agentName, result, success, error?, durationMs }` |
| `runBatch(tasks)` | Processa multiplas tarefas em lotes respeitando `maxParallel`. Usa `Promise.all` para paralelismo |
| `formatResultsForContext(results)` | Formata os resultados para o contexto do agente principal |

### Fluxo do `runSingle`

1. Busca o agente no `agentRegistry` (`core/agents/agent-registry.ts`)
2. O registry tenta: correspondencia exata -> case-insensitive -> fuzzy/substring -> prefix-stripped (remove sufixo "Agent")
3. Se encontrado: chama `agent.run(instruction)` e retorna o resultado
4. Se nao encontrado: retorna erro com lista de agentes disponiveis
5. **Detecao de loop:** contador estatico `SubAgentRunner.currentDepth`, profundidade maxima = 3

### Agentes Registrados (`agentRegistry`)

| Nome | Descricao | Uso |
|------|-----------|-----|
| assistant | Conversa geral, perguntas, explicacoes | conversas, saudacoes, perguntas gerais |
| PythonAgent | Execucao de Python | calculos, analise de dados, codigo, scripts |
| browser | Navegacao web e automacao | web, internet, scraping |
| ShellAgent | Execucao de comandos shell | npm, git, arquivos, sistema |
| answer | (registrado) | — |
| reflector | (registrado) | — |
| task-manager | (registrado) | — |

### Detalhes do AgentRegistry

- Singleton: `export const agentRegistry = new AgentRegistry()`
- Cada agente se registra via `agentRegistry.register({...})` ao final de seu arquivo
- Metodo `find(name)` tenta:
1. Correspondencia exata
2. Case-insensitive
3. Parcial/fuzzy substring
4. Prefix-stripped (remove sufixo "Agent")

### Limite de profundidade

- Contador estatico: `SubAgentRunner.currentDepth`
- Profundidade maxima: **3** (evita loops infinitos)
- Mensagem de erro se excedido: _"Max spawn depth exceeded"_