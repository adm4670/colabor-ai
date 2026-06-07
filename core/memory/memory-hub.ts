/**
 * memory-hub.ts — Orquestrador Unificado de Memórias (MemoryHub)
 *
 * Integra as 3 camadas de memória do colabor-ai:
 *   1. TEXTUAL  → MemoryEngine (MEMORY.md + notas diárias)
 *   2. VETORIAL → VectorStore (embeddings semânticos em JSON)
 *   3. GRAFO    → KnowledgeGraphStore (entidades e relações)
 *
 * AGORA: Usa o KnowledgeGraphExtractor para extração de entidades.
 *
 * Uso principal:
 *   memoryHub.queryAll(pergunta, contexto) → busca nas 3 fontes
 *   memoryHub.storeAll(conteúdo, tipo, tags) → salva nas 3 fontes
 *
 * Criado automaticamente como singleton exportado.
 */

import { getMemoryEngine, MemoryEngine } from "./memory-engine";
import { vectorStore } from "./vectorStore";
import { getKnowledgeGraphStore, KnowledgeGraphStore } from "./knowledge-graph";
import { getKnowledgeGraphExtractor, KnowledgeGraphExtractor } from "./kg-extractor";
import { memorySearch, appendToMemory, saveDailyNote } from "./memory_search";
import { MemoryEntryType, MemorySearchResult, MemoryStoreParams, MemorySearchParams } from "./types";
import { logger } from "../utils/logger";

// ============================================================
// Tipo auxiliar para VectorStore (classe não exportada)
// ============================================================

type VectorStoreLike = {
  store(params: MemoryStoreParams): Promise<string>;
  search(params: MemorySearchParams): Promise<MemorySearchResult[]>;
  getStats(): { totalEntries: number; byType: Record<string, number>; storagePath: string };
};

// ============================================================
// Tipos públicos do MemoryHub
// ============================================================

/** Resultado consolidado das 3 consultas de memória */
export interface UnifiedMemoryResult {
  /** Memória textual (MEMORY.md + notas diárias) - raw string */
  textMemory: string;

  /** Resultados da busca vetorial semântica */
  vectorResults: MemorySearchResult[];

  /** Resultados da consulta ao grafo de conhecimento */
  graphResults: Record<string, string[]>;

  /** Estatísticas do grafo (nós, arestas, densidade) */
  graphStats: { nodes: number; edges: number; density: number };

  /** Metadados da consulta */
  meta: {
    query: string;
    timestamp: number;
    sourcesQueried: string[];
    totalResults: number;
  };
}

/** Opções de consulta unified */
export interface MemoryHubQueryOptions {
  /** Quantos resultados do vector store (default: 5) */
  vectorLimit?: number;
  /** Threshold de similaridade para vector store (default: 0.4) */
  vectorThreshold?: number;
  /** Máximo de resultados da memória textual (default: 5) */
  textMaxResults?: number;
  /** Profundidade da consulta no grafo (default: 2) */
  graphMaxDepth?: number;
}

/** Resultado do armazenamento unified */
export interface UnifiedStoreResult {
  /** ID da entrada no vector store */
  vectorId?: string;
  /** Se foi salvo no MEMORY.md */
  textSaved: boolean;
  /** Quantos fatos foram extraídos para o KG */
  kgFactsExtracted: number;
  /** Se houve erro em alguma etapa */
  errors: string[];
  /** Metadados */
  meta: {
    content: string;
    type: string;
    timestamp: number;
    sourcesStored: string[];
  };
}

// ============================================================
// MemoryHub
// ============================================================

export class MemoryHub {
  private memoryEngine: MemoryEngine;
  private vectorStoreInstance: VectorStoreLike;
  private knowledgeGraph: KnowledgeGraphStore;
  private knowledgeGraphExtractor: KnowledgeGraphExtractor;

  constructor(
    memoryEngine?: MemoryEngine,
    vectorStoreInstance?: VectorStoreLike,
    knowledgeGraph?: KnowledgeGraphStore,
    knowledgeGraphExtractor?: KnowledgeGraphExtractor
  ) {
    this.memoryEngine = memoryEngine ?? getMemoryEngine();
    this.vectorStoreInstance = vectorStoreInstance ?? vectorStore;
    this.knowledgeGraph = knowledgeGraph ?? getKnowledgeGraphStore();
    this.knowledgeGraphExtractor = knowledgeGraphExtractor ?? getKnowledgeGraphExtractor();
  }

