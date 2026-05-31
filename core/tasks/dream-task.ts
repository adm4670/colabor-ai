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
        const summaryLines: string[] = [];
    
        try {
          // 1. Coletar notas diarias recentes
          // loadRecentNotes() returns a string with recent notes content
          const recentNotesContent = loadRecentNotes();
          if (!recentNotesContent || recentNotesContent.length < 10) {
            return "No recent notes to consolidate.";
          }
    
          // Split into individual note entries
          const noteEntries = recentNotesContent
            .split(/\n(?=### \d{4}-\d{2}-\d{2})/)
            .filter((entry) => entry.trim().length > 0);
    
          if (noteEntries.length === 0) {
            return "No recent notes to consolidate.";
          }
    
          summaryLines.push(
            `## Consolidacao Automatica - ${new Date().toISOString().slice(0, 10)}`
          );
          summaryLines.push("");
    
          // 2. Extrair topics recorrentes
          const topicCounts = new Map<string, number>();
          const allText: string[] = [];
    
          for (const entry of noteEntries) {
            allText.push(entry);
            // Extrair topicos mencionados
            const topics = this.extractTopics(entry);
            for (const topic of topics) {
              topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
            }
          }
    
          // 3. Identificar padroes (topicos que aparecem multiplas vezes)
          const recurringTopics = Array.from(topicCounts.entries())
            .filter(([_, count]) => count >= 2)
            .sort(([_, a], [__, b]) => b - a)
            .map(([topic]) => topic);
    
          if (recurringTopics.length > 0) {
            summaryLines.push("### Temas Recorrentes");
            for (const topic of recurringTopics.slice(0, 10)) {
              summaryLines.push(`- ${topic} (${topicCounts.get(topic)} mencoes)`);
            }
            summaryLines.push("");
          }
    
          // 4. Adicionar ao MEMORY.md
          const consolidationEntry = summaryLines.join("\n") + "\n";
          appendToMemory(consolidationEntry, "Consolidacao Automatica");
    
          logger.info(
            `[DreamTask] Consolidacao concluida: ${recurringTopics.length} topicos recorrentes, ${noteEntries.length} notas processadas`
          );
    
          return `Memory consolidated: ${recurringTopics.length} recurring topics found across ${noteEntries.length} daily notes.`;
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
    