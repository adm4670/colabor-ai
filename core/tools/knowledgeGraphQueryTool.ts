/**
 * knowledgeGraphQueryTool.ts - Ferramenta de consulta ao KnowledgeGraph
 *
 * AGORA: Usa o singleton global de core/memory/knowledge-graph.ts
 * para que tools, agentes e memory-engine compartilhem a MESMA instância.
 *
 * Permite consultar o grafo de conhecimento, buscar caminhos entre entidades,
 * obter estatísticas e exportar o grafo completo.
 */

import { getKnowledgeGraphStore, resetKnowledgeGraphStore } from "../memory/knowledge-graph";
import { logger } from "../utils/logger";

// ============================================================
// Singleton delegado para o global store (compatibilidade)
// ============================================================

/**
 * Retorna a instância global do KnowledgeGraphStore.
 * Delega para getKnowledgeGraphStore() do módulo de memória.
 */
export function getKnowledgeGraph(): ReturnType<typeof getKnowledgeGraphStore> {
  return getKnowledgeGraphStore();
}

/**
 * Reinicializa o grafo (delega para o módulo de memória).
 */
export function resetKnowledgeGraph(): void {
  resetKnowledgeGraphStore();
  logger.info("[KnowledgeGraphQuery] KnowledgeGraphStore reinicializado via resetKnowledgeGraph");
}

// ============================================================
// Query Tool Definition
// ============================================================

export const knowledgeGraphQueryTool = {
  type: "function" as const,
  function: {
    name: "knowledge_graph_query",
    description: "Query the Knowledge Graph. Search for relationships between entities, find paths, get statistics, or export the full graph.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["query", "find_path", "stats", "export", "add_facts"],
          description: "What to do with the knowledge graph",
        },
        entity: {
          type: "string",
          description: "Entity to query (for action=query). Example: 'agent.ts', 'Agent', 'assistant'",
        },
        from: {
          type: "string",
          description: "Starting entity for path finding (for action=find_path)",
        },
        to: {
          type: "string",
          description: "Target entity for path finding (for action=find_path)",
        },
        facts: {
          type: "string",
          description: "JSON array of facts to add (for action=add_facts). Format: [{subject, predicate, object, confidence}]",
        },
        maxDepth: {
          type: "number",
          description: "Max depth for query traversal (default: 2)",
        },
      },
      required: ["action"],
    },
  },

  async handler(args: {
    action: "query" | "find_path" | "stats" | "export" | "add_facts";
    entity?: string;
    from?: string;
    to?: string;
    facts?: string;
    maxDepth?: number;
  }) {
    const graph = getKnowledgeGraph();

    try {
      switch (args.action) {
        // ============================================================
        // QUERY - Search relationships for an entity
        // ============================================================
        case "query": {
          if (!args.entity) {
            return { success: false, error: "Entity is required for query action" };
          }

          const results = graph.query(args.entity, args.maxDepth ?? 2);
          const formatted: Record<string, string[]> = {};
          results.forEach((value, key) => {
            formatted[key] = value;
          });

          const stats = graph.getStats();

          return {
            success: true,
            entity: args.entity,
            relationships: formatted,
            graphStats: stats,
            message: Object.keys(formatted).length > 0
              ? `Encontradas ${Object.values(formatted).flat().length} relações para "${args.entity}"`
              : `Nenhuma relação encontrada para "${args.entity}" no grafo atual.`,
          };
        }

        // ============================================================
        // FIND_PATH - Find path between two entities
        // ============================================================
        case "find_path": {
          if (!args.from || !args.to) {
            return { success: false, error: "Both 'from' and 'to' are required for find_path action" };
          }

          const path = graph.findPath(args.from, args.to);

          return {
            success: true,
            from: args.from,
            to: args.to,
            pathFound: path !== null,
            path: path ?? [],
            message: path
              ? `Caminho encontrado: ${path.join(" → ")}`
              : `Nenhum caminho encontrado entre "${args.from}" e "${args.to}"`,
          };
        }

        // ============================================================
        // STATS - Get graph statistics
        // ============================================================
        case "stats": {
          const stats = graph.getStats();
          return {
            success: true,
            stats,
            message: `📊 KnowledgeGraph: ${stats.nodes} nós, ${stats.edges} arestas, densidade ${(stats.density * 100).toFixed(2)}%`,
          };
        }

        // ============================================================
        // EXPORT - Export full graph
        // ============================================================
        case "export": {
          const exported = graph.export();
          const nodeCount = exported.nodes.size;
          const edgeCount = Array.from(exported.edges.values()).reduce(
            (sum, m) => sum + m.size, 0
          );

          return {
            success: true,
            nodes: nodeCount,
            edges: edgeCount,
            exportData: {
              nodeKeys: Array.from(exported.nodes.keys()).slice(0, 50),
              edgeSample: Array.from(exported.edges.entries()).slice(0, 20).map(([k, v]) => ({
                key: k,
                targets: Array.from(v.entries()),
              })),
            },
            message: `Grafo exportado: ${nodeCount} nós, ${edgeCount} arestas`,
          };
        }

        // ============================================================
        // ADD_FACTS - Add facts to the graph
        // ============================================================
        case "add_facts": {
          if (!args.facts) {
            return { success: false, error: "Facts JSON string is required for add_facts action" };
          }

          let parsedFacts: Array<{ subject: string; predicate: string; object: string; confidence?: number }>;
          try {
            parsedFacts = JSON.parse(args.facts);
          } catch {
            return { success: false, error: "Invalid JSON in facts parameter" };
          }

          if (!Array.isArray(parsedFacts)) {
            return { success: false, error: "Facts must be a JSON array" };
          }

          for (const fact of parsedFacts) {
            if (!fact.subject || !fact.predicate || !fact.object) {
              return {
                success: false,
                error: `Each fact needs subject, predicate, and object. Invalid fact: ${JSON.stringify(fact)}`,
              };
            }
            graph.addFact(fact.subject, fact.predicate, fact.object, fact.confidence ?? 0.8);
          }

          const stats = graph.getStats();
          return {
            success: true,
            factsAdded: parsedFacts.length,
            graphStats: stats,
            message: `${parsedFacts.length} fatos adicionados ao KnowledgeGraph. Total: ${stats.nodes} nós, ${stats.edges} arestas`,
          };
        }

        default:
          return {
            success: false,
            error: `Unknown action: ${args.action}. Valid actions: query, find_path, stats, export, add_facts`,
          };
      }
    } catch (error: any) {
      logger.error("[KnowledgeGraphQuery] Erro:", { error: error.message });
      return {
        success: false,
        error: error.message,
        message: `Erro na consulta: ${error.message}`,
      };
    }
  },
};
