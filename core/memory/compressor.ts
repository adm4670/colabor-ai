/**
     * compressor.ts - Compressão Hierárquica
     * 
     * Comprime working memory em múltiplos níveis:
     * N1: Sumário simples (tópicos, ações)
     * N2: Sumário com decisões e fatos extraídos
     * N3: Sumário consolidado (plano + resultados)
     */
    
    import { CompressedSummary } from "./memory-sota-types";
    
    interface CompressOptions {
      maxLevel: number; // 1-3
      preserveKeywords: string[];
    }
    
    const DEFAULT_OPTIONS: CompressOptions = {
      maxLevel: 3,
      preserveKeywords: ["plano", "objetivo", "decisão", "importante", "restrição", "aprendi"],
    };
    
    /**
     * Comprime hierarquicamente um conjunto de textos
     */
    export function compressHierarchical(
      texts: string[],
      options: Partial<CompressOptions> = {}
    ): CompressedSummary[] {
      const opts = { ...DEFAULT_OPTIONS, ...options };
      const results: CompressedSummary[] = [];

      // Level 1: Simple extraction of key sentences
      const level1 = compressLevel1(texts, opts);
      results.push(level1);

      let level2: CompressedSummary | undefined;
      if (opts.maxLevel >= 2) {
        // Level 2: Decision & fact extraction
        level2 = compressLevel2(texts, level1.summary, opts);
        results.push(level2);
      }

      if (opts.maxLevel >= 3) {
        // Level 3: Plan consolidation
        const level3 = compressLevel3(texts, level1.summary, level2?.summary || "", opts);
        results.push(level3);
      }

      return results;
    }
    function compressLevel1(
      texts: string[],
      opts: CompressOptions
    ): CompressedSummary {
      const lines: string[] = [];
      const seen = new Set<string>();
    
      for (const text of texts) {
        const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
        for (const sentence of sentences) {
          const lower = sentence.toLowerCase().trim();
          // Check if contains preserved keywords
          const hasKeyword = opts.preserveKeywords.some((kw) => lower.includes(kw));
          if (hasKeyword && !seen.has(lower.slice(0, 50))) {
            seen.add(lower.slice(0, 50));
            lines.push(sentence.trim());
          }
        }
      }
    
      const summary = lines.length > 0
        ? lines.slice(0, 5).join(". ") + "."
        : `[${texts.length} mensagens]`;
    
      return {
        originalIds: [],
        summary: summary.slice(0, 600),
        compressedAt: Date.now(),
        compressionLevel: 1,
      };
    }
    
    function compressLevel2(
      texts: string[],
      level1Summary: string,
      opts: CompressOptions
    ): CompressedSummary {
      const decisions: string[] = [];
      const facts: string[] = [];
    
      const decisionPatterns = [
        /decidi[^.]*./gi,
        /decidimos[^.]*./gi,
        /vamoss+w+[^.]*./gi,
        /escolh[^.]*./gi,
      ];
    
      const factPatterns = [
        /aprendi[^.]*./gi,
        /descobri[^.]*./gi,
        /importante[^.]*./gi,
        /lembre[^.]*./gi,
      ];
    
      for (const text of texts) {
        for (const pattern of decisionPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            decisions.push(match[0].trim());
          }
        }
        for (const pattern of factPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            facts.push(match[0].trim());
          }
        }
      }
    
      let summary = level1Summary;
      if (decisions.length > 0) {
        summary += " Decisões: " + decisions.slice(0, 3).join("; ") + ".";
      }
      if (facts.length > 0) {
        summary += " Fatos: " + facts.slice(0, 3).join("; ") + ".";
      }
    
      return {
        originalIds: [],
        summary: summary.slice(0, 800),
        compressedAt: Date.now(),
        compressionLevel: 2,
      };
    }
    
    function compressLevel3(
      texts: string[],
      _level1Summary: string,
      level2Summary: string,
      _opts: CompressOptions
    ): CompressedSummary {
      // Extract plan-related info
      let plan = "";
      const outcomes: string[] = [];
    
      for (const text of texts) {
        const lower = text.toLowerCase();
        if (lower.includes("plano") || lower.includes("objetivo") || lower.includes("meta")) {
          plan = text.slice(0, 300);
        }
        if (lower.includes("resultado") || lower.includes("concluído") || lower.includes("feito")) {
          outcomes.push(text.slice(0, 100));
        }
      }
    
      let summary = level2Summary;
      if (plan) summary += " Plano: " + plan + ".";
      if (outcomes.length > 0) summary += " Resultados: " + outcomes.slice(0, 3).join("; ") + ".";
    
      return {
        originalIds: [],
        summary: summary.slice(0, 1000),
        compressedAt: Date.now(),
        compressionLevel: 3,
      };
    }
    
    /**
     * Estima taxa de compressão
     */
    export function estimateCompressionRatio(
      originalTexts: string[],
      compressed: CompressedSummary[]
    ): number {
      const originalLen = originalTexts.reduce((s, t) => s + t.length, 0);
      const compressedLen = compressed.reduce((s, c) => s + c.summary.length, 0);
      return originalLen > 0 ? compressedLen / originalLen : 0;
    }
    