  // ============================================================
  // queryAll — Consulta as 3 memórias simultaneamente
  // ============================================================

  /**
   * Consulta todas as 3 fontes de memória com uma única query.
   *
   * 1. MemoryEngine.recall() — busca textual em MEMORY.md + notas
   * 2. vectorStore.search() — busca semântica por embeddings
   * 3. getKnowledgeGraphStore().query() — entidades relacionadas no grafo
   *
   * Retorna um UnifiedMemoryResult com os dados consolidados.
   */
  async queryAll(
    query: string,
    context?: string,
    options: MemoryHubQueryOptions = {}
  ): Promise<UnifiedMemoryResult> {
    const startTime = Date.now();
    const {
      vectorLimit = 5,
      vectorThreshold = 0.4,
      textMaxResults = 5,
      graphMaxDepth = 2,
    } = options;

    const sourcesQueried: string[] = [];
    const errors: string[] = [];

    // ── 1. Memória textual (MEMORY.md + notas diárias) ──
    let textMemory = "";
    try {
      textMemory = this.memoryEngine.recall(query, context, textMaxResults);
      sourcesQueried.push("textual/memory-engine");
    } catch (err: any) {
      errors.push(`Textual memory error: ${err.message}`);
      textMemory = "Erro ao consultar memória textual.";
    }

    // ── 2. Memória vetorial (embeddings semânticos) ──
    let vectorResults: MemorySearchResult[] = [];
    try {
      vectorResults = await this.vectorStoreInstance.search({
        query,
        limit: vectorLimit,
        threshold: vectorThreshold,
      });
      sourcesQueried.push("vector/vector-store");
    } catch (err: any) {
      errors.push(`Vector memory error: ${err.message}`);
      vectorResults = [];
    }

    // ── 3. Grafo de conhecimento (entidades e relações) ──
    let graphResults: Record<string, string[]> = {};
    let graphStats = { nodes: 0, edges: 0, density: 0 };
    try {
      const rawResults = this.knowledgeGraph.query(query, graphMaxDepth);
      rawResults.forEach((value, key) => {
        graphResults[key] = value;
      });
      graphStats = this.knowledgeGraph.getStats();
      sourcesQueried.push("graph/knowledge-graph-store");
    } catch (err: any) {
      errors.push(`Knowledge graph error: ${err.message}`);
      graphResults = {};
    }

    // ── 4. Busca adicional via memorySearch (palavras-chave) ──
    try {
      const keywordResults = memorySearch(query, 3);
      if (keywordResults.length > 0 && textMemory === "Nenhuma informacao relevante encontrada na memoria.") {
        textMemory =
          "=== MEMORIA RELEVANTE ===\n\n" +
          keywordResults
            .map(
              (r) =>
                `[${r.file}] (relevancia: ${(r.score * 100).toFixed(0)}%)\n${r.content}\n`
            )
            .join("\n");
      }
      sourcesQueried.push("textual/memory-search");
    } catch {
      // Fallback opcional
    }

    const totalResults =
      (textMemory ? 1 : 0) + vectorResults.length + Object.keys(graphResults).length;

    logger.info(
      `[MemoryHub] queryAll("${query.slice(0, 50)}") → ${totalResults} resultados em ${Date.now() - startTime}ms`
    );

    return {
      textMemory,
      vectorResults,
      graphResults,
      graphStats,
      meta: {
        query,
        timestamp: Date.now(),
        sourcesQueried: [...new Set(sourcesQueried)],
        totalResults,
      },
    };
  }

  // ============================================================
  // storeAll — Salva nas 3 memórias simultaneamente
  // ============================================================

  /**
   * Armazena conteúdo em todas as 3 fontes de memória.
   *
   * 1. MEMORY.md via appendToMemory() ou saveDailyNote()
   * 2. VectorStore via store() com embeddings
   * 3. KnowledgeGraph via KnowledgeGraphExtractor (extração automática de entidades)
   */
  async storeAll(
    content: string,
    type: MemoryEntryType = "note",
    tags: string[] = []
  ): Promise<UnifiedStoreResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const sourcesStored: string[] = [];
    const timestamp = Date.now();

