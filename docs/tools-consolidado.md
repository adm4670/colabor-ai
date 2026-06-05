# **Sistema de Ferramentas (Tools) - Documentacao Consolidada**

> **Data:** 2026-06-04
> **Arquivo:** `docs/tools-consolidado.md`
> **Objetivo:** Documentacao unica e completa de todas as ferramentas disponiveis no Colabor.AI, organizada por categorias.

---

## Indice

1. [Visao Geral](#1-visao-geral)
2. [Arquitetura do Sistema de Tools](#2-arquitetura)
   - [ToolRegistry](#21-toolregistry)
   - [ToolDefinition](#22-tooldefinition)
   - [ToolContext](#23-toolcontext)
   - [AgentTool (spawn_agent)](#24-agenttool-spawn_agent)
3. [Tools de Execucao de Codigo](#3-tools-de-execucao)
   - [pythonExecTool / execute_python](#31-execute_python)
   - [shellExecTool / execute_shell](#32-execute_shell)
4. [Tools de Navegacao Web (Browser)](#4-tools-de-browser)
   - [browserExecTool (Acoes Unicas)](#41-browserexectool)
   - [browserNavigateTool (Fluxos Multi-Passo)](#42-browsernavigatetool)
5. [Tools de Busca e Pesquisa](#5-tools-de-busca)
   - [WebSearchTool (DuckDuckGo)](#51-websearch)
   - [Tool-Search (Busca Interna)](#52-tool-search)
6. [Tools de Tarefas e Background](#6-tools-de-tarefas)
   - [taskCreateTool / create_background_task](#61-create_background_task)
   - [taskCancelTool / cancel_background_task](#62-cancel_background_task)
   - [taskListTool / list_background_tasks](#63-list_background_tasks)
   - [ScheduleTaskTool / schedule_task](#64-schedule_task)
   - [DeleteScheduledTaskTool / delete_scheduled_task](#65-delete_scheduled_task)
   - [ListScheduledTasksTool / list_scheduled_tasks](#66-list_scheduled_tasks)
7. [Tools de Produtividade](#7-tools-de-produtividade)
   - [TodoWriteTool / todo_write](#71-todo_write)
8. [Tools de Memoria](#8-tools-de-memoria)
9. [Comparacao com Claude-Code](#9-comparacao-claude-code)
10. [Instrucoes de Uso para Prompts](#10-instrucoes-para-prompts)

---

## 1. Visao Geral

O sistema de ferramentas do **Colabor.AI** e um framework modular e extensivel que permite aos agentes executarem acoes concretas: rodar codigo, navegar na web, gerenciar tarefas, buscar informacoes e muito mais.

| Caracteristica | Descricao |
|---|---|
| **Total de Tools** | **13 ferramentas unicas** |
| **Inspiracao** | Claude-Code, OpenClaw/Clawbot |
| **Motor** | TypeScript, Node.js |
| **Persistencia** | JSON em `.colabor-ai/` |
| **Scheduler** | Baseado em cron (node-cron) |
| **Sub-agentes** | 5 tipos: assistant, PythonAgent, browser, ShellAgent, WriterAgent |

---

## 2. Arquitetura

### 2.1 ToolRegistry

**Arquivo:** `core/tools/toolRegistry.ts`

O `ToolRegistry` e o **registro central** que mantem o mapa de todas as ferramentas registradas. Metodo importante: `getOpenAITools()` que converte todas as tools registradas no formato esperado pela API da OpenAI (`ChatCompletionTool[]`).

### 2.2 ToolDefinition

**Arquivo:** `core/tools/toolDefinition.ts`

Toda ferramenta segue esta interface:

- **name:** Nome unico usado pelo LLM
- **description:** Descricao para o LLM escolher a ferramenta
- **parameters:** Schema JSON dos parametros (type, properties, required)
- **execute(args, context):** Funcao assincrona que executa a ferramenta

### 2.3 ToolContext

Contexto passado para toda execucao de tool:

- **conversationId:** ID da conversa atual
- **userId:** ID do usuario (opcional)
- **agentName:** Nome do agente (opcional)
- **signal:** AbortSignal para cancelamento
- **cache:** Cache compartilhado entre tools

### 2.4 AgentTool (spawn_agent)

**Arquivo:** `core/tools/agentTool.ts`

Permite que o **agente principal delegue tarefas para sub-agentes especializados**, similar ao AgentTool do claude-code.

**Funcionamento:**
1. O agente principal invoca `spawn_agent` com uma instrucao detalhada
2. O AgentTool cria um **novo loop de conversa** (com seu proprio historico)
3. O sub-agente executa a tarefa usando suas proprias ferramentas
4. O resultado completo (incluindo todas as tool_calls intermediarias) e retornado

**Agentes disponiveis:**

| Nome | Especialidade | Tools disponiveis |
|---|---|---|
| assistant | Uso geral | Todas as tools |
| PythonAgent | Codigo/Matematica | execute_python |
| browser | Navegacao Web | browserExecTool, browserNavigateTool |
| ShellAgent | Comandos de sistema | execute_shell |
| WriterAgent | Geracao de texto | Nenhuma (apenas LLM) |

---

## 3. Tools de Execucao de Codigo

### 3.1 execute_python

**Arquivo:** `core/tools/pythonExecTool.ts`

**Descricao:** Executa codigo Python arbitratio e retorna stdout/stderr.

**Parametros:** `{ code: string }`
**Retorno:** `{ stdout: string, stderr: string, success: boolean }`

**Implementacao:**
1. Escreve o codigo em um arquivo temporario em `os.tmpdir()`
2. Executa com `python <arquivo>` via `child_process.exec`
3. Timeout configuravel via `PYTHON_TIMEOUT` env var (default: 30s)
4. Remove o arquivo temporario apos execucao

**Exemplo:**
```
execute_python(code: "print(2 + 2)")
// Resultado: { stdout: "4", stderr: "", success: true }
```

### 3.2 execute_shell

**Arquivo:** `core/tools/shellExecTool.ts`

**Descricao:** Executa comandos shell arbitrarios no servidor.

**Parametros:** `{ command: string, cwd?: string }`
**Retorno:** `{ success: boolean, stdout: string, stderr: string }`

**Seguranca:**
- Lista negra de comandos perigosos: `rm -rf /`, `shutdown`, `reboot`, fork bombs
- Timeout: 20s
- MaxBuffer: 1MB

---

## 4. Tools de Browser (Navegacao Web)

### 4.1 browserExecTool

**Arquivo:** `core/tools/browserExecTool.ts`

**Descricao:** Executa **uma unica acao** no navegador Puppeteer. Base para o `browserNavigateTool`.

**Acoes suportadas:**
- **navigate** -> Navegar para URL
- **click** -> Clicar em elemento (selector)
- **fill** -> Preencher campo (selector + value)
- **select** -> Selecionar opcao (selector + option)
- **wait** -> Aguardar (selector ou ms)
- **press** -> Pressionar tecla (key)
- **scroll** -> Rolar pagina (up/down)
- **screenshot** -> Capturar tela
- **extract** -> Extrair texto
- **evaluate** -> Executar JavaScript arbitratio
- **close** -> Fechar navegador

### 4.2 browserNavigateTool

**Arquivo:** `core/tools/browserNavigateTool.ts`

**Descricao:** Versao avancada que aceita um **array de steps** para executar fluxos completos.

**Parametro:** `{ url: string, steps: BrowserAction[], headless?: boolean }`

**Exemplo de fluxo:**
```typescript
{
    url: "https://example.com/login",
    steps: [
        { type: "fill", selector: "#username", value: "user" },
        { type: "fill", selector: "#password", value: "pass" },
        { type: "click", selector: "#login-btn" },
        { type: "wait", selector: ".dashboard" },
        { type: "extract", selector: ".welcome-message" },
        { type: "screenshot", name: "after-login" }
    ]
}
```

**Diferencas entre as duas ferramentas de browser:**

| Caracteristica | browserExecTool | browserNavigateTool |
|---|---|---|
| Acoes por chamada | 1 | Multiplas (steps array) |
| Util para | Acoes simples | Fluxos completos |
| Reentrancia | Mantem estado | Mantem estado |
| Screenshots | Sim | Sim |

---

## 5. Tools de Busca

### 5.1 WebSearchTool (web_search)

**Arquivo:** `core/tools/WebSearchTool.ts`

**Descricao:** Busca na web usando DuckDuckGo Instant Answer API (gratuita, sem chave de API).

**Parametros:** `{ query: string, maxResults?: number }`
**Retorno:** `SearchResult[]` com `{ title, snippet, url, source }`

**Implementacao:**
1. Tenta **DuckDuckGo Instant Answer API** primeiro (timeout: 5s)
2. Fallback para **scraping** da pagina de resultados do DuckDuckGo (timeout: 8s)

### 5.2 Tool-Search (Busca Interna)

**Arquivo:** `core/tools/tool-search.ts`

**Descricao:** Busca **entre as tools registradas** no `ToolRegistry`. Diferente de web_search que busca na internet.

---

## 6. Tools de Tarefas e Background

### 6.1 create_background_task

**Arquivo:** `core/tools/taskCreateTool.ts`

**Descricao:** Cria uma tarefa que roda em background **sem bloquear** a conversa principal.

**Parametros:** `{ description, instruction, agent?, delaySeconds? }`

**Casos de uso:**
- Operacoes longas (processamento de PDF, analise de dados)
- Checks periodicos (monitoramento de arquivos)
- Consolidacao de memoria
- Tarefas futuras (com delaySeconds)

### 6.2 cancel_background_task

**Arquivo:** `core/tools/taskCancelTool.ts`
**Parametros:** `{ id: string }`

### 6.3 list_background_tasks

**Arquivo:** `core/tools/taskListTool.ts`
**Retorno:** `{ tasks: Array<{id, description, status, createdAt}> }`

### 6.4 schedule_task

**Arquivo:** `core/tools/ScheduleTaskTool.ts`

**Descricao:** Agenda tarefas **recorrentes** usando expressoes cron.

**Parametros:** `{ name, cronExpression, description, instruction, agent?, enabled? }`

**Exemplos de expressoes cron:**

| Expressao | Significado |
|---|---|
| `0 * * * *` | A cada hora |
| `0 9 * * *` | Todo dia as 9:00 |
| `0 9 * * 1` | Toda segunda as 9:00 |
| `*/15 * * * *` | A cada 15 minutos |
| `0 0 1 * *` | Primeiro dia do mes a meia-noite |

### 6.5 delete_scheduled_task

**Parametros:** `{ name: string }`

### 6.6 list_scheduled_tasks

**Retorno:** `{ tasks: Array<{name, cronExpression, description, enabled}> }`

---

## 7. Tools de Produtividade

### 7.1 todo_write

**Arquivo:** `core/tools/TodoWriteTool.ts`

**Descricao:** Gerencia uma **lista de tarefas (TODOs)** durante a execucao de uma conversa.

**Parametros:** `{ action, title?, id?, status? }`

Actions: `"create" | "update" | "delete" | "list"`
Status: `"pending" | "in_progress" | "done"`

**Persistencia:** Salvo em `.colabor-ai/todos.json`

```json
{
    "id": "uuid",
    "title": "Descricao da tarefa",
    "status": "pending",
    "createdAt": "2026-06-04T...",
    "updatedAt": "2026-06-04T..."
}
```

---

## 8. Tools de Memoria

O sistema de memoria e implementado como **ferramenta extra** no prompt do agente:

- **memory_search(query, maxResults?)** -> Busca em MEMORY.md e notas diarias
- **memory_append(content, category?)** -> Adiciona informacoes a memoria

> **Nota:** O Context Engine (sumarizacao automatica com LLM) existe mas esta **incompleto** -- falta integracao completa com o fluxo de conversas.

---

## 9. Comparacao com Claude-Code

| Funcionalidade | Colabor.AI | Claude-Code |
|---|---|---|
| Execucao Python | execute_python | execute_python |
| Execucao Shell | execute_shell (unico) | cmdExecTool + shellExecTool |
| Web Search | web_search | web_search |
| TODO List | todo_write | todo_write |
| Tasks/BG | create_background_task | tasks |
| Scheduler (Cron) | schedule_task | cron_create |
| Sub-agentes | spawn_agent | agent |
| Browser/Navegacao | browserNavigateTool (multi-step) | Nao tem |
| Permissoes | Basica (blocklist) | Sistema completo de aprovacao |
| Context Engine | Parcial | Completo (sumarizacao automatica) |

---

## 10. Instrucoes de Uso para Prompts

### Versao resumida (para agents em geral):

```
Ferramentas disponiveis:
- execute_python: Execute Python code and return stdout/stderr
- memory_search: Busca informacoes na memoria de longo prazo (MEMORY.md e notas diarias)
- spawn_agent: Spawn a sub-agent to handle a specific task.
  Available agents: assistant, PythonAgent, browser, ShellAgent, WriterAgent.
- create_background_task: Schedule a task to run in the background without blocking.
- list_background_tasks: List all background tasks and their statuses.
- todo_write: Manage an internal task list (TODOs).
- web_search: Search the web using DuckDuckGo.
- schedule_task: Schedule a recurring task using cron expressions.
- list_scheduled_tasks: List all scheduled (cron) tasks.
- cancel_background_task: Cancel a pending or running background task.
- delete_scheduled_task: Remove a previously scheduled cron task.
```

---

## Arquivos no Sistema de Tools

```
core/tools/
  toolDefinition.ts          - Interfaces base (ToolDefinition, ToolContext)
  toolRegistry.ts            - Registro central de ferramentas
  agentTool.ts               - spawn_agent (delegacao para sub-agentes)
  pythonExecTool.ts          - execute_python
  shellExecTool.ts           - execute_shell
  browserExecTool.ts         - Acoes unicas no navegador
  browserNavigateTool.ts     - Fluxos multi-passo no navegador
  WebSearchTool.ts           - web_search (DuckDuckGo)
  TodoWriteTool.ts           - todo_write
  taskCreateTool.ts          - create_background_task
  taskCancelTool.ts          - cancel_background_task
  taskListTool.ts            - list_background_tasks
  ScheduleTaskTool.ts        - schedule_task + delete/list variants
  tool-search.ts             - Busca interna de ferramentas
  toolRegistry.spec.ts       - Testes unitarios do registry
```

---

## Fluxo de Execucao Tipico

```
Usuario envia mensagem
    |
    v
Agente (LLM) recebe mensagem + lista de tools
    |
    v
LLM decide chamar uma tool (ex: execute_python)
    |
    v
Sistema identifica a tool via ToolRegistry
    |
    v
Tool e executada com os parametros fornecidos
    |
    v
Resultado e retornado ao LLM
    |
    v
LLM processa resultado e gera resposta final
    |
    v
Resposta retorna ao usuario
```

---

*Documentacao gerada em 2026-06-04. Qualquer alteracao no diretorio `core/tools/` deve atualizar este documento.*