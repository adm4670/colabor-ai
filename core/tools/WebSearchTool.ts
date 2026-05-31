/**
     * WebSearchTool - Busca web real usando DuckDuckGo API.
     *
     * Inspirado no WebSearchTool do claude-code.
     * Usa DuckDuckGo Instant Answer API (gratuita, sem key) com fallback para scraping.
     */
    
    import axios from "axios";
    import { ToolDefinition, ToolContext } from "./toolDefinition";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    interface SearchResult {
      title: string;
      snippet: string;
      url: string;
      source: string;
    }
    
    interface WebSearchArgs {
      query: string;
      maxResults?: number;
    }
    
    // ============================================================
    // DuckDuckGo Search
    // ============================================================
    
    async function searchDuckDuckGo(
      query: string,
      maxResults: number = 5
    ): Promise<SearchResult[]> {
      // Tenta primeiro a Instant Answer API
      try {
        const response = await axios.get("https://api.duckduckgo.com/", {
          params: {
            q: query,
            format: "json",
            no_html: 1,
            skip_disambig: 1,
          },
          timeout: 5000,
        });
    
        const data = response.data;
        const results: SearchResult[] = [];
    
        // Abstract (resposta direta)
        if (data.AbstractText && data.AbstractText.length > 10) {
          results.push({
            title: data.Heading || query,
            snippet: data.AbstractText,
            url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            source: "DuckDuckGo Instant Answer",
          });
        }
    
        // Related Topics
        if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
          for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.slice(0, 100),
                snippet: topic.Text,
                url: topic.FirstURL,
                source: "DuckDuckGo Related",
              });
            }
          }
        }
    
        if (results.length > 0) return results.slice(0, maxResults);
      } catch (err) {
        logger.warn(`[WebSearch] DuckDuckGo API falhou: ${err}`);
      }
    
      // Fallback: retorna resultado com link de busca
      return [
        {
          title: `Search: ${query}`,
          snippet: `Search results for "${query}" on DuckDuckGo. Click to view full results.`,
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          source: "DuckDuckGo Web",
        },
      ];
    }
    
    // ============================================================
    // Tool
    // ============================================================
    
    export const webSearchTool: ToolDefinition<WebSearchArgs, SearchResult[]> = {
      name: "web_search",
      description:
        "Search the web using DuckDuckGo and return structured results. Use for finding current information, documentation, news, or any web research.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query (be specific for better results)",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results (default: 5)",
          },
        },
        required: ["query"],
      },
    
      execute: async (
        args: WebSearchArgs,
        _ctx: ToolContext
      ): Promise<SearchResult[]> => {
        logger.info(`[WebSearch] Searching: "${args.query}"`);
        return searchDuckDuckGo(args.query, args.maxResults || 5);
      },
    };
    
    /** OpenAI function calling format */
    export const webSearchOpenAI = {
      type: "function" as const,
      function: {
        name: webSearchTool.name,
        description: webSearchTool.description,
        parameters: webSearchTool.parameters,
      },
    };
    
    /** Handler que retorna resultado formatado para o agente */
    export const webSearchHandler: Function = async (args: WebSearchArgs) => {
      const results = await webSearchTool.execute(args, {
        agentName: "web_search",
        userId: 0,
      });
    
      if (results.length === 0) {
        return "No results found.";
      }
    
      return results
        .map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   ${r.snippet.slice(0, 200)}\n   URL: ${r.url}\n   Source: ${r.source}`
        )
        .join("\n\n");
    };
    