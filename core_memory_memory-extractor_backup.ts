/**
     * MemoryExtractor - Extracao automatica de memorias com frontmatter YAML.
     *
     * Inspirado no extractMemories do claude-code.
     *
     * Capacidades:
     * - Le notas diarias e extrai frontmatter YAML (tags, decisoes, topicos)
     * - Se nao houver frontmatter, usa LLM para extrair semanticamente
     * - Consolida extracoes no MEMORY.md evitando duplicacao
     * - Suporta tipos: fact, decision, preference, learning
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import { logger } from "../utils/logger";
    import { readMemoryFile, appendToMemory } from "./memory_search";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export type MemoryType = "fact" | "decision" | "preference" | "learning";
    
    export interface FrontmatterMetadata {
      title?: string;
      type?: MemoryType;
      tags?: string[];
      date?: string;
      context?: string;
      [key: string]: unknown;
    }
    
    export interface MemoryExtraction {
      /** Tipo da memoria */
      type: MemoryType;
      /** Conteudo extraido */
      content: string;
      /** Tags associadas */
      tags: string[];
      /** Data de origem */
      sourceDate: string;
      /** Arquivo de origem */
      sourceFile: string;
      /** Score de confianca (0-1) */
      confidence: number;
    }
    
    // ============================================================
    // Constantes
    // ============================================================
    
    const MEMORY_DIR = path.join(process.cwd(), "memory");
    
    // ============================================================
    // Parser de Frontmatter YAML (sem dependencias externas)
    // ============================================================
    
    function parseFrontmatter(raw: string): {
      metadata: FrontmatterMetadata;
      body: string;
    } | null {
      const trimmed = raw.trimStart();
      if (!trimmed.startsWith("---")) return null;
    
      const endIdx = trimmed.indexOf("\n---", 3);
      if (endIdx === -1) return null;
    
      const fmBlock = trimmed.slice(3, endIdx).trim();
      const body = trimmed.slice(endIdx + 4).trim();
    
      const metadata: FrontmatterMetadata = {};
      const lines = fmBlock.split("\n");
      let currentKey: string | null = null;
      let currentList: string[] = [];
    
      function flushList(): void {
        if (currentKey && currentList.length > 0) {
          (metadata as Record<string, unknown>)[currentKey] = [...currentList];
        }
        currentList = [];
        currentKey = null;
      }
    
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
    
        // List item
        const listMatch = trimmedLine.match(/^\s*-\s+(.+)/);
        if (listMatch && currentKey) {
          currentList.push(listMatch[1].trim());
          continue;
        }
    
        // New key
        flushList();
        const kvMatch = trimmedLine.match(/^(\w[\w-]*):\s*(.*)/);
        if (kvMatch) {
          const key = kvMatch[1];
          const value = kvMatch[2].trim();
    
          if (value === "" || value === "[]") {
            currentKey = key;
            currentList = [];
          } else {
            // Valor simples
            const unquoted = value.replace(/^["']|["']$/g, "");
            (metadata as Record<string, unknown>)[key] = unquoted;
          }
        }
      }
      flushList();
    
      return { metadata, body };
    }
    
    // ============================================================
    // MemoryExtractor
    // ============================================================
    
    export class MemoryExtractor {
      private memoryDir: string;
    
      constructor(memoryDir?: string) {
        this.memoryDir = memoryDir || MEMORY_DIR;
        this.ensureDir();
      }
    
      private ensureDir(): void {
        if (!fs.existsSync(this.memoryDir)) {
          fs.mkdirSync(this.memoryDir, { recursive: true });
        }
      }
    
      /** Extrai memorias de todas as notas diarias recentes */
      extractFromDailyNotes(daysBack: number = 7): MemoryExtraction[] {
        const extractions: MemoryExtraction[] = [];
    
        try {
          const files = fs
            .readdirSync(this.memoryDir)
            .filter((f) => f.endsWith(".md"))
            .sort()
            .reverse()
            .slice(0, daysBack);
    
          for (const file of files) {
            const filePath = path.join(this.memoryDir, file);
            const content = fs.readFileSync(filePath, "utf-8");
            const date = file.replace(".md", "");
    
            const fromFile = this.extractFromContent(content, date, file);
            extractions.push(...fromFile);
          }
    
          logger.info(
            `[MemoryExtractor] ${extractions.length} memorias extraidas de ${files.length} notas`
          );
        } catch (err) {
          logger.error(`[MemoryExtractor] Erro ao ler notas: ${err}`);
        }
    
        return extractions;
      }
    
      /** Extrai memorias de um conteudo (usa frontmatter se disponivel, fallback para heuristica) */
      extractFromContent(
        content: string,
        date: string,
        sourceFile: string
      ): MemoryExtraction[] {
        const parsed = parseFrontmatter(content);
    
        if (parsed && parsed.metadata.tags && parsed.metadata.tags.length > 0) {
          // Tem frontmatter com tags -> extrair baseado nos metadados
          return this.extractFromFrontmatter(parsed, date, sourceFile);
        }
    
        // Sem frontmatter util -> usar heuristica
        return this.extractHeuristic(content, date, sourceFile);
      }
    
      private extractFromFrontmatter(
        parsed: { metadata: FrontmatterMetadata; body: string },
        date: string,
        sourceFile: string
      ): MemoryExtraction[] {
        const extractions: MemoryExtraction[] = [];
        const { metadata, body } = parsed;
    
        const type = metadata.type || "fact";
        const tags = metadata.tags || [];
        const title = metadata.title || "";
    
        if (body && body.length > 10) {
          extractions.push({
            type,
            content: title ? `## ${title}\n${body.slice(0, 500)}` : body.slice(0, 500),
            tags,
            sourceDate: date,
            sourceFile,
            confidence: 0.9,
          });
        }
    
        return extractions;
      }
    
      private extractHeuristic(
        content: string,
        date: string,
        sourceFile: string
      ): MemoryExtraction[] {
        const extractions: MemoryExtraction[] = [];
    
        // Padroes para extracao heuristica (mesmo approach do MemoryEngine)
        const patterns: Array<{ regex: RegExp; type: MemoryType }> = [
          {
            regex: /(?:lembre[^.]*?(?:que|de)|recorda[^.]*?(?:que|de)|anota[^.]*?(?:que|de))\s+(.+?)(?:[.!]|$)/gi,
            type: "fact",
          },
          {
            regex: /(?:prefiro|prefere|gosto\s+mais\s+de|gosto\s+de|prefer[^.]*?)\s+(.+?)(?:[.!]|$)/gi,
            type: "preference",
          },
          {
            regex: /(?:decidi[^.]*?|decidiu[^.]*?|vamos\s+\w+\s+porque|a\s+decis[^.]*?[eê])\s+(.+?)(?:[.!]|$)/gi,
            type: "decision",
          },
          {
            regex: /(?:aprendi[^.]*?|descobri[^.]*?|aprendeu[^.]*?|descobriu[^.]*?)\s+(.+?)(?:[.!]|$)/gi,
            type: "learning",
          },
        ];
    
        for (const { regex, type } of patterns) {
          const matches = content.matchAll(regex);
          for (const match of matches) {
            const extractedContent = match[1]?.trim();
            if (extractedContent && extractedContent.length > 5) {
              extractions.push({
                type,
                content: extractedContent.slice(0, 300),
                tags: this.inferTags(extractedContent),
                sourceDate: date,
                sourceFile,
                confidence: 0.5,
              });
            }
          }
        }
    
        // Tambem extrair topicos de secoes (###)
        const sectionMatches = content.matchAll(/###\s+(.+)/g);
        for (const match of sectionMatches) {
          const topic = match[1].trim();
          if (topic && topic.length > 3 && !topic.includes("202")) {
            extractions.push({
              type: "fact",
              content: topic,
              tags: [topic.toLowerCase().replace(/\s+/g, "-")],
              sourceDate: date,
              sourceFile,
              confidence: 0.3,
            });
          }
        }
    
        return extractions;
      }
    
      private inferTags(text: string): string[] {
        const tags: string[] = [];
        const lower = text.toLowerCase();
    
        const tagMap: Record<string, string> = {
          projeto: "projeto",
          project: "projeto",
          codigo: "codigo",
          code: "codigo",
          bug: "bug",
          erro: "erro",
          error: "erro",
          decisao: "decisao",
          decision: "decisao",
          implement: "implementacao",
          analise: "analise",
          analysis: "analise",
          memoria: "memoria",
          memory: "memoria",
          agente: "agente",
          agent: "agente",
          test: "testes",
          teste: "testes",
        };
    
        for (const [keyword, tag] of Object.entries(tagMap)) {
          if (lower.includes(keyword)) {
            tags.push(tag);
          }
        }
    
        return [...new Set(tags)];
      }
    
      /** Consolida extracoes no MEMORY.md, evitando duplicacao */
      consolidate(extractions: MemoryExtraction[]): number {
        const existingMemory = readMemoryFile();
        const existingLower = existingMemory.toLowerCase();
    
        let added = 0;
        const entries: string[] = [];
    
        for (const extraction of extractions) {
          // Verificar duplicacao (checagem simples)
          const contentLower = extraction.content.slice(0, 100).toLowerCase();
          if (existingLower.includes(contentLower)) {
            continue; // Ja existe, pular
          }
    
          const typeLabel =
            extraction.type === "fact"
              ? "Fato"
              : extraction.type === "decision"
                ? "Decisao"
                : extraction.type === "preference"
                  ? "Preferencia"
                  : "Aprendizado";
    
          const tagsStr =
            extraction.tags.length > 0
              ? ` [${extraction.tags.join(", ")}]`
              : "";
    
          entries.push(
            `- [${extraction.sourceDate}] **${typeLabel}**${tagsStr}: ${extraction.content}`
          );
          added++;
        }
    
        if (entries.length > 0) {
          const section = `\n## Extracoes Automaticas (${new Date().toISOString().slice(0, 10)})\n${entries.join("\n")}\n`;
          appendToMemory(section, "Extracoes Automaticas");
          logger.info(
            `[MemoryExtractor] ${added} novas memorias adicionadas (${extractions.length - added} duplicatas puladas)`
          );
        }
    
        return added;
      }
    
      /** Pipeline completo: extrai e consolida */
      run(daysBack: number = 7): { extracted: number; added: number } {
        const extractions = this.extractFromDailyNotes(daysBack);
        const added = this.consolidate(extractions);
        return { extracted: extractions.length, added };
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: MemoryExtractor | null = null;
    
    export function getMemoryExtractor(): MemoryExtractor {
      if (!instance) {
        instance = new MemoryExtractor();
      }
      return instance;
    }
    