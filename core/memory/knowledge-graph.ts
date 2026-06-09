/**
 * knowledge-graph.ts - Grafo de Conhecimento
 * 
 * Constrói e consulta um grafo de relações entre entidades
 * a partir das memórias semânticas.
 * 
 * AGORA: Singleton global + persistência em disco.
 * Todas as tools e componentes usam a MESMA instância.
 * 
 * CORRECAO 2026-06-09:
 * - Adicionado limitador de tamanho maximo (MAX_NODES, MAX_EDGES)
 * - Adicionado pruning automatico de nós de baixa confiança
 * - Adicionado validacao de integridade antes de salvar
 * - Arquivo corrompido agora é resetado automaticamente
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
// CORRECAO: Limites de crescimento do grafo
// ============================================================

const MAX_NODES = 5000;           // Max 5000 nodes
const MAX_EDGES = 10000;          // Max 10000 edges
const PRUNE_LOW_CONFIDENCE = 0.3; // Remover arestas abaixo desta confianca
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB max file size

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
  private static readonly AUTO_SAVE_THRESHOLD = 50; // Aumentado de 20 para 50
  private corruptedOnLoad = false;

  /** Adiciona um fato ao grafo */
  addFact(subject: string, predicate: string, object: string, confidence: number = 0.8): void {
    const s = subject.toLowerCase().trim();
    const o = object.toLowerCase().trim();
    const p = predicate.toLowerCase().trim();

    // CORRECAO: Validar entradas
    if (!s || !o || !p) return;
    if (s.length > 100 || o.length > 100) return; // Limitar tamanho

    // Add nodes
    if (!this.nodes.has(s)) {
      if (this.nodes.size >= MAX_NODES) {
        this.prune();
        if (this.nodes.size >= MAX_NODES) return; // Ainda cheio, descarta
      }
      this.nodes.set(s, new Set());
    }
    if (!this.nodes.has(o)) {
      if (this.nodes.size >= MAX_NODES) {
        this.prune();
        if (this.nodes.size >= MAX_NODES) return;
      }
      this.nodes.set(o, new Set());
    }
    this.nodes.get(s)!.add(p);
    this.nodes.get(o)!.add(p);

    // Add edge
    const edgeKey = `${s}::${p}`;
    if (!this.edges.has(edgeKey)) {
      if (this.edges.size >= MAX_EDGES) {
        this.prune();
        if (this.edges.size >= MAX_EDGES) return;
      }
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

  /**
   * CORRECAO: Remove nos e arestas de baixa importância para controlar
   * o crescimento do grafo.
   */
  private prune(): void {
    const beforeNodes = this.nodes.size;
    const beforeEdges = this.edges.size;
    let prunedEdges = 0;

    // 1. Remover arestas de baixa confianca
    for (const [edgeKey, targets] of this.edges) {
      for (const [obj, conf] of targets) {
        if (conf < PRUNE_LOW_CONFIDENCE) {
          targets.delete(obj);
          prunedEdges++;
        }
      }
      if (targets.size === 0) {
        this.edges.delete(edgeKey);
      }
    }

    // 2. Remover nos que nao tem mais arestas (orfãos)
    const orphanNodes: string[] = [];
    for (const [nodeKey] of this.nodes) {
      let hasEdge = false;
      for (const [edgeKey] of this.edges) {
        const [subj] = edgeKey.split("::");
        if (subj === nodeKey) {
          hasEdge = true;
          break;
        }
        for (const obj of this.edges.get(edgeKey)!.keys()) {
          if (obj === nodeKey) {
            hasEdge = true;
            break;
          }
        }
        if (hasEdge) break;
      }
      if (!hasEdge) {
        orphanNodes.push(nodeKey);
      }
    }
    for (const node of orphanNodes) {
      this.nodes.delete(node);
    }

    // 3. Se ainda estiver muito grande, remover 20% dos nos menos conectados
    if (this.nodes.size > MAX_NODES || this.edges.size > MAX_EDGES) {
      const nodeConnectivity = new Map<string, number>();
      for (const [nodeKey] of this.nodes) {
        let connections = 0;
        for (const [edgeKey, targets] of this.edges) {
          const [subj] = edgeKey.split("::");
          if (subj === nodeKey) connections += targets.size;
          for (const obj of targets.keys()) {
            if (obj === nodeKey) connections++;
          }
        }
        nodeConnectivity.set(nodeKey, connections);
      }

      // Ordenar por conectividade (menos conectados primeiro)
      const sortedNodes = [...nodeConnectivity.entries()]
        .sort((a, b) => a[1] - b[1]);

      const removeCount = Math.floor(sortedNodes.length * 0.2);
      const toRemove = new Set(sortedNodes.slice(0, removeCount).map(([n]) => n));

      for (const [edgeKey] of this.edges) {
        const [subj] = edgeKey.split("::");
        if (toRemove.has(subj)) {
          this.edges.delete(edgeKey);
        }
      }
      for (const node of toRemove) {
        this.nodes.delete(node);
      }
    }

    logger.info(
      `[KnowledgeGraph] Pruning: ${beforeNodes}->${this.nodes.size} nos, ${beforeEdges}->${this.edges.size} arestas (${prunedEdges} arestas de baixa confianca removidas)`
    );
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
      if (node.key && node.key.length <= 100) {
        this.nodes.set(node.key, new Set(node.predicates || []));
      }
    }

    for (const edge of data.edges) {
      if (!edge.key || edge.key.length > 200) continue;
      const targetMap = new Map<string, number>();
      for (const t of edge.targets || []) {
        if (t.object && t.object.length <= 100) {
          targetMap.set(t.object, t.confidence);
        }
      }
      if (targetMap.size > 0) {
        this.edges.set(edge.key, targetMap);
      }
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

      // CORRECAO: Aplicar pruning antes de salvar se estiver grande
      if (this.nodes.size > MAX_NODES * 0.8 || this.edges.size > MAX_EDGES * 0.8) {
        this.prune();
      }

      const data = this.toJSON();
      const jsonString = JSON.stringify(data, null, 2);

      // CORRECAO: Validar que o JSON gerado e valido antes de escrever
      try {
        JSON.parse(jsonString);
      } catch (e: any) {
        logger.error(`[KnowledgeGraph] JSON gerado e invalido, abortando save: ${e.message}`);
        return;
      }

      // CORRECAO: Verificar tamanho do arquivo
      if (jsonString.length > MAX_FILE_SIZE_BYTES) {
        logger.warn(`[KnowledgeGraph] JSON muito grande (${jsonString.length} bytes), forcando pruning...`);
        this.prune();
        const prunedData = this.toJSON();
        const prunedString = JSON.stringify(prunedData, null, 2);
        fs.writeFileSync(targetPath, prunedString, "utf-8");
      } else {
        // CORRECAO: Escrita atomica (escreve em temporario e renomeia)
        const tmpPath = targetPath + ".tmp";
        fs.writeFileSync(tmpPath, jsonString, "utf-8");
        fs.renameSync(tmpPath, targetPath);
      }

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

      // CORRECAO: Verificar tamanho do arquivo antes de ler
      const stats = fs.statSync(targetPath);
      if (stats.size > MAX_FILE_SIZE_BYTES) {
        logger.warn(`[KnowledgeGraph] Arquivo muito grande (${stats.size} bytes). Resetando grafo.`);
        this.resetFile(targetPath);
        return false;
      }

      const raw = fs.readFileSync(targetPath, "utf-8");

      // CORRECAO: Remover caracteres de controle que podem quebrar o parse
      const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

      let data: SerializableGraph;
      try {
        data = JSON.parse(cleaned);
      } catch (parseErr: any) {
        logger.warn(`[KnowledgeGraph] Erro ao fazer parse do JSON: ${parseErr.message}. Resetando grafo.`);
        this.resetFile(targetPath);
        return false;
      }

      this.fromJSON(data);
      logger.info(`[KnowledgeGraph] Carregado de ${targetPath}: ${this.nodes.size} nós`);
      return true;
    } catch (err: any) {
      logger.warn(`[KnowledgeGraph] Erro ao carregar: ${err.message}. Resetando grafo.`);
      this.resetFile(targetPath);
      return false;
    }
  }

  /**
   * CORRECAO: Reseta o arquivo do grafo, criando um novo vazio.
   */
  private resetFile(filePath: string): void {
    try {
      const emptyGraph: SerializableGraph = {
        version: 1,
        savedAt: new Date().toISOString(),
        nodes: [],
        edges: [],
      };
      fs.writeFileSync(filePath, JSON.stringify(emptyGraph, null, 2), "utf-8");
      logger.info(`[KnowledgeGraph] Arquivo resetado: ${filePath}`);
    } catch (err: any) {
      logger.error(`[KnowledgeGraph] Erro ao resetar arquivo: ${err.message}`);
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
