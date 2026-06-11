import { chromium } from "playwright";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Web Search Tool - Busca na internet via Bing/Google
    // ============================================================
    //
    // Ferramenta dedicada para realizar buscas na internet e
    // retornar resultados estruturados (titulos, resumos, links).
    //
    // Diferente do browserExecTool que faz acoes genericas no
    // navegador, esta ferramenta e especializada em pesquisa web.
    // ============================================================
    
    export const webSearchTool = {
      type: "function",
    
      function: {
        name: "web_search",
        description:
          "Realiza uma busca na internet e retorna resultados estruturados (titulos, resumos, links). " +
          "Usa o Bing News como mecanismo de busca. Ideal para pesquisar noticias, " +
          "informacoes atualizadas, fatos, precos, e qualquer conteudo online.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Termo de busca. Ex: 'noticias Pernambuco hoje', 'preco do dolar', 'Climatempo Recife'",
            },
            maxResults: {
              type: "number",
              description:
                "Numero maximo de resultados a retornar (padrao: 10, maximo: 20)",
            },
            language: {
              type: "string",
              enum: ["pt-BR", "en-US", "es-ES"],
              description:
                "Idioma dos resultados (padrao: pt-BR)",
            },
          },
          required: ["query"],
        },
      },
    
      handler: async ({
        query,
        maxResults = 10,
        language = "pt-BR",
      }: {
        query: string;
        maxResults?: number;
        language?: string;
      }) => {
        logger.info(`[WebSearchTool] Buscando: "${query}" (max: ${maxResults}, lang: ${language})`);
    
        const effectiveMax = Math.min(maxResults, 20);
        const browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        });
    
        try {
          const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            locale: language,
          });
    
          const page = await context.newPage();
          page.setDefaultTimeout(20000);
    
          // Codificar query para URL
          const encodedQuery = encodeURIComponent(query);
          const searchUrl = `https://www.bing.com/news/search?q=${encodedQuery}&qft=interval%3d%227%22`;
    
          logger.info(`[WebSearchTool] Navegando para: ${searchUrl}`);
          await page.goto(searchUrl, {
            waitUntil: "networkidle",
            timeout: 25000,
          });
    
          // Pequena pausa para renderizacao
          await new Promise((r) => setTimeout(r, 2000));
    
          // Extrair titulos e resumos
          const titles = await page.$$eval("a.title", (elements: any[]) =>
            elements.map((el: any) => el.innerText?.trim() || "")
          );
    
          const snippets = await page.$$eval(".snippet", (elements: any[]) =>
            elements.map((el: any) => el.innerText?.trim() || "")
          );
    
          const links = await page.$$eval("a.title", (elements: any[]) =>
            elements.map((el: any) => (el as any).href || "")
          );
    
          // Construir resultados estruturados
          const count = Math.min(titles.length, effectiveMax);
          const results = [];
    
          for (let i = 0; i < count; i++) {
            results.push({
              position: i + 1,
              title: titles[i] || "",
              snippet: snippets[i] || "",
              source: links[i] || "",
            });
          }
    
          // Se nao encontrou nada via Bing News, tentar busca normal do Bing
          if (results.length === 0) {
            logger.info("[WebSearchTool] Sem resultados no Bing News, tentando busca normal...");
            await page.goto(
              `https://www.bing.com/search?q=${encodedQuery}`,
              { waitUntil: "networkidle", timeout: 25000 }
            );
            await new Promise((r) => setTimeout(r, 2000));
    
            const bingTitles = await page.$$eval("h2 a", (elements: any[]) =>
              elements.map((el: any) => el.innerText?.trim() || "")
            );
    
            const bingSnippets = await page.$$eval(".b_caption p", (elements: any[]) =>
              elements.map((el: any) => el.innerText?.trim() || "")
            );
    
            const bingLinks = await page.$$eval("h2 a", (elements: any[]) =>
              elements.map((el: any) => (el as any).href || "")
            );
    
            const bingCount = Math.min(bingTitles.length, effectiveMax);
            for (let i = 0; i < bingCount; i++) {
              results.push({
                position: i + 1,
                title: bingTitles[i] || "",
                snippet: bingSnippets[i] || "",
                source: bingLinks[i] || "",
              });
            }
          }
    
          // Formatar resultado final
          const formatted = results
            .map(
              (r, i) =>
                `${i + 1}. ${r.title}\n   ${r.snippet || "(sem resumo)"}\n   ${r.source || "(sem link)"}`
            )
            .join("\n\n");
    
          logger.info(`[WebSearchTool] Busca concluida: ${results.length} resultados`);
    
          return {
            success: true,
            query,
            count: results.length,
            results,
            formatted,
            message:
              results.length > 0
                ? `Encontrados ${results.length} resultados para "${query}".`
                : `Nenhum resultado encontrado para "${query}".`,
          };
        } catch (error: any) {
          logger.error(`[WebSearchTool] Erro na busca`, {
            query,
            error: error.message,
            stack: error.stack?.slice(0, 500),
          });
    
          return {
            success: false,
            error: error.message,
            query,
            message: `Erro ao buscar "${query}": ${error.message}`,
          };
        } finally {
          try {
            await browser.close();
          } catch {
            // Ignora erro ao fechar
          }
        }
      },
    };
    