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
    - **PythonAgent**: Executa codigo Python
    - **BrowserAgent**: Automacao web (navegar, clicar, screenshots)
    - **ShellAgent**: Comandos shell (npm, git, fs)
    - **TaskManagerAgent**: CRUD de tarefas
    - **AnswerAgent**: Formata resposta final (WriterAgent)
    
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
    
    
    ## Alteracoes Realizadas (09/03/2026)
    - **Corrigido erro "Agent not found: ShellAgent"**: Adicionado `shellAgent` na lista de subAgents do `core/orchestrator/main.ts`
    - **Criado `core/constants/instructions.ts`**: Arquivo com `CORE_INSTRUCTIONS` e `FORMAT_RESPONSE_JSON` para centralizar instrucoes compartilhadas entre agentes
    - **Refatorado `planner.agent.ts`**: Substituido bloco de identidade duplicado por import de `CORE_INSTRUCTIONS`
    - **Refatorado `orchestrator/main.ts`**: Substituido bloco de identidade duplicado por import de `CORE_INSTRUCTIONS`
    - **Atualizados agentes**: Todos os agentes agora importam `CORE_INSTRUCTIONS` como prefixo em suas `generalInstructions`
    - **Removido `core/tools/cmdExecTool.ts`**: Arquivo duplicado do `shellExecTool.ts` (nao era importado por nenhum outro arquivo)
    
## Fatos
- [2026-05-29] tínhamos conversado antes, e na época eu não encontrei nenhum registro de conversas anteriores substanciais

## Preferencias
- [2026-05-29] que eu comece a implementar alguma das melhorias?** Posso atacar os problemas por prioridade — começando pelos críticos

## Preferencias
- [2026-05-29] revisar algum arquivo específico?

## Preferencias
- [2026-05-29] - `src/tools/manageObjectivesTool

## Aprendizados
- [2026-05-29] - `src/telegram/bot

## Preferencias
- [2026-05-29] Confirme que a variável `MONGO_URI` está configurada no painel do Render (*Environment → Environment Variables*)
- [2026-05-29] A *Shell* é mais segura pra testar, a *automática* é melhor pra produção 🚀

## Preferencias
- [2026-05-29] ajustar algo no design? Posso mexer nas cores, textos, seções ou adicionar animações novas 😊

## Aprendizados
- [2026-05-29] - *Relatório semanal de procrastinação:* quantas tarefas adiadas, quantas concluídas, padrões (ex: "você sempre adia reuniões às segundas")

## Aprendizados
- [2026-05-30] 🚀 Próximo passo: 22h14, já era
- [2026-05-30] 🚀 Próximo passo: 22h15

## Fatos
- [2026-05-30] rebuild + deploy para ativar tudo

## Preferencias
- [2026-05-30] - `src/agents/profileExtractor
- [2026-05-30] objetivos, etc

## Aprendizados
- [2026-05-30] Quer se aprofundar em algum desses tópicos ou ver algo mais específico?

## Preferencias
- [2026-05-30] revisar algum ponto antes?

## Fatos
- [2026-05-30] você achar importantes

## Preferencias
- [2026-05-30] - **Integração com action4

## Preferencias
- [2026-05-30] discutir algum detalhe da arquitetura primeiro?

## Preferencias
- [2026-05-30] começar já pela implementação da base?

## Preferencias
- [2026-05-30] testar o que já está no ar?

## Preferencias
- [2026-05-30] falar de outra coisa?

## Preferencias
- [2026-05-30] algo diferente 😊

## Preferencias
- [2026-05-30] fazer algum ajuste no conteúdo?

## Preferencias
- [2026-05-30] - *A)* Commitar só o `memory/` + adicionar os artefatos ao `

## Preferencias
- [2026-05-31] iniciar por outra? Posso começar a implementar imediatamente

## Aprendizados
- [2026-05-31] O `claude-code` tem uma arquitetura **muito mais modular e robusta** para ferramentas, interface de terminal e gerenciamento de permissões

## Preferencias
- [2026-05-31] revisar algo antes?

## Aprendizados
- [2026-05-31] Se algo der errado, ele revisa o plano dinamicamente em vez de travar
- [2026-05-31] Quer que eu já faça o push ou prefere revisar algo antes?

## Preferencias
- [2026-05-31] testar o que já foi feito primeiro?

## Preferencias
- [2026-05-31] revisar algo?

## Preferencias
- [2026-05-31] fazer outra coisa?

## Preferencias
- [2026-06-01] Listados os 15 commits mais recentes do repositório `colabor-ai`

## Decisoes
- [2026-06-01] Qual caminho prefere?

## Preferencias
- [2026-06-01] continuar na `main`?

## Preferencias
- [2026-06-01] revisar o que mudou antes?

