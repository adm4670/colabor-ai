/**
     * DreamTask - Consolidacao periodica de memoria.
     *
     * Inspirado no DreamTask e autoDream do claude-code.
     * Roda como background task periodica para:
     * - Consolidar notas diarias em MEMORY.md
     * - Extrair fatos, decisoes, preferencias dos transcripts
     * - Atualizar o indice de memoria
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import { logger } from "../utils/logger";
    import { getMemoryExtractor } from "../memory/memory-extractor";
    import {
      loadRecentNotes,
      saveDailyNote,
      readMemoryFile,
      appendToMemory,
    } from "../memory/memory_search";
    
    // ============================================================
    // Constantes
    // ============================================================
    
    const COL_AI_DIR = path.join(process.cwd(), ".colabor-ai");
    const DREAM_STATE_FILE = path.join(COL_AI_DIR, "dream_state.json");
    
    // ============================================================
    // Tipos
    // ============================================================
    
    interface DreamState {
      lastConsolidatedAt: number;
      sessionsSinceLastConsolidation: number;
    }
    
    // ============================================================
    // DreamTask
    // ============================================================
    
    export class DreamTask {
      private minHours: number;
      private minSessions: number;
      private state: DreamState;
    
      constructor(minHours: number = 24, minSessions: number = 3) {
        this.minHours = minHours;
        this.minSessions = minSessions;
        this.state = this.loadState();
      }
    
      /** Verifica se deve consolidar e executa se necessario */
      async maybeConsolidate(): Promise<string | null> {
        if (!this.shouldConsolidate()) return null;
    
        logger.info("[DreamTask] Iniciando consolidacao de memoria...");
        const summary = await this.consolidate();
    
        // Atualizar estado
        this.state.lastConsolidatedAt = Date.now();
        this.state.sessionsSinceLastConsolidation = 0;
        this.saveState();
    
        return summary;
      }
    
      /** Registra que uma sessao ocorreu (chamado ao final de cada sessao) */
      registerSession(): void {
        this.state.sessionsSinceLastConsolidation++;
        this.saveState();
      }
    
      private shouldConsolidate(): boolean {
        const hoursSince =
          (Date.now() - this.state.lastConsolidatedAt) / (1000 * 60 * 60);
        return (
          hoursSince >= this.minHours &&
          this.state.sessionsSinceLastConsolidation >= this.minSessions
        );
      }
    
      private async consolidate(): Promise<string> {
        try {
          // Usar MemoryExtractor para extracao com frontmatter + fallback heuristico
          const extractor = getMemoryExtractor();
          const result = extractor.run(7); // ultimos 7 dias
    
          if (result.extracted === 0) {
            return "No recent notes to consolidate.";
          }
    
          const summary = [
            `## Consolidacao Automatica - ${new Date().toISOString().slice(0, 10)}`,
            "",
            `- ${result.extracted} memorias extraidas de notas diarias`,
            `- ${result.added} novas memorias adicionadas ao MEMORY.md`,
            `- ${result.extracted - result.added} duplicatas ignoradas`,
            "",
          ].join("\n");
    
          appendToMemory(summary, "Consolidacao Automatica");
    
          logger.info(
            `[DreamTask] Consolidacao concluida: ${result.added} novas memorias de ${result.extracted} extracoes`
          );
    
          return `Memory consolidated: ${result.added} new memories from ${result.extracted} extractions.`;
        } catch (err: any) {
          logger.error(`[DreamTask] Erro na consolidacao: ${err?.message || err}`);
          return `Dream consolidation failed: ${err?.message || String(err)}`;
        }
      }
    
      private extractTopics(text: string): string[] {
        const topics: string[] = [];
    
        // Extrair palavras-chave baseado em padroes comuns
        const patterns = [
          /(?:projeto|project)\s+["\u201C]?(\w[\w\s-]+)/gi,
          /(?:arquivo|file)\s+[\w./\\-]+/gi,
          /(?:erro|error|bug)\s+[^.]+/gi,
          /(?:decis|decision)\s+[^.]+/gi,
          /(?:implement|implementacao)\s+[^.]+/gi,
          /(?:analis|analise)\s+[^.]+/gi,
          /#\w+/g, // hashtags
        ];
    
        for (const pattern of patterns) {
          const matches = text.match(pattern);
          if (matches) {
            topics.push(...matches.map((m) => m.trim().slice(0, 80)));
          }
        }
    
        return [...new Set(topics)];
      }
    
      // ============================================================
      // Persistencia do estado
      // ============================================================
    
      private loadState(): DreamState {
        try {
          if (!fs.existsSync(COL_AI_DIR)) {
            fs.mkdirSync(COL_AI_DIR, { recursive: true });
          }
          if (fs.existsSync(DREAM_STATE_FILE)) {
            const data = fs.readFileSync(DREAM_STATE_FILE, "utf-8");
            return JSON.parse(data);
          }
        } catch {
          // Usar defaults
        }
        return {
          lastConsolidatedAt: Date.now(),
          sessionsSinceLastConsolidation: 0,
        };
      }
    
      private saveState(): void {
        try {
          if (!fs.existsSync(COL_AI_DIR)) {
            fs.mkdirSync(COL_AI_DIR, { recursive: true });
          }
          fs.writeFileSync(
            DREAM_STATE_FILE,
            JSON.stringify(this.state, null, 2),
            "utf-8"
          );
        } catch {
          // Silencioso
        }
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: DreamTask | null = null;
    
    export function getDreamTask(): DreamTask {
      if (!instance) {
        instance = new DreamTask();
      }
      return instance;
    }
    