---
    name: web-search
    description: "Instrucoes para realizar buscas na web de forma eficiente usando Python + Playwright."
    keywords:
      - web
      - internet
      - search
      - pesquisa
      - navegacao
      - browser
      - site
      - url
      - google
    ---
    
    # Web Search Skill
    
    ## Quando usar
    - Quando o usuario pedir para buscar informacoes na internet
    - Quando precisar de dados atualizados que nao estao no conhecimento do modelo
    - Para verificar fatos, noticias, precos, ou qualquer informacao online
    
    ## Instrucoes
    
    ### 1. Navegar para um site de busca
    Use o PythonAgent com Playwright para navegar ate um mecanismo de busca (Google, DuckDuckGo, etc.). Escreva um script Python que abre o navegador, navega ate a URL e extrai o texto dos resultados.
    
    ### 2. Extrair resultados
    Apos a busca, extraia o texto dos resultados usando Playwright (`page.inner_text()` ou `page.evaluate()`) para encontrar a informacao desejada.
    
    ### 3. Verificar fontes
    Sempre verifique a informacao em mais de uma fonte quando possivel.
    
    ### 4. Citar fontes
    Ao responder, mencione de onde a informacao veio para dar credibilidade.
    
    ### Boas praticas
    - Seja especifico na busca (use termos precisos)
    - Para informacoes estruturadas, prefira sites oficiais
    - Nao invente informacoes baseado em suposicoes
    - Use `headless=False` quando o usuario pedir para ver o navegador
    - Use `headless=True` para tarefas silenciosas em background
    