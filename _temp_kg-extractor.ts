/**
 * kg-extractor.ts — Extrator automático de entidades para o KnowledgeGraph
 *
 * Extrai relações "sujeito → predicado → objeto" de textos em linguagem natural
 * usando patterns de português e inglês, e persiste no KnowledgeGraphStore global.
 *
 * Uso:
 *   const extractor = new KnowledgeGraphExtractor();
 *   extractor.extractFromConversation("O usuário prefere Python", "OK");
 *   extractor.extractFromText("O projeto usa TypeScript");
 */

import { getKnowledgeGraphStore, KnowledgeGraphStore } from "./knowledge-graph";
import { logger } from "../utils/logger";

// ============================================================
// Tipos
// ============================================================

export interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  timestamp: number;
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  count: number;
  source: string;
  timestamp: number;
}

export type ExtractionMode = "aggressive" | "conservative" | "balanced";

// ============================================================
// Padrões de extração — ORGANIZADOS POR CATEGORIA
// ============================================================

interface PatternGroup {
  name: string;
  patterns: RegExp[];
  defaultConfidence: number;
  description: string;
}

const PATTERN_GROUPS: PatternGroup[] = [
  // ── IDENTIDADE: X é/são/é considerado Y ──
  {
    name: "identity",
    description: "Relações de identidade: X é Y, X são Y",
    defaultConfidence: 0.85,
    patterns: [
      // Português
      /([\w\sà-úÀ-Ú]+)\s+(é|são|era|era|foram|será|serão|seja)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(is|are|was|were|will be|being)\s+([\w\s]+)/gi,
    ],
  },

  // ── POSSE / COMPOSIÇÃO: X tem/possui/contém Y ──
  {
    name: "possession",
    description: "Relações de posse: X tem Y, X possui Y, X contém Y",
    defaultConfidence: 0.8,
    patterns: [
      // Português
      /([\w\sà-úÀ-Ú]+)\s+(tem|possui|contém|contêm|inclui| Engloba|abrange|oferece|fornece)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(has|have|contains|includes|includes|offers|provides)\s+([\w\s]+)/gi,
    ],
  },

  // ── USO / DEPENDÊNCIA: X usa/utiliza/depende de Y ──
  {
    name: "usage",
    description: "Relações de uso: X usa Y, X depende de Y, X utiliza Y",
    defaultConfidence: 0.9,
    patterns: [
      // Português
      /([\w\sà-úÀ-Ú]+)\s+(usa|utiliza|emprega|adota|implementa|roda|executa)\s+([\w\sà-úÀ-Ú]+)/gi,
      /([\w\sà-úÀ-Ú]+)\s+(depende\s+de|dependem\s+de|baseia-se\s+em|baseado\s+em|fundamentado\s+em)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(uses|utilizes|employs|adopts|implements|runs|depends on|based on|built on)\s+([\w\s]+)/gi,
    ],
  },

  // ── LOCALIZAÇÃO: X está/fica/localiza-se em Y ──
  {
    name: "location",
    description: "Relações espaciais: X está em Y, X fica em Y",
    defaultConfidence: 0.75,
    patterns: [
      // Português
      /([\w\sà-úÀ-Ú]+)\s+(está\s+em|fica\s+em|localiza-se\s+em|encontra-se\s+em|situa-se\s+em)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(is located in|is in|resides in|sits in|can be found in)\s+([\w\s]+)/gi,
    ],
  },

  // ── PREFERÊNCIA: X prefere/gosta de Y ──
  {
    name: "preference",
    description: "Relações de preferência: X prefere Y, X gosta de Y",
    defaultConfidence: 0.7,
    patterns: [
      // Português
      /([\w\sà-úÀ-Ú]+)\s+(prefere|gosta\s+de|gostam\s+de|ama|adora|curte|aprecia)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(prefers|likes|loves|enjoys|adores|is fond of)\s+([\w\s]+)/gi,
    ],
  },

  // ── DECISÃO / AÇÃO: X decide/decidiu/planeja Y ──
  {
    name: "decision",
    description: "Relações de decisão: X decide Y, X planeja Y, X criou Y",
    defaultConfidence: 0.85,
    patterns: [
      // Português
      /([\w\sà-úÀ-Ú]+)\s+(decide|decidiu|decidi|planeja|planejou|criou|cria|desenvolve|desenvolveu|implementou)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(decides|decided|plans|planned|creates|created|develops|developed|builds|built)\s+([\w\s]+)/gi,
    ],
  },

  // ── COMUNICAÇÃO: X disse/falou/perguntou Y ──
  {
    name: "communication",
    description: "Relações de comunicação: X disse Y, X perguntou Y",
    defaultConfidence: 0.6,
    patterns: [
      // Português
      /([\w\sà-úÀ-Ú]+)\s+(disse|falou|perguntou|respondeu|comentou|explicou|sugeriu|recomendou|pediu|solicitou)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(said|spoke|asked|answered|commented|explained|suggested|recommended|requested)\s+([\w\s]+)/gi,
    ],
  },

  // ── CARACTERÍSTICA: X é caracterizado por Y / X tem propriedade Y ──
  {
    name: "characteristic",
    description: "Características e atributos",
    defaultConfidence: 0.7,
    patterns: [
      // "X chamado Y", "X conhecido como Y", "X nomeado Y"
      /([\w\sà-úÀ-Ú]+)\s+(chamado|chamada|conhecido\s+como|conhecida\s+como|nomeado|nomeada|denominado)\s+([\w\sà-úÀ-Ú]+)/gi,
      // "X significa Y", "X representa Y"
      /([\w\sà-úÀ-Ú]+)\s+(significa|representa|refere-se\s+a|equivale\s+a)\s+([\w\sà-úÀ-Ú]+)/gi,
      // English
      /([\w\s]+)\s+(called|known as|named|means|represents|refers to)\s+([\w\s]+)/gi,
    ],
  },
];

