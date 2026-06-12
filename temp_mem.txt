/**
     * MemoryEngine - Sistema de memoria inteligente
     *
     * Tres capacidades:
     * 1. recall() - busca semantica com scoring de relevancia
     * 2. consolidate() - extrai fatos/decisoes/preferencias do transcript
     * 3. manageWorkingMemory() - compacta historico preservando contexto critico
     *
     * Substitui e expande o memory_search.ts original.
     */
    
    import * as fs from "fs";
    import * as path from "path";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    interface MemoryFragment {
      source: string;
      content: string;
      score: number;
      line: number;
    }
    
    interface TranscriptMessage {
      role: string;
      content: string;
    }
    
    interface ConsolidatedFact {
      type: "fact" | "decision" | "preference" | "learning";
      content: string;
    }
    
    // ============================================================
    // Constantes
    // ============================================================
    
    const MEMORY_FILE = path.join(process.cwd(), "MEMORY.md");
    const MEMORY_DIR = path.join(process.cwd(), "memory");
    const CONSOLIDATION_PATTERNS = [
      {
        regex: /(?:lembre[^.]*?(?:que|de)|recorda[^.]*?(?:que|de)|anota[^.]*?(?:que|de)|guarda[^.]*?(?:que|de))\s+(.+?)(?:[.!]|$)/gi,
        type: "fact" as const,
      },
      {
        regex: /(?:prefiro|prefere|gosto mais de|gosto de|prefer[^.]*?)\s+(.+?)(?:[.!]|$)/gi,
        type: "preference" as const,
      },
      {
        regex: /(?:decidi[^.]*?|decidiu[^.]*?|vamos\s+\w+\s+porque|a decis[^.]*?[eé])\s+(.+?)(?:[.!]|$)/gi,
        type: "decision" as const,
      },
      {
        regex: /(?:aprendi[^.]*?|descobri[^.]*?|aprendeu[^.]*?|descobriu[^.]*?)\s+(.+?)(?:[.!]|$)/gi,
        type: "learning" as const,
      },
    ];
    
    // ============================================================
    // MemoryEngine
    // ============================================================
    
    export class MemoryEngine {
      private memoryCache: string | null = null;
      private memoryCacheTime: number = 0;
      private readonly CACHE_TTL = 10_000; // 10 segundos
    
      /**
       * Busca semantica na memoria de longo prazo.
       * Rankeia fragmentos por relevancia ao contexto da conversa.
       */
      recall(query: string, context?: string, maxResults: number = 5): string {
        const results: MemoryFragment[] = [];
    
        // Normalizar termos de busca
        const queryTerms = this.tokenize(query);
        const contextTerms = context ? this.tokenize(context) : [];
    
        // Peso extra para termos do contexto atual
        const allTerms = [...queryTerms, ...contextTerms.map((t) => t + "_ctx")];
    
        // Buscar em MEMORY.md
        const memoryContent = this.getMemoryContent();
        if (memoryContent) {
          const lines = memoryContent.split("\n");
          let currentSection = "";
          let sectionBuffer: string[] = [];
    
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
    
            // Detectar secoes
            if (line.startsWith("## ")) {
              // Salvar buffer da secao anterior
              if (sectionBuffer.length > 0) {
                this.scoreAndAdd(
                  results,
                  sectionBuffer.join(" "),
                  `MEMORY.md (${currentSection || "Geral"})`,
                  i - sectionBuffer.length,
                  allTerms,
                  queryTerms
                );
              }
              currentSection = line.replace(/^##\s+/, "");
              sectionBuffer = [line];
            } else if (line.startsWith("# ")) {
              currentSection = line.replace(/^#\s+/, "");
              sectionBuffer = [line];
            } else if (line) {
              sectionBuffer.push(line);
            }
    
            // Se mudou de top-level section ou fim do arquivo
            if (
              (line.startsWith("## ") && sectionBuffer.length > 1) ||
              i === lines.length - 1
            ) {
              if (sectionBuffer.length > 1) {
                this.scoreAndAdd(
                  results,
                  sectionBuffer.join(" "),
                  `MEMORY.md (${currentSection || "Geral"})`,
                  i - sectionBuffer.length + 1,
                  allTerms,
                  queryTerms
                );
                // Reset buffer mantendo o header da nova secao
                sectionBuffer = line.startsWith("## ") ? [line] : [];
              }
            }
          }
        }
    
        // Buscar em notas diarias
        this.ensureMemoryDir();
        try {
          const files = fs
            .readdirSync(MEMORY_DIR)
            .filter((f) => f.endsWith(".md"))
            .sort()
            .reverse()
            .slice(0, 14); // Ultimas 2 semanas
    
          for (const file of files) {
            const content = fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
            const date = file.replace(".md", "");
            const paragraphs = content.split(/\n##\s+/);
    
            for (const para of paragraphs) {
              if (para.trim().length > 10) {
                this.scoreAndAdd(
                  results,
                  para.trim(),
                  `Nota diaria ${date}`,
                  0,
                  allTerms,
                  queryTerms
                );
              }
            }
          }
        } catch {
          // Diretorio de memoria pode nao existir
        }
    
        // Ordenar por score e limitar
        results.sort((a, b) => b.score - a.score);
        const top = results.slice(0, maxResults);
    
        if (top.length === 0) {
          return "Nenhuma informacao relevante encontrada na memoria.";
        }
    
        return (
          "=== MEMORIA RELEVANTE ===\n\n" +
          top
            .map(
              (r) =>
                `[${r.source}] (relevancia: ${(r.score * 100).toFixed(0)}%)\n${r.content}\n`
            )
            .join("\n")
        );
      }
    
      /**
       * Consolida aprendizado do transcript.
       * Extrai fatos, decisoes, preferencias e aprendizados.
       */
      consolidate(transcript: TranscriptMessage[]): ConsolidatedFact[] {
        const facts: ConsolidatedFact[] = [];
        const seenContent = new Set<string>();
    
        // Carregar conteudo atual do MEMORY.md para deduplicar
        const existingContent = this.getMemoryContent().toLowerCase();
    
        for (const msg of transcript) {
          if (msg.role === "tool" || msg.role === "system") continue;
    
          for (const pattern of CONSOLIDATION_PATTERNS) {
            const matches = msg.content.matchAll(pattern.regex);
            for (const match of matches) {
              const extracted = match[1].trim();
              // Evitar entradas muito curtas ou muito longas
              if (extracted.length < 10 || extracted.length > 300) continue;
              // Deduplicar
              const normalized = extracted.toLowerCase();
              if (seenContent.has(normalized)) continue;
              if (existingContent.includes(normalized)) continue;
    
              seenContent.add(normalized);
              facts.push({
                type: pattern.type,
                content: extracted,
              });
            }
          }
        }
    
        // Persistir novos fatos no MEMORY.md
        if (facts.length > 0) {
          this.appendFactsToMemory(facts);
        }
    
        return facts;
      }
    
      /**
       * Gerencia a working memory: compacta mensagens antigas
       * quando o total estimado de tokens excede o limite.
       */
      manageWorkingMemory(
        messages: TranscriptMessage[],
        maxTokens: number
      ): TranscriptMessage[] {
        const estimatedTokens = this.estimateTokens(
          messages.map((m) => m.content).join(" ")
        );
    
        if (estimatedTokens <= maxTokens || messages.length <= 7) {
          return messages;
        }
    
        // Manter primeiras 2 e ultimas 5 mensagens
        const keepFirst = 2;
        const keepLast = 5;
        const middle = messages.slice(keepFirst, -keepLast);
    
        if (middle.length === 0) return messages;
    
        // Sumarizar o meio
        const summary = this.summarizeMessages(middle);
    
        return [
          ...messages.slice(0, keepFirst),
          {
            role: "system",
            content: `[Resumo de ${middle.length} mensagens anteriores]: ${summary}`,
          },
          ...messages.slice(-keepLast),
        ];
      }
    
      // ============================================================
      // Metodos privados
      // ============================================================
    
      private tokenize(text: string): string[] {
        return text
          .toLowerCase()
          .replace(/[^a-z0-9áàâãéêíóôõúç\s]/g, " ")
          .split(/\s+/)
          .filter((t) => t.length > 1);
      }
    
      private getMemoryContent(): string {
        const now = Date.now();
        if (this.memoryCache && now - this.memoryCacheTime < this.CACHE_TTL) {
          return this.memoryCache;
        }
        try {
          this.memoryCache = fs.readFileSync(MEMORY_FILE, "utf-8");
          this.memoryCacheTime = now;
          return this.memoryCache;
        } catch {
          return "";
        }
      }
    
      private ensureMemoryDir(): void {
        if (!fs.existsSync(MEMORY_DIR)) {
          fs.mkdirSync(MEMORY_DIR, { recursive: true });
        }
      }
    
      private scoreAndAdd(
        results: MemoryFragment[],
        text: string,
        source: string,
        line: number,
        allTerms: string[],
        queryTerms: string[]
      ): void {
        const lowerText = text.toLowerCase();
        let score = 0;
    
        for (const term of allTerms) {
          if (term.endsWith("_ctx")) {
            // Termo do contexto: peso reduzido
            const t = term.replace("_ctx", "");
            if (lowerText.includes(t)) score += 1;
          } else {
            // Termo da query: peso normal
            if (lowerText.includes(term)) score += 2;
          }
        }
    
        // Bonus para match exato de frases
        for (const term of queryTerms) {
          if (term.length >= 5 && lowerText.includes(term)) {
            score += 1;
          }
        }
    
        if (score > 0) {
          const maxPossibleScore = allTerms.length * 2 + queryTerms.length;
          results.push({
            source,
            content: text.slice(0, 500),
            score: score / Math.max(maxPossibleScore, 1),
            line,
          });
        }
      }
    
      private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
      }
    
      private summarizeMessages(messages: TranscriptMessage[]): string {
        const userMessages = messages.filter((m) => m.role === "user");
        const assistantMessages = messages.filter((m) => m.role === "assistant");
    
        const userSummary =
          userMessages.length > 0
            ? `Usuario perguntou sobre: ${userMessages
                .map((m) => m.content.slice(0, 80))
                .join("; ")}`
            : "";
    
        const assistantSummary =
          assistantMessages.length > 0
            ? `Assistente respondeu sobre: ${assistantMessages
                .map((m) => m.content.slice(0, 80))
                .join("; ")}`
            : "";
    
        return [userSummary, assistantSummary]
          .filter(Boolean)
          .join(". ")
          .slice(0, 300);
      }
    
      private appendFactsToMemory(facts: ConsolidatedFact[]): void {
        const typeLabels: Record<string, string> = {
          fact: "Fatos",
          decision: "Decisoes",
          preference: "Preferencias",
          learning: "Aprendizados",
        };
    
        const grouped: Record<string, ConsolidatedFact[]> = {};
        for (const fact of facts) {
          if (!grouped[fact.type]) grouped[fact.type] = [];
          grouped[fact.type].push(fact);
        }
    
        const timestamp = new Date().toISOString().split("T")[0];
        let newContent = "";
    
        for (const [type, items] of Object.entries(grouped)) {
          const label = typeLabels[type] || type;
          newContent += `\n## ${label}\n`;
          for (const item of items) {
            newContent += `- [${timestamp}] ${item.content}\n`;
          }
        }
    
        // Adicionar ao MEMORY.md
        try {
          fs.appendFileSync(MEMORY_FILE, newContent, "utf-8");
        } catch {
          // Falha ao escrever nao deve quebrar o sistema
        }
      }
    }
    
    // Singleton
    let instance: MemoryEngine | null = null;
    
    export function getMemoryEngine(): MemoryEngine {
      if (!instance) {
        instance = new MemoryEngine();
      }
      return instance;
    }
    
    export default MemoryEngine;
    