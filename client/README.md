# colabor-ai Client
    
    > O app que roda no seu Windows. A interface bonita que voce ve e usa.
    
    ---
    
    ## O que e isso?
    
    E o **aplicativo de mesa** do colabor-ai. Ele e instalado no seu PC e serve como:
    
    - **Tela** — onde voce digita e ve as respostas
    - **Maos** — executa acoes reais no Windows (mexer em arquivos, comandos, print da tela)
    - **Ponte** — conecta voce ao cerebro que fica na nuvem
    
    > O cerebro (quem pensa) fica no `cloud/`. Aqui e so o corpo.
    
    ```
      Voce digita no app
           |
           v
      [Electron] ---WebSocket---> [Cloud Backend] ---LLM---> [DeepSeek]
           |                            |
      Ferramentas locais          Pensa e decide
      (arquivos, shell,           o que fazer
       desktop, etc.)
    ```
    
    ---
    
    ## Instalacao (3 passos)
    
    ```bash
    cd client
    npm install
    npm run dev        # Abre no navegador (modo dev)
    ```
    
    Para rodar como app Electron:
    
    ```bash
    npm run electron:dev    # Abre janela do app
    ```
    
    ---
    
    ## Comandos
    
    | Comando | O que faz |
    |---------|-----------|
    | `npm run dev` | Abre no navegador (React + Vite) |
    | `npm run build` | Compila tudo |
    | `npm run electron:dev` | Abre como app Electron |
    | `npm run electron:build` | Gera instalador .exe |
    | `npm run lint` | Verifica qualidade do codigo |
    | `npm run format` | Formata o codigo |
    
    ---
    
    ## Ferramentas locais
    
    O app pode executar essas acoes no seu PC (sempre com sua confirmacao):
    
    | Ferramenta | O que faz |
    |-----------|-----------|
    | `read_file` | Le um arquivo |
    | `write_file` | Cria ou edita um arquivo |
    | `list_dir` | Lista arquivos de uma pasta |
    | `create_dir` | Cria uma pasta |
    | `delete_file` | Deleta um arquivo |
    | `run_cmd` | Executa comando no terminal |
    | `run_powershell` | Executa script PowerShell |
    | `get_env` | Le variaveis de ambiente |
    | `screenshot` | Tira print da tela |
    | `clipboard_get` | Le o que esta copiado |
    | `clipboard_set` | Copia texto |
    | `list_processes` | Lista programas abertos |
    | `list_windows` | Lista janelas abertas |
    
    ---
    
    ## Estrutura de pastas
    
    ```
    client/
      src/                  # Interface React
        components/         # Chat, botoes, etc
        styles/             # CSS
      electron/             # Codigo do app Electron
        agents/             # Ferramentas locais
          file-system.ts    # Mexe em arquivos
          shell.ts          # Roda comandos
          desktop.ts        # Print, clipboard
          tool-executor.ts  # Executor central
        main.ts             # Processo principal
        preload.ts          # Ponte segura com React
      electron-builder.yml  # Config do instalador
    ```
    
    ---
    
    ## Seguranca
    
    - Toda ferramenta perigosa (deletar arquivo, rodar comando) pede **confirmacao visual**
    - O codigo do cerebro NUNCA sai da nuvem
    - Comunicacao via WebSocket com **token JWT**
    - Auto-reconnect se a conexao cair
    