// ============================================================
// Lista de stop-words (palavras que não devem ser sujeito/objeto)
// ============================================================

const STOP_WORDS = new Set([
  "ele", "ela", "eles", "elas", "você", "voce", "tu", "nós", "nos", "vós", "vos",
  "isto", "isso", "aquilo", "este", "esta", "esse", "essa", "aquele", "aquela",
  "algo", "alguém", "alguem", "ninguém", "ninguem", "tudo", "nada", "cada",
  "meu", "minha", "teu", "tua", "seu", "sua", "nosso", "nossa",
  "he", "she", "it", "they", "them", "you", "we", "us",
  "this", "that", "these", "those", "something", "someone", "anyone",
  "everyone", "everything", "nothing", "anything",
  "my", "your", "his", "her", "its", "our", "their",
]);

// ============================================================
// KnowledgeGraphExtractor
// ============================================================

export class KnowledgeGraphExtractor {
  private kg: KnowledgeGraphStore;
  private extractionCount = 0;
  private lastExtraction: string | null = null;
  private mode: ExtractionMode = "balanced";

  constructor(knowledgeGraph?: KnowledgeGraphStore) {
    this.kg = knowledgeGraph ?? getKnowledgeGraphStore();
  }

  /** Define o modo de extração (quantos padrões aplicar) */
  setMode(mode: ExtractionMode): void {
    this.mode = mode;
  }

  // ============================================================
  // Métodos principais
  // ============================================================

  /**
   * Extrai fatos de um texto e adiciona ao KnowledgeGraph.
   * Retorna a lista de fatos extraídos.
   */
  extractFromText(
    content: string,
    source: string = "text",
    confidenceOverride?: number
  ): ExtractionResult {
    const facts: ExtractedFact[] = [];
    const timestamp = Date.now();

    for (const group of PATTERN_GROUPS) {
      // No modo conservative, pular grupos de baixa confiança
      if (this.mode === "conservative" && group.defaultConfidence < 0.8) continue;
      // No modo aggressive, aplicar todos os grupos
      // No modo balanced, pular apenas communication
      if (this.mode === "balanced" && group.name === "communication") continue;

      for (const pattern of group.patterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const fact = this.buildFact(
            match,
            group,
            source,
            timestamp,
            confidenceOverride
          );
          if (fact) {
            facts.push(fact);
          }
        }
      }
    }

