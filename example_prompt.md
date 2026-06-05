# Template de Prompt Final — Arquitetura de Memória SOTA
    
    > **Proposito:** Template padronizado para montagem do prompt final enviado ao LLM
    > a cada passo de execucao. Os placeholders {{...}} sao preenchidos pelo sistema de
    > gerenciamento de memoria antes da chamada ao modelo.
    >
    > **Ordem de montagem:** (1) Sistema → (2) Memoria → (3) Instrucao → (4) Entrada
    >
    > **Ultima atualizacao:** 2026-06-05
    
    ---
    
    ## [BLOCO 1 — SISTEMA] (fixo, ~200 tokens)
    
    ```
    Voce e um agente autonomo de IA com um sistema de memoria multicamadas.
    Seu objetivo e executar tarefas de forma focada, mantendo contexto e plano ativo.
    
    Diretrizes:
    - Responda apenas com acoes concretas baseadas no contexto fornecido.
    - Nao invente memorias ou fatos que nao estao nos blocos abaixo.
    - Se a informacao for insuficiente, solicite esclarecimentos.
    - Prefira reutilizar planos bem-sucedidos (secao [PROCEDURAL MEMORY]).
    - Mantenha o foco no plano ativo (secao [ACTIVE PLAN]).
    - Apos responder, o sistema extraira novas memorias automaticamente.
    ```
    
    ---
    
    ## [BLOCO 2 — INSTRUCTION] (dinamico, ~100-300 tokens)
    
    ```
    ## Instrucao do Passo Atual
    
    {{current_instruction}}
    
    Comando: {{user_input}}
    ```
    
    > **Placeholders:**
    > - `{{current_instruction}}`: Instrucao macro do passo atual (ex: "Processar arquivo PDF e extrair questoes").
    > - `{{user_input}}`: Entrada bruta do usuario para este passo.
    
    ---
    
    ## [BLOCO 3 — WORKING MEMORY] (dinamico, ~200-6000 tokens)
    
    ```
    ## Working Memory (contexto imediato)
    
    Abaixo esta o conteudo filtrado da working memory — historico recente de acoes e observacoes.
    Itens mais recentes primeiro. Itens comprimidos sao marcados com [COMPRESSED].
    
    {{working_memory_context}}
    ```
    
    > **Placeholder:**
    > - `{{working_memory_context}}`: Lista dos itens mais relevantes da working memory apos
    >   pruning e compressao. Formato sugerido:
    >
    >   ```
    >   [WM-001] [IMPORTANCE: 0.85] Acao: extrair_questoes(pdf="enem_2023.pdf")
    >   [WM-002] [IMPORTANCE: 0.72] [COMPRESSED] Observacao: Encontradas 90 questoes, 45 exatas, 45 humanas
    >   [WM-003] [IMPORTANCE: 0.31] Observacao: Usuario solicitou filtro por "matematica"
    >   ```
    >
    >   Limite: ~6000 tokens (50% do orcamento total de 12K tokens).
    
    ---
    
    ## [BLOCO 4 — LONG-TERM MEMORY] (dinamico, ~200-4200 tokens)
    
    ```
    ## Long-Term Memory (conhecimento consolidado)
    ```
    
    ### 4.1 Memoria Episodica (top-5 experiencias similares)
    
    ```
    {{episodic_memories}}
    ```
    
    > **Placeholder:**
    > - `{{episodic_memories}}`: Até 5 registros recuperados via similaridade cosseno (FAISS).
    >   Formato sugerido:
    >
    >   ```
    >   [EP-001] [SIM: 0.87] [IMPORTANCE: 0.90] [AGE: 12 passos]
    >   Sumario: Usuario pediu para corrigir redacao. Estrategia usada: checklist 5 competencias.
    >   Resultado: Nota 920/1000. Lição: Sempre verificar competencia 1 (dominio da norma) primeiro.
    >
    >   [EP-002] [SIM: 0.65] [IMPORTANCE: 0.45] [AGE: 45 passos] [STALE]
    >   Sumario: Usuario pediu dicas de interpretacao de texto. Resposta foi generica demais.
    >   ```
    >
    >   Limite: ~2400 tokens (20% do orcamento).
    
    ### 4.2 Memoria Semantica (top-3 nos do grafo)
    
    ```
    {{semantic_knowledge}}
    ```
    
    > **Placeholder:**
    > - `{{semantic_knowledge}}`: Até 3 nos do grafo semantico com suas relacoes.
    >   Formato sugerido:
    >
    >   ```
    >   [SEM-001] No: "correcao_redacao_enem"
    >   Relacoes:
    >     - "competencias_enem" (peso: 0.92)
    >     - "checklist_5_competencias" (peso: 0.88)
    >     - "nota_maxima_1000" (peso: 0.75)
    >
    >   [SEM-002] No: "matematica_enem"
    >   Relacoes:
    >     - "probabilidade" (peso: 0.85)
    >     - "geometria" (peso: 0.80)
    >   ```
    >
    >   Limite: ~1200 tokens (10% do orcamento).
    
    ### 4.3 Memoria Procedural (top-2 planos reutilizaveis)
    
    ```
    {{procedural_actions}}
    ```
    
    > **Placeholder:**
    > - `{{procedural_actions}}`: Até 2 snippets de planos bem-sucedidos em contextos similares.
    >   Formato sugerido:
    >
    >   ```
    >   [PROC-001] [SUCCESS: 4/5] [SIM: 0.82]
    >   Contexto: "corrigir redacao ENEM"
    >   Plano:
    >     1. Extrair texto da redacao
    >     2. Avaliar competencia 1 (norma culta)
    >     3. Avaliar competencia 2 (tema proposto)
    >     4. Avaliar competencia 3 (argumentacao)
    >     5. Avaliar competencia 4 (coesao)
    >     6. Avaliar competencia 5 (proposta de intervencao)
    >     7. Calcular nota final (0-1000)
    >     8. Gerar feedback por competencia
    >   ```
    >
    >   Limite: ~600 tokens (5% do orcamento).
    
    ---
    
    ## [BLOCO 5 — ACTIVE PLAN] (dinamico, ~100-500 tokens)
    
    ```
    ## Plano Ativo e Objetivos
    
    {{active_plan_summary}}
    ```
    
    > **Placeholder:**
    > - `{{active_plan_summary}}`: Plano raiz e sub-objetivos ativos, rastreados pelo FocusInducer.
    >   Formato sugerido:
    >
    >   ```
    >   Objetivo Raiz: "Corrigir redacao do usuario"
    >   Progresso: 3/8 passos concluidos
    >   Passo atual: Etapa 4 de 8 — Avaliar competencia 3 (argumentacao)
    >   Proximo passo: Etapa 5 de 8 — Avaliar competencia 4 (coesao)
    >   Foco: ON (desde passo 1, sem divagacao detectada)
    >   ```
    >
    >   Se divagacao foi detectada, o FocusInducer pode injetar um alerta:
    >
    >   ```
    >   ⚠ [FOCUS ALERT] Divagacao detectada no passo anterior.
    >   Retomando objetivo raiz: "Corrigir redacao do usuario"
    >   Working memory foi parcialmente limpa para restabelecer foco.
    >   ```
    
    ---
    
    ## [BLOCO 6 — ENTRADA DO USUARIO] (dinamico, ~50-500 tokens)
    
    ```
    ## Entrada do Usuario
    
    {{user_input}}
    ```
    
    > **Placeholder:**
    > - `{{user_input}}`: Mensagem bruta do usuario para este passo.
    >   Ja exibido no [BLOCO 2], mas repetido aqui como ancora para a resposta.
    
    ---
    
    ## [BLOCO 7 — REFRESH MARKERS] (dinamico, ~20 tokens)
    
    ```
    ## Marcadores de Manutencao
    
    Estado do ciclo de memoria ao final deste passo:
    [REFRESH] Ultimo refresh: passo {{last_refresh_step}} | Proximo: passo {{next_refresh_step}}
    [FORGET] Ciclos sem acesso ate remocao: {{cycles_until_forget}}
    [COMPRESS] Proxima compressao: passo {{next_compression_step}}
    [FOCUS] Estado de foco: {{focus_status}} | Passos consecutivos sem divagacao: {{focus_streak}}
    ```
    
    > **Placeholders finais:**
    > - `{{last_refresh_step}}`: Numero do ultimo passo onde refresh foi executado.
    > - `{{next_refresh_step}}`: Numero do proximo passo onde refresh sera executado.
    > - `{{cycles_until_forget}}`: Ciclos restantes antes de esquecimento (ex: "2/3").
    > - `{{next_compression_step}}`: Numero do proximo passo onde compressao sera executada.
    > - `{{focus_status}}`: "ON", "DIVAGANDO" ou "RECUPERADO".
    > - `{{focus_streak}}`: Passos consecutivos sem deteccao de divagacao.
    >
    > Se o passo atual for um passo de refresh, o marcador [REFRESH] sera destacado:
    > ```
    > ⬇ [REFRESH NOW] Ciclo de refresh em execucao neste passo.
    > ```
    
    ---
    
    ## Resumo do Fluxo de Montagem
    
    ```
    1. Sistema inicia com bloco fixo [BLOCO 1]
    2. Obtem instrucao do passo e entrada do usuario → preenche [BLOCO 2]
    3. WorkingMemory.filtra_por_relevancia() → preenche [BLOCO 3]
    4. SelectiveAttention.busca_memorias() → preenche [BLOCO 4] (3 sub-blocos)
    5. FocusInducer.obtem_plano_ativo() → preenche [BLOCO 5]
    6. Anexa entrada do usuario [BLOCO 6]
    7. Preenche marcadores de sistema [BLOCO 7]
    8. Aplica TokenGuard.corta_se_estourar() → prompt final
    9. Envia ao LLM
    ```
    
    ## Orcamento de Tokens por Bloco
    
    | Bloco | Min | Max | % do Total |
    |---|---|---|---|
    | B1 — Sistema (fixo) | 200 | 200 | ~2% |
    | B2 — Instrucao (dinamico) | 100 | 300 | ~2% |
    | B3 — Working Memory | 200 | 6.000 | 50% |
    | B4.1 — Episodica | 200 | 2.400 | 20% |
    | B4.2 — Semantica | 100 | 1.200 | 10% |
    | B4.3 — Procedural | 50 | 600 | 5% |
    | B5 — Plano Ativo | 100 | 500 | ~4% |
    | B6 — Entrada Usuario | 50 | 500 | ~4% |
    | B7 — Refresh Markers | 20 | 50 | ~0.4% |
    | **Reserva** | **~980** | **~250** | **~2%** |
    | **Total** | **~1.020** | **~12.000** | **100%** |
    