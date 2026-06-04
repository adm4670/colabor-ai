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
## Extracoes Automaticas
- [2026-06-04] 
## Extracoes Automaticas (2026-06-04)
- [2026-06-04] **Fato** [step-1-✅-—-correções-identificadas]: Step 1 ✅ — Correções identificadas
- [2026-06-04] **Fato** [o-que-foi-feito:]: O que foi feito:
- [2026-06-03] **Fato** [1.-limpeza-a]: 1. Limpeza a
- [2026-06-02] **Preferencia**: - Não aparece no `requirements
- [2026-06-02] **Preferencia** [analise]: Conversa: analise o processar_provas
- [2026-06-02] **Preferencia**: Resultado: ## O que sei sobre a **Clareia
- [2026-06-02] **Fato** [etapa-1:-pré-processamento-com-pymupdf]: Etapa 1: Pré-processamento com PyMuPDF
- [2026-06-02] **Fato** [📊-resumo-dos-4-erros]: 📊 Resumo dos 4 erros
- [2026-06-02] **Fato** [resumo-das-alterações:]: Resumo das alterações:
- [2026-06-02] **Fato** [script-criado:-`processar_provas_auto.py`]: Script criado: `processar_provas_auto.py`
- [2026-06-02] **Fato** [resultado-do-teste-(enem-2013-d1-azul):]: Resultado do teste (ENEM 2013 D1 AZUL):
- [2026-06-02] **Fato** [1.-abra-o-terminal-e-navegue-até-o-projeto:]: 1. Abra o terminal e navegue até o projeto:
- [2026-06-02] **Fato** [2.-ative-o-ambiente-virtual:]: 2. Ative o ambiente virtual:
- [2026-06-02] **Fato** [3.-execute-o-script:]: 3. Execute o script:
- [2026-06-02] **Fato** [✅-a-ideia-do-yolo-é-excelente,-mas...]: ✅ A ideia do YOLO é excelente, mas...
- [2026-06-02] **Fato** [🧩-visão-clareia.ai-↔-projeto-atual]: 🧩 Visão Clareia.ai ↔ Projeto atual
- [2026-06-02] **Fato** [o-que-mudou]: O que mudou
- [2026-06-02] **Fato** [limpeza-concluida-—-19-arquivos-+-1-diretorio-removidos-da-raiz]: Limpeza concluida — 19 arquivos + 1 diretorio removidos da raiz
- [2026-06-02] **Fato** [limpeza-final-concluida]: Limpeza final concluida
- [2026-06-02] **Fato** [resumo-das-alteracoes]: Resumo das alteracoes
- [2026-06-02] **Fato** [diagnostico-do-erro]: Diagnostico do erro
- [2026-06-02] **Fato** [resumo-do-que-ficou-pronto-hoje:]: Resumo do que ficou pronto hoje:
- [2026-06-02] **Fato** [🎯-visão-geral]: 🎯 Visão Geral
- [2026-06-02] **Fato** [🔴-o-erro-`erro-ao-interpretar-resposta-do-planner`]: 🔴 O erro `Erro ao interpretar resposta do planner`
- [2026-06-02] **Fato** [resumo-das-correções-de-hoje]: Resumo das correções de hoje
- [2026-06-01] **Preferencia**: Resultado: ✅ Tudo pronto
- [2026-06-01] **Preferencia**: O trabalho de *reescrita do logging* foi concluído com sucesso
- [2026-06-01] **Fato** [🚀-flash-(mais-rápido-e-barato)]: 🚀 Flash (mais rápido e barato)
- [2026-06-01] **Fato** [📁-arquivos-que-referenciam-o-model]: 📁 Arquivos que referenciam o model
- [2026-06-01] **Fato** [📁-arquivos-que-hoje-usam-`deepseek-v4-flash`]: 📁 Arquivos que HOJE usam `deepseek-v4-flash`
- [2026-06-01] **Fato** [⚙️-lógica]: ⚙️ Lógica
- [2026-06-01] **Fato** [📁-7-arquivos-alterados]: 📁 7 arquivos alterados
- [2026-06-01] **Fato** [🔍-causa-mais-provável]: 🔍 Causa mais provável
- [2026-06-01] **Fato** [📊-resumo-do-commit]: 📊 Resumo do commit
- [2026-06-01] **Fato** [📊-o-cenário-atual]: 📊 O cenário atual
- [2026-06-01] **Fato** [conteúdo-da-página:]: Conteúdo da página:
- [2026-06-01] **Fato** [🧬-o-que-é]: 🧬 O que é
- [2026-05-31] **Preferencia**: Resultado: Beleza
- [2026-05-31] **Decisao**: Resultado: ✅ Branch *lightweight* criada com sucesso
- [2026-05-31] **Aprendizado** [erro]: Conversa: Enviei novamente a resposta pois chegou apenas o erro pra mim: Ã¢ÂÅ’ Erro ao processar mensagem
- [2026-05-31] **Fato** [🔥-em-que-estamos-trabalhando]: 🔥 Em que estamos trabalhando
- [2026-05-31] **Fato** [📌-o-que-é]: 📌 O que é
- [2026-05-31] **Fato** [🧪-tecnologias]: 🧪 Tecnologias
- [2026-05-31] **Fato** [📊-métricas-do-código-atual]: 📊 Métricas do Código Atual
- [2026-05-31] **Fato** [o-que-está-bem-pensado]: O que está bem pensado
- [2026-05-31] **Fato** [typescript-(`npx-tsc---noemit`)]: TypeScript (`npx tsc --noEmit`)
- [2026-05-31] **Fato** [testes-(`npm-test`)]: Testes (`npm test`)
- [2026-05-31] **Fato** [scripts-do-`package.json`-—-antes-vs-depois]: Scripts do `package.json` — Antes vs Depois
- [2026-05-31] **Fato** [🔴-(a)-problemas-críticos]: 🔴 (A) Problemas Críticos
- [2026-05-31] **Fato** [arquivos/diretórios-removidos]: Arquivos/Diretórios removidos
- [2026-05-31] **Fato** [scripts-do-`package.json`]: Scripts do `package.json`
- [2026-05-31] **Fato** [`c:\developer\claude-code\`-—-estrutura]: `C:\Developer\claude-code\` — Estrutura
- [2026-05-31] **Fato** [o-que-a-página-contém:]: O que a página contém:
- [2026-05-31] **Fato** [🎯-propósitos:-não-são-concorrentes,-são-complementares]: 🎯 Propósitos: não são concorrentes, são complementares
- [2026-05-31] **Fato** [1.-engine:-playwright-+-browser-isolado]: 1. Engine: Playwright + Browser isolado
- [2026-05-31] **Fato** [o-que-mudou]: O que mudou
- [2026-05-31] **Fato** [🚨-segurança]: 🚨 Segurança
- [2026-05-31] **Fato** [arquivos-chave-do-sistema-de-agendamento]: Arquivos-chave do sistema de agendamento
- [2026-05-30] **Preferencia**: Resultado: ✅ *Build e commit concluídos
- [2026-05-30] **Preferencia**: Resultado: Posso te ajudar de várias formas
- [2026-05-30] **Fato** [📋-resumo-das-alterações]: 📋 Resumo das Alterações
- [2026-05-30] **Fato** [🧠-**responder-dúvidas-e-explicar-conceitos**]: 🧠 **Responder dúvidas e explicar conceitos**
- [2026-05-30] **Fato** [🔍-**buscar-informaçõ]: 🔍 **Buscar informaçõ
- [2026-05-30] **Fato** [📍-localização]: 📍 Localização
- [2026-05-30] **Fato** [1.-🔁-sistema-de-fallback-e-retry-inteligente]: 1. 🔁 Sistema de fallback e retry inteligente
- [2026-05-30] **Fato** [📊-status-atual-do-context-engine]: 📊 Status Atual do Context Engine
- [2026-05-30] **Fato** [o-que-é]: O que é
- [2026-05-30] **Fato** [posicionamento-na-arquitetura]: Posicionamento na Arquitetura
- [2026-05-30] **Fato** [📄-1.-documentação-do-projeto]: 📄 1. Documentação do Projeto
- [2026-05-30] **Fato** [💬-conversa-e-explicações]: 💬 Conversa e Explicações
- [2026-05-30] **Fato** [🌐-pesquisa-na-web]: 🌐 Pesquisa na Web
- [2026-05-29] **Fato**: tínhamos conversado antes, e na época eu não encontrei nenhum registro de conversas anteriores substanciais
- [2026-05-29] **Preferencia**: Resultado: Olá
- [2026-05-29] **Fato** [🟢-esforço-mínimo-(≤5-min-cada)]: 🟢 Esforço Mínimo (≤5 min cada)
- [2026-05-29] **Fato** [🧹-1.-limpeza-e-organização]: 🧹 1. Limpeza e Organização
- [2026-05-29] **Fato** [📊-análise-da-arquitetura-—-projeto-colabor-ai]: 📊 Análise da Arquitetura — Projeto colabor-ai
- [2026-05-29] **Fato** [📝-arquivo-criado]: 📝 Arquivo Criado
- [2026-05-29] **Fato** [`core/agents/reflector.agent.ts`-(novo)]: `core/agents/reflector.agent.ts` (novo)
- [2026-05-29] **Fato** [🎨-mudanças-realizadas-(apenas-css,-conteúdo-intacto)]: 🎨 Mudanças realizadas (apenas CSS, conteúdo intacto)
- [2026-05-29] **Fato** [🌓-tema-dual]: 🌓 Tema Dual
- [2026-05-29] **Fato** [🎨-badges-de-tecno]: 🎨 Badges de Tecno
- [2026-05-29] **Fato** [✅-fase-1-—-fundação:-**concluída**]: ✅ Fase 1 — Fundação: **CONCLUÍDA**
- [2026-05-29] **Fato** [📊-diagnóstico]: 📊 Diagnóstico


## Consolidacao Automatica
- [2026-06-04] ## Consolidacao Automatica - 2026-06-04

- 83 memorias extraidas de notas diarias
- 83 novas memorias adicionadas ao MEMORY.md
- 0 duplicatas ignoradas