    // Persistir no KnowledgeGraph
    for (const fact of facts) {
      this.kg.addFact(fact.subject, fact.predicate, fact.object, fact.confidence);
    }

    this.extractionCount += facts.length;
    this.lastExtraction = source;

    return {
      facts,
      count: facts.length,
      source,
      timestamp,
    };
  }

  /**
   * Extrai fatos de uma interação completa (usuário + agente).
   */
  extractFromConversation(
    userInput: string,
    agentResponse: string
  ): ExtractionResult {
    const combined = `${userInput}\n${agentResponse}`;
    const result = this.extractFromText(combined, "conversation");

    // Registrar metadado da conversa
    if (result.count > 0) {
      this.kg.addFact("user", "had_conversation", new Date().toISOString().split("T")[0], 0.5);
    }

    return result;
  }

  /**
   * Extrai fatos de um array de fatos de scan (GraphFact[]).
   * Útil para integrar com o knowledgeGraphScanTool.
   */
  extractFromScanFacts(
    scanFacts: Array<{ subject: string; predicate: string; object: string; confidence: number }>
  ): ExtractionResult {
    const facts: ExtractedFact[] = [];
    const timestamp = Date.now();

    for (const fact of scanFacts) {
      // Só extrair relações semânticas (pular metadados)
      if (fact.predicate === "is_file" || fact.predicate === "is_directory") continue;
      if (fact.predicate === "size_category" || fact.predicate === "has_extension") continue;

      facts.push({
        subject: fact.subject.toLowerCase(),
        predicate: fact.predicate.toLowerCase(),
        object: fact.object.toLowerCase(),
        confidence: fact.confidence,
        source: "scan",
        timestamp,
      });

      this.kg.addFact(fact.subject, fact.predicate, fact.object, fact.confidence);
    }

    this.extractionCount += facts.length;
    this.lastExtraction = "scan";

    return {
      facts,
      count: facts.length,
      source: "scan",
      timestamp,
    };
  }

  /**
   * Extrai manualmente uma única relação.
   */
  extractFact(
    subject: string,
    predicate: string,
    object: string,
    confidence: number = 0.8
  ): void {
    this.kg.addFact(subject, predicate, object, confidence);
    this.extractionCount++;
    this.lastExtraction = "manual";
  }

  // ============================================================
  // Estatísticas
  // ============================================================

  getStats(): { totalExtractions: number; lastExtraction: string | null; mode: ExtractionMode } {
    return {
      totalExtractions: this.extractionCount,
      lastExtraction: this.lastExtraction,
      mode: this.mode,
    };
  }

  getPatternGroups(): PatternGroup[] {
    return PATTERN_GROUPS;
  }

  resetCounters(): void {
    this.extractionCount = 0;
    this.lastExtraction = null;
  }

  // ============================================================
  // Métodos privados
  // ============================================================

  /**
   * Constrói um ExtractedFact a partir de um match de regex.
   * Aplica filtros de qualidade e retorna null se inválido.
   */
  private buildFact(
    match: RegExpMatchArray,
    group: PatternGroup,
    source: string,
    timestamp: number,
    confidenceOverride?: number
  ): ExtractedFact | null {
    if (match.length < 4) return null;

    const subject = this.cleanEntity(match[1]);
    const predicate = this.normalizePredicate(match[2]);
    const object = this.cleanEntity(match[3]);

    // Filtros de qualidade
    if (!this.isValidEntity(subject) || !this.isValidEntity(object)) return null;
    if (subject === object) return null;

    // Não extrair se sujeito ou objeto forem stop-words
    if (STOP_WORDS.has(subject) || STOP_WORDS.has(object)) return null;

    // Limitar tamanho
    if (subject.length > 60 || object.length > 60) return null;
    if (subject.length < 2 || object.length < 2) return null;

    const confidence = confidenceOverride ?? group.defaultConfidence;

    return {
      subject,
      predicate,
      object,
      confidence: this.adjustConfidence(confidence, subject, object),
      source,
      timestamp,
    };
  }

  /**
   * Limpa uma entidade: trim, lowercase, remove pontuação final.
   */
  private cleanEntity(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[.!?,;:()\[\]{}"']+$/g, "")
      .replace(/^[.!?,;:()\[\]{}"']+/g, "")
      .trim();
  }

  /**
   * Normaliza o predicado para um formato canônico.
   */
  private normalizePredicate(raw: string): string {
    const pred = raw.trim().toLowerCase();

    // Mapear variações para canônico
    const canonicalMap: Record<string, string> = {
      "é": "é",
      "são": "são",
      "era": "era",
      "foram": "foram",
      "será": "é",
      "serão": "são",
      "is": "é",
      "are": "são",
      "was": "era",
      "were": "foram",
      "tem": "tem",
      "possui": "possui",
      "contém": "contém",
      "contêm": "contém",
      "has": "tem",
      "have": "tem",
      "contains": "contém",
      "usa": "usa",
      "utiliza": "usa",
      "uses": "usa",
      "utilizes": "usa",
      "depende de": "depende de",
      "depends on": "depende de",
      "está em": "está em",
      "is located in": "está em",
      "prefere": "prefere",
      "gosta de": "prefere",
      "prefers": "prefere",
      "decide": "decide",
      "decidiu": "decide",
      "decided": "decide",
      "criou": "criou",
      "creates": "criou",
      "created": "criou",
      "chamado": "chamado",
      "called": "chamado",
      "known as": "conhecido como",
      "significa": "significa",
      "means": "significa",
    };

    return canonicalMap[pred] || pred;
  }

  /**
   * Verifica se uma entidade é válida (não é número, não é muito curta, etc.)
   */
  private isValidEntity(entity: string): boolean {
    if (!entity || entity.length < 2) return false;
    if (/^\d+$/.test(entity)) return false; // Só números
    if (/^[a-zA-Z]$/.test(entity)) return false; // Só 1 letra
    return true;
  }

  /**
   * Ajusta a confiança baseado em heurísticas.
   */
  private adjustConfidence(base: number, subject: string, object: string): number {
    let confidence = base;

    // Entidades mais longas tendem a ser mais específicas → maior confiança
    if (subject.length > 10) confidence += 0.05;
    if (object.length > 10) confidence += 0.05;

    // Se contém palavras técnicas → maior confiança
    const techWords = ["agent", "tool", "api", "plugin", "system", "arquivo",
      "função", "funcao", "classe", "método", "metodo", "interface",
      "typescript", "python", "javascript", "node", "express", "react"];
    for (const word of techWords) {
      if (subject.includes(word) || object.includes(word)) {
        confidence += 0.1;
        break;
      }
    }

    // Cap em 0.99
    return Math.min(confidence, 0.99);
  }
}

// ============================================================
// Singleton
// ============================================================

let extractorInstance: KnowledgeGraphExtractor | null = null;

/**
 * Retorna a instância singleton do KnowledgeGraphExtractor.
 */
export function getKnowledgeGraphExtractor(): KnowledgeGraphExtractor {
  if (!extractorInstance) {
    extractorInstance = new KnowledgeGraphExtractor();
    logger.info("[KGExtractor] Nova instância criada (singleton)");
  }
  return extractorInstance;
}

/**
 * Reinicializa o extrator.
 */
export function resetKnowledgeGraphExtractor(): void {
  extractorInstance = null;
  logger.info("[KGExtractor] Instância reinicializada");
}

export default KnowledgeGraphExtractor;
