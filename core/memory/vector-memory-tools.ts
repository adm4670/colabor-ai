// ============================================================
    // Vector Memory Tools
    // Ferramentas de memoria vetorial com busca semantica por embeddings
    // 
    // O agente pode:
    // - ARMAZENAR informacoes importantes com contexto semantico
    // - BUSCAR por similaridade de significado (nao so palavras exatas)
    // - VER estatisticas da memoria
    // ============================================================
    
    import { vectorStore } from "./vectorStore";
    
    // ============================================================
    // vector_memory_store - Armazenar informacao na memoria vetorial
    // ============================================================
    
    export const vectorMemoryStoreTool = {
      type: "function" as const,
      function: {
        name: "vector_memory_store",
        description: "Armazena uma informacao importante na memoria de longo prazo com busca semantica. Use para salvar fatos, preferencias do usuario, decisoes e aprendizados importantes.",
        parameters: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Conteudo a ser armazenado (ex: 'Usuario prefere Python para scripts')"
            },
            type: {
              type: "string",
              enum: ["conversation", "note", "fact", "decision"],
              description: "Tipo do conteudo (opcional, default: 'note')"
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags para categorizar (opcional, ex: ['preferencia', 'linguagem'])"
            }
          },
          required: ["content"]
        }
      },
    
      handler: async ({ content, type, tags }: { content: string; type?: string; tags?: string[] }) => {
        try {
          const id = await vectorStore.store({
            content,
            type: (type as any) || "note",
            source: "agent",
            tags: tags || []
          });
    
          return {
            success: true,
            id: id.substring(0, 12) + "...",
            message: "Memorizado com sucesso!",
            type: type || "note"
          };
        } catch (err: any) {
          return {
            success: false,
            message: `Erro ao armazenar: ${err.message || err}`
          };
        }
      }
    };
    
    // ============================================================
    // vector_memory_search - Busca semantica na memoria vetorial
    // ============================================================
    
    export const vectorMemorySearchTool = {
      type: "function" as const,
      function: {
        name: "vector_memory_search",
        description: "Busca informacoes na memoria de longo prazo por similaridade semantica. Entende o significado, nao apenas palavras exatas. Ideal para lembrar de conversas, preferencias e decisoes passadas.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Texto para busca semantica (ex: 'o que o usuario gosta de programar?')"
            },
            limit: {
              type: "number",
              description: "Numero maximo de resultados (default: 5)"
            },
            typeFilter: {
              type: "array",
              items: {
                type: "string",
                enum: ["conversation", "note", "fact", "decision"]
              },
              description: "Filtrar por tipo(s) especifico(s) (opcional)"
            }
          },
          required: ["query"]
        }
      },
    
      handler: async ({ query, limit, typeFilter }: { query: string; limit?: number; typeFilter?: string[] }) => {
        try {
          const results = await vectorStore.search({
            query,
            limit: limit || 5,
            threshold: 0.4,
            typeFilter: typeFilter as any
          });
    
          if (results.length === 0) {
            return {
              success: true,
              results: [],
              count: 0,
              message: "Nenhum resultado encontrado na memoria com significado similar."
            };
          }
    
          const formatted = results.map(r => ({
            content: r.content,
            type: r.metadata.type,
            similarity: Math.round(r.similarity * 100) + "%",
            tags: r.metadata.tags,
            created: new Date(r.createdAt).toISOString()
          }));
    
          return {
            success: true,
            results: formatted,
            count: results.length,
            message: `Encontrados ${results.length} resultados.`
          };
        } catch (err: any) {
          return {
            success: false,
            results: [],
            count: 0,
            message: `Erro na busca: ${err.message || err}`
          };
        }
      }
    };
    
    // ============================================================
    // vector_memory_stats - Estatisticas da memoria vetorial
    // ============================================================
    
    export const vectorMemoryStatsTool = {
      type: "function" as const,
      function: {
        name: "vector_memory_stats",
        description: "Mostra estatisticas da memoria de longo prazo: total de entradas, tipos armazenados, etc.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
    
      handler: async () => {
        try {
          const stats = vectorStore.getStats();
    
          return {
            success: true,
            totalEntries: stats.totalEntries,
            byType: stats.byType,
            message: `Memoria vetorial: ${stats.totalEntries} entradas no total.`
          };
        } catch (err: any) {
          return {
            success: false,
            message: `Erro ao obter estatisticas: ${err.message || err}`
          };
        }
      }
    };
    