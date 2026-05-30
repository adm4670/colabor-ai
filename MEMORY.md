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
