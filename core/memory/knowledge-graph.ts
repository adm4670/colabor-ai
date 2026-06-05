/**
     * knowledge-graph.ts - Grafo de Conhecimento
     * 
     * Constrói e consulta um grafo de relações entre entidades
     * a partir das memórias semânticas.
     */
    
    import { KnowledgeGraph, SemanticMemory } from "./memory-sota-types";
    
    export class KnowledgeGraphStore {
      private nodes: Map<string, Set<string>> = new Map();
      private edges: Map<string, Map<string, number>> = new Map();
    
      /** Adiciona um fato ao grafo */
      addFact(subject: string, predicate: string, object: string, confidence: number = 0.8): void {
        const s = subject.toLowerCase();
        const o = object.toLowerCase();
        const p = predicate.toLowerCase();
    
        // Add nodes
        if (!this.nodes.has(s)) this.nodes.set(s, new Set());
        if (!this.nodes.has(o)) this.nodes.set(o, new Set());
        this.nodes.get(s)!.add(p);
        this.nodes.get(o)!.add(p);
    
        // Add edge
        const edgeKey = `${s}::${p}`;
        if (!this.edges.has(edgeKey)) {
          this.edges.set(edgeKey, new Map());
        }
        const currentConfidence = this.edges.get(edgeKey)!.get(o) || 0;
        this.edges.get(edgeKey)!.set(o, Math.max(currentConfidence, confidence));
      }
    
      /** Adiciona múltiplos fatos */
      addFacts(facts: SemanticMemory[]): void {
        for (const fact of facts) {
          this.addFact(fact.subject, fact.predicate, fact.object, fact.confidence);
        }
      }
    
      /** Busca nós relacionados a uma entidade */
      query(entity: string, maxDepth: number = 2): Map<string, string[]> {
        const results = new Map<string, string[]>();
        const lower = entity.toLowerCase();
    
        // Direct relationships
        const relations: string[] = [];
        for (const [edgeKey, targets] of this.edges) {
          const [subj, pred] = edgeKey.split("::");
          if (subj === lower) {
            for (const [obj, conf] of targets) {
              relations.push(`${pred} → ${obj} (conf: ${conf.toFixed(2)})`);
            }
          }
          if (targets.has(lower)) {
            relations.push(`${subj} → ${pred} → me`);
          }
        }
    
        if (relations.length > 0) {
          results.set("direct", relations);
        }
    
        // Node metadata
        const nodeInfo = this.nodes.get(lower);
        if (nodeInfo) {
          results.set("predicates", Array.from(nodeInfo));
        }
    
        return results;
      }
    
      /** Busca caminho entre duas entidades */
      findPath(from: string, to: string): string[] | null {
        const visited = new Set<string>();
        const queue: Array<{ node: string; path: string[] }> = [
          { node: from.toLowerCase(), path: [from] },
        ];
    
        visited.add(from.toLowerCase());
    
        while (queue.length > 0) {
          const { node, path } = queue.shift()!;
    
          // Find all connected nodes
          const connected = this.getConnectedNodes(node);
          for (const next of connected) {
            if (next.toLowerCase() === to.toLowerCase()) {
              return [...path, next];
            }
            if (!visited.has(next.toLowerCase())) {
              visited.add(next.toLowerCase());
              queue.push({ node: next.toLowerCase(), path: [...path, next] });
            }
          }
        }
    
        return null;
      }
    
      /** Estatísticas do grafo */
      getStats(): { nodes: number; edges: number; density: number } {
        const nodeCount = this.nodes.size;
        const edgeCount = Array.from(this.edges.values()).reduce(
          (sum, m) => sum + m.size,
          0
        );
        const maxEdges = nodeCount * (nodeCount - 1);
        const density = maxEdges > 0 ? edgeCount / maxEdges : 0;
    
        return { nodes: nodeCount, edges: edgeCount, density };
      }
    
      private getConnectedNodes(node: string): string[] {
        const connected = new Set<string>();
    
        for (const [edgeKey, targets] of this.edges) {
          const [subj] = edgeKey.split("::");
          if (subj === node) {
            for (const obj of targets.keys()) {
              connected.add(obj);
            }
          }
          // Check if any target is the node
          for (const obj of targets.keys()) {
            if (obj === node) {
              connected.add(subj);
            }
          }
        }
    
        return Array.from(connected);
      }
    
      /** Exporta para serialização */
      export(): KnowledgeGraph {
        return {
          nodes: new Map(this.nodes),
          edges: new Map(this.edges),
        };
      }
    
      /** Importa de serialização */
      import(graph: KnowledgeGraph): void {
        this.nodes = new Map(graph.nodes);
        this.edges = new Map(graph.edges);
      }
    }
    
    export function createKnowledgeGraph(): KnowledgeGraphStore {
      return new KnowledgeGraphStore();
    }
    