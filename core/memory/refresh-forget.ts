import { logger } from "../utils/logger";
/**
     * refresh-forget.ts - Refresh & Esquecimento
     * 
     * - Meia-vida dinâmica para memórias
     * - Refresh a cada 20 passos ou sinal de confusão
     * - Esquecimento ativo após 3 ciclos sem acesso
     */
    
    import { EpisodicMemory, RefreshRecord } from "./memory-sota-types";
    
    // ============================================================
    // Constants
    // ============================================================
    
    const REFRESH_INTERVAL = 20; // steps
    const FORGET_CYCLES = 3; // ciclos sem acesso = esquecimento
    const HALF_LIFE_BASE = 1000 * 60 * 60; // 1 hora (em ms)
    const HALF_LIFE_DYNAMIC_FACTOR = 0.8; // Reduz meia-vida para memórias pouco acessadas
    
    // ============================================================
    // Half-life calculation
    // ============================================================
    
    function calculateHalfLife(memory: { accessCount: number; timestamp: number; lastAccess: number }): number {
      const age = Date.now() - memory.timestamp;
      const hoursSinceCreation = age / (1000 * 60 * 60);
    
      // More accessed = longer half-life
      const accessBonus = Math.min(memory.accessCount * 0.2, 2.0);
    
      // Recently accessed = longer half-life
      const recencyBonus = (Date.now() - memory.lastAccess) < 1000 * 60 * 30 ? 1.5 : 1.0;
    
      return HALF_LIFE_BASE * (1 + accessBonus) * recencyBonus;
    }
    
    function isForgotten(memory: { accessCount: number; timestamp: number; lastAccess: number }): boolean {
      const halfLife = calculateHalfLife(memory);
      const timeSinceLastAccess = Date.now() - memory.lastAccess;
    
      // After FORGET_CYCLES half-lives without access, memory is forgotten
      return timeSinceLastAccess > halfLife * FORGET_CYCLES;
    }
    
    function getMemoryStrength(memory: { accessCount: number; timestamp: number; lastAccess: number }): number {
      const halfLife = calculateHalfLife(memory);
      const timeSinceLastAccess = Date.now() - memory.lastAccess;
    
      // Exponential decay based on half-life
      return Math.pow(0.5, timeSinceLastAccess / halfLife);
    }
    
    // ============================================================
    // Refresh & Forget Manager
    // ============================================================
    
    export class RefreshForgetManager {
      private refreshHistory: RefreshRecord[] = [];
      private stepCount = 0;
      private lastRefreshStep = 0;
    
      constructor() {
        this.stepCount = 0;
        this.lastRefreshStep = 0;
      }
    
      /** Chamado a cada passo do agente */
      step(): void {
        this.stepCount++;
      }
    
      /** Verifica se precisa de refresh */
      needsRefresh(confusionSignal: boolean = false): boolean {
        const stepsSinceRefresh = this.stepCount - this.lastRefreshStep;
        return stepsSinceRefresh >= REFRESH_INTERVAL || confusionSignal;
      }
    
      /** Executa refresh nas memórias */
      refresh(memories: EpisodicMemory[]): {
        refreshed: number;
        forgotten: number;
        activeMemories: EpisodicMemory[];
      } {
        this.lastRefreshStep = this.stepCount;
    
        // Refresh: touch recent important memories
        let refreshed = 0;
        const activeMemories: EpisodicMemory[] = [];
        let forgotten = 0;
    
        for (const memory of memories) {
          if (isForgotten(memory)) {
            forgotten++;
            continue; // Remove (esquecimento ativo)
          }
    
          // Refresh: update lastAccess for recently used memories
          if (getMemoryStrength(memory) > 0.3) {
            memory.lastAccess = Date.now();
            refreshed++;
          }
    
          activeMemories.push(memory);
        }
    
        // Record refresh
        const record: RefreshRecord = {
          step: this.stepCount,
          timestamp: Date.now(),
          type: "periodic",
          memoriesRefreshed: refreshed,
        };
        this.refreshHistory.push(record);
    
        // Keep only last 50 records
        if (this.refreshHistory.length > 50) {
          this.refreshHistory = this.refreshHistory.slice(-50);
        }
    
        logger.info(
          `[RefreshForget] Refresh #${this.stepCount}: ${refreshed} refreshed, ${forgotten} forgotten. Active: ${activeMemories.length}`
        );
    
        return { refreshed, forgotten, activeMemories };
      }
    
      /** Obtém força de uma memória (0-1) */
      getMemoryStrengthValue(memory: EpisodicMemory): number {
        return getMemoryStrength(memory);
      }
    
      /** Estatísticas */
      getStats(): {
        stepCount: number;
        lastRefreshStep: number;
        totalRefreshes: number;
        totalForgets: number;
      } {
        return {
          stepCount: this.stepCount,
          lastRefreshStep: this.lastRefreshStep,
          totalRefreshes: this.refreshHistory.length,
          totalForgets: 0, // tracked externally
        };
      }
    
      /** O histórico de refreshes */
      getRefreshHistory(): RefreshRecord[] {
        return [...this.refreshHistory];
      }
    }
    
    export function createRefreshForgetManager(): RefreshForgetManager {
      return new RefreshForgetManager();
    }
    