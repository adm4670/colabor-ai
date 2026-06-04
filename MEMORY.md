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
- Tarefas agendadas em background precisam de tratamento cuidadoso de tool_calls (ver correção 2026-06-01)

## Preferencias
- [2026-06-04] outra coisa?

## Preferencias
- [2026-06-04] Mantive apenas o conteúdo realmente útil e bem estruturado

## Aprendizados
- [2026-06-04] no `MEMORY

## Fatos
- [2026-06-04] acontece numa reunião palavra por palavra, e depois cortar páginas aleatórias quando o caderno fica grosso demais

## Preferencias
- [2026-06-04] fazer outra coisa?

## Preferencias
- [2026-06-04] fazer outra coisa? 😊

## Aprendizados
- [2026-06-04] | 6 | Modelo em `instructions

## Preferencias
- [2026-06-04] escolher outra prioridade da lista (ex: paralelismo DAG, otimização de prompts, etc
