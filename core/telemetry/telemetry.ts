/**
     * Telemetry System - Observabilidade para o colabor-ai
     *
     * Coleta metricas sobre:
     * - Tokens por chamada LLM (prompt/completion/total)
     * - Numero de chamadas de agentes por sessao
     * - Chamadas de ferramentas (tools)
     * - Planejamento (planner decisions)
     * - Reflexoes e seu resultado
     * - Duracoes de cada etapa
     *
     * Uso: singleton TelemetryCollector acessivel globalmente
     */
    
    import { logger } from "../utils/logger";
    import * as fs from "fs";
    import * as path from "path";
    
    // ============================================================
    // TIPOS
    // ============================================================
    
    export interface LLMCallRecord {
      /** Nome do agente que fez a chamada */
      agentName: string;
      /** Modelo utilizado */
      model: string;
      /** Timestamp de inicio */
      startTime: number;
      /** Duracao em ms */
      duration: number;
      /** Tokens do prompt */
      promptTokens: number;
      /** Tokens gerados */
      completionTokens: number;
      /** Total de tokens */
      totalTokens: number;
      /** Quantidade de mensagens no historico enviado */
      historyLength: number;
      /** Se a chamada teve tool calls */
      hadToolCalls: boolean;
      /** Numero de tool calls retornadas */
      toolCallCount: number;
      /** Indice sequencial dentro da execucao do agente */
      turnIndex: number;
    }
    
    export interface AgentCallRecord {
      /** Nome do agente chamado */
      agentName: string;
      /** Instrucao recebida (truncada) */
      instruction: string;
      /** Timestamp de inicio */
      startTime: number;
      /** Duracao em ms */
      duration: number;
      /** Resultado da reflexao (se houver) */
      reflectionResult?: "yes" | "partial" | "no";
      /** Se foi bem sucedido (baseado na reflexao) */
      success: boolean;
      /** Tamanho da resposta em caracteres */
      responseLength: number;
      /** Chamadas LLM feitas dentro deste agente */
      llmCallsCount: number;
    }
    
    export interface PlannerDecisionRecord {
      /** Instrucao gerada pelo planner */
      instruction: string;
      /** Agente escolhido */
      chosenAgent: string;
      /** Numero do passo */
      step: number;
      /** Timestamp */
      timestamp: number;
    }
    
    export interface ToolCallRecord {
      /** Nome da ferramenta */
      toolName: string;
      /** Nome do agente que chamou */
      agentName: string;
      /** Timestamp */
      timestamp: number;
      /** Se houve erro */
      hasError: boolean;
      /** Mensagem de erro (se houver) */
      errorMessage?: string;
      /** Duracao da execucao */
      duration: number;
    }
    
    export interface TelemetryReport {
      /** ID da sessao */
      sessionId: string;
      /** Input do usuario */
      userInput: string;
      /** Timestamp de inicio */
      startedAt: string;
      /** Timestamp de fim */
      finishedAt: string;
      /** Duracao total em ms */
      totalDuration: number;
    
      // === METRICAS AGREGADAS ===
    
      /** Total de chamadas LLM */
      totalLLMCalls: number;
      /** Total de tokens de prompt */
      totalPromptTokens: number;
      /** Total de tokens de completion */
      totalCompletionTokens: number;
      /** Total de tokens */
      totalTokens: number;
      /** Media de tokens por chamada LLM */
      avgTokensPerLLMCall: number;
      /** Custo estimado (USD) - default Deepseek: $0.27/M prompt, $1.10/M completion */
      estimatedCostUSD: number;
    
      /** Total de agentes chamados */
      totalAgentCalls: number;
      /** Agentes chamados (detalhado) */
      agentCallBreakdown: Record<string, number>;
      /** Media de chamadas de agente por requisicao */
      avgAgentCalls: number;
    
      /** Total de chamadas de ferramentas */
      totalToolCalls: number;
      /** Chamadas de ferramentas por tipo */
      toolCallBreakdown: Record<string, number>;
    
      /** Total de passos (planner decisions) */
      totalSteps: number;
      /** Total de reflexoes */
      totalReflections: number;
    
      /** Registros detalhados */
      llmCalls: LLMCallRecord[];
      agentCalls: AgentCallRecord[];
      plannerDecisions: PlannerDecisionRecord[];
      toolCalls: ToolCallRecord[];
    }
    
    // ============================================================
    // COLLECTOR
    // ============================================================
    
    const DEEPSEEK_PRICES = {
      prompt: 0.27,    // $0.27 por milhao de tokens de prompt
      completion: 1.10, // $1.10 por milhao de tokens de completion
    };
    
    class TelemetryCollector {
      private sessionId: string = "";
      private userInput: string = "";
      private startedAt: string = "";
    
      private llmCalls: LLMCallRecord[] = [];
      private agentCalls: AgentCallRecord[] = [];
      private plannerDecisions: PlannerDecisionRecord[] = [];
      private toolCalls: ToolCallRecord[] = [];
    
      // Contadores auxiliares
      private currentAgentLLMCalls: number = 0;
      private currentAgentName: string = "";
    
      // ============================================================
      // SESSION LIFECYCLE
      // ============================================================
    
      startSession(sessionId: string, userInput: string): void {
        this.sessionId = sessionId;
        this.userInput = userInput;
        this.startedAt = new Date().toISOString();
        this.llmCalls = [];
        this.agentCalls = [];
        this.plannerDecisions = [];
        this.toolCalls = [];
        this.currentAgentLLMCalls = 0;
        this.currentAgentName = "";
      }
    
      endSession(): TelemetryReport {
        return this.generateReport();
      }
    
      // ============================================================
      // LLM CALLS
      // ============================================================
    
      trackLLMCall(record: LLMCallRecord): void {
        this.llmCalls.push(record);
        this.currentAgentLLMCalls++;
      }
    
      // ============================================================
      // AGENT CALLS
      // ============================================================
    
      onAgentStart(agentName: string): void {
        this.currentAgentName = agentName;
        this.currentAgentLLMCalls = 0;
      }
    
      trackAgentCall(record: Omit<AgentCallRecord, "llmCallsCount">): void {
        this.agentCalls.push({
          ...record,
          llmCallsCount: this.currentAgentLLMCalls,
        });
        this.currentAgentLLMCalls = 0;
      }
    
      // ============================================================
      // PLANNER DECISIONS
      // ============================================================
    
      trackPlannerDecision(record: PlannerDecisionRecord): void {
        this.plannerDecisions.push(record);
      }
    
      // ============================================================
      // TOOL CALLS
      // ============================================================
    
      trackToolCall(record: ToolCallRecord): void {
        this.toolCalls.push(record);
      }
    
      // ============================================================
      // REPORT
      // ============================================================
    
      private generateReport(): TelemetryReport {
        const totalLLMCalls = this.llmCalls.length;
        const totalPromptTokens = this.llmCalls.reduce((s, c) => s + c.promptTokens, 0);
        const totalCompletionTokens = this.llmCalls.reduce((s, c) => s + c.completionTokens, 0);
        const totalTokens = totalPromptTokens + totalCompletionTokens;
    
        // Custo estimado
        const promptCost = (totalPromptTokens / 1_000_000) * DEEPSEEK_PRICES.prompt;
        const completionCost = (totalCompletionTokens / 1_000_000) * DEEPSEEK_PRICES.completion;
    
        // Breakdown de agentes
        const agentCallBreakdown: Record<string, number> = {};
        for (const ac of this.agentCalls) {
          agentCallBreakdown[ac.agentName] = (agentCallBreakdown[ac.agentName] || 0) + 1;
        }
    
        // Breakdown de tools
        const toolCallBreakdown: Record<string, number> = {};
        for (const tc of this.toolCalls) {
          toolCallBreakdown[tc.toolName] = (toolCallBreakdown[tc.toolName] || 0) + 1;
        }
    
        const totalReflections = this.agentCalls.filter((a) => a.reflectionResult).length;
    
        const finishedAt = new Date().toISOString();
        const startTime = new Date(this.startedAt).getTime();
        const totalDuration = Date.now() - startTime;
    
        return {
          sessionId: this.sessionId,
          userInput: this.userInput,
          startedAt: this.startedAt,
          finishedAt,
          totalDuration,
    
          totalLLMCalls,
          totalPromptTokens,
          totalCompletionTokens,
          totalTokens,
          avgTokensPerLLMCall: totalLLMCalls > 0 ? Math.round(totalTokens / totalLLMCalls) : 0,
          estimatedCostUSD: Math.round((promptCost + completionCost) * 10000) / 10000,
    
          totalAgentCalls: this.agentCalls.length,
          agentCallBreakdown,
          avgAgentCalls: this.agentCalls.length,
    
          totalToolCalls: this.toolCalls.length,
          toolCallBreakdown,
    
          totalSteps: this.plannerDecisions.length,
          totalReflections,
    
          llmCalls: this.llmCalls,
          agentCalls: this.agentCalls,
          plannerDecisions: this.plannerDecisions,
          toolCalls: this.toolCalls,
        };
      }
    
      /** Gera um resumo legivel para o usuario */
      formatReport(): string {
        const r = this.generateReport();
        const lines: string[] = [];
        const sep = "─".repeat(50);
    
        lines.push("");
        lines.push(sep);
        lines.push("  TELEMETRIA DA SESSAO");
        lines.push(sep);
        lines.push(`  Sessao:       ${r.sessionId}`);
        lines.push(`  Duracao:      ${(r.totalDuration / 1000).toFixed(1)}s`);
        lines.push(`  Input:        "${r.userInput.slice(0, 80)}${r.userInput.length > 80 ? "..." : ""}"`);
        lines.push("");
        lines.push("  ── LLM ──");
        lines.push(`  Chamadas LLM:        ${r.totalLLMCalls}`);
        lines.push(`  Tokens de prompt:    ${r.totalPromptTokens.toLocaleString()}`);
        lines.push(`  Tokens de completion:${r.totalCompletionTokens.toLocaleString()}`);
        lines.push(`  Total de tokens:     ${r.totalTokens.toLocaleString()}`);
        lines.push(`  Media tokens/chamada:${r.avgTokensPerLLMCall.toLocaleString()}`);
        lines.push(`  Custo estimado:      $${r.estimatedCostUSD.toFixed(4)}`);
        lines.push("");
        lines.push("  ── AGENTES ──");
        lines.push(`  Total acionados:     ${r.totalAgentCalls}`);
        for (const [name, count] of Object.entries(r.agentCallBreakdown)) {
          lines.push(`    ${name}: ${count}x`);
        }
        lines.push("");
        lines.push("  ── FERRAMENTAS ──");
        lines.push(`  Total tool calls:    ${r.totalToolCalls}`);
        for (const [name, count] of Object.entries(r.toolCallBreakdown)) {
          lines.push(`    ${name}: ${count}x`);
        }
        lines.push("");
        lines.push("  ── PASSOS ──");
        lines.push(`  Passos (planner):    ${r.totalSteps}`);
        lines.push(`  Reflexoes:           ${r.totalReflections}`);
        lines.push(sep);
        lines.push("");
    
        return lines.join("\n");
      }
    
      /** Retorna o relatorio como objeto */
      getReport(): TelemetryReport {
        return this.generateReport();
      }
    
      /** Salva o relatorio em arquivo na pasta telemetry/ */
      saveToFile(): string {
        try {
          const report = this.generateReport();
          const logDir = path.join(process.cwd(), "telemetry");
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `session-${report.sessionId.slice(0, 8)}-${dateStr}.json`;
          const filepath = path.join(logDir, filename);
    
          fs.writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
          logger.info(`[Telemetry] Relatorio salvo: ${filepath}`);
          return filepath;
        } catch (e: any) {
          logger.error(`[Telemetry] Erro ao salvar relatorio: ${e.message}`);
          return "";
        }
      }
    }
    
    // Singleton
    let _instance: TelemetryCollector | null = null;
    
    export function getTelemetry(): TelemetryCollector {
      if (!_instance) {
        _instance = new TelemetryCollector();
      }
      return _instance;
    }
    
    export function resetTelemetry(): void {
      _instance = null;
    }
    