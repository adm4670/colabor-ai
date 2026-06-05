# Sistema de Telemetria e Observabilidade
    
    ## Visao Geral
    
    Sistema de telemetria nao-intrusivo que instrumenta os pontos-chave do colabor-ai
    (orquestrador, agentes, LLM) para coletar metricas de uso e performance.
    
    ## O que e monitorado
    
    | Metrica | Onde | Como |
    |---------|------|------|
    | Tokens por chamada LLM | Agent.run() | Via `response.usage` da API OpenAI/DeepSeek |
    | Numero de chamadas de agentes | Orchestrator.run() | Tracking de dispatch de sub-agents |
    | Decisoes do Planner | Orchestrator.run() | Cada decisao JSON do planner |
    | Chamadas de Ferramentas | Agent.run() | Tool calls executadas |
    | Reflexoes | Orchestrator.run() | Resultados do ReflectorAgent |
    | Duracoes | Todos | Timestamps de inicio/fim |
    
    ## Arquivos
    
    - `core/telemetry/telemetry.ts` - Coletor principal (singleton)
    - `core/telemetry/telemetry-report.ts` - CLI para visualizar relatorios
    - `telemetry/` - Diretorio com relatorios JSON
    
    ## Modificacoes no codigo existente
    
    - `core/agent/agent.ts` - Adicionado tracking de tokens e tool calls
    - `core/orchestrator/orchestrator.ts` - Adicionado tracking de sessoes, agentes, planner
    - `core/orchestrator/telegram.ts` - Adicionados comandos /telemetry e /status
    
    ## Comandos
    
    ### Telegram
    - `/telemetry` - Exibe relatorio completo da ultima sessao
    - `/status` - Exibe metricas rapidas da sessao atual
    
    ### CLI
    npx tsx core/telemetry/telemetry-report.ts
    npx tsx core/telemetry/telemetry-report.ts <sessionId>
    
    ## Formato do Relatorio
    
    Os relatorios sao salvos como JSON em `telemetry/` com o nome:
    `session-<sessionId>-<timestamp>.json`
    
    Inclui:
    - Contagem e detalhamento de tokens por chamada LLM
    - Custo estimado (baseado em precos Deepseek)
    - Breakdown de agentes chamados
    - Breakdown de ferramentas utilizadas
    - Passos do planner e resultados de reflexao
    - Duracoes de cada etapa
    