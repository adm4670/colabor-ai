/**
 * knowledge-graph.ts - Grafo de Conhecimento
 * 
 * Constrói e consulta um grafo de relações entre entidades
 * a partir das memórias semânticas.
 * 
 * AGORA: Singleton global + persistência em disco.
 * Todas as tools e componentes usam a MESMA instância.
 */

import * as fs from "fs";
import * as path from "path";
import { KnowledgeGraph, SemanticMemory } from "./memory-sota-types";
import { logger } from "../utils/logger";

// ============================================================
// Constantes de persistência
// ============================================================

const KG_FILE = path.join(process.cwd(), "data", "knowledge-graph.json");
const KG_DATA_DIR = path.dirname(KG_FILE);

// ============================================================
// Tipos serializáveis (para JSON)
// ============================================================

interface SerializableNode {
  key: string;
  predicates: string[];
}

interface SerializableEdge {
  key: string; // "subject::predicate"
  targets: Array<{ object: string; confidence: number }>;
}

interface SerializableGraph {
  version: number;
  savedAt: string;
  nodes: SerializableNode[];
  edges: SerializableEdge[];
}

// ============================================================
// KnowledgeGraphStore
// ============================================================

export class KnowledgeGraphStore {
  private nodes: Map<string, Set<string>> = new Map();
  private edges: Map<string, Map<string, number>> = new Map();
  private factCountSinceSave = 0;
  private static readonly AUTO_SAVE_THRESHOLD = 20;

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

    // Auto-save a cada N fatos
    this.factCountSinceSave++;
    if (this.factCountSinceSave >= KnowledgeGraphStore.AUTO_SAVE_THRESHOLD) {
      this.save();
      this.factCountSinceSave = 0;
    }
  }

  /** Adiciona múltiplos fatos */
  addFacts(facts: SemanticMemory[]): void {
    for (const fact of facts) {
      this.addFact(fact.subject, fact.predicate, fact.object, fact.confidence);
    }
  }

  /** Adiciona fatos no formato {subject, predicate, object, confidence} */
  addRawFacts(facts: Array<{ subject: string; predicate: string; object: string; confidence?: number }>): void {
    for (const fact of facts) {
      this.addFact(fact.subject, fact.predicate, fact.object, fact.confidence ?? 0.8);
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

  // ============================================================
  // Serialização (Map ↔ JSON)
  // ============================================================

  /** Exporta para serialização (formato com Map) */
  export(): KnowledgeGraph {
    return {
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
    };
  }

  /** Importa de serialização (formato com Map) */
  import(graph: KnowledgeGraph): void {
    this.nodes = new Map(graph.nodes);
    this.edges = new Map(graph.edges);
  }

  /** Serializa para JSON (formato plano) */
  toJSON(): SerializableGraph {
    const nodes: SerializableNode[] = [];
    for (const [key, predicates] of this.nodes) {
      nodes.push({ key, predicates: Array.from(predicates) });
    }

    const edges: SerializableEdge[] = [];
    for (const [key, targets] of this.edges) {
      const targetList: Array<{ object: string; confidence: number }> = [];
      for (const [obj, conf] of targets) {
        targetList.push({ object: obj, confidence: conf });
      }
      edges.push({ key, targets: targetList });
    }

    return {
      version: 1,
      savedAt: new Date().toISOString(),
      nodes,
      edges,
    };
  }

  /** Carrega de JSON (formato plano) */
  fromJSON(data: SerializableGraph): void {
    this.nodes = new Map();
    this.edges = new Map();

    for (const node of data.nodes) {
      this.nodes.set(node.key, new Set(node.predicates));
    }

    for (const edge of data.edges) {
      const targetMap = new Map<string, number>();
      for (const t of edge.targets) {
        targetMap.set(t.object, t.confidence);
      }
      this.edges.set(edge.key, targetMap);
    }
  }

  // ============================================================
  // Persistência em disco
  // ============================================================

  /** Salva o grafo em disco */
  save(filePath?: string): void {
    const targetPath = filePath || KG_FILE;
    try {
      if (!fs.existsSync(KG_DATA_DIR)) {
        fs.mkdirSync(KG_DATA_DIR, { recursive: true });
      }
      const data = this.toJSON();
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf-8");
      logger.info(`[KnowledgeGraph] Salvo em ${targetPath}: ${this.nodes.size} nós, ${this.edges.size} arestas`);
    } catch (err: any) {
      logger.error(`[KnowledgeGraph] Erro ao salvar: ${err.message}`);
    }
  }

  /** Carrega o grafo do disco */
  load(filePath?: string): boolean {
    const targetPath = filePath || KG_FILE;
    try {
      if (!fs.existsSync(targetPath)) {
        logger.info(`[KnowledgeGraph] Nenhum arquivo encontrado em ${targetPath}. Iniciando grafo vazio.`);
        return false;
      }
      const raw = fs.readFileSync(targetPath, "utf-8");
      const data: SerializableGraph = JSON.parse(raw);
      this.fromJSON(data);
      logger.info(`[KnowledgeGraph] Carregado de ${targetPath}: ${this.nodes.size} nós`);
      return true;
    } catch (err: any) {
      logger.warn(`[KnowledgeGraph] Erro ao carregar: ${err.message}. Iniciando grafo vazio.`);
      return false;
    }
  }
}

// ============================================================
// Singleton GLOBAL compartilhado
// ============================================================

let globalInstance: KnowledgeGraphStore | null = null;

/**
 * Retorna a instância SINGLE do KnowledgeGraphStore.
 * Faz auto-load do disco na primeira chamada.
 * Todas as tools e componentes DEVEM usar esta função.
 */
export function getKnowledgeGraphStore(): KnowledgeGraphStore {
  if (!globalInstance) {
    globalInstance = new KnowledgeGraphStore();
    // Tentar carregar do disco
    globalInstance.load();
    logger.info("[KnowledgeGraph] Nova instância global do KnowledgeGraphStore criada");
  }
  return globalInstance;
}

/**
 * Reinicializa o grafo (útil para testes ou reset manual).
 */
export function resetKnowledgeGraphStore(): void {
  if (globalInstance) {
    globalInstance.save(); // Salva antes de reinicializar
  }
  globalInstance = new KnowledgeGraphStore();
  logger.info("[KnowledgeGraph] KnowledgeGraphStore reinicializado");
}

/**
 * @deprecated Use getKnowledgeGraphStore() em vez de createKnowledgeGraph().
 * Mantida para compatibilidade com código legado.
 */
export function createKnowledgeGraph(): KnowledgeGraphStore {
  logger.warn("[KnowledgeGraph] createKnowledgeGraph() está DEPRECATED. Use getKnowledgeGraphStore() para compartilhar a instância global.");
  return getKnowledgeGraphStore();
}
