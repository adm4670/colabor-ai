# colabor-ai Cloud Backend
    
    > O cerebro do assistente. Pensa, decide e coordena tudo. O app so mostra o resultado.
    
    ---
    
    ## O que e isso?
    
    Imagine um **carro autonomo**: voce ve o volante girar, mas quem dirige e um computador. Aqui e igual:
    - O **app no Windows** e o carro (voce ve a conversa na tela)
    - O **cloud** e o motorista (pensa, decide, coordena)
    - As **ferramentas locais** sao as maos (mexem nos seus arquivos de verdade)
    
    ```
      Voce digita: "organize meus downloads"
           |
           v
      [App Windows] ---> [Cloud Backend] ---> [DeepSeek IA]
                               |
                         "Vou usar o agente file_system"
                               |
                         [Seu PC] executa e organiza
                               |
           v
      Resposta: "Pronto! 42 arquivos organizados em 3 pastas"
    ```
    
    ---
    
    ## Instalacao (3 passos)
    
    ### 1. Instalar dependencias
    ```bash
    cd cloud
    npm install
    ```
    
    ### 2. Configurar a chave da IA
    ```bash
    cp .env.example .env
    # Edite .env e coloque sua chave:
    # DEEPSEEK_API_KEY=sk-sua-chave-aqui
    ```
    
    ### 3. Rodar
    ```bash
    npm run dev
    # Servidor inicia em http://localhost:3001
    ```
    
    ---
    
    ## Comandos
    
    | Comando | O que faz |
    |---------|-----------|
    | `npm run dev` | Inicia o servidor em modo desenvolvimento |
    | `npm run build` | Compila o TypeScript |
    | `npm test` | Roda os 42 testes automatizados |
    | `npm run lint` | Verifica se o codigo esta bem escrito |
    | `npm run format` | Formata o codigo automaticamente |
    | `npm run docs` | Gera documentacao tecnica (TypeDoc) |
    
    ---
    
    ## Como funciona (explicacao simples)
    
    ### O Orchestrator (o maestro)
    
    O Orchestrator e como um **maestro de orquestra**. Quando voce manda uma mensagem, ele:
    1. Le o que voce escreveu
    2. Decide qual musico (agente) vai tocar
    3. Passa a instrucao e espera o resultado
    4. Se nao ficou bom, pede pra tocar de novo
    
    ### Os Agentes (os musicos)
    
    Cada agente sabe fazer uma coisa muito bem:
    
    | Agente | Especialidade | Onde roda |
    |--------|--------------|-----------|
    | Planner | Decide quem vai trabalhar | Nuvem |
    | Python | Faz contas e analisa dados | Nuvem |
    | Assistant | Conversa e explica coisas | Nuvem |
    | File System | Mexe em arquivos e pastas | Seu PC |
    | Shell | Roda comandos no terminal | Seu PC |
    | Desktop | Print, clipboard, processos | Seu PC |
    
    ### A Memoria (o cerebro)
    
    O sistema tem dois tipos de memoria, como uma pessoa:
    
    - **Curto prazo**: a conversa atual. Quando fica muito longa, o sistema faz um resumo inteligente (como voce anotando os pontos importantes de uma reuniao)
    - **Longo prazo**: fatos que nunca esquece. Salvos em arquivos para consultas futuras
    
    ---
    
    ## Estrutura de pastas
    
    ```
    cloud/
      src/
        server.ts              # O coracao: inicia o servidor
        orchestrator/           # O maestro: coordena os agentes
        agents/                 # Os musicos: cada um faz uma coisa
        context/                # A memoria: gerencia o historico
        memory/                 # O arquivo: busca e salva fatos
        protocol/               # A lingua: como cloud e app conversam
        routes/                 # As portas: por onde chegam as mensagens
      __tests__/                # Os exames: 42 testes que validam tudo
      docs/                     # Documentacao bonita (HTML com Tailwind)
    ```
    
    ---
    
    ## Variaveis de ambiente (.env)
    
    So uma e obrigatoria. O resto tem valor padrao.
    
    | Variavel | Para que serve | Padrao |
    |----------|---------------|--------|
    | `DEEPSEEK_API_KEY` | Chave da IA (obrigatoria!) | - |
    | `PORT` | Porta do servidor | 3001 |
    | `JWT_SECRET` | Chave de seguranca | (valor padrao) |
    | `TOOL_TIMEOUT_MS` | Tempo maximo para ferramentas | 60000 (1 min) |
    
    ---
    
    ## Documentacao visual
    
    Abra `docs/index.html` no navegador para ver uma pagina bonita explicando tudo com desenhos e cores.
    
    > "Qualquer tecnologia suficientemente avancada e indistinguivel de magia." — Arthur C. Clarke
    
    Aqui a gente explica a magica.
    