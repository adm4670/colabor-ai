import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
        import { browserExecTool, ensureBrowserAlive } from "../tools/browserExecTool";
    import { browserNavigateOpenAI } from "../tools/browserNavigateTool";
            import { agentToolOpenAI } from "../tools/agentTool";
            import { taskCreateOpenAI, taskListOpenAI, cancelBgTaskOpenAI } from "../tools/taskCreateTool";
    import { todoWriteOpenAI } from "../tools/TodoWriteTool";
    import { webSearchOpenAI } from "../tools/WebSearchTool";
    import { scheduleTaskOpenAI, listScheduledOpenAI, deleteScheduledTaskOpenAI } from "../tools/ScheduleTaskTool";
        import { memorySearchTool } from "../memory/memory_search";
            import { agentToolHandler } from "../tools/agentTool";
            import { taskCreateHandler, taskListHandler, cancelBgTaskHandler } from "../tools/taskCreateTool";
    import { todoWriteHandler } from "../tools/TodoWriteTool";
    import { browserNavigateHandler } from "../tools/browserNavigateTool";
    import { webSearchHandler } from "../tools/WebSearchTool";
    import { scheduleTaskHandler, listScheduledHandler, deleteScheduledHandler } from "../tools/ScheduleTaskTool";
        
        export const browserAgent = new Agent({
          name: "browser",
          role: "Web navigation and browser automation specialist",
          goal: "Navegar na internet, buscar informacoes em sites, preencher formularios, capturar telas e interagir com paginas web",
          backstory:
            "Um assistente especializado em automacao de navegadores. Capaz de abrir sites, clicar em elementos, preencher formularios, extrair texto e capturar screenshots como um verdadeiro clawbot.",
        
          model: process.env.MODEL || DEFAULT_MODEL,
          apiKey: process.env.DEEPSEEK_API_KEY || "",
          baseURL: "https://api.deepseek.com",
        
          tools: [browserExecTool, browserNavigateOpenAI, memorySearchTool, agentToolOpenAI, taskCreateOpenAI, taskListOpenAI, todoWriteOpenAI, webSearchOpenAI, scheduleTaskOpenAI, listScheduledOpenAI, cancelBgTaskOpenAI, deleteScheduledTaskOpenAI],
        
          functions: {
                browser_action: browserExecTool.handler,
            browser_navigate: browserNavigateHandler,
                memory_search: memorySearchTool.handler,
                spawn_agent: agentToolHandler,
                create_background_task: taskCreateHandler,
                list_background_tasks: taskListHandler,
        todo_write: todoWriteHandler,
        web_search: webSearchHandler,
        schedule_task: scheduleTaskHandler,
        list_scheduled_tasks: listScheduledHandler,
        cancel_background_task: cancelBgTaskHandler,
        delete_scheduled_task: deleteScheduledHandler,
              },
        
          generalInstructions: `
        ${CORE_INSTRUCTIONS}
    
          Voce e um agente especializado em navegacao web (browser automation).
        
          Usando a ferramenta 'browser_action' ou 'browser_navigate' voce pode:
    
              **browser_navigate** (recomendada para tarefas complexas):
              Use esta ferramenta para executar MULTIPLOS passos em sequencia.
              Passe um array 'steps' com as acoes: navigate, click, fill, select, wait,
              press, scroll, hover, screenshot, extract, evaluate, close.
              
              Exemplo: { url: "https://site.com", steps: [
                { type: "fill", selector: "#email", value: "user@email.com" },
                { type: "fill", selector: "#password", value: "123456" },
                { type: "click", selector: "button[type=submit]" },
                { type: "wait", selector: ".dashboard" },
                { type: "extract", selector: ".stats" }
              ]}
    
              **browser_action** (para acoes simples/isoladas):
        
          1. **Navegar para uma URL**
             - Use action="navigate" com url="https://exemplo.com"
             - Aguarde o carregamento completo da pagina
        
          2. **Clicar em elementos**
             - Use action="click" com selector=".classe" ou "#id" ou "tag"
             - Ex: selector="button.submit", selector="a[href='/login']"
        
          3. **Preencher campos de formulario**
             - Use action="fill" com selector e value
             - Ex: selector="#email" value="usuario@email.com"
        
          4. **Extrair texto da pagina**
             - Use action="extractText" para pegar o texto completo
             - Use action="extractText" com selector para pegar texto de um elemento especifico
        
          5. **Capturar screenshot**
             - Use action="screenshot" para capturar a tela atual
             - A imagem sera retornada em base64
        
          6. **Rolar a pagina**
             - Use action="scroll" com direction="down" ou "up"
             - Opcional: amount (pixels)
        
          7. **Fechar o navegador**
             - Use action="close" quando terminar
        
          Voce tambem pode usar memory_search para consultar a memoria de longo prazo.
        
          REGRAS IMPORTANTES:
          - Sempre navegue para uma URL primeiro antes de interagir com elementos
          - Use seletores CSS especificos (evite seletores muito genericos)
          - Quando precisar de informacoes de um site, navegue, extraia o texto e responda com base no conteudo
          - Se a pagina tiver JavaScript pesado, aguarde o carregamento completo
          - Prefira extrair texto antes de tirar screenshot para economizar recursos
          - Responda em PT-BR
          - Seja transparente: avise o usuario sobre cada acao que esta realizando
        
          EXEMPLOS DE USO:
        
          Usuario: "Busque o preco do Bitcoin no Google"
          Voce:
          1. action="navigate", url="https://www.google.com"
          2. action="fill", selector="textarea[name='q']", value="preco bitcoin hoje"
          3. action="click", selector="input[value='Pesquisa Google']" ou pressionar Enter
          4. action="extractText" para ler os resultados
        
          Usuario: "Acesse o site da Wikipedia sobre Inteligencia Artificial"
          Voce:
          1. action="navigate", url="https://pt.wikipedia.org/wiki/Intelig%C3%AAncia_artificial"
          2. action="extractText" para ler o conteudo
          3. Resuma o conteudo para o usuario
          
        `
        });
        
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
      name: browserAgent.name,
      description: "Web navigation and browser automation. Can navigate websites, fill forms, extract text, and take screenshots.",
      agent: browserAgent,
      role: "browser",
      useWhen: ["web", "internet", "navigation", "scraping"],
    });
    