// ============================================================
    // WebSearch Tool - Buscar na web e extrair conteudo de paginas
    // Usa DuckDuckGo para buscas (sem API key) e axios para scraping
    // ============================================================
    
    import axios from "axios";
    
    // User-Agent para parecer um navegador real
    const BROWSER_UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    
    /**
     * Extrai texto limpo de HTML (remove tags, scripts, styles)
     */
    function extractText(html: string): string {
      // Remove scripts e styles
      let text = html.replace(new RegExp("<script[^>]*>[\\s\\S]*?<\\/script>", "gi"), " ");
      text = text.replace(new RegExp("<style[^>]*>[\\s\\S]*?<\\/style>", "gi"), " ");
      // Remove HTML tags
      text = text.replace(/<[^>]+>/g, " ");
      // Normaliza espacos
      text = text.replace(/\s+/g, " ").trim();
      // Decodifica entidades HTML basicas
      text = text.replace(/&amp;/g, "&");
      text = text.replace(/&lt;/g, "<");
      text = text.replace(/&gt;/g, ">");
      text = text.replace(/&quot;/g, '"');
      text = text.replace(/&#39;/g, "'");
      text = text.replace(/&#x27;/g, "'");
      text = text.replace(/&#x2F;/g, "/");
      return text;
    }
    
    /**
     * Trunca texto para um limite de caracteres, mantendo palavras inteiras
     */
    function truncate(text: string, maxChars: number): string {
      if (text.length <= maxChars) return text;
      const truncated = text.substring(0, maxChars);
      const lastSpace = truncated.lastIndexOf(" ");
      return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + "...";
    }
    
    export const webSearchTool = {
      type: "function" as const,
    
      function: {
        name: "web_search",
        description: "Busca informacoes na internet e/ou extrai conteudo de paginas web. Acoes: search (busca no DuckDuckGo), scrape (extrai texto de uma URL), search_and_scrape (busca + extrai da melhor pagina).",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["search", "scrape", "search_and_scrape"],
              description: "Acao: search (busca no DuckDuckGo), scrape (extrai texto de URL), search_and_scrape (busca e extrai da melhor pagina)"
            },
            query: {
              type: "string",
              description: "Termo de busca (obrigatorio em 'search' e 'search_and_scrape')"
            },
            url: {
              type: "string",
              description: "URL para scraping (obrigatorio em 'scrape')"
            },
            limit: {
              type: "number",
              description: "Numero maximo de resultados (default: 5, max: 10)"
            },
            maxChars: {
              type: "number",
              description: "Maximo de caracteres por pagina extraida (default: 3000)"
            }
          },
          required: ["action"]
        }
      },
    
      async handler({
        action,
        query,
        url,
        limit,
        maxChars
      }: {
        action: string;
        query?: string;
        url?: string;
        limit?: number;
        maxChars?: number;
      }): Promise<any> {
        const resultLimit = Math.min(limit || 5, 10);
        const charLimit = maxChars || 3000;
    
        try {
          switch (action) {
    
            case "search": {
              if (!query) {
                return { success: false, message: "Query obrigatoria para busca." };
              }
    
              // Usa DuckDuckGo lite (HTML simples, sem API key)
              const response = await axios.get(
                "https://lite.duckduckgo.com/lite/",
                {
                  params: { q: query },
                  headers: {
                    "User-Agent": BROWSER_UA,
                    "Accept": "text/html",
                  },
                  timeout: 10000,
                }
              );
    
              const html = response.data as string;
    
              // DuckDuckGo Lite retorna resultados em tabelas HTML
              // Extrai links e textos dos resultados
              const results: Array<{ title: string; link: string; snippet: string }> = [];
              const linkRegex = /<a[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi;
              const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
    
              // Tenta extrair pelo formato lite.duckduckgo.com
              // O formato pode variar, entao vamos tentar abordagens alternativas
    
              // Abordagem 1: Extrair links de resultados
              const allLinks: Array<{ title: string; url: string }> = [];
              const anchorRegex = new RegExp('<a[^>]*href="(https?://[^"]+)"[^>]*>([\\s\\S]*?)<\\/a>', "gi");
              let match;
    
              while ((match = anchorRegex.exec(html)) !== null) {
                const linkUrl = match[1];
                const title = extractText(match[2]).trim();
                if (
                  title &&
                  linkUrl &&
                  !linkUrl.includes("duckduckgo.com") &&
                  !linkUrl.includes("javascript:") &&
                  allLinks.length < resultLimit * 2
                ) {
                  allLinks.push({ title, url: linkUrl });
                }
              }
    
              // Abordagem 2: Tentar tabelas do DuckDuckGo Lite
              const tableRows = html.split("<tr");
              let currentTitle = "";
              let currentUrl = "";
    
              for (const row of tableRows) {
                if (row.includes('class="result-link"')) {
                  const hrefMatch = row.match(/href="([^"]+)"/);
                  const textMatch = row.match(/>([\s\S]*?)<\/a>/);
                  if (hrefMatch && textMatch) {
                    currentUrl = hrefMatch[1];
                    currentTitle = extractText(textMatch[1]).trim();
                  }
                }
                if (row.includes('class="result-snippet"') && currentTitle) {
                  const snippet = extractText(row).trim();
                  results.push({
                    title: currentTitle,
                    link: currentUrl.startsWith("http") ? currentUrl : `https://${currentUrl}`,
                    snippet: truncate(snippet, 200),
                  });
                  currentTitle = "";
                  currentUrl = "";
                }
              }
    
              // Se nao encontrou pelo formato de tabela, usa a abordagem geral
              if (results.length === 0) {
                for (const link of allLinks) {
                  results.push({
                    title: link.title,
                    link: link.url,
                    snippet: "",
                  });
                  if (results.length >= resultLimit) break;
                }
              }
    
              return {
                success: true,
                query,
                results: results.slice(0, resultLimit),
                count: Math.min(results.length, resultLimit),
                message: `${Math.min(results.length, resultLimit)} resultado(s) para "${query}"`,
              };
            }
    
            case "scrape": {
              if (!url) {
                return { success: false, message: "URL obrigatoria para scraping." };
              }
    
              const response = await axios.get(url, {
                headers: {
                  "User-Agent": BROWSER_UA,
                  "Accept": "text/html,application/xhtml+xml",
                  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
                },
                timeout: 15000,
                maxRedirects: 5,
              });
    
              const html = response.data as string;
              const title = extractText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
              const body = extractText(
                html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html
              );
    
              return {
                success: true,
                url,
                title: title || "(sem titulo)",
                content: truncate(body, charLimit),
                fullLength: body.length,
                message: `Pagina extraida: ${title || url}`,
              };
            }
    
            case "search_and_scrape": {
              if (!query) {
                return { success: false, message: "Query obrigatoria." };
              }
    
              // Primeiro faz a busca
              const searchResult = await this.handler({
                action: "search",
                query,
                limit: 3,
              });
    
              if (!searchResult.success || searchResult.count === 0) {
                return searchResult;
              }
    
              // Depois extrai a melhor pagina (primeiro resultado)
              const bestUrl = searchResult.results?.[0]?.link;
              if (!bestUrl) {
                return searchResult;
              }
    
              const scrapeResult = await this.handler({
                action: "scrape",
                url: bestUrl,
                maxChars: charLimit,
              });
    
              return {
                success: true,
                query,
                searchResults: searchResult.results,
                bestResult: {
                  url: bestUrl,
                  title: searchResult.results[0].title,
                  content: scrapeResult.success ? scrapeResult.content : null,
                },
                message: `Busca e extracao de "${query}" concluidas.`,
              };
            }
    
            default:
              return {
                success: false,
                message: `Acao desconhecida: '${action}'. Use: search, scrape, search_and_scrape`,
              };
          }
        } catch (err: any) {
          const errorMsg = err.response
            ? `HTTP ${err.response.status}: ${err.response.statusText}`
            : err.code || err.message;
    
          return {
            success: false,
            message: `Erro ao ${action}: ${errorMsg}`,
            action,
            query: query || url || "",
          };
        }
      }
    };
    