## Preferencias
- [2026-06-01] Me fala aí que eu resolvo rapidinho

## Preferencias
- [2026-06-01] que eu busque o resumo das notícias de PE direto aqui?


# Correcoes

## 2026-06-01 - Bug: Background tasks falhando com erro 400 (tool_calls mismatch)
    
    **Problema:** Tarefas agendadas via `create_background_task` falhavam com erro:
    ```
    BadRequestError: 400 An assistant message with 'tool_calls' must be followed 
    by tool messages responding to each 'tool_call_id'.
    ```
    
    **Causa raiz:** No `agent.ts` (método `run()`), o código adicionava TODOS os `tool_calls` 
    retornados pela API ao histórico do assistente, mas no loop de processamento pulava 
    tool_calls com `type !== "function"` via `continue`, sem adicionar tool messages 
    correspondentes. Isso criava um mismatch: o assistant message referenciava tool_call_ids 
    que não tinham tool messages no histórico.
    
    **Correção:** 
    1. Filtrar apenas `function` calls antes de adicionar ao `assistantEntry.tool_calls`
    2. Se após o filtro não houver tool_calls, tratar como resposta final
    3. Iterar apenas sobre os function calls filtrados (removido o `continue` desnecessário)
    
    **Arquivo modificado:** `core/agent/agent.ts`
    
## Preferencias
- [2026-06-01] falar sobre outra coisa?

## Preferencias
- [2026-06-01] falar sobre outra coisa hoje?

## Preferencias
- [2026-06-01] fazer manualmente? 👍

## Preferencias
- [2026-06-01] começar algo novo?

## Preferencias
- [2026-06-02] seguir com outra coisa?

## Preferencias
- [2026-06-02] o `item_XX

## Preferencias
- [2026-06-02] discutir os detalhes de integração com o LLM primeiro?

## Preferencias
- [2026-06-02] revisar algo do código?

## Preferencias
- [2026-06-02] testar algo antes?

## Preferencias
- [2026-06-02] tratar de outro assunto?

## Preferencias
- [2026-06-02] tratar de outra coisa no projeto?

## Fatos
- [2026-06-02] o dataset vai crescer naturalmente

## Extracoes Automaticas
- [2026-06-02] 
## Extracoes Automaticas (2026-06-02)
- [2026-06-02] **Preferencia**: - Não aparece no `requirements
- [2026-06-02] **Preferencia** [analise]: Conversa: analise o processar_provas
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
- [2026-06-01] **Preferencia**: Resultado: ✅ Tudo pronto
- [2026-06-01] **Preferencia**: O trabalho de *reescrita do logging* foi concluído com sucesso
- [2026-06-01] **Fato** [🚀-flash-(mais-rápido-e-barato)]: 🚀 Flash (mais rápido e barato)
- [2026-06-01] **Fato** [📁-arquivos-que-referenciam-o-model]: 📁 Arquivos que referenciam o model
- [2026-06-01] **Fato** [📁-arquivos-que-hoje-usam-`deepseek-v4-pro`]: 📁 Arquivos que HOJE usam `deepseek-v4-pro`
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
- [2026-05-28] **Fato** [1.-sumarização-automática-(compaction-com-llm)]: 1. Sumarização automática (Compaction com LLM)
- [2026-05-28] **Fato** [✅-context-engine---**implementado,-mas-incompleto**]: ✅ Context Engine - **Implementado, mas incompleto**
- [2026-05-28] **Fato** [1️⃣-context-engine-incompleto]: 1️⃣ Context Engine incompleto
- [2026-05-28] **Fato** [🚨-prioridade-imediata-(baixo-esforço,-alto-impacto)]: 🚨 Prioridade Imediata (baixo esforço, alto impacto)
- [2026-05-28] **Fato** [1.-model-failover-(`src/agents/model-fallback.ts`-—-50.713-chars)]: 1. MODEL FAILOVER (`src/agents/model-fallback.ts` — 50.713 chars)
- [2026-05-28] **Fato** [1.-criar-a-pasta-e-iniciar-o-projeto]: 1. Criar a pasta e iniciar o projeto
- [2026-05-28] **Fato** [✅-servidor-ativo-em-http://localhost:3000]: ✅ Servidor ativo em http://localhost:3000


## Consolidacao Automatica
- [2026-06-02] ## Consolidacao Automatica - 2026-06-02

- 77 memorias extraidas de notas diarias
- 75 novas memorias adicionadas ao MEMORY.md
- 2 duplicatas ignoradas


## Fatos
- [2026-06-02] rodar, confirme que as variáveis de ambiente `DEEPSEEK_API_KEY` e `GEMINI_API_KEY` estão definidas e que os pacotes do `requirements` foram instalados

## Preferencias
- [2026-06-03] fazer mais algum ajuste?
