# colabor-ai - Lightweight v2
    
    ## Sobre
    Versao enxuta e otimizada do colabor-ai, com foco no core funcional.
    Arquivos temporarios, logs, artefatos de build e analises foram removidos.
    
    ## Estrutura mantida
    colabor-ai/
      core/           - Codigo fonte principal (TypeScript)
      src/            - Codigo auxiliar (Python + TS)
      scripts/        - Scripts utilitarios
      skills/         - Definicoes de skills
      memory/         - Memorias persistentes
      logs/           - (vazio - gerado em runtime)
      package.json    - Dependencias
      tsconfig.json   - Config TypeScript
      README.md       - Documentacao original
    
    ## O que foi removido
    - coverage/       - Artefato de testes
    - dist/           - Build output (regeneravel)
    - temp/           - Arquivos temporarios
    - docs/           - Documentacao extra
    - interview/      - Arquivos de entrevista
    - logs/ antigos   - Logs de execucao anteriores
    - *.txt, *.json   - Analises temporarias na raiz
    
    ## Comandos
    npm install        - Instalar dependencias
    npm run build      - Compilar TypeScript
    npm test           - Rodar testes
    