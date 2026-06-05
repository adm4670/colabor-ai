/**
     * telemetry-report.ts - Utilitario para visualizar relatorios de telemetria
     *
     * Uso: npx tsx core/telemetry/telemetry-report.ts [sessionId]
     * Se sessionId nao for fornecido, lista os ultimos relatorios.
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import type { TelemetryReport } from "./telemetry";
    
    function loadReports(): TelemetryReport[] {
      const logDir = path.join(process.cwd(), "telemetry");
      if (!fs.existsSync(logDir)) return [];
    
      const files = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse();
    
      return files
        .map((f) => {
          try {
            const raw = fs.readFileSync(path.join(logDir, f), "utf-8");
            return JSON.parse(raw) as TelemetryReport;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as TelemetryReport[];
    }
    
    function formatReport(report: TelemetryReport): string {
      const lines: string[] = [];
      const sep = "─".repeat(56);
    
      lines.push(sep);
      lines.push("  TELEMETRIA COLABOR-AI");
      lines.push(sep);
      lines.push(`  Sessao:       ${report.sessionId}`);
      lines.push(`  Data:         ${report.startedAt}`);
      lines.push(`  Duracao:      ${(report.totalDuration / 1000).toFixed(1)}s`);
      lines.push(`  Input:        "${report.userInput.slice(0, 100)}${report.userInput.length > 100 ? "..." : ""}"`);
      lines.push("");
      lines.push("  ── CONSUMO DE TOKENS (LLM) ──");
      lines.push(`  Chamadas LLM:           ${report.totalLLMCalls}`);
      lines.push(`  Tokens de prompt:       ${report.totalPromptTokens.toLocaleString()}`);
      lines.push(`  Tokens de completion:   ${report.totalCompletionTokens.toLocaleString()}`);
      lines.push(`  Total de tokens:        ${report.totalTokens.toLocaleString()}`);
      lines.push(`  Media tokens/chamada:   ${report.avgTokensPerLLMCall.toLocaleString()}`);
      lines.push(`  Custo estimado (USD):   $ ${report.estimatedCostUSD.toFixed(4)}`);
      lines.push("");
      lines.push("  ── CHAMADAS DE AGENTES ──");
      lines.push(`  Total de agentes chamados: ${report.totalAgentCalls}`);
      for (const [name, count] of Object.entries(report.agentCallBreakdown)) {
        const agentCalls = report.agentCalls.filter((a) => a.agentName === name);
        const totalTokens = agentCalls.reduce((s, a) => s + a.llmCallsCount, 0);
        const totalDuration = agentCalls.reduce((s, a) => s + a.duration, 0);
        lines.push(
          `    ${name.padEnd(15)} ${count}x chamadas, ${totalTokens} LLM calls, ${(totalDuration / 1000).toFixed(1)}s total`
        );
      }
      lines.push("");
      lines.push("  ── FERRAMENTAS (TOOLS) ──");
      lines.push(`  Total tool calls: ${report.totalToolCalls}`);
      for (const [name, count] of Object.entries(report.toolCallBreakdown)) {
        const toolCalls = report.toolCalls.filter((t) => t.toolName === name);
        const errors = toolCalls.filter((t) => t.hasError).length;
        lines.push(`    ${name.padEnd(20)} ${count}x chamadas, ${errors} erros`);
      }
      lines.push("");
      lines.push("  ── FLUXO DE EXECUCAO ──");
      lines.push(`  Passos (planner):       ${report.totalSteps}`);
      lines.push(`  Reflexoes:              ${report.totalReflections}`);
      lines.push(`  Duracoes por passo:`);
      for (let i = 0; i < report.plannerDecisions.length; i++) {
        const pd = report.plannerDecisions[i];
        const agentCall = report.agentCalls[i];
        const duration = agentCall ? agentCall.duration : 0;
        lines.push(
          `    Passo ${i + 1}: ${pd.chosenAgent} "${pd.instruction.slice(0, 60)}..." ${(duration / 1000).toFixed(1)}s`
        );
      }
      lines.push(sep);
      lines.push(`  Relatorio salvo em: telemetry/`);
      lines.push(sep);
    
      return lines.join("\n");
    }
    
    function main() {
      const args = process.argv.slice(2);
      const reports = loadReports();
    
      if (reports.length === 0) {
        console.log("Nenhum relatorio de telemetria encontrado.");
        console.log("Execute algumas conversas primeiro para gerar dados.");
        return;
      }
    
      if (args.length > 0) {
        // Filtrar por session ID
        const sessionId = args[0];
        const report = reports.find((r) => r.sessionId === sessionId);
        if (report) {
          console.log(formatReport(report));
        } else {
          console.log(`Sessao "${sessionId}" nao encontrada.`);
          console.log("Sessoes disponiveis:");
          reports.slice(0, 10).forEach((r) => {
            console.log(`  ${r.sessionId} - ${r.startedAt.slice(0, 19)} - "${r.userInput.slice(0, 50)}..."`);
          });
        }
      } else {
        // Listar ultimos relatorios
        console.log("ULTIMOS RELATORIOS DE TELEMETRIA");
        console.log("=".repeat(60));
        reports.slice(0, 5).forEach((r, i) => {
          console.log(`\n--- Relatorio #${i + 1} ---`);
          console.log(formatReport(r));
        });
    
        console.log(`\n${reports.length} relatorio(s) no total.`);
        console.log("Para ver um especifico: npx tsx core/telemetry/telemetry-report.ts <sessionId>");
      }
    }
    
    main();
    