    let vectorId: string | undefined;
    let textSaved = false;
    let kgFactsExtracted = 0;

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return {
        textSaved: false,
        kgFactsExtracted: 0,
        errors: ["Conteúdo vazio"],
        meta: { content: "", type, timestamp, sourcesStored: [] },
      };
    }

    // ── 1. Salvar na memória textual (MEMORY.md + nota diária) ──
    try {
      // Mapear tipo para seção
      const sectionMap: Record<string, string> = {
        conversation: "Conversas",
        note: "Notas",
        fact: "Fatos",
        decision: "Decisões",
      };
      const section = sectionMap[type] || "Geral";

      // Salvar no MEMORY.md (fatos duradouros)
      if (type === "fact" || type === "decision") {
        appendToMemory(trimmedContent.slice(0, 500), section);
      }

      // Salvar nota diária (sempre)
      saveDailyNote(trimmedContent.slice(0, 2000));

      textSaved = true;
      sourcesStored.push("textual/memory-md");
    } catch (err: any) {
      errors.push(`Textual store error: ${err.message}`);
    }

    // ── 2. Salvar na memória vetorial ──
    try {
      vectorId = await this.vectorStoreInstance.store({
        content: trimmedContent,
        type,
        source: "memory-hub",
        tags,
      });
      sourcesStored.push("vector/vector-store");
    } catch (err: any) {
      errors.push(`Vector store error: ${err.message}`);
    }

    // ── 3. Extrair entidades e salvar no grafo de conhecimento ──
    //    AGORA: usa o KnowledgeGraphExtractor dedicado
    try {
      const source = type === "conversation" ? "conversation" : type;
      const result = this.knowledgeGraphExtractor.extractFromText(trimmedContent, source);
      kgFactsExtracted = result.count;
      if (kgFactsExtracted > 0) {
        sourcesStored.push("graph/knowledge-graph");
      }
    } catch (err: any) {
      errors.push(`Knowledge graph store error: ${err.message}`);
    }

    logger.info(
      `[MemoryHub] storeAll(${type}) → textual=${textSaved}, vector=${vectorId ? "ok" : "fail"}, kg=${kgFactsExtracted} fatos (${Date.now() - startTime}ms)`
    );

    return {
      vectorId,
      textSaved,
      kgFactsExtracted,
      errors,
      meta: {
        content: trimmedContent.slice(0, 100),
        type,
        timestamp,
        sourcesStored,
      },
    };
  }

  // ============================================================
  // Métodos auxiliares
  // ============================================================

  /**
   * Extrai entidades de uma interação completa (usuário + resposta).
   * Usa o KnowledgeGraphExtractor para fazer extração específica de conversas.
   */
  extractFromConversation(userInput: string, agentResponse: string): number {
    try {
      const result = this.knowledgeGraphExtractor.extractFromConversation(
        userInput,
        agentResponse
      );
      return result.count;
    } catch {
      return 0;
    }
  }

  /**
   * Obtém estatísticas de todas as memórias de uma vez.
   */
  getStats(): Record<string, unknown> {
    const vectorStats = this.vectorStoreInstance.getStats();
    const graphStats = this.knowledgeGraph.getStats();
    const extractorStats = this.knowledgeGraphExtractor.getStats();

    return {
      vectorStore: vectorStats,
      knowledgeGraph: graphStats,
      extractor: extractorStats,
      timestamp: Date.now(),
    };
  }

  /**
   * Salva o estado atual do KnowledgeGraph em disco.
   * Útil para garantir persistência após operações em lote.
   */
  saveGraph(): void {
    try {
      this.knowledgeGraph.save();
    } catch (err: any) {
      logger.error(`[MemoryHub] Erro ao salvar KG: ${err.message}`);
    }
  }
}

// ============================================================
// Singleton
// ============================================================

let hubInstance: MemoryHub | null = null;

/**
 * Retorna a instância singleton do MemoryHub.
 * Todos os componentes devem usar esta função.
 */
export function getMemoryHub(): MemoryHub {
  if (!hubInstance) {
    hubInstance = new MemoryHub();
    logger.info("[MemoryHub] Nova instância criada (singleton)");
  }
  return hubInstance;
}

/**
 * Reinicializa o MemoryHub (útil em testes).
 */
export function resetMemoryHub(): void {
  hubInstance = null;
  logger.info("[MemoryHub] Instância reinicializada");
}

export default MemoryHub;
